import { describe, expect, it } from 'vitest'
import {
  REFINEMENT_MODE_CLEAN,
  REFINEMENT_MODE_TRANSFORM,
  TRANSFORM_PROMPT_MODE_CUSTOM,
  TRANSFORM_PROMPT_MODE_PRESET,
  normalizeRefinementMode,
  normalizeTransformPromptMode,
  promptStorageKeyForPreset,
  readRefinementMode,
  readTransformPreset,
  readTransformPrompt,
  readTransformPromptForPreset,
  readTransformPromptMode,
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
    expect(readTransformPrompt(storage())).toContain('Smart-format this voice transcript.')
  })

  it('keeps built-in prompts unless custom prompt mode is enabled', () => {
    expect(readTransformPrompt(storage({
      vr_transform_prompt_mode: TRANSFORM_PROMPT_MODE_PRESET,
      [promptStorageKeyForPreset('clarity')]: 'Custom clarity prompt',
    }))).toContain('Smart-format this voice transcript.')
  })

  it('reads the custom prompt for the selected transform preset', () => {
    const customStorage = storage({
      vr_transform_prompt_mode: TRANSFORM_PROMPT_MODE_CUSTOM,
      vr_transform_preset: 'structure',
      [promptStorageKeyForPreset('clarity')]: 'Custom clarity prompt',
      [promptStorageKeyForPreset('structure')]: 'Custom structure prompt',
    })

    expect(readTransformPrompt(customStorage)).toBe('Custom structure prompt')
    expect(readTransformPromptForPreset('clarity', customStorage)).toBe('Custom clarity prompt')
  })

  it('normalizes transform prompt mode', () => {
    expect(normalizeTransformPromptMode(TRANSFORM_PROMPT_MODE_CUSTOM)).toBe(TRANSFORM_PROMPT_MODE_CUSTOM)
    expect(normalizeTransformPromptMode('unknown')).toBe(TRANSFORM_PROMPT_MODE_PRESET)
    expect(readTransformPromptMode(storage({ vr_transform_prompt_mode: TRANSFORM_PROMPT_MODE_CUSTOM }))).toBe(TRANSFORM_PROMPT_MODE_CUSTOM)
  })
})
