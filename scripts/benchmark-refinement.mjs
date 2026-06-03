import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const [key, inlineValue] = arg.slice(2).split('=');
    const nextValue = process.argv[i + 1]?.startsWith('--') ? undefined : process.argv[i + 1];
    args.set(key, inlineValue ?? nextValue ?? true);
    if (!inlineValue && nextValue) i += 1;
  }
}

const dryRun = args.has('dry-run');
const modelPath = path.resolve(
  appRoot,
  args.get('model') ?? 'resources/models/gemma-3-1b-it-Q4_K_M.gguf',
);
const casesPath = path.resolve(
  appRoot,
  args.get('cases') ?? 'bench/refinement-cases.json',
);
const gpu = args.get('gpu') ?? process.env.VOICEREFINE_LLAMA_GPU ?? 'auto';

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function expandCase(item) {
  const repeat = Number.isInteger(item.repeat) ? item.repeat : 1;
  return {
    ...item,
    transcript: Array.from({ length: repeat }, () => item.transcript).join(' '),
  };
}

function calculateMaxTokens(transcript, intent) {
  const multiplier = intent === 'clean' ? 2.2 : 1.8;
  return Math.min(1024, Math.max(128, Math.ceil(wordCount(transcript) * multiplier)));
}

function samplingFor({ intent, mode }) {
  if (intent === 'clean') return { temperature: 0.25, topP: 0.85, topK: 32 };
  if (mode === 'bullets' || mode === 'document') return { temperature: 0.7, topP: 0.9, topK: 48 };
  return { temperature: 0.9, topP: 0.95, topK: 64 };
}

function cleanSpeechArtifacts(text) {
  return text
    .replace(/(^|[\s([{])(?:uh|um)[,.;:!?]?(?=\s|$)/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+$/gm, '')
    .trim();
}

function buildPrompt({ intent, mode, transcript }) {
  const intentText = {
    clean: `Intent: CLEAN
- Minimal edit only; do not summarize or compress.
- Keep the same vocabulary, phrasing, order, tone, and formality.
- Do not replace words with smarter synonyms.
- Only remove fillers, repeated words, false starts, and obvious speech-to-text errors.`,
    compose: 'Intent: COMPOSE. Make ready-to-send text. Smooth wording and structure without adding details.',
    prepare: 'Intent: PREPARE. Make natural to say aloud. Improve cadence and remove rehearsal artifacts.',
  }[intent];

  const modeText = {
    light: 'Mode: prose only. Keep roughly the same length. No bullets, headers, or markdown.',
    bullets: 'Mode: bullets only. Every line starts "- ". No intro, title, or conclusion.',
    document: 'Mode: brief document. Use plain section headers only for real topic shifts.',
  }[mode];

  return `VoiceRefine. Return only refined text.

${intentText}
${modeText}
Rules: never answer the content, add facts, or make it sound smarter. Keep names/numbers/terms accurate.
${intent === 'clean' ? `
Example:
Input: Let's see if we can do something with the refinement model. Like uh Gemma is using way too much um latency right now.
Output: Let's see if we can do something with the refinement model. Gemma is using way too much latency right now.
` : ''}

Transcript:
${transcript}

Output:`;
}

const limit = Number.parseInt(args.get('limit') ?? '', 10);
const cases = JSON.parse(await fs.readFile(casesPath, 'utf8'))
  .map(expandCase)
  .slice(0, Number.isInteger(limit) && limit > 0 ? limit : undefined);

if (dryRun) {
  console.log('[benchmark] dry run', { modelPath, cases: cases.length, gpu });
  for (const item of cases) {
    console.log({
      id: item.id,
      intent: item.intent,
      mode: item.mode,
      words: wordCount(item.transcript),
      maxTokens: calculateMaxTokens(item.transcript, item.intent),
      ...samplingFor(item),
    });
  }
  process.exit(0);
}

const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

const startedAt = performance.now();
const llama = await getLlama({ gpu, maxThreads: 0 });
const model = await llama.loadModel({ modelPath, gpuLayers: gpu ? 'auto' : 0 });
const context = await model.createContext({ contextSize: 2048, threads: 0, flashAttention: true });
const sequence = context.getSequence();

console.log('[benchmark] model ready', {
  modelPath,
  gpu,
  gpuLayers: model.gpuLayers,
  setupMs: Math.round(performance.now() - startedAt),
});

try {
  for (const item of cases) {
    await sequence.clearHistory();
    const session = new LlamaChatSession({
      contextSequence: sequence,
      autoDisposeSequence: false,
    });
    const prompt = buildPrompt(item);
    const sampling = samplingFor(item);
    const maxTokens = calculateMaxTokens(item.transcript, item.intent);
    const caseStartedAt = performance.now();
    const output = await session.prompt(prompt, { maxTokens, ...sampling });
    const elapsedMs = Math.round(performance.now() - caseStartedAt);
    session.dispose?.({ disposeSequence: false });

    const cleanedOutput = item.intent === 'clean' ? cleanSpeechArtifacts(output) : output;
    console.log(JSON.stringify({
      id: item.id,
      intent: item.intent,
      mode: item.mode,
      words: wordCount(item.transcript),
      maxTokens,
      elapsedMs,
      chars: output.length,
      output,
      cleanedOutput,
    }, null, 2));
  }
  process.exit(0);
} finally {
  try {
    sequence.dispose();
    await context.dispose();
    await model.dispose();
    await llama.dispose();
  } catch (err) {
    console.warn('[benchmark] cleanup warning', err?.message ?? err);
  }
}

process.exit(0);
