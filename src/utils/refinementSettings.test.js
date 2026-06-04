import { describe, expect, it } from 'vitest'
import {
  REFINEMENT_MODE_CLEAN,
  REFINEMENT_MODE_TRANSFORM,
  normalizeRefinementMode,
  readRefinementMode,
  readTransformPreset,
  readTransformPrompt,
} from './refinementSettings'

function storage(values = {}) {
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
    },
  }
}

describe('refinementSettings', () => {
  it('normalizes unknown refinement modes to clean', () => {
    expect(normalizeRefinementMode('unknown')).toBe(REFINEMENT_MODE_CLEAN)
    expect(normalizeRefinementMode(REFINEMENT_MODE_TRANSFORM)).toBe(REFINEMENT_MODE_TRANSFORM)
  })

  it('reads the stored refinement mode', () => {
    expect(readRefinementMode(storage({ vr_refinement_mode: REFINEMENT_MODE_TRANSFORM }))).toBe(REFINEMENT_MODE_TRANSFORM)
    expect(readRefinementMode(storage())).toBe(REFINEMENT_MODE_CLEAN)
  })

  it('reads the stored transform preset with fallback', () => {
    expect(readTransformPreset(storage({ vr_transform_preset: 'clarity' }))).toBe('clarity')
    expect(readTransformPreset(storage({ vr_transform_preset: 'nope' }))).toBe('clarity')
  })

  it('reads the stored transform prompt with preset fallback', () => {
    expect(readTransformPrompt(storage({ vr_transform_prompt: 'Custom prompt' }))).toBe('Custom prompt')
    expect(readTransformPrompt(storage())).toContain('Rewrite this transcript for clarity.')
  })
})
