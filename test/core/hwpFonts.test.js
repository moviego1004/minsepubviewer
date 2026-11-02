import test from "node:test";
import assert from "node:assert/strict";
import { classifyFont, fontCss } from "../../src/core/hwpFonts.js";

test("Hangul and Latin font names are sorted into serif, sans, mono and symbol kinds", () => {
  for (const name of ["함초롬바탕", "HCR Batang", "한컴바탕", "Haansoft Batang", "휴먼명조", "한양신명조", "HY신명조",
    "HYSinMyeongJo-Medium", "신명조", "바탕체", "궁서", "HY궁서B", "문체부 바탕체", "나눔명조", "Times New Roman", "Georgia"]) {
    assert.equal(classifyFont(name).kind, "serif", name);
  }
  for (const name of ["함초롬돋움", "HCR Dotum", "맑은 고딕", "Malgun Gothic", "굴림", "돋움체", "HY중고딕", "휴먼고딕",
    "한양중고딕", "중고딕", "나눔고딕", "Arial", "Verdana", "", null]) {
    assert.equal(classifyFont(name).kind, "sans", String(name));
  }
  assert.equal(classifyFont("Courier New").kind, "mono");
  assert.equal(classifyFont("나눔고딕코딩").kind, "mono");
  assert.equal(classifyFont("HYWingding").kind, "symbol");
  assert.equal(classifyFont("Wingdings").kind, "symbol");
});

test("Headline and extra-bold faces are drawn bold without changing their kind", () => {
  assert.deepEqual(classifyFont("HY헤드라인M"), { kind: "sans", heavy: true });
  assert.deepEqual(classifyFont("HY견고딕"), { kind: "sans", heavy: true });
  assert.deepEqual(classifyFont("HYHeadLine-Medium"), { kind: "sans", heavy: true });
  assert.deepEqual(classifyFont("나눔명조 ExtraBold"), { kind: "serif", heavy: true });
  assert.deepEqual(classifyFont("HY견명조"), { kind: "serif", heavy: false });
  assert.deepEqual(classifyFont("함초롬돋움"), { kind: "sans", heavy: false });
});

test("Font CSS keeps the document's names first and ends with the bundled Nanum fonts", () => {
  assert.deepEqual(fontCss(["휴먼명조", "Times New Roman"]), {
    family: '"휴먼명조", "Times New Roman", "Nanum Myeongjo", "Noto Serif KR", "Noto Serif CJK KR", serif',
    heavy: false
  });
  assert.deepEqual(fontCss(["HY헤드라인M", "HY헤드라인M"]), {
    family: '"HY헤드라인M", "Nanum Gothic", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    heavy: true
  });
  // Control characters and quotes in stored names cannot break out of the CSS string.
  assert.equal(fontCss(['함초롬"돋움\u0000'], undefined).family.startsWith('"함초롬돋움", "Nanum Gothic"'), true);
  assert.equal(fontCss([undefined, ""]).family.startsWith('"Nanum Gothic"'), true);
});
