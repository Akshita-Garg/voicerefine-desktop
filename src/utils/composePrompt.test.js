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
    expect(prompt).toContain('Convert spoken dictation into text the user would have typed.')
    expect(prompt).toContain('Do:')
    expect(prompt).toContain('Do not:')
    expect(prompt).toContain('Use normal prose by default.')
    expect(prompt).toContain('Treat "new paragraph" as a paragraph break instruction')
    expect(prompt).toContain('For spoken lists, put each item on its own bullet.')
    expect(prompt).toContain('Convert obvious spoken technical symbols into typed text')
    expect(prompt).toContain('Preserve questions as questions.')
    expect(prompt).toContain('Summarize the transcript.')
    expect(prompt).toContain('Put only the side comment in parentheses')
    expect(prompt).toContain('Leave "um" or "uh" in the output.')
    expect(prompt).toContain('Rewrite the speaker\'s vocabulary.')
    expect(prompt).toContain('Turn related phrases into bullets unless the speaker clearly asks for a list.')
    expect(prompt).toContain('what kind of changes i can make to the plan')
    expect(prompt).toContain('hi alex um thanks for sending the notes')
    expect(prompt).toContain('make a list first book the room')
    expect(prompt).toContain('numbered list one define the scope')
    expect(prompt).toContain('slash v one slash audio slash transcriptions')
    expect(prompt).toContain('why are users leaving after signup')
    expect(prompt).toContain('new paragraph the second concern is privacy')
    expect(prompt).toContain('send it tomorrow scratch that send it today')
    expect(prompt).toContain('Output:')
  })

  it('lets polish and organize rewrite and structure when helpful', () => {
    const prompt = defaultPromptForPreset('structure')
    expect(prompt).toContain('Turn rough spoken thoughts into clear written text.')
    expect(prompt).toContain('The transcript comes from someone thinking out loud.')
    expect(prompt).toContain('Use bullets, numbered steps, or short headings')
    expect(prompt).toContain('Add facts the speaker did not say.')
    expect(prompt).toContain('Output:')
  })
})
