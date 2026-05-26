import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL_ID, HQ_MODEL_ID, currentModelIdFromStorage } from './transcriptionModel'

function storage(values = {}) {
  return {
    getItem(key) {
      return values[key] ?? null
    },
  }
}

describe('transcriptionModel', () => {
  it('uses the lightweight model by default', () => {
    expect(currentModelIdFromStorage(storage())).toBe(DEFAULT_MODEL_ID)
  })

  it('uses the high-accuracy model when enabled', () => {
    expect(currentModelIdFromStorage(storage({ 'voicerefine.useHighQualityTranscription': 'true' })))
      .toBe(HQ_MODEL_ID)
  })

  it('treats non-true values as lightweight', () => {
    expect(currentModelIdFromStorage(storage({ 'voicerefine.useHighQualityTranscription': 'false' })))
      .toBe(DEFAULT_MODEL_ID)
  })
})
