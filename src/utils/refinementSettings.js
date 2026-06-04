import { DEFAULT_TRANSFORM_PRESET, defaultPromptForPreset, normalizeTransformPreset } from './composePrompt'

export const REFINEMENT_MODE_CLEAN = 'clean'
export const REFINEMENT_MODE_TRANSFORM = 'transform'

export function normalizeRefinementMode(value) {
  return value === REFINEMENT_MODE_TRANSFORM ? REFINEMENT_MODE_TRANSFORM : REFINEMENT_MODE_CLEAN
}

export function readRefinementMode(storage = globalThis.localStorage) {
  return normalizeRefinementMode(storage?.getItem('vr_refinement_mode'))
}

export function readTransformPreset(storage = globalThis.localStorage) {
  return normalizeTransformPreset(storage?.getItem('vr_transform_preset') ?? DEFAULT_TRANSFORM_PRESET)
}

export function readTransformPrompt(storage = globalThis.localStorage) {
  const preset = readTransformPreset(storage)
  const stored = storage?.getItem('vr_transform_prompt')?.trim()
  return stored || defaultPromptForPreset(preset)
}
