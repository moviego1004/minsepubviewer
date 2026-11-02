import test from "node:test";
import assert from "node:assert/strict";
import { reflowPdfPages } from "../../src/core/pdfReflow.js";

// A PDF.js text item at (x, y) in a font of the given size; width is roughly half an em per char.
function item(str, x, y, size = 10, { hasEOL = false, width } = {}) {
  return { str, transform: [size, 0, 0, size, x, y], width: width ?? str.length * size * 0.5, height: size, hasEOL };
}

// Lines of body text that fill the 72..540 text width, one item per line.
function lines(texts, top, { x = 72, size = 10, leading = 14 } = {}) {
  return texts.map((text, index) => item(text, x, top - index * leading, size, { width: 468 }));
}

test("lines of one paragraph are joined and a gap or indent starts the next", () => {
  const { html, characters } = reflowPdfPages([{ items: [
    ...lines(["첫 문단의 첫 줄은 오른쪽", "끝까지 이어진다."], 700),
    ...lines(["두 번째 문단은 빈 줄", "뒤에 시작한다."], 660),
    item("들여쓴 세 번째 문단.", 92, 618, 10, { width: 400 })
  ] }]);
  assert.equal(html, '<div class="pdf-reflow"><section class="pdf-reflow-page" data-page="1">'
    + "<p>첫 문단의 첫 줄은 오른쪽 끝까지 이어진다.</p><p>두 번째 문단은 빈 줄 뒤에 시작한다.</p><p>들여쓴 세 번째 문단.</p></section></div>");
  assert.ok(characters > 30);
});

test("runs on one baseline form a line with spaces from gaps, and hyphenated words are rejoined", () => {
  const { html } = reflowPdfPages([{ items: [
    item("Hello", 72, 700, 10, { width: 25 }), item("world, this is a hyph-", 100, 700, 10, { width: 440 }),
    item("enated", 72, 686, 10, { width: 30 }), item("word", 104, 686.5, 10, { width: 20 }),
    item("中文", 72, 650, 10, { width: 468 }), item("句子", 72, 636, 10, { width: 20 })
  ] }]);
  assert.match(html, /<p>Hello world, this is a hyphenated word<\/p>/);
  assert.match(html, /<p>中文句子<\/p>/);
});

test("larger lines become headings and list items start their own paragraphs", () => {
  const { html } = reflowPdfPages([{ items: [
    item("1장 시작", 72, 740, 20, { width: 80 }),
    item("절 제목", 72, 710, 13, { width: 60 }),
    ...lines(["본문 문장이 이어지는 첫 줄", "본문 문장의 둘째 줄", "본문 문장의 셋째 줄"], 690),
    ...lines(["• 첫 항목", "• 둘째 항목"], 640)
  ] }]);
  assert.match(html, /^<div class="pdf-reflow"><section[^>]*><h2>1장 시작<\/h2><h3>절 제목<\/h3><p>본문/);
  assert.match(html, /<p>• 첫 항목<\/p><p>• 둘째 항목<\/p>/);
});

test("page numbers and running headers repeated on most pages are dropped, text is escaped", () => {
  const pages = [1, 2, 3, 4].map((page) => ({ items: [
    item("Annual Report 2026", 72, 780, 9),
    ...lines([`Body text of page ${page} with <tags> & more.`], 700),
    item(`- ${page} -`, 290, 40, 9)
  ] }));
  const { html } = reflowPdfPages(pages);
  assert.doesNotMatch(html, /Annual Report|- \d -/);
  assert.match(html, /<section class="pdf-reflow-page" data-page="4"><p>Body text of page 4 with &lt;tags&gt; &amp; more.<\/p><\/section>/);
});

test("a PDF without a text layer reflows to empty pages", () => {
  const { html, characters } = reflowPdfPages([{ items: [] }, { items: [item("  ", 72, 700)] }]);
  assert.equal(characters, 0);
  assert.equal(html, '<div class="pdf-reflow"><section class="pdf-reflow-page" data-page="1"></section><section class="pdf-reflow-page" data-page="2"></section></div>');
});

test("short pages that repeat the same wording keep their text", () => {
  const pages = [1, 2, 3].map((page) => ({ items: [
    item(`Sample PDF page ${page}`, 72, 700, 24, { hasEOL: true }), item(`Target text on page ${page}`, 72, 660, 24)
  ] }));
  const { html } = reflowPdfPages(pages);
  assert.match(html, /data-page="2"><p>Sample PDF page 2 Target text on page 2<\/p><\/section>/);
});
