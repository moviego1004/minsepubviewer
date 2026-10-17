// Exercise converted documents (DOCX, HWPX, XML HWP) in the shared reader (browser platform):
// open, page steps, highlight, search, bookmark, resume and language. Binary HWP 5.0 needs the
// desktop main process and is checked by launching the app with a file instead.
const { app, BrowserWindow } = require("electron");
const { createServer } = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createSampleDocx, createSampleHwpml, createSampleHwpx } = require("./sample-documents.cjs");
const deadlineTimer = setTimeout(() => { console.error("Document smoke test timed out"); app.exit(1); }, 120000);

const root = path.resolve(__dirname, "..");
const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".wasm": "application/wasm", ".png": "image/png" };

let server;
app.whenReady().then(async () => {
  const samples = {
    "sample.docx": await createSampleDocx(),
    "sample.hwpx": await createSampleHwpx(),
    "sample.hwp": createSampleHwpml()
  };
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
    contextIsolation: true, sandbox: true, backgroundThrottling: false, partition: `doc-smoke-${Date.now()}`
  } });
  const errors = [];
  win.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") { errors.push(event.message); console.error(event.message); }
  });
  const run = (code) => win.webContents.executeJavaScript(code, true);
  const frame = (expression) => `(() => { const doc = document.querySelector('#docFrame').contentDocument; return ${expression}; })()`;
  const waitFor = async (expression, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (!await run(expression)) {
      if (Date.now() > deadline) {
        const status = await run("document.querySelector('#bookMeta')?.textContent").catch(() => "");
        throw new Error(`Timeout: ${expression}\n  status: ${status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const open = (name) => run(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(samples[name].toString("base64"))}), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], ${JSON.stringify(name)}));
    const input = document.querySelector("#fileInput");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change"));
  })()`);
  const load = async () => {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    await waitFor("document.querySelector('#bookTitle')?.textContent.length > 0");
  };
  const opened = (heading) => waitFor(`document.body.classList.contains('doc-mode') && ${frame(`doc?.body?.textContent.includes(${JSON.stringify(heading)})`)} && /^\\d+ \\/ \\d+$/.test(document.querySelector('#pageLabel').textContent)`);

  await load();
  await run("localStorage.setItem('minsepubviewer.language', 'ko')");
  await load();

  await open("sample.docx");
  await opened("DOCX 검사 문서");
  assert.ok(await run(frame("doc.querySelector('h1')?.textContent === 'DOCX 검사 문서' && doc.querySelectorAll('table td').length === 2")), "DOCX heading and table are converted");
  assert.equal(await run(frame("doc.querySelectorAll('script').length")), 0);
  console.log("DOCX opened");

  await run("document.querySelector('#nextButton').click()");
  await waitFor(frame("doc.scrollingElement.scrollTop > 100"));
  await run(`(() => {
    const doc = document.querySelector('#docFrame').contentDocument;
    const paragraph = [...doc.querySelectorAll('p')].find((item) => item.textContent.includes('DOCX 문단 30 '));
    paragraph.scrollIntoView();
    const range = doc.createRange();
    range.selectNodeContents(paragraph.firstChild);
    doc.getSelection().removeAllRanges();
    doc.getSelection().addRange(range);
  })()`);
  await waitFor("!document.querySelector('#selectionToolbar').hidden");
  await run("document.querySelector('#yellowSelectionButton').click()");
  await waitFor(frame("doc.querySelectorAll('mark.mins-doc-mark.is-yellow').length === 1"));
  await waitFor("document.querySelector('#annotationList').textContent.includes('DOCX 문단 30')");
  await run("document.querySelector('#bookmarkButton').click()");
  await waitFor("document.querySelector('#bookmarkList')?.textContent.includes('% 위치')");
  const savedScroll = await run(frame("doc.scrollingElement.scrollTop"));
  console.log("DOCX highlight and bookmark stored");

  await run("document.querySelector('#searchTab').click(); document.querySelector('#searchInput').value = '문단 7'; document.querySelector('#searchForm').requestSubmit()");
  await waitFor("/결과 \\d+개/.test(document.querySelector('#searchStatus').textContent)");
  assert.ok(await run(frame("doc.querySelectorAll('mark.is-search').length >= 1 && doc.querySelector('mark.is-search.is-active')")));
  await run("document.querySelector('#searchInput').value = '없는검색어'; document.querySelector('#searchForm').requestSubmit()");
  await waitFor("document.querySelector('#searchStatus').textContent === '결과가 없습니다.'");
  assert.ok(await run(frame("doc.querySelectorAll('mark.is-search').length === 0 && doc.querySelectorAll('mark.is-yellow').length === 1")), "highlights stay after clearing search");
  console.log("DOCX search works");

  await new Promise((resolve) => setTimeout(resolve, 600));
  await load();
  await open("sample.docx");
  await opened("DOCX 검사 문서");
  await waitFor(frame(`Math.abs(doc.scrollingElement.scrollTop - ${savedScroll}) < 40 && doc.querySelectorAll('mark.is-yellow').length === 1`));
  assert.ok(await run("document.querySelector('#bookmarkButton').classList.contains('is-active')"), "bookmark is restored");
  console.log("DOCX position, highlight and bookmark restored");

  await open("sample.hwpx");
  await opened("HWPX 검사 문서");
  assert.ok(await run(frame("doc.querySelectorAll('table.hwp-table td').length === 1")));
  console.log("HWPX opened");

  await open("sample.hwp");
  await opened("HWPML 검사 문서");
  assert.ok(await run(frame("doc.querySelectorAll('p').length === 31")));
  console.log("XML HWP opened");

  await run("document.querySelector('#theme').value = 'dark'; document.querySelector('#theme').dispatchEvent(new Event('change'))");
  await waitFor(frame("doc.documentElement.style.getPropertyValue('--doc-bg') === '#1d1f21'"));
  await run("const select = document.querySelector('#languageSelect'); select.value = 'en'; select.dispatchEvent(new Event('change'))");
  await waitFor("document.querySelector('#bookMeta').textContent.includes('read-only')");

  await fs.mkdir(path.join(root, "build"), { recursive: true });
  await fs.writeFile(path.join(root, "build/document-smoke.png"), (await win.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  console.log("PASS: DOCX, HWPX and XML HWP open, page steps, highlight, bookmark, search, resume, theme and language (browser platform).");
  win.destroy();
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  clearTimeout(deadlineTimer);
  if (server) server.close();
  app.exit(process.exitCode || 0);
});
