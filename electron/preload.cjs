const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("minseDesktop", {
  openEpubFile: () => ipcRenderer.invoke("book:open"),
  openImageWindow: (payload) => ipcRenderer.invoke("image:open", payload)
});
