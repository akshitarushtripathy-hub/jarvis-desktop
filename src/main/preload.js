const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openApp: (name) => ipcRenderer.invoke('open-app', name),
  quit: () => ipcRenderer.invoke('quit-app'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
});
