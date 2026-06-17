import { useState, useEffect, useRef } from 'react'
import { Eraser, Sparkles } from 'lucide-react'
import { validateKey } from '../services/llm'
import { DEFAULT_TRANSFORM_PRESET, defaultPromptForPreset } from '../utils/composePrompt'
import {
  REFINEMENT_MODE_CLEAN,
  REFINEMENT_MODE_TRANSFORM,
  TRANSFORM_PROMPT_MODE_PRESET,
  promptStorageKeyForPreset,
} from '../utils/refinementSettings'
import { formatShortcutLabel, isModifierOnlyEvent, shortcutFromEvent } from '../utils/shortcut'

const REFINEMENT_CHOICES = [
  {
    value: REFINEMENT_MODE_CLEAN,
    Icon: Eraser,
    label: 'Clean',
    description: 'Fast local cleanup with no LLM. Best for dictation and overlay use.',
  },
  {
    value: REFINEMENT_MODE_TRANSFORM,
    Icon: Sparkles,
    label: 'Transform',
    description: 'Use a model to smart-format speech or polish and organize longer thoughts.',
  },
]

const PROVIDERS = [
  { value: 'builtin', label: 'Built-in (Recommended)', needsKey: false, description: 'Transform runs locally on your device using a bundled model. No internet required.' },
  { value: 'gemini',  label: 'Cloud (Gemini)',         needsKey: true, description: 'Free API key from Google AI Studio.' },
  { value: 'openai',  label: 'Cloud (OpenAI)',         needsKey: true, description: 'Requires an OpenAI API key.' },
]

function Step1({ refinementMode, onSelect, onContinue }) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#3A2F2A] mb-2">How do you want VoiceRefine to behave?</h1>
        <p className="text-sm text-[#8A766E]">Choose between instant cleanup and richer transformed writing.</p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        {REFINEMENT_CHOICES.map(({ value, Icon, label, description }) => {
          const selected = refinementMode === value
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
                selected
                  ? 'bg-[rgba(127,175,143,0.12)] border-[#7FAF8F]/50'
                  : 'bg-[#E6CFC7] border-[rgba(58,47,42,0.08)] hover:border-[rgba(58,47,42,0.18)] hover:bg-[#DFC8BE]'
              }`}
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
            >
              <Icon size={18} strokeWidth={1.75} color={selected ? '#6FA287' : '#8A766E'} className="mb-2" />
              <p className="text-sm font-semibold mb-0.5 text-[#3A2F2A]">{label}</p>
              <p className="text-xs text-[#8A766E] leading-snug">{description}</p>
            </button>
          )
        })}
      </div>

      <button
        onClick={onContinue}
        disabled={!refinementMode}
        className="px-8 py-2.5 rounded-xl text-sm font-medium bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  )
}

function ShortcutStep({ onContinue }) {
  const [shortcut, setShortcut] = useState('Control+Shift+Space')
  const [defaultShortcut, setDefaultShortcut] = useState('Control+Shift+Space')
  const [capturing, setCapturing] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const buttonRef = useRef(null)

  useEffect(() => {
    window.voicerefine?.getRecordingShortcut?.().then(result => {
      const nextDefault = result?.defaultAccelerator ?? 'Control+Shift+Space'
      setDefaultShortcut(nextDefault)
      setShortcut(result?.accelerator ?? nextDefault)
    }).catch(err => {
      console.warn('[onboarding] Could not load recording shortcut', err)
    })
  }, [])

  useEffect(() => {
    if (capturing) buttonRef.current?.focus()
  }, [capturing])

  const handleKeyDown = (event) => {
    if (!capturing) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      setCapturing(false)
      setStatus('idle')
      setError('')
      return
    }

    // Keep waiting while only modifiers are held (e.g. Alt before Space) so we
    // don't flash an error before the user finishes the combo.
    if (isModifierOnlyEvent(event)) return

    const nextShortcut = shortcutFromEvent(event)
    if (!nextShortcut) {
      setStatus('error')
      setError('Hold Ctrl or Alt and press another key.')
      return
    }

    setShortcut(nextShortcut)
    setCapturing(false)
    setStatus('idle')
    setError('')
  }

  const handleContinue = async () => {
    setStatus('saving')
    setError('')
    try {
      const result = await window.voicerefine?.setRecordingShortcut?.(shortcut)
      if (result && !result.ok) {
        setStatus('error')
        setShortcut(result.accelerator ?? defaultShortcut)
        setError(`${formatShortcutLabel(result.failedAccelerator)} is already in use by another app and can't be used. Pick a different shortcut.`)
        return
      }
      onContinue()
    } catch (err) {
      setStatus('error')
      setError(err?.message ?? 'Could not save shortcut.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#3A2F2A] mb-2">Choose your recording shortcut</h1>
        <p className="text-sm text-[#8A766E]">Use it anywhere to start recording, then press it again to stop.</p>
      </div>

      <div className="w-full flex flex-col gap-3">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setCapturing(true)
            setStatus('idle')
            setError('')
          }}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-2xl border px-4 py-5 text-center text-base font-semibold outline-none transition-colors focus:border-[#7FAF8F]/60 ${
            capturing
              ? 'bg-[rgba(127,175,143,0.12)] border-[#7FAF8F]/60 text-[#3A2F2A]'
              : 'bg-[#E6CFC7] border-[rgba(58,47,42,0.08)] text-[#3A2F2A] hover:border-[rgba(58,47,42,0.18)]'
          }`}
        >
          {capturing ? 'Press your shortcut...' : formatShortcutLabel(shortcut)}
        </button>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              setShortcut(defaultShortcut)
              setCapturing(false)
              setStatus('idle')
              setError('')
            }}
            className="text-xs text-[#8A766E] hover:text-[#3A2F2A] transition-colors"
          >
            Use default
          </button>
          {capturing && (
            <button
              type="button"
              onClick={() => {
                setCapturing(false)
                setStatus('idle')
                setError('')
              }}
              className="text-xs text-[#8A766E] hover:text-[#3A2F2A] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <p className="text-xs text-[#8A766E] text-center leading-snug">
          Default is {formatShortcutLabel(defaultShortcut)}. If a shortcut is already used by your system, VoiceRefine will ask you to choose another. Press Esc while recording to cancel.
        </p>
        {status === 'error' && <p className="text-sm text-red-700 text-center">{error}</p>}
      </div>

      <button
        onClick={handleContinue}
        disabled={!shortcut || status === 'saving'}
        className="px-8 py-2.5 rounded-xl text-sm font-medium bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === 'saving' ? 'Saving...' : 'Continue'}
      </button>
    </div>
  )
}

function ProviderStep({ onComplete }) {
  const [provider, setProvider] = useState('builtin')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [override, setOverride] = useState(false)

  const handleProviderChange = (val) => {
    setProvider(val)
    setStatus('idle')
    setStatusMsg('')
    setOverride(false)
    setApiKey('')
  }

  const handleValidate = async () => {
    setStatus('checking')
    setStatusMsg('')
    try {
      await validateKey({ provider, apiKey })
      setStatus('valid')
    } catch (err) {
      if (err.message === 'rate_limited') {
        setStatus('rate_limited')
      } else {
        setStatus('invalid')
        setStatusMsg(err.message)
      }
    }
  }

  const needsKey = PROVIDERS.find(p => p.value === provider)?.needsKey ?? false
  const canContinue =
    provider === 'builtin' ||
    status === 'valid' ||
    status === 'rate_limited' ||
    override

  const handleComplete = () => {
    localStorage.setItem('vr_provider', provider)
    localStorage.setItem('vr_transform_preset', DEFAULT_TRANSFORM_PRESET)
    localStorage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_PRESET)
    localStorage.setItem(promptStorageKeyForPreset('clarity'), defaultPromptForPreset('clarity'))
    localStorage.setItem(promptStorageKeyForPreset('structure'), defaultPromptForPreset('structure'))
    if (needsKey && apiKey) localStorage.setItem('vr_api_key', apiKey)
    else localStorage.removeItem('vr_api_key')
    onComplete()
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#3A2F2A] mb-2">How do you want to power transforms?</h1>
        <p className="text-sm text-[#8A766E]">Your key stays on this device. Clean mode never needs a model provider.</p>
      </div>

      <div className="flex flex-col gap-2 w-full">
        {PROVIDERS.map(({ value, label, description }) => {
          const selected = provider === value
          return (
            <button
              key={value}
              onClick={() => handleProviderChange(value)}
              className={`text-left px-4 py-3 rounded-xl border transition-all duration-150 ${
                selected
                  ? 'bg-[rgba(127,175,143,0.12)] border-[#7FAF8F]/50'
                  : 'bg-[#E6CFC7] border-[rgba(58,47,42,0.08)] hover:border-[rgba(58,47,42,0.18)]'
              }`}
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
            >
              <span className="text-sm font-semibold text-[#3A2F2A]">{label}</span>
              <p className="text-xs text-[#8A766E] leading-snug mt-0.5">{description}</p>
            </button>
          )
        })}
      </div>

      {provider && needsKey && (
        <div className="w-full flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setStatus('idle'); setOverride(false) }}
              placeholder={`Paste your ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key`}
              className="flex-1 rounded-lg px-3 py-2 text-sm text-[#3A2F2A] placeholder-[#8A766E] outline-none border border-[rgba(58,47,42,0.08)] focus:border-[#7FAF8F]/50"
              style={{ background: '#DFC8BE' }}
            />
            <button
              onClick={handleValidate}
              disabled={!apiKey || status === 'checking'}
              className="px-3 py-2 rounded-lg text-sm text-[#6B5B52] hover:text-[#3A2F2A] border border-[rgba(58,47,42,0.08)] disabled:opacity-40 transition-colors"
              style={{ background: '#DFC8BE' }}
            >
              {status === 'checking' ? '...' : 'Validate'}
            </button>
          </div>

          {status === 'checking' && <p className="text-sm text-[#8A766E]">Checking...</p>}
          {status === 'valid' && <p className="text-sm text-[#6FA287]">Connected</p>}
          {status === 'rate_limited' && <p className="text-sm text-amber-700">Valid key (rate limited, quota resets soon)</p>}
          {status === 'invalid' && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-red-700">{statusMsg}</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={e => setOverride(e.target.checked)}
                  className="accent-[#7FAF8F]"
                />
                <span className="text-xs text-[#8A766E]">Continue anyway, I know what I&apos;m doing</span>
              </label>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleComplete}
        disabled={!canContinue}
        className="px-8 py-2.5 rounded-xl text-sm font-medium bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Get started
      </button>
    </div>
  )
}

export function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1)
  const [refinementMode, setRefinementMode] = useState(null)
  const [fading, setFading] = useState(false)
  const fadeTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(fadeTimerRef.current), [])

  const handleStep1Continue = () => {
    localStorage.setItem('vr_refinement_mode', refinementMode)
    setStep(2)
  }

  const handleShortcutContinue = () => {
    if (refinementMode === REFINEMENT_MODE_CLEAN) {
      localStorage.setItem('vr_provider', 'builtin')
      localStorage.setItem('vr_transform_preset', DEFAULT_TRANSFORM_PRESET)
      localStorage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_PRESET)
      localStorage.setItem(promptStorageKeyForPreset('clarity'), defaultPromptForPreset('clarity'))
      localStorage.setItem(promptStorageKeyForPreset('structure'), defaultPromptForPreset('structure'))
      localStorage.setItem('vr_onboarding_done', 'true')
      setFading(true)
      fadeTimerRef.current = setTimeout(onComplete, 500)
      return
    }
    setStep(3)
  }

  const handleProviderComplete = () => {
    localStorage.setItem('vr_refinement_mode', REFINEMENT_MODE_TRANSFORM)
    localStorage.setItem('vr_onboarding_done', 'true')
    setFading(true)
    fadeTimerRef.current = setTimeout(onComplete, 500)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 transition-opacity duration-500 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(180deg, #EADBD2 0%, #E6D4C2 100%)' }}
    >
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 border-b border-[rgba(58,47,42,0.08)]">
        <h1 className="text-xl font-semibold tracking-tight text-[#C96F3B]">VoiceRefine</h1>
        <span className="text-xs text-[#8A766E]">Step {step} of {refinementMode === REFINEMENT_MODE_TRANSFORM ? 3 : 2}</span>
      </div>

      {step === 1 && <Step1 refinementMode={refinementMode} onSelect={setRefinementMode} onContinue={handleStep1Continue} />}
      {step === 2 && <ShortcutStep onContinue={handleShortcutContinue} />}
      {step === 3 && <ProviderStep onComplete={handleProviderComplete} />}
    </div>
  )
}
