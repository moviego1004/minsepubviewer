// Text-and-table conversion for the XML forms of Hangul documents:
// HWPML (a single XML file, often saved with a .hwp extension) and HWPX/OWPML
// (a zip of section XML files). Layout, images and drawing objects are not rendered.
// Functions take a parsed XML Document so the browser's DOMParser and test parsers both work.

const BLOCK_TABLE_ATTRIBUTES = ' class="hwp-table"';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function localName(node) {
  return String(node.localName || node.nodeName || "").replace(/^.*:/, "");
}

function elementChildren(node) {
  const children = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) children.push(child);
  }
  return children;
}

function attribute(node, name) {
  const value = node.getAttribute?.(name);
  return value === null || value === undefined || value === "" ? null : value;
}

function spanAttributes(cell, names) {
  const colspan = Number(attribute(cell, names.col)) || 1;
  const rowspan = Number(attribute(cell, names.row)) || 1;
  return `${colspan > 1 ? ` colspan="${colspan}"` : ""}${rowspan > 1 ? ` rowspan="${rowspan}"` : ""}`;
}

export function decodeXmlBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder("utf-16le").decode(data.subarray(2));
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder("utf-16be").decode(data.subarray(2));
  if (data[0] === 0x3c && data[1] === 0x00) return new TextDecoder("utf-16le").decode(data);
  if (data[0] === 0x00 && data[1] === 0x3c) return new TextDecoder("utf-16be").decode(data);
  const start = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? 3 : 0;
  // Files may declare UTF-16 while storing UTF-8; the declaration must not mislead the parser.
  return new TextDecoder("utf-8").decode(data.subarray(start)).replace(/^(<\?xml[^>]*?)\sencoding=["'][^"']*["']/i, "$1");
}

export function isXmlDocumentBytes(bytes) {
  const head = decodeXmlBytes(bytes.subarray ? bytes.subarray(0, 64) : bytes.slice(0, 64)).trimStart();
  return head.startsWith("<?xml") || head.startsWith("<HWPML");
}

// --- HWPML (<HWPML><BODY><SECTION><P><TEXT><CHAR>) -------------------------------

function hwpmlParagraph(paragraph) {
  let html = "";
  for (const child of elementChildren(paragraph)) {
    if (localName(child) !== "TEXT") continue;
    for (const part of elementChildren(child)) {
      const name = localName(part);
      if (name === "CHAR") html += escapeHtml(part.textContent || "");
      else if (name === "TABLE") html += `</p>${hwpmlTable(part)}<p>`;
      else if (name === "LINEBREAK") html += "<br>";
      else if (name === "TAB") html += "\t";
    }
  }
  return `<p>${html || "<br>"}</p>`.replace(/<p><\/p>/g, "");
}

function hwpmlBlocks(container) {
  return elementChildren(container).map((child) => {
    const name = localName(child);
    if (name === "P") return hwpmlParagraph(child);
    if (name === "TABLE") return hwpmlTable(child);
    return "";
  }).join("");
}

function hwpmlTable(table) {
  const rows = elementChildren(table).filter((row) => localName(row) === "ROW").map((row) => {
    const cells = elementChildren(row).filter((cell) => localName(cell) === "CELL").map((cell) => {
      const content = elementChildren(cell).filter((child) => localName(child) === "PARALIST").map(hwpmlBlocks).join("");
      return `<td${spanAttributes(cell, { col: "ColSpan", row: "RowSpan" })}>${content}</td>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  });
  return `<table${BLOCK_TABLE_ATTRIBUTES}><tbody>${rows.join("")}</tbody></table>`;
}

export function convertHwpmlDocument(document) {
  const root = document.documentElement;
  if (!root || localName(root) !== "HWPML") throw new Error("document.invalidHwpml");
  const body = elementChildren(root).find((child) => localName(child) === "BODY");
  if (!body) throw new Error("document.invalidHwpml");
  const sections = elementChildren(body).filter((child) => localName(child) === "SECTION");
  return sections.map((section) => `<section>${hwpmlBlocks(section)}</section>`).join("");
}

// --- HWPX / OWPML (<hs:sec><hp:p><hp:run><hp:t>) ----------------------------------

function owpmlRunContent(run) {
  let html = "";
  for (const part of elementChildren(run)) {
    const name = localName(part);
    if (name === "t") {
      for (let node = part.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === 3 || node.nodeType === 4) html += escapeHtml(node.nodeValue || "");
        else if (node.nodeType === 1 && localName(node) === "lineBreak") html += "<br>";
        else if (node.nodeType === 1 && localName(node) === "tab") html += "\t";
      }
    } else if (name === "tbl") {
      html += `</p>${owpmlTable(part)}<p>`;
    }
  }
  return html;
}

function owpmlParagraph(paragraph) {
  const content = elementChildren(paragraph).filter((child) => localName(child) === "run").map(owpmlRunContent).join("");
  return `<p>${content || "<br>"}</p>`.replace(/<p><\/p>/g, "");
}

function owpmlBlocks(container) {
  return elementChildren(container).map((child) => (localName(child) === "p" ? owpmlParagraph(child) : "")).join("");
}

function owpmlTable(table) {
  const rows = elementChildren(table).filter((row) => localName(row) === "tr").map((row) => {
    const cells = elementChildren(row).filter((cell) => localName(cell) === "tc").map((cell) => {
      const span = elementChildren(cell).find((child) => localName(child) === "cellSpan");
      const content = elementChildren(cell).filter((child) => localName(child) === "subList").map(owpmlBlocks).join("");
      return `<td${span ? spanAttributes(span, { col: "colSpan", row: "rowSpan" }) : ""}>${content}</td>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  });
  return `<table${BLOCK_TABLE_ATTRIBUTES}><tbody>${rows.join("")}</tbody></table>`;
}

export function convertOwpmlSection(document) {
  const root = document.documentElement;
  if (!root || localName(root) !== "sec") throw new Error("document.invalidHwpx");
  return `<section>${owpmlBlocks(root)}</section>`;
}

// Section files are Contents/section0.xml, section1.xml, ... in reading order.
export function sortOwpmlSectionPaths(paths) {
  return paths
    .filter((path) => /^Contents\/section\d+\.xml$/i.test(path))
    .sort((a, b) => Number(/(\d+)\.xml$/i.exec(a)[1]) - Number(/(\d+)\.xml$/i.exec(b)[1]));
}
