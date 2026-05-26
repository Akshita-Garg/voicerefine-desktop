export const DEFAULT_MODEL_ID = 'onnx-community/whisper-small.en'
export const HQ_MODEL_ID = 'onnx-community/cohere-transcribe-03-2026-ONNX'

export function currentModelIdFromStorage(storage) {
  return storage?.getItem('voicerefine.useHighQualityTranscription') === 'true'
    ? HQ_MODEL_ID
    : DEFAULT_MODEL_ID
}
