// Captures a screenshot of the rendered UI for the README.
// Usage:  npx electron tools/capture-preview.js
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

ipcMain.handle('open-external', async () => false);
ipcMain.handle('open-app', async () => false);
ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('toggle-fullscreen', () => false);

// watchdog: never hang forever
const watchdog = setTimeout(() => {
  console.log('capture timed out');
  app.quit();
}, 20000);

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: true,
    skipTaskbar: true,
    backgroundColor: '#07090d',
    webPreferences: {
      preload: path.join(__dirname, '../src/main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const img = await win.webContents.capturePage();
      const out = path.join(__dirname, '../docs/preview.png');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, img.toPNG());
      console.log('Wrote', out);
    } catch (e) {
      console.log('Capture failed:', e.message);
    }
    clearTimeout(watchdog);
    app.quit();
  });
});
