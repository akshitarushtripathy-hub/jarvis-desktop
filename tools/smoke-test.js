// Quick UI smoke test: load the HUD, submit a typed command, verify the UI reacts.
// Usage:  npx electron tools/smoke-test.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

ipcMain.handle('open-external', async () => false);
ipcMain.handle('open-app', async () => false);
ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('toggle-fullscreen', () => false);
ipcMain.handle('get-identity', async () => ({ userName: 'Tony', assistantName: 'Jarvis' }));
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

    const aiResult = await win.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('cmdInput');
        input.value = 'what is the capital of france';
        document.getElementById('cmdForm').dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true })
        );
        return new Promise((resolve) => setTimeout(() => resolve({
          transcript: document.getElementById('transcript').textContent,
          status: document.getElementById('statusText').textContent,
        }), 600));
      })();
    `);

    const ok = /what time is it/i.test(result.transcript)
      && /\d{2}:\d{2}/.test(result.clock)
      && /capital of france/i.test(aiResult.transcript)
      && /Groq/i.test(aiResult.status);
    console.log(ok ? 'PASS' : 'FAIL', JSON.stringify({ clock: result, ai: aiResult }));
    clearTimeout(watchdog);
    app.quit();
  });
});
