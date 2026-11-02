import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { convertHwpToPageHtml } from "../../web/hwp-wasm.js";
import { withPageFontFallback } from "../../web/document-convert.js";

const require = createRequire(import.meta.url);
const { createSampleHwp } = require("../../scripts/sample-documents.cjs");
const wasmUrl = new URL("../../web/vendor/hwp/hwp_core.wasm", import.meta.url);

// web/hwp-wasm.js fetches the module; Node's fetch cannot read files, so hand it the bytes.
globalThis.MINS_HWP_WASM_URL = "hwp_core.wasm";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => (url === "hwp_core.wasm" ? new Response(await readFile(wasmUrl)) : realFetch(url));

test("the WebAssembly build has no imports, so it needs no shared memory or WASI", async () => {
  const module = await WebAssembly.compile(await readFile(wasmUrl));
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  assert.deepEqual(WebAssembly.Module.exports(module).map((entry) => entry.name).sort(),
    ["hwp_alloc", "hwp_free", "hwp_out_clear", "hwp_out_len", "hwp_out_ptr", "hwp_to_html", "memory"]);
});

test("binary HWP becomes page HTML with the paragraphs placed by their saved lines", async () => {
  const html = await convertHwpToPageHtml(new Uint8Array(createSampleHwp({ paragraphCount: 3, styled: true, controls: false })));
  assert.match(html, /class="hpa"/);
  assert.match(html, /HWP 문단 3 — 변환 문서 읽기 검사입니다\./);
  assert.match(html, /font-family:"바탕"/);
});

test("a paragraph Hangul continued on the next page is split there into two pages", async () => {
  const html = await convertHwpToPageHtml(new Uint8Array(createSampleHwp({ paragraphCount: 2, styled: true, controls: false, spanning: true })));
  const pages = html.split('class="hpa"').slice(1).map((page) => page.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " "));
  assert.equal(pages.length, 2);
  assert.match(pages[0], /HWP 문단 2 — .*앞 쪽 끝 줄입니다\./s);
  assert.doesNotMatch(pages[0], /다음 쪽 첫 줄/);
  assert.match(pages[1], /다음 쪽 첫 줄입니다\./);
});

test("documents the parser rejects fail with the HWP error, and the next one still converts", async () => {
  await assert.rejects(convertHwpToPageHtml(new Uint8Array([1, 2, 3])), { message: "document.invalidHwp" });
  await assert.rejects(convertHwpToPageHtml(new Uint8Array(createSampleHwp({ paragraphCount: 1 }))), { message: "document.invalidHwp" });
  assert.match(await convertHwpToPageHtml(new Uint8Array(createSampleHwp({ paragraphCount: 1, styled: true, controls: false }))), /class="hpa"/);
});

test("page HTML fonts get the bundled fallback stack, only inside style sheets", () => {
  const html = withPageFontFallback('<style>.hrt {font-family:"휴먼명조";font-size:10pt}</style><p>font-family: 본문</p>');
  assert.match(html, /^<style>\.hrt \{font-family:"휴먼명조", [^;]*"Nanum Myeongjo"[^;]*serif;font-size:10pt\}<\/style>/);
  assert.match(html, /<p>font-family: 본문<\/p>$/);
});
