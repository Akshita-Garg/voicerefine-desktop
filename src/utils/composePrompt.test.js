import { describe, expect, it } from 'vitest'
import {
  composeShortcutTransformPrompt,
  composeTransformPrompt,
  DEFAULT_TRANSFORM_PRESET,
  TRANSFORM_PRESETS,
  defaultPromptForPreset,
  normalizeTransformPreset,
} from './composePrompt'

const transcript = 'Hello this is a test transcript'

describe('composeTransformPrompt', () => {
  it('returns an object with system and user string fields', () => {
    const { system, user } = composeTransformPrompt({
      prompt: defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
      transcript,
    })
    expect(typeof system).toBe('string')
    expect(typeof user).toBe('string')
  })

  it('uses a plain Gemma-friendly transcript block', () => {
    const { system, user } = composeTransformPrompt({
      prompt: defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
      transcript,
    })
    expect(system).toBe('')
    expect(user).toContain('Transcript:')
    expect(user).toContain(transcript)
    expect(user).toContain('Final text:')
  })

  it('throws when the transform prompt is empty', () => {
    expect(() => composeTransformPrompt({ prompt: '   ', transcript }))
      .toThrow('Transform prompt is empty.')
  })
})

describe('transform presets', () => {
  it('normalizes unknown presets to the default', () => {
    expect(normalizeTransformPreset('unknown')).toBe(DEFAULT_TRANSFORM_PRESET)
  })

  it('returns a default prompt for every preset', () => {
    for (const preset of Object.keys(TRANSFORM_PRESETS)) {
      expect(defaultPromptForPreset(preset)).toBeTruthy()
    }
  })
})

describe('composeShortcutTransformPrompt', () => {
  it('creates a compact shortcut prompt', () => {
    const full = composeTransformPrompt({
      prompt: defaultPromptForPreset('clarity'),
      transcript,
    })
    const shortcut = composeShortcutTransformPrompt({
      prompt: defaultPromptForPreset('clarity'),
      transcript,
    })

    expect(shortcut.system).toBe('')
    expect(shortcut.user.length).toBeLessThan(full.user.length)
    expect(shortcut.user).toContain(transcript)
    expect(shortcut.user).toContain('Return only the final text.')
  })

  it('throws when the shortcut transform prompt is empty', () => {
    expect(() => composeShortcutTransformPrompt({ prompt: '', transcript }))
      .toThrow('Transform prompt is empty.')
  })
})

describe('transform prompt presets', () => {
  it('keeps smart format focused on faithful formatting', () => {
    const prompt = defaultPromptForPreset('clarity')
    expect(prompt).toContain('Format dictated speech without rewriting the speaker.')
    expect(prompt).toContain('Keep the speaker\'s vocabulary and meaning.')
    expect(prompt).toContain('Output:')
    expect(prompt).toContain('Do not make the language fancier.')
  })

  it('lets polish and organize rewrite and structure when helpful', () => {
    const prompt = defaultPromptForPreset('structure')
    expect(prompt).toContain('Rewrite dictated speech into clear, usable text.')
    expect(prompt).toContain('Improve wording, grammar, and flow.')
    expect(prompt).toContain('Use bullets, numbered steps, or short headings')
    expect(prompt).toContain('Output:')
  })
})
