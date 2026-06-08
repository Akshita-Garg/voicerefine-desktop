# VoiceRefine Desktop

VoiceRefine Desktop is a cross-platform Electron app for local-first voice transcription and transcript refinement. The goal is to make dictation feel useful both inside the main app and inside other apps through a global shortcut.

The app records audio locally, transcribes it on-device, optionally refines the transcript into cleaner prose or another output style, and can paste the result into the currently focused application through an overlay flow.

## Project Overview

VoiceRefine Desktop is built around two core jobs:

1. Fast local transcription
2. Lightweight local or provider-backed refinement

The current desktop experience includes:

- A main window for recording, reviewing raw transcripts, refining output, and changing settings
- A global shortcut overlay for recording and inserting text into another app
- Local transcription model selection
- Multiple refinement intents and output modes
- Warm model loading to reduce repeated latency
- A small benchmark harness for evaluating refinement quality and speed

## How It Works

### Transcription

The app currently supports local transcription paths that favor privacy and low setup friction:

- `Balanced`: Parakeet Q4 through a warm CrispASR server
- `Quick`: a smaller Whisper-style local model for faster but lower-accuracy transcription
- `Precise`: Cohere Q4 through a CLI path

The selected transcription model is preloaded when possible so the first recording does not pay the full startup cost each time.

### Refinement

Refinement can run through:

- The built-in local Gemma path using `node-llama-cpp`
- External providers configured in Settings
- A transcript-only mode with refinement disabled

The built-in path is tuned for short editing tasks like:

- removing filler words
- cleaning punctuation and casing
- lightly composing text for written use
- preparing spoken wording

The desktop shortcut flow uses a more compact prompt path than the main app to reduce latency.

### Global Shortcut Flow

The default shortcut is:

- `Ctrl+Space`

You can change the shortcut during onboarding or later in Settings.

The shortcut opens a small overlay, records until toggled off, transcribes the audio, optionally refines the result using the selected intent and mode from the main app, and pastes the final text into the active application.

## Tech Stack

- Electron Forge
- React
- Vite
- `sherpa-onnx-node`
- `node-llama-cpp`
- Tailwind CSS
- Vitest

## Repository Structure

- [src](/C:/Users/akshi/Desktop/track-5-voicerefine/voicerefine-desktop/src) contains the Electron main process, preload bridge, renderer app, overlay UI, and local inference services
- [resources](/C:/Users/akshi/Desktop/track-5-voicerefine/voicerefine-desktop/resources) contains local runtime assets and model files that are used in development
- [bench](/C:/Users/akshi/Desktop/track-5-voicerefine/voicerefine-desktop/bench) contains benchmark cases for refinement evaluation
- [scripts](/C:/Users/akshi/Desktop/track-5-voicerefine/voicerefine-desktop/scripts) contains utility scripts such as the refinement benchmark runner

## Development

Install dependencies:

```bash
npm install
```

Start the desktop app in development:

```bash
npm start
```

Run the logic tests:

```bash
npm test
```

Package the app:

```bash
npm run package
```

Run the refinement benchmark dry-run:

```bash
npm run benchmark:refinement -- --dry-run
```

## Notes

- The repository expects local model files for the built-in transcription and refinement paths.
- The built-in Gemma refinement path benefits from GPU acceleration when available.
- The refinement benchmark script is meant to help compare prompt changes and future candidate models with the same fixed transcript set.

## Status

This project is actively being iterated on. Current work is focused on:

- improving local refinement quality for small models
- reducing latency in the shortcut flow
- benchmarking better local refinement model options
- keeping the experience privacy-preserving and usable across apps
