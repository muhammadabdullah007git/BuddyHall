const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),
    saveServerUrl: (url) => ipcRenderer.invoke('save-server-url', url),
    clearServerUrl: () => ipcRenderer.invoke('clear-server-url'),
});
