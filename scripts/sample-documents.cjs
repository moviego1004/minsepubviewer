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

async function createSampleHwpx() {
  const zip = new JSZip();
  zip.file("mimetype", "application/hwp+zip");
  zip.file("Contents/content.hpf", '<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/"/>');
  const body = paragraphs(40, "HWPX").map((text) => `<hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p>`).join("");
  zip.file("Contents/section0.xml", `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:t>HWPX 검사 문서</hp:t></hp:run></hp:p>${body}<hp:p><hp:run><hp:tbl><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>HWPX 표</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`);
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

function hwpParagraph(level, text) {
  return [hwpRecord(66, level, Buffer.alloc(22)), hwpRecord(67, level + 1, hwpText(text))];
}

function hwpCell(level, col, row, text, colSpan = 1) {
  const list = Buffer.alloc(34);
  list.writeUInt16LE(1, 0);
  list.writeUInt16LE(col, 8);
  list.writeUInt16LE(row, 10);
  list.writeUInt16LE(colSpan, 12);
  list.writeUInt16LE(1, 14);
  return [hwpRecord(72, level, list), ...hwpParagraph(level, text)];
}

function createSampleHwp({ paragraphCount = 40, compressed = true } = {}) {
  const records = [...hwpParagraph(0, "HWP 5.0 검사 문서")];
  for (const text of paragraphs(paragraphCount, "HWP")) records.push(...hwpParagraph(0, text));
  // A 2x2 table whose first row is one merged cell, inside a paragraph of its own.
  records.push(hwpRecord(66, 0, Buffer.alloc(22)),
    hwpRecord(67, 1, Buffer.concat([hwpControlChar(11, "tbl "), Buffer.from("\r", "utf16le")])),
    hwpRecord(71, 1, hwpControlId("tbl ")), hwpRecord(77, 2, Buffer.alloc(22)),
    ...hwpCell(2, 0, 0, "병합된 머리 칸", 2), ...hwpCell(2, 0, 1, "HWP 표 왼쪽"), ...hwpCell(2, 1, 1, "HWP 표 오른쪽"));
  // Text with a footnote.
  const footnoteText = Buffer.concat([Buffer.from("각주가 있는 문장", "utf16le"), hwpControlChar(17, "fn  "), Buffer.from("\r", "utf16le")]);
  records.push(hwpRecord(66, 0, Buffer.alloc(22)), hwpRecord(67, 1, footnoteText),
    hwpRecord(71, 1, hwpControlId("fn  ")), hwpRecord(72, 2, Buffer.alloc(8)), ...hwpParagraph(2, "HWP 각주 내용"));

  const header = Buffer.alloc(256);
  header.write("HWP Document File", 0, "latin1");
  header.writeUInt32LE(0x05010100, 32);
  header.writeUInt32LE(compressed ? 1 : 0, 36);
  const file = CFB.utils.cfb_new();
  CFB.utils.cfb_add(file, "FileHeader", header);
  CFB.utils.cfb_add(file, "BodyText/Section0", compressed ? zlib.deflateRawSync(Buffer.concat(records)) : Buffer.concat(records));
  return Buffer.from(CFB.write(file, { type: "buffer", fileType: "cfb" }));
}

module.exports = { createSampleDocx, createSampleHwpx, createSampleHwpml, createSampleHwp };
