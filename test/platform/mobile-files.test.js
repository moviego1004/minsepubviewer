import test from "node:test";
import assert from "node:assert/strict";
import { hydrateMobileFile, MOBILE_EPUB_MAX_BYTES, MOBILE_PDF_MAX_BYTES } from "../../src/platform/mobile-files.js";

test("a cancelled Android picker produces no document or fetch", async () => {
  assert.equal(await hydrateMobileFile({ cancelled: true }, () => { throw new Error("unexpected fetch"); }), null);
});

test("EPUB is read as bytes from the app file URL, retaining stable document path", async () => {
  const path = "/data/user/0/reader/files/reader-documents/a.epub";
  const result = await hydrateMobileFile({ kind: "epub", path, name: "책.epub", size: 4 },
    (value) => `https://localhost/_capacitor_file_${value}`, async (url) => {
      assert.equal(url, `https://localhost/_capacitor_file_${path}`);
      return new Response(new Uint8Array([80, 75, 3, 4]));
    });
  assert.equal(result.file.path, path);
  assert.deepEqual([...new Uint8Array(result.file.bytes)], [80, 75, 3, 4]);
});

test("Korean Markdown opens in reading mode", async () => {
  const result = await hydrateMobileFile({ kind: "markdown", path: "/files/a.md", name: "문서.md", size: 20 },
    (path) => path, async () => new Response("# 안녕하세요"));
  assert.equal(result.document.content, "# 안녕하세요");
  assert.equal(result.document.viewMode, "view");
});

test("large native EPUBs use an unpacked URL without fetching or copying their archive", async () => {
  const result = await hydrateMobileFile({ kind: "epub", path: "/files/book.epub", size: 200 * 1024 * 1024,
    rootPath: "/cache/book.unpacked/", bookId: "a".repeat(64) }, (path) => `https://localhost/_capacitor_file_${path}`,
    async () => { throw new Error("The archive must not enter JavaScript memory"); });
  assert.equal(result.file.epubUrl, "https://localhost/_capacitor_file_/cache/book.unpacked/");
  assert.equal(result.file.bookId, "a".repeat(64));
  assert.equal(result.file.bytes, undefined);
});

test("oversized or inaccessible imports fail before entering the reader", async () => {
  await assert.rejects(hydrateMobileFile({ kind: "epub", path: "/a", size: MOBILE_EPUB_MAX_BYTES + 1 }, () => {
    throw new Error("must not fetch oversized document");
  }), /native.invalidDescriptor/);
  await assert.rejects(hydrateMobileFile({ kind: "markdown", path: "/a", size: 1 }, (path) => path,
    async () => new Response("", { status: 404 })), /native.readImportedFailed/);
});

test("PDF imports stay in the app library and are read by URL", async () => {
  const result = await hydrateMobileFile({ kind: "pdf", path: "/data/reader-documents/a.pdf", name: "a.pdf", size: 1024 },
    (path) => `https://localhost/_capacitor_file_${path}`,
    async () => { throw new Error("The PDF must not enter JavaScript memory"); });
  assert.equal(result.kind, "pdf");
  assert.equal(result.file.pdfUrl, "https://localhost/_capacitor_file_/data/reader-documents/a.pdf");
  assert.equal(result.file.type, "application/pdf");
  await assert.rejects(hydrateMobileFile({ kind: "pdf", path: "/a.pdf", size: MOBILE_PDF_MAX_BYTES + 1 }, (path) => path), /native\.invalidDescriptor/);
});

test("DOCX and HWP imports are read as bytes for conversion", async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4]);
  const result = await hydrateMobileFile({ kind: "document", path: "/data/a.docx", name: "a.docx", size: 4 }, (path) => path,
    async () => new Response(bytes));
  assert.equal(result.kind, "document");
  assert.deepEqual(new Uint8Array(result.file.bytes), bytes);
  await assert.rejects(hydrateMobileFile({ kind: "document", path: "/a.hwp", size: 65 * 1024 * 1024 }, (path) => path), /native\.invalidDescriptor/);
});
