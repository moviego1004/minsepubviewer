import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { symbolFontTable, symbolHtml } from "../../src/core/hwpSymbols.js";
import { convertOwpmlSection, readOwpmlHeader } from "../../src/core/hwpXml.js";

const parse = (xml) => new DOMParser().parseFromString(xml, "text/xml");

test("symbol-font characters are read as Wingdings unless a font names another table", () => {
  // From real documents: "OS·DB", list items starting with ❍ (U+1F53E), ◆, •, arrows.
  assert.equal(symbolHtml("OSDB  기간    "), "OS∙DB \u{1f53e} 기간 ◆ • \u{1f86a} \u{1f87a}");
  assert.equal(symbolHtml(" ", symbolFontTable(["함초롬바탕", "Symbol"])), "• α");
  assert.equal(symbolHtml("", symbolFontTable(["Wingdings 2"])), "\u{1f58a}");
  assert.equal(symbolFontTable(["휴먼명조", "맑은 고딕"]), "wingdings");
  assert.equal(symbolFontTable(["Webdings"]), "webdings");
  // Codes without a Unicode character stay as they are; ordinary text is escaped.
  assert.equal(symbolHtml(" <b>&"), " &lt;b&gt;&amp;");
});

test("Hancom symbol-plane digits and letters become Unicode or framed letters", () => {
  assert.equal(symbolHtml("\u{f0289}\u{f029d}\u{f0293}\u{f02c5}\u{f0832}"), "①❶12═");
  assert.equal(symbolHtml("\u{f02b1} 웹 호환성"), '<span class="hwp-sym is-box">1</span> 웹 호환성');
  assert.equal(symbolHtml("\u{f02bc}\u{f02cd}\u{f02df}"), '<span class="hwp-sym is-box">3</span><span class="hwp-sym is-box-black">0</span><span class="hwp-sym is-box-black">9</span>');
  assert.equal(symbolHtml("\u{f012b}\u{f009b}\u{f00a9}\u{f00b3}\u{f00f2}\u{f00fd}\u{f013c}"),
    ["circle 인", "box 가", "box ㅏ", "box 감", "box 활", "circle 감", "circle 활"]
      .map((entry) => `<span class="hwp-sym is-${entry.split(" ")[0]}">${entry.split(" ")[1]}</span>`).join(""));
  // Codes the table does not cover are kept.
  assert.equal(symbolHtml("\u{f02a6}\u{f0001}"), "\u{f02a6}\u{f0001}");
});

test("HWPX text uses the symbol table of its character shape", () => {
  const styles = readOwpmlHeader(parse(`<?xml version="1.0"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"><hh:refList>
    <hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="휴먼명조"/></hh:fontface><hh:fontface lang="SYMBOL"><hh:font id="0" face="휴먼명조"/><hh:font id="1" face="Symbol"/></hh:fontface></hh:fontfaces>
    <hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0" symbol="0"/></hh:charPr><hh:charPr id="1" height="1000"><hh:fontRef hangul="0" symbol="1"/></hh:charPr></hh:charProperties>
  </hh:refList></hh:head>`));
  const html = convertOwpmlSection(parse(`<?xml version="1.0"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
    <hp:p><hp:run charPrIDRef="0"><hp:t> 운영관리</hp:t></hp:run><hp:run charPrIDRef="1"><hp:t></hp:t></hp:run></hp:p></hs:sec>`), styles);
  assert.match(html, /<span class="hc0">\u{1f550} 운영∙관리<\/span><span class="hc1">•<\/span>/u);
});
