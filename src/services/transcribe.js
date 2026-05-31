import { pipeline, env } from '@huggingface/transformers';
import { DEFAULT_MODEL_ID, HQ_MODEL_ID, currentModelIdFromStorage } from '../utils/transcriptionModel';

env.allowLocalModels = false;

const INFERENCE_PARAMS = {
  [DEFAULT_MODEL_ID]: {
    max_new_tokens: 256,
    chunk_length_s: 30,
    stride_length_s: 5,
  },
  [HQ_MODEL_ID]: {
    max_new_tokens: 1024,
    language: 'en',
  },
}

function currentModelId() {
  return currentModelIdFromStorage(globalThis.localStorage);
}

let transcriberPromise = null;
let transcriberReady   = false;
let progressHandler    = null;
let loadedModelId      = null;

function now() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

function logAsrLatency(event, details = {}) {
  console.log(`[asr] ${event}`, {
    engine: 'transformers-webgpu',
    ...details,
  });
}

function getTranscriber() {
  const modelId = currentModelId();
  if (!transcriberPromise || loadedModelId !== modelId) {
    const startedAt = now();
    transcriberReady   = false;
    loadedModelId      = modelId;
    logAsrLatency('model load started', { modelId });
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      modelId,
      {
        dtype: 'q4',
        device: 'webgpu',
        progress_callback: (info) => {
          if (info.status === 'progress' && progressHandler) {
            progressHandler({ file: info.file, loaded: info.loaded ?? 0, total: info.total ?? 0 });
          }
        },
      }
    ).then(t => {
      transcriberReady = true;
      logAsrLatency('model load complete', {
        modelId,
        durationMs: Math.round(now() - startedAt),
      });
      return t;
    });
  }
  return transcriberPromise;
}

async function blobToAudioSamples(blob) {
  const startedAt = now();
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer  = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();
  logAsrLatency('audio decoded', {
    bytes: blob.size,
    mimeType: blob.type,
    durationMs: Math.round(now() - startedAt),
    audioSeconds: Number(audioBuffer.duration.toFixed(2)),
    sampleRate: audioBuffer.sampleRate,
  });
  return audioBuffer.getChannelData(0);
}

export async function transcribe(blob) {
  const startedAt = now();
  const modelId = currentModelId();
  logAsrLatency('transcription started', {
    modelId,
    bytes: blob.size,
    mimeType: blob.type,
  });

  const audioStartedAt = now();
  const audio = await blobToAudioSamples(blob);
  const audioDecodeMs = Math.round(now() - audioStartedAt);

  const modelStartedAt = now();
  const transcriber = await getTranscriber();
  const modelWaitMs = Math.round(now() - modelStartedAt);

  const inferenceStartedAt = now();
  const result = await transcriber(audio, INFERENCE_PARAMS[modelId]);
  const inferenceMs = Math.round(now() - inferenceStartedAt);
  const totalMs = Math.round(now() - startedAt);

  logAsrLatency('transcription complete', {
    modelId,
    audioDecodeMs,
    modelWaitMs,
    inferenceMs,
    totalMs,
    chars: result.text.trim().length,
  });

  return result.text.trim();
}

export function resetTranscriber() {
  transcriberPromise = null;
  transcriberReady   = false;
  progressHandler    = null;
  loadedModelId      = null;
}

export function preloadTranscriber(onProgress) {
  if (onProgress) progressHandler = onProgress;
  return getTranscriber();
}

export function isTranscriberLoading() {
  return transcriberPromise !== null && !transcriberReady;
}
