import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, session, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { clearUnloadTimer, refineBuiltin, unloadBuiltinModel, warmBuiltin } from './main/refine.js';

if (started) {
  app.quit();
}

const HOTKEY_ACCELERATOR = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Control+Shift+Space';
let mainWindow = null;
let overlayWindow = null;

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

function toggleRecordingOverlay() {
  if (!overlayWindow) createOverlayWindow();

  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
    console.log('[overlay] hidden');
    return;
  }

  positionOverlayWindow();
  overlayWindow.showInactive();
  console.log('[overlay] shown');
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
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
