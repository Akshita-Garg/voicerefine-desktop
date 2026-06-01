import { app } from 'electron';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

const NATIVE_MODEL_FAST = 'fast';
const NATIVE_MODEL_ACCURATE = 'accurate';
const NATIVE_MODEL_COHERE_Q4 = 'cohere-q4';
const recognizers = new Map();
const recognizerPromises = new Map();

function now() {
  return performance.now();
}

function getModelRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'models');
  return path.join(app.getAppPath(), 'resources', 'models');
}

function getBinRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'bin');
  return path.join(app.getAppPath(), 'resources', 'bin');
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

function getCohereQ4ModelPath() {
  if (process.env.VOICEREFINE_CRISPASR_COHERE_MODEL) {
    return process.env.VOICEREFINE_CRISPASR_COHERE_MODEL;
  }

  return path.join(getModelRoot(), 'cohere-transcribe-03-2026-GGUF', 'cohere-transcribe-q4_k.gguf');
}

function getCrispAsrPath() {
  if (process.env.VOICEREFINE_CRISPASR_BIN) {
    return process.env.VOICEREFINE_CRISPASR_BIN;
  }

  const exeName = process.platform === 'win32' ? 'crispasr.exe' : 'crispasr';
  if (process.platform === 'win32') {
    return path.join(
      getBinRoot(),
      'crispasr-windows-x86_64-cpu',
      'crispasr-windows-x86_64-cpu',
      exeName,
    );
  }

  return path.join(getBinRoot(), 'crispasr', exeName);
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
  if (model === NATIVE_MODEL_ACCURATE) return NATIVE_MODEL_ACCURATE;
  if (model === NATIVE_MODEL_COHERE_Q4) return NATIVE_MODEL_COHERE_Q4;
  return NATIVE_MODEL_FAST;
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

function createWavBuffer(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(8 * bytesPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + index * bytesPerSample);
  }

  return buffer;
}

function cleanCrispAsrOutput(stdout) {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function transcribeWithCrispAsr(samples, sampleRate) {
  const startedAt = now();
  const binPath = getCrispAsrPath();
  const modelPath = getCohereQ4ModelPath();

  if (!fs.existsSync(binPath)) throw new Error(`CrispASR binary missing: ${binPath}`);
  if (!fs.existsSync(modelPath)) throw new Error(`Cohere Q4 model missing: ${modelPath}`);

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voicerefine-asr-'));
  const wavPath = path.join(tempDir, 'recording.wav');

  try {
    await fs.promises.writeFile(wavPath, createWavBuffer(samples, sampleRate));
    const inferenceStartedAt = now();
    const { stdout, stderr } = await execFileAsync(binPath, [
      '--backend', 'cohere',
      '--model', modelPath,
      '--file', wavPath,
      '--language', 'en',
      '--threads', String(Math.max(1, Number(process.env.VOICEREFINE_CRISPASR_THREADS || 8))),
      '--no-prints',
      '--no-timestamps',
    ], {
      windowsHide: true,
      timeout: Number(process.env.VOICEREFINE_CRISPASR_TIMEOUT_MS || 180000),
      maxBuffer: 2 * 1024 * 1024,
    });

    const text = cleanCrispAsrOutput(stdout);
    if (!text && stderr) console.warn('[asr-crisp] empty stdout', stderr.trim());

    console.log('[asr-crisp] transcription complete', {
      engine: 'crispasr',
      nativeModel: NATIVE_MODEL_COHERE_Q4,
      audioSeconds: Number((samples.length / sampleRate).toFixed(2)),
      inferenceMs: Math.round(now() - inferenceStartedAt),
      totalMs: Math.round(now() - startedAt),
      chars: text.length,
    });

    return {
      text,
      engine: 'crispasr',
      model: NATIVE_MODEL_COHERE_Q4,
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
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

  if (nativeModel === NATIVE_MODEL_COHERE_Q4) {
    return await transcribeWithCrispAsr(typedSamples, sampleRate);
  }

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
