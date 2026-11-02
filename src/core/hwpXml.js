// Text-and-table conversion for the XML forms of Hangul documents:
// HWPML (a single XML file, often saved with a .hwp extension) and HWPX/OWPML
// (a zip of section XML files). Page layout, images and drawing objects are not rendered.
// HWPX also gets the fonts, character, paragraph and cell styles of Contents/header.xml.
// Functions take a parsed XML Document so the browser's DOMParser and test parsers both work.
import { fontCss } from "./hwpFonts.js";
import { symbolFontTable, symbolHtml } from "./hwpSymbols.js";

const BLOCK_TABLE_ATTRIBUTES = ' class="hwp-table"';

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
  const value = node?.getAttribute?.(name);
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
      if (name === "CHAR") html += symbolHtml(part.textContent || "");
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

// --- HWPX styles (Contents/header.xml) -------------------------------------------
// Character shapes, paragraph shapes and border fills become classes (.hcN, .hpN, .hbN) as in the
// binary HWP reader (hwpBinary.js), so both forms of a document look alike. Sizes are relative:
// 1rem is 10pt of the original.

const ALIGNMENTS = { LEFT: "left", RIGHT: "right", CENTER: "center" };
const LINE_STYLES = {
  SOLID: "solid", WAVE: "solid", DASH: "dashed", LONG_DASH: "dashed", DASH_DOT: "dashed", DASH_DOT_DOT: "dashed",
  DOT: "dotted", CIRCLE: "dotted", DOUBLE_SLIM: "double", SLIM_THICK: "double", THICK_SLIM: "double",
  SLIM_THICK_SLIM: "double", DOUBLE_WAVE: "double", "3D": "inset", "3D_REVERS": "outset",
  THICK_3D: "inset", THICK_3D_REVERS: "outset"
};

const rem = (pt) => `${Number((pt / 10).toFixed(3))}rem`;

function child(node, name) {
  return node ? elementChildren(node).find((item) => localName(item) === name) || null : null;
}

function children(node, name) {
  return node ? elementChildren(node).filter((item) => localName(item) === name) : [];
}

function descendants(node, name, found = []) {
  for (const item of elementChildren(node)) {
    if (localName(item) === name) found.push(item);
    descendants(item, name, found);
  }
  return found;
}

function number(node, name) {
  return Number(attribute(node, name)) || 0;
}

// Colours are #RRGGBB (#AARRGGBB in some brushes); "none" is no colour.
function cssColor(value) {
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value || "")?.[1];
  return hex ? `#${hex.slice(-6).toLowerCase()}` : "";
}

// Font names per language; character shapes refer to them by id.
function readFaces(head) {
  const faces = {};
  for (const fontface of descendants(head, "fontface")) {
    const fonts = children(fontface, "font").map((font) => [attribute(font, "id"), attribute(font, "face") || ""]);
    faces[String(attribute(fontface, "lang")).toLowerCase()] = new Map(fonts);
  }
  return faces;
}

function charPrCss(charPr, faces) {
  const fontRef = child(charPr, "fontRef");
  const font = fontCss([faces.hangul?.get(attribute(fontRef, "hangul")), faces.latin?.get(attribute(fontRef, "latin"))]);
  const script = child(charPr, "supscript") ? "super" : child(charPr, "subscript") ? "sub" : "";
  const sizePt = (number(charPr, "height") / 100) * ((number(child(charPr, "relSz"), "hangul") || 100) / 100);
  const css = [`font-family:${font.family}`];
  if (sizePt > 0) css.push(`font-size:${rem(script ? sizePt * 0.7 : sizePt)}`);
  if (script) css.push(`vertical-align:${script}`);
  if (child(charPr, "italic")) css.push("font-style:italic");
  if (child(charPr, "bold") || font.heavy) css.push("font-weight:bold");
  const lines = [];
  const underline = attribute(child(charPr, "underline"), "type");
  if (underline === "BOTTOM") lines.push("underline");
  if (underline === "TOP") lines.push("overline");
  // Hangul writes shape="3D" on character shapes that have no strikeout.
  const strikeout = attribute(child(charPr, "strikeout"), "shape");
  if (strikeout && strikeout !== "NONE" && strikeout !== "3D") lines.push("line-through");
  if (lines.length) css.push(`text-decoration:${lines.join(" ")}`);
  const spacing = number(child(charPr, "spacing"), "hangul");
  if (spacing) css.push(`letter-spacing:${Number((spacing / 200).toFixed(3))}em`);
  // Black is left to the reader's theme colour.
  const color = cssColor(attribute(charPr, "textColor"));
  if (color && color !== "#000000") css.push(`color:${color}`);
  const shade = cssColor(attribute(charPr, "shadeColor"));
  if (shade) css.push(`background-color:${shade}`);
  return css.join(";");
}

function readBorderFill(borderFill) {
  const borders = ["left", "right", "top", "bottom"].map((side) => {
    const line = child(borderFill, `${side}Border`);
    const style = LINE_STYLES[attribute(line, "type")];
    if (!style) return `border-${side}:none`;
    const mm = Number(/^([\d.]+)\s*mm$/.exec(attribute(line, "width") || "")?.[1]) || 0.1;
    const px = Math.max(style === "double" ? 3 : 1, Math.round((mm * 96) / 25.4));
    return `border-${side}:${px}px ${style} ${cssColor(attribute(line, "color")) || "#000000"}`;
  }).join(";");
  return { borders, fill: cssColor(attribute(descendants(borderFill, "winBrush")[0], "faceColor")) };
}

// Hangul 2016 and later wrap margins in <hp:switch>: the case holds the values and the default
// holds them doubled, as older files and binary HWP store them.
function paraSpacing(paraPr) {
  const block = [...descendants(paraPr, "default"), paraPr, ...descendants(paraPr, "case")].find((node) => child(node, "margin"));
  if (!block) return { value: () => 0, lineSpacing: null };
  const margin = child(block, "margin");
  const scale = localName(block) === "case" ? 100 : 200;
  // Margins in characters (unit="CHAR") have no fixed size here and are left out.
  const value = (name) => {
    const node = child(margin, name);
    return attribute(node, "unit") === "CHAR" ? 0 : number(node, "value") / scale;
  };
  return { value, lineSpacing: child(block, "lineSpacing") };
}

// A negative indent hangs the first line.
function paraPrCss(paraPr, borderFills) {
  const { value, lineSpacing } = paraSpacing(paraPr);
  const left = value("left");
  const right = value("right");
  const indent = value("intent");
  const css = [
    "white-space:pre-wrap",
    `text-align:${ALIGNMENTS[attribute(child(paraPr, "align"), "horizontal")] || "justify"}`,
    `margin:${rem(value("prev"))} 0 ${rem(value("next"))}`,
    `padding:0 ${rem(Math.max(0, right))} 0 ${rem(Math.max(0, left + Math.max(0, -indent)))}`,
    `text-indent:${rem(indent)}`
  ];
  const percent = number(lineSpacing, "value");
  if (attribute(lineSpacing, "type") === "PERCENT" && percent > 0) css.push(`line-height:${Number((percent / 100).toFixed(2))}`);
  // Paragraph borders depend on settings this reader does not follow; only a coloured background is kept.
  const fill = borderFills.get(attribute(child(paraPr, "border"), "borderFillIDRef"))?.fill;
  if (fill && fill !== "#ffffff") css.push(`background-color:${fill}`);
  return css.join(";");
}

// Shapes keyed by their numeric id; other ids could not be used as class names safely.
function shapeMap(head, name, read) {
  return new Map(descendants(head, name).filter((node) => /^\d+$/.test(attribute(node, "id") || "")).map((node) => [attribute(node, "id"), read(node)]));
}

export function readOwpmlHeader(document) {
  const root = document.documentElement;
  if (!root || localName(root) !== "head") throw new Error("document.invalidHwpx");
  const faces = readFaces(root);
  const borderFills = shapeMap(root, "borderFill", readBorderFill);
  const charShapes = shapeMap(root, "charPr", (node) => charPrCss(node, faces));
  // Symbol-font characters follow the fonts of their character shape (see hwpSymbols.js).
  const symbolTables = shapeMap(root, "charPr", (node) => {
    const fontRef = child(node, "fontRef");
    return symbolFontTable(Object.keys(faces).map((language) => faces[language].get(attribute(fontRef, language))));
  });
  const paraShapes = shapeMap(root, "paraPr", (node) => paraPrCss(node, borderFills));
  const rules = [
    // Same base size as binary HWP (see hwpBinary.js readDocInfo).
    "html{font-size:14px}",
    ...[...charShapes].map(([id, css]) => `.hwp-styled .hc${id}{${css}}`),
    ...[...paraShapes].map(([id, css]) => `.hwp-styled .hp${id}{${css}}`),
    ...[...borderFills].map(([id, { borders, fill }]) => `.hwp-styled .hb${id}{${borders}${fill ? `;background-color:${fill}` : ""}}`)
  ];
  return {
    css: rules.join("\n"),
    // An empty paragraph keeps the height of its character shape.
    charSize: (id) => /font-size:([^;]+)/.exec(charShapes.get(id) || "")?.[1] || "",
    hasCharShape: (id) => charShapes.has(id),
    symbolTable: (id) => symbolTables.get(id) || symbolFontTable(),
    hasParaShape: (id) => paraShapes.has(id),
    hasBorderFill: (id) => borderFills.has(id)
  };
}

// --- HWPX / OWPML (<hs:sec><hp:p><hp:run><hp:t>) ----------------------------------
// styles is the result of readOwpmlHeader, or null to convert text and tables only.

// Tables and text boxes cannot sit inside <p>, so the paragraph is closed around them and
// reopened with the same tag (open).
function owpmlRunContent(run, styles, open) {
  const id = attribute(run, "charPrIDRef");
  const wrap = (text) => (text && styles?.hasCharShape(id) ? `<span class="hc${id}">${text}</span>` : text);
  let html = "";
  for (const part of elementChildren(run)) {
    const name = localName(part);
    if (name === "t") {
      let text = "";
      for (let node = part.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === 3 || node.nodeType === 4) text += symbolHtml(node.nodeValue || "", styles?.symbolTable(id));
        else if (node.nodeType !== 1) continue;
        else if (localName(node) === "lineBreak") { html += `${wrap(text)}<br>`; text = ""; }
        else if (localName(node) === "tab") text += "\t";
        else if (localName(node) === "nbSpace" || localName(node) === "fwSpace") text += " ";
      }
      html += wrap(text);
    } else if (name === "tbl") {
      html += `</p>${owpmlTable(part, styles)}${open}`;
    } else {
      // Drawing objects (rect, ellipse, ...) keep a text box's text in <hp:drawText>.
      const content = children(child(part, "drawText"), "subList").map((list) => owpmlBlocks(list, styles)).join("");
      if (content) html += `</p><div class="hwp-box">${content}</div>${open}`;
    }
  }
  return html;
}

function owpmlParagraphTag(paragraph, runs, styles) {
  if (!styles) return "<p>";
  const shape = attribute(paragraph, "paraPrIDRef");
  const size = runs.length ? styles.charSize(attribute(runs[0], "charPrIDRef")) : "";
  const className = styles.hasParaShape(shape) ? ` class="hp${shape}"` : "";
  return `<p${className}${size ? ` style="font-size:${size}"` : ""}>`;
}

function owpmlParagraph(paragraph, styles) {
  const runs = children(paragraph, "run");
  const open = owpmlParagraphTag(paragraph, runs, styles);
  // Trailing spaces would hang past right-aligned and centred lines (white-space: pre-wrap).
  const content = runs.map((run) => owpmlRunContent(run, styles, open)).join("").replace(/[ \t]+(<\/span>)?$/, "$1");
  return `${open}${content || "<br>"}</p>`.replace(/<p(?: [^>]*)?><\/p>/g, "");
}

function owpmlBlocks(container, styles) {
  return children(container, "p").map((paragraph) => owpmlParagraph(paragraph, styles)).join("");
}

// Cell widths (1/100 pt) become shares of the widest row so the table fits the screen.
function owpmlTable(table, styles) {
  const rows = children(table, "tr").map((row) => children(row, "tc").map((cell) => ({ cell, width: number(child(cell, "cellSz"), "width") })));
  const tableWidth = Math.max(0, ...rows.map((row) => row.reduce((sum, { width }) => sum + width, 0)));
  const inMargin = child(table, "inMargin");
  const body = rows.map((row) => {
    const cells = row.map(({ cell, width }) => {
      const span = child(cell, "cellSpan");
      const content = children(cell, "subList").map((list) => owpmlBlocks(list, styles)).join("");
      const attributes = styles ? owpmlCellAttributes(cell, width, tableWidth, inMargin, styles) : "";
      return `<td${span ? spanAttributes(span, { col: "colSpan", row: "rowSpan" }) : ""}${attributes}>${content}</td>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  });
  const width = styles && tableWidth ? ` style="width:min(100%, ${rem(tableWidth / 100)})"` : "";
  return `<table${BLOCK_TABLE_ATTRIBUTES}${width}><tbody>${body.join("")}</tbody></table>`;
}

// A cell without its own margin (hasMargin="0") uses the table's inner margin.
function owpmlCellAttributes(cell, width, tableWidth, inMargin, styles) {
  const margin = (attribute(cell, "hasMargin") === "1" ? null : inMargin) || child(cell, "cellMargin");
  const side = (name) => rem((margin ? number(margin, name) : 141) / 100);
  const valign = { CENTER: "middle", BOTTOM: "bottom" }[attribute(child(cell, "subList"), "vertAlign")] || "top";
  const css = [`padding:${side("top")} ${side("right")} ${side("bottom")} ${side("left")}`, `vertical-align:${valign}`];
  if (tableWidth && width) css.push(`width:${Number(((width / tableWidth) * 100).toFixed(2))}%`);
  const fill = attribute(cell, "borderFillIDRef");
  const className = styles.hasBorderFill(fill) ? ` class="hb${fill}"` : "";
  return `${className} style="${css.join(";")}"`;
}

export function convertOwpmlSection(document, styles = null) {
  const root = document.documentElement;
  if (!root || localName(root) !== "sec") throw new Error("document.invalidHwpx");
  return `<section${styles ? ' class="hwp-styled"' : ""}>${owpmlBlocks(root, styles)}</section>`;
}

// Section files are Contents/section0.xml, section1.xml, ... in reading order.
export function sortOwpmlSectionPaths(paths) {
  return paths
    .filter((path) => /^Contents\/section\d+\.xml$/i.test(path))
    .sort((a, b) => Number(/(\d+)\.xml$/i.exec(a)[1]) - Number(/(\d+)\.xml$/i.exec(b)[1]));
}
