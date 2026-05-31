import { app } from 'electron';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

let recognizer = null;
let recognizerPromise = null;

function now() {
  return performance.now();
}

function getDefaultModelDir() {
  if (process.env.VOICEREFINE_SHERPA_MODEL_DIR) {
    return process.env.VOICEREFINE_SHERPA_MODEL_DIR;
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'models', 'sherpa-onnx-whisper-tiny.en');
  }

  return path.join(app.getAppPath(), 'resources', 'models', 'sherpa-onnx-whisper-tiny.en');
}

function requireModelFile(modelDir, filename) {
  const filePath = path.join(modelDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sherpa ASR model file missing: ${filePath}`);
  }
  return filePath;
}

function createWhisperTinyEnglishConfig(modelDir) {
  return {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      whisper: {
        encoder: requireModelFile(modelDir, 'tiny.en-encoder.onnx'),
        decoder: requireModelFile(modelDir, 'tiny.en-decoder.onnx'),
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

async function getRecognizer() {
  if (recognizer) return recognizer;
  if (recognizerPromise) return await recognizerPromise;

  recognizerPromise = (async () => {
    const startedAt = now();
    const modelDir = getDefaultModelDir();
    const sherpa = require('sherpa-onnx-node');
    const nextRecognizer = await sherpa.OfflineRecognizer.createAsync(
      createWhisperTinyEnglishConfig(modelDir),
    );

    console.log('[asr-native] recognizer ready', {
      engine: 'sherpa-onnx-node',
      modelDir,
      durationMs: Math.round(now() - startedAt),
    });

    recognizer = nextRecognizer;
    return recognizer;
  })();

  try {
    return await recognizerPromise;
  } finally {
    recognizerPromise = null;
  }
}

export async function transcribeNative({ samples, sampleRate }) {
  const startedAt = now();
  const typedSamples = samples instanceof Float32Array ? samples : new Float32Array(samples);
  const currentRecognizer = await getRecognizer();
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
    audioSeconds: Number((typedSamples.length / sampleRate).toFixed(2)),
    modelWaitMs: Math.round(inferenceStartedAt - startedAt),
    inferenceMs: Math.round(now() - inferenceStartedAt),
    totalMs: Math.round(now() - startedAt),
    chars: text.length,
  });

  return {
    text,
    engine: 'sherpa-onnx-node',
  };
}
