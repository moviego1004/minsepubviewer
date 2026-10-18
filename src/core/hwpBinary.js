// Text-and-table reader for binary HWP 5.0 files (an OLE compound file of zlib-compressed record
// streams). Used where the desktop converter is not available (the phone app). Paragraph text,
// tables and text boxes are kept; page layout, fonts, images and drawings are not rendered.
// inflateRaw(bytes) -> Promise<Uint8Array> is passed in so the browser and tests can each supply one.

const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const TAG_PARA_HEADER = 66;
const TAG_PARA_TEXT = 67;
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

// --- HTML -------------------------------------------------------------------------------------

function paragraphText(record, controls, renderControl) {
  if (!record) return "";
  const data = record.data;
  let html = "";
  let pending = "";
  const flush = () => { if (pending) { html += escapeHtml(pending); pending = ""; } };
  for (let index = 0; index + 1 < data.length; index += 2) {
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
  flush();
  return html;
}

function renderParagraphs(nodes) {
  return nodes.filter((node) => node.tag === TAG_PARA_HEADER).map(renderParagraph).join("");
}

// Blocks such as tables cannot sit inside <p>, so the paragraph is closed around them.
function renderParagraph(paragraph) {
  const text = paragraph.children.find((child) => child.tag === TAG_PARA_TEXT);
  const controls = paragraph.children.filter((child) => child.tag === TAG_CTRL_HEADER);
  const content = paragraphText(text, controls, renderControl);
  return `<p>${content || "<br>"}</p>`.replace(/<p><\/p>/g, "");
}

// Footnotes and endnotes of the section being rendered; listed after its text.
let sectionNotes = [];

function renderControl(control) {
  if (!control) return "";
  const id = controlId(control);
  if (id === "tbl ") return `</p>${renderTable(control)}<p>`;
  if (id === "fn  " || id === "en  ") {
    sectionNotes.push(renderNestedLists(control));
    return `<sup class="hwp-note-ref">${sectionNotes.length})</sup>`;
  }
  // Text boxes and other drawing objects: keep the text they hold.
  if (id === "gso ") {
    const html = renderNestedLists(control);
    return html ? `</p><div class="hwp-box">${html}</div><p>` : "";
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
  for (const child of control.children) {
    if (child.tag === TAG_LIST_HEADER) {
      const view = new DataView(child.data.buffer, child.data.byteOffset, child.data.byteLength);
      const read = (offset) => (offset + 2 <= child.data.length ? view.getUint16(offset, true) : 0);
      current = { col: read(8), row: read(10), colSpan: read(12) || 1, rowSpan: read(14) || 1, paragraphs: [] };
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
  const body = [...rows.keys()].sort((a, b) => a - b).map((row) => {
    const html = rows.get(row).sort((a, b) => a.col - b.col).map((cell) => {
      const span = `${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ""}`;
      return `<td${span}>${renderParagraphs(cell.paragraphs)}</td>`;
    }).join("");
    return `<tr>${html}</tr>`;
  }).join("");
  return `<table class="hwp-table"><tbody>${body}</tbody></table>`;
}

export function renderSection(bytes) {
  sectionNotes = [];
  try {
    const body = renderParagraphs(buildTree(readRecords(bytes)));
    const notes = sectionNotes.length
      ? `<ol class="hwp-notes">${sectionNotes.map((note) => `<li>${note}</li>`).join("")}</ol>`
      : "";
    return `<section>${body}${notes}</section>`;
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
  const parts = [];
  for (const path of sections) {
    const raw = file.read(path);
    parts.push(renderSection(header.compressed ? await inflateRaw(raw) : raw));
  }
  return parts.join("");
}
