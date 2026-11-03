// Small generated DOCX, HWPX, HWPML (XML .hwp) and HWP 5.0 (binary) files for tests.
const zlib = require("node:zlib");
const CFB = require("cfb");
const JSZip = require("jszip");

const paragraphs = (count, label) => Array.from({ length: count }, (_, index) => `${label} 문단 ${index + 1} — 변환 문서 읽기 검사입니다.`);

async function createSampleDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const body = paragraphs(80, "DOCX").map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("")
    + "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>표 셀 하나</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>표 셀 둘</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>DOCX 검사 문서</w:t></w:r></w:p>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

// A tiny solid PNG (width x height, RGB) for picture tests.
function createSamplePng(width, height, [red, green, blue]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const check = Buffer.alloc(4); check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.from([0, ...Array.from({ length: width }, () => [red, green, blue]).flat()])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

async function createSampleHwpx() {
  const zip = new JSZip();
  zip.file("mimetype", "application/hwp+zip");
  zip.file("Contents/content.hpf", '<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest><opf:item id="image1" href="BinData/image1.png" media-type="image/png" isEmbeded="1"/></opf:manifest></opf:package>');
  zip.file("BinData/image1.png", createSamplePng(4, 4, [200, 30, 30]));
  // Header styles: character shape 1 is bold red, paragraph shape 1 is centred, border fill 2 is a grey cell.
  zip.file("Contents/header.xml", '<?xml version="1.0" encoding="UTF-8"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"><hh:refList>'
    + '<hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕"/></hh:fontface><hh:fontface lang="LATIN"><hh:font id="0" face="함초롬바탕"/></hh:fontface></hh:fontfaces>'
    + '<hh:borderFills><hh:borderFill id="2"><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hc:fillBrush><hc:winBrush faceColor="#D9D9D9"/></hc:fillBrush></hh:borderFill></hh:borderFills>'
    + '<hh:charProperties><hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="1" height="1600" textColor="#FF0000" shadeColor="none"><hh:fontRef hangul="0" latin="0"/><hh:bold/></hh:charPr></hh:charProperties>'
    + '<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/></hh:paraPr><hh:paraPr id="1"><hh:align horizontal="CENTER"/></hh:paraPr></hh:paraProperties>'
    + '</hh:refList></hh:head>');
  const body = paragraphs(40, "HWPX").map((text) => `<hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p>`).join("");
  zip.file("Contents/section0.xml", `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p paraPrIDRef="1"><hp:run charPrIDRef="1"><hp:t>HWPX 검사 문서</hp:t></hp:run></hp:p>${body}<hp:p><hp:run><hp:pic><hc:img xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" binaryItemIDRef="image1"/><hp:sz width="7200" height="7200"/><hp:pos treatAsChar="0"/></hp:pic></hp:run></hp:p><hp:p><hp:run><hp:tbl><hp:tr><hp:tc borderFillIDRef="2"><hp:subList><hp:p><hp:run><hp:t>HWPX 표</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

function createSampleHwpml() {
  const body = paragraphs(30, "HWPML").map((text) => `<P><TEXT><CHAR>${text}</CHAR></TEXT></P>`).join("");
  // Saved by Hangul with a UTF-16 declaration over UTF-8 bytes, like real files.
  return Buffer.from(`<?xml version="1.0" encoding="UTF-16" standalone="no"?><HWPML Version="2.91"><HEAD SecCnt="1"/><BODY><SECTION><P><TEXT><CHAR>HWPML 검사 문서</CHAR></TEXT></P>${body}</SECTION></BODY></HWPML>`, "utf8");
}

// HWP 5.0 record: tag, level and size packed in one 32-bit header.
function hwpRecord(tag, level, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(4);
  header.writeUInt32LE((tag | (level << 10) | (data.length << 20)) >>> 0);
  return Buffer.concat([header, data]);
}

const hwpText = (text) => Buffer.from(`${text}\r`, "utf16le");
// An object control (11 = table, 17 = footnote) takes 8 code units in the paragraph text.
const hwpControlChar = (code, id) => {
  const data = Buffer.alloc(16);
  data.writeUInt16LE(code, 0);
  Buffer.from(id.split("").reverse().join(""), "latin1").copy(data, 2);
  data.writeUInt16LE(code, 14);
  return data;
};
const hwpControlId = (id) => Buffer.from(id.split("").reverse().join(""), "latin1");

// runs: [position, character shape id] pairs (PARA_CHAR_SHAPE) for styled samples.
// Each paragraph is one line (PARA_LINE_SEG) placed below the previous one, as Hangul saves them;
// hwpjs's page view places text by these lines. lines: where each line's text starts; newPageLine:
// the line that Hangul put at the top of the next page (its position starts again at 0).
let lineTop = 0;
function hwpParagraph(level, text, { paraShape = 0, runs = null, lines = [0], newPageLine = -1 } = {}) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(text.length + 1, 0);
  header.writeUInt16LE(paraShape, 8);
  const records = [hwpRecord(66, level, header), hwpRecord(67, level + 1, hwpText(text))];
  if (runs) {
    const data = Buffer.alloc(runs.length * 8);
    runs.forEach(([position, id], index) => { data.writeUInt32LE(position, index * 8); data.writeUInt32LE(id, index * 8 + 4); });
    records.push(hwpRecord(68, level + 1, data));
  }
  const segments = lines.map((start, index) => {
    if (index === newPageLine) lineTop = 0;
    const line = Buffer.alloc(36);
    line.writeUInt32LE(start, 0);
    line.writeInt32LE(lineTop, 4);
    line.writeInt32LE(1000, 8);
    line.writeInt32LE(1000, 12);
    line.writeInt32LE(850, 16);
    line.writeInt32LE(600, 20);
    line.writeInt32LE(42520, 28);
    line.writeUInt32LE(0x60000, 32);
    lineTop += 1600;
    return line;
  });
  records.push(hwpRecord(69, level + 1, Buffer.concat(segments)));
  return records;
}

function hwpCell(level, col, row, text, colSpan = 1, { width = 0, borderFill = 0 } = {}) {
  const list = Buffer.alloc(34);
  list.writeUInt16LE(1, 0);
  list.writeUInt16LE(col, 8);
  list.writeUInt16LE(row, 10);
  list.writeUInt16LE(colSpan, 12);
  list.writeUInt16LE(1, 14);
  list.writeUInt32LE(width, 16);
  [24, 26, 28, 30].forEach((offset) => list.writeUInt16LE(0xffff, offset));
  list.writeUInt16LE(borderFill, 32);
  return [hwpRecord(72, level, list), ...hwpParagraph(level, text)];
}

// DocInfo of a styled sample: faces 바탕 (Hangul) and Arial (Latin); character shape 0 is plain
// 10pt, 1 is 15pt bold red on yellow; paragraph shape 0 is justified, 1 centred with a hanging
// indent; border fill 1 has solid left/right lines and a grey fill. Paragraph shape 2 is boxed by
// border fill 1 and joined with the next paragraph of that shape; 3 is numbered "^1." (level 1)
// and 4 "(^2)" (level 2) by numbering 1 starting at 1; 5 has bullet 1 ("•").
function numbering(formats) {
  const levels = Array.from({ length: 7 }, (_, index) => {
    const format = formats[index] || "";
    const head = Buffer.alloc(14);
    head.writeUInt16LE(format.length, 12);
    return Buffer.concat([head, Buffer.from(format, "utf16le")]);
  });
  const start = Buffer.alloc(2);
  start.writeUInt16LE(1, 0);
  return Buffer.concat([...levels, start]);
}

function hwpDocInfo() {
  const mappings = Buffer.alloc(72);
  mappings.writeInt32LE(1, 4);
  mappings.writeInt32LE(1, 8);
  const face = (name) => {
    const data = Buffer.alloc(3 + name.length * 2);
    data.writeUInt16LE(name.length, 1);
    Buffer.from(name, "utf16le").copy(data, 3);
    return data;
  };
  const borderFill = Buffer.alloc(53);
  for (const [index, type] of [[0, 1], [1, 1], [2, 0], [3, 0]]) {
    borderFill[2 + index * 6] = type;
    borderFill[3 + index * 6] = 1;
  }
  borderFill.writeUInt32LE(1, 32);
  borderFill.writeUInt32LE(0xd9d9d9, 36);
  const charShape = ({ size, props = 0, color = 0, shade = 0xffffffff, spacing = 0 }) => {
    const data = Buffer.alloc(74);
    data.fill(100, 14, 21);
    data.writeInt8(spacing, 21);
    data.fill(100, 28, 35);
    data.writeInt32LE(size, 42);
    data.writeUInt32LE(props, 46);
    data.writeUInt32LE(color, 52);
    data.writeUInt32LE(shade, 60);
    return data;
  };
  const paraShape = ({ align, left = 0, indent = 0, bottom = 0, lineSpacing = 160, heading = 0, level = 0, listId = 0, borderFill = 0, joined = false }) => {
    const data = Buffer.alloc(54);
    data.writeUInt32LE(((align << 2) | (heading << 23) | (level << 25) | (joined ? 0x10000000 : 0)) >>> 0, 0);
    data.writeUInt16LE(listId, 30);
    data.writeUInt16LE(borderFill, 32);
    if (borderFill) [34, 36, 38, 40].forEach((offset) => data.writeInt16LE(500, offset));
    data.writeInt32LE(left, 4);
    data.writeInt32LE(indent, 12);
    data.writeInt32LE(bottom, 20);
    data.writeInt32LE(lineSpacing, 24);
    data.writeUInt32LE(lineSpacing, 50);
    return data;
  };
  return Buffer.concat([
    hwpRecord(17, 0, mappings), hwpRecord(19, 1, face("바탕")), hwpRecord(19, 1, face("Arial")),
    hwpRecord(20, 1, borderFill),
    hwpRecord(21, 1, charShape({ size: 1000 })),
    hwpRecord(21, 1, charShape({ size: 1500, props: 2, color: 0x0000ff, shade: 0x00ffff, spacing: -6 })),
    hwpRecord(25, 1, paraShape({ align: 0 })),
    hwpRecord(25, 1, paraShape({ align: 3, left: 2000, indent: -4000, bottom: 600, lineSpacing: 130 })),
    hwpRecord(25, 1, paraShape({ align: 0, borderFill: 1, joined: true })),
    hwpRecord(25, 1, paraShape({ align: 0, heading: 2, level: 0, listId: 1 })),
    hwpRecord(25, 1, paraShape({ align: 0, heading: 2, level: 1, listId: 1 })),
    hwpRecord(25, 1, paraShape({ align: 0, heading: 3, listId: 1 })),
    hwpRecord(23, 1, numbering(["^1.", "(^2)"])),
    hwpRecord(24, 1, Buffer.concat([Buffer.alloc(12), Buffer.from("\u2022", "utf16le")]))
  ]);
}

// Like Hangul, compressed sections end with the CRC-32 and the size of the uncompressed records.
function hwpCompress(records) {
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(zlib.crc32(records) >>> 0, 0);
  trailer.writeUInt32LE(records.length, 4);
  return Buffer.concat([zlib.deflateRawSync(records), trailer]);
}

// controls: false leaves out the table and the footnote, whose control records are too short for
// hwpjs's parser (web/hwp-wasm.js); the built-in reader accepts them. spanning: a last paragraph
// whose second line Hangul put on the next page.
// picture: a 4x4 red PNG between paragraphs (a drawing object with SHAPE_COMPONENT_PICTURE, its
// BinData stream and, in styled samples, the DocInfo BIN_DATA item).
// lists (styled): numbered paragraphs at two levels, a bullet, two joined boxed paragraphs and a
// header.
function createSampleHwp({ paragraphCount = 40, compressed = true, styled = false, controls = true, spanning = false, picture = false, lists = false } = {}) {
  lineTop = 0;
  const records = [...hwpParagraph(0, "HWP 5.0 검사 문서", styled ? { paraShape: 1, runs: [[0, 1], [4, 0]] } : {})];
  for (const text of paragraphs(paragraphCount, "HWP")) records.push(...hwpParagraph(0, text));
  if (lists) {
    for (const [text, paraShape] of [["첫 항목", 3], ["세부 항목", 4], ["둘째 세부", 4], ["둘째 항목", 3], ["글머리 항목", 5], ["상자 첫 줄", 2], ["상자 둘째 줄", 2]]) {
      records.push(...hwpParagraph(0, text, { paraShape }));
    }
    const header = Buffer.alloc(24);
    header.writeUInt32LE(9, 0);
    records.push(hwpRecord(66, 0, header),
      hwpRecord(67, 1, Buffer.concat([hwpControlChar(16, "head"), Buffer.from("\r", "utf16le")])),
      hwpRecord(71, 1, Buffer.concat([hwpControlId("head"), Buffer.alloc(4)])), hwpRecord(72, 2, Buffer.alloc(8)),
      ...hwpParagraph(2, "머리말 글"));
  }
  if (picture) {
    const header = Buffer.alloc(24);
    header.writeUInt32LE(9, 0);
    const object = Buffer.alloc(46);
    hwpControlId("gso ").copy(object, 0);
    object.writeUInt32LE(14400, 16);
    object.writeUInt32LE(14400, 20);
    const pictureData = Buffer.alloc(80);
    pictureData.writeUInt16LE(1, 71);
    records.push(hwpRecord(66, 0, header),
      hwpRecord(67, 1, Buffer.concat([hwpControlChar(11, "gso "), Buffer.from("\r", "utf16le")])),
      hwpRecord(71, 1, object), hwpRecord(76, 2, Buffer.alloc(8)), hwpRecord(85, 3, pictureData));
  }
  if (spanning) {
    const first = "앞 쪽 끝 줄입니다. ";
    records.push(...hwpParagraph(0, `${first}다음 쪽 첫 줄입니다.`, { lines: [0, first.length], newPageLine: 1 }));
  }
  // A 2x2 table whose first row is one merged cell, inside a paragraph of its own.
  if (controls) records.push(hwpRecord(66, 0, Buffer.alloc(24)),
    hwpRecord(67, 1, Buffer.concat([hwpControlChar(11, "tbl "), Buffer.from("\r", "utf16le")])),
    hwpRecord(71, 1, hwpControlId("tbl ")), hwpRecord(77, 2, Buffer.alloc(22)),
    ...hwpCell(2, 0, 0, "병합된 머리 칸", 2, { width: 40000, borderFill: 1 }),
    ...hwpCell(2, 0, 1, "HWP 표 왼쪽", 1, { width: 10000 }), ...hwpCell(2, 1, 1, "HWP 표 오른쪽", 1, { width: 30000 }));
  // Text with a footnote.
  const footnoteText = Buffer.concat([Buffer.from("각주가 있는 문장", "utf16le"), hwpControlChar(17, "fn  "), Buffer.from("\r", "utf16le")]);
  if (controls) records.push(hwpRecord(66, 0, Buffer.alloc(24)), hwpRecord(67, 1, footnoteText),
    hwpRecord(71, 1, hwpControlId("fn  ")), hwpRecord(72, 2, Buffer.alloc(8)), ...hwpParagraph(2, "HWP 각주 내용"));

  const header = Buffer.alloc(256);
  header.write("HWP Document File", 0, "latin1");
  header.writeUInt32LE(0x05010100, 32);
  header.writeUInt32LE(compressed ? 1 : 0, 36);
  const file = CFB.utils.cfb_new();
  CFB.utils.cfb_add(file, "FileHeader", header);
  if (styled) {
    // BIN_DATA: embedded item 1 is stream BIN0001 with the extension "png".
    const binData = Buffer.alloc(10);
    binData.writeUInt16LE(1, 0);
    binData.writeUInt16LE(1, 2);
    binData.writeUInt16LE(3, 4);
    binData.write("png", 6, "utf16le");
    const docInfo = Buffer.concat([hwpDocInfo(), ...(picture ? [hwpRecord(18, 1, binData)] : [])]);
    CFB.utils.cfb_add(file, "DocInfo", compressed ? hwpCompress(docInfo) : docInfo);
  }
  if (picture) {
    const png = createSamplePng(4, 4, [200, 30, 30]);
    CFB.utils.cfb_add(file, "BinData/BIN0001.png", compressed ? zlib.deflateRawSync(png) : png);
  }
  CFB.utils.cfb_add(file, "BodyText/Section0", compressed ? hwpCompress(Buffer.concat(records)) : Buffer.concat(records));
  return freeUnusedFatEntries(Buffer.from(CFB.write(file, { type: "buffer", fileType: "cfb" })));
}

// SheetJS cfb fills the FAT entries past the last sector with ENDOFCHAIN; Hangul writes FREESECT
// there, and the stricter Rust cfb crate (hwpjs, web/hwp-wasm.js) rejects anything else.
function freeUnusedFatEntries(buffer) {
  const sectorSize = 1 << buffer.readUInt16LE(0x1e);
  const sectors = buffer.length / sectorSize - 1;
  const fatSectors = buffer.readUInt32LE(0x2c);
  for (let i = 0; i < Math.min(fatSectors, 109); i += 1) {
    const offset = (buffer.readUInt32LE(0x4c + i * 4) + 1) * sectorSize;
    for (let entry = 0; entry < sectorSize / 4; entry += 1) {
      if (i * (sectorSize / 4) + entry >= sectors) buffer.writeUInt32LE(0xffffffff, offset + entry * 4);
    }
  }
  return buffer;
}

module.exports = { createSampleDocx, createSampleHwpx, createSampleHwpml, createSampleHwp, createSamplePng };
