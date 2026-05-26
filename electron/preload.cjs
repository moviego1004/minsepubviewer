const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("minseDesktop", {
  openEpubFile: () => ipcRenderer.invoke("book:open")
});
