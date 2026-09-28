const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { mkdir, readFile, writeFile, rm } = require("node:fs/promises");
const JSZip = require("jszip");
const { createEpubDocument, removeExtractedDocument } = require("../../electron/epubDocument.cjs");

async function buildEpub2Fixture(destPath) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">NCX Book</dc:title></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine></package>`
  );
  // First tag is not navPoint and navPoints are nested — this triggered the
  // old infinite loop / TOC-swallowing regression.
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>NCX Book</text></docTitle><navMap><navPoint id="a" playOrder="1"><navLabel><text>Chapter 1</text></navLabel><content src="ch1.xhtml"/><navPoint id="a1" playOrder="2"><navLabel><text>Section 1.1</text></navLabel><content src="ch1.xhtml#s1"/></navPoint></navPoint><navPoint id="b" playOrder="3"><navLabel><text>Chapter 2</text></navLabel><content src="ch2.xhtml"/></navPoint></navMap></ncx>`
  );
  zip.file("OEBPS/ch1.xhtml", `<html><body><h1 id="s1">Chapter 1</h1><img src="images/pic.png" alt="x"/><p>First chapter.</p></body></html>`);
  zip.file("OEBPS/ch2.xhtml", `<html><body><h1>Chapter 2</h1><p>Second chapter.</p></body></html>`);
  zip.file("OEBPS/images/pic.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, await zip.generateAsync({ type: "nodebuffer" }));
}

test("createEpubDocument maps EPUB TOC entries into generated document anchors", async () => {
  const documentInfo = await createEpubDocument(
    path.resolve(__dirname, "../fixtures/minse-sample.epub"),
    {
      tempBase: path.join(os.tmpdir(), "minsepubviewer-tests"),
      logger: () => {}
    }
  );

  try {
    const html = await readFile(documentInfo.htmlPath, "utf8");

    assert.equal(documentInfo.manifestCount, 2);
    assert.equal(documentInfo.spineCount, 1);
    assert.equal(documentInfo.toc.length, 1);
    assert.equal(documentInfo.toc[0].label, "Chapter 1");
    assert.equal(documentInfo.toc[0].href, "#docpart-0");
    assert.match(html, /id="docpart-0"/);
  } finally {
    await removeExtractedDocument(documentInfo);
  }
});

test("createEpubDocument parses an EPUB2 NCX table of contents without hanging", async () => {
  const tempBase = path.join(os.tmpdir(), "minsepubviewer-tests");
  const epubPath = path.join(tempBase, "ncx-fixture.epub");
  await buildEpub2Fixture(epubPath);

  const documentInfo = await createEpubDocument(epubPath, {
    tempBase,
    logger: () => {}
  });

  try {
    assert.equal(documentInfo.spineCount, 2);
    assert.deepEqual(
      documentInfo.toc.map((item) => item.label),
      ["Chapter 1", "Section 1.1", "Chapter 2"]
    );
    assert.equal(documentInfo.toc[0].href, "#docpart-0");
    assert.equal(documentInfo.toc[2].href, "#docpart-1");

    // Assets must be referenced relative to the generated document so they
    // resolve under the same origin that serves it (no file:// or absolute URL).
    const html = await readFile(documentInfo.htmlPath, "utf8");
    assert.match(html, /<img[^>]+src="OEBPS\/images\/pic\.png"/);
    assert.doesNotMatch(html, /src="file:/);
  } finally {
    await removeExtractedDocument(documentInfo);
    await rm(epubPath, { force: true });
  }
});
