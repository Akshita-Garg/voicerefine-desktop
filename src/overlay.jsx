import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, LoaderCircle, Mic, Square } from 'lucide-react'
import { transcribe } from './services/asr'
import { refine } from './services/llm'
import { composeShortcutPrompt } from './utils/composePrompt'
import { calculateShortcutMaxTokens } from './utils/refinementBudget'
import './index.css'

const HOTKEY_LABEL = window.navigator.platform.toLowerCase().includes('mac')
  ? 'Cmd+Shift+Space'
  : 'Ctrl+Shift+Space'

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

const VALID_INTENTS = new Set(['clean', 'compose', 'prepare'])
const VALID_MODES = new Set(['light', 'bullets', 'document'])

async function readOverlayRefinementSettings() {
  const settings = await window.voicerefine?.getRefinementSettings?.()
  const storedIntent = settings?.intent ?? localStorage.getItem('vr_intent')
  const storedMode = settings?.mode ?? localStorage.getItem('vr_mode')
  return {
    provider: settings?.provider ?? 'builtin',
    apiKey: settings?.apiKey ?? '',
    intent: VALID_INTENTS.has(storedIntent) ? storedIntent : 'clean',
    mode: VALID_MODES.has(storedMode) ? storedMode : 'light',
  }
}

function readFallbackIntent() {
  const stored = localStorage.getItem('vr_intent')
  return VALID_INTENTS.has(stored) ? stored : 'clean'
}

function readFallbackMode() {
  const stored = localStorage.getItem('vr_mode')
  return VALID_MODES.has(stored) ? stored : 'light'
}

async function refineForPaste(transcript) {
  const settings = await readOverlayRefinementSettings()
  const { intent, mode } = settings
  const { system, user } = composeShortcutPrompt({ intent, mode, transcript })
  const maxTokens = calculateShortcutMaxTokens(transcript, { intent })
  const output = await refine({ system, user, mode, providerConfig: settings, maxTokens })
  return {
    intent,
    mode,
    text: output?.trim() ? output : transcript,
    refined: !!output?.trim(),
  }
}

function Overlay() {
  const [status, setStatus] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(null)
  const timerRef = useRef(null)

  const cleanupRecorder = () => {
    clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }

  const startRecording = async () => {
    if (recorderRef.current?.state === 'recording') return

    setStatus('starting')
    setElapsed(0)
    setTranscript('')
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {}
      const recorder = new MediaRecorder(stream, options)
      recorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0
        cleanupRecorder()
        setStatus('transcribing')
        setElapsed(0)
        window.voicerefine.overlayRecordingStopped({
          bytes: blob.size,
          mimeType: blob.type,
          durationMs,
        })

        try {
          const startedAt = Date.now()
          const text = await transcribe(blob)
          let output = text
          let refinement = { refined: false, intent: readFallbackIntent(), mode: readFallbackMode() }

          try {
            setStatus('refining')
            refinement = await refineForPaste(text)
            output = refinement.text
          } catch (err) {
            console.warn('[overlay] refinement failed, pasting transcript', err)
          }

          setTranscript(output)
          setStatus('complete')
          window.voicerefine.overlayTranscriptionComplete({
            text: output,
            rawText: text,
            chars: output.length,
            rawChars: text.length,
            refined: refinement.refined,
            intent: refinement.intent,
            mode: refinement.mode,
            durationMs: Date.now() - startedAt,
          })
        } catch (err) {
          setStatus('error')
          window.voicerefine.overlayRecordingFailed(err?.message ?? 'Transcription failed')
        }
      }

      startedAtRef.current = Date.now()
      recorder.start()
      setStatus('recording')
      window.voicerefine.overlayRecordingStarted()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 250)
    } catch (err) {
      cleanupRecorder()
      setStatus('error')
      window.voicerefine.overlayRecordingFailed(err?.message ?? 'Microphone unavailable')
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      setStatus('stopping')
      recorderRef.current.stop()
    }
  }

  const cancelRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    cleanupRecorder()
    setStatus('idle')
    setElapsed(0)
    setTranscript('')
  }

  useEffect(() => {
    const unsubscribe = window.voicerefine.onOverlayCommand(command => {
      if (command === 'start-recording') void startRecording()
      if (command === 'stop-recording') stopRecording()
      if (command === 'cancel-recording') cancelRecording()
      if (command === 'paste-failed') setStatus('paste-error')
    })

    window.voicerefine.overlayReady()
    return () => {
      unsubscribe()
      cancelRecording()
    }
  }, [])

  const isRecording = status === 'recording'
  const isBusy = status === 'starting' || status === 'stopping' || status === 'transcribing' || status === 'refining'
  const isComplete = status === 'complete'
  const title =
    status === 'error' ? 'Something went wrong'
      : status === 'paste-error' ? 'Paste failed'
      : status === 'transcribing' ? 'Transcribing...'
        : status === 'refining' ? 'Refining...'
        : isBusy ? 'Preparing...'
          : isComplete ? 'Inserted'
            : 'Recording...'
  const subtitle =
    status === 'transcribing' ? 'Converting your recording locally'
      : status === 'refining' ? 'Polishing with your selected mode'
      : status === 'paste-error' ? 'Transcript copied. Paste manually with Ctrl+V.'
      : isComplete ? (transcript || 'No speech detected')
        : `Press ${HOTKEY_LABEL} again or Esc`

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center text-[#F7F1EA]">
      <div
        className="w-[316px] rounded-2xl border border-white/15 px-4 py-3"
        style={{
          background: 'rgba(40, 35, 32, 0.9)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.28)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className={`relative flex h-10 w-10 items-center justify-center rounded-full ${status === 'error' ? 'bg-red-700' : 'bg-[#D15F54]'}`}>
            {isRecording && <span className="absolute inset-0 rounded-full bg-[#D15F54] opacity-35 animate-ping" />}
            {isBusy
              ? <LoaderCircle size={18} strokeWidth={1.8} className="relative animate-spin" />
              : isComplete
                ? <Check size={18} strokeWidth={2} className="relative" />
                : isRecording
                  ? <Square size={16} strokeWidth={1.8} fill="currentColor" className="relative" />
                  : <Mic size={18} strokeWidth={1.8} className="relative" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">{title}</div>
            <div className="mt-0.5 max-w-[190px] truncate text-xs text-[#D8CEC6]">{subtitle}</div>
          </div>
          <div className="ml-auto text-sm tabular-nums text-[#D8CEC6]">{isRecording ? formatTime(elapsed) : ''}</div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
)
