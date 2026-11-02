// Converts office and Hangul documents to HTML for DocumentReader.
// DOCX: docx-preview, mammoth as fallback (loaded on first use). HWPX and XML HWP (HWPML): own converter.
// Binary HWP 5.0: platform.convertHwp where available (the desktop app converts it with page layout
// in the main process), otherwise the built-in text-and-table reader (the phone app).
import { sniffDocumentFormat } from "../src/core/documentSniff.js";
import { convertHwpBinary, isOleBytes } from "../src/core/hwpBinary.js";
import { withFontFallback } from "../src/core/hwpFonts.js";
import {
  convertHwpmlDocument,
  convertOwpmlSection,
  decodeXmlBytes,
  isXmlDocumentBytes,
  owpmlImagePaths,
  readOwpmlHeader,
  sortOwpmlSectionPaths
} from "../src/core/hwpXml.js";

const DEFAULT_DOCX_PREVIEW_URL = "/node_modules/docx-preview/dist/docx-preview.min.js";
const DEFAULT_MAMMOTH_URL = "/node_modules/mammoth/mammoth.browser.min.js";
const DEFAULT_PAKO_URL = "/node_modules/pako/dist/pako_inflate.min.js";
const scriptPromises = new Map();

// Loads a converter script on first use and resolves with the global it defines.
function loadGlobal(url, read) {
  if (read()) return Promise.resolve(read());
  if (!scriptPromises.has(url)) {
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => (read() ? resolve(read()) : reject(new Error("document.converterLoadFailed")));
      script.onerror = () => reject(new Error("document.converterLoadFailed"));
      document.head.append(script);
    });
    promise.catch(() => scriptPromises.delete(url));
    scriptPromises.set(url, promise);
  }
  return scriptPromises.get(url);
}

// docx-preview needs the JSZip global the app already loads.
const loadDocxPreview = () => loadGlobal(globalThis.MINS_DOCX_PREVIEW_URL || DEFAULT_DOCX_PREVIEW_URL, () => globalThis.docx?.renderAsync && globalThis.JSZip && globalThis.docx);
const loadMammoth = () => loadGlobal(globalThis.MINS_MAMMOTH_URL || DEFAULT_MAMMOTH_URL, () => globalThis.mammoth);
// pako's inflate. HWP sections end with a CRC and the original size after the compressed data;
// the browser's DecompressionStream rejects that as junk ("Failed to fetch").
const loadPako = () => loadGlobal(globalThis.MINS_PAKO_URL || DEFAULT_PAKO_URL, () => globalThis.pako?.inflateRaw && globalThis.pako);

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

// DOCX keeps its fonts, colours, paragraph and table styles through docx-preview. Pages are kept on
// the desktop; the phone reflows them to the screen width without page sizes, headers and footers.
// mammoth (plain structure) is the fallback when docx-preview fails.
async function convertDocx(bytes, platform) {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    return await renderDocxPreview(data, !platform?.isMobile);
  } catch {
    const mammoth = await loadMammoth();
    const result = await mammoth.convertToHtml({ arrayBuffer: data });
    return { html: result.value, layout: false };
  }
}

// Word bullets are Symbol/Wingdings private-use characters that phones have no font for.
const SYMBOL_BULLETS = { f0b7: "\u2022", f0a7: "\u25aa", f0d8: "\u27a2", f0fc: "\u2713", f076: "\u2756", f06e: "\u25a0", f0a8: "\u25a1", f071: "\u25a1" };

function unicodeBullets(css) {
  return css.replace(/content:\s*("[^"]*"|'[^']*')/g, (match, value) => match.replace(value,
    value.replace(/[\uf000-\uf0ff]|\x5c(f0[0-9a-f]{2})\s?/gi, (char, escape) =>
      SYMBOL_BULLETS[escape?.toLowerCase() || char.charCodeAt(0).toString(16)] || "\u2022")));
}

async function renderDocxPreview(data, layout) {
  const docx = await loadDocxPreview();
  const body = document.createElement("div");
  const styles = document.createElement("div");
  await docx.renderAsync(data, body, styles, {
    className: "docx",
    inWrapper: false,
    ignoreWidth: !layout,
    ignoreHeight: !layout,
    breakPages: layout,
    renderHeaders: layout,
    renderFooters: layout,
    useBase64URL: true
  });
  if (!body.querySelector("section.docx")) throw new Error("document.invalidDocx");
  for (const element of body.querySelectorAll("[style*='font-family']")) {
    element.style.fontFamily = withFontFallback(element.style.fontFamily);
  }
  const css = [...styles.querySelectorAll("style")].map((node) => unicodeBullets(node.textContent).replace(
    /(@font-face\s*\{[^}]*\})|font-family:\s*([^;}]+)/g,
    (match, fontFace, value) => fontFace || `font-family: ${withFontFallback(value)}`
  ));
  return { html: `<style>${css.join("\n")}</style><div class="docx-styled">${body.innerHTML}</div>`, layout };
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
  // A document whose styles cannot be read is still shown, without them.
  let styles = null;
  const header = zip.file("Contents/header.xml");
  if (header) {
    try {
      styles = readOwpmlHeader(parseXml(decodeXmlBytes(await header.async("uint8array")), "document.invalidHwpx"));
    } catch {
      styles = null;
    }
  }
  const xmls = [];
  for (const path of sections) xmls.push(decodeXmlBytes(await zip.file(path).async("uint8array")));
  const images = await readHwpxImages(zip, xmls);
  const parts = styles ? [`<style>${styles.css}</style>`] : [];
  for (const xml of xmls) parts.push(convertOwpmlSection(parseXml(xml, "document.invalidHwpx"), styles, images));
  return { html: parts.join(""), layout: false };
}

// Pictures the sections use, as data URLs. A missing or unreadable manifest only loses pictures.
async function readHwpxImages(zip, xmls) {
  let manifest = null;
  try {
    const file = zip.file("Contents/content.hpf");
    if (file) manifest = parseXml(decodeXmlBytes(await file.async("uint8array")), "document.invalidHwpx");
  } catch {
    manifest = null;
  }
  const images = new Map();
  for (const [id, { path, type }] of owpmlImagePaths(xmls, manifest, Object.keys(zip.files))) {
    images.set(id, `data:${type};base64,${await zip.file(path).async("base64")}`);
  }
  return images;
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

// The content decides between the converted formats; the file name is the fallback.
export async function convertDocument(fileLike, bytes, platform) {
  const sniffed = sniffDocumentFormat(bytes);
  const format = ["docx", "hwpx", "hwp"].includes(sniffed) ? sniffed : getDocumentFormat(fileLike?.name);
  if (format === "docx") return { format, ...await convertDocx(bytes, platform) };
  if (format === "hwpx") return { format, ...await convertHwpx(bytes) };
  if (format === "hwp") return { format, ...await convertHwp(bytes, fileLike, platform) };
  throw new Error("document.unsupported");
}
