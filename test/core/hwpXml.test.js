import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import {
  convertHwpmlDocument,
  convertOwpmlSection,
  decodeXmlBytes,
  isXmlDocumentBytes,
  readOwpmlHeader,
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

const HH = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"';
const HEADER = `<?xml version="1.0"?><hh:head ${HH}><hh:refList>
  <hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕"/><hh:font id="1" face="HY헤드라인M"/></hh:fontface>
    <hh:fontface lang="LATIN"><hh:font id="0" face="Times New Roman"/><hh:font id="1" face="Arial"/></hh:fontface></hh:fontfaces>
  <hh:borderFills>
    <hh:borderFill id="1"><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>
    <hh:borderFill id="2"><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="DOUBLE_SLIM" width="0.5 mm" color="#FF0000"/><hh:topBorder type="DASH" width="0.4 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hc:fillBrush><hc:winBrush faceColor="#D9D9D9" hatchColor="#FF000000" alpha="0"/></hc:fillBrush></hh:borderFill>
  </hh:borderFills>
  <hh:charProperties>
    <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0"/><hh:relSz hangul="100"/><hh:spacing hangul="0"/><hh:underline type="NONE"/><hh:strikeout shape="3D"/></hh:charPr>
    <hh:charPr id="1" height="1500" textColor="#FF0000" shadeColor="#FFFF00" borderFillIDRef="1"><hh:fontRef hangul="1" latin="1"/><hh:relSz hangul="100"/><hh:spacing hangul="-6"/><hh:italic/><hh:underline type="BOTTOM"/><hh:strikeout shape="SOLID"/></hh:charPr>
    <hh:charPr id="2" height="1000" textColor="#000000" shadeColor="none"><hh:fontRef hangul="0" latin="0"/><hh:relSz hangul="90"/><hh:supscript/></hh:charPr>
  </hh:charProperties>
  <hh:paraProperties>
    <hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hp:case><hp:default><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hp:default></hp:switch><hh:border borderFillIDRef="1"/></hh:paraPr>
    <hh:paraPr id="1"><hh:align horizontal="CENTER"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:intent value="-2000" unit="HWPUNIT"/><hc:left value="1000" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="300" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:case><hp:default><hh:margin><hc:intent value="-4000" unit="HWPUNIT"/><hc:left value="2000" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="600" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hp:default></hp:switch><hh:border borderFillIDRef="2"/></hh:paraPr>
  </hh:paraProperties>
</hh:refList></hh:head>`;

test("HWPX header styles become the same classes as binary HWP", () => {
  const { css, charSize, hasCharShape, hasParaShape, hasBorderFill } = readOwpmlHeader(parse(HEADER));
  assert.match(css, /^html\{font-size:14px\}/);
  assert.match(css, /\.hwp-styled \.hc0\{font-family:"함초롬바탕", "Times New Roman", "Nanum Myeongjo", "Noto Serif KR", "Noto Serif CJK KR", serif;font-size:1rem\}/);
  assert.match(css, /\.hwp-styled \.hc1\{font-family:"HY헤드라인M", "Arial", "Nanum Gothic"[^;]*;font-size:1\.5rem;font-style:italic;font-weight:bold;text-decoration:underline line-through;letter-spacing:-0\.03em;color:#ff0000;background-color:#ffff00\}/);
  assert.match(css, /\.hwp-styled \.hc2\{[^}]*font-size:0\.63rem;vertical-align:super\}/);
  assert.match(css, /\.hwp-styled \.hp0\{white-space:pre-wrap;text-align:justify;margin:0rem 0 0rem;padding:0 0rem 0 0rem;text-indent:0rem;line-height:1\.6\}/);
  assert.match(css, /\.hwp-styled \.hp1\{white-space:pre-wrap;text-align:center;margin:0rem 0 0\.3rem;padding:0 0rem 0 3rem;text-indent:-2rem;line-height:1\.3;background-color:#d9d9d9\}/);
  assert.match(css, /\.hwp-styled \.hb1\{border-left:none;border-right:none;border-top:none;border-bottom:none\}/);
  assert.match(css, /\.hwp-styled \.hb2\{border-left:1px solid #000000;border-right:3px double #ff0000;border-top:2px dashed #000000;border-bottom:none;background-color:#d9d9d9\}/);
  assert.equal(charSize("1"), "1.5rem");
  assert.ok(hasCharShape("2") && !hasCharShape("3") && hasParaShape("1") && hasBorderFill("2") && !hasBorderFill("0"));
  assert.throws(() => readOwpmlHeader(parse("<other/>")), /document\.invalidHwpx/);
});

test("HWPX sections use the header classes for runs, paragraphs, cells and text boxes", () => {
  const styles = readOwpmlHeader(parse(HEADER));
  const html = convertOwpmlSection(parse(`<?xml version="1.0"?>
    <hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
      <hp:p paraPrIDRef="1"><hp:run charPrIDRef="1"><hp:t>제목 </hp:t></hp:run><hp:run charPrIDRef="0"><hp:t>본문<hp:lineBreak/>둘째 줄  </hp:t></hp:run></hp:p>
      <hp:p paraPrIDRef="0"><hp:run charPrIDRef="9"><hp:t>모르는 모양</hp:t></hp:run></hp:p>
      <hp:p paraPrIDRef="0"><hp:run charPrIDRef="1"/></hp:p>
      <hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:tbl><hp:inMargin left="510" right="510" top="141" bottom="141"/>
        <hp:tr><hp:tc borderFillIDRef="2" hasMargin="0"><hp:subList vertAlign="CENTER"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>A1</hp:t></hp:run></hp:p></hp:subList><hp:cellSz width="3000" height="1000"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>
          <hp:tc borderFillIDRef="1" hasMargin="1"><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>B1</hp:t></hp:run></hp:p></hp:subList><hp:cellSz width="1000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>
      </hp:tbl><hp:rect><hp:drawText><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>글상자</hp:t></hp:run></hp:p></hp:subList></hp:drawText></hp:rect></hp:run></hp:p>
    </hs:sec>`), styles);
  assert.equal(html, '<section class="hwp-styled">'
    + '<p class="hp1" style="font-size:1.5rem"><span class="hc1">제목 </span><span class="hc0">본문</span><br><span class="hc0">둘째 줄</span></p>'
    + '<p class="hp0">모르는 모양</p>'
    + '<p class="hp0" style="font-size:1.5rem"><br></p>'
    + '<table class="hwp-table" style="width:min(100%, 4rem)"><tbody><tr>'
    + '<td class="hb2" style="padding:0.141rem 0.51rem 0.141rem 0.51rem;vertical-align:middle;width:75%"><p class="hp0" style="font-size:1rem"><span class="hc0">A1</span></p></td>'
    + '<td class="hb1" style="padding:0rem 0rem 0rem 0rem;vertical-align:top;width:25%"><p class="hp0" style="font-size:1rem"><span class="hc0">B1</span></p></td>'
    + '</tr></tbody></table><div class="hwp-box"><p class="hp0" style="font-size:1rem"><span class="hc0">글상자</span></p></div></section>');
});

test("HWPX section files are read in numeric order", () => {
  assert.deepEqual(sortOwpmlSectionPaths(["Contents/section10.xml", "Contents/header.xml", "Contents/section2.xml", "Contents/section0.xml"]), [
    "Contents/section0.xml",
    "Contents/section2.xml",
    "Contents/section10.xml"
  ]);
});
