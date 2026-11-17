const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const settings = require('./settings');
const ai = require('./ai');

let mainWindow;
let config = settings.load();

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

// --- IPC: AI provider configuration & requests -----------------------------

ipcMain.handle('get-identity', () => config.identity);

ipcMain.handle('set-identity', (_event, identity) => {
  config.identity = {
    userName: String(identity?.userName || '').trim().slice(0, 60),
    assistantName: String(identity?.assistantName || 'Jarvis').trim().slice(0, 60) || 'Jarvis',
  };
  settings.save(config);
  return config.identity;
});

ipcMain.handle('ai-get-config', () => ({
  provider: config.provider,
  models: config.models,
  providers: ai.PROVIDERS,
  configured: Object.fromEntries(
    Object.keys(config.keys).map((k) => [k, Boolean(config.keys[k])])
  ),
}));

ipcMain.handle('ai-set-provider', (_event, provider) => {
  if (!Object.prototype.hasOwnProperty.call(config.keys, provider)) return false;
  config.provider = provider;
  settings.save(config);
  return true;
});

ipcMain.handle('ai-set-key', (_event, provider, key) => {
  if (!Object.prototype.hasOwnProperty.call(config.keys, provider)) return false;
  config.keys[provider] = String(key || '').trim();
  settings.save(config);
  return true;
});

ipcMain.handle('ai-clear-key', (_event, provider) => {
  if (!Object.prototype.hasOwnProperty.call(config.keys, provider)) return false;
  config.keys[provider] = '';
  settings.save(config);
  return true;
});

ipcMain.handle('ai-set-model', (_event, provider, model) => {
  if (!Object.prototype.hasOwnProperty.call(config.models, provider)) return false;
  config.models[provider] = String(model || '').trim();
  settings.save(config);
  return true;
});

ipcMain.handle('ai-ask', async (_event, prompt) => ai.ask(config, String(prompt || '')));
