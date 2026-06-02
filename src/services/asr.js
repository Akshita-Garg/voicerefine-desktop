export const NATIVE_ASR_ENGINE = 'sherpa-onnx-node';
export const NATIVE_ASR_MODEL_FAST = 'fast';
export const NATIVE_ASR_MODEL_ACCURATE = 'accurate';
export const NATIVE_ASR_MODEL_COHERE_Q4 = 'cohere-q4';

export function currentNativeAsrModel() {
  const stored = globalThis.localStorage?.getItem('vr_native_asr_model');
  if (stored === NATIVE_ASR_MODEL_ACCURATE) return NATIVE_ASR_MODEL_ACCURATE;
  if (stored === NATIVE_ASR_MODEL_COHERE_Q4) return NATIVE_ASR_MODEL_COHERE_Q4;
  return NATIVE_ASR_MODEL_FAST;
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
  });

  console.log('[asr] native transcription complete', {
    engine: NATIVE_ASR_ENGINE,
    model: result.model,
    totalMs: Math.round(performance.now() - startedAt),
    chars: result.text.length,
  });

  return result.text;
}
