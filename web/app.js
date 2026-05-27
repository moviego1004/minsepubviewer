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
  library: loadLibrary(),
  book: createBookRecord({
    bookId: "sample-book",
    title: "Minse EPUB Viewer",
    settings: DEFAULT_READING_SETTINGS
  }),
  epubBook: null,
  rendition: null,
  renditionEventsInstalled: false,
  toc: [],
  currentHref: "",
  selectedRange: "",
  selectedQuote: "",
  editingNoteId: "",
  page: 1,
  pageCount: 5,
  progressLabel: "",
  contentSamples: new Map(),
  contentWarning: "",
  searchQuery: "",
  searchResults: [],
  searchHighlightRanges: [],
  activeSearchResultIndex: -1,
  searchStatus: "",
  searching: false,
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
  bookInput: document.querySelector("#bookInput"),
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
    html,
    body {
      min-height: 100% !important;
      box-sizing: border-box !important;
      background-color: ${theme.background} !important;
      color: ${theme.color} !important;
      ${fontCss}
      font-size: ${getZoomedFontSize(settings)}px !important;
      line-height: ${settings.lineHeight} !important;
      margin: 0 !important;
      padding: ${settings.margin}px !important;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box !important;
    }

    ${inheritedFontCss}

    img {
      max-width: 100% !important;
    }

    ${textOnlyCss}
  `;
}

function applyContentSettings(contents) {
  const document = contents?.document;

  if (!document?.head) {
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
}

function applyRenditionSettings() {
  if (!state.rendition) {
    return;
  }

  const settings = mergeReadingSettings(state.book.settings, {});
  if (typeof state.rendition.flow === "function") {
    state.rendition.flow(getRenditionFlow(settings));
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
    const cfi = location?.start?.cfi;
    if (!cfi) {
      return;
    }

    state.currentHref = location?.start?.href || "";
    state.book = updateLastLocation(state.book, cfi);

    const percentage = state.epubBook.locations?.percentageFromCfi?.(cfi);
    state.progressLabel = Number.isFinite(percentage)
      ? `${Math.max(1, Math.round(percentage * 100))}%`
      : "EPUB";

    persistBook();
    render();
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
  elements.bookMeta.textContent = fileLike?.name
    ? `${fileLike.name} - ${message}`
    : message;
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
    logClient("epub.book.ready", {
      name: file.name
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
    elements.bookMeta.textContent = `${file.name} - ${failure.message}`;
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
}

async function goPrevious() {
  if (state.rendition) {
    const settings = mergeReadingSettings(state.book.settings, {});
    // Signal to land at bottom only in paginated mode when navigating back
    if (settings.viewMode === "paginated") {
      state.__minsePendingScroll = "bottom";
    }
    await state.rendition.prev();
    return;
  }

  setPage(state.page - 1);
}

async function goNext() {
  if (state.rendition) {
    const settings = mergeReadingSettings(state.book.settings, {});
    // Signal to land at top in paginated mode
    if (settings.viewMode === "paginated") {
      state.__minsePendingScroll = "top";
    }
    await state.rendition.next();
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

  // Continuous mode: let epub.js handle normal scrolling and section loading.
  if (state.rendition && settings.viewMode === "continuous") {
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

  state.book = updateBookSettings(state.book, patch);
  persistBook();

  if (state.rendition && patch.viewMode && patch.viewMode !== previousSettings.viewMode) {
    await rebuildRenditionForViewMode();
  } else {
    applyRenditionSettings();
    if (state.rendition) {
      state.rendition.display(isEpubCfi(state.book.lastLocation) ? state.book.lastLocation : undefined);
    }
  }

  render();
}

function refreshRenditionLayout() {
  if (!state.rendition) {
    return;
  }

  window.requestAnimationFrame(() => {
    const location = isEpubCfi(state.book.lastLocation) ? state.book.lastLocation : undefined;
    const displayPromise = state.rendition.display(location);

    if (displayPromise?.catch) {
      displayPromise.catch((error) => {
        logClient("epub.layout.refresh.failed", {
          error: formatError(error)
        });
      });
    }
  });
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
    refreshRenditionLayout();
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

function addCurrentHighlight(style = elements.highlightColor.value) {
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
  }
}

async function goToSearchResult(result) {
  if (state.rendition && isEpubCfi(result.cfi)) {
    await state.rendition.display(result.cfi);
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

function exportAnnotations() {
  const exported = createAnnotationExport(state.book);
  const blob = new Blob([JSON.stringify(exported, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = createExportFileName(state.book);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  logClient("annotations.exported", {
    highlights: exported.highlights.length,
    notes: exported.notes.length
  });
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
    elements.bookMeta.textContent = `${fileLike.name} - ${(fileLike.size / 1024 / 1024).toFixed(2)} MB`;
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
  if (state.contentWarning) {
    elements.bookMeta.textContent = state.contentWarning;
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

  elements.reader.classList.toggle("reader-continuous", settings.viewMode === "continuous");
  elements.reader.classList.toggle("reader-paginated", settings.viewMode === "paginated");
  elements.prevButton.disabled = !state.rendition && state.page <= 1;
  elements.nextButton.disabled = !state.rendition && state.page >= state.pageCount;
  elements.bookmarkButton.classList.toggle("is-active", hasBookmarkAtCurrentLocation());
  elements.bookmarkButton.setAttribute("aria-pressed", String(hasBookmarkAtCurrentLocation()));
  elements.prevSearchResultButton.disabled = !state.searchResults.length || state.searching;
  elements.nextSearchResultButton.disabled = !state.searchResults.length || state.searching;
  elements.paginatedModeButton.classList.toggle("is-active", settings.viewMode === "paginated");
  elements.continuousModeButton.classList.toggle("is-active", settings.viewMode === "continuous");
  elements.paginatedModeButton.setAttribute("aria-pressed", String(settings.viewMode === "paginated"));
  elements.continuousModeButton.setAttribute("aria-pressed", String(settings.viewMode === "continuous"));

  document.body.classList.toggle("theme-dark", settings.theme === "dark");
  document.body.classList.toggle("theme-sepia", settings.theme === "sepia");
  document.body.classList.toggle("text-only", settings.textOnly);

  renderBookmarks();
  renderToc();
  renderSearch();
  renderSidebarTabs();
  renderAnnotations();
}

elements.bookInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  await loadSelectedFile(file);
  elements.bookInput.value = "";
});

elements.openBookButton.addEventListener("click", async (event) => {
  if (!window.minseDesktop?.openEpubFile) {
    return;
  }

  event.preventDefault();
  const file = await window.minseDesktop.openEpubFile();
  await loadSelectedFile(file);
});

elements.reader.addEventListener("wheel", handleWheelEvent, { passive: false });
elements.reader.addEventListener("mousedown", () => {
  hideSelectionToolbar();
});

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
  if (event.key === "ArrowRight") {
    goNext();
  }

  if (event.key === "ArrowLeft") {
    goPrevious();
  }
});

applyPanelState({ persist: false, refresh: false });
render();
