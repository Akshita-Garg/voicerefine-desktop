import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voicerefine', {
  refineBuiltin: (system, user, options) => ipcRenderer.invoke('refine-builtin', system, user, options),
  warmBuiltin: () => ipcRenderer.invoke('warm-builtin'),
  transcribeNative: (payload) => ipcRenderer.invoke('transcribe-native', payload),
  preloadNativeAsrModel: (payload) => ipcRenderer.invoke('preload-native-asr-model', payload),
  unloadNativeAsrModels: (payload) => ipcRenderer.invoke('unload-native-asr-models', payload),
  getSelectedNativeAsrModel: () => ipcRenderer.invoke('get-selected-native-asr-model'),
  setSelectedNativeAsrModel: (payload) => ipcRenderer.invoke('set-selected-native-asr-model', payload),
  pasteTextIntoActiveApp: (text) => ipcRenderer.invoke('paste-text-into-active-app', text),
  getRecordingShortcut: () => ipcRenderer.invoke('get-recording-shortcut'),
  setRecordingShortcut: (accelerator) => ipcRenderer.invoke('set-recording-shortcut', accelerator),
  getRefinementSettings: () => ipcRenderer.invoke('get-refinement-settings'),
  setRefinementSettings: (settings) => ipcRenderer.invoke('set-refinement-settings', settings),
  quitApp: () => ipcRenderer.invoke('quit-app'),
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
  onRecordingShortcutChanged: (handler) => {
    const listener = (_event, accelerator) => handler(accelerator);
    ipcRenderer.on('recording-shortcut-changed', listener);
    return () => ipcRenderer.removeListener('recording-shortcut-changed', listener);
  },
  checkCohereModel: () => ipcRenderer.invoke('check-cohere-model'),
  downloadCohereModel: () => ipcRenderer.invoke('download-cohere-model'),
  onCohereDownloadProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('cohere-download-progress', listener);
    return () => ipcRenderer.removeListener('cohere-download-progress', listener);
  },
});
