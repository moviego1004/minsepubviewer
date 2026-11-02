import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readZipEntryNames, sniffDocumentFormat } from "../../src/core/documentSniff.js";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const { createSampleDocx, createSampleHwp, createSampleHwpml, createSampleHwpx } = require("../../scripts/sample-documents.cjs");

async function zip(files, comment) {
  const archive = new JSZip();
  for (const [name, content] of Object.entries(files)) archive.file(name, content);
  return new Uint8Array(await archive.generateAsync({ type: "uint8array", comment }));
}

test("Converted document formats are recognised from their content", async () => {
  assert.equal(sniffDocumentFormat(new Uint8Array(createSampleHwp())), "hwp");
  assert.equal(sniffDocumentFormat(new Uint8Array(Buffer.from(createSampleHwpml()))), "hwp");
  assert.equal(sniffDocumentFormat(new Uint8Array(await createSampleHwpx())), "hwpx");
  assert.equal(sniffDocumentFormat(new Uint8Array(await createSampleDocx())), "docx");
  assert.equal(sniffDocumentFormat(new TextEncoder().encode("%PDF-1.7\n")), "pdf");
});

test("HWPX is told apart from EPUB although both carry META-INF/container.xml", async () => {
  const epub = await zip({ mimetype: "application/epub+zip", "META-INF/container.xml": "<container/>", "OEBPS/a.xhtml": "<p/>" });
  assert.equal(sniffDocumentFormat(epub), "epub");
  const hwpx = await zip({ mimetype: "application/hwp+zip", "META-INF/container.xml": "<container/>", "Contents/section0.xml": "<hs:sec/>" }, "comment");
  assert.equal(sniffDocumentFormat(hwpx), "hwpx");
  assert.deepEqual(readZipEntryNames(hwpx), ["mimetype", "META-INF/", "META-INF/container.xml", "Contents/", "Contents/section0.xml"]);
});

test("Unknown or damaged content gives no format so the file name decides", async () => {
  assert.equal(sniffDocumentFormat(new Uint8Array()), null);
  assert.equal(sniffDocumentFormat(new TextEncoder().encode("# Markdown")), null);
  assert.equal(sniffDocumentFormat(new TextEncoder().encode('<?xml version="1.0"?><svg/>')), null);
  assert.equal(sniffDocumentFormat(await zip({ "a.txt": "x" })), null);
  const truncated = (await zip({ "Contents/section0.xml": "<x/>" })).subarray(0, 40);
  assert.equal(readZipEntryNames(truncated), null);
  assert.equal(sniffDocumentFormat(truncated), null);
});
