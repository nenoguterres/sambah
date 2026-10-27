const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sambahDesktop", {
  retry: () => ipcRenderer.send("sambah:retry"),
  quit: () => ipcRenderer.send("sambah:quit"),
  platform: process.platform
});
