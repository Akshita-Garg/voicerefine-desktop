import { describe, expect, it } from 'vitest'
import { cleanRefinementOutput, cleanSpeechArtifacts } from './refinementOutput'

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

describe('cleanSpeechArtifacts', () => {
  it('removes standalone filler sounds without rewriting other words', () => {
    expect(cleanSpeechArtifacts('Gemma is using way too much um latency right now.'))
      .toBe('Gemma is using way too much latency right now.')
    expect(cleanSpeechArtifacts('I think uh using the main window is fine.'))
      .toBe('I think using the main window is fine.')
  })

  it('cleans filler punctuation and spacing', () => {
    expect(cleanSpeechArtifacts('Um, this is still the same sentence.'))
      .toBe('this is still the same sentence.')
    expect(cleanSpeechArtifacts('This is uh,  still okay.'))
      .toBe('This is still okay.')
  })
})
