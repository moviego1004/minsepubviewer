// Renders the store images: npx electron doc/store/src/render.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "..");
const jobs = [["icon.html", 1024, 1024, "icon-1024.png"], ["feature.html", 2048, 1000, "feature-2048x1000.png"]];
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  for (const [file, width, height, name] of jobs) {
    const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
    await win.loadFile(path.join(__dirname, file)).catch((error) => console.log("load", file, error.message));
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))");
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
    fs.writeFileSync(path.join(out, name), image.resize({ width, height }).toPNG());
    win.destroy();
  }
  app.quit();
});
