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
  it('keeps smart format focused on faithful formatting', () => {
    const prompt = defaultPromptForPreset('clarity')
    expect(prompt).toContain('Preserve the speaker\'s vocabulary, meaning, order, and tone.')
    expect(prompt).toContain('Format clear list intent as bullets or numbered steps')
    expect(prompt).toContain('Put clear side thoughts in parentheses')
    expect(prompt).toContain('Do not rewrite for style')
  })

  it('lets polish and organize rewrite and structure when helpful', () => {
    const prompt = defaultPromptForPreset('structure')
    expect(prompt).toContain('Improve wording, grammar, sentence flow, and readability.')
    expect(prompt).toContain('Group related ideas together')
    expect(prompt).toContain('Use paragraphs, bullets, numbered steps, or short headings')
  })
})
