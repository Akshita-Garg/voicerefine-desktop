import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const [key, inlineValue] = arg.slice(2).split('=');
  const nextValue = process.argv[i + 1]?.startsWith('--') ? undefined : process.argv[i + 1];
  args.set(key, inlineValue ?? nextValue ?? true);
  if (!inlineValue && nextValue) i += 1;
}

const modelPath = path.resolve(appRoot, args.get('model') ?? 'resources/models/gemma-3-1b-it-Q4_K_M.gguf');
const casesPath = path.resolve(appRoot, args.get('cases') ?? 'bench/transform-eval-cases.json');
const split = args.get('split') ?? 'train';
const presetArg = args.get('preset') ?? 'all';
const gpu = args.get('gpu') ?? process.env.VOICEREFINE_LLAMA_GPU ?? 'auto';
const limit = Number.parseInt(args.get('limit') ?? '', 10);
const offset = Number.parseInt(args.get('offset') ?? '0', 10);
const dryRun = args.has('dry-run');
const resultsDir = path.resolve(appRoot, args.get('results-dir') ?? 'bench/results');
const runLabel = args.get('label') ?? new Date().toISOString().replace(/[:.]/g, '-');
const disposeNative = args.has('dispose');

function loadComposePromptModule(source) {
  const transformed = source
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${transformed}
result = { TRANSFORM_PRESETS, DEFAULT_TRANSFORM_PRESET, normalizeTransformPreset, defaultPromptForPreset, composeTransformPrompt, composeShortcutTransformPrompt };`, context);
  return context.result;
}

const composePromptSource = await fs.readFile(path.join(appRoot, 'src/utils/composePrompt.js'), 'utf8');
const {
  defaultPromptForPreset,
  composeShortcutTransformPrompt,
} = loadComposePromptModule(composePromptSource);

const allCases = JSON.parse(await fs.readFile(casesPath, 'utf8'))
  .filter(item => item.split === split)
  .slice(Number.isInteger(offset) && offset > 0 ? offset : 0)
  .slice(0, Number.isInteger(limit) && limit > 0 ? limit : undefined);

const presets = presetArg === 'all'
  ? ['clarity', 'structure']
  : [presetArg === 'smart' ? 'clarity' : presetArg === 'organize' ? 'structure' : presetArg];
const safePreset = presets.join('-').replace(/[^a-z0-9_-]+/gi, '-');
const resultsPath = path.join(resultsDir, `${runLabel}-${split}-${safePreset}.json`);

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function calculateMaxTokens(transcript) {
  return Math.min(1024, Math.max(128, Math.ceil(wordCount(transcript) * 2.0)));
}

function samplingFor(preset) {
  if (preset === 'clarity') return { temperature: 0.65, topP: 0.9, topK: 48 };
  return { temperature: 0.65, topP: 0.9, topK: 48 };
}

function cleanRefinementOutput(text) {
  return text
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^(final text|output|result)\s*:\s*/i, '')
    .trim();
}

function cleanSpeechArtifacts(text) {
  return text
    .replace(/(^|[\s([{])(?:uh|um)[,.;:!?]?(?=\s|$)/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+$/gm, '')
    .trim();
}

function cleanScratchThat(text) {
  return text.replace(/^.*\bscratch that\b[,.;:!?\s]*(.+)$/i, (_match, replacement) => {
    const trimmed = replacement.trim();
    if (!trimmed) return '';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }).trim();
}

function cleanActuallyMakeThat(text) {
  return text.replace(/\b(on|for|at|from)\s+([a-z0-9]+),?\s+actually make that\s+(.+)$/i, (_match, preposition, _oldValue, replacement) => {
    return `${preposition} ${replacement.trim()}`;
  }).trim();
}

function removeFormattingCommandLines(text) {
  return text
    .replace(/\bnew thought\b\s*/gi, '')
    .split(/\r?\n/)
    .filter(line => !/^([-*]|\d+[.)])\s+(?:make a list|numbered list|new paragraph)\.?$/i.test(line.trim()))
    .join('\n')
    .trim();
}

function capitalizeFirstTextChar(text) {
  return text.replace(/^[a-z]/, char => char.toUpperCase());
}

function finalizeTransformOutput(text) {
  const cleaned = capitalizeFirstTextChar(removeFormattingCommandLines(cleanActuallyMakeThat(cleanScratchThat(cleanSpeechArtifacts(cleanRefinementOutput(text))))));
  const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const bulletLines = lines.filter(line => /^([-*]|\d+[.)])\s+/.test(line));
  if (bulletLines.length >= 2) return cleaned;
  if (/[.!?)]$/.test(cleaned)) return cleaned;
  if (!/[a-z0-9]$/i.test(cleaned)) return cleaned;
  return `${cleaned}.`;
}

function includesLoose(text, expected) {
  if (!/[a-z0-9]/i.test(expected)) return text.includes(expected);

  const normalize = value => value
    .toLowerCase()
    .replace(/\$5,000/g, 'five thousand')
    .replace(/500/g, 'five hundred')
    .replace(/400/g, 'four hundred')
    .replace(/june 12(?:th)?/g, 'june twelfth')
    .replace(/june 15(?:th)?/g, 'june fifteenth')
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedExpected = normalize(expected);
  if (!normalizedExpected) return text.includes(expected);
  return normalize(text).includes(normalizedExpected);
}

function detectFormat(output) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const listLines = lines.filter(line => /^([-*]|\d+[.)])\s+/.test(line)
    || /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[,.:)]\s+/i.test(line));
  if (listLines.length >= 2 && listLines.length >= Math.ceil(lines.length * 0.6)) return 'list';
  return 'prose';
}

function evaluateOutput({ output, expectation }) {
  const failures = [];
  const format = detectFormat(output);
  const expectedFormats = Array.isArray(expectation.format)
    ? expectation.format
    : expectation.format ? [expectation.format] : [];
  if (expectedFormats.length > 0 && !expectedFormats.includes(format)) {
    failures.push(`format expected ${expectedFormats.join(' or ')}, got ${format}`);
  }
  for (const item of expectation.mustContain ?? []) {
    if (!includesLoose(output, item)) failures.push(`missing "${item}"`);
  }
  for (const item of expectation.mustNotContain ?? []) {
    if (includesLoose(output, item)) failures.push(`should not contain "${item}"`);
  }
  return { ok: failures.length === 0, failures, format };
}

function evaluatePresetOutput({ output, preset }) {
  const failures = [];
  if (preset === 'clarity') {
    if (/\b(?:um|uh)\b/i.test(output)) failures.push('contains filler word');
    if (detectFormat(output) === 'prose' && !/[.!?)]$/.test(output.trim())) {
      failures.push('prose output lacks terminal punctuation');
    }
  }
  return failures;
}

function expectationFor(item, preset) {
  return preset === 'clarity' ? item.smart : item.organize;
}

if (dryRun) {
  console.log('[eval] dry run', { split, cases: allCases.length, presets, modelPath, gpu, resultsDir, runLabel, resultsPath });
  process.exit(0);
}

await fs.mkdir(resultsDir, { recursive: true });

const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

const setupStartedAt = performance.now();
const llama = await getLlama({ gpu, maxThreads: 0 });
const model = await llama.loadModel({ modelPath, gpuLayers: gpu ? 'auto' : 0 });
let context;
try {
  context = await model.createContext({ contextSize: 2048, threads: 0, flashAttention: true });
} catch {
  context = await model.createContext({ contextSize: 2048, threads: 0, flashAttention: false });
}
const sequence = context.getSequence();

console.log('[eval] model ready', {
  split,
  cases: allCases.length,
  presets,
  gpu,
  gpuLayers: model.gpuLayers,
  setupMs: Math.round(performance.now() - setupStartedAt),
});

const results = [];
const runStartedAt = performance.now();

async function writeResultsFile() {
  const passed = results.filter(item => item.ok).length;
  const failed = results.length - passed;
  const summary = {
    split,
    presets,
    passed,
    failed,
    total: results.length,
    totalMs: Math.round(performance.now() - runStartedAt),
  };

  await fs.writeFile(resultsPath, JSON.stringify({
    summary,
    config: {
      split,
      presets,
      gpu,
      modelPath,
      casesPath,
      limit: Number.isInteger(limit) && limit > 0 ? limit : null,
      offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
    },
    results,
  }, null, 2));

  return summary;
}

try {
  for (const item of allCases) {
    for (const preset of presets) {
      await sequence.clearHistory();
      const session = new LlamaChatSession({
        contextSequence: sequence,
        autoDisposeSequence: false,
      });

      const { user } = composeShortcutTransformPrompt({
        prompt: defaultPromptForPreset(preset),
        transcript: item.transcript,
      });
      const maxTokens = calculateMaxTokens(item.transcript);
      const startedAt = performance.now();
      const rawOutput = await session.prompt(user, {
        maxTokens,
        ...samplingFor(preset),
      });
      session.dispose?.({ disposeSequence: false });

      const output = finalizeTransformOutput(rawOutput);
      const expectation = expectationFor(item, preset);
      const evaluation = evaluateOutput({ output, expectation });
      const failures = [
        ...evaluation.failures,
        ...evaluatePresetOutput({ output, preset }),
      ];
      const result = {
        id: item.id,
        preset,
        ok: failures.length === 0,
        failures,
        format: evaluation.format,
        elapsedMs: Math.round(performance.now() - startedAt),
        transcript: item.transcript,
        output,
      };
      results.push(result);
      await writeResultsFile();

      const icon = result.ok ? 'PASS' : 'FAIL';
      console.log(`[eval] ${icon} ${result.id} ${preset} ${result.elapsedMs}ms`);
      if (!result.ok) {
        console.log('  failures:', result.failures.join('; '));
        console.log('  transcript:', result.transcript);
        console.log('  output:', result.output.replace(/\n/g, '\\n'));
      }
    }
  }
} finally {
  try {
    if (disposeNative) {
      sequence.dispose();
      await context.dispose();
      await model.dispose();
      await llama.dispose();
    }
  } catch (err) {
    console.warn('[eval] cleanup warning', err?.message ?? err);
  }
}

const summary = await writeResultsFile();
console.log('[eval] summary', summary);
console.log('[eval] results written', resultsPath);

if (summary.failed > 0) process.exitCode = 1;
