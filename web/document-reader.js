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

const THEMES = Object.freeze({
  light: { bg: "#fffdf8", fg: "#202327", page: "#e9ecef" },
  sepia: { bg: "#f4ecd8", fg: "#3f3428", page: "#e4d8bd" },
  dark: { bg: "#1d1f21", fg: "#e3e3e3", page: "#111315" }
});

const BASE_CSS = `
html { background: var(--doc-page); }
body { margin: 0; color: var(--doc-fg); background: var(--doc-page); }
body.is-flow { max-width: 46em; margin: 0 auto; padding: 32px 28px 64px; background: var(--doc-bg);
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
  font-size: 17px; line-height: 1.7; word-break: keep-all; overflow-wrap: anywhere; min-height: 100vh; box-sizing: border-box; }
body.is-flow table { border-collapse: collapse; margin: 1em 0; max-width: 100%; }
body.is-flow td, body.is-flow th { border: 1px solid color-mix(in srgb, currentColor 45%, transparent); padding: 4px 8px; vertical-align: top; }
body.is-flow td p { margin: 0.2em 0; }
body.is-flow img { max-width: 100%; height: auto; }
body.is-flow a { color: inherit; }
/* HWP pages (.hpa) paint their white sheet with a negative z-index, so the body stays transparent. */
body.is-layout { padding: 12px 0 48px; background: transparent; }
body.is-layout .hpa { margin: 0 auto 6mm !important; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25) !important; }
body.is-layout.theme-dark { filter: invert(0.9) hue-rotate(180deg); }
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
  return `<!doctype html><html lang="${escapeAttribute(lang)}"><head><meta charset="utf-8">`
    + `<style>${styles.join("\n")}</style><style>${BASE_CSS}</style></head>`
    + `<body class="${layout ? "is-layout" : "is-flow"}">${parsed.body.innerHTML}</body></html>`;
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
  }

  async open({ html, layout = false, location, theme = "light", zoom = 1, lang = "ko" }) {
    this.layout = layout;
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
    this.document.body.style.zoom = String(this.zoom);
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
      range: formatDocRange({ start, end }),
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
      const range = parseDocRange(highlight.range);
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
    const range = parseDocRange(value);
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
