// Tells converted document formats apart by their content, so a file whose extension is wrong
// (an HWPX saved as .hwp, a renamed DOCX) still opens with the right converter.
// ZIP packages are identified from their central directory entry names only; nothing is inflated.
import { isOleBytes } from "./hwpBinary.js";
import { decodeXmlBytes, isXmlDocumentBytes } from "./hwpXml.js";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const MAX_ZIP_COMMENT = 0xffff;
const MAX_ENTRIES = 10000;

// Entry names of a ZIP file, or null when the bytes are not a readable ZIP.
export function readZipEntryNames(bytes) {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - MAX_ZIP_COMMENT); offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      end = offset;
      break;
    }
  }
  if (end < 0) return null;
  const count = Math.min(view.getUint16(end + 10, true), MAX_ENTRIES);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const names = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_ENTRY_SIGNATURE) break;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (offset + 46 + nameLength > bytes.length) break;
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

// "hwp" (OLE HWP 5.0 or XML HWPML), "hwpx", "docx", "epub", "pdf", or null when unknown.
export function sniffDocumentFormat(bytes) {
  if (!bytes?.length) return null;
  if (isOleBytes(bytes)) return "hwp";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  const names = readZipEntryNames(bytes);
  if (names) {
    const set = new Set(names.map((name) => name.toLowerCase()));
    if (names.some((name) => /^Contents\/section\d+\.xml$/i.test(name))) return "hwpx";
    if (set.has("word/document.xml")) return "docx";
    if (set.has("meta-inf/container.xml")) return "epub";
    return null;
  }
  if (isXmlDocumentBytes(bytes) && /<HWPML[\s>]/.test(decodeXmlBytes(bytes.subarray(0, 4096)))) return "hwp";
  return null;
}
