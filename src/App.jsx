import { useState, useEffect, useCallback, useRef } from 'react'
import { Wand2, List, FileText, Eraser, Mail, Mic2, Copy, Check } from 'lucide-react'
import { RecordButton } from './components/RecordButton'
import { SettingsPanel } from './components/SettingsPanel'
import { Onboarding } from './components/Onboarding'
import { Tooltip } from './components/Tooltip'
import { currentNativeAsrModel, preloadNativeAsrModel, transcribe } from './services/asr'
import { composePrompt } from './utils/composePrompt'
import { refine, warmBuiltinRefinement } from './services/llm'

const MODES = [
  { value: 'light',    Icon: Wand2,    label: 'Light',    description: 'Clean prose. Preserves the flow of what you said.' },
  { value: 'bullets',  Icon: List,     label: 'Bullets',  description: 'Key ideas as a bulleted list.' },
  { value: 'document', Icon: FileText, label: 'Document', description: 'Restructured into sections with brief headers.' },
]

const INTENT_LABELS = {
  clean:   { Icon: Eraser, label: 'Clean',   description: "Minimal edit. Fix speech artifacts while preserving your vocabulary, phrasing, order, and tone." },
  compose: { Icon: Mail,   label: 'Compose', description: "Ready-to-send writing. Smooth wording and structure while keeping your meaning and tone." },
  prepare: { Icon: Mic2,   label: 'Prepare', description: "Spoken delivery. Improve cadence, confidence, and flow for something you'll say aloud." },
}

function readIntent() {
  const stored = localStorage.getItem('vr_intent')
  return stored && stored in INTENT_LABELS ? stored : 'clean'
}

function readProvider() {
  const stored = localStorage.getItem('vr_provider') ?? 'builtin'
  return stored === 'browser' || stored === 'ollama' ? 'builtin' : stored
}

function readMode() {
  const stored = localStorage.getItem('vr_mode')
  return MODES.some(mode => mode.value === stored) ? stored : 'light'
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
    intent: readIntent(),
    mode: readMode(),
  })
}

function warmSelectedRefinementProvider() {
  if (readProvider() !== 'builtin') return
  warmBuiltinRefinement().catch(err => {
    console.warn('[refine] warmup failed', err)
  })
}

function App() {
  const [onboardingDone, setOnboardingDone] = useState(readOnboardingDone)
  const [rawTranscript, setRawTranscript]     = useState('')
  const [isTranscribing, setIsTranscribing]   = useState(false)
  const [transcribeError, setTranscribeError] = useState(false)

  const [mode, setMode]               = useState(readMode)
  const [refinedOutput, setRefinedOutput] = useState('')
  const [isRefining, setIsRefining]   = useState(false)
  const [isLoadingRefinementModel, setIsLoadingRefinementModel] = useState(false)
  const [refineError, setRefineError] = useState(null)

  const [isRecording, setIsRecording] = useState(false)

  const [rawCopied, setRawCopied]         = useState(false)
  const [refinedCopied, setRefinedCopied] = useState(false)

  const [provider, setProvider]       = useState(readProvider)
  const [tipDismissed, setTipDismissed] = useState(false)

  const transcribeModelReady = true

  useEffect(() => {
    let cancelled = false
    preloadNativeAsrModel(currentNativeAsrModel()).catch(err => {
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
      // clipboard unavailable — checkmark intentionally does not flash
    }
  }

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [intent, setIntent]             = useState(readIntent)
  const [intentOpen, setIntentOpen]     = useState(false)
  const intentRef                       = useRef(null)

  const handleAudioReady = useCallback(async (blob) => {
    setTranscribeError(false)
    setIsTranscribing(true)
    const startedAt = performance.now()
    try {
      console.log('[pipeline] main transcription started', {
        bytes: blob.size,
        mimeType: blob.type,
      })
      const text = await transcribe(blob)
      setRawTranscript(prev => prev ? prev + '\n\n' + text : text)
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
  }, [])

  const handleRefine = useCallback(async () => {
    if (!rawTranscript.trim()) return
    setRefineError(null)
    setIsRefining(true)
    setIsLoadingRefinementModel(false)
    const startedAt = performance.now()
    const loadingTimer = setTimeout(() => {
      setIsLoadingRefinementModel(true)
    }, 2000)
    try {
      const currentIntent = localStorage.getItem('vr_intent') ?? 'clean'
      const { system, user } = composePrompt({ intent: currentIntent, mode, transcript: rawTranscript })
      const output = await refine({ system, user, mode })
      setRefinedOutput(output)
      console.log('[pipeline] main refinement complete', {
        intent: currentIntent,
        mode,
        totalMs: Math.round(performance.now() - startedAt),
        inputChars: rawTranscript.length,
        outputChars: output.length,
      })
    } catch (err) {
      console.error('[App] Refinement failed:', err)
      setRefineError(err.message)
    } finally {
      clearTimeout(loadingTimer)
      setIsRefining(false)
      setIsLoadingRefinementModel(false)
    }
  }, [rawTranscript, mode])

  const handleSettingsSaved = () => {
    setIntent(readIntent())
    setProvider(readProvider())
    void syncRefinementSettings()
    warmSelectedRefinementProvider()
  }

  const handleIntentChange = (val) => {
    localStorage.setItem('vr_intent', val)
    setIntent(val)
    void syncRefinementSettings()
  }

  const handleModeChange = (val) => {
    localStorage.setItem('vr_mode', val)
    setMode(val)
    void syncRefinementSettings()
  }

  const currentMode = MODES.find(m => m.value === mode)
  const CurrentModeIcon = currentMode?.Icon
  const refinementEnabled = provider !== 'none'

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
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A766E" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" className="hover:stroke-[#5C4B44] transition-colors">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <main className="flex flex-col items-center gap-8 py-12 px-6">

        {/* Tip banner */}
        {!tipDismissed && (
          <div
            className="w-full max-w-5xl rounded-2xl border border-[#7FAF8F]/25 px-5 py-3"
            style={{ background: 'rgba(127,175,143,0.07)', boxShadow: '0 1px 3px rgba(58,47,42,0.05)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-[#4A7A5E]">Tip: You can change your transcription model or refinement provider any time in Settings.</span>
              <button
                onClick={() => setTipDismissed(true)}
                className="text-xs text-[#8A766E] hover:text-[#3A2F2A] transition-colors leading-none flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Mic + Refine */}
        <div className="flex flex-col items-center gap-3">
          <RecordButton onAudioReady={handleAudioReady} isProcessing={isTranscribing} onRecordingChange={setIsRecording} disabled={!transcribeModelReady} />
          {transcribeError && (
            <p className="text-sm text-red-700">
              Transcription failed. Check the app console for details.
            </p>
          )}
          {refinementEnabled ? (
            <button
              onClick={handleRefine}
              disabled={!rawTranscript.trim() || isRefining || isRecording || isTranscribing}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-medium transition-colors duration-150
                bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5]
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {CurrentModeIcon && <CurrentModeIcon size={14} strokeWidth={1.75} color="#F4F7F5" />}
              {isLoadingRefinementModel ? 'Loading refinement model...' : isRefining ? 'Refining...' : `Refine as ${currentMode?.label}`}
            </button>
          ) : (
            <p className="text-sm text-[#8A766E] text-center">
              Refinement disabled.{' '}
              <button
                onClick={() => setSettingsOpen(true)}
                className="underline hover:text-[#3A2F2A] transition-colors"
              >
                Switch to a provider in Settings
              </button>{' '}
              to enable refinement.
            </p>
          )}
        </div>

        {/* Intent | Cards | Mode */}
        <div className="flex gap-5 w-full max-w-5xl items-start">

          {/* Intent */}
          <div ref={intentRef} className="w-44 flex-shrink-0 pt-1">
            <p className="text-xs font-semibold text-[#6B5B52] uppercase tracking-[0.08em] mb-2">Intent</p>
            <div className="relative">
              <button
                onClick={() => setIntentOpen(o => !o)}
                className="flex items-center gap-1.5 text-[#3A2F2A] text-sm hover:text-[#6B5B52] transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="#8A766E" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity="0.9"
                  className={`flex-shrink-0 transition-transform duration-150 ${intentOpen ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {(() => {
                  const { Icon: IntentIcon, label } = INTENT_LABELS[intent]
                  return (
                    <span className="flex items-center gap-1.5 truncate font-medium text-[#3A2F2A]">
                      <IntentIcon size={13} strokeWidth={1.75} color="#6FA287" />
                      {label}
                    </span>
                  )
                })()}
              </button>

              {intentOpen && (
                <div className="absolute top-full mt-1 left-0 z-20 bg-[#EDE6DA] border border-[rgba(58,47,42,0.08)] rounded-xl shadow-[0_4px_16px_rgba(58,47,42,0.1)] w-80 py-1 overflow-hidden">
                  {Object.entries(INTENT_LABELS).map(([val, { Icon: ItemIcon, label, description }]) => (
                    <button
                      key={val}
                      onClick={() => { handleIntentChange(val); setIntentOpen(false) }}
                      className={`w-full text-left px-3 py-2.5 flex flex-col gap-0.5 transition-colors
                        border-l-2 ${intent === val
                          ? 'border-[#7FAF8F] bg-[rgba(127,175,143,0.08)] text-[#3A2F2A]'
                          : 'border-transparent text-[#6B5B52] hover:bg-[rgba(58,47,42,0.04)] hover:text-[#3A2F2A]'}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <ItemIcon
                          size={14}
                          strokeWidth={1.75}
                          color={intent === val ? '#6FA287' : '#5C4B44'}
                        />
                        {label}
                      </span>
                      <span className="text-xs text-[#8A766E] leading-snug pl-[22px]">{description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cards */}
          <div className="flex-1 grid grid-cols-2 gap-6 min-w-0">
            <div
              className="rounded-xl p-5"
              style={{ background: 'rgba(213, 120, 105, 0.12)', border: '1px solid rgba(213, 120, 105, 0.4)', boxShadow: '0 1px 3px rgba(58,47,42,0.06)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-[#6B5B52] uppercase tracking-[0.08em]">
                  Raw Transcript
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
                placeholder="Record something. VoiceRefine will transcribe it here. You can edit the text before refining."
              />
            </div>

            <div
              className={`rounded-xl p-5 transition-opacity duration-200 ${!refinementEnabled ? 'opacity-40 pointer-events-none select-none' : ''}`}
              style={{ background: 'rgba(213, 120, 105, 0.12)', border: '1px solid rgba(213, 120, 105, 0.4)', boxShadow: '0 1px 3px rgba(58,47,42,0.06)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-[#6B5B52] uppercase tracking-[0.08em]">
                  Refined Output
                </h2>
                {refinedOutput && refinementEnabled && (
                  <button
                    onClick={() => copyText(refinedOutput, setRefinedCopied)}
                    className="text-[#8A766E] hover:text-[#3A2F2A] transition-colors"
                    title="Copy"
                  >
                    {refinedCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </div>
              <div className="h-52 overflow-y-auto">
                {!refinementEnabled ? (
                  <p className="text-[#6B5B52] text-sm">No refinement provider selected.</p>
                ) : refineError ? (
                  <p className="text-red-700 text-sm">{refineError}</p>
                ) : refinedOutput ? (
                  <p className="text-[#3A2F2A] text-sm whitespace-pre-wrap">{refinedOutput}</p>
                ) : (
                  <p className="text-[#6B5B52] text-sm">
                    {isLoadingRefinementModel ? 'Loading refinement model...' : isRefining ? 'Refining...' : 'Refined text will appear here.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Mode — hidden when refinement is disabled */}
          {refinementEnabled && (
            <div className="w-36 flex-shrink-0 pt-1">
              <p className="text-xs font-semibold text-[#6B5B52] uppercase tracking-[0.08em] mb-2">Mode</p>
              <div className="flex flex-col gap-2">
                {MODES.map(({ value, Icon: ModeIcon, label, description }) => {
                  const active = mode === value
                  return (
                    <Tooltip key={value} text={description} align="right">
                      <button
                        onClick={() => handleModeChange(value)}
                        className={`w-full px-3 py-2 rounded-[10px] text-sm text-left flex items-center gap-2 transition-colors duration-150 ${
                          active
                            ? 'bg-[rgba(127,175,143,0.12)] border border-[#7FAF8F]/40 text-[#3A2F2A] font-medium'
                            : 'bg-transparent border border-[rgba(58,47,42,0.08)] text-[#6B5B52] font-medium hover:bg-[rgba(58,47,42,0.05)] hover:text-[#3A2F2A]'
                        }`}
                      >
                        <ModeIcon
                          size={14}
                          strokeWidth={1.75}
                          color={active ? '#6FA287' : '#5C4B44'}
                        />
                        {label}
                      </button>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={handleSettingsSaved}
      />

      {!onboardingDone && (
        <Onboarding onComplete={() => { setOnboardingDone(true); setIntent(readIntent()); setProvider(readProvider()); void syncRefinementSettings() }} />
      )}
    </div>
  )
}

export default App
