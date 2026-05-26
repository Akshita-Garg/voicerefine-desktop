import { describe, expect, it } from 'vitest'
import { cleanRefinementOutput } from './refinementOutput'

describe('cleanRefinementOutput', () => {
  it('trims whitespace without changing content', () => {
    expect(cleanRefinementOutput('  Keep this exactly.  ')).toBe('Keep this exactly.')
  })

  it('removes common assistant labels', () => {
    expect(cleanRefinementOutput('Refined text: Hello there.')).toBe('Hello there.')
    expect(cleanRefinementOutput('Output: Hello there.')).toBe('Hello there.')
    expect(cleanRefinementOutput('Result: Hello there.')).toBe('Hello there.')
  })

  it('removes chatty preambles without rewriting the output', () => {
    expect(cleanRefinementOutput('Here is the cleaned transcript: Hello there.')).toBe('Hello there.')
    expect(cleanRefinementOutput('Here\'s the refined output: Hello there.')).toBe('Hello there.')
  })

  it('does not force bullet formatting', () => {
    expect(cleanRefinementOutput('This is prose. It stays prose.')).toBe('This is prose. It stays prose.')
  })
})
