import {
  decodeAudioBlob,
  isTranscriberLoading as isTransformersTranscriberLoading,
  preloadTranscriber as preloadTransformersTranscriber,
  resetTranscriber as resetTransformersTranscriber,
  transcribe as transcribeWithTransformers,
} from './transcribe';

export const TRANSFORMERS_ASR_ENGINE = 'transformers-webgpu';
export const NATIVE_ASR_ENGINE = 'sherpa-onnx-node';
export const NATIVE_ASR_MODEL_FAST = 'fast';
export const NATIVE_ASR_MODEL_ACCURATE = 'accurate';
export const NATIVE_ASR_MODEL_COHERE_Q4 = 'cohere-q4';

export function currentAsrEngine() {
  return globalThis.localStorage?.getItem('vr_asr_engine') === TRANSFORMERS_ASR_ENGINE
    ? TRANSFORMERS_ASR_ENGINE
    : NATIVE_ASR_ENGINE;
}

export function currentNativeAsrModel() {
  const stored = globalThis.localStorage?.getItem('vr_native_asr_model');
  if (stored === NATIVE_ASR_MODEL_ACCURATE) return NATIVE_ASR_MODEL_ACCURATE;
  if (stored === NATIVE_ASR_MODEL_COHERE_Q4) return NATIVE_ASR_MODEL_COHERE_Q4;
  return NATIVE_ASR_MODEL_FAST;
}

export function resetTranscriber() {
  resetTransformersTranscriber();
}

export function preloadTranscriber(onProgress) {
  if (currentAsrEngine() === NATIVE_ASR_ENGINE) {
    return Promise.resolve({ engine: NATIVE_ASR_ENGINE });
  }

  return preloadTransformersTranscriber(onProgress);
}

export function isTranscriberLoading() {
  return currentAsrEngine() === TRANSFORMERS_ASR_ENGINE && isTransformersTranscriberLoading();
}

export async function transcribe(blob) {
  if (currentAsrEngine() !== NATIVE_ASR_ENGINE) {
    return await transcribeWithTransformers(blob);
  }

  if (!window.voicerefine?.transcribeNative) {
    throw new Error('Native ASR bridge is unavailable.');
  }

  const startedAt = performance.now();
  const audio = await decodeAudioBlob(blob);
  const result = await window.voicerefine.transcribeNative({
    samples: audio.samples,
    sampleRate: audio.sampleRate,
    model: currentNativeAsrModel(),
  });

  console.log('[asr] native transcription complete', {
    engine: NATIVE_ASR_ENGINE,
    model: result.model,
    totalMs: Math.round(performance.now() - startedAt),
    chars: result.text.length,
  });

  return result.text;
}
