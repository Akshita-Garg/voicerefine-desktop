# VoiceRefine Desktop

Press a hotkey, speak, and polished text appears in whatever app you're using — without sending your voice to any server.

VoiceRefine runs local transcription and refinement models on your machine. It has two surfaces: a main window for longer dictation sessions and a global-hotkey overlay that records and pastes directly into the focused app.

**Platform:** Windows 10 / 11 (macOS and Linux planned)

---

## Transcription Modes

Three modes selectable in Settings. The selected model preloads at startup so repeated recordings don't pay the full startup cost.

| Mode | Model | Notes |
|---|---|---|
| **Quick** | Whisper Tiny (ONNX, on-device) | Fastest. Good for short notes where latency matters more than accuracy. |
| **Balanced** *(default)* | Parakeet TDT 0.6B Q4 | A local CrispASR server stays warm at `localhost:51234`. Reused across recordings for consistent latency. |
| **Precise** | Cohere Transcribe Q4 | Highest accuracy, especially for technical terms. Downloaded on first use (~1.5 GB via Settings). |

---

## Refinement Modes

### Clean

No LLM. Runs instantly in the renderer. Strips filler words ("um", "uh"), fixes punctuation and casing, removes speech artifacts. Zero latency, no model required.

### Transform

LLM-powered rewrite. Two named presets:

| Preset | Behavior |
|---|---|
| **Smart Format** | Keeps your exact words and vocabulary. Cleans punctuation, handles spoken lists, corrections, and asides. Conservative — it doesn't rephrase. |
| **Polish & Organize** | Lightly rewrites for flow and clarity. Merges repetition, restructures when you signal a list. Good for longer dictation. |

Both presets have editable prompts in Settings — switch to Custom mode to change the exact instructions the model receives.

### Refinement Providers

| Provider | Details |
|---|---|
| **Built-in** *(recommended)* | Gemma 3 1B Q4_K_M via `node-llama-cpp`. GPU-accelerated (CUDA/Vulkan), falls back to CPU. Model stays warm for 30 minutes after last use, then unloads to free memory. |
| **Gemini** | `gemini-2.0-flash` via Google AI Studio. Free tier available. Add your key in Settings. |
| **OpenAI** | `gpt-4o-mini`. Add your OpenAI key in Settings. |

API keys are stored only in `localStorage` on your device — never sent to any VoiceRefine server.

---

## Global Shortcut Overlay

The default shortcut is **Ctrl+Shift+Space**. Change it during onboarding or in Settings.

**Flow:**

1. Press the shortcut — a small overlay appears without stealing focus from your app
2. Speak
3. Press the shortcut again to stop
4. The overlay transcribes, refines (using your current mode and preset), and pastes the result into the focused window
5. The clipboard is restored to its previous contents ~1.2 seconds later

Press **Esc** to cancel mid-recording.

---

## First Run / Onboarding

A three-step wizard runs on first launch:

1. **Choose refinement mode** — Clean or Transform
2. **Set your recording shortcut** — press any key combination to capture it
3. **Choose a provider** (Transform only) — Built-in, Gemini, or OpenAI; optionally validate your API key

---

## Development

```bash
npm install
npm start           # dev mode with hot reload
npm test            # run logic tests (Vitest)
```

### Packaging

```bash
npm run package                  # package the Electron app (no installer)
npm run make:win:installer       # build the NSIS web installer for Windows
```

Installer artifacts are written to `dist/nsis-web/`:
- `VoiceRefineSetup-1.0.0.exe` — small stub (~600 KB) downloaded and run by the user
- `voicerefine-desktop-1.0.0-x64.nsis.7z` — main payload (~1.6 GB), downloaded by the stub at install time from GitHub Releases

### Benchmarks

```bash
npm run benchmark:refinement           # run refinement benchmark
npm run benchmark:refinement -- --dry-run  # dry run without inference
```

---

## Project Structure

```
src/
  main.js                  Electron main process — IPC handlers, shortcut, overlay orchestration
  preload.js               IPC bridge exposed to renderers as window.voicerefine
  App.jsx                  Main window UI
  overlay.jsx              Global shortcut recording overlay
  main/
    asr.js                 ASR engine management (sherpa-onnx, CrispASR server/CLI)
    refine.js              Gemma 3 lifecycle (load, warm, queue, idle-unload)
  services/
    asr.js                 Renderer-side ASR service
    llm.js                 Renderer-side LLM dispatch (built-in + OpenAI/Gemini)
  utils/
    composePrompt.js        Transform prompt text and preset definitions
    refinementSettings.js   Mode/preset/prompt storage helpers
    refinementOutput.js     Post-processing pipeline (artifact cleaning, finalization)
  components/
    SettingsPanel.jsx       Settings drawer
    Onboarding.jsx          First-run wizard

resources/
  models/                  Local model files (excluded from git — see below)
  bin/                     CrispASR Windows binary

docs/
  index.html               GitHub Pages landing page for distribution
```

### Model Files

Local model files are not in the repository. Place them in `resources/models/` for development:

| File / Folder | Used by |
|---|---|
| `gemma-3-1b-it-Q4_K_M.gguf` | Built-in Transform refinement |
| `parakeet-tdt-0.6b-v3-GGUF/` | Balanced transcription |
| `sherpa-onnx-whisper-tiny.en/` | Quick transcription |

The Precise (Cohere) model is downloaded via the in-app Settings panel, not bundled.

---

## Tech Stack

- [Electron Forge](https://www.electronforge.io/) + [Vite](https://vitejs.dev/)
- [React 19](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/)
- [sherpa-onnx-node](https://github.com/k2-fsa/sherpa-onnx) — on-device Whisper transcription
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) — on-device Gemma inference
- [Vitest](https://vitest.dev/) — unit tests
