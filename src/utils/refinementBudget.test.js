import { describe, expect, it } from 'vitest'
import { calculateMaxTokens } from './refinementBudget'

describe('calculateMaxTokens', () => {
  it('uses a minimum budget for short prompts', () => {
    expect(calculateMaxTokens('short prompt')).toBe(96)
  })

  it('scales with input length for medium prompts', () => {
    const words = Array.from({ length: 100 }, () => 'word').join(' ')
    expect(calculateMaxTokens(words)).toBe(150)
  })

  it('caps long prompts', () => {
    const words = Array.from({ length: 1000 }, () => 'word').join(' ')
    expect(calculateMaxTokens(words)).toBe(768)
  })
})
