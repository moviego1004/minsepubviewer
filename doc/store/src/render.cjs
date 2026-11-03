// Renders the store images and the Android launcher icons: npx electron doc/store/src/render.cjs
//   doc/store/icon-1024.png, icon-512.png  (Play store icon; Electron writes opaque images as 24-bit PNG, Play
//     asks for 32-bit: python -c "from PIL import Image; [Image.open(f).convert('RGBA').save(f) for f in ('doc/store/icon-512.png', 'doc/store/icon-1024.png')]")
//   doc/store/feature-2048x1000.png, feature-1024x500.png (Play feature graphic)
//   android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground}.png
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "..");
const res = path.join(__dirname, "..", "..", "..", "android", "app", "src", "main", "res");
// Launcher sizes per density: legacy/round icons are 48dp, adaptive foregrounds 108dp.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const jobs = [
  { page: "icon.html", width: 1024, height: 1024, transparent: true, outputs: [[path.join(out, "icon-1024.png"), 1024, 1024], [path.join(out, "icon-512.png"), 512, 512]] },
  { page: "feature.html", width: 2048, height: 1000, outputs: [[path.join(out, "feature-2048x1000.png"), 2048, 1000], [path.join(out, "feature-1024x500.png"), 1024, 500]] },
  ...[["legacy", "ic_launcher", 48], ["round", "ic_launcher_round", 48], ["foreground", "ic_launcher_foreground", 108]].map(([kind, name, dp]) => ({
    page: "launcher.html", query: { kind }, width: 1024, height: 1024, transparent: true,
    outputs: Object.entries(densities).map(([density, factor]) => [path.join(res, `mipmap-${density}`, `${name}.png`), dp * factor, dp * factor])
  }))
];
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  for (const job of jobs) {
    const win = new BrowserWindow({
      show: false, width: job.width, height: job.height, useContentSize: true, enableLargerThanScreen: true,
      transparent: Boolean(job.transparent), backgroundColor: job.transparent ? "#00000000" : "#1D4ED8",
      webPreferences: { offscreen: true }
    });
    await win.loadFile(path.join(__dirname, job.page), { query: job.query || {} }).catch((error) => console.log("load", job.page, error.message));
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))");
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: job.width, height: job.height });
    for (const [file, width, height] of job.outputs) {
      fs.writeFileSync(file, image.resize({ width, height, quality: "best" }).toPNG());
      console.log(path.relative(path.join(__dirname, "..", "..", ".."), file), `${width}x${height}`);
    }
    win.destroy();
  }
  app.quit();
});
