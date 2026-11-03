// Text-and-table reader for binary HWP 5.0 files (an OLE compound file of zlib-compressed record
// streams). Used where the desktop converter is not available (the phone app). Paragraph text,
// tables, text boxes and pictures (PNG, JPEG, GIF, BMP, WebP) are kept with the fonts, sizes,
// colours, alignment, indents, paragraph numbers and bullets, paragraph and cell borders and
// backgrounds of DocInfo; headers and footers are shown once at the start and end of their
// section. Page layout and drawings are not rendered.
// inflateRaw(bytes) -> Promise<Uint8Array> is passed in so the browser and tests can each supply one.
import { fontCss } from "./hwpFonts.js";
import { symbolFontTable, symbolHtml } from "./hwpSymbols.js";

const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const TAG_BIN_DATA = 18;
const TAG_FACE_NAME = 19;
const TAG_BORDER_FILL = 20;
const TAG_CHAR_SHAPE = 21;
const TAG_NUMBERING = 23;
const TAG_BULLET = 24;
const TAG_PARA_SHAPE = 25;
const TAG_PARA_HEADER = 66;
const TAG_PARA_TEXT = 67;
const TAG_PARA_CHAR_SHAPE = 68;
const TAG_CTRL_HEADER = 71;
const TAG_LIST_HEADER = 72;
const TAG_TABLE = 77;
const TAG_SHAPE_PICTURE = 85;

// Characters that occupy 8 code units (the control character, 6 units of data, the character again).
const WIDE_CONTROLS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
// Wide controls that have their own CTRL_HEADER record, in the order they appear in the text.
const OBJECT_CONTROLS = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

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
  const font = fontCss([faces[0]?.[view.getUint16(0, true)], faces[1]?.[view.getUint16(2, true)]]);
  const css = [`font-family:${font.family}`];
  const script = props & (1 << 15) ? "super" : props & (1 << 16) ? "sub" : "";
  if (sizePt > 0) css.push(`font-size:${rem(script ? sizePt * 0.7 : sizePt)}`);
  if (script) css.push(`vertical-align:${script}`);
  if (props & 1) css.push("font-style:italic");
  if (props & 2 || font.heavy) css.push("font-weight:bold");
  const lines = [];
  const underline = (props >>> 2) & 3;
  if (underline === 1) lines.push("underline");
  if (underline === 3) lines.push("overline");
  if ((props >>> 18) & 7) lines.push("line-through");
  if (lines.length) css.push(`text-decoration:${lines.join(" ")}`);
  // Spacing (자간) is a percentage of the character width. The width ratio (장평) has no CSS
  // counterpart for ordinary fonts; it is approximated by the same amount of spacing, so narrowed
  // text takes about the room it takes in Hangul.
  const spacing = view.getInt8(21) + ((data[14] || 100) - 100);
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
  const borderFill = borderFills[view.getUint16(32, true) - 1];
  if (borderFill?.fill && borderFill.fill !== "#ffffff") css.push(`background-color:${borderFill.fill}`);
  // A border around the paragraph, inside its margins, with its own padding (HWPUNIT16).
  if (/solid|dashed|dotted|double|inset|outset|groove|ridge/.test(borderFill?.borders || "")) {
    css.push(borderFill.borders);
    if (data.length >= 42) {
      const [left, right, top, bottom] = [34, 36, 38, 40].map((offset) => rem(Math.max(0, view.getInt16(offset, true)) / 100));
      css.push(`border-padding:${top} ${right} ${bottom} ${left}`);
    }
  }
  return css.join(";");
}

// Paragraphs whose shape joins the borders of the next paragraph with the same shape (bit 28)
// are drawn as one box.
function paraShapeJoins(data) {
  return data.length >= 4 && Boolean(dataView(data).getUint32(0, true) & 0x10000000);
}

// The heading of a paragraph shape: 1 outline, 2 numbered, 3 bullet (bits 23-24), its level
// (bits 25-27) and the numbering or bullet id it uses (1-based).
function paraHeading(data) {
  if (data.length < 32) return null;
  const view = dataView(data);
  const props = view.getUint32(0, true);
  const type = (props >>> 23) & 3;
  return type ? { type, level: (props >>> 25) & 7, id: view.getUint16(30, true) } : null;
}

function readUtf16(view, offset, length) {
  let text = "";
  for (let index = 0; index < length && offset + index * 2 + 2 <= view.byteLength; index += 1) text += String.fromCharCode(view.getUint16(offset + index * 2, true));
  return text;
}

// NUMBERING: for each of 7 levels a 12-byte head (attributes with the number style in bits 5-8,
// widths, character shape) and a format such as "^1." or "(^2)", then the start number of the
// first level and, from HWP 5.0.2.5, a start number for each level.
function readNumbering(data) {
  const view = dataView(data);
  const levels = [];
  let offset = 0;
  for (let level = 0; level < 7 && offset + 14 <= data.length; level += 1) {
    const style = (view.getUint32(offset, true) >>> 5) & 0xf;
    const length = view.getUint16(offset + 12, true);
    levels.push({ style, format: readUtf16(view, offset + 14, length) });
    offset += 14 + length * 2;
  }
  const start = (offset + 2 <= data.length ? view.getUint16(offset, true) : 1) || 1;
  const starts = levels.map((level, index) => {
    const at = offset + 2 + index * 4;
    return at + 4 <= data.length ? view.getUint32(at, true) || 1 : index ? 1 : start;
  });
  return { levels, starts };
}

// BULLET: attributes, widths and character shape (12 bytes), then the bullet character.
function readBullet(data) {
  return data.length >= 14 ? String.fromCharCode(dataView(data).getUint16(12, true)) : "\u2022";
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const HANGUL_SYLLABLES = "가나다라마바사아자차카타파하";
const HANGUL_JAMO = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";
const CIRCLED_HANGUL = "㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻";
const CIRCLED_JAMO = "㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭";
const HANJA_DIGITS = "一二三四五六七八九十";

function roman(number) {
  let rest = number;
  let text = "";
  for (const [value, letters] of [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) {
    while (rest >= value) { text += letters; rest -= value; }
  }
  return text;
}

function cycle(list, number) {
  return list[(number - 1) % list.length];
}

// Number styles of the HWP 5.0 numbering format (표 41); unknown styles are Arabic digits.
export function formatNumber(number, style) {
  if (number < 1) return String(number);
  switch (style) {
    case 1: return number <= CIRCLED.length ? CIRCLED[number - 1] : String(number);
    case 2: return roman(number);
    case 3: return roman(number).toLowerCase();
    case 4: return String.fromCharCode(65 + ((number - 1) % 26));
    case 5: return String.fromCharCode(97 + ((number - 1) % 26));
    case 8: case 9: return cycle(HANGUL_SYLLABLES, number);
    case 10: return cycle(CIRCLED_HANGUL, number);
    case 11: return cycle(HANGUL_JAMO, number);
    case 12: return cycle(CIRCLED_JAMO, number);
    case 13: case 14: return number <= 10 ? HANJA_DIGITS[number - 1] : String(number);
    default: return String(number);
  }
}

export function readDocInfo(bytes) {
  const records = readRecords(bytes);
  const faceRecords = records.filter((record) => record.tag === TAG_FACE_NAME).map((record) => readFaceName(record.data));
  // ID_MAPPINGS (tag 17) holds the number of faces for each of the 7 languages (Hangul, Latin,
  // Hanja, Japanese, other, symbol, user) after the BinData count.
  const mappings = records.find((record) => record.tag === 17);
  const faces = [];
  if (mappings && mappings.data.length >= 8) {
    const view = dataView(mappings.data);
    let offset = 0;
    for (let language = 0; language < 7 && 8 + language * 4 <= mappings.data.length; language += 1) {
      const count = Math.max(0, view.getInt32(4 + language * 4, true));
      faces.push(faceRecords.slice(offset, offset + count));
      offset += count;
    }
  } else {
    faces.push(...Array(7).fill(faceRecords));
  }
  const borderFills = records.filter((record) => record.tag === TAG_BORDER_FILL).map((record) => readBorderFill(record.data));
  const charShapeRecords = records.filter((record) => record.tag === TAG_CHAR_SHAPE);
  const charShapes = charShapeRecords.map((record) => charShapeCss(record.data, faces));
  // Symbol-font characters follow the fonts of their character shape (see hwpSymbols.js).
  const symbolTables = charShapeRecords.map(({ data }) => symbolFontTable(faces.map((list, language) => (
    2 * language + 2 <= data.length ? list[dataView(data).getUint16(2 * language, true)] : ""))));
  const paraShapeRecords = records.filter((record) => record.tag === TAG_PARA_SHAPE);
  const paraShapes = paraShapeRecords.map((record) => paraShapeCss(record.data, borderFills));
  const headings = paraShapeRecords.map((record) => paraHeading(record.data));
  const numberings = records.filter((record) => record.tag === TAG_NUMBERING).map((record) => readNumbering(record.data));
  const bullets = records.filter((record) => record.tag === TAG_BULLET).map((record) => readBullet(record.data));
  // border-padding is not CSS: it becomes padding, and joined paragraphs lose the border between them.
  const paraRules = paraShapes.flatMap((css, id) => {
    if (!css) return [];
    const padding = /;border-padding:([^;]+)/.exec(css);
    const rules = [`.hwp-styled .hp${id}{${css.replace(/;border-padding:[^;]+/, "")}${padding ? `;padding-top:${padding[1].split(" ")[0]};padding-bottom:${padding[1].split(" ")[2]}` : ""}}`];
    if (padding && paraShapeJoins(paraShapeRecords[id].data)) {
      rules.push(`.hwp-styled .hp${id}+.hp${id}{border-top:none;margin-top:0;padding-top:0}`,
        `.hwp-styled .hp${id}:has(+.hp${id}){border-bottom:none;margin-bottom:0;padding-bottom:0}`);
    }
    return rules;
  });
  const rules = [
    // rem in this document: 10pt of the original. 14px keeps common 10-15pt body text readable on
    // a phone without spilling; the reader's zoom scales it further.
    "html{font-size:14px}",
    ...charShapes.map((css, id) => (css ? `.hwp-styled .hc${id}{${css}}` : "")),
    ...paraRules,
    ".hwp-styled .hwp-marker{text-indent:0}",
    ...borderFills.map(({ borders, fill }, index) => `.hwp-styled .hb${index + 1}{${borders}${fill ? `;background-color:${fill}` : ""}}`)
  ];
  return {
    css: rules.filter(Boolean).join("\n"),
    // An empty paragraph keeps the height of its character shape.
    charSize: (id) => /font-size:([^;]+)/.exec(charShapes[id] || "")?.[1] || "",
    hasCharShape: (id) => id >= 0 && id < charShapes.length,
    symbolTable: (id) => symbolTables[id] || symbolFontTable(),
    hasParaShape: (id) => id >= 0 && id < paraShapes.length,
    heading: (id) => headings[id] || null,
    numbering: (id) => numberings[id - 1] || null,
    bullet: (id) => bullets[id - 1] ?? null,
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
    const text = symbolHtml(pending, docStyles?.symbolTable(shape));
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

// Counters of numbered and outline paragraphs (numbering id -> 7 levels), for the whole document
// as in Hangul; a level counts on and the levels below it start again.
let numberCounters = new Map();
// The numbering of outline paragraphs in the section being rendered (its section definition).
let sectionOutline = 0;

function paragraphMarker(paragraph, runs) {
  const shape = paragraph.data.length >= 10 ? dataView(paragraph.data).getUint16(8, true) : -1;
  const heading = docStyles?.heading(shape);
  if (!heading) return "";
  if (heading.type === 3) {
    const bullet = docStyles.bullet(heading.id);
    return bullet ? `${symbolHtml(bullet, docStyles.symbolTable(runs[0]?.id ?? -1))} ` : "";
  }
  const id = heading.type === 1 ? sectionOutline : heading.id;
  const numbering = docStyles.numbering(id);
  if (!numbering) return "";
  const counters = numberCounters.get(id) || Array(7).fill(0);
  numberCounters.set(id, counters);
  counters[heading.level] = counters[heading.level] ? counters[heading.level] + 1 : numbering.starts[heading.level] ?? 1;
  counters.fill(0, heading.level + 1);
  const format = numbering.levels[heading.level]?.format;
  if (!format) return "";
  const text = format.replace(/\^(\d)/g, (match, level) => {
    const index = Number(level) - 1;
    return formatNumber(counters[index] || numbering.starts[index] || 1, numbering.levels[index]?.style ?? 0);
  });
  return text.trim() ? `${escapeHtml(text)} ` : "";
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Whether paragraph text holds characters besides controls and the paragraph end.
function hasText(record) {
  if (!record) return false;
  for (let index = 0; index + 1 < record.data.length; index += 2) {
    const code = record.data[index] | (record.data[index + 1] << 8);
    if (code >= 32) return true;
    if (WIDE_CONTROLS.has(code)) index += 14;
  }
  return false;
}

function renderParagraph(paragraph) {
  const text = paragraph.children.find((child) => child.tag === TAG_PARA_TEXT);
  const controls = paragraph.children.filter((child) => child.tag === TAG_CTRL_HEADER);
  const runs = readCharRuns(paragraph.children.find((child) => child.tag === TAG_PARA_CHAR_SHAPE));
  const open = paragraphTag(paragraph, runs);
  const controlCount = controls.length;
  const marker = paragraphMarker(paragraph, runs);
  const markerHtml = marker ? `<span class="hwp-marker${docStyles?.hasCharShape(runs[0]?.id ?? -1) ? ` hc${runs[0].id}` : ""}">${marker}</span>` : "";
  const content = paragraphText(text, controls, renderControl, runs).split(CONTINUE_PARAGRAPH).join(open);
  // A paragraph that only held controls shown elsewhere (header, section settings) leaves no blank line.
  if (!content && !markerHtml && controlCount && !hasText(text)) return "";
  return `${open}${markerHtml}${content || "<br>"}</p>`.replace(/<p(?: [^>]*)?><\/p>/g, "");
}

// Footnotes and endnotes of the section being rendered; listed after its text.
let sectionNotes = [];
// Headers and footers of the section being rendered, shown before and after its text.
let sectionHeaders = [];
let sectionFooters = [];
// Picture data URLs of the document being rendered, by BinItem id (see readPictures).
let docPictures = new Map();

function findRecord(node, tag) {
  for (const child of node.children) {
    if (child.tag === tag) return child;
    const found = findRecord(child, tag);
    if (found) return found;
  }
  return null;
}

// The BinItem id a picture object (SHAPE_COMPONENT_PICTURE) shows: after the border (12 bytes),
// its corner points (32), crop (16), padding (8), brightness, contrast and effect (3).
function pictureId(record) {
  return record && record.data.length >= 73 ? dataView(record.data).getUint16(71, true) : 0;
}

// A drawing object holding a picture: inline when it is placed like a character (bit 0 of the
// object attributes), otherwise between paragraphs. Its width (HWPUNIT, 1/100 pt) is kept.
function renderPicture(control) {
  const src = docPictures.get(pictureId(findRecord(control, TAG_SHAPE_PICTURE)));
  if (!src) return "";
  const view = control.data.length >= 24 ? dataView(control.data) : null;
  const width = view ? view.getUint32(16, true) : 0;
  const image = `<img class="hwp-pic" src="${src}" alt=""${width > 0 && width < 0x7fffffff ? ` style="width:${rem(width / 100)}"` : ""}>`;
  return view && view.getUint32(4, true) & 1 ? image : `</p><div class="hwp-figure">${image}</div>${CONTINUE_PARAGRAPH}`;
}

function renderControl(control) {
  if (!control) return "";
  const id = controlId(control);
  if (id === "tbl ") return `</p>${renderTable(control)}${CONTINUE_PARAGRAPH}`;
  // Headers and footers repeat on every page in Hangul; the reflowed view shows each once.
  if (id === "head" || id === "foot") {
    const html = renderNestedLists(control);
    if (html.replace(/<[^>]+>/g, "").trim()) (id === "head" ? sectionHeaders : sectionFooters).push(html);
    return "";
  }
  if (id === "secd" && control.data.length >= 20) {
    sectionOutline = dataView(control.data).getUint16(18, true);
    return "";
  }
  if (id === "fn  " || id === "en  ") {
    sectionNotes.push(renderNestedLists(control));
    return `<sup class="hwp-note-ref">${sectionNotes.length})</sup>`;
  }
  // Pictures; text boxes and other drawing objects keep the text they hold.
  if (id === "gso ") {
    const picture = renderPicture(control);
    if (picture) return picture;
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
  sectionHeaders = [];
  sectionFooters = [];
  sectionOutline = 0;
  try {
    const body = renderParagraphs(buildTree(readRecords(bytes)));
    const notes = sectionNotes.length
      ? `<ol class="hwp-notes">${sectionNotes.map((note) => `<li>${note}</li>`).join("")}</ol>`
      : "";
    const header = sectionHeaders.length ? `<header class="hwp-page-header">${sectionHeaders.join("")}</header>` : "";
    const footer = sectionFooters.length ? `<footer class="hwp-page-footer">${sectionFooters.join("")}</footer>` : "";
    return `<section${docStyles ? ' class="hwp-styled"' : ""}>${header}${body}${notes}${footer}</section>`;
  } finally {
    sectionNotes = [];
    sectionHeaders = [];
    sectionFooters = [];
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

// BIN_DATA records of DocInfo, in BinItem id order (1-based): the number of the BinData stream
// (BinData/BIN000A.png) of each embedded item; linked files outside the document are null.
export function readBinItems(docInfo) {
  return readRecords(docInfo).filter((record) => record.tag === TAG_BIN_DATA).map(({ data }) => {
    if (data.length < 4) return null;
    const type = dataView(data).getUint16(0, true) & 0xf;
    return type === 1 || type === 2 ? dataView(data).getUint16(2, true) : null;
  });
}

const IMAGE_TYPES = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/bmp", [0x42, 0x4d]]
];

// The browser draws these; WMF/EMF and other formats are skipped.
export function imageType(bytes) {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return IMAGE_TYPES.find(([, magic]) => magic.every((value, index) => bytes[index] === value))?.[0] || null;
}

function base64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

// Data URLs of the pictures the sections show. A BinData stream is deflated unless its item says
// otherwise; as in hwpjs, a stream that does not inflate is taken as it is. recodeImage(bytes, type)
// may return smaller bytes in another format (uncompressed BMP screenshots run to tens of MB).
async function readPictures(file, sectionRecords, binItems, inflateRaw, recodeImage) {
  const ids = new Set();
  for (const records of sectionRecords) {
    for (const record of records) if (record.tag === TAG_SHAPE_PICTURE) ids.add(pictureId(record));
  }
  const pictures = new Map();
  for (const id of ids) {
    if (!id) continue;
    const stream = binItems ? binItems[id - 1] : id;
    if (!stream) continue;
    const name = `BIN${stream.toString(16).toUpperCase().padStart(4, "0")}`;
    const path = file.paths.find((entry) => new RegExp(`^BinData/${name}(\\.|$)`, "i").test(entry));
    const raw = path && file.read(path);
    if (!raw?.length) continue;
    let data = raw;
    if (!imageType(raw)) {
      try {
        data = await inflateRaw(raw);
      } catch {
        data = raw;
      }
    }
    let type = imageType(data);
    if (type === "image/bmp" && recodeImage) {
      try {
        const recoded = await recodeImage(data, type);
        if (recoded && imageType(recoded)) {
          data = recoded;
          type = imageType(recoded);
        }
      } catch {
        // The BMP is kept.
      }
    }
    if (type) pictures.set(id, `data:${type};base64,${base64(data)}`);
  }
  return pictures;
}

export async function convertHwpBinary(bytes, inflateRaw, { recodeImage = null } = {}) {
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
  let binItems = null;
  if (file.has("DocInfo")) {
    try {
      const docInfo = await read("DocInfo");
      binItems = readBinItems(docInfo);
      styles = readDocInfo(docInfo);
    } catch {
      styles = null;
    }
  }
  const sectionBytes = [];
  for (const path of sections) sectionBytes.push(await read(path));
  let pictures = new Map();
  try {
    pictures = await readPictures(file, sectionBytes.map((records) => readRecords(records)), binItems, inflateRaw, recodeImage);
  } catch {
    // The text is shown without pictures.
  }
  const parts = styles ? [`<style>${styles.css}</style>`] : [];
  numberCounters = new Map();
  for (const records of sectionBytes) {
    docStyles = styles;
    docPictures = pictures;
    try {
      parts.push(renderSection(records));
    } finally {
      docStyles = null;
      docPictures = new Map();
    }
  }
  return parts.join("");
}
