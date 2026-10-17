// PDF reading on top of PDF.js and its viewer components. Only features PDF.js
// provides are exposed; highlights are the app's own overlay stored in the book record.
import {
  createPdfDocumentId,
  formatPdfLocation,
  formatPdfRange,
  normalizePdfZoom,
  parsePdfLocation,
  parsePdfRange
} from "../src/core/pdfLocation.js";

const DEFAULT_LIBRARY_BASE = "/node_modules/pdfjs-dist/";
const PAGE_COLORS = Object.freeze({
  light: null,
  sepia: { background: "#f4ecd8", foreground: "#3f3428" },
  dark: { background: "#1d1f21", foreground: "#e3e3e3" }
});

let libraryPromise = null;

// The Android bundle sets MINS_PDFJS_BASE to the copied legacy build for older WebViews.
export function loadPdfLibrary() {
  libraryPromise ||= (async () => {
    const base = globalThis.MINS_PDFJS_BASE || DEFAULT_LIBRARY_BASE;
    const pdfjsLib = await import(`${base}build/pdf.mjs`);
    globalThis.pdfjsLib = pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}build/pdf.worker.mjs`;
    const viewerLib = await import(`${base}web/pdf_viewer.mjs`);
    if (!document.querySelector("link[data-pdfjs-viewer-css]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `${base}web/pdf_viewer.css`;
      link.dataset.pdfjsViewerCss = "";
      document.head.append(link);
    }
    return { pdfjsLib, viewerLib, base };
  })();
  libraryPromise.catch(() => { libraryPromise = null; });
  return libraryPromise;
}

function pageNumberOf(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return Number(element?.closest?.(".page")?.dataset.pageNumber) || null;
}

export class PdfReader {
  #listeners = new AbortController();
  #selectionTimer = null;

  constructor({
    container,
    viewer,
    isMobile = false,
    requestPassword = () => null,
    onLocationChange = () => {},
    onPageChange = () => {},
    onSelectionChange = () => {},
    onFindUpdate = () => {},
    getHighlights = () => []
  }) {
    this.container = container;
    this.viewerElement = viewer;
    this.isMobile = isMobile;
    this.requestPassword = requestPassword;
    this.onLocationChange = onLocationChange;
    this.onPageChange = onPageChange;
    this.onSelectionChange = onSelectionChange;
    this.onFindUpdate = onFindUpdate;
    this.getHighlights = getHighlights;
    this.pdfDocument = null;
    this.loadingTask = null;
    this.viewer = null;
    this.location = null;
    this.findQuery = "";
  }

  // resolveLocation(documentId) lets the caller look up the saved position once the PDF identity is known.
  async open({ data, url, resolveLocation = () => null, theme = "light", viewMode = "paginated", spread = false }) {
    const { pdfjsLib, viewerLib, base } = await loadPdfLibrary();
    this.lib = pdfjsLib;
    this.viewerLib = viewerLib;
    this.eventBus = new viewerLib.EventBus();
    this.linkService = new viewerLib.PDFLinkService({ eventBus: this.eventBus });
    this.findController = new viewerLib.PDFFindController({ eventBus: this.eventBus, linkService: this.linkService });
    this.viewer = new viewerLib.PDFViewer({
      container: this.container,
      viewer: this.viewerElement,
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      textLayerMode: 1,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE,
      annotationEditorMode: pdfjsLib.AnnotationEditorType.DISABLE,
      pageColors: PAGE_COLORS[theme] || null,
      maxCanvasPixels: this.isMobile ? 2 ** 24 : undefined,
      supportsPinchToZoom: true
    });
    this.linkService.setViewer(this.viewer);
    this.#installEvents();

    this.loadingTask = pdfjsLib.getDocument({
      ...(url ? { url } : { data }),
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
      isEvalSupported: false,
      enableXfa: false
    });
    this.loadingTask.onPassword = (update, reason) => {
      const password = this.requestPassword(reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD);
      if (typeof password === "string") update(password);
      else {
        this.passwordCancelled = true;
        void this.loadingTask?.destroy();
      }
    };
    this.pdfDocument = await this.loadingTask.promise;
    const documentId = createPdfDocumentId(this.pdfDocument.fingerprints?.[0]);
    const location = resolveLocation(documentId);

    const pagesReady = new Promise((resolve) => this.eventBus.on("pagesinit", resolve, { once: true }));
    this.viewer.setDocument(this.pdfDocument);
    this.linkService.setDocument(this.pdfDocument);
    await pagesReady;
    this.setViewMode(viewMode);
    this.setSpread(spread);
    this.goToLocation(location);

    const [metadata, outline] = await Promise.all([
      this.pdfDocument.getMetadata().catch(() => null),
      this.pdfDocument.getOutline().catch(() => null)
    ]);
    return {
      documentId,
      pageCount: this.pdfDocument.numPages,
      title: String(metadata?.info?.Title || "").trim(),
      outline: this.#mapOutline(outline || [])
    };
  }

  #installEvents() {
    const signal = this.#listeners.signal;
    this.eventBus.on("updateviewarea", ({ location }) => {
      this.location = location;
      this.onLocationChange(this.currentLocation());
    }, { signal });
    this.eventBus.on("pagechanging", () => this.onPageChange(), { signal });
    this.eventBus.on("pagerendered", ({ pageNumber }) => this.drawHighlights(pageNumber), { signal });
    this.eventBus.on("updatefindmatchescount", ({ matchesCount }) => this.#reportFind(null, matchesCount), { signal });
    this.eventBus.on("updatefindcontrolstate", ({ state, matchesCount }) => this.#reportFind(state, matchesCount), { signal });

    document.addEventListener("selectionchange", () => {
      clearTimeout(this.#selectionTimer);
      this.#selectionTimer = setTimeout(() => this.onSelectionChange(this.getSelection()), 180);
    }, { signal });

    // In page mode a wheel turn at the page edge moves to the neighbouring page.
    this.container.addEventListener("wheel", (event) => {
      if (event.ctrlKey || !this.viewer || this.viewer.scrollMode !== this.viewerLib.ScrollMode.PAGE) return;
      const { scrollTop, scrollHeight, clientHeight } = this.container;
      if (event.deltaY > 0 && scrollTop + clientHeight >= scrollHeight - 2) {
        event.preventDefault();
        this.next();
      } else if (event.deltaY < 0 && scrollTop <= 1) {
        event.preventDefault();
        this.previous({ toBottom: true });
      }
    }, { passive: false, signal });
  }

  #reportFind(state, matchesCount) {
    const pageMatches = this.findController?.pageMatches || [];
    this.onFindUpdate({
      query: this.findQuery,
      state,
      current: matchesCount?.current || 0,
      total: matchesCount?.total || 0,
      pages: pageMatches
        .map((matches, index) => ({ pageNumber: index + 1, count: matches?.length || 0 }))
        .filter(({ count }) => count > 0)
    });
  }

  #mapOutline(items) {
    return items.map((item) => ({
      label: String(item.title || "").trim(),
      href: item.dest ? "pdf-outline" : "",
      pdfDest: item.dest || null,
      subitems: this.#mapOutline(item.items || [])
    }));
  }

  get pageNumber() {
    return this.viewer?.currentPageNumber || 1;
  }

  get pageCount() {
    return this.pdfDocument?.numPages || 0;
  }

  currentLocation() {
    const location = this.location;
    if (!location) return formatPdfLocation({ pageNumber: this.pageNumber, zoom: this.viewer?.currentScaleValue });
    const zoom = typeof location.scale === "number" ? location.scale / 100 : location.scale;
    return formatPdfLocation({ pageNumber: location.pageNumber, zoom, left: location.left, top: location.top, rotation: location.rotation });
  }

  // Bookmarks keep the reader's current zoom and rotation; resuming restores them.
  goToLocation(value, { keepView = false } = {}) {
    if (!this.viewer) return;
    const location = parsePdfLocation(value);
    if (!location) {
      if (!keepView) this.viewer.currentScaleValue = "page-width";
      return;
    }
    if (!keepView) {
      this.viewer.pagesRotation = location.rotation;
      this.viewer.currentScaleValue = String(normalizePdfZoom(location.zoom));
    }
    const pageNumber = Math.min(location.pageNumber, this.pageCount || location.pageNumber);
    if (location.top === null) {
      this.viewer.currentPageNumber = pageNumber;
      return;
    }
    this.viewer.scrollPageIntoView({
      pageNumber,
      destArray: [null, { name: "XYZ" }, location.left ?? 0, location.top, null],
      allowNegativeOffset: true,
      ignoreDestinationZoom: true
    });
  }

  goToPage(pageNumber) {
    if (this.viewer && pageNumber >= 1 && pageNumber <= this.pageCount) this.viewer.currentPageNumber = pageNumber;
  }

  async goToOutlineItem(item) {
    if (item?.pdfDest) await this.linkService.goToDestination(item.pdfDest);
  }

  get selectedMatchPage() {
    const pageIndex = this.findController?.selected?.pageIdx;
    return Number.isInteger(pageIndex) && pageIndex >= 0 ? pageIndex + 1 : null;
  }

  goToRange(range) {
    const first = parsePdfRange(range)[0];
    if (!first) return;
    const [, , , top] = first.rects[0];
    this.viewer.scrollPageIntoView({
      pageNumber: first.pageNumber,
      destArray: [null, { name: "XYZ" }, null, top + 24, null],
      allowNegativeOffset: true,
      ignoreDestinationZoom: true
    });
  }

  next() {
    return this.viewer?.nextPage() || false;
  }

  previous({ toBottom = false } = {}) {
    const moved = this.viewer?.previousPage() || false;
    if (moved && toBottom) requestAnimationFrame(() => { this.container.scrollTop = this.container.scrollHeight; });
    return moved;
  }

  get atStart() {
    return this.pageNumber <= 1;
  }

  get atEnd() {
    return this.pageNumber >= this.pageCount;
  }

  setViewMode(viewMode) {
    if (!this.viewer) return;
    const { ScrollMode } = this.viewerLib;
    this.viewer.scrollMode = viewMode === "continuous" ? ScrollMode.VERTICAL : ScrollMode.PAGE;
  }

  setSpread(enabled) {
    if (!this.viewer) return;
    this.viewer.spreadMode = enabled ? this.viewerLib.SpreadMode.ODD : this.viewerLib.SpreadMode.NONE;
  }

  get spread() {
    return Boolean(this.viewer && this.viewer.spreadMode !== this.viewerLib.SpreadMode.NONE);
  }

  get zoomValue() {
    return this.viewer?.currentScaleValue || "page-width";
  }

  get scale() {
    return this.viewer?.currentScale || 1;
  }

  setZoom(value) {
    if (this.viewer) this.viewer.currentScaleValue = String(normalizePdfZoom(value));
  }

  zoomIn() {
    this.viewer?.increaseScale();
  }

  zoomOut() {
    this.viewer?.decreaseScale();
  }

  rotate() {
    if (this.viewer) this.viewer.pagesRotation = (this.viewer.pagesRotation + 90) % 360;
  }

  // PDF.js applies page colors when page views are created, so the document is set again.
  async setTheme(theme) {
    if (!this.viewer || !this.pdfDocument) return;
    const colors = PAGE_COLORS[theme] || null;
    if (JSON.stringify(this.viewer.pageColors) === JSON.stringify(colors)) return;
    const location = this.currentLocation();
    const scrollMode = this.viewer.scrollMode;
    const spreadMode = this.viewer.spreadMode;
    const pagesReady = new Promise((resolve) => this.eventBus.on("pagesinit", resolve, { once: true }));
    this.viewer.pageColors = colors;
    this.viewer.setDocument(this.pdfDocument);
    await pagesReady;
    this.viewer.scrollMode = scrollMode;
    this.viewer.spreadMode = spreadMode;
    this.goToLocation(location);
    if (this.findQuery) this.find(this.findQuery);
  }

  getSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !this.viewer) return null;
    const range = selection.getRangeAt(0);
    if (!this.viewerElement.contains(range.commonAncestorContainer)) return null;
    const quote = selection.toString().replace(/\s+/g, " ").trim();
    const startPage = pageNumberOf(range.startContainer);
    const endPage = pageNumberOf(range.endContainer) || startPage;
    if (!quote || !startPage) return null;

    const views = [];
    for (let page = Math.min(startPage, endPage); page <= Math.max(startPage, endPage); page += 1) {
      const view = this.viewer.getPageView(page - 1);
      if (view?.div && view.viewport) views.push({ page, view, box: view.div.getBoundingClientRect() });
    }
    const pages = new Map();
    for (const rect of range.getClientRects()) {
      if (rect.width < 1 || rect.height < 1) continue;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const target = views.find(({ box }) => centerX >= box.left && centerX <= box.right && centerY >= box.top && centerY <= box.bottom);
      if (!target) continue;
      const { view, page } = target;
      const div = view.div;
      const originX = target.box.left + div.clientLeft;
      const originY = target.box.top + div.clientTop;
      const ratioX = view.viewport.width / (div.clientWidth || view.viewport.width);
      const ratioY = view.viewport.height / (div.clientHeight || view.viewport.height);
      const [x1, y1] = view.viewport.convertToPdfPoint((rect.left - originX) * ratioX, (rect.top - originY) * ratioY);
      const [x2, y2] = view.viewport.convertToPdfPoint((rect.right - originX) * ratioX, (rect.bottom - originY) * ratioY);
      if (!pages.has(page)) pages.set(page, []);
      pages.get(page).push([x1, y1, x2, y2]);
    }
    if (!pages.size) return null;
    let serialized;
    try {
      serialized = formatPdfRange([...pages].map(([pageNumber, rects]) => ({ pageNumber, rects })));
    } catch {
      return null;
    }
    const firstPage = Math.min(...pages.keys());
    return {
      quote,
      range: serialized,
      location: formatPdfLocation({ pageNumber: firstPage, zoom: this.zoomValue }),
      pageNumber: firstPage,
      clientRect: range.getBoundingClientRect()
    };
  }

  clearSelection() {
    document.getSelection()?.removeAllRanges();
  }

  drawHighlights(pageNumber) {
    const view = this.viewer?.getPageView(pageNumber - 1);
    if (!view?.div || !view.viewport) return;
    let layer = view.div.querySelector(":scope > .mins-pdf-highlights");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "mins-pdf-highlights";
      layer.setAttribute("aria-hidden", "true");
      view.div.append(layer);
    }
    const { width, height } = view.viewport;
    const marks = [];
    for (const highlight of this.getHighlights()) {
      for (const entry of parsePdfRange(highlight.range)) {
        if (entry.pageNumber !== pageNumber) continue;
        for (const rect of entry.rects) {
          const [x1, y1] = view.viewport.convertToViewportPoint(rect[0], rect[1]);
          const [x2, y2] = view.viewport.convertToViewportPoint(rect[2], rect[3]);
          const mark = document.createElement("div");
          mark.className = `mins-pdf-highlight is-${highlight.color || "note"}`;
          mark.dataset.annotationId = highlight.id;
          mark.style.left = `${(Math.min(x1, x2) / width) * 100}%`;
          mark.style.top = `${(Math.min(y1, y2) / height) * 100}%`;
          mark.style.width = `${(Math.abs(x2 - x1) / width) * 100}%`;
          mark.style.height = `${(Math.abs(y2 - y1) / height) * 100}%`;
          marks.push(mark);
        }
      }
    }
    layer.replaceChildren(...marks);
  }

  refreshHighlights() {
    for (let index = 0; index < this.pageCount; index += 1) {
      const view = this.viewer?.getPageView(index);
      if (view?.div?.querySelector(":scope > .mins-pdf-highlights") || view?.renderingState === 3) this.drawHighlights(index + 1);
    }
  }

  find(query, { again = false, previous = false } = {}) {
    if (!this.eventBus) return;
    this.findQuery = query;
    this.eventBus.dispatch("find", {
      source: this,
      type: again ? "again" : "",
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false
    });
  }

  clearFind() {
    this.findQuery = "";
    this.eventBus?.dispatch("findbarclose", { source: this });
  }

  async destroy() {
    this.#listeners.abort();
    clearTimeout(this.#selectionTimer);
    try {
      this.viewer?.setDocument(null);
      this.linkService?.setDocument(null);
    } catch {
      // The viewer may already be torn down while a document was loading.
    }
    const task = this.loadingTask;
    this.loadingTask = null;
    this.pdfDocument = null;
    this.viewer = null;
    this.viewerElement.replaceChildren();
    await task?.destroy().catch(() => {});
  }
}
