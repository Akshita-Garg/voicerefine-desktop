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

function getTranscriber() {
  const modelId = currentModelId();
  if (!transcriberPromise || loadedModelId !== modelId) {
    transcriberReady   = false;
    loadedModelId      = modelId;
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
    ).then(t => { transcriberReady = true; return t; });
  }
  return transcriberPromise;
}

async function blobToAudioSamples(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer  = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();
  return audioBuffer.getChannelData(0);
}

export async function transcribe(blob) {
  const modelId     = currentModelId();
  const audio       = await blobToAudioSamples(blob);
  const transcriber = await getTranscriber();
  const result      = await transcriber(audio, INFERENCE_PARAMS[modelId]);
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
