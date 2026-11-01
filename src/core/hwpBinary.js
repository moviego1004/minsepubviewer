// Text-and-table reader for binary HWP 5.0 files (an OLE compound file of zlib-compressed record
// streams). Used where the desktop converter is not available (the phone app). Paragraph text,
// tables and text boxes are kept with the fonts, sizes, colours, alignment, indents and cell
// borders/backgrounds of DocInfo; page layout, images and drawings are not rendered.
// inflateRaw(bytes) -> Promise<Uint8Array> is passed in so the browser and tests can each supply one.

const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const TAG_FACE_NAME = 19;
const TAG_BORDER_FILL = 20;
const TAG_CHAR_SHAPE = 21;
const TAG_PARA_SHAPE = 25;
const TAG_PARA_HEADER = 66;
const TAG_PARA_TEXT = 67;
const TAG_PARA_CHAR_SHAPE = 68;
const TAG_CTRL_HEADER = 71;
const TAG_LIST_HEADER = 72;
const TAG_TABLE = 77;

// Characters that occupy 8 code units (the control character, 6 units of data, the character again).
const WIDE_CONTROLS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
// Wide controls that have their own CTRL_HEADER record, in the order they appear in the text.
const OBJECT_CONTROLS = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function isOleBytes(bytes) {
  return OLE_SIGNATURE.every((value, index) => bytes[index] === value);
}

// --- OLE compound file ------------------------------------------------------------------------

export function readCompoundFile(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isOleBytes(bytes)) throw new Error("document.invalidHwp");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset) => view.getUint32(offset, true);
  const sectorSize = 1 << view.getUint16(30, true);
  const miniSectorSize = 1 << view.getUint16(32, true);
  const fatSectorCount = u32(44);
  const directoryStart = u32(48);
  const miniCutoff = u32(56);
  const miniFatStart = u32(60);
  let difatSector = u32(68);
  const sectorOffset = (sector) => (sector + 1) * sectorSize;

  const fatSectors = [];
  for (let index = 0; index < 109 && fatSectors.length < fatSectorCount; index += 1) {
    const sector = u32(76 + index * 4);
    if (sector !== FREE_SECTOR) fatSectors.push(sector);
  }
  for (let guard = 0; difatSector !== END_OF_CHAIN && difatSector !== FREE_SECTOR && fatSectors.length < fatSectorCount; guard += 1) {
    if (guard > 1 << 20) throw new Error("document.invalidHwp");
    const base = sectorOffset(difatSector);
    const perSector = sectorSize / 4 - 1;
    for (let index = 0; index < perSector && fatSectors.length < fatSectorCount; index += 1) fatSectors.push(u32(base + index * 4));
    difatSector = u32(base + perSector * 4);
  }
  const fat = new Uint32Array(fatSectors.length * (sectorSize / 4));
  fatSectors.forEach((sector, index) => {
    const base = sectorOffset(sector);
    if (base + sectorSize > bytes.length) throw new Error("document.invalidHwp");
    for (let entry = 0; entry < sectorSize / 4; entry += 1) fat[index * (sectorSize / 4) + entry] = u32(base + entry * 4);
  });

  const chain = (start, table) => {
    const sectors = [];
    for (let sector = start; sector !== END_OF_CHAIN && sector !== FREE_SECTOR; sector = table[sector]) {
      if (sector >= table.length || sectors.length > table.length) throw new Error("document.invalidHwp");
      sectors.push(sector);
    }
    return sectors;
  };
  const readChain = (start, size = Infinity) => {
    const sectors = chain(start, fat);
    const out = new Uint8Array(Math.min(size, sectors.length * sectorSize));
    sectors.forEach((sector, index) => {
      const begin = index * sectorSize;
      if (begin >= out.length) return;
      out.set(bytes.subarray(sectorOffset(sector), sectorOffset(sector) + Math.min(sectorSize, out.length - begin)), begin);
    });
    return out;
  };

  const directory = readChain(directoryStart);
  const entries = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const entry = new DataView(directory.buffer, directory.byteOffset + offset, 128);
    const nameLength = Math.max(0, entry.getUint16(64, true) - 2);
    let name = "";
    for (let index = 0; index < nameLength; index += 2) name += String.fromCharCode(entry.getUint16(index, true));
    entries.push({
      name,
      type: entry.getUint8(66),
      left: entry.getUint32(68, true),
      right: entry.getUint32(72, true),
      child: entry.getUint32(76, true),
      start: entry.getUint32(116, true),
      size: entry.getUint32(120, true)
    });
  }
  const root = entries[0];
  if (!root || root.type !== 5) throw new Error("document.invalidHwp");
  const miniStream = root.start === END_OF_CHAIN ? new Uint8Array() : readChain(root.start, root.size);
  const miniFatBytes = miniFatStart === END_OF_CHAIN ? new Uint8Array() : readChain(miniFatStart);
  const miniFat = new Uint32Array(miniFatBytes.buffer, miniFatBytes.byteOffset, Math.floor(miniFatBytes.length / 4));

  const streams = new Map();
  const visit = (index, prefix, seen) => {
    if (index === FREE_SECTOR || index >= entries.length || seen.has(index)) return;
    seen.add(index);
    const entry = entries[index];
    visit(entry.left, prefix, seen);
    visit(entry.right, prefix, seen);
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 1) visit(entry.child, path, seen);
    else if (entry.type === 2) streams.set(path, entry);
  };
  visit(root.child, "", new Set());

  return {
    paths: [...streams.keys()],
    has: (path) => streams.has(path),
    read(path) {
      const entry = streams.get(path);
      if (!entry) return null;
      if (entry.size >= miniCutoff) return readChain(entry.start, entry.size);
      const sectors = chain(entry.start, miniFat);
      const out = new Uint8Array(entry.size);
      sectors.forEach((sector, index) => {
        const begin = index * miniSectorSize;
        if (begin < out.length) out.set(miniStream.subarray(sector * miniSectorSize, sector * miniSectorSize + Math.min(miniSectorSize, out.length - begin)), begin);
      });
      return out;
    }
  };
}

// --- Records ----------------------------------------------------------------------------------

export function readRecords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const header = view.getUint32(offset, true);
    offset += 4;
    let size = header >>> 20;
    if (size === 0xfff) {
      if (offset + 4 > bytes.length) break;
      size = view.getUint32(offset, true);
      offset += 4;
    }
    if (offset + size > bytes.length) break;
    records.push({ tag: header & 0x3ff, level: (header >>> 10) & 0x3ff, data: bytes.subarray(offset, offset + size), children: [] });
    offset += size;
  }
  return records;
}

// Each record belongs to the nearest earlier record with a lower level.
function buildTree(records) {
  const root = { tag: -1, level: -1, children: [] };
  const stack = [root];
  for (const record of records) {
    while (stack.length > 1 && stack[stack.length - 1].level >= record.level) stack.pop();
    stack[stack.length - 1].children.push(record);
    stack.push(record);
  }
  return root.children;
}

function controlId(record) {
  if (record.data.length < 4) return "";
  return String.fromCharCode(record.data[3], record.data[2], record.data[1], record.data[0]);
}

// --- Styles (DocInfo) -------------------------------------------------------------------------
// Each character shape, paragraph shape and border fill becomes a class (.hcN, .hpN, .hbN).
// Sizes are relative: 1rem is 10pt of the original (see readDocInfo).

const NO_COLOR = 0xffffffff;
const SERIF_FONT = /명조|바탕|궁서|batang|myeong|gungsuh|times|^(?!.*sans).*serif/i;
const ALIGNMENTS = ["justify", "left", "right", "center", "justify", "justify"];
const LINE_STYLES = [null, "solid", "dashed", "dotted", "dashed", "dotted", "dashed", "dotted",
  "double", "double", "double", "double", "solid", "double", "inset", "outset", "groove", "ridge"];
const LINE_WIDTHS_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1, 1.5, 2, 3, 4, 5];

const rem = (pt) => `${Number((pt / 10).toFixed(3))}rem`;
const dataView = (data) => new DataView(data.buffer, data.byteOffset, data.byteLength);

// COLORREF is 0x00BBGGRR.
function cssColor(value) {
  return `#${[value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function fontFamily(names) {
  const unique = [...new Set(names.map((name) => String(name || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim()).filter(Boolean))];
  const generic = SERIF_FONT.test(unique[0] || "")
    ? '"Noto Serif KR", "Noto Serif CJK KR", serif'
    : '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  return [...unique.map((name) => `"${name}"`), generic].join(", ");
}

function readFaceName(data) {
  const view = dataView(data);
  const length = data.length >= 3 ? view.getUint16(1, true) : 0;
  let name = "";
  for (let index = 0; index < length && 5 + index * 2 <= data.length; index += 1) name += String.fromCharCode(view.getUint16(3 + index * 2, true));
  return name;
}

// Faces are listed per language; character shapes refer to Hangul (0) and Latin (1) faces.
function charShapeCss(data, faces) {
  if (data.length < 56) return "";
  const view = dataView(data);
  const props = view.getUint32(46, true);
  const sizePt = (view.getInt32(42, true) / 100) * ((data[28] || 100) / 100);
  const css = [`font-family:${fontFamily([faces[0]?.[view.getUint16(0, true)], faces[1]?.[view.getUint16(2, true)]])}`];
  const script = props & (1 << 15) ? "super" : props & (1 << 16) ? "sub" : "";
  if (sizePt > 0) css.push(`font-size:${rem(script ? sizePt * 0.7 : sizePt)}`);
  if (script) css.push(`vertical-align:${script}`);
  if (props & 1) css.push("font-style:italic");
  if (props & 2) css.push("font-weight:bold");
  const lines = [];
  const underline = (props >>> 2) & 3;
  if (underline === 1) lines.push("underline");
  if (underline === 3) lines.push("overline");
  if ((props >>> 18) & 7) lines.push("line-through");
  if (lines.length) css.push(`text-decoration:${lines.join(" ")}`);
  const spacing = view.getInt8(21);
  if (spacing) css.push(`letter-spacing:${Number((spacing / 200).toFixed(3))}em`);
  // Black is left to the reader's theme colour.
  const color = view.getUint32(52, true) & 0xffffff;
  if (color) css.push(`color:${cssColor(color)}`);
  const shade = view.getUint32(60, true);
  if (shade !== NO_COLOR) css.push(`background-color:${cssColor(shade)}`);
  return css.join(";");
}

function readBorderFill(data) {
  if (data.length < 36) return { borders: "", fill: "" };
  const view = dataView(data);
  const borders = ["left", "right", "top", "bottom"].map((side, index) => {
    const offset = 2 + index * 6;
    const style = LINE_STYLES[data[offset]];
    if (!style) return `border-${side}:none`;
    const px = Math.max(style === "double" ? 3 : 1, Math.round(((LINE_WIDTHS_MM[data[offset + 1]] || 0.1) * 96) / 25.4));
    return `border-${side}:${px}px ${style} ${cssColor(view.getUint32(offset + 2, true))}`;
  }).join(";");
  const fillColor = data.length >= 40 && view.getUint32(32, true) & 1 ? view.getUint32(36, true) : NO_COLOR;
  return { borders, fill: fillColor === NO_COLOR ? "" : cssColor(fillColor) };
}

// Paragraph margins and indents are stored doubled. A negative indent hangs the first line.
function paraShapeCss(data, borderFills) {
  if (data.length < 34) return "";
  const view = dataView(data);
  const props = view.getUint32(0, true);
  const left = view.getInt32(4, true) / 200;
  const right = view.getInt32(8, true) / 200;
  const indent = view.getInt32(12, true) / 200;
  const css = [
    "white-space:pre-wrap",
    `text-align:${ALIGNMENTS[(props >>> 2) & 7] || "justify"}`,
    `margin:${rem(view.getInt32(16, true) / 200)} 0 ${rem(view.getInt32(20, true) / 200)}`,
    `padding:0 ${rem(Math.max(0, right))} 0 ${rem(Math.max(0, left + Math.max(0, -indent)))}`,
    `text-indent:${rem(indent)}`
  ];
  const modern = data.length >= 54;
  const spacingType = modern ? view.getUint32(46, true) & 0x1f : props & 3;
  const spacing = modern ? view.getUint32(50, true) : view.getInt32(24, true);
  if (spacingType === 0 && spacing > 0) css.push(`line-height:${Number((spacing / 100).toFixed(2))}`);
  else if (spacingType === 1 && spacing > 0) css.push(`line-height:${rem(spacing / 100)}`);
  // Paragraph borders depend on settings this reader does not follow; only a coloured background is kept.
  const fill = borderFills[view.getUint16(32, true) - 1]?.fill;
  if (fill && fill !== "#ffffff") css.push(`background-color:${fill}`);
  return css.join(";");
}

export function readDocInfo(bytes) {
  const records = readRecords(bytes);
  const faceRecords = records.filter((record) => record.tag === TAG_FACE_NAME).map((record) => readFaceName(record.data));
  // ID_MAPPINGS (tag 17) holds the number of faces for each language after the BinData count.
  const mappings = records.find((record) => record.tag === 17);
  const faces = [];
  if (mappings && mappings.data.length >= 8) {
    const view = dataView(mappings.data);
    let offset = 0;
    for (let language = 0; language < 2; language += 1) {
      const count = Math.max(0, view.getInt32(4 + language * 4, true));
      faces.push(faceRecords.slice(offset, offset + count));
      offset += count;
    }
  } else {
    faces.push(faceRecords, faceRecords);
  }
  const borderFills = records.filter((record) => record.tag === TAG_BORDER_FILL).map((record) => readBorderFill(record.data));
  const charShapes = records.filter((record) => record.tag === TAG_CHAR_SHAPE).map((record) => charShapeCss(record.data, faces));
  const paraShapes = records.filter((record) => record.tag === TAG_PARA_SHAPE).map((record) => paraShapeCss(record.data, borderFills));
  const rules = [
    // rem in this document: 10pt of the original. 14px keeps common 10-15pt body text readable on
    // a phone without spilling; the reader's zoom scales it further.
    "html{font-size:14px}",
    ...charShapes.map((css, id) => (css ? `.hwp-styled .hc${id}{${css}}` : "")),
    ...paraShapes.map((css, id) => (css ? `.hwp-styled .hp${id}{${css}}` : "")),
    ...borderFills.map(({ borders, fill }, index) => `.hwp-styled .hb${index + 1}{${borders}${fill ? `;background-color:${fill}` : ""}}`)
  ];
  return {
    css: rules.filter(Boolean).join("\n"),
    // An empty paragraph keeps the height of its character shape.
    charSize: (id) => /font-size:([^;]+)/.exec(charShapes[id] || "")?.[1] || "",
    hasCharShape: (id) => id >= 0 && id < charShapes.length,
    hasParaShape: (id) => id >= 0 && id < paraShapes.length,
    hasBorderFill: (id) => id >= 1 && id <= borderFills.length
  };
}

// --- HTML -------------------------------------------------------------------------------------

// Styles of the document being rendered (null when it has no readable DocInfo).
let docStyles = null;

// PARA_CHAR_SHAPE: pairs of (position in the paragraph text, character shape id).
function readCharRuns(record) {
  if (!record) return [];
  const view = dataView(record.data);
  const runs = [];
  for (let offset = 0; offset + 8 <= record.data.length; offset += 8) runs.push({ position: view.getUint32(offset, true), id: view.getUint32(offset + 4, true) });
  return runs;
}

function paragraphText(record, controls, renderControl, runs = []) {
  if (!record) return "";
  const data = record.data;
  let html = "";
  let pending = "";
  let shape = -1;
  let nextRun = 0;
  const flush = () => {
    if (!pending) return;
    const text = escapeHtml(pending);
    html += docStyles?.hasCharShape(shape) ? `<span class="hc${shape}">${text}</span>` : text;
    pending = "";
  };
  for (let index = 0; index + 1 < data.length; index += 2) {
    while (nextRun < runs.length && runs[nextRun].position <= index / 2) {
      if (runs[nextRun].id !== shape) { flush(); shape = runs[nextRun].id; }
      nextRun += 1;
    }
    const code = data[index] | (data[index + 1] << 8);
    if (code >= 32) { pending += String.fromCharCode(code); continue; }
    if (WIDE_CONTROLS.has(code)) {
      index += 14;
      if (code === 9) pending += "\t";
      else if (OBJECT_CONTROLS.has(code)) { flush(); html += renderControl(controls.shift()); }
      continue;
    }
    if (code === 10) { flush(); html += "<br>"; }
    else if (code === 24) pending += "-";
    else if (code === 30 || code === 31) pending += " ";
  }
  // Trailing spaces would hang past right-aligned and centred lines (white-space: pre-wrap).
  pending = pending.replace(/[ 	]+$/, "");
  flush();
  return html;
}

function renderParagraphs(nodes) {
  return nodes.filter((node) => node.tag === TAG_PARA_HEADER).map(renderParagraph).join("");
}

// Blocks such as tables cannot sit inside <p>, so the paragraph is closed around them and
// reopened (CONTINUE_PARAGRAPH) with the same paragraph shape.
const CONTINUE_PARAGRAPH = "<p data-hwp-continue>";

function paragraphTag(paragraph, runs) {
  if (!docStyles) return "<p>";
  const shape = paragraph.data.length >= 10 ? dataView(paragraph.data).getUint16(8, true) : -1;
  const size = runs.length ? docStyles.charSize(runs[0].id) : "";
  const className = docStyles.hasParaShape(shape) ? ` class="hp${shape}"` : "";
  return `<p${className}${size ? ` style="font-size:${size}"` : ""}>`;
}

function renderParagraph(paragraph) {
  const text = paragraph.children.find((child) => child.tag === TAG_PARA_TEXT);
  const controls = paragraph.children.filter((child) => child.tag === TAG_CTRL_HEADER);
  const runs = readCharRuns(paragraph.children.find((child) => child.tag === TAG_PARA_CHAR_SHAPE));
  const open = paragraphTag(paragraph, runs);
  const content = paragraphText(text, controls, renderControl, runs).split(CONTINUE_PARAGRAPH).join(open);
  return `${open}${content || "<br>"}</p>`.replace(/<p(?: [^>]*)?><\/p>/g, "");
}

// Footnotes and endnotes of the section being rendered; listed after its text.
let sectionNotes = [];

function renderControl(control) {
  if (!control) return "";
  const id = controlId(control);
  if (id === "tbl ") return `</p>${renderTable(control)}${CONTINUE_PARAGRAPH}`;
  if (id === "fn  " || id === "en  ") {
    sectionNotes.push(renderNestedLists(control));
    return `<sup class="hwp-note-ref">${sectionNotes.length})</sup>`;
  }
  // Text boxes and other drawing objects: keep the text they hold.
  if (id === "gso ") {
    const html = renderNestedLists(control);
    return html ? `</p><div class="hwp-box">${html}</div>${CONTINUE_PARAGRAPH}` : "";
  }
  return "";
}

function renderNestedLists(node) {
  let html = "";
  for (const child of node.children) {
    if (child.tag === TAG_PARA_HEADER) html += renderParagraph(child);
    else if (child.tag !== TAG_PARA_TEXT) html += renderNestedLists(child);
  }
  return html;
}

function renderTable(control) {
  const cells = [];
  let current = null;
  // The table record holds the inner padding used by cells that do not set their own (0xffff).
  const table = control.children.find((child) => child.tag === TAG_TABLE);
  const tablePadding = table && table.data.length >= 18 ? [10, 12, 14, 16].map((offset) => dataView(table.data).getUint16(offset, true)) : [141, 141, 141, 141];
  for (const child of control.children) {
    if (child.tag === TAG_LIST_HEADER) {
      const view = new DataView(child.data.buffer, child.data.byteOffset, child.data.byteLength);
      const read = (offset) => (offset + 2 <= child.data.length ? view.getUint16(offset, true) : 0);
      current = {
        col: read(8), row: read(10), colSpan: read(12) || 1, rowSpan: read(14) || 1,
        width: child.data.length >= 20 ? view.getUint32(16, true) : 0,
        padding: [24, 26, 28, 30].map((offset, side) => {
          const value = read(offset);
          return value >= 0x8000 ? (tablePadding[side] < 0x8000 ? tablePadding[side] : 141) : value;
        }),
        borderFill: read(32),
        valign: child.data.length >= 6 ? (view.getUint32(2, true) >>> 5) & 3 : 0,
        paragraphs: []
      };
      cells.push(current);
    } else if (child.tag === TAG_PARA_HEADER && current) {
      current.paragraphs.push(child);
    }
  }
  const rows = new Map();
  for (const cell of cells) {
    if (!rows.has(cell.row)) rows.set(cell.row, []);
    rows.get(cell.row).push(cell);
  }
  // Cell widths (1/100 pt) become shares of the widest row so the table fits the screen.
  const tableWidth = Math.max(0, ...[...rows.values()].map((row) => row.reduce((sum, cell) => sum + cell.width, 0)));
  const body = [...rows.keys()].sort((a, b) => a - b).map((row) => {
    const html = rows.get(row).sort((a, b) => a.col - b.col).map((cell) => {
      const span = `${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ""}`;
      return `<td${span}${cellAttributes(cell, tableWidth)}>${renderParagraphs(cell.paragraphs)}</td>`;
    }).join("");
    return `<tr>${html}</tr>`;
  }).join("");
  const width = docStyles && tableWidth ? ` style="width:min(100%, ${rem(tableWidth / 100)})"` : "";
  return `<table class="hwp-table"${width}><tbody>${body}</tbody></table>`;
}

function cellAttributes(cell, tableWidth) {
  if (!docStyles) return "";
  const [left, right, top, bottom] = cell.padding.map((value) => rem(value / 100));
  const css = [`padding:${top} ${right} ${bottom} ${left}`, `vertical-align:${["top", "middle", "bottom"][cell.valign] || "top"}`];
  if (tableWidth && cell.width) css.push(`width:${Number(((cell.width / tableWidth) * 100).toFixed(2))}%`);
  const className = docStyles.hasBorderFill(cell.borderFill) ? ` class="hb${cell.borderFill}"` : "";
  return `${className} style="${css.join(";")}"`;
}

export function renderSection(bytes) {
  sectionNotes = [];
  try {
    const body = renderParagraphs(buildTree(readRecords(bytes)));
    const notes = sectionNotes.length
      ? `<ol class="hwp-notes">${sectionNotes.map((note) => `<li>${note}</li>`).join("")}</ol>`
      : "";
    return `<section${docStyles ? ' class="hwp-styled"' : ""}>${body}${notes}</section>`;
  } finally {
    sectionNotes = [];
  }
}

// --- Document ---------------------------------------------------------------------------------

export function readHwpHeader(file) {
  const header = file.read("FileHeader");
  if (!header || header.length < 40) throw new Error("document.invalidHwp");
  const signature = new TextDecoder("latin1").decode(header.subarray(0, 17));
  if (signature !== "HWP Document File") throw new Error("document.invalidHwp");
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const flags = view.getUint32(36, true);
  return { compressed: Boolean(flags & 1), encrypted: Boolean(flags & 2), distribution: Boolean(flags & 4) };
}

export async function convertHwpBinary(bytes, inflateRaw) {
  const file = readCompoundFile(bytes);
  const header = readHwpHeader(file);
  if (header.encrypted) throw new Error("document.hwpEncrypted");
  if (header.distribution) throw new Error("document.hwpDistribution");
  const sections = file.paths
    .filter((path) => /^BodyText\/Section\d+$/.test(path))
    .sort((a, b) => Number(a.slice(16)) - Number(b.slice(16)));
  if (!sections.length) throw new Error("document.invalidHwp");
  const read = async (path) => {
    const raw = file.read(path);
    return header.compressed ? inflateRaw(raw) : raw;
  };
  // A document whose styles cannot be read is still shown, without them.
  let styles = null;
  if (file.has("DocInfo")) {
    try {
      styles = readDocInfo(await read("DocInfo"));
    } catch {
      styles = null;
    }
  }
  const parts = styles ? [`<style>${styles.css}</style>`] : [];
  for (const path of sections) {
    const records = await read(path);
    docStyles = styles;
    try {
      parts.push(renderSection(records));
    } finally {
      docStyles = null;
    }
  }
  return parts.join("");
}
