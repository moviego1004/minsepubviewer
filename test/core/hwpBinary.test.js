import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import CFB from "cfb";
import { convertHwpBinary, isOleBytes, readCompoundFile, readRecords } from "../../src/core/hwpBinary.js";

const require = createRequire(import.meta.url);
const { createSampleHwp } = require("../../scripts/sample-documents.cjs");
const inflateRaw = async (bytes) => new Uint8Array(zlib.inflateRawSync(bytes));

test("HWP 5.0 paragraphs, tables and footnotes become HTML", async () => {
  const bytes = new Uint8Array(createSampleHwp({ paragraphCount: 2 }));
  assert.ok(isOleBytes(bytes));
  const html = await convertHwpBinary(bytes, inflateRaw);
  assert.match(html, /^<section><p>HWP 5\.0 검사 문서<\/p><p>HWP 문단 1 — /);
  assert.match(html, /<table class="hwp-table"><tbody><tr><td colspan="2"><p>병합된 머리 칸<\/p><\/td><\/tr><tr><td><p>HWP 표 왼쪽<\/p><\/td><td><p>HWP 표 오른쪽<\/p><\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<p>각주가 있는 문장<sup class="hwp-note-ref">1\)<\/sup><\/p><ol class="hwp-notes"><li><p>HWP 각주 내용<\/p><\/li><\/ol><\/section>$/);
  // Tables are not left inside <p> elements.
  assert.doesNotMatch(html, /<p>(?:(?!<\/p>).)*<table/);
});

test("large uncompressed streams are read through the regular sector chain", async () => {
  const bytes = new Uint8Array(createSampleHwp({ paragraphCount: 400, compressed: false }));
  const file = readCompoundFile(bytes);
  assert.ok(file.read("BodyText/Section0").length >= 4096);
  const html = await convertHwpBinary(bytes, inflateRaw);
  assert.ok(html.includes("HWP 문단 400 — "));
});

test("records with an extended size are read", () => {
  const data = Buffer.alloc(5000, 0x41);
  const header = Buffer.alloc(8);
  header.writeUInt32LE((67 | (2 << 10) | (0xfff << 20)) >>> 0, 0);
  header.writeUInt32LE(data.length, 4);
  const [record] = readRecords(new Uint8Array(Buffer.concat([header, data])));
  assert.deepEqual([record.tag, record.level, record.data.length], [67, 2, 5000]);
});

test("encrypted, distribution and non-HWP files are refused with message keys", async () => {
  const withFlags = (flags) => {
    const header = Buffer.alloc(256);
    header.write("HWP Document File", 0, "latin1");
    header.writeUInt32LE(flags, 36);
    const file = CFB.utils.cfb_new();
    CFB.utils.cfb_add(file, "FileHeader", header);
    CFB.utils.cfb_add(file, "BodyText/Section0", Buffer.alloc(4));
    return new Uint8Array(CFB.write(file, { type: "buffer", fileType: "cfb" }));
  };
  await assert.rejects(convertHwpBinary(withFlags(3), inflateRaw), /document\.hwpEncrypted/);
  await assert.rejects(convertHwpBinary(withFlags(5), inflateRaw), /document\.hwpDistribution/);
  await assert.rejects(convertHwpBinary(new Uint8Array(512), inflateRaw), /document\.invalidHwp/);
  const other = CFB.utils.cfb_new();
  CFB.utils.cfb_add(other, "WordDocument", Buffer.alloc(16));
  await assert.rejects(convertHwpBinary(new Uint8Array(CFB.write(other, { type: "buffer", fileType: "cfb" })), inflateRaw), /document\.invalidHwp/);
});
