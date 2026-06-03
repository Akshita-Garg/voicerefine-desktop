import { describe, it, expect } from 'vitest'
import { composePrompt, composeShortcutPrompt, INTENT_BLOCKS, MODE_BLOCKS } from './composePrompt'

const base = {
  intent: 'clean',
  mode: 'light',
  transcript: 'Hello this is a test transcript',
}

describe('composePrompt', () => {
  it('returns an object with system and user string fields', () => {
    const { system, user } = composePrompt(base)
    expect(typeof system).toBe('string')
    expect(typeof user).toBe('string')
  })

  it('places the transcript inside triple-quote delimiters in the user message', () => {
    const { user } = composePrompt(base)
    expect(user).toContain('"""')
    expect(user).toContain(base.transcript)
  })

  it('keeps the system prompt intentionally small for Gemma', () => {
    const { system } = composePrompt(base)
    expect(system).toBe('You are VoiceRefine. Refine voice transcripts. Return only the requested output.')
  })

  it('puts the task contract in the user message', () => {
    const { system, user } = composePrompt(base)
    expect(system.length).toBeLessThan(user.length)
    expect(user).toContain('Task: Refine a voice transcript.')
    expect(user).toContain('Return only the refined output. No preamble. No explanation. No label.')
    expect(user.trim()).toMatch(/Refined output:$/)
  })

  it('makes clean intent a minimal-edit vocabulary-preserving task', () => {
    const { user } = composePrompt(base)
    expect(user).toContain('Minimal edit only.')
    expect(user).toContain("Keep the speaker's vocabulary")
    expect(user).toContain('Do not replace words with synonyms.')
  })

  it('makes bullet mode explicit without post-processing assumptions', () => {
    const { user } = composePrompt({ ...base, mode: 'bullets' })
    expect(user).toContain('Output bullets only.')
    expect(user).toContain('Start every bullet with "- ".')
    expect(user).toContain('Do not add a summary, title, introduction, conclusion, or prose outside the bullets.')
  })

  it('substitutes the correct intent block for every valid intent', () => {
    for (const intent of Object.keys(INTENT_BLOCKS)) {
      const { user } = composePrompt({ ...base, intent })
      expect(user).toContain(INTENT_BLOCKS[intent])
    }
  })

  it('substitutes the correct mode block for every valid mode', () => {
    for (const mode of Object.keys(MODE_BLOCKS)) {
      const { user } = composePrompt({ ...base, mode })
      expect(user).toContain(MODE_BLOCKS[mode])
    }
  })

  it('throws on an unknown intent', () => {
    expect(() => composePrompt({ ...base, intent: 'unknown' }))
      .toThrow('Unknown intent: "unknown"')
  })

  it('throws on an unknown mode', () => {
    expect(() => composePrompt({ ...base, mode: 'unknown' }))
      .toThrow('Unknown mode: "unknown"')
  })

  it('creates a compact shortcut prompt for low-latency overlay refinement', () => {
    const full = composePrompt(base)
    const shortcut = composeShortcutPrompt(base)

    expect(shortcut.system.length).toBeLessThan(full.system.length)
    expect(shortcut.user.length).toBeLessThan(full.user.length * 0.5)
    expect(shortcut.user).toContain('Intent: CLEAN')
    expect(shortcut.user).toContain('do not summarize or compress')
    expect(shortcut.user).toContain('Keep the same vocabulary')
    expect(shortcut.user).toContain('Do not replace words with smarter synonyms.')
    expect(shortcut.user).toContain('Mode: prose only')
    expect(shortcut.user).toContain('Keep roughly the same length.')
    expect(shortcut.user).toContain(base.transcript)
  })

  it('keeps shortcut bullet mode explicit', () => {
    const { user } = composeShortcutPrompt({ ...base, mode: 'bullets' })
    expect(user).toContain('Every line starts "- ".')
    expect(user).toContain('No intro/title/conclusion.')
  })
})
