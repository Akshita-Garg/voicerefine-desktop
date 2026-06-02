import { app } from 'electron';
import path from 'node:path';
import { calculateMaxTokens } from '../utils/refinementBudget.js';

// node-llama-cpp is ESM-only (top-level await), so we import it dynamically.
// The model, context, and sequence stay warm between refinements, then unload
// after an idle window. This avoids paying context creation cost on every click.

let llama = null;
let model = null;
let context = null;
let sequence = null;
let modelLoadPromise = null;
let contextLoadPromise = null;
let unloadTimer = null;
let activeRefinements = 0;
let refinementQueue = Promise.resolve();
let activeGpuMode = null;

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

function now() {
  return performance.now();
}

function getModelPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'models', 'gemma-3-1b-it-Q4_K_M.gguf');
  }
  return path.join(app.getAppPath(), 'resources', 'models', 'gemma-3-1b-it-Q4_K_M.gguf');
}

function getGpuMode() {
  const configured = process.env.VOICEREFINE_LLAMA_GPU;
  if (configured === 'cpu' || configured === 'false' || configured === '0') return false;
  if (configured === 'auto' || configured === 'cuda' || configured === 'vulkan') return configured;
  return 'auto';
}

async function disposeRuntime() {
  if (sequence && !sequence.disposed) {
    sequence.dispose();
  }
  sequence = null;

  if (context && !context.disposed) {
    const contextToDispose = context;
    context = null;
    await contextToDispose.dispose();
  }

  if (model) {
    const modelToDispose = model;
    model = null;
    await modelToDispose.dispose();
  }

  if (llama) {
    const llamaToDispose = llama;
    llama = null;
    await llamaToDispose.dispose();
  }

  activeGpuMode = null;
}

async function loadModelWithGpuMode(gpu) {
  const { getLlama } = await import('node-llama-cpp');

  const runtimeStartedAt = now();
  console.log('[refine] Initializing llama runtime with GPU mode:', gpu || 'cpu');
  llama = await getLlama({ gpu, maxThreads: 0 });
  activeGpuMode = gpu;
  console.log('[refine] Llama runtime ready', {
    gpuMode: activeGpuMode || 'cpu',
    durationMs: Math.round(now() - runtimeStartedAt),
  });

  const modelStartedAt = now();
  console.log('[refine] Loading Gemma model from', getModelPath());
  model = await llama.loadModel({
    modelPath: getModelPath(),
    gpuLayers: gpu ? 'auto' : 0,
  });
  console.log('[refine] Model loaded', {
    gpuMode: activeGpuMode || 'cpu',
    gpuLayers: model.gpuLayers,
    durationMs: Math.round(now() - modelStartedAt),
  });

  return model;
}

async function getModel() {
  if (model) return model;
  if (modelLoadPromise) return await modelLoadPromise;

  modelLoadPromise = (async () => {
    const preferredGpu = getGpuMode();

    try {
      return await loadModelWithGpuMode(preferredGpu);
    } catch (err) {
      if (!preferredGpu) throw err;

      console.warn('[refine] GPU initialization failed; retrying on CPU', err);
      await disposeRuntime();
      return await loadModelWithGpuMode(false);
    }
  })();

  try {
    return await modelLoadPromise;
  } finally {
    modelLoadPromise = null;
  }
}

async function getSequence() {
  if (sequence && !sequence.disposed) return sequence;
  if (contextLoadPromise) return await contextLoadPromise;

  contextLoadPromise = (async () => {
    try {
      const currentModel = await getModel();
      const contextStartedAt = now();
      // 2048 tokens is plenty for voice refinement and keeps KV-cache RAM modest.
      context = await createRefinementContext(currentModel);
      sequence = context.getSequence();
      console.log('[refine] Context ready', {
        gpuMode: activeGpuMode || 'cpu',
        contextSize: context.contextSize,
        threads: context.idealThreads,
        flashAttention: context.flashAttention,
        durationMs: Math.round(now() - contextStartedAt),
      });
      return sequence;
    } catch (err) {
      if (!activeGpuMode) throw err;

      console.warn('[refine] GPU context creation failed; retrying on CPU', err);
      await disposeRuntime();
      const currentModel = await loadModelWithGpuMode(false);
      const contextStartedAt = now();
      context = await createRefinementContext(currentModel);
      sequence = context.getSequence();
      console.log('[refine] CPU fallback context ready', {
        contextSize: context.contextSize,
        threads: context.idealThreads,
        flashAttention: context.flashAttention,
        durationMs: Math.round(now() - contextStartedAt),
      });
      return sequence;
    }
  })();

  try {
    return await contextLoadPromise;
  } finally {
    contextLoadPromise = null;
  }
}

async function createRefinementContext(currentModel) {
  const options = {
    contextSize: 2048,
    threads: 0,
    flashAttention: true,
  };

  try {
    return await currentModel.createContext(options);
  } catch (err) {
    console.warn('[refine] Context creation with flash attention failed; retrying without it', err);
    return await currentModel.createContext({
      ...options,
      flashAttention: false,
    });
  }
}

function scheduleUnload() {
  clearUnloadTimer();
  unloadTimer = setTimeout(() => {
    void unloadBuiltinModel();
  }, IDLE_TIMEOUT_MS);
}

export function clearUnloadTimer() {
  if (unloadTimer) {
    clearTimeout(unloadTimer);
    unloadTimer = null;
  }
}

export async function unloadBuiltinModel() {
  if (activeRefinements > 0 || modelLoadPromise || contextLoadPromise) {
    scheduleUnload();
    return;
  }

  clearUnloadTimer();

  console.log('[refine] Unloading Gemma runtime after idle timeout');
  await disposeRuntime();
  console.log('[refine] Runtime unloaded');
}

async function runRefinement(systemMessage, userMessage) {
  const { LlamaChatSession } = await import('node-llama-cpp');

  activeRefinements += 1;
  let session = null;
  const totalStartedAt = now();

  try {
    const sequenceStartedAt = now();
    const currentSequence = await getSequence();
    const sequenceWaitMs = Math.round(now() - sequenceStartedAt);
    await currentSequence.clearHistory();

    session = new LlamaChatSession({
      contextSequence: currentSequence,
      systemPrompt: systemMessage,
      autoDisposeSequence: false,
    });

    const maxTokens = calculateMaxTokens(userMessage);
    const startedAt = now();

    const response = await session.prompt(userMessage, {
      maxTokens,
      temperature: 1.0,
      topP: 0.95,
      topK: 64,
    });

    console.log('[refine] Refinement complete', {
      sequenceWaitMs,
      generationMs: Math.round(now() - startedAt),
      totalMs: Math.round(now() - totalStartedAt),
      maxTokens,
      chars: response.length,
    });

    return response;
  } finally {
    session?.dispose?.({ disposeSequence: false });
    activeRefinements -= 1;
    scheduleUnload();
  }
}

export async function refineBuiltin(systemMessage, userMessage) {
  const result = refinementQueue.then(() => runRefinement(systemMessage, userMessage));
  refinementQueue = result.catch(() => {});
  return await result;
}

export async function warmBuiltin() {
  await getSequence();
  scheduleUnload();
  return {
    gpuMode: activeGpuMode || 'cpu',
    gpuLayers: model?.gpuLayers ?? 0,
    contextSize: context?.contextSize ?? null,
    flashAttention: context?.flashAttention ?? false,
  };
}
