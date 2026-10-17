// Exercise PDF reading in the shared reader (browser platform) inside Chromium:
// open, page turns, resume, bookmarks, highlights, search, theme and language.
// It does not replace checks with real-world PDFs or an Android device.
const { app, BrowserWindow } = require("electron");
const { createServer } = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const deadlineTimer = setTimeout(() => { console.error("PDF smoke test timed out"); app.exit(1); }, 90000);

const root = path.resolve(__dirname, "..");
const mime = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html",
  ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png"
};

const { createSamplePdf } = require("./sample-pdf.cjs");

let server;
app.whenReady().then(async () => {
  const pdf = createSamplePdf();
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const file = path.resolve(root, url.pathname === "/" ? "web/index.html" : `.${url.pathname}`);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: {
    contextIsolation: true, sandbox: true, backgroundThrottling: false, partition: `pdf-smoke-${Date.now()}`
  } });
  const errors = [];
  win.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  win.webContents.on("console-message", (event) => {
    if (process.env.PDF_SMOKE_DEBUG) console.log(`[${event.level}] ${event.message}`);
    if (event.level === "error") { errors.push(event.message); console.error(event.message); }
  });
  const run = (code) => win.webContents.executeJavaScript(code, true);
  const waitFor = async (expression, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (!await run(expression)) {
      if (Date.now() > deadline) {
        const status = await run("document.querySelector('#bookMeta')?.textContent + ' | ' + document.querySelector('#pdfViewer')?.textContent.slice(0, 200)").catch(() => "");
        throw new Error(`Timeout: ${expression}
  status: ${status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const openPdf = () => run(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(pdf.toString("base64"))}), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "sample.pdf", { type: "application/pdf" }));
    const input = document.querySelector("#bookInput");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change"));
  })()`);
  const load = async () => {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    await waitFor("document.querySelector('#bookTitle')?.textContent.length > 0");
  };

  await load();
  await run("localStorage.setItem('minsepubviewer.language', 'ko')");
  await load();
  await openPdf();
  await waitFor("document.body.classList.contains('pdf-mode') && document.querySelectorAll('#pdfViewer .page').length >= 1");
  await waitFor("document.querySelector('#pageLabel').textContent === '1 / 3'");
  console.log("PDF opened");

  await waitFor("document.querySelectorAll('#tocList .list-item').length === 3");
  await run("document.querySelectorAll('#tocList .list-item')[2].click()");
  await waitFor("document.querySelector('#pageLabel').textContent === '3 / 3'");
  await run("document.querySelector('#prevButton').click()");
  await waitFor("document.querySelector('#pageLabel').textContent === '2 / 3'");
  console.log("Outline and page turns work");

  await run("document.querySelector('#bookmarkButton').click()");
  await waitFor("document.querySelector('#bookmarkList')?.textContent.includes('2쪽')");

  await waitFor("[...document.querySelectorAll('.page[data-page-number=\"2\"] .textLayer span')].some((span) => span.textContent.includes('Highlight'))");
  await run(`(() => {
    const span = [...document.querySelectorAll('.page[data-page-number="2"] .textLayer span')].find((item) => item.textContent.includes('Highlight'));
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  })()`);
  await waitFor("!document.querySelector('#selectionToolbar').hidden");
  await run("document.querySelector('#yellowSelectionButton').click()");
  await waitFor("document.querySelectorAll('.page[data-page-number=\"2\"] .mins-pdf-highlight.is-yellow').length > 0");
  await waitFor("document.querySelector('#annotationList').textContent.includes('Highlight target text on page 2')");
  const markBox = await run("(() => { const r = document.querySelector('.mins-pdf-highlight').getBoundingClientRect(); return { width: r.width, height: r.height }; })()");
  assert.ok(markBox.width > 50 && markBox.height > 5, `highlight has a visible size: ${JSON.stringify(markBox)}`);
  console.log("Bookmark and highlight stored");

  await run("document.querySelector('#searchTab').click(); document.querySelector('#searchInput').value = 'Sample'; document.querySelector('#searchForm').requestSubmit()");
  await waitFor("/결과 \\d+\\/3/.test(document.querySelector('#searchStatus').textContent)");
  await waitFor("document.querySelectorAll('#searchResults .search-result').length === 3");
  console.log("Search works");

  await run("document.querySelector('#theme').value = 'dark'; document.querySelector('#theme').dispatchEvent(new Event('change'))");
  await waitFor("document.body.classList.contains('theme-dark') && document.querySelectorAll('#pdfViewer .page').length >= 1");
  await run("document.querySelector('#pdfZoomSelect').value = 'page-fit'; document.querySelector('#pdfZoomSelect').dispatchEvent(new Event('change'))");
  await waitFor("document.querySelector('#pdfZoomSelect').value === 'page-fit'");
  await run("document.querySelector('#nextButton').click()");
  await waitFor("document.querySelector('#pageLabel').textContent === '3 / 3'");
  await new Promise((resolve) => setTimeout(resolve, 700));

  await load();
  await openPdf();
  await waitFor("document.querySelector('#pageLabel').textContent === '3 / 3' && document.querySelector('#pdfZoomSelect').value === 'page-fit'");
  await run("document.querySelector('#prevButton').click()");
  await waitFor("document.querySelectorAll('.page[data-page-number=\"2\"] .mins-pdf-highlight').length > 0");
  assert.ok(await run("document.querySelector('#bookmarkButton').classList.contains('is-active')"), "page 2 bookmark is restored");
  console.log("Reading position, zoom, bookmark and highlight restored");

  await run("const select = document.querySelector('#languageSelect'); select.value = 'en'; select.dispatchEvent(new Event('change'))");
  await waitFor("document.querySelector('#pdfSpreadButton').textContent === 'Two-page view' && document.querySelector('#bookmarkList').textContent.includes('Page 2')");

  await fs.mkdir(path.join(root, "build"), { recursive: true });
  await fs.writeFile(path.join(root, "build/pdf-smoke.png"), (await win.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  console.log("PASS: PDF open, outline, page turns, bookmark, highlight, search, theme, zoom, resume and language (browser platform).");
  win.destroy();
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  clearTimeout(deadlineTimer);
  if (server) server.close();
  app.exit(process.exitCode || 0);
});
