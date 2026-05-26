import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voicerefine', {
  refineBuiltin: (system, user) => ipcRenderer.invoke('refine-builtin', system, user),
  warmBuiltin: () => ipcRenderer.invoke('warm-builtin'),
});
