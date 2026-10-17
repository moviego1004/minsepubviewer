// Exercise the shared reader with a simulated mobile bridge in Chromium.
// This does not replace SAF/WebView testing on an Android device.
const { app, BrowserWindow } = require("electron");
const { createServer } = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const deadlineTimer = setTimeout(() => { console.error("Reader smoke test timed out"); app.exit(1); }, 90000);

const root = path.resolve(__dirname, "..");
const { createSamplePdf } = require("./sample-pdf.cjs");
const samplePdf = createSamplePdf();
let server;
let temp;
app.whenReady().then(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "mins-reader-smoke-"));
  const zip = new (require("jszip"))();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file("book.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">mobile-smoke</dc:identifier><dc:title>EPUB 검사</dc:title><dc:language>ko</dc:language><meta property="dcterms:modified">2026-09-26T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/></spine></package>');
  zip.file("nav.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>목차</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">첫 장</a></li></ol></nav></body></html>');
  zip.file("one.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>첫 장</title></head><body><h1>EPUB 읽기 검사</h1>' + '<p>안드로이드에서도 책을 읽고 위치를 복원합니다.</p>'.repeat(100) + '</body></html>');
  const epub = await zip.generateAsync({ type: "base64" });
  const { computeBookId } = await import("../src/core/books.js");
  const bookId = computeBookId(Buffer.from(epub, "base64"));
  await fs.writeFile(path.join(temp, "preload.cjs"), `
    const content = '# 모바일 읽기 검사\\n\\n' + Array.from({ length: 120 }, (_, i) => '문단 ' + i + ' — 한글 문서를 읽습니다.\\n\\n').join('');
    const document = { path: '/app/documents/test.md', name: '한글 문서.md', content, viewMode: 'view' };
    const epubBytes = Uint8Array.from(atob('${epub}'), value => value.charCodeAt(0)).buffer;
    const epubFile = { path: '/app/documents/test.epub', name: '검사.epub', bytes: epubBytes, size: epubBytes.byteLength };
    ${process.env.READER_BINARY_SMOKE ? "" : `epubFile.epubUrl = window.location.origin + '/_epub/'; epubFile.bookId = '${bookId}'; delete epubFile.bytes;`}
    // The assertions below check Korean UI text; English is checked separately at the end.
    if (!localStorage.getItem("minsepubviewer.language")) localStorage.setItem("minsepubviewer.language", "ko");
    // PDF.js comes from the mobile build output, as on Android (run npm run build:mobile first).
    window.MINS_PDFJS_BASE = '/dist/mobile/vendor/pdfjs/';
    const pdfFile = { path: '/app/documents/sample.pdf', name: 'sample.pdf', size: ${samplePdf.length}, pdfUrl: window.location.origin + '/_pdf/sample.pdf', type: 'application/pdf' };
    window.minsePlatform = {
      kind: 'android', isMobile: true, storage: window.localStorage,
      log() {}, flush: async () => {},
      openMarkdownFile: async () => ({ ...document }),
      openEpubFile: async () => ({ ...epubFile }),
      // The toolbar's 파일 열기 uses openFile; tests choose Markdown with window.__nextOpenKind.
      openFile: async () => {
        const kind = window.__nextOpenKind;
        window.__nextOpenKind = '';
        if (kind === 'markdown') return { kind, document: { ...document } };
        if (kind === 'pdf') return { kind, file: { ...pdfFile } };
        return { kind: 'epub', file: { ...epubFile } };
      },
      setFullscreen: async enabled => { window.__immersive = enabled; },
      onExternalDocument: callback => {
        window.__external = callback;
        if (sessionStorage.getItem('incoming-file')) {
          sessionStorage.removeItem('incoming-file');
          return callback({kind:'markdown',document:{...document,path:'/app/documents/shared.md',name:'shared.md',content:'# 공유 받은 문서',viewMode:'view'}});
        }
      },
      openRecentFile: async (path) => path.endsWith('.pdf') ? { kind: 'pdf', file: { ...pdfFile } } : path.endsWith('.epub') ? { kind: 'epub', file: { ...epubFile } } : { kind: 'markdown', document: { ...document } },
      getRecentFiles: async () => [{ path: document.path, name: document.name }, { path: epubFile.path, name: epubFile.name }],
      onBackground(callback) { window.__background = callback; },
      onBackButton(callback) { window.__back = callback; },
      saveMarkdownFile: async ({content}) => ({ name: document.name, path: document.path }),
      exit: async () => {},
    };
  `);
  const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".html": "text/html", ".xhtml": "application/xhtml+xml", ".xml": "application/xml", ".opf": "application/xml" };
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/_pdf/sample.pdf") {
      response.setHeader("Content-Type", "application/pdf");
      response.end(samplePdf);
      return;
    }
    if (url.pathname.startsWith("/_epub/")) {
      const entry = zip.file(url.pathname.slice("/_epub/".length));
      if (!entry) { response.writeHead(404).end(); return; }
      response.setHeader("Content-Type", mime[path.extname(url.pathname)] || "application/octet-stream");
      response.end(await entry.async("nodebuffer"));
      return;
    }
    const file = path.resolve(root, url.pathname === "/" ? "web/index.html" : `.${url.pathname}`);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      let content = await fs.readFile(file);
      if (file === path.join(root, "web/index.html")) content = content.toString().replace('</head>', '<link rel="stylesheet" href="/web/mobile.css"></head>').replace('<body>', '<body class="platform-android">');
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const win = new BrowserWindow({ width: 412, height: 860, useContentSize: true, show: false, webPreferences: {
    preload: path.join(temp, "preload.cjs"), contextIsolation: false, sandbox: false, backgroundThrottling: false, partition: `smoke-${Date.now()}`
  } });
  const errors = [];
  win.webContents.on("will-prevent-unload", (event) => event.preventDefault());
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") { errors.push(event.message); console.error(event.message); }
  });
  const run = (code) => win.webContents.executeJavaScript(code, true);
  win.webContents.debugger.attach("1.3");
  const touch = async (from, to = from) => {
    const send = (type, point) => win.webContents.debugger.sendCommand("Input.dispatchTouchEvent", {
      type, touchPoints: point ? [{ x: point.x, y: point.y, id: 0, radiusX: 2, radiusY: 2, force: 1 }] : []
    });
    // Queue the whole gesture before waiting for Chromium's acknowledgement.
    // A hidden window can delay touch acknowledgements by a second.
    const pending = [send("touchStart", from)];
    await new Promise(resolve => setTimeout(resolve, 25));
    if (to !== from) for (let i = 1; i <= 5; i++) {
      pending.push(send("touchMove", { x: from.x + (to.x - from.x) * i / 5, y: from.y + (to.y - from.y) * i / 5 }));
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    pending.push(send("touchEnd"));
    await Promise.all(pending);
  };
  const waitFor = async (expression) => {
    const deadline = Date.now() + 10000;
    while (!await run(expression)) {
      if (Date.now() > deadline) throw new Error(`Timeout: ${expression}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  console.log("Reader page loaded");
  await waitFor("!!window.__back");
  await run(`document.body.classList.add('platform-android'); const css = document.createElement('link'); css.rel='stylesheet'; css.href='/web/mobile.css'; document.head.append(css); window.__nextOpenKind = 'markdown'; document.querySelector('#openFileButton').click()`);
  await waitFor("document.querySelector('#markdownViewer .toastui-editor-contents h1')?.textContent === '모바일 읽기 검사'");
  await run("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await run("document.body.classList.contains('sidebar-collapsed') && document.body.classList.contains('settings-collapsed')"), true);
  await run("document.querySelector('#markdownViewer').scrollTop = 600; window.__background()");
  const position = await run("JSON.parse(localStorage.getItem('minsepubviewer.position:/app/documents/test.md')).scrollTop");
  console.log("Saved Markdown position:", position);
  assert.ok(position > 0, "Markdown reading position was saved");
  assert.deepEqual(await run("JSON.parse(localStorage.getItem('minsepubviewer.markdown-drafts'))"), [], "Reading alone must not mark the source modified");
  await Promise.all([new Promise((resolve) => win.webContents.once("did-finish-load", resolve)), win.reload()]);
  console.log("Reader reloaded");
  await waitFor("document.querySelector('#markdownViewer .toastui-editor-contents h1')?.textContent === '모바일 읽기 검사'");
  await waitFor("document.querySelector('#markdownViewer').scrollTop > 0");
  console.log("Reading position restored");
  await run("document.querySelector('#markdownViewer').scrollTop = 940; document.querySelector('.document-tab.is-active button[title=\"탭 닫기\"]').click()");
  await waitFor("document.querySelectorAll('.document-tab').length === 0");
  await Promise.all([new Promise((resolve) => win.webContents.once("did-finish-load", resolve)), win.reload()]);
  await waitFor("!!window.__back");
  await run("document.querySelector('#recentFilesButton').click()");
  await waitFor("document.querySelectorAll('.recent-file-item').length === 2");
  await run("document.querySelectorAll('.recent-file-item')[0].click()");
  await waitFor("document.querySelector('#markdownViewer')?.scrollTop >= 930");
  await run(`document.body.classList.add('platform-android'); const css = document.createElement('link'); css.rel='stylesheet'; css.href='/web/mobile.css'; document.head.append(css);`);
  await run("document.querySelector('#leftPanelToggle').click()");
  assert.equal(await run("document.body.classList.contains('sidebar-collapsed')"), false);
  await run("window.__back()");
  assert.equal(await run("document.body.classList.contains('sidebar-collapsed')"), true);
  await fs.mkdir(path.join(root, "build"), { recursive: true });
  await fs.writeFile(path.join(root, "build/mobile-smoke.png"), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('#newMarkdownButton').click()");
  await waitFor("document.querySelectorAll('.document-tab').length === 2");
  await run("window.__background()");
  assert.equal(await run("JSON.parse(localStorage.getItem('minsepubviewer.markdown-drafts')).length"), 1);
  await Promise.all([new Promise((resolve) => win.webContents.once("did-finish-load", resolve)), win.reload()]);
  await waitFor("document.querySelectorAll('.document-tab').length === 2");
  await run("[...document.querySelectorAll('.document-tab-label')].find(el => el.textContent.includes('untitled.md')).click()");
  await waitFor("document.querySelector('#markdownViewer')?.textContent.includes('새 Markdown 문서')");
  await run("window.confirm = () => false; window.__back()");
  assert.equal(await run("document.querySelectorAll('.document-tab').length"), 2, "Cancel keeps the draft open");
  await run("let answers = [false, true]; window.confirm = () => answers.shift(); window.__back()");
  await waitFor("document.querySelectorAll('.document-tab').length === 1");
  assert.deepEqual(await run("JSON.parse(localStorage.getItem('minsepubviewer.markdown-drafts'))"), []);
  await run("document.querySelector('#openBookButton').click()");
  const epubLocation = "JSON.parse(localStorage.getItem('minsepubviewer.library')).books.find(book => book.filePath === '/app/documents/test.epub')?.lastLocation";
  await waitFor(`(${epubLocation} || '').startsWith('epubcfi(')`);
  const firstLocation = await run(epubLocation);
  const controls = await run("(()=>{const r = document.querySelector('#mobileNextButton').getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2, visible:r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth };})()");
  assert.ok(controls.visible, "Mobile page buttons must be inside the visible viewport");
  await touch(controls);
  await waitFor(`${epubLocation} !== ${JSON.stringify(firstLocation)}`);
  await run("window.__background()");
  const nextLocation = await run(epubLocation);
  const area = await run("(()=>{const r=document.querySelector('#reader').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()");
  const middle = { x: area.left + area.width / 2, y: area.top + area.height / 2 };
  const tapTop = { x: middle.x, y: area.top + area.height * 0.15 };
  const tapBottom = { x: middle.x, y: area.top + area.height * 0.85 };
  await touch(tapBottom);
  await waitFor(`${epubLocation} !== ${JSON.stringify(nextLocation)}`);
  let current = await run(epubLocation);
  await touch(tapTop);
  await waitFor(`${epubLocation} !== ${JSON.stringify(current)}`);
  for (const offset of [{ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: -100 }, { x: 0, y: 100 }]) {
    current = await run(epubLocation);
    await touch(middle, { x: middle.x + offset.x, y: middle.y + offset.y });
    await waitFor(`${epubLocation} !== ${JSON.stringify(current)}`);
  }
  await run("document.querySelector('#mobileBookmarkButton').click()");
  assert.equal(await run("JSON.parse(localStorage.getItem('minsepubviewer.library')).books.find(book => book.filePath === '/app/documents/test.epub').bookmarks.length"), 1);
  await run("window.__background()");
  const restoredLocation = await run(epubLocation);
  const restoredPageLabel = await run("document.querySelector('#mobilePageLabel').textContent");
  await Promise.all([new Promise((resolve) => win.webContents.once("did-finish-load", resolve)), win.reload()]);
  await waitFor("!!document.querySelector('#reader iframe')?.contentDocument?.querySelector('h1')");
  await waitFor(`document.querySelector('#mobilePageLabel').textContent === ${JSON.stringify(restoredPageLabel)} && !document.querySelector('#mobilePrevButton').disabled`);
  assert.equal(await run(epubLocation), restoredLocation, "EPUB CFI survives restart");
  await run("document.querySelector('.document-tab.is-active button[title=\"탭 닫기\"]').click()");
  await waitFor("document.querySelectorAll('.document-tab').length === 0");
  await Promise.all([new Promise((resolve) => win.webContents.once("did-finish-load", resolve)), win.reload()]);
  await waitFor("!!window.__back");
  await run("document.querySelector('#recentFilesButton').click()");
  await waitFor("document.querySelectorAll('.recent-file-item').length === 2");
  await run("document.querySelectorAll('.recent-file-item')[1].click()");
  await waitFor("!!document.querySelector('#reader iframe')?.contentDocument?.querySelector('h1')");
  await waitFor(`document.querySelector('#mobilePageLabel').textContent === ${JSON.stringify(restoredPageLabel)} && !document.querySelector('#mobilePrevButton').disabled`);
  assert.equal(await run(epubLocation), restoredLocation, "Recent EPUB reopens at its last reading position");
  assert.ok(await run("Math.abs(document.querySelector('#reader').getBoundingClientRect().bottom - document.querySelector('.mobile-reader-navigation').getBoundingClientRect().top) < 2"), 'Reader must fill the space down to navigation');
  await run("document.querySelector('#mobileFullscreen').click()");
  await waitFor("document.body.classList.contains('mobile-fullscreen') && window.__immersive");
  await waitFor("document.querySelector('#reader').clientHeight >= innerHeight - 2");
  const fullArea = await run("(()=>{const r=document.querySelector('#reader').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await touch(fullArea);
  await waitFor("!document.body.classList.contains('mobile-fullscreen')");
  const pinch = async (start, end, selector = '#reader') => {
    const center = await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const send = (type, gap) => win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', {type,touchPoints:gap ? [{x:center.x-gap/2,y:center.y,id:0},{x:center.x+gap/2,y:center.y,id:1}] : []});
    const pending = [send('touchStart',start)];
    for(let i=1;i<=5;i++) { await new Promise(r=>setTimeout(r,20)); pending.push(send('touchMove',start+(end-start)*i/5)); }
    pending.push(send('touchEnd',0)); await Promise.all(pending);
  };
  const font = "JSON.parse(localStorage.getItem('minsepubviewer.library')).books.find(book => book.filePath === '/app/documents/test.epub').settings.fontSize";
  const beforeFont = await run(font);
  await pinch(80,120);
  await waitFor(`${font} > ${beforeFont}`);
  const enlarged = await run(font);
  await run("document.querySelector('#mobileNextButton').click()");
  assert.equal(await run(font), enlarged, 'Font survives page turn');
  await run("window.__background()");
  await Promise.all([new Promise(resolve=>win.webContents.once('did-finish-load',resolve)),win.reload()]);
  await waitFor("document.querySelector('#mobilePageLabel')?.textContent.includes('장')");
  assert.equal(await run(font), enlarged, 'Font survives restart');
  await waitFor(`parseFloat(getComputedStyle(document.querySelector('#reader iframe').contentDocument.body).fontSize) === ${enlarged}`);
  await pinch(120,80);
  await waitFor(`${font} < ${enlarged}`);
  await run("document.querySelector('#mobileFullscreen').click(); window.__background()");
  await Promise.all([new Promise(resolve=>win.webContents.once('did-finish-load',resolve)),win.reload()]);
  await waitFor("document.body.classList.contains('mobile-fullscreen') && window.__immersive && document.querySelector('#reader iframe')");
  await fs.writeFile(path.join(root, 'build/mobile-fullscreen-smoke.png'), (await win.webContents.capturePage()).toPNG());
  await run('window.__back()');
  await waitFor("!document.body.classList.contains('mobile-fullscreen')");
  await run("window.__nextOpenKind = 'markdown'; document.querySelector('#openFileButton').click()");
  await waitFor("document.querySelector('#markdownViewer')?.textContent.includes('모바일 읽기 검사')");
  const mdFont = "JSON.parse(localStorage.getItem('minsepubviewer.reading-settings:/app/documents/test.md') || '{}').fontSize";
  await pinch(80,120,'#markdownViewer');
  await waitFor(`${mdFont} > 18`);
  const savedMdFont = await run(mdFont);
  await run('window.__background()');
  await Promise.all([new Promise(resolve=>win.webContents.once('did-finish-load',resolve)),win.reload()]);
  await waitFor("document.querySelector('#markdownViewer')?.textContent.includes('모바일 읽기 검사')");
  assert.equal(await run(mdFont), savedMdFont, 'Markdown font survives restart');
  assert.ok(await run("parseFloat(getComputedStyle(document.querySelector('#markdownViewer .toastui-editor-contents')).fontSize) > 16"), 'Markdown rendered font enlarged');
  await run("document.querySelector('#mobileOpenFile').click()");
  await waitFor("document.querySelector('#mobilePageLabel')?.textContent.includes('장')");
  await run("document.querySelector('#mobileDocuments').click()");
  await waitFor("document.querySelectorAll('.mobile-document-row').length === 2");
  await run("document.querySelector('.mobile-menu').close()");
  await run("document.querySelector('#mobileRecent').click()");
  await waitFor("document.querySelectorAll('.recent-file-item').length === 2 && document.querySelector('#recentFilesMenu').getBoundingClientRect().height > 0");
  await run("document.querySelector('#mobileRecent').click()");
  await fs.writeFile(path.join(root, "build/mobile-epub-smoke.png"), (await win.webContents.capturePage()).toPNG());
  await waitFor("typeof window.__external === 'function'");
  await run("window.__external({kind:'markdown',document:{path:'/app/documents/shared.md',name:'shared.md',content:'# 공유 받은 문서',viewMode:'view'}})");
  await waitFor("document.querySelector('#markdownViewer')?.textContent.includes('공유 받은 문서')");
  await run("document.querySelector('#mobileOpenFile').click()");
  await waitFor("document.querySelector('#mobilePageLabel')?.textContent.includes('장')");
  await run("window.__background(); sessionStorage.setItem('incoming-file','1')");
  await Promise.all([new Promise(resolve=>win.webContents.once('did-finish-load',resolve)),win.reload()]);
  await waitFor("document.querySelector('#markdownViewer')?.textContent.includes('공유 받은 문서')");
  assert.ok(await run("document.querySelector('.document-tab.is-active').textContent.includes('shared.md')"), 'Incoming document takes priority after session restoration');
  await run("window.__nextOpenKind = 'pdf'; document.querySelector('#mobileOpenFile').click()");
  await waitFor("document.body.classList.contains('pdf-mode') && document.querySelector('#mobilePageLabel').textContent === '1 / 3' && document.querySelector('#pdfViewer .page canvas')");
  const pdfBox = await run("(() => { const r = document.querySelector('#pdfContainer').getBoundingClientRect(); return { x: r.left + r.width / 2, bottom: r.top + r.height * 0.85 }; })()");
  await touch({ x: pdfBox.x, y: pdfBox.bottom });
  await waitFor("document.querySelector('#mobilePageLabel').textContent === '2 / 3'");
  await run("window.__background()");
  await Promise.all([new Promise(resolve=>win.webContents.once('did-finish-load',resolve)),win.reload()]);
  await waitFor("document.body.classList.contains('pdf-mode') && document.querySelector('#mobilePageLabel').textContent === '2 / 3'");
  await run("const select = document.querySelector('#languageSelect'); select.value = 'en'; select.dispatchEvent(new Event('change'))");
  await waitFor("document.documentElement.lang === 'en' && document.querySelector('#mobileOpenFile').textContent === 'Open file' && document.querySelector('#bookmarksTab').textContent === 'Bookmarks' && document.querySelector('#mobilePrevButton').textContent === 'Prev'");
  await Promise.all([new Promise(resolve=>win.webContents.once('did-finish-load',resolve)),win.reload()]);
  await waitFor("document.documentElement.lang === 'en' && document.querySelector('#saveMarkdownButton')?.textContent === 'Save' && document.querySelector('#mobileRecent').textContent === 'Continue'");
  assert.deepEqual(errors, []);
  console.log("PASS: EPUB/MD position and font restore, pinch in/out, fullscreen and center tap, full reader height, recent/open documents menus, page gestures, bookmarks, draft recovery, PDF by URL with tap paging and resume, and Korean/English UI switch (simulated native bridge).");
  win.destroy();
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  clearTimeout(deadlineTimer);
  if (server) server.close();
  if (temp && path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith("mins-reader-smoke-")) {
    await fs.rm(temp, { recursive: true, force: true });
  }
  app.exit(process.exitCode || 0);
});
