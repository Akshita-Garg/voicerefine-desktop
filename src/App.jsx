import { useState, useEffect, useRef } from 'react'
import { Eraser, Sparkles, Copy, Check, Settings2 } from 'lucide-react'
import { RecordButton } from './components/RecordButton'
import { SettingsPanel } from './components/SettingsPanel'
import { Onboarding } from './components/Onboarding'
import { Tooltip } from './components/Tooltip'
import { currentNativeAsrModel, preloadNativeAsrModel, syncSelectedNativeAsrModel, transcribe } from './services/asr'
import { composeTransformPrompt, DEFAULT_TRANSFORM_PRESET, TRANSFORM_PRESETS, defaultPromptForPreset, normalizeTransformPreset } from './utils/composePrompt'
import { cleanTranscriptText, refine, warmBuiltinRefinement } from './services/llm'
import {
  REFINEMENT_MODE_CLEAN,
  REFINEMENT_MODE_TRANSFORM,
  normalizeRefinementMode,
  readRefinementMode,
  readTransformPreset,
  readTransformPrompt,
} from './utils/refinementSettings'

const REFINEMENT_MODES = [
  {
    value: REFINEMENT_MODE_CLEAN,
    Icon: Eraser,
    label: 'Clean',
    description: 'Fast cleanup with no LLM. Keeps your wording and removes speech artifacts.',
  },
  {
    value: REFINEMENT_MODE_TRANSFORM,
    Icon: Sparkles,
    label: 'Transform',
    description: 'Use a prompt to reshape the transcript into another form.',
  },
]

function readProvider() {
  const stored = localStorage.getItem('vr_provider') ?? 'builtin'
  return stored === 'browser' || stored === 'ollama' ? 'builtin' : stored
}

function readApiKey() {
  return localStorage.getItem('vr_api_key') ?? ''
}

function readOnboardingDone() {
  return !!localStorage.getItem('vr_onboarding_done')
}

function syncRefinementSettings() {
  return window.voicerefine?.setRefinementSettings?.({
    provider: readProvider(),
    apiKey: readApiKey(),
    refinementMode: readRefinementMode(),
    transformPreset: readTransformPreset(),
    transformPrompt: readTransformPrompt(),
  })
}

function warmSelectedRefinementProvider() {
  if (readProvider() !== 'builtin') return
  warmBuiltinRefinement().catch(err => {
    console.warn('[refine] warmup failed', err)
  })
}

function presetLabel(preset) {
  return TRANSFORM_PRESETS[normalizeTransformPreset(preset)]?.label ?? TRANSFORM_PRESETS[DEFAULT_TRANSFORM_PRESET].label
}

function App() {
  const [onboardingDone, setOnboardingDone] = useState(readOnboardingDone)
  const [rawTranscript, setRawTranscript] = useState('')
  const [outputText, setOutputText] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingRefinementModel, setIsLoadingRefinementModel] = useState(false)
  const [transcribeError, setTranscribeError] = useState(false)
  const [processError, setProcessError] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [rawCopied, setRawCopied] = useState(false)
  const [outputCopied, setOutputCopied] = useState(false)
  const [provider, setProvider] = useState(readProvider)
  const [tipDismissed, setTipDismissed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refinementMode, setRefinementMode] = useState(readRefinementMode)
  const [transformPreset, setTransformPreset] = useState(readTransformPreset)
  const [transformPrompt, setTransformPrompt] = useState(readTransformPrompt)

  useEffect(() => {
    let cancelled = false
    const model = currentNativeAsrModel()
    syncSelectedNativeAsrModel(model)
      .then(() => preloadNativeAsrModel(model))
      .catch(err => {
        if (!cancelled) console.warn('[asr] default model preload failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void syncRefinementSettings()
    const warmupTimer = setTimeout(warmSelectedRefinementProvider, 1500)
    return () => clearTimeout(warmupTimer)
  }, [])

  const copyText = async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  const saveRefinementState = ({ nextMode = refinementMode, nextPreset = transformPreset, nextPrompt = transformPrompt } = {}) => {
    localStorage.setItem('vr_refinement_mode', nextMode)
    localStorage.setItem('vr_transform_preset', nextPreset)
    localStorage.setItem('vr_transform_prompt', nextPrompt)
    setRefinementMode(nextMode)
    setTransformPreset(nextPreset)
    setTransformPrompt(nextPrompt)
    void syncRefinementSettings()
  }

  const handleAudioReady = async (blob) => {
    setTranscribeError(false)
    setIsTranscribing(true)
    const startedAt = performance.now()
    try {
      const text = await transcribe(blob)
      setRawTranscript(prev => prev ? `${prev}\n\n${text}` : text)
      console.log('[pipeline] main transcription complete', {
        totalMs: Math.round(performance.now() - startedAt),
        chars: text.length,
      })
    } catch (err) {
      console.error('[App] Transcription failed:', err)
      setTranscribeError(true)
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleProcess = async () => {
    const transcript = rawTranscript.trim()
    if (!transcript) return

    setProcessError(null)
    setIsProcessing(true)
    setIsLoadingRefinementModel(false)
    const loadingTimer = setTimeout(() => {
      if (refinementMode === REFINEMENT_MODE_TRANSFORM) setIsLoadingRefinementModel(true)
    }, 2000)

    try {
      let nextOutput

      if (refinementMode === REFINEMENT_MODE_CLEAN) {
        nextOutput = cleanTranscriptText(transcript)
      } else {
        const { system, user } = composeTransformPrompt({
          prompt: transformPrompt,
          transcript,
        })
        nextOutput = await refine({
          system,
          user,
          preset: transformPreset,
        })
      }

      setOutputText(nextOutput)
    } catch (err) {
      console.error('[App] Processing failed:', err)
      setProcessError(err.message)
    } finally {
      clearTimeout(loadingTimer)
      setIsProcessing(false)
      setIsLoadingRefinementModel(false)
    }
  }

  const handleSettingsSaved = () => {
    setProvider(readProvider())
    void syncRefinementSettings()
    warmSelectedRefinementProvider()
  }

  const handleRefinementModeChange = (value) => {
    saveRefinementState({ nextMode: normalizeRefinementMode(value) })
  }

  const handlePresetChange = (preset) => {
    const nextPreset = normalizeTransformPreset(preset)
    saveRefinementState({
      nextPreset,
      nextPrompt: defaultPromptForPreset(nextPreset),
    })
  }

  const handlePromptChange = (value) => {
    localStorage.setItem('vr_transform_prompt', value)
    setTransformPrompt(value)
    void syncRefinementSettings()
  }

  const processingLabel = refinementMode === REFINEMENT_MODE_CLEAN
    ? (isProcessing ? 'Cleaning...' : 'Clean Transcript')
    : (isLoadingRefinementModel ? 'Loading transform model...' : isProcessing ? 'Transforming...' : `Transform as ${presetLabel(transformPreset)}`)

  const transformEnabled = provider !== 'none'

  return (
    <div
      className="min-h-screen text-[#3A2F2A]"
      style={{ background: 'linear-gradient(180deg, #EDE6DA 0%, #E5DDD0 100%)' }}
    >
      <header className="flex items-center justify-between px-6 py-4 border-b border-[rgba(58,47,42,0.08)]">
        <h1 className="text-xl font-semibold tracking-tight text-[#C96F3B]">
          VoiceRefine
        </h1>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="p-2 rounded-md hover:bg-[rgba(58,47,42,0.06)] transition-colors"
        >
          <Settings2 size={18} strokeWidth={1.75} color="#8A766E" />
        </button>
      </header>

      <main className="flex flex-col items-center gap-8 py-12 px-6">
        {!tipDismissed && (
          <div
            className="w-full max-w-5xl rounded-2xl border border-[#7FAF8F]/25 px-5 py-3"
            style={{ background: 'rgba(127,175,143,0.07)', boxShadow: '0 1px 3px rgba(58,47,42,0.05)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-[#4A7A5E]">Tip: Clean is the fast local path. Transform uses a prompt and can use a model provider.</span>
              <button
                onClick={() => setTipDismissed(true)}
                className="text-xs text-[#8A766E] hover:text-[#3A2F2A] transition-colors leading-none flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <RecordButton onAudioReady={handleAudioReady} isProcessing={isTranscribing} onRecordingChange={setIsRecording} />
          {transcribeError && (
            <p className="text-sm text-red-700">
              Transcription failed. Check the app console for details.
            </p>
          )}
          <button
            onClick={handleProcess}
            disabled={!rawTranscript.trim() || isProcessing || isRecording || isTranscribing || (refinementMode === REFINEMENT_MODE_TRANSFORM && !transformEnabled)}
            className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-medium transition-colors duration-150
              bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5]
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {refinementMode === REFINEMENT_MODE_CLEAN
              ? <Eraser size={14} strokeWidth={1.75} color="#F4F7F5" />
              : <Sparkles size={14} strokeWidth={1.75} color="#F4F7F5" />}
            {processingLabel}
          </button>
          {refinementMode === REFINEMENT_MODE_TRANSFORM && !transformEnabled && (
            <p className="text-sm text-[#8A766E] text-center">
              Transform is disabled.{' '}
              <button
                onClick={() => setSettingsOpen(true)}
                className="underline hover:text-[#3A2F2A] transition-colors"
              >
                Choose a provider in Settings
              </button>
              .
            </p>
          )}
        </div>

        <div className="w-full max-w-5xl flex flex-col gap-5">
          <div className="rounded-xl p-5"
            style={{ background: 'rgba(213, 120, 105, 0.08)', border: '1px solid rgba(213, 120, 105, 0.25)', boxShadow: '0 1px 3px rgba(58,47,42,0.05)' }}
          >
            <p className="text-xs font-semibold text-[#6B5B52] uppercase tracking-[0.08em] mb-3">Output</p>
            <div className="flex flex-col gap-3">
              {REFINEMENT_MODES.map(({ value, Icon, label, description }) => {
                const active = refinementMode === value
                return (
                  <div key={value} className="flex flex-col gap-2">
                    <Tooltip text={description} align="left">
                      <button
                        onClick={() => handleRefinementModeChange(value)}
                        className={`w-full px-4 py-3 rounded-[12px] text-sm text-left flex items-start gap-3 transition-colors duration-150 ${
                          active
                            ? 'bg-[rgba(127,175,143,0.12)] border border-[#7FAF8F]/40 text-[#3A2F2A]'
                            : 'bg-transparent border border-[rgba(58,47,42,0.08)] text-[#6B5B52] hover:bg-[rgba(58,47,42,0.05)] hover:text-[#3A2F2A]'
                        }`}
                      >
                        <Icon size={16} strokeWidth={1.75} color={active ? '#6FA287' : '#5C4B44'} className="mt-0.5 flex-shrink-0" />
                        <span className="flex flex-col gap-0.5">
                          <span className="font-medium">{label}</span>
                          <span className="text-xs text-[#8A766E] leading-snug">{description}</span>
                        </span>
                      </button>
                    </Tooltip>

                    {value === REFINEMENT_MODE_TRANSFORM && active && (
                      <div className="pl-5 flex flex-col gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {Object.entries(TRANSFORM_PRESETS).map(([presetValue, preset]) => {
                            const presetActive = transformPreset === presetValue
                            return (
                              <Tooltip key={presetValue} text={preset.description} align="left">
                                <button
                                  onClick={() => handlePresetChange(presetValue)}
                                  className={`w-full px-3 py-2 rounded-[10px] text-sm text-left transition-colors duration-150 ${
                                    presetActive
                                      ? 'bg-[rgba(127,175,143,0.12)] border border-[#7FAF8F]/40 text-[#3A2F2A] font-medium'
                                      : 'bg-transparent border border-[rgba(58,47,42,0.08)] text-[#6B5B52] font-medium hover:bg-[rgba(58,47,42,0.05)] hover:text-[#3A2F2A]'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              </Tooltip>
                            )
                          })}
                        </div>
                        <textarea
                          value={transformPrompt}
                          onChange={e => handlePromptChange(e.target.value)}
                          className="w-full h-36 rounded-xl border border-[rgba(58,47,42,0.08)] bg-[rgba(255,255,255,0.28)] px-3 py-3 text-sm text-[#3A2F2A] resize-none outline-none focus:border-[#7FAF8F]/50"
                          placeholder="Edit the transform prompt here."
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-w-0">
            <div
              className="rounded-xl p-5"
              style={{ background: 'rgba(213, 120, 105, 0.12)', border: '1px solid rgba(213, 120, 105, 0.4)', boxShadow: '0 1px 3px rgba(58,47,42,0.06)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-[#6B5B52] uppercase tracking-[0.08em]">
                  Transcript
                </h2>
                {rawTranscript && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyText(rawTranscript, setRawCopied)}
                      className="text-[#8A766E] hover:text-[#3A2F2A] transition-colors"
                      title="Copy"
                    >
                      {rawCopied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <button
                      onClick={() => setRawTranscript('')}
                      className="text-xs text-[#8A766E] hover:text-red-600 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <textarea
                value={rawTranscript}
                onChange={e => setRawTranscript(e.target.value)}
                className="w-full h-52 bg-transparent text-[#3A2F2A] text-sm resize-none outline-none placeholder-[#6B5B52]"
                placeholder="Record something. VoiceRefine will transcribe it here."
              />
            </div>

            <div
              className="rounded-xl p-5"
              style={{ background: 'rgba(213, 120, 105, 0.12)', border: '1px solid rgba(213, 120, 105, 0.4)', boxShadow: '0 1px 3px rgba(58,47,42,0.06)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-[#6B5B52] uppercase tracking-[0.08em]">
                  Output
                </h2>
                {outputText && (
                  <button
                    onClick={() => copyText(outputText, setOutputCopied)}
                    className="text-[#8A766E] hover:text-[#3A2F2A] transition-colors"
                    title="Copy"
                  >
                    {outputCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </div>
              <div className="h-52 overflow-y-auto">
                {processError ? (
                  <p className="text-red-700 text-sm">{processError}</p>
                ) : outputText ? (
                  <p className="text-[#3A2F2A] text-sm whitespace-pre-wrap">{outputText}</p>
                ) : (
                  <p className="text-[#6B5B52] text-sm">
                    {isLoadingRefinementModel ? 'Loading transform model...' : isProcessing ? 'Processing...' : 'Your cleaned or transformed text will appear here.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={handleSettingsSaved}
      />

      {!onboardingDone && (
        <Onboarding
          onComplete={() => {
            setOnboardingDone(true)
            setProvider(readProvider())
            setRefinementMode(readRefinementMode())
            setTransformPreset(readTransformPreset())
            setTransformPrompt(readTransformPrompt())
            void syncRefinementSettings()
          }}
        />
      )}
    </div>
  )
}

export default App
