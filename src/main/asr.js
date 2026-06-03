import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

const NATIVE_MODEL_FAST = 'fast';
const NATIVE_MODEL_ACCURATE = 'accurate';
const NATIVE_MODEL_COHERE_Q4 = 'cohere-q4';
const COHERE_Q4_RUNTIME_CLI = 'cli';
const COHERE_Q4_RUNTIME_SERVER = 'server';
const recognizers = new Map();
const recognizerPromises = new Map();
let crispServer = null;
let crispServerPromise = null;

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

function getCrispAsrServerPort() {
  return Math.max(1, Number(process.env.VOICEREFINE_CRISPASR_PORT || 51234));
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

function normalizeCohereQ4Runtime(runtime) {
  if (runtime === COHERE_Q4_RUNTIME_SERVER) return COHERE_Q4_RUNTIME_SERVER;
  return COHERE_Q4_RUNTIME_CLI;
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

function waitForPort(port, timeoutMs = 60000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`CrispASR server did not become ready on port ${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

async function startCrispAsrServer() {
  if (crispServer?.process && !crispServer.process.killed) return crispServer;
  if (crispServerPromise) return await crispServerPromise;

  crispServerPromise = (async () => {
    const startedAt = now();
    const binPath = getCrispAsrPath();
    const modelPath = getCohereQ4ModelPath();
    const port = getCrispAsrServerPort();

    if (!fs.existsSync(binPath)) throw new Error(`CrispASR binary missing: ${binPath}`);
    if (!fs.existsSync(modelPath)) throw new Error(`Cohere Q4 model missing: ${modelPath}`);

    const child = spawn(binPath, [
      '--server',
      '--backend', 'cohere',
      '--model', modelPath,
      '--language', 'en',
      '--threads', String(Math.max(1, Number(process.env.VOICEREFINE_CRISPASR_THREADS || 8))),
      '--host', '127.0.0.1',
      '--port', String(port),
      '--no-prints',
      '--no-timestamps',
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', chunk => {
      const message = chunk.toString().trim();
      if (message) console.log('[asr-crisp-server]', message);
    });
    child.stderr?.on('data', chunk => {
      const message = chunk.toString().trim();
      if (message) console.warn('[asr-crisp-server]', message);
    });
    child.once('exit', (code, signal) => {
      console.log('[asr-crisp-server] exited', { code, signal });
      if (crispServer?.process === child) crispServer = null;
    });

    crispServer = { process: child, port };
    await waitForPort(port, Number(process.env.VOICEREFINE_CRISPASR_START_TIMEOUT_MS || 60000));

    console.log('[asr-crisp-server] ready', {
      nativeModel: NATIVE_MODEL_COHERE_Q4,
      port,
      durationMs: Math.round(now() - startedAt),
    });

    return crispServer;
  })();

  try {
    return await crispServerPromise;
  } finally {
    crispServerPromise = null;
  }
}

async function stopCrispAsrServer() {
  const server = crispServer;
  crispServer = null;

  if (!server?.process || server.process.killed) return;

  console.log('[asr-crisp-server] stopping');
  server.process.kill();
}

function parseCrispServerResponse(body, contentType) {
  const text = body.trim();
  if (!text) return '';

  if (contentType.includes('application/json') || text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      return (json.text ?? json.transcription ?? json.result ?? text).trim();
    } catch {
      return text;
    }
  }

  return cleanCrispAsrOutput(text);
}

async function postToCrispServer(server, wavBuffer) {
  const endpoints = ['/v1/audio/transcriptions', '/inference'];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const form = new FormData();
      form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'recording.wav');
      form.append('language', 'en');

      const response = await fetch(`http://127.0.0.1:${server.port}${endpoint}`, {
        method: 'POST',
        body: form,
      });
      const body = await response.text();

      if (!response.ok) {
        lastError = new Error(`CrispASR server ${endpoint} failed: ${response.status} ${body}`);
        continue;
      }

      return parseCrispServerResponse(body, response.headers.get('content-type') ?? '');
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('CrispASR server transcription failed.');
}

async function transcribeWithCrispAsrServer(samples, sampleRate) {
  const startedAt = now();
  const wavBuffer = createWavBuffer(samples, sampleRate);

  try {
    const server = await startCrispAsrServer();
    const inferenceStartedAt = now();
    const text = await postToCrispServer(server, wavBuffer);

    console.log('[asr-crisp] transcription complete', {
      engine: 'crispasr-server',
      nativeModel: NATIVE_MODEL_COHERE_Q4,
      runtime: COHERE_Q4_RUNTIME_SERVER,
      audioSeconds: Number((samples.length / sampleRate).toFixed(2)),
      inferenceMs: Math.round(now() - inferenceStartedAt),
      totalMs: Math.round(now() - startedAt),
      chars: text.length,
    });

    return {
      text,
      engine: 'crispasr-server',
      model: NATIVE_MODEL_COHERE_Q4,
      runtime: COHERE_Q4_RUNTIME_SERVER,
    };
  } catch (err) {
    console.warn('[asr-crisp] server transcription failed; falling back to one-shot CLI', err);
    return await transcribeWithCrispAsrCli(samples, sampleRate, startedAt);
  }
}

async function transcribeWithCrispAsrCli(samples, sampleRate, startedAt = now()) {
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
      engine: 'crispasr-cli',
      nativeModel: NATIVE_MODEL_COHERE_Q4,
      runtime: COHERE_Q4_RUNTIME_CLI,
      audioSeconds: Number((samples.length / sampleRate).toFixed(2)),
      inferenceMs: Math.round(now() - inferenceStartedAt),
      totalMs: Math.round(now() - startedAt),
      chars: text.length,
    });

    return {
      text,
      engine: 'crispasr-cli',
      model: NATIVE_MODEL_COHERE_Q4,
      runtime: COHERE_Q4_RUNTIME_CLI,
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function unloadSherpaRecognizer(model) {
  const nativeModel = normalizeNativeModel(model);
  recognizerPromises.delete(nativeModel);
  const recognizer = recognizers.get(nativeModel);
  recognizers.delete(nativeModel);

  if (!recognizer) return false;

  recognizer.dispose?.();
  recognizer.free?.();
  recognizer.close?.();
  if (global.gc) global.gc();

  console.log('[asr-native] recognizer unloaded', { nativeModel });
  return true;
}

export async function unloadNativeAsrModels({ except } = {}) {
  const keepModel = except ? normalizeNativeModel(except) : null;
  const unloaded = [];

  for (const model of Array.from(recognizers.keys())) {
    if (model === keepModel) continue;
    if (await unloadSherpaRecognizer(model)) unloaded.push(model);
  }

  if (keepModel !== NATIVE_MODEL_COHERE_Q4) {
    await stopCrispAsrServer();
  }

  return { unloaded, kept: keepModel };
}

export async function preloadNativeAsrModel({ model, cohereQ4Runtime } = {}) {
  const nativeModel = normalizeNativeModel(model);
  const startedAt = now();

  await unloadNativeAsrModels({ except: nativeModel });

  if (nativeModel === NATIVE_MODEL_COHERE_Q4) {
    const runtime = normalizeCohereQ4Runtime(cohereQ4Runtime);
    if (runtime === COHERE_Q4_RUNTIME_SERVER) {
      await startCrispAsrServer();
    } else {
      await stopCrispAsrServer();
      if (!fs.existsSync(getCrispAsrPath())) throw new Error(`CrispASR binary missing: ${getCrispAsrPath()}`);
      if (!fs.existsSync(getCohereQ4ModelPath())) throw new Error(`Cohere Q4 model missing: ${getCohereQ4ModelPath()}`);
    }
  } else {
    await getRecognizer(nativeModel);
  }

  return {
    model: nativeModel,
    cohereQ4Runtime: nativeModel === NATIVE_MODEL_COHERE_Q4
      ? normalizeCohereQ4Runtime(cohereQ4Runtime)
      : null,
    durationMs: Math.round(now() - startedAt),
    loaded: Array.from(recognizers.keys()),
    crispServerReady: !!crispServer,
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

export async function transcribeNative({ samples, sampleRate, model, cohereQ4Runtime }) {
  const startedAt = now();
  const nativeModel = normalizeNativeModel(model);
  const typedSamples = samples instanceof Float32Array ? samples : new Float32Array(samples);

  if (nativeModel === NATIVE_MODEL_COHERE_Q4) {
    const runtime = normalizeCohereQ4Runtime(cohereQ4Runtime);
    if (runtime === COHERE_Q4_RUNTIME_SERVER) {
      return await transcribeWithCrispAsrServer(typedSamples, sampleRate);
    }

    await stopCrispAsrServer();
    return await transcribeWithCrispAsrCli(typedSamples, sampleRate, startedAt);
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
