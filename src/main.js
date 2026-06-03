import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, screen, session, shell } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import started from 'electron-squirrel-startup';
import { preloadNativeAsrModel, transcribeNative, unloadNativeAsrModels } from './main/asr.js';
import { clearUnloadTimer, refineBuiltin, unloadBuiltinModel, warmBuiltin } from './main/refine.js';

const execFileAsync = promisify(execFile);

if (started) {
  app.quit();
}

const HOTKEY_ACCELERATOR = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Control+Shift+Space';
const CANCEL_ACCELERATOR = 'Esc';
let mainWindow = null;
let overlayWindow = null;
let overlayReady = false;
let overlayRecording = false;
let overlayProcessing = false;
let pendingOverlayCommand = null;

async function sendPasteShortcut() {
  if (process.platform === 'win32') {
    const powershellPath = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    await execFileAsync(powershellPath, [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
    ], { windowsHide: true });
    return;
  }

  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ]);
    return;
  }

  await execFileAsync('xdotool', ['key', 'ctrl+v']);
}

async function pasteTextIntoActiveApp(text) {
  const trimmedText = text?.trim();
  if (!trimmedText) return { inserted: false, reason: 'empty-text' };

  const previousText = clipboard.readText();
  clipboard.writeText(trimmedText);

  try {
    await sendPasteShortcut();
    setTimeout(() => {
      if (clipboard.readText() === trimmedText) {
        clipboard.writeText(previousText);
      }
    }, 1200);

    return { inserted: true, chars: trimmedText.length };
  } catch (err) {
    clipboard.writeText(trimmedText);
    throw err;
  }
}

// SharedArrayBuffer (used by Transformers.js WASM threading) requires these
// headers even in Electron. The Vite dev server sets them itself; for
// production file:// loads we inject them here via the session API.
function addCrossOriginHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
      },
    });
  });
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

function positionOverlayWindow() {
  if (!overlayWindow) return;

  const { workArea } = screen.getPrimaryDisplay();
  const bounds = overlayWindow.getBounds();
  const x = Math.round(workArea.x + (workArea.width - bounds.width) / 2);
  const y = Math.round(workArea.y + workArea.height - bounds.height - 56);
  overlayWindow.setPosition(x, y, false);
}

const createOverlayWindow = () => {
  overlayReady = false;
  overlayWindow = new BrowserWindow({
    width: 340,
    height: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  if (OVERLAY_WINDOW_VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${OVERLAY_WINDOW_VITE_DEV_SERVER_URL}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, `../renderer/${OVERLAY_WINDOW_VITE_NAME}/overlay.html`));
  }

  positionOverlayWindow();
};

function sendOverlayCommand(command) {
  if (!overlayWindow) createOverlayWindow();
  if (!overlayReady) {
    pendingOverlayCommand = command;
    return;
  }
  overlayWindow.webContents.send('overlay-command', command);
}

function showOverlayAndStartRecording() {
  if (!overlayWindow) createOverlayWindow();
  if (overlayProcessing) {
    console.log('[overlay] ignoring start while processing');
    return;
  }

  if (!overlayWindow.isVisible()) {
    positionOverlayWindow();
    overlayWindow.showInactive();
    console.log('[overlay] shown');
  }

  sendOverlayCommand('start-recording');
}

function stopOverlayRecording() {
  sendOverlayCommand('stop-recording');
}

function cancelOverlayRecording() {
  if (!overlayWindow?.isVisible()) return;
  sendOverlayCommand('cancel-recording');
  overlayWindow.hide();
  overlayRecording = false;
  overlayProcessing = false;
  console.log('[overlay] cancelled');
}

function toggleRecordingOverlay() {
  if (overlayRecording) {
    stopOverlayRecording();
    return;
  }

  showOverlayAndStartRecording();
}

async function showHotkeyFailureDialog() {
  const isMac = process.platform === 'darwin';
  const detail = isMac
    ? 'macOS may require Accessibility permission before VoiceRefine can listen for global shortcuts. Open System Settings > Privacy & Security > Accessibility and allow VoiceRefine.'
    : 'Another app may already be using this shortcut, or the operating system rejected the registration.';

  const result = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'warning',
    title: 'Global hotkey unavailable',
    message: `VoiceRefine could not register ${HOTKEY_ACCELERATOR}.`,
    detail,
    buttons: isMac ? ['Open Accessibility Settings', 'OK'] : ['OK'],
    defaultId: isMac ? 1 : 0,
    cancelId: isMac ? 1 : 0,
  });

  if (isMac && result.response === 0) {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  }
}

function registerGlobalHotkey() {
  console.log(`[hotkey] Registering ${HOTKEY_ACCELERATOR} on ${process.platform}`);
  const registered = globalShortcut.register(HOTKEY_ACCELERATOR, () => {
    console.log(`[hotkey] ${HOTKEY_ACCELERATOR} pressed`);
    toggleRecordingOverlay();
    mainWindow?.webContents.send('voice-refine-hotkey-pressed');
  });

  const isRegistered = globalShortcut.isRegistered(HOTKEY_ACCELERATOR);
  if (registered) {
    console.log(`[hotkey] Registered ${HOTKEY_ACCELERATOR}`, { isRegistered });
  } else {
    console.warn(`[hotkey] Failed to register ${HOTKEY_ACCELERATOR}`, { isRegistered });
    void showHotkeyFailureDialog();
  }

  const cancelRegistered = globalShortcut.register(CANCEL_ACCELERATOR, () => {
    if (overlayWindow?.isVisible()) cancelOverlayRecording();
  });
  console.log(`[hotkey] Esc cancel registration`, { isRegistered: cancelRegistered });
}

app.whenReady().then(() => {
  addCrossOriginHeaders();

  // Renderer calls window.voicerefine.refineBuiltin(system, user)
  // which crosses the IPC bridge to here, runs Gemma inference, and returns the string.
  ipcMain.handle('refine-builtin', async (_event, system, user) => {
    return await refineBuiltin(system, user);
  });
  ipcMain.handle('warm-builtin', async () => {
    return await warmBuiltin();
  });
  ipcMain.handle('transcribe-native', async (_event, payload) => {
    return await transcribeNative(payload);
  });
  ipcMain.handle('preload-native-asr-model', async (_event, payload) => {
    return await preloadNativeAsrModel(payload);
  });
  ipcMain.handle('unload-native-asr-models', async (_event, payload) => {
    return await unloadNativeAsrModels(payload);
  });
  ipcMain.handle('paste-text-into-active-app', async (_event, text) => {
    return await pasteTextIntoActiveApp(text);
  });
  ipcMain.on('overlay-ready', () => {
    overlayReady = true;
    if (pendingOverlayCommand) {
      const command = pendingOverlayCommand;
      pendingOverlayCommand = null;
      sendOverlayCommand(command);
    }
  });
  ipcMain.on('overlay-recording-started', () => {
    overlayRecording = true;
    overlayProcessing = false;
    console.log('[overlay] recording started');
  });
  ipcMain.on('overlay-recording-stopped', (_event, metadata) => {
    overlayRecording = false;
    overlayProcessing = true;
    console.log('[overlay] recording stopped', metadata);
  });
  ipcMain.on('overlay-transcription-complete', async (_event, payload) => {
    overlayProcessing = false;
    console.log('[overlay] transcription complete', payload);
    try {
      const result = await pasteTextIntoActiveApp(payload?.text);
      console.log('[overlay] pasted transcript', result);
      setTimeout(() => {
        if (!overlayRecording) overlayWindow?.hide();
      }, 350);
    } catch (err) {
      console.warn('[overlay] paste failed', err);
      overlayWindow?.webContents.send('overlay-command', 'paste-failed');
    }
  });
  ipcMain.on('overlay-recording-failed', (_event, message) => {
    overlayRecording = false;
    overlayProcessing = false;
    console.warn('[overlay] recording failed', message);
    setTimeout(() => {
      if (!overlayRecording) overlayWindow?.hide();
    }, 1400);
  });

  createWindow();
  createOverlayWindow();
  registerGlobalHotkey();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  clearUnloadTimer();
  void unloadBuiltinModel();
  void unloadNativeAsrModels();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
