const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("minseDesktop", {
  openEpubFile: () => ipcRenderer.invoke("book:open"),
  openMarkdownFile: () => ipcRenderer.invoke("markdown:open"),
  saveMarkdownFile: (payload) => ipcRenderer.invoke("markdown:save", payload),
  openImageWindow: (payload) => ipcRenderer.invoke("image:open", payload),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onOpenFile: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("file:open", listener);
    return () => ipcRenderer.removeListener("file:open", listener);
  },
  onOpenFileError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("file:open-error", listener);
    return () => ipcRenderer.removeListener("file:open-error", listener);
  },
  readyForOpenFiles: () => ipcRenderer.send("file:ready")
});
