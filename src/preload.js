import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voicerefine', {
  refineBuiltin: (system, user) => ipcRenderer.invoke('refine-builtin', system, user),
  warmBuiltin: () => ipcRenderer.invoke('warm-builtin'),
  releaseBuiltinForTranscription: () => ipcRenderer.invoke('release-builtin-for-transcription'),
  overlayReady: () => ipcRenderer.send('overlay-ready'),
  overlayRecordingStarted: () => ipcRenderer.send('overlay-recording-started'),
  overlayRecordingStopped: (metadata) => ipcRenderer.send('overlay-recording-stopped', metadata),
  overlayTranscriptionComplete: (payload) => ipcRenderer.send('overlay-transcription-complete', payload),
  overlayRecordingFailed: (message) => ipcRenderer.send('overlay-recording-failed', message),
  onOverlayCommand: (handler) => {
    const listener = (_event, command) => handler(command);
    ipcRenderer.on('overlay-command', listener);
    return () => ipcRenderer.removeListener('overlay-command', listener);
  },
});
