import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import {
  convertHwpmlDocument,
  convertOwpmlSection,
  decodeXmlBytes,
  isXmlDocumentBytes,
  sortOwpmlSectionPaths
} from "../../src/core/hwpXml.js";

const parse = (xml) => new DOMParser().parseFromString(xml, "text/xml");

test("XML bytes are decoded even when the declaration names the wrong encoding", () => {
  const utf8 = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-16"?><HWPML>한글</HWPML>');
  assert.equal(decodeXmlBytes(utf8), '<?xml version="1.0"?><HWPML>한글</HWPML>');
  const utf16 = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...'<a>가</a>'].map((c) => c.charCodeAt(0))).buffer)]);
  assert.equal(decodeXmlBytes(utf16), "<a>가</a>");
  assert.ok(isXmlDocumentBytes(utf8));
  assert.equal(isXmlDocumentBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), false);
});

test("HWPML paragraphs, tables and spans become HTML", () => {
  const html = convertHwpmlDocument(parse(`<?xml version="1.0"?>
    <HWPML><HEAD><DOCSUMMARY><AUTHOR>secret</AUTHOR></DOCSUMMARY></HEAD><BODY><SECTION>
      <P><TEXT><CHAR>첫 문단 &lt;태그&gt;</CHAR></TEXT><TEXT><CHAR> 이어짐</CHAR></TEXT></P>
      <P><TEXT><TABLE><ROW><CELL ColSpan="2"><PARALIST><P><TEXT><CHAR>셀</CHAR></TEXT></P></PARALIST></CELL></ROW></TABLE></TEXT></P>
      <P></P>
    </SECTION></BODY></HWPML>`));
  assert.equal(html, '<section><p>첫 문단 &lt;태그&gt; 이어짐</p><table class="hwp-table"><tbody><tr><td colspan="2"><p>셀</p></td></tr></tbody></table><p><br></p></section>');
  assert.ok(!html.includes("secret"), "document metadata is not shown");
  assert.throws(() => convertHwpmlDocument(parse("<other/>")), /document\.invalidHwpml/);
});

test("HWPX section paragraphs, line breaks and tables become HTML", () => {
  const html = convertOwpmlSection(parse(`<?xml version="1.0"?>
    <hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
      <hp:p><hp:run><hp:t>안녕<hp:lineBreak/>하세요</hp:t></hp:run><hp:run><hp:t> &amp; 반갑습니다</hp:t></hp:run></hp:p>
      <hp:p><hp:run><hp:tbl><hp:tr><hp:tc><hp:cellSpan colSpan="1" rowSpan="2"/><hp:subList><hp:p><hp:run><hp:t>A1</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>
    </hs:sec>`));
  assert.equal(html, '<section><p>안녕<br>하세요 &amp; 반갑습니다</p><table class="hwp-table"><tbody><tr><td rowspan="2"><p>A1</p></td></tr></tbody></table></section>');
  assert.throws(() => convertOwpmlSection(parse("<root/>")), /document\.invalidHwpx/);
});

test("HWPX section files are read in numeric order", () => {
  assert.deepEqual(sortOwpmlSectionPaths(["Contents/section10.xml", "Contents/header.xml", "Contents/section2.xml", "Contents/section0.xml"]), [
    "Contents/section0.xml",
    "Contents/section2.xml",
    "Contents/section10.xml"
  ]);
});
