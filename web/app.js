import {
  createAnnotationExport,
  createBookmark,
  createHighlight,
  createTextNote,
  updateTextNoteBody
} from "../src/core/annotations.js";
import { createBookRecord, updateBookSettings, updateLastLocation } from "../src/core/books.js";
import {
  createEpubContentSample,
  summarizeEpubContent
} from "../src/core/epubDiagnostics.js";
import {
  getBookRecord,
  parseLibraryStateWithRecovery,
  serializeLibraryState,
  upsertBookRecord
} from "../src/core/library.js";
import { assertOpenableEpub, describeEpubOpenFailure } from "../src/core/epubValidation.js";
import {
  getPublicationLayoutMode,
  shouldApplyReaderReflowStyles
} from "../src/core/renditionLayout.js";
import {
  createMarkdownDocument,
  createMarkdownFileName,
  documentToMarkdown
} from "../src/core/markdownExport.js";
import {
  createMarkdownBookmark,
  createMarkdownHighlight,
  getMarkdownDocumentAnnotations,
  lineRangeFromSource,
  parseMarkdownAnnotationState,
  updateMarkdownDocumentAnnotations
} from "../src/core/markdownAnnotations.js";
import {
  applyZoomIntent,
  getWheelIntent
} from "../src/core/readerControls.js";
import {
  canSearch,
  createSearchResult,
  getSearchNavigationIndex,
  limitSearchResults,
  normalizeSearchQuery
} from "../src/core/search.js";
import { DEFAULT_READING_SETTINGS, mergeReadingSettings } from "../src/core/settings.js";
import { buildTextOnlyCss } from "../src/core/textOnly.js";

const STORAGE_KEY = "minsepubviewer.library";
const STORAGE_BACKUP_KEY = "minsepubviewer.library.backup";
const UI_STORAGE_KEY = "minsepubviewer.ui";
const MARKDOWN_ANNOTATIONS_KEY = "minsepubviewer.markdown-annotations";

function formatError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name || "Error",
    message: error.message || String(error),
    stack: error.stack || ""
  };
}

function logClient(event, details = {}) {
  const payload = {
    event,
    details,
    location: window.location.href,
    userAgent: navigator.userAgent
  };

  fetch("/__client-log", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Logging must never break the reader.
  });
}

window.addEventListener("error", (event) => {
  logClient("window.error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: formatError(event.error)
  });
});

window.addEventListener("unhandledrejection", (event) => {
  logClient("window.unhandledrejection", {
    reason: formatError(event.reason) || String(event.reason)
  });
});

function loadLibrary() {
  const result = parseLibraryStateWithRecovery(
    localStorage.getItem(STORAGE_KEY),
    localStorage.getItem(STORAGE_BACKUP_KEY)
  );

  if (result.recovered) {
    const serialized = serializeLibraryState(result.library);
    localStorage.setItem(STORAGE_KEY, serialized);
    logClient("library.recovered", {
      source: result.source,
      books: result.library.books.length
    });
  }

  return result.library;
}

function saveLibrary(library) {
  const serialized = serializeLibraryState(library);

  localStorage.setItem(STORAGE_BACKUP_KEY, serialized);
  localStorage.setItem(STORAGE_KEY, serialized);
}

function loadUiState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "{}");

    return {
      leftPanelCollapsed: Boolean(parsed.leftPanelCollapsed),
      rightPanelCollapsed: Boolean(parsed.rightPanelCollapsed)
    };
  } catch {
    return {
      leftPanelCollapsed: false,
      rightPanelCollapsed: false
    };
  }
}

function saveUiState(ui) {
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
    leftPanelCollapsed: Boolean(ui.leftPanelCollapsed),
    rightPanelCollapsed: Boolean(ui.rightPanelCollapsed)
  }));
}

let wheelNavLock = false;

const state = {
  tabs: [],
  activeTabId: "",
  tabActivationSequence: 0,
  library: loadLibrary(),
  book: createBookRecord({
    bookId: "sample-book",
    title: "Minse EPUB Viewer",
    settings: DEFAULT_READING_SETTINGS
  }),
  epubBook: null,
  rendition: null,
  renditionEventsInstalled: false,
  publicationLayoutMode: "reflowable",
  toc: [],
  currentHref: "",
  selectedRange: "",
  selectedQuote: "",
  editingNoteId: "",
  page: 1,
  pageCount: 5,
  progressLabel: "",
  bookMeta: "Choose an EPUB file to render the book body.",
  contentSamples: new Map(),
  contentWarning: "",
  searchQuery: "",
  searchResults: [],
  searchHighlightRanges: [],
  activeSearchResultIndex: -1,
  searchStatus: "",
  searching: false,
  markdownExporting: false,
  mode: "epub",
  markdown: {
    name: "",
    path: "",
    content: "",
    savedContent: "",
    dirty: false,
    viewMode: "edit",
    saving: false
  },
  markdownEditor: null,
  markdownViewer: null,
  markdownAnnotations: parseMarkdownAnnotationState(localStorage.getItem(MARKDOWN_ANNOTATIONS_KEY)),
  markdownSelection: null,
  markdownCurrentLine: 1,
  markdownScrollTop: 0,
  activeSidebarTab: "toc",
  ui: loadUiState()
};

const elements = {
  app: document.querySelector("#app"),
  contentRow: document.querySelector("#contentRow"),
  leftPanelToggle: document.querySelector("#leftPanelToggle"),
  rightPanelToggle: document.querySelector("#rightPanelToggle"),
  selectionToolbar: document.querySelector("#selectionToolbar"),
  yellowSelectionButton: document.querySelector("#yellowSelectionButton"),
  orangeSelectionButton: document.querySelector("#orangeSelectionButton"),
  underlineSelectionButton: document.querySelector("#underlineSelectionButton"),
  openBookButton: document.querySelector("#openBookButton"),
  recentFilesButton: document.querySelector("#recentFilesButton"),
  recentFilesMenu: document.querySelector("#recentFilesMenu"),
  documentTabs: document.querySelector("#documentTabs"),
  bookInput: document.querySelector("#bookInput"),
  newMarkdownButton: document.querySelector("#newMarkdownButton"),
  openMarkdownButton: document.querySelector("#openMarkdownButton"),
  markdownInput: document.querySelector("#markdownInput"),
  fileDropOverlay: document.querySelector("#fileDropOverlay"),
  markdownActions: document.querySelector("#markdownActions"),
  markdownEditButton: document.querySelector("#markdownEditButton"),
  markdownViewButton: document.querySelector("#markdownViewButton"),
  saveMarkdownButton: document.querySelector("#saveMarkdownButton"),
  saveMarkdownAsButton: document.querySelector("#saveMarkdownAsButton"),
  closeMarkdownButton: document.querySelector("#closeMarkdownButton"),
  markdownWorkspace: document.querySelector("#markdownWorkspace"),
  markdownEditor: document.querySelector("#markdownEditor"),
  markdownViewer: document.querySelector("#markdownViewer"),
  bookTitle: document.querySelector("#bookTitle"),
  bookMeta: document.querySelector("#bookMeta"),
  reader: document.querySelector("#reader"),
  fontFamily: document.querySelector("#fontFamily"),
  fontStatus: document.querySelector("#fontStatus"),
  fontSize: document.querySelector("#fontSize"),
  lineHeight: document.querySelector("#lineHeight"),
  margin: document.querySelector("#margin"),
  theme: document.querySelector("#theme"),
  textOnly: document.querySelector("#textOnly"),
  zoomLabel: document.querySelector("#zoomLabel"),
  locationLabel: document.querySelector("#locationLabel"),
  pageLabel: document.querySelector("#pageLabel"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  bookmarkButton: document.querySelector("#bookmarkButton"),
  prevSearchResultButton: document.querySelector("#prevSearchResultButton"),
  nextSearchResultButton: document.querySelector("#nextSearchResultButton"),
  paginatedModeButton: document.querySelector("#paginatedModeButton"),
  continuousModeButton: document.querySelector("#continuousModeButton"),
  textOnlyToolbarButton: document.querySelector("#textOnlyToolbarButton"),
  exportMarkdownButton: document.querySelector("#exportMarkdownButton"),
  tocTab: document.querySelector("#tocTab"),
  searchTab: document.querySelector("#searchTab"),
  bookmarksTab: document.querySelector("#bookmarksTab"),
  tocPanel: document.querySelector("#tocPanel"),
  searchPanel: document.querySelector("#searchPanel"),
  bookmarksPanel: document.querySelector("#bookmarksPanel"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  searchButton: document.querySelector("#searchButton"),
  searchStatus: document.querySelector("#searchStatus"),
  searchResults: document.querySelector("#searchResults"),
  bookmarkList: document.querySelector("#bookmarkList"),
  markdownHighlights: document.querySelector("#markdownHighlights"),
  markdownHighlightList: document.querySelector("#markdownHighlightList"),
  tocList: document.querySelector("#tocList"),
  selectionStatus: document.querySelector("#selectionStatus"),
  highlightColor: document.querySelector("#highlightColor"),
  highlightButton: document.querySelector("#highlightButton"),
  noteBody: document.querySelector("#noteBody"),
  noteButton: document.querySelector("#noteButton"),
  exportAnnotationsButton: document.querySelector("#exportAnnotationsButton"),
  annotationList: document.querySelector("#annotationList")
};

const activeBook = getBookRecord(state.library, state.library.activeBookId);
if (activeBook) {
  state.book = activeBook;
  state.page = Number(activeBook.lastLocation.replace("page-", "")) || 1;
}

function persistBook() {
  state.library = upsertBookRecord(state.library, state.book);
  saveLibrary(state.library);
}

function getCurrentBookmarkLocation() {
  return state.book.lastLocation || `page-${state.page}`;
}

function hasBookmarkAtCurrentLocation() {
  if (state.mode === "markdown") {
    return getCurrentMarkdownAnnotations().bookmarks.some((bookmark) => bookmark.line === state.markdownCurrentLine);
  }
  const location = getCurrentBookmarkLocation();

  return state.book.bookmarks.some((bookmark) => bookmark.location === location);
}

function getReaderTheme(settings) {
  if (settings.theme === "dark") {
    return { background: "#17191b", color: "#eef1f3" };
  }

  if (settings.theme === "sepia") {
    return { background: "#fff9ea", color: "#2b2925" };
  }

  return { background: "#fffdf8", color: "#202327" };
}

function getReaderFont(settings) {
  const fontMap = {
    original: "",
    system: '"Segoe UI", system-ui, sans-serif',
    "kopub-batang": '"KoPubWorldBatang", "KoPubWorld Batang", "KoPub Batang", "Batang", serif',
    "kopub-dotum": '"KoPubWorldDotum", "KoPubWorld Dotum", "KoPub Dotum", "Malgun Gothic", sans-serif',
    "noto-serif-kr": '"Noto Serif KR", "Noto Serif CJK KR", "Source Han Serif K", "Batang", serif',
    "noto-sans-kr": '"Noto Sans KR", "Noto Sans CJK KR", "Source Han Sans K", "Malgun Gothic", sans-serif',
    "nanum-myeongjo": '"Nanum Myeongjo", "NanumMyeongjo", "Batang", serif',
    "nanum-gothic": '"Nanum Gothic", "NanumGothic", "Malgun Gothic", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    "sans-serif": '"Segoe UI", Arial, sans-serif',
    monospace: '"Cascadia Mono", Consolas, monospace'
  };

  return fontMap[settings.fontFamily] ?? fontMap.original;
}

function getPrimaryFontName(settings) {
  const primaryFontMap = {
    "kopub-batang": "KoPubWorldBatang",
    "kopub-dotum": "KoPubWorldDotum",
    "noto-serif-kr": "Noto Serif KR",
    "noto-sans-kr": "Noto Sans KR",
    "nanum-myeongjo": "Nanum Myeongjo",
    "nanum-gothic": "Nanum Gothic"
  };

  return primaryFontMap[settings.fontFamily] || "";
}

function getFontStatus(settings) {
  if (settings.fontFamily === "original") {
    return {
      message: "Using the publisher's original font.",
      warning: false
    };
  }

  if (settings.fontFamily === "system") {
    return {
      message: "Using the system fallback font.",
      warning: false
    };
  }

  const fontName = getPrimaryFontName(settings);

  if (!fontName || !document.fonts?.check) {
    return {
      message: "Font availability cannot be checked in this environment.",
      warning: false
    };
  }

  const available = document.fonts.check(`16px "${fontName}"`);

  return {
    message: available
      ? `${fontName} is available.`
      : `${fontName} is not installed; fallback fonts will be used.`,
    warning: !available
  };
}

function shouldOverrideFont(settings) {
  return Boolean(getReaderFont(settings));
}

function getZoomedFontSize(settings) {
  return Number((settings.fontSize * settings.zoom).toFixed(2));
}

function getRenditionFlow(settings) {
  return settings.viewMode === "continuous" ? "scrolled-doc" : "paginated";
}

function isPrePaginatedMode() {
  return state.publicationLayoutMode === "pre-paginated";
}

function getRenditionGap(settings) {
  return Math.max(0, Number(settings.margin) || 0) * 2;
}

function getHighlightStyle(color) {
  const fills = {
    yellow: "#f8d94a",
    orange: "#ff9f1c",
    green: "#8edb8e",
    pink: "#f4a3be",
    blue: "#8ec5f4"
  };

  if (color === "underline") {
    return {
      fill: "transparent",
      "fill-opacity": "0",
      stroke: "#1c5d99",
      "stroke-width": "2px",
      "stroke-opacity": "0.9"
    };
  }

  return {
    fill: fills[color] || fills.yellow,
    "fill-opacity": "0.38",
    "mix-blend-mode": "multiply"
  };
}

function getSearchHighlightStyle() {
  return {
    fill: "#ffd54a",
    "fill-opacity": "0.5",
    "mix-blend-mode": "multiply"
  };
}

function getActiveSearchHighlightStyle() {
  return {
    fill: "#ff9f1c",
    "fill-opacity": "0.7",
    "mix-blend-mode": "multiply"
  };
}

function getReaderCss(settings) {
  const theme = getReaderTheme(settings);
  const margin = `${settings.margin}px`;
  const fontCss = shouldOverrideFont(settings)
    ? `
      font-family: ${getReaderFont(settings)} !important;
    `
    : "";
  const inheritedFontCss = shouldOverrideFont(settings)
    ? `
    body * {
      font-family: inherit !important;
    }
    `
    : "";
  const textOnlyCss = settings.textOnly
    ? buildTextOnlyCss({
        keepCaptions: settings.keepCaptionsInTextOnly,
        hideCover: settings.hideCoverInTextOnly
      })
    : "";

  return `
    html {
      min-height: 100% !important;
      box-sizing: border-box !important;
      background-color: ${theme.background} !important;
      color: ${theme.color} !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    body {
      min-height: 100% !important;
      box-sizing: border-box !important;
      background-color: ${theme.background} !important;
      color: ${theme.color} !important;
      ${fontCss}
      font-size: ${getZoomedFontSize(settings)}px !important;
      line-height: ${settings.lineHeight} !important;
      margin: 0 !important;
      padding: ${margin} !important;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box !important;
    }

    ${inheritedFontCss}

    img {
      max-width: 100% !important;
      cursor: zoom-in !important;
    }

    ${textOnlyCss}
  `;
}

function applyContentMargin(contents, settings) {
  const body = contents?.document?.body;

  if (!body) {
    return;
  }

  const margin = `${settings.margin}px`;
  body.style.setProperty("box-sizing", "border-box", "important");
  body.style.setProperty("padding-top", margin, "important");
  body.style.setProperty("padding-right", margin, "important");
  body.style.setProperty("padding-bottom", margin, "important");
  body.style.setProperty("padding-left", margin, "important");
}

function clearReaderStyleOverrides(contents) {
  const document = contents?.document;

  document?.getElementById("minse-reader-style")?.remove();
  document?.getElementById("epubjs-inserted-css-minse-reader")?.remove();
}

function applyContentSettings(contents) {
  const document = contents?.document;

  if (!document?.head) {
    return;
  }

  if (!shouldApplyReaderReflowStyles(state.epubBook)) {
    clearReaderStyleOverrides(contents);
    return;
  }

  const settings = mergeReadingSettings(state.book.settings, {});
  const styleId = "minse-reader-style";
  const existing = document.getElementById(styleId);
  const style = existing || document.createElement("style");

  style.id = styleId;
  style.dataset.minseReader = "true";
  style.textContent = getReaderCss(settings);

  if (!existing) {
    document.head.appendChild(style);
  }

  applyContentMargin(contents, settings);
  setTimeout(() => {
    applyContentMargin(contents, settings);
  }, 0);
}

function applyRenditionSettings() {
  if (!state.rendition) {
    return;
  }

  const settings = mergeReadingSettings(state.book.settings, {});
  if (state.rendition.manager?.settings) {
    state.rendition.manager.settings.gap = getRenditionGap(settings);
  }

  if (typeof state.rendition.flow === "function") {
    state.rendition.flow(getRenditionFlow(settings));
  }

  if (!shouldApplyReaderReflowStyles(state.epubBook)) {
    if (state.rendition.themes?._themes?.["minse-reader"]) {
      state.rendition.themes._themes["minse-reader"] = { rules: {} };
    }
    if (state.rendition.themes) {
      state.rendition.themes._current = "default";
    }
    for (const contents of state.rendition.getContents?.() || []) {
      clearReaderStyleOverrides(contents);
    }
    return;
  }

  const bodyTheme = {
    "font-size": `${getZoomedFontSize(settings)}px !important`,
    "line-height": `${settings.lineHeight} !important`,
    margin: "0 !important",
    padding: `${settings.margin}px !important`
  };

  if (shouldOverrideFont(settings)) {
    bodyTheme["font-family"] = `${getReaderFont(settings)} !important`;
  }

  state.rendition.themes.register("minse-reader", {
    body: bodyTheme
  });
  state.rendition.themes.select("minse-reader");

  for (const contents of state.rendition.getContents?.() || []) {
    applyContentSettings(contents);
  }
}

function installRenditionEvents() {
  if (!state.rendition || state.renditionEventsInstalled) {
    return;
  }

  state.renditionEventsInstalled = true;

  state.rendition.on("relocated", (location) => {
    if (!syncRenditionLocation(location)) {
      return;
    }
    render();
  });

  state.rendition.on("displayed", () => {
    const settings = mergeReadingSettings(state.book.settings, {});
    for (const contents of state.rendition.getContents?.() || []) {
      applyContentMargin(contents, settings);
    }
  });

  state.rendition.on("selected", (cfiRange, contents) => {
    const quote = contents?.window?.getSelection?.().toString().trim() || "";
    state.selectedRange = cfiRange;
    state.selectedQuote = quote;
    showSelectionToolbar(contents);
    logClient("epub.selection.changed", {
      quoteLength: quote.length
    });
    render();
  });
}

function createRendition() {
  const settings = mergeReadingSettings(state.book.settings, {});
  state.renditionEventsInstalled = false;
  state.rendition = state.epubBook.renderTo(elements.reader, {
    width: "100%",
    height: "100%",
    flow: getRenditionFlow(settings),
    gap: getRenditionGap(settings),
    manager: settings.viewMode === "continuous" ? "continuous" : "default",
    spread: "none"
  });
  installContentHooks();
  installRenditionEvents();
  applyRenditionSettings();
}

function hideSelectionToolbar() {
  elements.selectionToolbar.hidden = true;
}

function showSelectionToolbar(contents) {
  const selection = contents?.window?.getSelection?.();
  const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect?.();
  const iframe = contents?.document?.defaultView?.frameElement;

  if (!rect || !iframe || rect.width === 0 && rect.height === 0) {
    hideSelectionToolbar();
    return;
  }

  const iframeRect = iframe.getBoundingClientRect();
  const contentRowRect = elements.contentRow.getBoundingClientRect();
  const left = iframeRect.left - contentRowRect.left + rect.left + rect.width / 2;
  const top = iframeRect.top - contentRowRect.top + rect.top - 10;

  elements.selectionToolbar.style.left = `${Math.max(48, left)}px`;
  elements.selectionToolbar.style.top = `${Math.max(48, top)}px`;
  elements.selectionToolbar.hidden = false;
}

function applyStoredAnnotations() {
  if (!state.rendition) {
    return;
  }

  for (const highlight of state.book.highlights) {
    state.rendition.annotations.highlight(
      highlight.range,
      { id: highlight.id },
      null,
      "minse-highlight",
      getHighlightStyle(highlight.color)
    );
  }

  for (const note of state.book.notes) {
    state.rendition.annotations.highlight(
      note.range,
      { id: note.id },
      null,
      "minse-note-highlight",
      getHighlightStyle("blue")
    );
  }
}

function clearSearchHighlights() {
  if (!state.rendition) {
    state.searchHighlightRanges = [];
    return;
  }

  for (const range of state.searchHighlightRanges) {
    if (isEpubCfi(range)) {
      state.rendition.annotations.remove(range, "highlight");
    }
  }

  state.searchHighlightRanges = [];
  applyStoredAnnotations();
}

function applySearchHighlights() {
  if (!state.rendition) {
    return;
  }

  clearSearchHighlights();
  state.searchHighlightRanges = state.searchResults
    .map((result) => result.cfi)
    .filter((cfi) => isEpubCfi(cfi));

  for (const [index, range] of state.searchHighlightRanges.entries()) {
    state.rendition.annotations.highlight(
      range,
      { id: `search-${index}` },
      null,
      "minse-search-highlight",
      index === state.activeSearchResultIndex
        ? getActiveSearchHighlightStyle()
        : getSearchHighlightStyle()
    );
  }
}

function installContentHooks() {
  if (!state.rendition) {
    return;
  }

  state.rendition.hooks.content.register((contents) => {
    applyContentSettings(contents);
    sampleRenderedContent(contents);
    updateContentDiagnostics();
    installContentWheelHandler(contents);
    installContentImageHandler(contents);
    installFileDropHandlers(contents?.document);

    if (state.__minsePendingScroll) {
      const win = contents?.window;
      const target = state.__minsePendingScroll;
      state.__minsePendingScroll = null;

      if (win) {
        setTimeout(() => {
          if (target === "bottom") {
            const doc = win.document;
            const scrollHeight = Math.max(doc?.documentElement?.scrollHeight || 0, doc?.body?.scrollHeight || 0);
            win.scrollTo(0, scrollHeight);
          } else if (target === "top") {
            win.scrollTo(0, 0);
          }
        }, 20);
      }
    }

    render();
  });
}

function getImageSource(img) {
  const rawSource = img?.currentSrc || img?.src || img?.getAttribute?.("src") || "";

  if (!rawSource) {
    return "";
  }

  try {
    return new URL(rawSource, img.ownerDocument?.baseURI || window.location.href).toString();
  } catch {
    return rawSource;
  }
}

function openImagePreview(img) {
  const src = getImageSource(img);

  if (!src) {
    return;
  }

  const alt = img.getAttribute?.("alt") || "";
  const title = alt || state.book.title || "Image";
  const payload = {
    src,
    alt,
    title
  };

  if (window.minseDesktop?.openImageWindow) {
    window.minseDesktop.openImageWindow(payload).catch((error) => {
      logClient("epub.image.open.failed", {
        error: formatError(error)
      });
    });
    return;
  }

  window.open(src, "_blank", "noopener,noreferrer");
}

function installContentImageHandler(contents) {
  const document = contents?.document;

  if (!document || document.__minseImageHandlerInstalled) {
    return;
  }

  document.__minseImageHandlerInstalled = true;
  document.addEventListener("click", (event) => {
    const img = event.target?.closest?.("img");

    if (!img) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openImagePreview(img);
  });
}

async function destroyEpub() {
  if (state.rendition) {
    state.rendition.destroy();
  }

  if (state.epubBook) {
    state.epubBook.destroy();
  }

  state.rendition = null;
  state.epubBook = null;
  state.renditionEventsInstalled = false;
  state.progressLabel = "";
  state.publicationLayoutMode = "reflowable";
  state.toc = [];
  state.currentHref = "";
  state.selectedRange = "";
  state.selectedQuote = "";
  state.editingNoteId = "";
  state.contentSamples = new Map();
  state.contentWarning = "";
  state.searchResults = [];
  state.searchHighlightRanges = [];
  state.activeSearchResultIndex = -1;
  state.searchStatus = "";
  state.searching = false;
}

function showReaderMessage(message) {
  elements.reader.classList.remove("epub-loaded");
  elements.reader.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  elements.reader.appendChild(paragraph);
}

function showFileOpenProblem(fileLike, error) {
  const message = error?.message || "Could not open this EPUB.";

  showReaderMessage(message);
  state.bookMeta = fileLike?.name
    ? `${fileLike.name} - ${message}`
    : message;
  elements.bookMeta.textContent = state.bookMeta;
  logClient("epub.file.rejected", {
    name: fileLike?.name || "",
    size: fileLike?.size || 0,
    type: fileLike?.type || "",
    code: error?.code || "unknown",
    message
  });
}

function getContentSampleKey(contents) {
  return contents?.cfiBase || contents?.sectionIndex || contents?.document?.URL || String(state.contentSamples.size);
}

function sampleRenderedContent(contents) {
  const body = contents?.document?.body;

  if (!body) {
    return;
  }

  const sample = createEpubContentSample({
    text: body.innerText || body.textContent || "",
    imageCount: body.querySelectorAll("img, svg, picture, figure").length,
    mediaCount: body.querySelectorAll("video, audio, canvas").length,
    spineItemCount: 1
  });

  state.contentSamples.set(getContentSampleKey(contents), sample);
}

function updateContentDiagnostics() {
  const summary = summarizeEpubContent([...state.contentSamples.values()]);
  const warning = summary.warnings[0] || null;

  state.contentWarning = warning?.message || "";

  if (warning) {
    logClient("epub.content.warning", {
      code: warning.code,
      textLength: summary.textLength,
      imageCount: summary.imageCount,
      mediaCount: summary.mediaCount,
      visualRatio: summary.visualRatio
    });
  }
}

function isEpubCfi(location) {
  return typeof location === "string" && location.startsWith("epubcfi(");
}

function getRenditionLocation() {
  const location = state.rendition?.currentLocation?.();

  return location && typeof location.then !== "function" ? location : null;
}

function syncRenditionLocation(location = getRenditionLocation()) {
  const cfi = location?.start?.cfi;

  if (!cfi) {
    return false;
  }

  state.currentHref = location?.start?.href || state.currentHref || "";
  state.book = updateLastLocation(state.book, cfi);

  const percentage = state.epubBook?.locations?.percentageFromCfi?.(cfi);
  state.progressLabel = Number.isFinite(percentage)
    ? `${Math.max(1, Math.round(percentage * 100))}%`
    : state.progressLabel || "EPUB";

  persistBook();
  return true;
}

async function openEpub(file, arrayBuffer) {
  try {
    logClient("epub.open.start", {
      name: file.name,
      size: file.size,
      hasEpubGlobal: typeof window.ePub === "function",
      hasJsZipGlobal: typeof window.JSZip === "function",
      savedLocation: state.book.lastLocation || ""
    });

    await destroyEpub();
    showReaderMessage("Opening EPUB...");
    elements.reader.classList.add("epub-loaded");
    elements.reader.replaceChildren();

    if (typeof window.ePub !== "function") {
      throw new Error("epubjs was not loaded");
    }

    if (typeof window.JSZip !== "function") {
      throw new Error("JSZip was not loaded");
    }

    state.epubBook = window.ePub(arrayBuffer.slice(0));
    logClient("epub.book.created", {
      name: file.name
    });

    createRendition();
    logClient("epub.rendition.created", {
      name: file.name
    });

    await state.epubBook.ready;
    state.publicationLayoutMode = getPublicationLayoutMode(state.epubBook);
    applyRenditionSettings();
    logClient("epub.book.ready", {
      name: file.name,
      publicationLayoutMode: state.publicationLayoutMode
    });

    const metadata = await state.epubBook.loaded.metadata.catch(() => null);
    if (metadata?.title) {
      state.book = {
        ...state.book,
        title: metadata.title
      };
      persistBook();
    }

    const navigation = await state.epubBook.loaded.navigation.catch(() => null);
    state.toc = Array.isArray(navigation?.toc) ? navigation.toc : [];
    logClient("epub.navigation.loaded", {
      name: file.name,
      itemCount: state.toc.length
    });
    render();

    await state.rendition.display(isEpubCfi(state.book.lastLocation) ? state.book.lastLocation : undefined);
    applyStoredAnnotations();
    applySearchHighlights();
    logClient("epub.display.done", {
      name: file.name
    });

    state.epubBook.locations.generate(1000).then(() => {
      logClient("epub.locations.done", {
        name: file.name
      });
      render();
    }).catch((error) => {
      logClient("epub.locations.failed", {
        name: file.name,
        error: formatError(error)
      });
      console.warn("EPUB progress generation failed", error);
    });
  } catch (error) {
    const failure = describeEpubOpenFailure(error);

    state.rendition = null;
    state.epubBook = null;
    state.renditionEventsInstalled = false;
    state.toc = [];
    state.currentHref = "";
    state.selectedRange = "";
    state.selectedQuote = "";
    state.editingNoteId = "";
    state.contentSamples = new Map();
    state.contentWarning = "";
    state.searchResults = [];
    state.searchHighlightRanges = [];
    state.activeSearchResultIndex = -1;
    state.searchStatus = "";
    state.searching = false;
    showReaderMessage(failure.message);
    state.bookMeta = `${file.name} - ${failure.message}`;
    elements.bookMeta.textContent = state.bookMeta;
    logClient("epub.open.failed", {
      name: file.name,
      size: file.size,
      code: failure.code,
      message: failure.message,
      error: formatError(error)
    });
    console.error(error);
  }
}

function setPage(nextPage) {
  state.page = Math.min(state.pageCount, Math.max(1, nextPage));
  state.book = updateLastLocation(state.book, `page-${state.page}`);
  persistBook();
  render();
}

async function goToBookmark(bookmark) {
  if (state.rendition && isEpubCfi(bookmark.location)) {
    await state.rendition.display(bookmark.location);
    syncRenditionLocation();
    render();
    return;
  }

  const page = Number(bookmark.location.replace("page-", ""));
  if (Number.isFinite(page)) {
    setPage(page);
  }
}

async function goToTocItem(item) {
  if (!state.rendition || !item?.href) {
    return;
  }

  await state.rendition.display(item.href);
  syncRenditionLocation();
  render();
}

async function goPrevious() {
  if (state.rendition) {
    const settings = mergeReadingSettings(state.book.settings, {});
    // Signal to land at bottom only in paginated mode when navigating back
    if (settings.viewMode === "paginated" && !isPrePaginatedMode()) {
      state.__minsePendingScroll = "bottom";
    }
    await state.rendition.prev();
    syncRenditionLocation();
    render();
    return;
  }

  setPage(state.page - 1);
}

async function goNext() {
  if (state.rendition) {
    const settings = mergeReadingSettings(state.book.settings, {});
    // Signal to land at top in paginated mode
    if (settings.viewMode === "paginated" && !isPrePaginatedMode()) {
      state.__minsePendingScroll = "top";
    }
    await state.rendition.next();
    syncRenditionLocation();
    render();
    return;
  }

  setPage(state.page + 1);
}

function handleWheelEvent(event) {
  const intent = getWheelIntent(event);

  if (intent.type === "none") {
    return;
  }

  if (intent.type === "zoom") {
    event.preventDefault();
    event.stopPropagation();
    state.book = {
      ...state.book,
      settings: applyZoomIntent(state.book.settings, intent)
    };
    persistBook();
    applyRenditionSettings();
    if (state.rendition) {
      state.rendition.display(isEpubCfi(state.book.lastLocation) ? state.book.lastLocation : undefined);
    }
    render();
    return;
  }

  const settings = mergeReadingSettings(state.book.settings, {});

  if (state.rendition && settings.viewMode === "continuous") {
    if (event.currentTarget !== elements.reader) {
      const scroller = getContinuousScrollElement();
      if (scroller) {
        event.preventDefault();
        event.stopPropagation();
        scroller.scrollBy({
          top: event.deltaY,
          left: event.deltaX,
          behavior: "auto"
        });
      }
    }
    return;
  }

  // Paginated mode: one wheel gesture turns one page, matching common EPUB readers.
  event.preventDefault();
  event.stopPropagation();

  if (!wheelNavLock) {
    wheelNavLock = true;
    // Longer lock for paginated mode to avoid rapid page jumping.
    setTimeout(() => { wheelNavLock = false; }, 1000);

    if (intent.direction === "next") {
      goNext();
    } else {
      goPrevious();
    }
  }
}

function handleMarkdownWheelEvent(event) {
  if (!event.ctrlKey) {
    return;
  }

  handleWheelEvent(event);
}

function getContinuousScrollElement() {
  const candidates = [
    elements.reader,
    state.rendition?.manager?.container
  ];

  return candidates.find((element) => (
    element &&
    element.scrollHeight > element.clientHeight + 2
  )) || elements.reader;
}

function installContentWheelHandler(contents) {
  const win = contents?.window;

  if (!win || win.__minseWheelHandlerInstalled) {
    return;
  }

  win.__minseWheelHandlerInstalled = true;
  win.addEventListener("wheel", handleWheelEvent, { passive: false });
}

async function rebuildRenditionForViewMode() {
  if (!state.epubBook || !state.rendition) {
    return;
  }

  syncRenditionLocation();
  const location = isEpubCfi(state.book.lastLocation) ? state.book.lastLocation : undefined;

  state.rendition.destroy();
  state.rendition = null;
  state.renditionEventsInstalled = false;
  elements.reader.replaceChildren();
  elements.reader.classList.add("epub-loaded");
  createRendition();
  await state.rendition.display(location);
  applyStoredAnnotations();
  applySearchHighlights();
}

async function updateSettings(patch) {
  const previousSettings = mergeReadingSettings(state.book.settings, {});
  const currentLocation = getRenditionLocation();
  const preservedLocation = isEpubCfi(currentLocation?.start?.cfi)
    ? currentLocation.start.cfi
    : isEpubCfi(state.book.lastLocation)
      ? state.book.lastLocation
      : undefined;
  const shouldRefreshLayout = [
    "fontSize",
    "lineHeight",
    "margin",
    "zoom",
    "fontFamily",
    "textOnly",
    "keepCaptionsInTextOnly",
    "hideCoverInTextOnly"
  ].some((key) => Object.hasOwn(patch, key));

  state.book = updateBookSettings(state.book, patch);
  if (preservedLocation && shouldRefreshLayout) {
    state.book = updateLastLocation(state.book, preservedLocation);
  }
  persistBook();

  if (state.rendition && patch.viewMode && patch.viewMode !== previousSettings.viewMode) {
    await rebuildRenditionForViewMode();
  } else {
    applyRenditionSettings();
    if (state.rendition) {
      state.rendition.display(preservedLocation || (isEpubCfi(state.book.lastLocation) ? state.book.lastLocation : undefined));
    }
  }

  render();

  if (state.rendition && shouldRefreshLayout) {
    refreshRenditionLayout(preservedLocation);
  }
}

function refreshRenditionLayout(targetLocation) {
  if (!state.rendition) {
    return;
  }

  const location = isEpubCfi(targetLocation) ? targetLocation : undefined;
  if (!location) {
    syncRenditionLocation();
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      refreshRenditionAtCurrentSize(location);
    });
  });
}

function refreshRenditionAtCurrentSize(targetLocation) {
  if (!state.rendition) {
    return;
  }

  const width = Math.floor(elements.reader.clientWidth || 0);
  const height = Math.floor(elements.reader.clientHeight || 0);
  const location = isEpubCfi(targetLocation)
    ? targetLocation
    : isEpubCfi(state.book.lastLocation)
      ? state.book.lastLocation
      : undefined;

  try {
    const settings = mergeReadingSettings(state.book.settings, {});
    if (state.rendition.manager?.settings) {
      state.rendition.manager.settings.gap = getRenditionGap(settings);
    }

    if (width > 0 && height > 0 && typeof state.rendition.resize === "function") {
      state.rendition.resize(width, height, location);
    } else if (state.rendition.manager?.updateLayout) {
      state.rendition.manager.updateLayout();
    }

    const displayPromise = state.rendition.display(location);

    if (displayPromise?.catch) {
      displayPromise.catch((error) => {
        logClient("epub.layout.refresh.failed", {
          error: formatError(error)
        });
      });
    }
  } catch (error) {
    logClient("epub.layout.refresh.failed", {
      error: formatError(error)
    });
  }
}

function refreshRenditionLayoutSoon(targetLocation) {
  refreshRenditionLayout(targetLocation);
  setTimeout(() => {
    refreshRenditionAtCurrentSize(targetLocation);
  }, 80);
}

function applyPanelState({ persist = true, refresh = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", state.ui.leftPanelCollapsed);
  document.body.classList.toggle("settings-collapsed", state.ui.rightPanelCollapsed);

  elements.leftPanelToggle.classList.toggle("is-active", !state.ui.leftPanelCollapsed);
  elements.rightPanelToggle.classList.toggle("is-active", !state.ui.rightPanelCollapsed);
  elements.leftPanelToggle.setAttribute("aria-pressed", String(!state.ui.leftPanelCollapsed));
  elements.rightPanelToggle.setAttribute("aria-pressed", String(!state.ui.rightPanelCollapsed));

  if (persist) {
    saveUiState(state.ui);
  }

  if (refresh) {
    refreshRenditionLayoutSoon();
  }
}

function togglePanel(panel) {
  if (panel === "left") {
    state.ui = {
      ...state.ui,
      leftPanelCollapsed: !state.ui.leftPanelCollapsed
    };
  }

  if (panel === "right") {
    state.ui = {
      ...state.ui,
      rightPanelCollapsed: !state.ui.rightPanelCollapsed
    };
  }

  applyPanelState();
}

function renderBookmarks() {
  if (state.mode === "markdown") {
    const annotations = getCurrentMarkdownAnnotations();
    elements.markdownHighlights.hidden = false;
    if (!annotations.bookmarks.length) {
      elements.bookmarkList.className = "empty";
      elements.bookmarkList.textContent = "북마크가 없습니다.";
    } else {
      elements.bookmarkList.className = "";
      elements.bookmarkList.replaceChildren(...annotations.bookmarks.map((bookmark) => {
        const button = document.createElement("button");
        button.className = "list-item";
        button.type = "button";
        button.textContent = bookmark.label || `${bookmark.line}번 줄`;
        button.addEventListener("click", () => goToMarkdownLine(bookmark.line));
        return button;
      }));
    }
    renderMarkdownHighlights(annotations.highlights);
    return;
  }
  elements.markdownHighlights.hidden = true;
  const bookmarks = state.book.bookmarks;

  if (!bookmarks.length) {
    elements.bookmarkList.className = "empty";
    elements.bookmarkList.textContent = "No bookmarks yet.";
    return;
  }

  elements.bookmarkList.className = "";
  elements.bookmarkList.replaceChildren(
    ...bookmarks.map((bookmark) => {
      const button = document.createElement("button");
      button.className = "list-item";
      button.type = "button";
      button.textContent = bookmark.label || bookmark.location;
      button.addEventListener("click", () => {
        goToBookmark(bookmark);
      });
      return button;
    })
  );
}

function renderMarkdownHighlights(highlights) {
  if (!highlights.length) {
    elements.markdownHighlightList.className = "empty";
    elements.markdownHighlightList.textContent = "형광펜이 없습니다.";
    return;
  }
  elements.markdownHighlightList.className = "";
  elements.markdownHighlightList.replaceChildren(...highlights.map((highlight) => {
    const item = document.createElement("div");
    item.className = "list-item markdown-highlight-item";
    const quote = document.createElement("button");
    quote.className = "annotation-quote";
    quote.type = "button";
    quote.textContent = highlight.quote;
    quote.addEventListener("click", () => goToMarkdownLine(highlight.startLine));
    const meta = document.createElement("small");
    meta.textContent = `${highlight.startLine}${highlight.endLine !== highlight.startLine ? `–${highlight.endLine}` : ""}번 줄`;
    const remove = document.createElement("button");
    remove.className = "annotation-remove";
    remove.type = "button";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => {
      const annotations = getCurrentMarkdownAnnotations();
      saveCurrentMarkdownAnnotations({ ...annotations, highlights: annotations.highlights.filter((entry) => entry.id !== highlight.id) });
      showMarkdownViewMode();
      render();
    });
    item.replaceChildren(quote, meta, remove);
    return item;
  }));
}

function addCurrentHighlight(style = elements.highlightColor.value) {
  if (state.mode === "markdown") {
    if (!state.markdownSelection) return;
    const annotations = getCurrentMarkdownAnnotations();
    const highlight = createMarkdownHighlight({ ...state.markdownSelection, color: style });
    saveCurrentMarkdownAnnotations({ ...annotations, highlights: [...annotations.highlights, highlight] });
    state.markdownSelection = null;
    hideSelectionToolbar();
    showMarkdownViewMode();
    render();
    return;
  }
  if (!state.selectedRange || !state.selectedQuote) {
    return;
  }

  const highlight = createHighlight({
    bookId: state.book.bookId,
    location: state.selectedRange,
    range: state.selectedRange,
    quote: state.selectedQuote,
    color: style
  });

  state.book = {
    ...state.book,
    highlights: [...state.book.highlights, highlight]
  };
  persistBook();

  if (state.rendition) {
    state.rendition.annotations.highlight(
      highlight.range,
      { id: highlight.id },
      null,
      "minse-highlight",
      getHighlightStyle(highlight.color)
    );
  }

  hideSelectionToolbar();
  render();
}

function addCurrentNote() {
  if (!state.selectedRange || !state.selectedQuote || !elements.noteBody.value.trim()) {
    return;
  }

  const note = createTextNote({
    bookId: state.book.bookId,
    location: state.selectedRange,
    range: state.selectedRange,
    quote: state.selectedQuote,
    body: elements.noteBody.value
  });

  state.book = {
    ...state.book,
    notes: [...state.book.notes, note]
  };
  elements.noteBody.value = "";
  persistBook();

  if (state.rendition) {
    state.rendition.annotations.highlight(
      note.range,
      { id: note.id },
      null,
      "minse-note-highlight",
      getHighlightStyle("blue")
    );
  }

  render();
}

async function goToAnnotation(annotation) {
  if (state.rendition && isEpubCfi(annotation.range)) {
    await state.rendition.display(annotation.range);
    syncRenditionLocation();
    render();
  }
}

async function goToSearchResult(result) {
  if (state.rendition && isEpubCfi(result.cfi)) {
    await state.rendition.display(result.cfi);
    syncRenditionLocation();
    render();
  }
}

async function activateSearchResult(index) {
  if (!state.searchResults.length) {
    state.activeSearchResultIndex = -1;
    render();
    return;
  }

  const boundedIndex = Math.min(state.searchResults.length - 1, Math.max(0, index));
  const result = state.searchResults[boundedIndex];

  state.activeSearchResultIndex = boundedIndex;
  applySearchHighlights();
  setSidebarTab("search");
  render();
  await goToSearchResult(result);
}

async function moveSearchResult(direction) {
  const nextIndex = getSearchNavigationIndex(
    state.activeSearchResultIndex,
    state.searchResults.length,
    direction
  );

  if (nextIndex < 0) {
    return;
  }

  await activateSearchResult(nextIndex);
}

function getTocLabelByHref(href) {
  const normalizedHref = String(href || "").split("#")[0];
  const match = flattenToc(state.toc).find(({ item }) => (
    normalizedHref && String(item.href || "").split("#")[0] === normalizedHref
  ));

  return match?.item?.label || normalizedHref || "Search result";
}

async function searchSection(section, query, indexOffset) {
  const wasLoaded = Boolean(section.contents);
  await section.load(state.epubBook.load.bind(state.epubBook));
  const matches = typeof section.search === "function" ? section.search(query) : section.find(query);

  if (!wasLoaded && typeof section.unload === "function") {
    section.unload();
  }

  return matches.map((match, index) => createSearchResult({
    id: `${section.href || section.index}-${indexOffset + index}`,
    cfi: match.cfi,
    excerpt: match.excerpt,
    href: section.href,
    label: getTocLabelByHref(section.href),
    index: indexOffset + index
  }));
}

async function searchBook(query) {
  const normalizedQuery = normalizeSearchQuery(query);

  state.searchQuery = normalizedQuery;
  state.searchResults = [];
  state.activeSearchResultIndex = -1;
  clearSearchHighlights();

  if (!state.epubBook || !state.rendition) {
    state.searchStatus = "Open an EPUB to search.";
    renderSearch();
    return;
  }

  if (!canSearch(normalizedQuery)) {
    state.searchStatus = "Enter at least 2 characters.";
    renderSearch();
    return;
  }

  state.searching = true;
  state.searchStatus = "Searching...";
  renderSearch();

  try {
    const sections = state.epubBook.spine?.spineItems || [];
    let results = [];

    for (const section of sections) {
      if (results.length >= 50) {
        break;
      }

      if (!section.linear) {
        continue;
      }

      const matches = await searchSection(section, normalizedQuery, results.length);
      results = limitSearchResults([...results, ...matches]);
    }

    state.searchResults = results;
    state.activeSearchResultIndex = results.length ? 0 : -1;
    applySearchHighlights();
    state.searchStatus = results.length
      ? `${results.length} result${results.length === 1 ? "" : "s"}`
      : "No results.";
    logClient("epub.search.done", {
      queryLength: normalizedQuery.length,
      results: results.length
    });
  } catch (error) {
    state.searchResults = [];
    state.searchStatus = "Search failed for this EPUB.";
    logClient("epub.search.failed", {
      queryLength: normalizedQuery.length,
      error: formatError(error)
    });
  } finally {
    state.searching = false;
    renderSearch();
  }
}

function removeAnnotation(annotation) {
  if (annotation.type === "highlight") {
    state.book = {
      ...state.book,
      highlights: state.book.highlights.filter((item) => item.id !== annotation.id)
    };
  }

  if (annotation.type === "note") {
    state.book = {
      ...state.book,
      notes: state.book.notes.filter((item) => item.id !== annotation.id)
    };
  }

  if (state.rendition && isEpubCfi(annotation.range)) {
    state.rendition.annotations.remove(annotation.range, "highlight");
    applyStoredAnnotations();
  }

  persistBook();
  render();
}

function startEditingNote(note) {
  state.editingNoteId = note.id;
  render();
}

function cancelEditingNote() {
  state.editingNoteId = "";
  render();
}

function saveEditedNote(note, textarea) {
  const nextBody = textarea.value.trim();

  if (!nextBody) {
    textarea.focus();
    return;
  }

  const updatedNote = updateTextNoteBody(note, nextBody);

  state.book = {
    ...state.book,
    notes: state.book.notes.map((item) => (
      item.id === note.id ? updatedNote : item
    ))
  };
  state.editingNoteId = "";
  persistBook();
  render();
}

function createExportFileName(book) {
  const base = (book.title || "annotations")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "annotations";

  return `${base}-annotations.json`;
}

function downloadTextFile({ content, fileName, type }) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getMarkdownContent() {
  if (state.markdownEditor) {
    return state.markdownEditor.getMarkdown();
  }

  return state.markdown.content;
}

function updateMarkdownDocumentState() {
  const content = getMarkdownContent();
  state.markdown.content = content;
  state.markdown.dirty = content !== state.markdown.savedContent;
  snapshotActiveTab();
  renderMarkdownChrome();
  renderDocumentTabs();
}

function getMarkdownAnnotationKey() {
  const tab = getActiveTab();
  return tab ? `markdown:${(tab.path || tab.title).toLowerCase()}` : "";
}

function getCurrentMarkdownAnnotations() {
  return getMarkdownDocumentAnnotations(state.markdownAnnotations, getMarkdownAnnotationKey());
}

function saveCurrentMarkdownAnnotations(annotations) {
  const key = getMarkdownAnnotationKey();
  if (!key) return;
  state.markdownAnnotations = updateMarkdownDocumentAnnotations(state.markdownAnnotations, key, annotations);
  localStorage.setItem(MARKDOWN_ANNOTATIONS_KEY, JSON.stringify(state.markdownAnnotations));
}

function moveMarkdownAnnotations(previousKey, nextKey) {
  if (!previousKey || !nextKey || previousKey === nextKey) return;
  const annotations = getMarkdownDocumentAnnotations(state.markdownAnnotations, previousKey);
  if (!annotations.bookmarks.length && !annotations.highlights.length) return;
  const documents = { ...state.markdownAnnotations.documents };
  delete documents[previousKey];
  state.markdownAnnotations = updateMarkdownDocumentAnnotations({ ...state.markdownAnnotations, documents }, nextKey, annotations);
  localStorage.setItem(MARKDOWN_ANNOTATIONS_KEY, JSON.stringify(state.markdownAnnotations));
}

function normalizeMarkdownLine(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[\s#>*+`~-]+|[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mapMarkdownBlocksToLines() {
  const root = elements.markdownViewer.querySelector(".toastui-editor-contents");
  if (!root) return;
  const lines = state.markdown.content.split("\n");
  let cursor = 0;
  const blocks = root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre,blockquote");
  for (const block of blocks) {
    const text = normalizeMarkdownLine(block.textContent).slice(0, 48);
    if (!text) continue;
    let found = -1;
    for (let index = cursor; index < lines.length; index += 1) {
      const source = normalizeMarkdownLine(lines[index]);
      if (source && (source.includes(text) || text.includes(source.slice(0, 24)))) {
        found = index;
        break;
      }
    }
    if (found < 0) {
      for (let index = 0; index < lines.length; index += 1) {
        if (normalizeMarkdownLine(lines[index]).includes(text.slice(0, 24))) { found = index; break; }
      }
    }
    if (found >= 0) {
      block.dataset.mdLine = String(found + 1);
      cursor = found;
    }
  }
}

function findMarkdownBlockForLine(line) {
  const blocks = [...elements.markdownViewer.querySelectorAll("[data-md-line]")];
  return blocks.reduce((best, block) => {
    const blockLine = Number(block.dataset.mdLine);
    return blockLine <= line && (!best || blockLine > Number(best.dataset.mdLine)) ? block : best;
  }, null) || blocks.find((block) => Number(block.dataset.mdLine) >= line) || null;
}

function goToMarkdownLine(line) {
  if (state.markdown.viewMode !== "view") showMarkdownViewMode();
  requestAnimationFrame(() => {
    mapMarkdownBlocksToLines();
    const block = findMarkdownBlockForLine(line);
    if (block) {
      const viewerRect = elements.markdownViewer.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const centeredOffset = blockRect.top - viewerRect.top - (elements.markdownViewer.clientHeight - blockRect.height) / 2;
      elements.markdownViewer.scrollTop += centeredOffset;
    } else {
      const max = Math.max(1, state.markdown.content.split("\n").length);
      const scrollRange = Math.max(0, elements.markdownViewer.scrollHeight - elements.markdownViewer.clientHeight);
      elements.markdownViewer.scrollTop = (line - 1) / max * scrollRange;
    }
    state.markdownCurrentLine = line;
    state.markdownScrollTop = elements.markdownViewer.scrollTop;
    render();
  });
}

function wrapMarkdownQuote(quote, color, occurrence = 0) {
  const root = elements.markdownViewer.querySelector(".toastui-editor-contents");
  if (!root || !quote) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let text = "";
  while (walker.nextNode()) {
    nodes.push({ node: walker.currentNode, start: text.length, end: text.length + walker.currentNode.data.length });
    text += walker.currentNode.data;
  }
  let start = -1;
  let cursor = 0;
  for (let count = 0; count <= occurrence; count += 1) {
    start = text.indexOf(quote, cursor);
    if (start < 0) break;
    cursor = start + quote.length;
  }
  if (start < 0) return;
  const end = start + quote.length;
  for (const item of nodes.reverse()) {
    const from = Math.max(0, start - item.start);
    const to = Math.min(item.node.data.length, end - item.start);
    if (from >= to) continue;
    const range = document.createRange();
    range.setStart(item.node, from);
    range.setEnd(item.node, to);
    const mark = document.createElement("mark");
    mark.className = `md-highlight md-highlight-${color}`;
    range.surroundContents(mark);
  }
}

function applyMarkdownHighlights() {
  for (const highlight of getCurrentMarkdownAnnotations().highlights) {
    wrapMarkdownQuote(highlight.quote, highlight.color, highlight.occurrence);
  }
}

function prepareMarkdownViewer(scrollTop = state.markdownScrollTop) {
  mapMarkdownBlocksToLines();
  applyMarkdownHighlights();
  const scrollRange = Math.max(0, elements.markdownViewer.scrollHeight - elements.markdownViewer.clientHeight);
  state.markdownScrollTop = Math.min(Math.max(0, Number(scrollTop) || 0), scrollRange);
  elements.markdownViewer.scrollTop = state.markdownScrollTop;
  updateMarkdownCurrentLine();

  const tab = getActiveTab();
  if (tab?.kind === "markdown" && tab.markdown) {
    tab.markdown.currentLine = state.markdownCurrentLine;
    tab.markdown.scrollTop = state.markdownScrollTop;
  }
}

function updateMarkdownCurrentLine() {
  if (state.mode !== "markdown" || state.markdown.viewMode !== "view") return;
  const viewerRect = elements.markdownViewer.getBoundingClientRect();
  const blocks = [...elements.markdownViewer.querySelectorAll("[data-md-line]")];
  const visible = blocks.find((block) => block.getBoundingClientRect().bottom >= viewerRect.top + 20);
  if (visible) state.markdownCurrentLine = Number(visible.dataset.mdLine) || 1;
}

function rememberMarkdownViewPosition() {
  if (
    state.mode !== "markdown" ||
    state.markdown.viewMode !== "view" ||
    !state.markdownViewer ||
    elements.markdownViewer.hidden ||
    !elements.markdownViewer.querySelector(".toastui-editor-contents")
  ) {
    return;
  }

  updateMarkdownCurrentLine();
  state.markdownScrollTop = elements.markdownViewer.scrollTop;

  const tab = getActiveTab();
  if (tab?.kind === "markdown" && tab.markdown) {
    tab.markdown.currentLine = state.markdownCurrentLine;
    tab.markdown.scrollTop = state.markdownScrollTop;
  }
}

function captureMarkdownSelection() {
  if (state.mode !== "markdown" || state.markdown.viewMode !== "view") return;
  const selection = window.getSelection();
  const quote = selection?.toString?.() || "";
  if (!quote.trim() || !elements.markdownViewer.contains(selection.anchorNode)) {
    state.markdownSelection = null;
    hideSelectionToolbar();
    return;
  }
  const root = elements.markdownViewer.querySelector(".toastui-editor-contents");
  if (!root) return;
  const range = selection.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const prefix = before.toString();
  const occurrence = prefix.split(quote).length - 1;
  const lineRange = lineRangeFromSource(state.markdown.content, quote, occurrence)
    || lineRangeFromSource(state.markdown.content, quote.trim(), occurrence);
  if (!lineRange) return;
  state.markdownSelection = { ...lineRange, quote: quote.trim(), occurrence };
  state.selectedRange = `line-${lineRange.startLine}:${lineRange.endLine}`;
  state.selectedQuote = quote.trim();
  const rect = range.getBoundingClientRect();
  const shell = elements.markdownWorkspace.getBoundingClientRect();
  elements.selectionToolbar.style.left = `${rect.left - shell.left + rect.width / 2}px`;
  elements.selectionToolbar.style.top = `${rect.top - shell.top - 8}px`;
  elements.selectionToolbar.hidden = false;
}

function destroyMarkdownInstances() {
  hideSelectionToolbar();
  state.markdownSelection = null;
  const editor = state.markdownEditor;
  const viewer = state.markdownViewer;
  state.markdownEditor = null;
  state.markdownViewer = null;
  editor?.destroy();
  viewer?.destroy();
  elements.markdownEditor.replaceChildren();
  elements.markdownViewer.replaceChildren();
}

function createMarkdownEditor() {
  const Editor = window.toastui?.Editor;

  if (!Editor) {
    throw new Error("TOAST UI Editor failed to load");
  }

  state.markdownEditor = new Editor({
    el: elements.markdownEditor,
    height: "100%",
    initialEditType: "markdown",
    previewStyle: "vertical",
    initialValue: state.markdown.content,
    language: "ko-KR",
    usageStatistics: false,
    autofocus: false,
    events: {
      change: updateMarkdownDocumentState
    }
  });
}

function activateMarkdownDocument(document, options = {}) {
  destroyMarkdownInstances();

  const content = typeof document.content === "string" ? document.content : "";
  state.mode = "markdown";
  state.markdown = {
    name: document.name || "document.md",
    path: document.path || "",
    content,
    savedContent: typeof options.savedContent === "string" ? options.savedContent : (options.dirty ? "" : content),
    dirty: Boolean(options.dirty),
    viewMode: options.viewMode === "view" ? "view" : "edit",
    saving: false
  };
  state.markdownCurrentLine = Math.max(1, Number(options.currentLine) || 1);
  state.markdownScrollTop = Math.max(0, Number(options.scrollTop) || 0);

  render();
  createMarkdownEditor();
  updateMarkdownDocumentState();
  if (state.markdown.viewMode === "view") showMarkdownViewMode();
}

function confirmDiscardMarkdownChanges() {
  return !state.markdown.dirty || window.confirm("저장하지 않은 Markdown 변경 내용을 버릴까요?");
}

function createTabId() {
  return globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
}

function snapshotActiveTab() {
  const tab = getActiveTab();
  if (!tab) return;

  if (tab.kind === "epub" && state.mode === "epub") {
    syncRenditionLocation();
    return;
  }

  if (tab.kind !== "markdown" || state.mode !== "markdown") return;
  rememberMarkdownViewPosition();
  const content = getMarkdownContent();
  tab.title = state.markdown.name || tab.title;
  tab.path = state.markdown.path || tab.path;
  tab.markdown = {
    ...state.markdown,
    content,
    saving: false,
    currentLine: state.markdownCurrentLine,
    scrollTop: state.markdownScrollTop
  };
}

function renderDocumentTabs() {
  elements.documentTabs.hidden = state.tabs.length === 0;
  elements.documentTabs.replaceChildren(...state.tabs.map((tab) => {
    const item = document.createElement("div");
    item.className = `document-tab${tab.id === state.activeTabId ? " is-active" : ""}`;
    item.setAttribute("role", "tab");

    const label = document.createElement("span");
    const dirty = tab.id === state.activeTabId && state.mode === "markdown" ? state.markdown.dirty : tab.markdown?.dirty;
    label.className = "document-tab-label";
    label.textContent = `${tab.title}${dirty ? " *" : ""}`;
    label.title = tab.path || tab.title;
    label.addEventListener("click", () => void activateDocumentTab(tab.id));

    const detach = document.createElement("button");
    detach.className = "document-tab-action";
    detach.type = "button";
    detach.textContent = "↗";
    detach.title = "새 창에서 열기";
    detach.hidden = !tab.path || Boolean(dirty) || !window.minseDesktop?.openFileInNewWindow;
    detach.addEventListener("click", () => void window.minseDesktop.openFileInNewWindow(tab.path));

    const close = document.createElement("button");
    close.className = "document-tab-action";
    close.type = "button";
    close.textContent = "×";
    close.title = "탭 닫기";
    close.addEventListener("click", () => void closeDocumentTab(tab.id));
    item.replaceChildren(label, detach, close);
    return item;
  }));
}

async function activateDocumentTab(tabId) {
  if (tabId === state.activeTabId) return;
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const sequence = ++state.tabActivationSequence;
  snapshotActiveTab();
  destroyMarkdownInstances();
  await destroyEpub();
  if (sequence !== state.tabActivationSequence) return;
  state.activeTabId = tab.id;
  renderDocumentTabs();

  if (tab.kind === "epub") {
    state.mode = "epub";
    await loadSelectedFile(tab.payload.file);
    if (sequence === state.tabActivationSequence) renderDocumentTabs();
    return;
  }

  activateMarkdownDocument(tab.markdown, {
    savedContent: tab.markdown.savedContent,
    dirty: tab.markdown.dirty,
    viewMode: tab.markdown.viewMode,
    currentLine: tab.markdown.currentLine,
    scrollTop: tab.markdown.scrollTop
  });
  renderDocumentTabs();
}

async function addDocumentTab(payload) {
  if (!payload) return;
  const source = payload.kind === "epub" ? payload.file : payload.document;
  if (!source) return;
  const path = source.path || "";
  const duplicate = path && state.tabs.find((tab) => tab.path.toLowerCase() === path.toLowerCase());
  if (duplicate) {
    await activateDocumentTab(duplicate.id);
    return;
  }
  const tab = {
    id: createTabId(), kind: payload.kind, title: source.name || "문서", path, payload,
    markdown: payload.kind === "markdown" ? {
      name: source.name || "document.md", path, content: source.content || "", savedContent: source.content || "", dirty: false,
      viewMode: source.viewMode === "edit" ? "edit" : "view", saving: false, currentLine: 1, scrollTop: 0
    } : null
  };
  state.tabs.push(tab);
  await activateDocumentTab(tab.id);
}

async function closeDocumentTab(tabId) {
  snapshotActiveTab();
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return;
  const tab = state.tabs[index];
  if (tab.kind === "markdown" && tab.markdown?.dirty) {
    const canClose = tab.id === state.activeTabId
      ? confirmDiscardMarkdownChanges()
      : window.confirm(`${tab.title}의 저장하지 않은 변경 내용을 버릴까요?`);
    if (!canClose) return;
  }
  state.tabs.splice(index, 1);
  if (tab.id !== state.activeTabId) { renderDocumentTabs(); return; }
  state.activeTabId = "";
  destroyMarkdownInstances();
  await destroyEpub();
  const next = state.tabs[Math.min(index, state.tabs.length - 1)];
  if (next) await activateDocumentTab(next.id);
  else {
    state.mode = "epub";
    showReaderMessage("EPUB 또는 Markdown 파일을 열어 주세요.");
    render();
    renderDocumentTabs();
  }
}

function getOpenFileKind(name) {
  const extension = String(name || "").toLowerCase();

  if (extension.endsWith(".epub")) {
    return "epub";
  }

  if (extension.endsWith(".md") || extension.endsWith(".markdown")) {
    return "markdown";
  }

  return null;
}

async function openFilePayload(payload) {
  await addDocumentTab(payload);
}

function getDroppedFilePath(file) {
  try {
    return window.minseDesktop?.getPathForFile?.(file) || "";
  } catch {
    return "";
  }
}

async function openDroppedFile(file) {
  const kind = getOpenFileKind(file?.name);

  if (!kind) {
    window.alert("EPUB 또는 Markdown 파일(.epub, .md, .markdown)만 열 수 있습니다.");
    return;
  }

  try {
    const filePath = getDroppedFilePath(file);

    if (kind === "epub") {
      await addDocumentTab({ kind: "epub", file: {
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type || "application/epub+zip",
        arrayBuffer: () => file.arrayBuffer()
      }});
      return;
    }

    await addDocumentTab({ kind: "markdown", document: {
      name: file.name,
      path: filePath,
      content: await file.text()
    }});
  } catch (error) {
    logClient("file.drop.failed", { error: formatError(error) });
    window.alert(`${file.name} 파일을 열지 못했습니다.\n${error.message || error}`);
  }
}

let hideFileDropOverlayTimer = null;

function showFileDropOverlay(visible) {
  if (hideFileDropOverlayTimer) {
    clearTimeout(hideFileDropOverlayTimer);
    hideFileDropOverlayTimer = null;
  }

  elements.fileDropOverlay.hidden = !visible;
}

function isFileDrag(event) {
  return Array.from(event?.dataTransfer?.types || []).includes("Files");
}

function installFileDropHandlers(target) {
  if (!target || target.__minseFileDropInstalled) {
    return;
  }

  target.__minseFileDropInstalled = true;
  target.addEventListener("dragenter", (event) => {
    if (isFileDrag(event)) {
      event.preventDefault();
      event.stopPropagation();
      showFileDropOverlay(true);
    }
  }, true);
  target.addEventListener("dragover", (event) => {
    if (isFileDrag(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      showFileDropOverlay(true);
    }
  }, true);
  target.addEventListener("dragleave", () => {
    hideFileDropOverlayTimer = setTimeout(() => showFileDropOverlay(false), 80);
  }, true);
  target.addEventListener("drop", (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    showFileDropOverlay(false);
    const files = Array.from(event.dataTransfer?.files || []);
    const supported = files.filter((candidate) => getOpenFileKind(candidate.name));

    if (supported.length) {
      void (async () => { for (const file of supported) await openDroppedFile(file); })();
    } else {
      window.alert("EPUB 또는 Markdown 파일(.epub, .md, .markdown)만 열 수 있습니다.");
    }
  }, true);
}

function showMarkdownEditMode() {
  hideSelectionToolbar();
  state.markdownSelection = null;
  rememberMarkdownViewPosition();
  state.markdown.viewMode = "edit";
  const viewer = state.markdownViewer;
  state.markdownViewer = null;
  viewer?.destroy();
  elements.markdownViewer.replaceChildren();
  renderMarkdownChrome();
  state.markdownEditor?.focus();
}

function showMarkdownViewMode() {
  const Editor = window.toastui?.Editor;
  const content = getMarkdownContent();
  const restoreScrollTop = state.markdownScrollTop;

  state.markdown.content = content;
  state.markdown.viewMode = "view";
  const previousViewer = state.markdownViewer;
  state.markdownViewer = null;
  previousViewer?.destroy();
  elements.markdownViewer.replaceChildren();
  renderMarkdownChrome();

  state.markdownViewer = Editor.factory({
    el: elements.markdownViewer,
    viewer: true,
    initialValue: content,
    usageStatistics: false
  });
  requestAnimationFrame(() => prepareMarkdownViewer(restoreScrollTop));
}

async function saveMarkdown(saveAs = false) {
  if (state.mode !== "markdown" || state.markdown.saving) {
    return;
  }

  const content = getMarkdownContent();
  const previousAnnotationKey = getMarkdownAnnotationKey();
  state.markdown.content = content;
  state.markdown.saving = true;
  renderMarkdownChrome();

  try {
    if (!window.minseDesktop?.saveMarkdownFile) {
      downloadTextFile({
        content,
        fileName: state.markdown.name || "document.md",
        type: "text/markdown;charset=utf-8"
      });
      state.markdown.savedContent = content;
      state.markdown.dirty = false;
      return;
    }

    const result = await window.minseDesktop.saveMarkdownFile({
      content,
      path: state.markdown.path,
      saveAs,
      suggestedName: state.markdown.name || "document.md"
    });

    if (!result) {
      return;
    }

    state.markdown.name = result.name;
    state.markdown.path = result.path;
    state.markdown.savedContent = content;
    state.markdown.dirty = false;
    snapshotActiveTab();
    moveMarkdownAnnotations(previousAnnotationKey, getMarkdownAnnotationKey());
    logClient("markdown.saved", {
      path: result.path,
      characters: content.length
    });
  } catch (error) {
    logClient("markdown.save.failed", { error: formatError(error) });
    window.alert(`Markdown 저장에 실패했습니다.\n${error.message || error}`);
  } finally {
    state.markdown.saving = false;
    renderMarkdownChrome();
  }
}

function closeMarkdown() {
  void closeDocumentTab(state.activeTabId);
}

function exportAnnotations() {
  const exported = createAnnotationExport(state.book);

  downloadTextFile({
    content: JSON.stringify(exported, null, 2),
    fileName: createExportFileName(state.book),
    type: "application/json"
  });

  logClient("annotations.exported", {
    highlights: exported.highlights.length,
    notes: exported.notes.length
  });
}

async function createMarkdownSection(section) {
  const wasLoaded = Boolean(section.contents);

  await section.load(state.epubBook.load.bind(state.epubBook));

  const markdown = documentToMarkdown(section.document, {
    title: getTocLabelByHref(section.href)
  });

  if (!wasLoaded && typeof section.unload === "function") {
    section.unload();
  }

  return markdown;
}

async function exportMarkdown() {
  if (!state.epubBook || state.markdownExporting) {
    return;
  }

  state.markdownExporting = true;
  render();

  try {
    const sections = state.epubBook.spine?.spineItems || [];
    const markdownSections = [];

    for (const section of sections) {
      if (!section.linear) {
        continue;
      }

      const markdown = await createMarkdownSection(section);
      if (markdown) {
        markdownSections.push(markdown);
      }
    }

    const markdown = createMarkdownDocument({
      title: state.book.title,
      sections: markdownSections
    });

    downloadTextFile({
      content: `${markdown}\n`,
      fileName: createMarkdownFileName(state.book.title),
      type: "text/markdown;charset=utf-8"
    });

    logClient("epub.markdown.exported", {
      sections: markdownSections.length,
      characters: markdown.length
    });
    await addDocumentTab({ kind: "markdown", document: {
      name: createMarkdownFileName(state.book.title),
      content: `${markdown}\n`,
      viewMode: "edit"
    }});
    state.markdown.savedContent = "";
    state.markdown.dirty = true;
    snapshotActiveTab();
  } catch (error) {
    logClient("epub.markdown.export.failed", {
      error: formatError(error)
    });
    console.error(error);
  } finally {
    state.markdownExporting = false;
    render();
  }
}

async function readFileArrayBuffer(fileLike) {
  if (fileLike.bytes instanceof ArrayBuffer) {
    return fileLike.bytes;
  }

  if (ArrayBuffer.isView(fileLike.bytes)) {
    return fileLike.bytes.buffer.slice(
      fileLike.bytes.byteOffset,
      fileLike.bytes.byteOffset + fileLike.bytes.byteLength
    );
  }

  if (typeof fileLike.arrayBuffer === "function") {
    return fileLike.arrayBuffer();
  }

  if (typeof fileLike.bytes === "function") {
    const bytes = await fileLike.bytes();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  throw new Error("Unsupported EPUB file payload");
}

async function loadSelectedFile(fileLike) {
  if (!fileLike) {
    logClient("epub.file.empty");
    return;
  }

  logClient("epub.file.selected", {
    name: fileLike.name,
    size: fileLike.size,
    type: fileLike.type,
    source: fileLike.path ? "desktop" : "browser"
  });

  try {
    const arrayBuffer = await readFileArrayBuffer(fileLike);
    const content = new Uint8Array(arrayBuffer);

    assertOpenableEpub(fileLike, content);

    state.book = createBookRecord({
      content,
      title: fileLike.name.replace(/\.epub$/i, ""),
      filePath: fileLike.path || fileLike.name,
      settings: state.book.settings
    });

    const savedBook = getBookRecord(state.library, state.book.bookId);
    if (savedBook) {
      state.book = {
        ...savedBook,
        filePath: fileLike.path || fileLike.name,
        title: state.book.title
      };
    }

    state.page = Number(state.book.lastLocation.replace("page-", "")) || 1;
    state.bookMeta = `${fileLike.name} - ${(fileLike.size / 1024 / 1024).toFixed(2)} MB`;
    persistBook();
    render();
    await openEpub(fileLike, arrayBuffer);
  } catch (error) {
    showFileOpenProblem(fileLike, error);
    console.error(error);
  }
}

function renderAnnotations() {
  const annotations = [
    ...state.book.highlights,
    ...state.book.notes
  ].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  elements.selectionStatus.className = state.selectedRange ? "selection-status" : "empty";
  elements.selectionStatus.textContent = state.selectedRange
    ? `Selected: ${state.selectedQuote.slice(0, 80)}`
    : "Select text in the book.";
  elements.highlightButton.disabled = !state.selectedRange || !state.selectedQuote;
  elements.noteButton.disabled = !state.selectedRange || !state.selectedQuote || !elements.noteBody.value.trim();
  elements.exportAnnotationsButton.disabled = annotations.length === 0;

  if (!annotations.length) {
    elements.annotationList.className = "annotation-list empty";
    elements.annotationList.textContent = "No annotations yet.";
    return;
  }

  elements.annotationList.className = "annotation-list";
  elements.annotationList.replaceChildren(
    ...annotations.map((annotation) => {
      const item = document.createElement("div");
      item.className = "annotation-item";

      const quote = document.createElement("button");
      quote.className = "annotation-quote";
      quote.type = "button";
      quote.textContent = annotation.quote || annotation.range;
      quote.addEventListener("click", () => {
        goToAnnotation(annotation);
      });

      const meta = document.createElement("small");
      meta.textContent = annotation.type === "note"
        ? annotation.body
        : `Highlight - ${annotation.color}`;

      if (annotation.type === "note" && state.editingNoteId === annotation.id) {
        const textarea = document.createElement("textarea");
        textarea.className = "annotation-edit-input";
        textarea.value = annotation.body;
        textarea.rows = 3;

        const actions = document.createElement("div");
        actions.className = "annotation-actions";

        const save = document.createElement("button");
        save.className = "annotation-remove";
        save.type = "button";
        save.textContent = "Save";
        save.addEventListener("click", () => {
          saveEditedNote(annotation, textarea);
        });

        const cancel = document.createElement("button");
        cancel.className = "annotation-remove";
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => {
          cancelEditingNote();
        });

        actions.replaceChildren(save, cancel);
        item.replaceChildren(quote, textarea, actions);
        return item;
      }

      const actions = document.createElement("div");
      actions.className = "annotation-actions";

      if (annotation.type === "note") {
        const edit = document.createElement("button");
        edit.className = "annotation-remove";
        edit.type = "button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => {
          startEditingNote(annotation);
        });
        actions.appendChild(edit);
      }

      const remove = document.createElement("button");
      remove.className = "annotation-remove";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        removeAnnotation(annotation);
      });
      actions.appendChild(remove);

      item.replaceChildren(quote, meta, actions);
      return item;
    })
  );
}

function renderSearch() {
  elements.searchInput.value = state.searchQuery;
  elements.searchButton.disabled = state.searching || !state.rendition;
  elements.searchStatus.className = state.searchResults.length ? "empty search-summary" : "empty";
  elements.searchStatus.textContent = state.searchStatus || (
    state.rendition ? "Enter a search term." : "Open an EPUB to search."
  );

  if (!state.searchResults.length) {
    elements.searchResults.replaceChildren();
    return;
  }

  elements.searchResults.replaceChildren(
    ...state.searchResults.map((result) => {
      const button = document.createElement("button");
      button.className = result.index === state.activeSearchResultIndex
        ? "list-item search-result is-active"
        : "list-item search-result";
      button.type = "button";

      const excerpt = document.createElement("span");
      excerpt.textContent = result.excerpt || result.cfi;

      const label = document.createElement("small");
      label.textContent = result.label;

      button.replaceChildren(excerpt, label);
      button.addEventListener("click", () => {
        activateSearchResult(result.index);
      });

      return button;
    })
  );
}

function setSidebarTab(tab) {
  state.activeSidebarTab = ["toc", "search", "bookmarks"].includes(tab) ? tab : "toc";
  renderSidebarTabs();
}

function renderSidebarTabs() {
  const tabs = {
    toc: {
      tab: elements.tocTab,
      panel: elements.tocPanel
    },
    search: {
      tab: elements.searchTab,
      panel: elements.searchPanel
    },
    bookmarks: {
      tab: elements.bookmarksTab,
      panel: elements.bookmarksPanel
    }
  };

  for (const [name, item] of Object.entries(tabs)) {
    const active = state.activeSidebarTab === name;

    item.tab.classList.toggle("is-active", active);
    item.tab.setAttribute("aria-selected", String(active));
    item.tab.setAttribute("tabindex", active ? "0" : "-1");
    item.panel.hidden = !active;
  }
}

function flattenToc(items, depth = 0) {
  return items.flatMap((item) => [
    { item, depth },
    ...flattenToc(Array.isArray(item.subitems) ? item.subitems : [], depth + 1)
  ]);
}

function renderToc() {
  const items = flattenToc(state.toc);

  if (!items.length) {
    elements.tocList.className = "empty";
    elements.tocList.textContent = state.rendition
      ? "This EPUB has no table of contents."
      : "Open an EPUB to load its contents.";
    return;
  }

  elements.tocList.className = "toc-list";
  elements.tocList.replaceChildren(
    ...items.map(({ item, depth }) => {
      const button = document.createElement("button");
      const href = item.href || "";
      const label = item.label || href || "Untitled";
      button.className = href && state.currentHref && state.currentHref.includes(href.split("#")[0])
        ? "list-item active"
        : "list-item";
      button.type = "button";
      button.style.setProperty("--toc-depth", depth);
      button.textContent = label;
      button.title = label;
      button.disabled = !href;
      button.addEventListener("click", () => {
        goToTocItem(item);
      });
      return button;
    })
  );
}

function render() {
  const settings = mergeReadingSettings(state.book.settings, {});

  elements.bookTitle.textContent = state.book.title;
  if (state.markdownExporting) {
    elements.bookMeta.textContent = "Converting EPUB to Markdown...";
  } else if (state.contentWarning) {
    elements.bookMeta.textContent = state.contentWarning;
  } else {
    elements.bookMeta.textContent = state.bookMeta;
  }
  elements.pageLabel.textContent = state.rendition
    ? state.progressLabel || "EPUB"
    : `${state.page} / ${state.pageCount}`;
  elements.locationLabel.textContent = state.rendition
    ? state.progressLabel || "Saved"
    : state.book.lastLocation || "page-1";
  elements.zoomLabel.textContent = `${Math.round(settings.zoom * 100)}%`;

  elements.fontFamily.value = settings.fontFamily;
  elements.fontSize.value = String(settings.fontSize);
  elements.lineHeight.value = String(settings.lineHeight);
  elements.margin.value = String(settings.margin);
  elements.theme.value = settings.theme;
  elements.textOnly.checked = settings.textOnly;
  const fontStatus = getFontStatus(settings);
  elements.fontStatus.textContent = fontStatus.message;
  elements.fontStatus.classList.toggle("is-warning", fontStatus.warning);

  elements.reader.style.setProperty("--reader-font", getReaderFont(settings) || "system-ui");
  elements.reader.style.setProperty("--reader-font-size", getZoomedFontSize(settings));
  elements.reader.style.setProperty("--reader-line-height", settings.lineHeight);
  elements.reader.style.setProperty("--reader-margin", settings.margin);
  elements.markdownWorkspace.style.setProperty("--markdown-zoom", settings.zoom);

  elements.reader.classList.toggle("reader-continuous", settings.viewMode === "continuous");
  elements.reader.classList.toggle("reader-paginated", settings.viewMode === "paginated");
  elements.prevButton.disabled = !state.rendition && state.page <= 1;
  elements.nextButton.disabled = !state.rendition && state.page >= state.pageCount;
  elements.bookmarkButton.classList.toggle("is-active", hasBookmarkAtCurrentLocation());
  elements.bookmarkButton.setAttribute("aria-pressed", String(hasBookmarkAtCurrentLocation()));
  elements.prevSearchResultButton.disabled = !state.searchResults.length || state.searching;
  elements.nextSearchResultButton.disabled = !state.searchResults.length || state.searching;
  elements.exportMarkdownButton.disabled = !state.epubBook || state.markdownExporting;
  elements.exportMarkdownButton.textContent = state.markdownExporting ? "변환 중..." : "md 파일 변환";
  elements.paginatedModeButton.classList.toggle("is-active", settings.viewMode === "paginated");
  elements.continuousModeButton.classList.toggle("is-active", settings.viewMode === "continuous");
  elements.textOnlyToolbarButton.classList.toggle("is-active", settings.textOnly);
  elements.paginatedModeButton.setAttribute("aria-pressed", String(settings.viewMode === "paginated"));
  elements.continuousModeButton.setAttribute("aria-pressed", String(settings.viewMode === "continuous"));
  elements.textOnlyToolbarButton.setAttribute("aria-pressed", String(settings.textOnly));

  document.body.classList.toggle("theme-dark", settings.theme === "dark");
  document.body.classList.toggle("theme-sepia", settings.theme === "sepia");
  document.body.classList.toggle("text-only", settings.textOnly);

  renderMarkdownChrome();

  renderBookmarks();
  renderToc();
  renderSearch();
  renderSidebarTabs();
  renderAnnotations();
  renderDocumentTabs();
}

function renderMarkdownChrome() {
  const active = state.mode === "markdown";
  const viewing = state.markdown.viewMode === "view";

  document.body.classList.toggle("markdown-mode", active);
  elements.contentRow.hidden = active;
  elements.markdownWorkspace.hidden = !active;
  elements.markdownActions.hidden = !active;
  elements.markdownEditor.hidden = !active || viewing;
  elements.markdownViewer.hidden = !active || !viewing;

  if (!active) {
    return;
  }

  state.activeSidebarTab = "bookmarks";

  elements.bookTitle.textContent = `${state.markdown.name || "document.md"}${state.markdown.dirty ? " *" : ""}`;
  elements.bookMeta.textContent = state.markdown.saving
    ? "Markdown 저장 중..."
    : state.markdown.path || "아직 저장되지 않은 Markdown 문서";
  elements.markdownEditButton.classList.toggle("is-active", !viewing);
  elements.markdownViewButton.classList.toggle("is-active", viewing);
  elements.saveMarkdownButton.disabled = state.markdown.saving || (!state.markdown.dirty && Boolean(state.markdown.path));
  elements.saveMarkdownAsButton.disabled = state.markdown.saving;
}

elements.bookInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  elements.bookInput.value = "";
  for (const file of files) await addDocumentTab({ kind: "epub", file });
});

elements.openBookButton.addEventListener("click", async (event) => {
  if (!window.minseDesktop?.openEpubFile) {
    return;
  }

  event.preventDefault();
  const file = await window.minseDesktop.openEpubFile();
  if (file) await addDocumentTab({ kind: "epub", file });
});

elements.openMarkdownButton.addEventListener("click", async (event) => {
  if (!window.minseDesktop?.openMarkdownFile) {
    return;
  }

  event.preventDefault();
  try {
    const document = await window.minseDesktop.openMarkdownFile();
    if (document) await addDocumentTab({ kind: "markdown", document });
  } catch (error) {
    logClient("markdown.open.failed", { error: formatError(error) });
    window.alert(`Markdown 파일을 열지 못했습니다.\n${error.message || error}`);
  }
});

elements.newMarkdownButton.addEventListener("click", async () => {
  await addDocumentTab({ kind: "markdown", document: {
    name: "untitled.md",
    content: "# 새 Markdown 문서\n\n",
    viewMode: "edit"
  }});
  state.markdown.savedContent = "";
  state.markdown.dirty = true;
  snapshotActiveTab();
  render();
});

elements.markdownInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  elements.markdownInput.value = "";
  for (const file of files) await addDocumentTab({ kind: "markdown", document: { name: file.name, content: await file.text() } });
});

function closeRecentFilesMenu() {
  elements.recentFilesMenu.hidden = true;
  elements.recentFilesButton.setAttribute("aria-expanded", "false");
}

function positionRecentFilesMenu() {
  if (elements.recentFilesMenu.hidden) return;

  const buttonRect = elements.recentFilesButton.getBoundingClientRect();
  const viewportPadding = 8;
  const menuWidth = Math.min(360, window.innerWidth - viewportPadding * 2);
  const left = Math.max(
    viewportPadding,
    Math.min(buttonRect.left, window.innerWidth - menuWidth - viewportPadding)
  );
  const top = buttonRect.bottom + 8;
  const availableHeight = Math.max(96, window.innerHeight - top - viewportPadding);

  elements.recentFilesMenu.style.left = `${left}px`;
  elements.recentFilesMenu.style.top = `${top}px`;
  elements.recentFilesMenu.style.width = `${menuWidth}px`;
  elements.recentFilesMenu.style.maxHeight = `${availableHeight}px`;
}

async function toggleRecentFilesMenu() {
  if (!elements.recentFilesMenu.hidden) {
    closeRecentFilesMenu();
    return;
  }

  elements.recentFilesMenu.hidden = false;
  elements.recentFilesButton.setAttribute("aria-expanded", "true");
  elements.recentFilesMenu.replaceChildren();
  positionRecentFilesMenu();

  const recent = await window.minseDesktop?.getRecentFiles?.() || [];
  if (elements.recentFilesMenu.hidden) return;

  if (!recent.length) {
    const empty = document.createElement("span");
    empty.className = "recent-file-item";
    empty.setAttribute("role", "status");
    empty.textContent = "최근에 연 파일이 없습니다.";
    elements.recentFilesMenu.replaceChildren(empty);
    positionRecentFilesMenu();
    return;
  }
  elements.recentFilesMenu.replaceChildren(...recent.map((entry) => {
    const button = document.createElement("button");
    button.className = "recent-file-item";
    button.type = "button";
    button.setAttribute("role", "menuitem");
    const name = document.createElement("strong");
    name.textContent = entry.name;
    const location = document.createElement("small");
    location.textContent = entry.path;
    button.replaceChildren(name, location);
    button.addEventListener("click", async () => {
      closeRecentFilesMenu();
      const payload = await window.minseDesktop.openRecentFile(entry.path);
      if (payload) await addDocumentTab(payload);
    });
    return button;
  }));
  positionRecentFilesMenu();
}

elements.recentFilesButton.addEventListener("click", () => void toggleRecentFilesMenu());
document.addEventListener("pointerdown", (event) => {
  if (
    !elements.recentFilesMenu.hidden &&
    !elements.recentFilesMenu.contains(event.target) &&
    !elements.recentFilesButton.contains(event.target)
  ) {
    closeRecentFilesMenu();
  }
});
window.addEventListener("resize", positionRecentFilesMenu);
elements.recentFilesButton.closest(".toolbar-tools")?.addEventListener("scroll", positionRecentFilesMenu, { passive: true });

elements.markdownEditButton.addEventListener("click", showMarkdownEditMode);
elements.markdownViewButton.addEventListener("click", showMarkdownViewMode);
elements.saveMarkdownButton.addEventListener("click", () => saveMarkdown(false));
elements.saveMarkdownAsButton.addEventListener("click", () => saveMarkdown(true));
elements.closeMarkdownButton.addEventListener("click", closeMarkdown);

elements.reader.addEventListener("wheel", handleWheelEvent, { passive: false });
elements.markdownWorkspace.addEventListener("wheel", handleMarkdownWheelEvent, { passive: false });
elements.reader.addEventListener("mousedown", () => {
  hideSelectionToolbar();
});

elements.markdownViewer.addEventListener("mouseup", () => requestAnimationFrame(captureMarkdownSelection));
elements.markdownViewer.addEventListener("mousedown", () => hideSelectionToolbar());
elements.markdownViewer.addEventListener("scroll", () => {
  rememberMarkdownViewPosition();
  const active = hasBookmarkAtCurrentLocation();
  elements.bookmarkButton.classList.toggle("is-active", active);
  elements.bookmarkButton.setAttribute("aria-pressed", String(active));
}, { passive: true });

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setSidebarTab("search");
  searchBook(elements.searchInput.value);
});

elements.tocTab.addEventListener("click", () => {
  setSidebarTab("toc");
});
elements.searchTab.addEventListener("click", () => {
  setSidebarTab("search");
});
elements.bookmarksTab.addEventListener("click", () => {
  setSidebarTab("bookmarks");
});

elements.leftPanelToggle.addEventListener("click", () => {
  togglePanel("left");
});
elements.rightPanelToggle.addEventListener("click", () => {
  togglePanel("right");
});

elements.prevButton.addEventListener("click", () => {
  goPrevious();
});
elements.nextButton.addEventListener("click", () => {
  goNext();
});

elements.bookmarkButton.addEventListener("click", () => {
  if (state.mode === "markdown") {
    updateMarkdownCurrentLine();
    const line = state.markdownSelection?.startLine || state.markdownCurrentLine;
    const annotations = getCurrentMarkdownAnnotations();
    const exists = annotations.bookmarks.some((bookmark) => bookmark.line === line);
    const bookmarks = exists
      ? annotations.bookmarks.filter((bookmark) => bookmark.line !== line)
      : [...annotations.bookmarks, createMarkdownBookmark(line)];
    saveCurrentMarkdownAnnotations({ ...annotations, bookmarks });
    render();
    return;
  }
  const location = getCurrentBookmarkLocation();
  const exists = state.book.bookmarks.some((bookmark) => bookmark.location === location);

  if (exists) {
    state.book = {
      ...state.book,
      bookmarks: state.book.bookmarks.filter((bookmark) => bookmark.location !== location)
    };
  } else {
    state.book = {
      ...state.book,
      bookmarks: [
        ...state.book.bookmarks,
        createBookmark({
          bookId: state.book.bookId,
          location,
          label: state.rendition
            ? `${state.progressLabel || "EPUB"} location`
            : `${state.page} page`
        })
      ]
    };
  }

  persistBook();
  render();
});

elements.prevSearchResultButton.addEventListener("click", () => {
  moveSearchResult("previous");
});
elements.nextSearchResultButton.addEventListener("click", () => {
  moveSearchResult("next");
});

elements.paginatedModeButton.addEventListener("click", () => {
  updateSettings({ viewMode: "paginated" }).catch((error) => {
    logClient("epub.view-mode.failed", {
      viewMode: "paginated",
      error: formatError(error)
    });
  });
});
elements.continuousModeButton.addEventListener("click", () => {
  updateSettings({ viewMode: "continuous" }).catch((error) => {
    logClient("epub.view-mode.failed", {
      viewMode: "continuous",
      error: formatError(error)
    });
  });
});
elements.textOnlyToolbarButton.addEventListener("click", () => {
  const settings = mergeReadingSettings(state.book.settings, {});
  updateSettings({ textOnly: !settings.textOnly });
});
elements.exportMarkdownButton.addEventListener("click", () => {
  exportMarkdown();
});

elements.highlightButton.addEventListener("click", () => {
  addCurrentHighlight();
});
elements.yellowSelectionButton.addEventListener("click", () => {
  addCurrentHighlight("yellow");
});
elements.orangeSelectionButton.addEventListener("click", () => {
  addCurrentHighlight("orange");
});
elements.underlineSelectionButton.addEventListener("click", () => {
  addCurrentHighlight("underline");
});
elements.noteButton.addEventListener("click", () => {
  addCurrentNote();
});
elements.exportAnnotationsButton.addEventListener("click", () => {
  exportAnnotations();
});
elements.noteBody.addEventListener("input", () => {
  renderAnnotations();
});
elements.fontFamily.addEventListener("change", () => {
  updateSettings({ fontFamily: elements.fontFamily.value });
});
elements.fontSize.addEventListener("input", () => {
  updateSettings({ fontSize: Number(elements.fontSize.value) });
});
elements.lineHeight.addEventListener("input", () => {
  updateSettings({ lineHeight: Number(elements.lineHeight.value) });
});
elements.margin.addEventListener("input", () => {
  updateSettings({ margin: Number(elements.margin.value) });
});
elements.theme.addEventListener("change", () => {
  updateSettings({ theme: elements.theme.value });
});
elements.textOnly.addEventListener("change", () => {
  updateSettings({ textOnly: elements.textOnly.checked });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.recentFilesMenu.hidden) {
    closeRecentFilesMenu();
    elements.recentFilesButton.focus();
    return;
  }

  if (state.mode === "markdown" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveMarkdown(false);
    return;
  }

  if (state.mode === "markdown") {
    return;
  }

  if (event.key === "ArrowRight") {
    goNext();
  }

  if (event.key === "ArrowLeft") {
    goPrevious();
  }
});

window.addEventListener("beforeunload", (event) => {
  snapshotActiveTab();
  if (state.tabs.some((tab) => tab.kind === "markdown" && tab.markdown?.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});

installFileDropHandlers(document);
window.minseDesktop?.onOpenFile?.((payload) => {
  void openFilePayload(payload);
});
window.minseDesktop?.onOpenFileError?.((payload) => {
  window.alert(`${payload?.name || "파일"}을 열지 못했습니다.\n${payload?.message || "알 수 없는 오류"}`);
});
window.minseDesktop?.readyForOpenFiles?.();

applyPanelState({ persist: false, refresh: false });
render();
