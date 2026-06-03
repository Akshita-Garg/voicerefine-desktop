import { useState, useEffect } from 'react'
import { Eraser, Mail, Mic2 } from 'lucide-react'
import { validateKey } from '../services/llm'
import {
  currentNativeAsrModel,
  currentParakeetQ4Runtime,
  NATIVE_ASR_MODEL_COHERE_Q4,
  NATIVE_ASR_MODEL_FAST,
  NATIVE_ASR_MODEL_PARAKEET_Q4,
  PARAKEET_Q4_RUNTIME_CLI,
  PARAKEET_Q4_RUNTIME_SERVER,
  preloadNativeAsrModel,
} from '../services/asr'
import { Tooltip } from './Tooltip'

const PROVIDER_OPTIONS = [
  { value: 'builtin', label: 'Built-in (Recommended)', needsKey: false, description: 'Refinement runs locally on your device using a bundled model. No setup, no internet required.' },
  { value: 'gemini',  label: 'Cloud (Gemini)',         needsKey: true,  description: 'Free API key from Google AI Studio (aistudio.google.com).' },
  { value: 'openai',  label: 'Cloud (OpenAI)',         needsKey: true,  description: 'Requires an OpenAI API key (paid).' },
  { value: 'none',    label: 'Skip refinement (transcripts only)', needsKey: false, description: 'No setup needed. You get transcripts but not refined output.' },
]

const INTENT_OPTIONS = [
  { value: 'clean',   Icon: Eraser, label: 'Clean',   description: "Minimal edit. Fix speech artifacts while preserving your vocabulary, phrasing, order, and tone." },
  { value: 'compose', Icon: Mail,   label: 'Compose', description: "Ready-to-send writing. Smooth wording and structure while keeping your meaning and tone." },
  { value: 'prepare', Icon: Mic2,   label: 'Prepare', description: "Spoken delivery. Improve cadence, confidence, and flow for something you'll say aloud." },
]

const NATIVE_ASR_MODEL_OPTIONS = [
  {
    value: NATIVE_ASR_MODEL_FAST,
    label: 'Fast',
    badge: 'Default',
    description: 'Whisper tiny int8. Lowest latency and lightest memory use for everyday dictation.',
  },
  {
    value: NATIVE_ASR_MODEL_PARAKEET_Q4,
    label: 'Balanced Q4',
    badge: 'New',
    description: 'Parakeet 0.6B Q4 through CrispASR. Targeting better accuracy than Whisper Tiny with lower latency than Cohere.',
  },
  {
    value: NATIVE_ASR_MODEL_COHERE_Q4,
    label: 'Accurate Q4',
    description: 'Cohere Transcribe Q4 through CrispASR CLI. Highest-quality local option we are keeping for comparison.',
  },
]

const PARAKEET_Q4_RUNTIME_OPTIONS = [
  {
    value: PARAKEET_Q4_RUNTIME_CLI,
    label: 'CLI',
    badge: 'Default',
    description: 'Starts CrispASR per transcription. Lower idle RAM and simplest behavior.',
  },
  {
    value: PARAKEET_Q4_RUNTIME_SERVER,
    label: 'Server',
    description: 'Keeps Parakeet warm in a local server. Useful for testing faster repeated dictation.',
  },
]

export function SettingsPanel({ open, onClose, onSaved }) {
  const [provider, setProvider]               = useState('builtin')
  const [apiKey, setApiKey]                   = useState('')
  const [intent, setIntent]                   = useState('clean')
  const [nativeAsrModel, setNativeAsrModel]   = useState(NATIVE_ASR_MODEL_FAST)
  const [parakeetQ4Runtime, setParakeetQ4Runtime] = useState(PARAKEET_Q4_RUNTIME_CLI)
  const [asrModelStatus, setAsrModelStatus]   = useState('idle')

  // 'idle' | 'validating' | 'valid' | 'rate_limited' | 'invalid'
  const [keyStatus, setKeyStatus] = useState('idle')
  const [keyError, setKeyError]   = useState('')
  const [override, setOverride]   = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    const stored = localStorage.getItem('vr_provider') ?? 'builtin'
    setProvider(stored === 'browser' || stored === 'ollama' ? 'builtin' : stored)
    setApiKey(localStorage.getItem('vr_api_key')   ?? '')
    const storedIntent = localStorage.getItem('vr_intent')
    setIntent(storedIntent && INTENT_OPTIONS.some(o => o.value === storedIntent) ? storedIntent : 'clean')
    setNativeAsrModel(currentNativeAsrModel())
    setParakeetQ4Runtime(currentParakeetQ4Runtime())
    setAsrModelStatus('idle')
    setKeyStatus('idle')
    setKeyError('')
    setOverride(false)
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  const needsKey = PROVIDER_OPTIONS.find(p => p.value === provider)?.needsKey ?? false

  const handleProviderChange = (val) => {
    setProvider(val)
    setKeyStatus('idle')
    setKeyError('')
    setOverride(false)
  }

  const handleValidate = async () => {
    setKeyStatus('validating')
    setKeyError('')
    try {
      await validateKey({ provider, apiKey })
      setKeyStatus('valid')
    } catch (err) {
      if (err.message === 'rate_limited') {
        setKeyStatus('rate_limited')
      } else {
        setKeyStatus('invalid')
        setKeyError(err.message)
      }
    }
  }

  const canSave =
    provider === 'none' ||
    provider === 'builtin' ||
    keyStatus === 'valid' ||
    keyStatus === 'rate_limited' ||
    override

  const handleNativeAsrModelChange = async (model) => {
    setNativeAsrModel(model)
    localStorage.setItem('vr_native_asr_model', model)
    setAsrModelStatus('loading')
    try {
      await preloadNativeAsrModel(model)
      setAsrModelStatus('ready')
    } catch (err) {
      console.warn('[settings] ASR model preload failed', err)
      setAsrModelStatus('error')
    }
  }

  const handleParakeetQ4RuntimeChange = async (runtime) => {
    setParakeetQ4Runtime(runtime)
    localStorage.setItem('vr_parakeet_q4_runtime', runtime)
    if (nativeAsrModel !== NATIVE_ASR_MODEL_PARAKEET_Q4) return

    setAsrModelStatus('loading')
    try {
      await preloadNativeAsrModel(NATIVE_ASR_MODEL_PARAKEET_Q4)
      setAsrModelStatus('ready')
    } catch (err) {
      console.warn('[settings] Parakeet runtime preload failed', err)
      setAsrModelStatus('error')
    }
  }

  const handleSave = () => {
    localStorage.setItem('vr_provider', provider)
    localStorage.setItem('vr_intent',  intent)
    localStorage.setItem('vr_native_asr_model', nativeAsrModel)
    localStorage.setItem('vr_parakeet_q4_runtime', parakeetQ4Runtime)
    if (needsKey) {
      localStorage.setItem('vr_api_key', apiKey)
    } else {
      localStorage.removeItem('vr_api_key')
    }
    onSaved?.()
    onClose()
  }

  const handleReset = () => {
    localStorage.clear()
    onClose()
    window.location.reload()
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-[rgba(58,47,42,0.2)] z-40" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full w-96 border-l border-[rgba(58,47,42,0.08)] z-50 flex flex-col overflow-y-auto"
        style={{ background: '#E8D9C5', boxShadow: '-4px 0 24px rgba(58,47,42,0.08)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(58,47,42,0.08)]">
          <h2 className="text-base font-semibold text-[#3A2F2A]">Settings</h2>
          <button onClick={onClose} className="text-[#6B5B52] hover:text-[#3A2F2A] text-2xl leading-none transition-colors">×</button>
        </div>

        <div className="flex-1 px-6 py-6 flex flex-col gap-8">

          {/* Provider */}
          <section>
            <h3 className="text-xs font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-3">Provider</h3>
            <div className="flex flex-col gap-2">
              {PROVIDER_OPTIONS.map(p => (
                <label key={p.value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value={p.value}
                    checked={provider === p.value}
                    onChange={() => handleProviderChange(p.value)}
                    className="accent-[#7FAF8F] mt-0.5 flex-shrink-0"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm text-[#3A2F2A] font-medium">{p.label}</span>
                    <span className="text-xs text-[#8A766E] leading-snug">
                      {p.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* API Key — hidden for key-free providers */}
          {needsKey && (
            <section>
              <h3 className="text-xs font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-3">API Key</h3>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setKeyStatus('idle') }}
                  placeholder="Paste your key here"
                  className="flex-1 rounded-lg px-3 py-2 text-sm text-[#3A2F2A] placeholder-[#6B5B52] outline-none border border-[rgba(58,47,42,0.08)] focus:border-[#7FAF8F]/50"
                  style={{ background: '#E6CFC7' }}
                />
                <button
                  onClick={handleValidate}
                  disabled={!apiKey || keyStatus === 'validating'}
                  className="px-3 py-2 rounded-lg text-sm text-[#6B5B52] hover:text-[#3A2F2A] border border-[rgba(58,47,42,0.08)] disabled:opacity-40 transition-colors"
                  style={{ background: '#E6CFC7' }}
                >
                  {keyStatus === 'validating' ? '…' : 'Validate'}
                </button>
              </div>

              {keyStatus === 'valid' && (
                <p className="mt-2 text-sm text-[#7FAF8F]">✓ Key is valid</p>
              )}
              {keyStatus === 'rate_limited' && (
                <p className="mt-2 text-sm text-amber-700">✓ Key is valid (rate limited, quota resets soon)</p>
              )}
              {keyStatus === 'invalid' && (
                <div className="mt-2">
                  <p className="text-sm text-red-700">✗ {keyError}</p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={override}
                      onChange={e => setOverride(e.target.checked)}
                      className="accent-[#7FAF8F]"
                    />
                    <span className="text-xs text-[#8A766E]">Save anyway, I know what I'm doing</span>
                  </label>
                </div>
              )}

              <p className="mt-3 text-xs text-[#8A766E]">
                Your key is stored only on this device and never sent to any server we own.
              </p>
            </section>
          )}

          {/* Transcription */}
          <section>
            <h3 className="text-xs font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-3">Transcription</h3>
            <div className="flex flex-col gap-2">
              {NATIVE_ASR_MODEL_OPTIONS.map(({ value, label, badge, description }) => (
                <label key={value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="native-asr-model"
                    value={value}
                    checked={nativeAsrModel === value}
                    onChange={() => handleNativeAsrModelChange(value)}
                    className="accent-[#7FAF8F] mt-0.5 flex-shrink-0"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm text-[#3A2F2A] font-medium">
                      {label}
                      {badge && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#7FAF8F]/20 text-[#5C8F70] font-medium">{badge}</span>}
                    </span>
                    <span className="text-xs text-[#8A766E] leading-snug">
                      {description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {nativeAsrModel === NATIVE_ASR_MODEL_PARAKEET_Q4 && (
              <div className="mt-4 pl-6">
                <h4 className="text-[11px] font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-2">Parakeet Runtime</h4>
                <div className="flex flex-col gap-2">
                  {PARAKEET_Q4_RUNTIME_OPTIONS.map(({ value, label, badge, description }) => (
                    <label key={value} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="parakeet-q4-runtime"
                        value={value}
                        checked={parakeetQ4Runtime === value}
                        onChange={() => handleParakeetQ4RuntimeChange(value)}
                        className="accent-[#7FAF8F] mt-0.5 flex-shrink-0"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 text-sm text-[#3A2F2A] font-medium">
                          {label}
                          {badge && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#7FAF8F]/20 text-[#5C8F70] font-medium">{badge}</span>}
                        </span>
                        <span className="text-xs text-[#8A766E] leading-snug">{description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {asrModelStatus === 'loading' && (
              <p className="mt-2 text-xs text-[#8A766E]">Loading selected transcription model...</p>
            )}
            {asrModelStatus === 'ready' && (
              <p className="mt-2 text-xs text-[#5C8F70]">Selected transcription model is ready.</p>
            )}
            {asrModelStatus === 'error' && (
              <p className="mt-2 text-xs text-red-700">Could not preload the selected transcription model.</p>
            )}
          </section>

          {/* Intent */}
          <section>
            <h3 className="text-xs font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-3">Intent</h3>
            <div className="flex flex-col gap-2">
              {INTENT_OPTIONS.map(({ value, Icon, label, description }) => (
                <label key={value} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="intent"
                    value={value}
                    checked={intent === value}
                    onChange={() => setIntent(value)}
                    className="accent-[#7FAF8F]"
                  />
                  <Tooltip text={description} align="left">
                    <span className="flex items-center gap-2 text-sm text-[#3A2F2A]">
                      <Icon size={14} strokeWidth={1.75} color="#5C4B44" />
                      {label}
                    </span>
                  </Tooltip>
                </label>
              ))}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[rgba(58,47,42,0.08)] flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-2 rounded-xl text-sm font-medium bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button
            onClick={handleReset}
            className="w-full py-2 rounded-xl text-sm text-[#6B5B52] hover:text-[#3A2F2A] transition-colors"
          >
            Reset onboarding
          </button>
        </div>
      </div>
    </>
  )
}
