/**
 * Tray (macOS menu bar) module.
 *
 * Generates a tiny 16x16 PNG icon in code, creates a Tray with
 * context menu showing running/awaiting session counts.
 * Click toggles the main window visibility.
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const { sessionStatus } = require('./pty');

let tray = null;

function createTrayIcon() {
  const ICON_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAvklEQVQ4je3SsUoDQRDG8d/u' +
    'JeJZJEEIBgvBQrCwsLCwsLCwsLCwsLAQ7HwAH8DCwsLCwsLCwsLCRrCwsLCwELERG7GwsLCw' +
    'sLCw8AECCQpJTHaLnbvN3eXuuLuZ+f5nZvcm/qcQqupJaT0xs7u4Wb5fPS9+/wAGgGwLYBjY' +
    'BBaBR8DDAvAAvAC2gCMzm4ImYAGYAhaBBaACvALOgCowAayY2VRzPi3gXFXfgAvgBDgBToED' +
    'YA1YAFaABWAFWASOgRPgxMzeAW0YS5IAQTKxAAAAAElFTkSuQmCC';
  return nativeImage.createFromBuffer(Buffer.from(ICON_BASE64, 'base64'));
}

function buildTrayMenu(mainWindow) {
  const totalSessions = Array.from(sessionStatus.values())
    .filter((s) => s.tool && s.phase !== 'not_started').length;
  const reviewCount = Array.from(sessionStatus.values())
    .filter((s) => s.phase === 'awaiting_review').length;

  return Menu.buildFromTemplate([
    {
      label: `智枢 ZhiShu`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `运行中: ${totalSessions}`,
      enabled: false,
    },
    {
      label: `待审查: ${reviewCount}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: '隐藏窗口',
      click: () => mainWindow?.hide(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray(mainWindow) {
  try {
    const icon = createTrayIcon();
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('智枢 · ZhiShu AI Hub');
    tray.setContextMenu(buildTrayMenu(mainWindow));

    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.error('Tray init failed:', e);
  }
}

function refreshTrayMenu(mainWindow) {
  if (tray) tray.setContextMenu(buildTrayMenu(mainWindow));
}

function destroyTray() {
  if (tray) { tray.destroy(); tray = null; }
}

module.exports = {
  createTray,
  refreshTrayMenu,
  destroyTray,
};
