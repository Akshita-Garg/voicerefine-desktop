import { app } from 'electron';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

const NATIVE_MODEL_FAST = 'fast';
const NATIVE_MODEL_ACCURATE = 'accurate';
const recognizers = new Map();
const recognizerPromises = new Map();

function now() {
  return performance.now();
}

function getModelRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'models');
  return path.join(app.getAppPath(), 'resources', 'models');
}

function getWhisperModelDir() {
  if (process.env.VOICEREFINE_SHERPA_MODEL_DIR) {
    return process.env.VOICEREFINE_SHERPA_MODEL_DIR;
  }

  return path.join(getModelRoot(), 'sherpa-onnx-whisper-tiny.en');
}

function getCohereModelDir() {
  if (process.env.VOICEREFINE_SHERPA_COHERE_MODEL_DIR) {
    return process.env.VOICEREFINE_SHERPA_COHERE_MODEL_DIR;
  }

  return path.join(getModelRoot(), 'sherpa-onnx-cohere-transcribe-14-lang-int8-2026-04-01');
}

function requireModelFile(modelDir, filenameOrFilenames) {
  const filenames = Array.isArray(filenameOrFilenames) ? filenameOrFilenames : [filenameOrFilenames];
  for (const filename of filenames) {
    const filePath = path.join(modelDir, filename);
    if (fs.existsSync(filePath)) return filePath;
  }

  const filename = filenames.join(' or ');
  const filePath = path.join(modelDir, filename);
  throw new Error(`Sherpa ASR model file missing: ${filePath}`);
}

function createWhisperTinyEnglishConfig(modelDir) {
  const precision = process.env.VOICEREFINE_SHERPA_PRECISION === 'fp32' ? 'fp32' : 'int8';
  const modelSuffix = precision === 'int8' ? '.int8' : '';

  return {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      whisper: {
        encoder: requireModelFile(modelDir, `tiny.en-encoder${modelSuffix}.onnx`),
        decoder: requireModelFile(modelDir, `tiny.en-decoder${modelSuffix}.onnx`),
        language: 'en',
        task: 'transcribe',
        tailPaddings: -1,
      },
      tokens: requireModelFile(modelDir, 'tiny.en-tokens.txt'),
      numThreads: Math.max(1, Number(process.env.VOICEREFINE_SHERPA_THREADS || 4)),
      debug: false,
      provider: 'cpu',
    },
  };
}

function createCohereTranscribeConfig(modelDir) {
  return {
    featConfig: {
      sampleRate: 16000,
      featureDim: 128,
    },
    modelConfig: {
      cohereTranscribe: {
        encoder: requireModelFile(modelDir, ['encoder.int8.onnx', 'cohere-encoder.int8.onnx']),
        decoder: requireModelFile(modelDir, ['decoder.int8.onnx', 'cohere-decoder.int8.onnx']),
        language: 'en',
        usePunct: 1,
        useItn: 1,
      },
      tokens: requireModelFile(modelDir, 'tokens.txt'),
      numThreads: Math.max(1, Number(process.env.VOICEREFINE_SHERPA_THREADS || 4)),
      debug: false,
      provider: 'cpu',
    },
  };
}

function normalizeNativeModel(model) {
  return model === NATIVE_MODEL_ACCURATE ? NATIVE_MODEL_ACCURATE : NATIVE_MODEL_FAST;
}

function getModelConfig(model) {
  if (model === NATIVE_MODEL_ACCURATE) {
    return {
      label: 'cohere-transcribe-int8',
      modelDir: getCohereModelDir(),
      config: createCohereTranscribeConfig,
    };
  }

  return {
    label: 'whisper-tiny-en-int8',
    modelDir: getWhisperModelDir(),
    config: createWhisperTinyEnglishConfig,
  };
}

async function getRecognizer(model) {
  const nativeModel = normalizeNativeModel(model);
  if (recognizers.has(nativeModel)) return recognizers.get(nativeModel);
  if (recognizerPromises.has(nativeModel)) return await recognizerPromises.get(nativeModel);

  const promise = (async () => {
    const startedAt = now();
    const modelConfig = getModelConfig(nativeModel);
    const sherpa = require('sherpa-onnx-node');
    const nextRecognizer = await sherpa.OfflineRecognizer.createAsync(
      modelConfig.config(modelConfig.modelDir),
    );

    console.log('[asr-native] recognizer ready', {
      engine: 'sherpa-onnx-node',
      nativeModel,
      model: modelConfig.label,
      modelDir: modelConfig.modelDir,
      precision: nativeModel === NATIVE_MODEL_ACCURATE
        ? 'int8'
        : process.env.VOICEREFINE_SHERPA_PRECISION === 'fp32' ? 'fp32' : 'int8',
      durationMs: Math.round(now() - startedAt),
    });

    recognizers.set(nativeModel, nextRecognizer);
    return nextRecognizer;
  })();

  recognizerPromises.set(nativeModel, promise);

  try {
    return await promise;
  } finally {
    recognizerPromises.delete(nativeModel);
  }
}

export async function transcribeNative({ samples, sampleRate, model }) {
  const startedAt = now();
  const nativeModel = normalizeNativeModel(model);
  const typedSamples = samples instanceof Float32Array ? samples : new Float32Array(samples);
  const currentRecognizer = await getRecognizer(nativeModel);
  const stream = currentRecognizer.createStream();

  stream.acceptWaveform({
    samples: typedSamples,
    sampleRate,
  });

  const inferenceStartedAt = now();
  const result = await currentRecognizer.decodeAsync(stream);
  const text = (result?.text ?? '').trim();

  console.log('[asr-native] transcription complete', {
    engine: 'sherpa-onnx-node',
    nativeModel,
    audioSeconds: Number((typedSamples.length / sampleRate).toFixed(2)),
    modelWaitMs: Math.round(inferenceStartedAt - startedAt),
    inferenceMs: Math.round(now() - inferenceStartedAt),
    totalMs: Math.round(now() - startedAt),
    chars: text.length,
  });

  return {
    text,
    engine: 'sherpa-onnx-node',
    model: nativeModel,
  };
}
