import test from "node:test";
import assert from "node:assert/strict";
import { hydrateMobileFile, MOBILE_EPUB_MAX_BYTES } from "../../src/platform/mobile-files.js";

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
  }), /크기/);
  await assert.rejects(hydrateMobileFile({ kind: "markdown", path: "/a", size: 1 }, (path) => path,
    async () => new Response("", { status: 404 })), /읽지 못/);
});
