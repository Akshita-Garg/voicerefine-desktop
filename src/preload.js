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
  getRefinementSettings: () => ipcRenderer.invoke('get-refinement-settings'),
  setRefinementSettings: (settings) => ipcRenderer.invoke('set-refinement-settings', settings),
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
