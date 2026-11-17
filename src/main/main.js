const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: display.workArea.x,
    y: display.workArea.y,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#07090d',
    fullscreen: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC: expose only the narrow actions the UI needs -----------------------

ipcMain.handle('open-external', async (_event, url) => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    await shell.openExternal(parsed.toString());
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('open-app', async (_event, name) => {
  const apps = {
    youtube: 'https://www.youtube.com',
    chrome: 'https://www.google.com',
    github: 'https://github.com',
    reddit: 'https://www.reddit.com',
    spotify: 'https://open.spotify.com',
    gmail: 'https://mail.google.com',
    google: 'https://www.google.com',
  };
  const url = apps[name];
  if (!url) return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('quit-app', () => app.quit());

ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});
