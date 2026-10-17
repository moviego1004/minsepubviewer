// Small generated DOCX, HWPX and HWPML (XML .hwp) files for smoke tests.
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

module.exports = { createSampleDocx, createSampleHwpx, createSampleHwpml };
