import { useState, useEffect, useRef } from 'react'
import { Eraser, Mail, Mic2 } from 'lucide-react'
import { validateKey } from '../services/llm'

const INTENTS = [
  { value: 'clean',   Icon: Eraser, label: 'Clean',   description: "Minimal edit. Fix speech artifacts while preserving your vocabulary, phrasing, order, and tone." },
  { value: 'compose', Icon: Mail,   label: 'Compose', description: "Ready-to-send writing. Smooth wording and structure while keeping your meaning and tone." },
  { value: 'prepare', Icon: Mic2,   label: 'Prepare', description: "Spoken delivery. Improve cadence, confidence, and flow for something you'll say aloud." },
]

const PROVIDERS = [
  { value: 'builtin', label: 'Built-in (Recommended)', needsKey: false, description: 'Refinement runs locally on your device using a bundled model. No setup, no internet required.' },
  { value: 'gemini',  label: 'Cloud (Gemini)',         needsKey: true,  description: 'Free API key from Google AI Studio (aistudio.google.com).' },
  { value: 'openai',  label: 'Cloud (OpenAI)',         needsKey: true,  description: 'Requires an OpenAI API key (paid).' },
  { value: 'none',    label: 'Skip refinement (transcripts only)', needsKey: false, description: 'No setup needed. You get transcripts but not refined output. You can switch to a provider later in Settings.' },
]

function Step1({ intent, onSelect, onContinue }) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#3A2F2A] mb-2">What will you mostly use this for?</h1>
        <p className="text-sm text-[#8A766E]">This shapes how VoiceRefine transforms your recordings.</p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        {INTENTS.map(({ value, Icon, label, description }) => {
          const selected = intent === value
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

      <p className="text-xs text-[#8A766E]">You can change this anytime from the main screen or Settings.</p>

      <button
        onClick={onContinue}
        disabled={!intent}
        className="px-8 py-2.5 rounded-xl text-sm font-medium bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  )
}

function Step2({ onComplete }) {
  const [provider, setProvider]   = useState('builtin')
  const [apiKey, setApiKey]       = useState('')
  const [status, setStatus]       = useState('idle') // 'idle' | 'checking' | 'valid' | 'rate_limited' | 'invalid'
  const [statusMsg, setStatusMsg] = useState('')
  const [override, setOverride]   = useState(false)

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
    provider === 'none' ||
    provider === 'builtin' ||
    (provider && (status === 'valid' || status === 'rate_limited' || override))

  const handleComplete = () => {
    localStorage.setItem('vr_provider', provider)
    if (needsKey && apiKey) localStorage.setItem('vr_api_key', apiKey)
    else localStorage.removeItem('vr_api_key')
    onComplete()
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#3A2F2A] mb-2">How do you want to power refinements?</h1>
        <p className="text-sm text-[#8A766E]">Your key is stored only on this device, never on our servers.</p>
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
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-[#3A2F2A]">{label}</span>
              </div>
              <p className="text-xs text-[#8A766E] leading-snug">{description}</p>
            </button>
          )
        })}
      </div>

      {/* Key input for Gemini / OpenAI */}
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
              {status === 'checking' ? '…' : 'Validate'}
            </button>
          </div>
          <ValidationFeedback status={status} message={statusMsg} override={override} onOverride={setOverride} />
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

function ValidationFeedback({ status, message, override, onOverride }) {
  if (status === 'idle') return null
  return (
    <div className="text-sm">
      {status === 'checking' && <p className="text-[#8A766E]">Checking…</p>}
      {status === 'valid' && <p className="text-[#6FA287]">✓ Connected</p>}
      {status === 'rate_limited' && <p className="text-amber-700">✓ Valid key (rate limited, quota resets soon)</p>}
      {status === 'invalid' && (
        <div className="flex flex-col gap-2">
          <p className="text-red-700">✗ {message}</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={override}
              onChange={e => onOverride(e.target.checked)}
              className="accent-[#7FAF8F]"
            />
            <span className="text-xs text-[#8A766E]">Continue anyway, I know what I'm doing</span>
          </label>
        </div>
      )}
    </div>
  )
}

export function Onboarding({ onComplete }) {
  const [step, setStep]                         = useState(1)
  const [intent, setIntent]                     = useState(null)
  const [fading, setFading]                     = useState(false)
  const fadeTimerRef                            = useRef(null)

  useEffect(() => () => clearTimeout(fadeTimerRef.current), [])

  const handleStep1Continue = () => {
    localStorage.setItem('vr_intent', intent)
    setStep(2)
  }

  const handleStep2Complete = () => {
    localStorage.setItem('vr_onboarding_done', 'true')
    setFading(true)
    fadeTimerRef.current = setTimeout(onComplete, 500)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 transition-opacity duration-500 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(180deg, #EADBD2 0%, #E6D4C2 100%)' }}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 border-b border-[rgba(58,47,42,0.08)]">
        <h1 className="text-xl font-semibold tracking-tight text-[#C96F3B]">VoiceRefine</h1>
        <span className="text-xs text-[#8A766E]">Step {step} of 2</span>
      </div>

      {step === 1 && <Step1 intent={intent} onSelect={setIntent} onContinue={handleStep1Continue} />}
      {step === 2 && <Step2 onComplete={handleStep2Complete} />}
    </div>
  )
}
