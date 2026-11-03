// Read-only view for documents converted to HTML (DOCX, HWP, HWPX). The HTML is shown
// in a sandboxed iframe without scripts; the reader adds resume, page steps, search and
// highlight marks from the parent page.
import {
  findTextMatches,
  formatDocLocation,
  formatDocRange,
  getScrollPageState,
  parseDocLocation,
  parseDocRange,
  segmentsForRange
} from "../src/core/textAnchors.js";
import { symbolFontRange } from "../src/core/hwpSymbols.js";

const THEMES = Object.freeze({
  light: { bg: "#fffdf8", fg: "#202327", page: "#e9ecef" },
  sepia: { bg: "#f4ecd8", fg: "#3f3428", page: "#e4d8bd" },
  dark: { bg: "#1d1f21", fg: "#e3e3e3", page: "#111315" }
});

const BASE_CSS = `
html { background: var(--doc-page); }
body { margin: 0; color: var(--doc-fg); background: var(--doc-page); }
body.is-flow { max-width: 46em; margin: 0 auto; padding: 32px 28px 64px; background: var(--doc-bg);
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Mins Symbols", system-ui, sans-serif;
  font-size: 17px; line-height: 1.7; word-break: keep-all; overflow-wrap: anywhere; min-height: 100vh; box-sizing: border-box; }
body.is-flow:where(:not(.is-docx)) table { border-collapse: collapse; margin: 1em 0; max-width: 100%; }
body.is-flow:where(:not(.is-docx)) :is(td, th) { border: 1px solid color-mix(in srgb, currentColor 45%, transparent); padding: 4px 8px; vertical-align: top; }
body.is-flow:where(:not(.is-docx)) td p { margin: 0.2em 0; }
body.is-flow img { max-width: 100%; height: auto; }
body.is-flow a { color: inherit; }
body.is-flow .hwp-box { margin: 0.8em 0; padding: 0.4em 0.8em; border: 1px dashed color-mix(in srgb, currentColor 35%, transparent); }
body.is-flow .hwp-note-ref { font-size: 0.7em; }
body.is-flow .hwp-figure { margin: 0.6em 0; }
body.is-flow img.hwp-pic { vertical-align: bottom; }
body.is-flow .hwp-notes { margin-top: 2em; padding-top: 0.6em; border-top: 1px solid color-mix(in srgb, currentColor 30%, transparent); font-size: 0.85em; }
body.is-flow .hwp-notes p { margin: 0.2em 0; }
/* HWP headers and footers, shown once per section in the reflowed view. */
body.is-flow :is(.hwp-page-header, .hwp-page-footer) { font-size: 0.85em; opacity: 0.75; }
body.is-flow .hwp-page-header { margin-bottom: 1.2em; padding-bottom: 0.4em; border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
body.is-flow .hwp-page-footer { margin-top: 1.6em; padding-top: 0.4em; border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
/* Hancom circled and boxed letters that Unicode lacks (src/core/hwpSymbols.js). The black box takes
   the text colour as its fill and paints the letter in the page colour. */
.hwp-sym { display: inline-block; box-sizing: border-box; min-width: 1.2em; margin: 0 0.04em; padding: 0 0.12em; border: 0.08em solid currentColor;
  font-size: 0.85em; line-height: 1.1; text-align: center; text-indent: 0; vertical-align: 0.05em; }
.hwp-sym.is-box { border-radius: 0.12em; }
.hwp-sym.is-circle { min-width: 1.35em; height: 1.35em; padding: 0; border-radius: 50%; line-height: 1.2em; }
.hwp-sym.is-box-black { border-radius: 0.12em; background: currentColor; -webkit-text-fill-color: var(--doc-bg); }
body.has-own-colors .hwp-sym.is-box-black { -webkit-text-fill-color: #fff; }
/* DOCX (docx-preview) draws its own tables. The phone drops the page margins; the desktop shows
   each page as a sheet. */
body.is-flow section.docx { padding: 0 !important; min-height: 0 !important; overflow: visible; }
body.is-layout section.docx { margin: 0 auto 6mm; background: #fff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25); }
/* PDF reflow (src/core/pdfReflow.js): a thin rule with the PDF page number between pages, drawn by
   CSS so it stays out of the text used for search and highlights. */
body.is-flow .pdf-reflow-page + .pdf-reflow-page::before { content: attr(data-page); display: block; margin: 1.4em 0 0.8em;
  border-top: 1px dashed color-mix(in srgb, currentColor 30%, transparent); font-size: 0.7em; text-align: right; opacity: 0.6; }
body.is-flow .pdf-reflow h2 { font-size: 1.4em; line-height: 1.35; }
body.is-flow .pdf-reflow h3 { font-size: 1.15em; line-height: 1.4; }
/* HWP pages (.hpa) paint their white sheet with a negative z-index, so the body stays transparent. */
body.is-layout { padding: 12px 0 48px; background: transparent; }
body.is-layout .hpa { margin: 0 auto 6mm !important; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25) !important; }
body.is-layout.theme-dark { filter: invert(0.9) hue-rotate(180deg); }
/* Documents with their own colours (styled HWP, DOCX) are drawn light and inverted for the dark theme. */
body.is-flow.has-own-colors.theme-dark { background: #fffdf8; color: #202327; filter: invert(0.9) hue-rotate(180deg); }
mark.mins-doc-mark { color: inherit; border-radius: 2px; }
mark.mins-doc-mark.is-yellow { background: rgba(248, 217, 74, 0.55); }
mark.mins-doc-mark.is-orange { background: rgba(255, 159, 28, 0.45); }
mark.mins-doc-mark.is-green { background: rgba(142, 219, 142, 0.55); }
mark.mins-doc-mark.is-pink { background: rgba(244, 163, 190, 0.55); }
mark.mins-doc-mark.is-blue, mark.mins-doc-mark.is-note { background: rgba(142, 197, 244, 0.55); }
mark.mins-doc-mark.is-underline { background: transparent; border-bottom: 2px solid #1c5d99; }
mark.mins-doc-mark.is-search { background: rgba(255, 159, 28, 0.35); }
mark.mins-doc-mark.is-search.is-active { background: rgba(255, 159, 28, 0.75); outline: 2px solid #1c5d99; }
`;

// Free Nanum fonts (OFL, @fontsource) for documents whose own fonts the device does not have
// (see src/core/hwpFonts.js). One Korean subset per weight holds all 11,172 Hangul syllables and
// is only fetched when a run uses it. The Android build copies them to /vendor/fonts.
const BUNDLED_FONTS = [["Nanum Gothic", "nanum-gothic"], ["Nanum Myeongjo", "nanum-myeongjo"]];

// Symbols that Wingdings characters map to (src/core/hwpSymbols.js) are mostly missing from phone
// fonts, so Noto Sans Symbols 2 (OFL) joins each bundled family and "Mins Symbols" for those code
// points only; it is fetched only when a document shows one of them.
const SYMBOL_FONT = "noto-sans-symbols-2/files/noto-sans-symbols-2-symbols-400-normal.woff2";

function bundledFontCss() {
  const base = globalThis.MINS_DOC_FONT_URL || "/node_modules/@fontsource";
  const symbols = `src: url("${base}/${SYMBOL_FONT}") format("woff2"); unicode-range: ${symbolFontRange()}; }`;
  return [...BUNDLED_FONTS.flatMap(([family, id]) => [400, 700].flatMap((weight) => [
    `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; `
      + `src: url("${base}/${id}/files/${id}-korean-${weight}-normal.woff2") format("woff2"); }`,
    `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; ${symbols}`
  ])), `@font-face { font-family: "Mins Symbols"; font-display: swap; ${symbols}`].join("\n");
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Converted HTML keeps its own styles (HWP layout) but never scripts or event handlers.
export function buildDocumentHtml({ html, layout = false, lang = "ko" }) {
  const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
  parsed.querySelectorAll("script, iframe, object, embed, link, meta, base").forEach((node) => node.remove());
  const styles = [...parsed.querySelectorAll("style")].map((node) => {
    node.remove();
    return node.textContent || "";
  });
  for (const element of parsed.body.querySelectorAll("*")) {
    for (const { name, value } of [...element.attributes]) {
      if (/^on/i.test(name) || (/^(href|src|xlink:href)$/i.test(name) && /^\s*javascript:/i.test(value))) element.removeAttribute(name);
    }
  }
  const docx = Boolean(parsed.querySelector(".docx-styled"));
  const bodyClasses = [layout ? "is-layout" : "is-flow", ...(docx ? ["is-docx"] : []),
    ...(docx || parsed.querySelector(".hwp-styled") ? ["has-own-colors"] : [])];
  return `<!doctype html><html lang="${escapeAttribute(lang)}"><head><meta charset="utf-8">`
    + `<style>${bundledFontCss()}</style><style>${styles.join("\n")}</style><style>${BASE_CSS}</style></head>`
    + `<body class="${bodyClasses.join(" ")}">${parsed.body.innerHTML}</body></html>`;
}

export class DocumentReader {
  #frameListeners = null;
  #scrollFrame = 0;
  #searchMatches = [];
  #activeMatch = -1;

  constructor({ frame, onLocationChange = () => {}, onSelectionChange = () => {}, onReady = () => {}, getHighlights = () => [] }) {
    this.frame = frame;
    this.onLocationChange = onLocationChange;
    this.onSelectionChange = onSelectionChange;
    this.onReady = onReady;
    this.getHighlights = getHighlights;
    this.document = null;
    this.zoom = 1;
    this.theme = "light";
    this.rangeView = "";
    this.fitWidth = false;
  }

  // rangeView: the view name stored in highlight ranges (textAnchors.js); fitWidth: shrink laid-out
  // pages to the frame width (the phone's HWP page view).
  async open({ html, layout = false, location, theme = "light", zoom = 1, lang = "ko", rangeView = "", fitWidth = false }) {
    this.layout = layout;
    this.rangeView = rangeView;
    this.fitWidth = layout && fitWidth;
    const loaded = new Promise((resolve) => this.frame.addEventListener("load", resolve, { once: true }));
    this.frame.srcdoc = buildDocumentHtml({ html, layout, lang });
    await loaded;
    this.document = this.frame.contentDocument;
    this.#installEvents();
    this.setTheme(theme);
    this.setZoom(zoom);
    this.refreshHighlights();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    this.goToLocation(location);
    this.onReady(this.document);
  }

  #installEvents() {
    this.#frameListeners?.abort();
    this.#frameListeners = new AbortController();
    const signal = this.#frameListeners.signal;
    const view = this.document.defaultView;
    view.addEventListener("scroll", () => {
      cancelAnimationFrame(this.#scrollFrame);
      this.#scrollFrame = requestAnimationFrame(() => this.onLocationChange(this.currentLocation()));
    }, { signal, passive: true });
    let selectionTimer = null;
    this.document.addEventListener("selectionchange", () => {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => this.onSelectionChange(this.getSelection()), 180);
    }, { signal });
    // Links inside a converted document must not navigate the reader frame.
    this.document.addEventListener("click", (event) => {
      if (event.target.closest?.("a[href]")) event.preventDefault();
    }, { signal, capture: true });
    if (this.fitWidth) view.addEventListener("resize", () => this.setZoom(this.zoom), { signal });
  }

  // How much the widest page must shrink to fit the frame (1 when it fits or fitWidth is off).
  #fitScale() {
    if (!this.fitWidth) return 1;
    const body = this.document.body;
    const previous = body.style.zoom;
    body.style.zoom = "1";
    let widest = 0;
    for (const page of this.document.querySelectorAll(".hpa")) widest = Math.max(widest, page.offsetWidth);
    body.style.zoom = previous;
    const width = this.frame.clientWidth - 12;
    return widest > 0 && width > 0 && widest > width ? width / widest : 1;
  }

  get scroller() {
    return this.document?.scrollingElement || this.document?.documentElement;
  }

  get pageState() {
    const scroller = this.scroller;
    if (!scroller) return { page: 1, pageCount: 1, ratio: 0, atStart: true, atEnd: true };
    return getScrollPageState({ scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight });
  }

  currentLocation() {
    return formatDocLocation(this.pageState.ratio);
  }

  pageForLocation(value) {
    const location = parseDocLocation(value);
    const scroller = this.scroller;
    if (!location || !scroller) return null;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    return getScrollPageState({ scrollTop: location.ratio * maxScroll, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight }).page;
  }

  goToLocation(value) {
    const location = parseDocLocation(value);
    const scroller = this.scroller;
    if (!scroller) return;
    scroller.scrollTop = location ? location.ratio * Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0;
  }

  next() {
    const scroller = this.scroller;
    if (scroller) scroller.scrollTop += Math.round(scroller.clientHeight * 0.92);
  }

  previous() {
    const scroller = this.scroller;
    if (scroller) scroller.scrollTop -= Math.round(scroller.clientHeight * 0.92);
  }

  setTheme(theme) {
    this.theme = THEMES[theme] ? theme : "light";
    if (!this.document) return;
    const colors = THEMES[this.theme];
    const root = this.document.documentElement;
    root.style.setProperty("--doc-bg", colors.bg);
    root.style.setProperty("--doc-fg", colors.fg);
    root.style.setProperty("--doc-page", this.layout ? colors.page : colors.bg);
    this.document.body.classList.toggle("theme-dark", this.theme === "dark");
  }

  setZoom(zoom) {
    const ratio = this.pageState.ratio;
    this.zoom = Math.min(3, Math.max(0.4, Number(zoom) || 1));
    if (!this.document) return;
    this.document.body.style.zoom = String(this.zoom * this.#fitScale());
    this.goToLocation(formatDocLocation(ratio));
  }

  #textNodes() {
    const walker = this.document.createTreeWalker(this.document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  }

  #offsetOf(container, offset) {
    const range = this.document.createRange();
    range.setStart(this.document.body, 0);
    range.setEnd(container, offset);
    return range.toString().length;
  }

  getSelection() {
    const selection = this.document?.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const quote = selection.toString().replace(/\s+/g, " ").trim();
    if (!quote || !this.document.body.contains(range.commonAncestorContainer)) return null;
    const start = this.#offsetOf(range.startContainer, range.startOffset);
    const end = this.#offsetOf(range.endContainer, range.endOffset);
    if (end <= start) return null;
    const rect = range.getBoundingClientRect();
    const frameRect = this.frame.getBoundingClientRect();
    return {
      quote,
      range: formatDocRange({ start, end }, this.rangeView),
      location: this.currentLocation(),
      clientRect: { left: frameRect.left + rect.left, top: frameRect.top + rect.top, width: rect.width, height: rect.height }
    };
  }

  clearSelection() {
    this.document?.getSelection()?.removeAllRanges();
  }

  #unwrapMarks() {
    for (const mark of this.document.querySelectorAll("mark.mins-doc-mark")) {
      mark.replaceWith(...mark.childNodes);
    }
    this.document.body.normalize();
  }

  #wrap(start, end, className, attributes = {}) {
    const nodes = this.#textNodes();
    const segments = segmentsForRange(nodes.map((node) => node.nodeValue.length), start, end);
    for (const { index, from, to } of segments.reverse()) {
      let node = nodes[index];
      if (to < node.nodeValue.length) node.splitText(to);
      if (from > 0) node = node.splitText(from);
      const mark = this.document.createElement("mark");
      mark.className = `mins-doc-mark ${className}`;
      Object.assign(mark.dataset, attributes);
      node.replaceWith(mark);
      mark.append(node);
    }
  }

  // Marks are rebuilt together so highlights and search results never nest incorrectly.
  refreshHighlights() {
    if (!this.document) return;
    this.#unwrapMarks();
    for (const highlight of this.getHighlights()) {
      const range = parseDocRange(highlight.range, this.rangeView);
      if (range) this.#wrap(range.start, range.end, `is-${highlight.color || "note"}`, { annotationId: highlight.id });
    }
    this.#searchMatches.forEach((match, index) => {
      this.#wrap(match.start, match.end, `is-search${index === this.#activeMatch ? " is-active" : ""}`, { searchIndex: String(index) });
    });
  }

  #scrollToOffset(offset) {
    const nodes = this.#textNodes();
    const [segment] = segmentsForRange(nodes.map((node) => node.nodeValue.length), offset, offset + 1);
    if (!segment) return;
    const range = this.document.createRange();
    range.setStart(nodes[segment.index], segment.from);
    range.setEnd(nodes[segment.index], segment.to);
    const rect = range.getBoundingClientRect();
    const scroller = this.scroller;
    scroller.scrollTop += rect.top - scroller.clientHeight / 3;
  }

  goToRange(value) {
    const range = parseDocRange(value, this.rangeView);
    if (range && this.document) this.#scrollToOffset(range.start);
  }

  find(query) {
    if (!this.document) return [];
    this.#searchMatches = findTextMatches(this.document.body.textContent, query);
    this.#activeMatch = this.#searchMatches.length ? 0 : -1;
    this.refreshHighlights();
    if (this.#activeMatch >= 0) this.#scrollToOffset(this.#searchMatches[0].start);
    return this.#searchMatches;
  }

  showMatch(index) {
    if (!this.#searchMatches[index]) return;
    this.#activeMatch = index;
    for (const mark of this.document.querySelectorAll("mark.is-search")) {
      mark.classList.toggle("is-active", mark.dataset.searchIndex === String(index));
    }
    this.#scrollToOffset(this.#searchMatches[index].start);
  }

  clearFind() {
    this.#searchMatches = [];
    this.#activeMatch = -1;
    this.refreshHighlights();
  }

  destroy() {
    this.#frameListeners?.abort();
    cancelAnimationFrame(this.#scrollFrame);
    this.document = null;
    this.frame.removeAttribute("srcdoc");
    this.frame.src = "about:blank";
  }
}
