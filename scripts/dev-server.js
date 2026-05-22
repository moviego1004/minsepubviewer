import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT) || 5173;

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

  await mkdir(join(root, "logs"), { recursive: true });
  await appendFile(join(root, "logs", "app.log"), line, "utf8");

  response.writeHead(204, {
    "Cache-Control": "no-store"
  });
  response.end();
}

function resolveRequestPath(url) {
  const pathname = new URL(url, `http://localhost:${port}`).pathname;
  const relativePath = pathname === "/" ? "web/index.html" : pathname.slice(1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

const server = createServer(async (request, response) => {
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
      "Content-Type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Minse EPUB Viewer dev server: http://localhost:${port}`);
});

