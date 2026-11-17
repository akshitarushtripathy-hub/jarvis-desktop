const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openApp: (name) => ipcRenderer.invoke('open-app', name),
  quit: () => ipcRenderer.invoke('quit-app'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  getIdentity: () => ipcRenderer.invoke('get-identity'),
  setIdentity: (identity) => ipcRenderer.invoke('set-identity', identity),
  getAIConfig: () => ipcRenderer.invoke('ai-get-config'),
  setAIProvider: (p) => ipcRenderer.invoke('ai-set-provider', p),
  setAIKey: (p, key) => ipcRenderer.invoke('ai-set-key', p, key),
  clearAIKey: (p) => ipcRenderer.invoke('ai-clear-key', p),
  setAIModel: (p, model) => ipcRenderer.invoke('ai-set-model', p, model),
  askAI: (prompt) => ipcRenderer.invoke('ai-ask', prompt),
});
