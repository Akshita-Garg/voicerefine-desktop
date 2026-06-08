import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { validateKey } from '../services/llm'
import { TRANSFORM_PRESETS, defaultPromptForPreset } from '../utils/composePrompt'
import {
  TRANSFORM_PROMPT_MODE_CUSTOM,
  TRANSFORM_PROMPT_MODE_PRESET,
  promptStorageKeyForPreset,
  readStoredPromptDraftForPreset,
  readTransformPromptMode,
} from '../utils/refinementSettings'
import {
  currentNativeAsrModel,
  NATIVE_ASR_MODEL_COHERE_Q4,
  NATIVE_ASR_MODEL_FAST,
  NATIVE_ASR_MODEL_PARAKEET_Q4,
  preloadNativeAsrModel,
  syncSelectedNativeAsrModel,
} from '../services/asr'

const PROVIDER_OPTIONS = [
  { value: 'builtin', label: 'Built-in (Recommended)', needsKey: false, description: 'Transform runs locally on your device using a bundled model. No setup, no internet required.' },
  { value: 'gemini',  label: 'Cloud (Gemini)',         needsKey: true,  description: 'Free API key from Google AI Studio.' },
  { value: 'openai',  label: 'Cloud (OpenAI)',         needsKey: true,  description: 'Requires an OpenAI API key.' },
  { value: 'none',    label: 'Disable transform',      needsKey: false, description: 'Keep Clean mode only. Transform buttons stay unavailable.' },
]

const NATIVE_ASR_MODEL_OPTIONS = [
  {
    value: NATIVE_ASR_MODEL_FAST,
    label: 'Quick',
    description: 'Lowest latency for rough drafts when speed matters more than exact wording.',
  },
  {
    value: NATIVE_ASR_MODEL_PARAKEET_Q4,
    label: 'Balanced',
    badge: 'Default',
    description: 'Recommended for everyday dictation. Keeps the local transcription engine warm for faster repeated captures.',
  },
  {
    value: NATIVE_ASR_MODEL_COHERE_Q4,
    label: 'Precise',
    description: 'Higher-accuracy local transcription for harder audio, with slower response time.',
  },
]

export function SettingsPanel({ open, onClose, onSaved }) {
  const [provider, setProvider] = useState('builtin')
  const [apiKey, setApiKey] = useState('')
  const [nativeAsrModel, setNativeAsrModel] = useState(NATIVE_ASR_MODEL_PARAKEET_Q4)
  const [recordingShortcut, setRecordingShortcut] = useState('')
  const [defaultRecordingShortcut, setDefaultRecordingShortcut] = useState('')
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false)
  const [shortcutStatus, setShortcutStatus] = useState('idle')
  const [shortcutError, setShortcutError] = useState('')
  const [transformPromptMode, setTransformPromptMode] = useState(TRANSFORM_PROMPT_MODE_PRESET)
  const [transformPromptEditorOpen, setTransformPromptEditorOpen] = useState(false)
  const [clarityPrompt, setClarityPrompt] = useState('')
  const [structurePrompt, setStructurePrompt] = useState('')
  const [asrModelStatus, setAsrModelStatus] = useState('idle')
  const [keyStatus, setKeyStatus] = useState('idle')
  const [keyError, setKeyError] = useState('')
  const [override, setOverride] = useState(false)
  const shortcutButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const stored = localStorage.getItem('vr_provider') ?? 'builtin'
    setProvider(stored === 'browser' || stored === 'ollama' ? 'builtin' : stored)
    setApiKey(localStorage.getItem('vr_api_key') ?? '')
    setNativeAsrModel(currentNativeAsrModel())
    window.voicerefine?.getRecordingShortcut?.().then(result => {
      setRecordingShortcut(result?.accelerator ?? '')
      setDefaultRecordingShortcut(result?.defaultAccelerator ?? '')
    }).catch(err => {
      console.warn('[settings] Could not load recording shortcut', err)
    })
    const storedTransformPromptMode = readTransformPromptMode()
    setTransformPromptMode(storedTransformPromptMode)
    setTransformPromptEditorOpen(storedTransformPromptMode === TRANSFORM_PROMPT_MODE_CUSTOM)
    setClarityPrompt(storedTransformPromptMode === TRANSFORM_PROMPT_MODE_CUSTOM
      ? readStoredPromptDraftForPreset('clarity')
      : defaultPromptForPreset('clarity'))
    setStructurePrompt(storedTransformPromptMode === TRANSFORM_PROMPT_MODE_CUSTOM
      ? readStoredPromptDraftForPreset('structure')
      : defaultPromptForPreset('structure'))
    setAsrModelStatus('idle')
    setKeyStatus('idle')
    setKeyError('')
    setShortcutStatus('idle')
    setShortcutError('')
    setIsCapturingShortcut(false)
    setOverride(false)
  }, [open])

  useEffect(() => {
    if (isCapturingShortcut) shortcutButtonRef.current?.focus()
  }, [isCapturingShortcut])

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

  const handleTransformPromptChange = (preset, value) => {
    setTransformPromptMode(TRANSFORM_PROMPT_MODE_CUSTOM)
    if (preset === 'clarity') {
      setClarityPrompt(value)
    } else {
      setStructurePrompt(value)
    }
  }

  const handleResetTransformPrompt = (preset) => {
    setTransformPromptMode(TRANSFORM_PROMPT_MODE_CUSTOM)
    if (preset === 'clarity') {
      setClarityPrompt(defaultPromptForPreset('clarity'))
    } else {
      setStructurePrompt(defaultPromptForPreset('structure'))
    }
  }

  const handleUseBuiltInTransformPrompts = () => {
    setTransformPromptMode(TRANSFORM_PROMPT_MODE_PRESET)
    setClarityPrompt(defaultPromptForPreset('clarity'))
    setStructurePrompt(defaultPromptForPreset('structure'))
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
      await syncSelectedNativeAsrModel(model)
      await preloadNativeAsrModel(model)
      setAsrModelStatus('ready')
    } catch (err) {
      console.warn('[settings] ASR model preload failed', err)
      setAsrModelStatus('error')
    }
  }

  const formatShortcutLabel = (accelerator) => accelerator
    .replace(/Command/g, 'Cmd')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, 'Alt')
    .replace(/\+/g, ' + ')

  const shortcutKeyFromEvent = (event) => {
    const keyMap = {
      ' ': 'Space',
      Spacebar: 'Space',
      Escape: 'Esc',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Delete: 'Delete',
      Backspace: 'Backspace',
      Enter: 'Enter',
      Tab: 'Tab',
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null
    if (keyMap[event.key]) return keyMap[event.key]
    if (/^F\d{1,2}$/.test(event.key)) return event.key
    if (event.key.length === 1) return event.key.toUpperCase()
    return event.key
  }

  const shortcutFromEvent = (event) => {
    const key = shortcutKeyFromEvent(event)
    if (!key || key === 'Esc') return null

    const isMac = window.navigator.platform.toLowerCase().includes('mac')
    const modifiers = []
    if (event.metaKey) modifiers.push(isMac ? 'Command' : 'Super')
    if (event.ctrlKey) modifiers.push('Control')
    if (event.altKey) modifiers.push('Alt')
    if (event.shiftKey) modifiers.push('Shift')

    const hasPrimaryModifier = modifiers.some(modifier => modifier === 'Command' || modifier === 'Control' || modifier === 'Alt' || modifier === 'Super')
    if (!hasPrimaryModifier) return null

    return [...modifiers, key].join('+')
  }

  const handleShortcutKeyDown = (event) => {
    if (!isCapturingShortcut) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      setIsCapturingShortcut(false)
      setShortcutStatus('idle')
      setShortcutError('')
      return
    }

    const nextShortcut = shortcutFromEvent(event)
    if (!nextShortcut) {
      setShortcutStatus('error')
      setShortcutError('Use at least one modifier, such as Ctrl, Cmd, or Alt, plus another key.')
      return
    }

    setRecordingShortcut(nextShortcut)
    setIsCapturingShortcut(false)
    setShortcutStatus('idle')
    setShortcutError('')
  }

  const handleSave = async () => {
    setShortcutStatus('saving')
    setShortcutError('')
    try {
      if (recordingShortcut) {
        const shortcutResult = await window.voicerefine?.setRecordingShortcut?.(recordingShortcut)
        if (shortcutResult && !shortcutResult.ok) {
          setShortcutStatus('error')
          setShortcutError(`${formatShortcutLabel(shortcutResult.failedAccelerator)} is unavailable. VoiceRefine kept ${formatShortcutLabel(shortcutResult.accelerator)}.`)
          setRecordingShortcut(shortcutResult.accelerator)
          return
        }
      }
    } catch (err) {
      setShortcutStatus('error')
      setShortcutError(err?.message ?? 'Could not update the recording shortcut.')
      return
    }

    try {
      localStorage.setItem('vr_provider', provider)
      localStorage.setItem('vr_native_asr_model', nativeAsrModel)
      void syncSelectedNativeAsrModel(nativeAsrModel)
      if (needsKey) {
        localStorage.setItem('vr_api_key', apiKey)
      } else {
        localStorage.removeItem('vr_api_key')
      }
      localStorage.setItem('vr_transform_prompt_mode', transformPromptMode)
      localStorage.setItem(promptStorageKeyForPreset('clarity'), clarityPrompt.trim() || defaultPromptForPreset('clarity'))
      localStorage.setItem(promptStorageKeyForPreset('structure'), structurePrompt.trim() || defaultPromptForPreset('structure'))
      setShortcutStatus('idle')
      onSaved?.()
      onClose()
    } catch (err) {
      setShortcutStatus('error')
      setShortcutError(err?.message ?? 'Could not save settings.')
      return
    }
  }

  const handleReset = async () => {
    try {
      const shortcut = await window.voicerefine?.getRecordingShortcut?.()
      if (shortcut?.defaultAccelerator) {
        await window.voicerefine?.setRecordingShortcut?.(shortcut.defaultAccelerator)
      }
    } catch (err) {
      console.warn('[settings] Could not reset recording shortcut', err)
    }
    localStorage.clear()
    onClose()
    window.location.reload()
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-[rgba(58,47,42,0.2)] z-40" onClick={onClose} />

      <div
        className="fixed top-0 right-0 h-full w-96 border-l border-[rgba(58,47,42,0.08)] z-50 flex flex-col overflow-y-auto"
        style={{ background: '#E8D9C5', boxShadow: '-4px 0 24px rgba(58,47,42,0.08)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(58,47,42,0.08)]">
          <h2 className="text-base font-semibold text-[#3A2F2A]">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center rounded-md text-[#8A766E] transition-colors hover:bg-[rgba(58,47,42,0.06)] hover:text-[#3A2F2A]"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 px-6 py-6 flex flex-col gap-8">
          <section>
            <h3 className="text-xs font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-3">Transform Provider</h3>
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
                    <span className="text-xs text-[#8A766E] leading-snug">{p.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

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
                  {keyStatus === 'validating' ? '...' : 'Validate'}
                </button>
              </div>

              {keyStatus === 'valid' && <p className="mt-2 text-sm text-[#7FAF8F]">Key is valid</p>}
              {keyStatus === 'rate_limited' && <p className="mt-2 text-sm text-amber-700">Key is valid (rate limited, quota resets soon)</p>}
              {keyStatus === 'invalid' && (
                <div className="mt-2">
                  <p className="text-sm text-red-700">{keyError}</p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={override}
                      onChange={e => setOverride(e.target.checked)}
                      className="accent-[#7FAF8F]"
                    />
                    <span className="text-xs text-[#8A766E]">Save anyway, I know what I&apos;m doing</span>
                  </label>
                </div>
              )}

              <p className="mt-3 text-xs text-[#8A766E]">
                Your key is stored only on this device and never sent to any server we own.
              </p>
            </section>
          )}

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
                    <span className="text-xs text-[#8A766E] leading-snug">{description}</span>
                  </span>
                </label>
              ))}
            </div>
            {asrModelStatus === 'loading' && <p className="mt-2 text-xs text-[#8A766E]">Loading selected transcription model...</p>}
            {asrModelStatus === 'ready' && <p className="mt-2 text-xs text-[#5C8F70]">Selected transcription model is ready.</p>}
            {asrModelStatus === 'error' && <p className="mt-2 text-xs text-red-700">Could not preload the selected transcription model.</p>}
          </section>

          <section>
            <h3 className="text-xs font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-3">Shortcut</h3>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-[#3A2F2A] font-medium">Start and stop recording</span>
              <button
                ref={shortcutButtonRef}
                type="button"
                onClick={() => {
                  setIsCapturingShortcut(true)
                  setShortcutStatus('idle')
                  setShortcutError('')
                }}
                onKeyDown={handleShortcutKeyDown}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors focus:border-[#7FAF8F]/60 ${
                  isCapturingShortcut
                    ? 'border-[#7FAF8F]/60 text-[#3A2F2A]'
                    : 'border-[rgba(58,47,42,0.08)] text-[#3A2F2A] hover:border-[rgba(58,47,42,0.16)]'
                }`}
                style={{ background: '#E6CFC7' }}
              >
                {isCapturingShortcut
                  ? 'Press your shortcut...'
                  : recordingShortcut ? formatShortcutLabel(recordingShortcut) : 'Click to set shortcut'}
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRecordingShortcut(defaultRecordingShortcut)
                    setShortcutStatus('idle')
                    setShortcutError('')
                    setIsCapturingShortcut(false)
                  }}
                  className="text-xs text-[#8A766E] transition-colors hover:text-[#3A2F2A]"
                >
                  Use default
                </button>
                {isCapturingShortcut && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCapturingShortcut(false)
                      setShortcutStatus('idle')
                      setShortcutError('')
                    }}
                    className="text-xs text-[#8A766E] transition-colors hover:text-[#3A2F2A]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-[#8A766E] leading-snug">
              This shortcut works globally and toggles the overlay recording in other apps. Use Ctrl, Cmd, or Alt with another key.
            </p>
            {shortcutStatus === 'error' && <p className="mt-2 text-xs text-red-700">{shortcutError}</p>}
          </section>

          <section>
            <h3 className="text-xs font-medium text-[#6B5B52] uppercase tracking-[0.08em] mb-3">Transform Prompts</h3>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-[#8A766E] leading-snug">
                VoiceRefine uses built-in prompts for Smart Format and Polish & Organize. If you edit and save these transforms, your prompts will be used when you choose those transform options.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTransformPromptEditorOpen(open => !open)}
                  className="px-3 py-2 rounded-lg text-sm text-[#3A2F2A] border border-[rgba(58,47,42,0.08)] hover:bg-[rgba(58,47,42,0.05)] transition-colors"
                >
                  {transformPromptEditorOpen ? 'Hide transforms' : 'Edit transforms'}
                </button>
                {transformPromptMode === TRANSFORM_PROMPT_MODE_CUSTOM && (
                  <span className="text-xs px-2 py-1 rounded-full bg-[#7FAF8F]/20 text-[#5C8F70] font-medium">
                    Edited
                  </span>
                )}
              </div>
            </div>

            {transformPromptEditorOpen && (
              <div className="mt-4 flex flex-col gap-4">
                <div className="rounded-xl border border-[rgba(127,175,143,0.25)] px-3 py-3 bg-[rgba(127,175,143,0.07)]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-[#4A7A5E] leading-snug">
                      Changes here replace the built-in prompt for that transform after you save Settings.
                    </p>
                    <button
                      type="button"
                      onClick={handleUseBuiltInTransformPrompts}
                      className="text-xs text-[#8A766E] hover:text-[#3A2F2A] transition-colors flex-shrink-0"
                    >
                      Use built-in
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="clarity-prompt" className="text-sm font-medium text-[#3A2F2A]">
                      {TRANSFORM_PRESETS.clarity.label}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleResetTransformPrompt('clarity')}
                      className="text-xs text-[#8A766E] hover:text-[#3A2F2A] transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                  <textarea
                    id="clarity-prompt"
                    value={clarityPrompt}
                    onChange={e => handleTransformPromptChange('clarity', e.target.value)}
                    className="w-full h-40 rounded-xl border border-[rgba(58,47,42,0.08)] px-3 py-3 text-sm text-[#3A2F2A] resize-none outline-none focus:border-[#7FAF8F]/50"
                    style={{ background: '#E6CFC7' }}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="structure-prompt" className="text-sm font-medium text-[#3A2F2A]">
                      {TRANSFORM_PRESETS.structure.label}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleResetTransformPrompt('structure')}
                      className="text-xs text-[#8A766E] hover:text-[#3A2F2A] transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                  <textarea
                    id="structure-prompt"
                    value={structurePrompt}
                    onChange={e => handleTransformPromptChange('structure', e.target.value)}
                    className="w-full h-40 rounded-xl border border-[rgba(58,47,42,0.08)] px-3 py-3 text-sm text-[#3A2F2A] resize-none outline-none focus:border-[#7FAF8F]/50"
                    style={{ background: '#E6CFC7' }}
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="px-6 py-4 border-t border-[rgba(58,47,42,0.08)] flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave || shortcutStatus === 'saving'}
            className="w-full py-2 rounded-xl text-sm font-medium bg-[#7FAF8F] hover:bg-[#6E9E7F] text-[#F4F7F5] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {shortcutStatus === 'saving' ? 'Saving...' : 'Save'}
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
