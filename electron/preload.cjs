const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("minseDesktop", {
  openEpubFile: () => ipcRenderer.invoke("book:open"),
  openMarkdownFile: () => ipcRenderer.invoke("markdown:open"),
  openRecentFile: (filePath) => ipcRenderer.invoke("recent:open", filePath),
  getRecentFiles: () => ipcRenderer.invoke("recent:list"),
  openFileInNewWindow: (filePath) => ipcRenderer.invoke("window:open-file", filePath),
  saveMarkdownFile: (payload) => ipcRenderer.invoke("markdown:save", payload),
  confirmSaveChanges: (payload) => ipcRenderer.invoke("document:confirm-save", payload),
  completeWindowClose: (shouldClose) => ipcRenderer.send("window:close-complete", Boolean(shouldClose)),
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
  onWindowCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("window:close-requested", listener);
    return () => ipcRenderer.removeListener("window:close-requested", listener);
  },
  readyForOpenFiles: () => ipcRenderer.send("file:ready")
});
