// Converts office and Hangul documents to HTML for DocumentReader.
// DOCX: mammoth (loaded on first use). HWPX and XML HWP (HWPML): own converter.
// Binary HWP 5.0: platform.convertHwp where available (the desktop app converts it with page layout
// in the main process), otherwise the built-in text-and-table reader (the phone app).
import { convertHwpBinary, isOleBytes } from "../src/core/hwpBinary.js";
import {
  convertHwpmlDocument,
  convertOwpmlSection,
  decodeXmlBytes,
  isXmlDocumentBytes,
  sortOwpmlSectionPaths
} from "../src/core/hwpXml.js";

const DEFAULT_MAMMOTH_URL = "/node_modules/mammoth/mammoth.browser.min.js";
const DEFAULT_PAKO_URL = "/node_modules/pako/dist/pako_inflate.min.js";
let mammothPromise = null;
let pakoPromise = null;

function loadMammoth() {
  if (globalThis.mammoth) return Promise.resolve(globalThis.mammoth);
  mammothPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = globalThis.MINS_MAMMOTH_URL || DEFAULT_MAMMOTH_URL;
    script.onload = () => (globalThis.mammoth ? resolve(globalThis.mammoth) : reject(new Error("document.converterLoadFailed")));
    script.onerror = () => reject(new Error("document.converterLoadFailed"));
    document.head.append(script);
  });
  mammothPromise.catch(() => { mammothPromise = null; });
  return mammothPromise;
}

// pako's inflate (loaded on first use). HWP sections end with a CRC and the original size after the
// compressed data; the browser's DecompressionStream rejects that as junk ("Failed to fetch").
function loadPako() {
  if (globalThis.pako?.inflateRaw) return Promise.resolve(globalThis.pako);
  pakoPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = globalThis.MINS_PAKO_URL || DEFAULT_PAKO_URL;
    script.onload = () => (globalThis.pako?.inflateRaw ? resolve(globalThis.pako) : reject(new Error("document.converterLoadFailed")));
    script.onerror = () => reject(new Error("document.converterLoadFailed"));
    document.head.append(script);
  });
  pakoPromise.catch(() => { pakoPromise = null; });
  return pakoPromise;
}

export function getDocumentFormat(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".hwpx")) return "hwpx";
  if (lower.endsWith(".hwp")) return "hwp";
  return null;
}

async function inflateRaw(bytes) {
  const pako = await loadPako();
  try {
    return pako.inflateRaw(bytes);
  } catch {
    throw new Error("document.invalidHwp");
  }
}

function parseXml(text, errorKey) {
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error(errorKey);
  return parsed;
}

async function convertDocx(bytes) {
  const mammoth = await loadMammoth();
  const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return { html: result.value, layout: false };
}

async function convertHwpx(bytes) {
  if (!globalThis.JSZip) throw new Error("document.converterLoadFailed");
  let zip;
  try {
    zip = await globalThis.JSZip.loadAsync(bytes);
  } catch {
    throw new Error("document.invalidHwpx");
  }
  const sections = sortOwpmlSectionPaths(Object.keys(zip.files));
  if (!sections.length) throw new Error("document.invalidHwpx");
  const parts = [];
  for (const path of sections) {
    const xml = decodeXmlBytes(await zip.file(path).async("uint8array"));
    parts.push(convertOwpmlSection(parseXml(xml, "document.invalidHwpx")));
  }
  return { html: parts.join(""), layout: false };
}

async function convertHwp(bytes, fileLike, platform) {
  if (isXmlDocumentBytes(bytes)) {
    return { html: convertHwpmlDocument(parseXml(decodeXmlBytes(bytes), "document.invalidHwpml")), layout: false };
  }
  if (!isOleBytes(bytes)) throw new Error("document.invalidHwp");
  if (platform?.convertHwp) {
    const html = await platform.convertHwp({ path: fileLike.path || "", bytes: fileLike.path ? null : bytes });
    return { html, layout: true };
  }
  return { html: await convertHwpBinary(bytes, inflateRaw), layout: false };
}

export async function convertDocument(fileLike, bytes, platform) {
  const format = getDocumentFormat(fileLike?.name);
  if (format === "docx") return { format, ...await convertDocx(bytes) };
  if (format === "hwpx") return { format, ...await convertHwpx(bytes) };
  if (format === "hwp") return { format, ...await convertHwp(bytes, fileLike, platform) };
  throw new Error("document.unsupported");
}
