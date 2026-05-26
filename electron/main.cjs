const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { appendFile, mkdir, readFile } = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 5173;
const appUrl = `http://localhost:${port}`;
let server = null;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function writeClientLog(request, response) {
  const body = await readRequestBody(request);
  const line = `${new Date().toISOString()} ${body}\n`;

  await mkdir(path.join(root, "logs"), { recursive: true });
  await appendFile(path.join(root, "logs", "app.log"), line, "utf8");

  response.writeHead(204, {
    "Cache-Control": "no-store"
  });
  response.end();
}

function resolveRequestPath(url) {
  const pathname = new URL(url, appUrl).pathname;
  const relativePath = pathname === "/" ? "web/index.html" : pathname.slice(1);
  const filePath = path.normalize(path.join(root, relativePath));

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

function createStaticServer() {
  return http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/__client-log") {
      try {
        await writeClientLog(request, response);
      } catch (error) {
        console.error("Failed to write client log", error);
        response.writeHead(500);
        response.end("Log write failed");
      }
      return;
    }

    const filePath = resolveRequestPath(request.url);

    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const content = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

function checkServer() {
  return new Promise((resolve) => {
    const request = http.get(appUrl, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  if (await checkServer()) {
    return;
  }

  server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await checkServer()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Development server did not start");
}

async function createWindow() {
  await ensureServer();

  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: "Minse EPUB Viewer",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  await window.loadURL(appUrl);
}

ipcMain.handle("book:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open EPUB",
    properties: ["openFile"],
    filters: [
      { name: "EPUB Books", extensions: ["epub"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const bytes = await readFile(filePath);

  return {
    name: path.basename(filePath),
    path: filePath,
    size: bytes.byteLength,
    type: "application/epub+zip",
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
    server = null;
  }
});
