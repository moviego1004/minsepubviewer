const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("minseDesktop", {
  openEpubFile: () => ipcRenderer.invoke("book:open"),
  openMarkdownFile: () => ipcRenderer.invoke("markdown:open"),
  saveMarkdownFile: (payload) => ipcRenderer.invoke("markdown:save", payload),
  openImageWindow: (payload) => ipcRenderer.invoke("image:open", payload)
});
