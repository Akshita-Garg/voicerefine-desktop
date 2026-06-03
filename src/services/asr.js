export const NATIVE_ASR_ENGINE = 'sherpa-onnx-node';
export const NATIVE_ASR_MODEL_FAST = 'fast';
export const NATIVE_ASR_MODEL_ACCURATE = 'accurate';
export const NATIVE_ASR_MODEL_COHERE_Q4 = 'cohere-q4';
export const COHERE_Q4_RUNTIME_CLI = 'cli';
export const COHERE_Q4_RUNTIME_SERVER = 'server';

export function currentNativeAsrModel() {
  const stored = globalThis.localStorage?.getItem('vr_native_asr_model');
  if (stored === NATIVE_ASR_MODEL_ACCURATE) return NATIVE_ASR_MODEL_ACCURATE;
  if (stored === NATIVE_ASR_MODEL_COHERE_Q4) return NATIVE_ASR_MODEL_COHERE_Q4;
  return NATIVE_ASR_MODEL_FAST;
}

export function currentCohereQ4Runtime() {
  return globalThis.localStorage?.getItem('vr_cohere_q4_runtime') === COHERE_Q4_RUNTIME_SERVER
    ? COHERE_Q4_RUNTIME_SERVER
    : COHERE_Q4_RUNTIME_CLI;
}

export async function preloadNativeAsrModel(model = currentNativeAsrModel()) {
  if (!window.voicerefine?.preloadNativeAsrModel) {
    throw new Error('Native ASR preload bridge is unavailable.');
  }

  const startedAt = performance.now();
  const result = await window.voicerefine.preloadNativeAsrModel({
    model,
    cohereQ4Runtime: currentCohereQ4Runtime(),
  });
  console.log('[asr] native model preload complete', {
    model: result.model,
    cohereQ4Runtime: currentCohereQ4Runtime(),
    totalMs: Math.round(performance.now() - startedAt),
  });
  return result;
}

export async function unloadNativeAsrModels(except = null) {
  if (!window.voicerefine?.unloadNativeAsrModels) {
    throw new Error('Native ASR unload bridge is unavailable.');
  }

  return await window.voicerefine.unloadNativeAsrModels({ except });
}

function now() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

async function decodeAudioBlob(blob) {
  const startedAt = now();
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  console.log('[asr] audio decoded', {
    engine: NATIVE_ASR_ENGINE,
    bytes: blob.size,
    mimeType: blob.type,
    durationMs: Math.round(now() - startedAt),
    audioSeconds: Number(audioBuffer.duration.toFixed(2)),
    sampleRate: audioBuffer.sampleRate,
  });

  return {
    samples: audioBuffer.getChannelData(0),
    sampleRate: audioBuffer.sampleRate,
  };
}

export async function transcribe(blob) {
  if (!window.voicerefine?.transcribeNative) {
    throw new Error('Native ASR bridge is unavailable.');
  }

  const startedAt = performance.now();
  const audio = await decodeAudioBlob(blob);
  const result = await window.voicerefine.transcribeNative({
    samples: audio.samples,
    sampleRate: audio.sampleRate,
    model: currentNativeAsrModel(),
    cohereQ4Runtime: currentCohereQ4Runtime(),
  });

  console.log('[asr] native transcription complete', {
    engine: NATIVE_ASR_ENGINE,
    model: result.model,
    cohereQ4Runtime: currentCohereQ4Runtime(),
    totalMs: Math.round(performance.now() - startedAt),
    chars: result.text.length,
  });

  return result.text;
}
