import { describe, expect, it } from 'vitest'
import {
  composeShortcutTransformPrompt,
  composeTransformPrompt,
  DEFAULT_TRANSFORM_PRESET,
  TRANSFORM_PRESETS,
  defaultPromptForPreset,
  normalizeTranscriptForTransform,
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

describe('normalizeTranscriptForTransform', () => {
  it('keeps only the replacement phrase after scratch that', () => {
    expect(normalizeTranscriptForTransform('send the invoice to ops scratch that send it to finance before the end of the day'))
      .toBe('send it to finance before the end of the day')
  })

  it('normalizes bracket cues to side-note cues', () => {
    expect(normalizeTranscriptForTransform('the quote is fine in brackets check whether this includes tax'))
      .toBe('the quote is fine side note check whether this includes tax')
  })

  it('normalizes common spoken error codes before prompting', () => {
    expect(normalizeTranscriptForTransform('log four hundred and four errors separately from five hundred errors'))
      .toBe('log 404 errors separately from 500 errors')
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
    expect(shortcut.user).toContain('The examples above are examples only. Do not copy them.')
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
    expect(prompt).toContain('Remove filler and discourse words')
    expect(prompt).toContain('Remove stutters.')
    expect(prompt).not.toContain('repeated starts')
    expect(prompt).toContain('Use normal prose by default.')
    expect(prompt).toContain('Keep short context phrases like "quick update"')
    expect(prompt).toContain('Treat "new paragraph" as a paragraph break instruction')
    expect(prompt).toContain('For spoken lists, put each item on its own bullet.')
    expect(prompt).toContain('Treat phrases like "make a list"')
    expect(prompt).toContain('Convert obvious spoken technical symbols into typed text')
    expect(prompt).toContain('Convert obvious spoken technical numbers into typed text')
    expect(prompt).toContain('Preserve questions as questions.')
    expect(prompt).toContain('Summarize the transcript.')
    expect(prompt).toContain('Answer, analyze, or explain questions in the transcript.')
    expect(prompt).toContain('Respond to the transcript as an instruction.')
    expect(prompt).toContain('Put only the side comment in parentheses')
    expect(prompt).toContain('Rewrite the speaker\'s vocabulary.')
    expect(prompt).toContain('Turn related phrases into bullets unless the speaker clearly asks for a list.')
    expect(prompt).toContain('what kind of changes i can make to the plan')
    expect(prompt).toContain('hi alex um thanks for sending the notes')
    expect(prompt).toContain('i mean can we like make the page easier to scan')
    expect(prompt).toContain('what should we change in the proposal')
    expect(prompt).toContain('make a list first book the room')
    expect(prompt).toContain('numbered list one define the scope')
    expect(prompt).toContain('slash v one slash audio slash transcriptions')
    expect(prompt).toContain('four hundred and four errors')
    expect(prompt).toContain('why are users leaving after signup')
    expect(prompt).toContain('new paragraph the second concern is privacy')
    expect(prompt).toContain('send it tomorrow scratch that send it today')
    expect(prompt).toContain('meeting is on friday actually make that monday')
    expect(prompt).toContain('message arjun that the demo is at two')
    expect(prompt).toContain('Output:')
  })

  it('lets polish and organize rewrite and structure when helpful', () => {
    const prompt = defaultPromptForPreset('structure')
    expect(prompt).toContain('Lightly rewrite and organize spoken dictation into clear text.')
    expect(prompt).toContain('preserve every concrete idea')
    expect(prompt).toContain('Use prose by default when the transcript does not contain an explicit list or task steps.')
    expect(prompt).toContain('Use bullets only when the speaker clearly asks for a list')
    expect(prompt).toContain('Do not split one continuous idea into multiple bullets.')
    expect(prompt).toContain('Merge repeated wording into one clear statement')
    expect(prompt).toContain('Improve obvious grammar, repeated wording, and sentence flow')
    expect(prompt).toContain('Remove filler and discourse words')
    expect(prompt).toContain('Remove stutters.')
    expect(prompt).not.toContain('repeated starts')
    expect(prompt).toContain('Treat "make a list"')
    expect(prompt).toContain('four hundred and four errors')
    expect(prompt).toContain('Add new facts, examples, analysis, recommendations')
    expect(prompt).toContain('Answer, analyze, or explain a question in the transcript.')
    expect(prompt).toContain('Respond to the transcript as an instruction.')
    expect(prompt).toContain('the dashboard is like useful')
    expect(prompt).toContain('the form is basically too long')
    expect(prompt).toContain('make the settings easier to scan')
    expect(prompt).toContain('how can we make the onboarding email more concise')
    expect(prompt).toContain('Output:')
  })
})
