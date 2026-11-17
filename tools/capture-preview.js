// Captures a screenshot of the rendered UI for the README.
// Usage:  npx electron tools/capture-preview.js
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

ipcMain.handle('open-external', async () => false);
ipcMain.handle('open-app', async () => false);
ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('toggle-fullscreen', () => false);
ipcMain.handle('get-identity', async () => (process.argv.includes('--onboarding')
  ? { userName: '', assistantName: 'Jarvis' }
  : { userName: 'Tony', assistantName: 'Jarvis' }));
ipcMain.handle('set-identity', async (_e, identity) => identity);
ipcMain.handle('ai-get-config', async () => ({
  provider: 'groq',
  models: { openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-latest', gemini: 'gemini-2.0-flash', groq: 'llama-3.3-70b-versatile' },
  providers: {
    openai: { name: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o'] },
    anthropic: { name: 'Claude', models: ['claude-3-5-haiku-latest'] },
    gemini: { name: 'Gemini', models: ['gemini-2.0-flash'] },
    groq: { name: 'Groq', models: ['llama-3.3-70b-versatile'] },
  },
  configured: { openai: true, anthropic: false, gemini: false, groq: true },
}));
ipcMain.handle('ai-set-provider', async () => true);
ipcMain.handle('ai-set-key', async () => true);
ipcMain.handle('ai-clear-key', async () => true);
ipcMain.handle('ai-set-model', async () => true);
ipcMain.handle('ai-ask', async () => ({ ok: true, text: 'Test answer.', provider: 'groq', model: 'llama-3.3-70b-versatile' }));

// watchdog: never hang forever
const watchdog = setTimeout(() => {
  console.log('capture timed out');
  app.quit();
}, 45000);

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
      await win.webContents.executeJavaScript('document.activeElement && document.activeElement.blur();');
      const img = await win.webContents.capturePage();
      const out = path.join(__dirname, process.argv.includes('--onboarding') ? '../docs/onboarding.png' : '../docs/preview.png');
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
