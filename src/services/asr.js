import {
  decodeAudioBlob,
  isTranscriberLoading as isTransformersTranscriberLoading,
  preloadTranscriber as preloadTransformersTranscriber,
  resetTranscriber as resetTransformersTranscriber,
  transcribe as transcribeWithTransformers,
} from './transcribe';

export const TRANSFORMERS_ASR_ENGINE = 'transformers-webgpu';
export const NATIVE_ASR_ENGINE = 'sherpa-onnx-node';

export function currentAsrEngine() {
  return globalThis.localStorage?.getItem('vr_asr_engine') === NATIVE_ASR_ENGINE
    ? NATIVE_ASR_ENGINE
    : TRANSFORMERS_ASR_ENGINE;
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
  });

  console.log('[asr] native transcription complete', {
    engine: NATIVE_ASR_ENGINE,
    totalMs: Math.round(performance.now() - startedAt),
    chars: result.text.length,
  });

  return result.text;
}
