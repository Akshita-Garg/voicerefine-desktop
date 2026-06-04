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

  it('places the transcript inside triple-quote delimiters', () => {
    const { user } = composeTransformPrompt({
      prompt: defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
      transcript,
    })
    expect(user).toContain('"""')
    expect(user).toContain(transcript)
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

    expect(shortcut.system.length).toBeLessThan(full.system.length)
    expect(shortcut.user.length).toBeLessThan(full.user.length)
    expect(shortcut.user).toContain(transcript)
    expect(shortcut.user).toContain('Return only the output.')
  })

  it('throws when the shortcut transform prompt is empty', () => {
    expect(() => composeShortcutTransformPrompt({ prompt: '', transcript }))
      .toThrow('Transform prompt is empty.')
  })
})

describe('transform prompt presets', () => {
  it('keeps clarity focused on prose only', () => {
    const prompt = defaultPromptForPreset('clarity')
    expect(prompt).toContain('Output prose only.')
    expect(prompt).toContain('Do not use bullets, headings, or sections.')
  })

  it('lets structure choose paragraphs, bullets, or sections when helpful', () => {
    const prompt = defaultPromptForPreset('structure')
    expect(prompt).toContain('paragraphs, bullets, or short sections')
    expect(prompt).toContain('Use bullets or headings only when they genuinely help readability.')
  })
})
