/**
 * main.js — Application entry point.
 *
 * Responsibilities:
 *   1. App lifecycle (ready, activate, window-all-closed, before-quit)
 *   2. BrowserWindow creation and configuration
 *   3. Module assembly — calls init() on each sub-module
 *
 * All functional logic lives in the sub-modules:
 *   - config.js   — config persistence + Keychain migration
 *   - pty.js      — pty lifecycle, shared state maps, process cleanup
 *   - monitor.js  — process monitor FSM (1.5s BFS tick)
 *   - git.js      — git IPC handlers
 *   - fs-handlers.js — file system IPC handlers
 *   - tray.js     — macOS menu bar resident
 *   - tools.js    — tool catalog + installation IPC handlers
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');

const { loadConfigAsync, loadConfig, saveConfigAsync } = require('./config');
const { loadPtyModule, initPtyIPC, ptyProcesses, killPtyTree, cleanupAll } = require('./pty');
const { monitorTick } = require('./monitor');
const { initGitIPC } = require('./git');
const { initFsIPC } = require('./fs-handlers');
const { createTray, refreshTrayMenu, destroyTray } = require('./tray');
const { initToolsIPC } = require('./tools');

let mainWindow = null;
let hasShownHideHint = false;
let monitorInterval = null;

// ─── Window creation ──────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();

      if (!hasShownHideHint) {
        hasShownHideHint = true;
        dialog.showMessageBox(null, {
          type: 'info',
          title: '智枢正在后台运行',
          message: '智枢已收起到菜单栏，所有 AI 会话仍在继续。',
          detail: '点击菜单栏图标可重新打开窗口。\n右键菜单栏图标 → 退出，可完全关闭并终止所有进程。',
          buttons: ['知道了'],
          defaultId: 0,
        });
      }
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL;
  const url = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  console.log('[main] isDev:', isDev, '| loading:', isDev ? url : 'build/index.html');

  if (isDev) {
    win.loadURL(url);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../build/index.html'));
  }

  win.webContents.on('console-message', (_, level, message, line, sourceId) => {
    const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'log';
    if (level >= 2) {
      console.log(`[renderer:${levelName}] ${message}  (${sourceId}:${line})`);
    }
  });

  win.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.error('[main] did-fail-load:', code, desc, url);
  });

  win.webContents.on('render-process-gone', (_, details) => {
    console.error('[main] render-process-gone:', details);
  });

  return win;
}

// ─── System & window IPC ──────────────────────────────────────────────────

function initSystemIPC() {
  ipcMain.on('system:homeDir', (event) => {
    event.returnValue = os.homedir();
  });

  ipcMain.handle('window:toggleAlwaysOnTop', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next, 'floating');
    return next;
  });

  ipcMain.handle('window:isAlwaysOnTop', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isAlwaysOnTop() : false;
  });

  ipcMain.handle('config:load', () => loadConfig());

  ipcMain.handle('config:save', async (_, data) => {
    await saveConfigAsync(data);
    return true;
  });

  ipcMain.handle('dialog:selectDir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  loadPtyModule();
  await loadConfigAsync();

  createWindow();
  createTray(mainWindow);

  // Register all IPC handlers
  initSystemIPC();
  initPtyIPC();
  initGitIPC();
  initFsIPC();
  initToolsIPC();

  // Start process monitor (1.5s cadence)
  let monitorRunning = false;
  monitorInterval = setInterval(async () => {
    if (!monitorRunning) {
      monitorRunning = true;
      try { await monitorTick(); } catch (_) {}
      monitorRunning = false;
    }
    refreshTrayMenu(mainWindow);
  }, 1500);

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (monitorInterval) clearInterval(monitorInterval);
    for (const [, proc] of ptyProcesses) killPtyTree(proc);
    ptyProcesses.clear();
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
  cleanupAll();
  destroyTray();
});
