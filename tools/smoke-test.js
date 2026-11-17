// Quick UI smoke test: load the HUD, submit a typed command, verify the UI reacts.
// Usage:  npx electron tools/smoke-test.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

ipcMain.handle('open-external', async () => false);
ipcMain.handle('open-app', async () => false);
ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('toggle-fullscreen', () => false);

const watchdog = setTimeout(() => { console.log('FAIL: timed out'); app.quit(); }, 20000);

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../src/main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 600));

    const result = await win.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('cmdInput');
        input.value = 'what time is it';
        document.getElementById('cmdForm').dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true })
        );
        return new Promise((resolve) => setTimeout(() => resolve({
          transcript: document.getElementById('transcript').textContent,
          clock: document.getElementById('clock').textContent,
          status: document.getElementById('statusText').textContent,
        }), 400));
      })();
    `);

    const ok = /what time is it/i.test(result.transcript) && /\d{2}:\d{2}/.test(result.clock);
    console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(result));
    clearTimeout(watchdog);
    app.quit();
  });
});
