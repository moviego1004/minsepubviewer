import { platform, storage } from "../src/platform/index.js";
import { installReaderTouch, createMobileNavigation } from "../src/platform/touch-reader.js";
import { installMobileUI } from "../src/platform/mobile-ui.js";
import { MOBILE_EPUB_MAX_BYTES } from "../src/platform/mobile-files.js";
import {
  createAnnotationExport,
  createBookmark,
  createHighlight,
  createTextNote,
  updateTextNoteBody
} from "../src/core/annotations.js";
import { computeBookId, createBookRecord, updateBookSettings, updateLastLocation } from "../src/core/books.js";
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
  findEmbeddedMarkdownImages,
  insertTextAtMarkdownSelection,
  prefixMarkdownSelectedLines,
  shouldUsePlainTextMarkdownEditor,
  wrapMarkdownTextSelection
} from "../src/core/markdownEditing.js";
import {
  applyZoomIntent,
  getViewportPageState,
  getViewportPageTarget,
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
import {
  errorText,
  getLanguagePreference,
  getLocale,
  initI18n,
  onLanguageChange,
  setLanguagePreference,
  t,
  tOptional
} from "./i18n.js";
import { PdfReader } from "./pdf-reader.js";
import { formatPdfLocation, isPdfLocation, isPdfRange, parsePdfLocation } from "../src/core/pdfLocation.js";
import { DocumentReader } from "./document-reader.js";
import { convertDocument, getDocumentFormat } from "./document-convert.js";
import { isDocLocation, isDocRange, parseDocLocation } from "../src/core/textAnchors.js";

const STORAGE_KEY = "minsepubviewer.library";
const STORAGE_BACKUP_KEY = "minsepubviewer.library.backup";
const UI_STORAGE_KEY = "minsepubviewer.ui";
const MARKDOWN_ANNOTATIONS_KEY = "minsepubviewer.markdown-annotations";

initI18n(storage);
let mobileSessionTimer = null;
let restoringMobileSession = false;
let savingMobileSession = false;
let mobileNavigation = null;
let mobilePageTurning = false;
let mobileUI = null;

async function turnMobilePage(direction) {
  if (mobilePageTurning) return;
  mobilePageTurning = true;
  try { await (direction === "next" ? goNext() : goPrevious()); }
  finally { mobilePageTurning = false; }
}

// Pinch zoom for reflowing text: the view is scaled while the fingers move and the new size is laid out once
// they lift, so the text follows the fingers without re-paginating on every move.
function createPinchPreview({ element, value, min, max, round = (next) => next, commit }) {
  let preview = null;
  const clear = () => {
    if (!preview) return;
    preview.element.style.transform = "";
    preview.element.style.transformOrigin = "";
    preview.element.style.willChange = "";
    if (preview.clip) preview.clip.style.overflow = preview.overflow;
    preview = null;
  };
  return {
    begin(center) {
      clear();
      const target = element();
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const clip = target.parentElement;
      preview = { element: target, clip, overflow: clip?.style.overflow || "", start: value(), next: value() };
      target.style.transformOrigin = `${center.x - rect.left}px ${center.y - rect.top}px`;
      target.style.willChange = "transform";
      if (clip) clip.style.overflow = "hidden";
    },
    move(ratio) {
      if (!preview) return;
      preview.next = Math.min(max, Math.max(min, preview.start * ratio));
      preview.element.style.transform = `scale(${preview.next / preview.start})`;
    },
    async end() {
      if (!preview) return;
      const { start } = preview;
      const next = round(preview.next);
      if (next === start) { clear(); return; }
      try { await commit(next); }
      finally { clear(); }
    }
  };
}

function waitForRelocation(timeout = 800) {
  return new Promise((resolve) => {
    const rendition = state.rendition;
    if (!rendition) { resolve(); return; }
    const done = () => { clearTimeout(timer); rendition.off?.("relocated", done); resolve(); };
    const timer = setTimeout(done, timeout);
    rendition.on("relocated", done);
  });
}

function installMobileTouch(target, frame = null) {
  if (!platform.isMobile) return;
  const markdown = target === elements.markdownWorkspace;
  installReaderTouch(target, {
    viewport: markdown ? elements.markdownWorkspace : elements.reader, frame,
    enabled: () => state.mode === "epub" ? Boolean(state.rendition) : state.markdown.viewMode === "view",
    paginated: () => state.mode === "epub" && state.book.settings.viewMode !== "continuous",
    navigate: turnMobilePage,
    center: () => mobileUI?.center(),
    pinch: createPinchPreview({
      element: () => markdown ? document.querySelector("#markdownViewer") : elements.reader,
      value: () => mergeReadingSettings(state.book.settings, {}).fontSize,
      min: 10,
      max: 42,
      round: Math.round,
      commit: async (size) => {
        const relocated = markdown ? null : waitForRelocation();
        await updateSettings({ fontSize: size });
        await relocated;
      }
    }),
    onError: (error) => window.alert(t("error.pageTurn", { detail: errorText(error) }))
  });
}

function scheduleMobileSessionSave() {
  if (!platform.isMobile || restoringMobileSession || savingMobileSession) return;
  clearTimeout(mobileSessionTimer);
  mobileSessionTimer = setTimeout(() => {
    saveMobileSession();
  }, 600);
}

function saveMobileSession() {
  if (!platform.isMobile || restoringMobileSession) return;
  flushPdfLocation();
  flushDocLocation();
  clearTimeout(mobileSessionTimer);
  savingMobileSession = true;
  try {
    snapshotActiveTab();
    const drafts = [];
    for (const tab of state.tabs) {
      if (!tab.markdown) continue;
      const position = { currentLine: tab.markdown.currentLine, scrollTop: tab.markdown.scrollTop };
      if (tab.path) storage.setItem(`minsepubviewer.position:${tab.path}`, JSON.stringify(position));
      if (tab.markdown.dirty) drafts.push({ ...tab.markdown, ...position });
    }
    storage.setItem("minsepubviewer.markdown-drafts", JSON.stringify(drafts));
  } finally { savingMobileSession = false; }
}

async function restoreMobileSession() {
  if (!platform.isMobile) return;
  restoringMobileSession = true;
  const lastPath = storage.getItem("minsepubviewer.last-document");
  try {
    let drafts = [];
    try { drafts = JSON.parse(storage.getItem("minsepubviewer.markdown-drafts") || "[]"); } catch { /* Preserve other reading data. */ }
    for (const draft of Array.isArray(drafts) ? drafts : []) {
      if (typeof draft?.content !== "string") continue;
      await addDocumentTab({ kind: "markdown", document: { ...draft, viewMode: "view" } });
      const tab = getActiveTab();
      Object.assign(tab.markdown, draft, { viewMode: "view", dirty: true, saving: false });
      activateMarkdownDocument(tab.markdown, { ...tab.markdown, viewMode: "view" });
    }
    if (lastPath) {
      const existing = state.tabs.find((tab) => tab.path === lastPath);
      if (existing) await activateDocumentTab(existing.id);
      else {
        try { await addDocumentTab(await platform.openRecentFile(lastPath)); }
        catch (error) { window.alert(t("error.restoreLast", { detail: errorText(error) })); }
      }
    }
    renderDocumentTabs();
  } finally { restoringMobileSession = false; }
}

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

  platform.log(payload);
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
    storage.getItem(STORAGE_KEY),
    storage.getItem(STORAGE_BACKUP_KEY)
  );

  if (result.recovered) {
    const serialized = serializeLibraryState(result.library);
    storage.setItem(STORAGE_KEY, serialized);
    logClient("library.recovered", {
      source: result.source,
      books: result.library.books.length
    });
  }

  return result.library;
}

function saveLibrary(library) {
  const serialized = serializeLibraryState(library);

  storage.setItem(STORAGE_BACKUP_KEY, serialized);
  storage.setItem(STORAGE_KEY, serialized);
}

function loadUiState() {
  try {
    const parsed = JSON.parse(storage.getItem(UI_STORAGE_KEY) || "{}");

    return {
      leftPanelCollapsed: parsed.leftPanelCollapsed ?? platform.isMobile,
      rightPanelCollapsed: parsed.rightPanelCollapsed ?? platform.isMobile
    };
  } catch {
    return {
      leftPanelCollapsed: platform.isMobile,
      rightPanelCollapsed: platform.isMobile
    };
  }
}

function saveUiState(ui) {
  storage.setItem(UI_STORAGE_KEY, JSON.stringify({
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
    title: "Mins Reader",
    settings: DEFAULT_READING_SETTINGS
  }),
  epubBook: null,
  pdf: null,
  pdfSelection: null,
  pdfMeta: null,
  docReader: null,
  docMeta: null,
  docSelection: null,
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
  bookMeta: "",
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
    saving: false,
    largeDocument: false,
    largeEditMode: "plain",
    largeImagePreview: false
  },
  markdownEditor: null,
  markdownTextEditor: null,
  markdownViewer: null,
  markdownImagePreviewTimer: null,
  markdownAnnotations: parseMarkdownAnnotationState(storage.getItem(MARKDOWN_ANNOTATIONS_KEY)),
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
  openFileButton: document.querySelector("#openFileButton"),
  fileInput: document.querySelector("#fileInput"),
  fileDropOverlay: document.querySelector("#fileDropOverlay"),
  markdownActions: document.querySelector("#markdownActions"),
  markdownEditButton: document.querySelector("#markdownEditButton"),
  markdownViewButton: document.querySelector("#markdownViewButton"),
  markdownLargeModeButton: document.querySelector("#markdownLargeModeButton"),
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
  languageSelect: document.querySelector("#languageSelect"),
  docWorkspace: document.querySelector("#docWorkspace"),
  docFrame: document.querySelector("#docFrame"),
  pdfWorkspace: document.querySelector("#pdfWorkspace"),
  pdfContainer: document.querySelector("#pdfContainer"),
  pdfViewer: document.querySelector("#pdfViewer"),
  pdfActions: document.querySelector("#pdfActions"),
  pdfZoomOutButton: document.querySelector("#pdfZoomOutButton"),
  pdfZoomInButton: document.querySelector("#pdfZoomInButton"),
  pdfZoomSelect: document.querySelector("#pdfZoomSelect"),
  pdfRotateButton: document.querySelector("#pdfRotateButton"),
  pdfSpreadButton: document.querySelector("#pdfSpreadButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
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
  if (state.mode === "pdf" && state.pdf) return formatPdfLocation({ pageNumber: state.pdf.pageNumber });
  if (state.mode === "document" && state.docReader) return state.docReader.currentLocation();
  return state.book.lastLocation || `page-${state.page}`;
}

function hasBookmarkAtCurrentLocation() {
  if (state.mode === "markdown") {
    return getCurrentMarkdownAnnotations().bookmarks.some((bookmark) => bookmark.line === state.markdownCurrentLine);
  }
  if (state.mode === "pdf") {
    const page = state.pdf?.pageNumber;
    return Boolean(page) && state.book.bookmarks.some((bookmark) => parsePdfLocation(bookmark.location)?.pageNumber === page);
  }
  if (state.mode === "document") {
    const page = state.docReader?.pageState.page;
    return Boolean(page) && state.book.bookmarks.some((bookmark) => state.docReader.pageForLocation(bookmark.location) === page);
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
      message: t("fontStatus.original"),
      warning: false
    };
  }

  if (settings.fontFamily === "system") {
    return {
      message: t("fontStatus.system"),
      warning: false
    };
  }

  const fontName = getPrimaryFontName(settings);

  if (!fontName || !document.fonts?.check) {
    return {
      message: t("fontStatus.unknown"),
      warning: false
    };
  }

  const available = document.fonts.check(`16px "${fontName}"`);

  return {
    message: available
      ? t("fontStatus.available", { font: fontName })
      : t("fontStatus.missing", { font: fontName }),
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
    installMobileTouch(contents?.document, contents?.document?.defaultView?.frameElement);
    installFileDropHandlers(contents?.document);

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

  if (platform?.openImageWindow) {
    platform.openImageWindow(payload).catch((error) => {
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
  const message = tOptional(
    `epub.problem.${error?.code}`,
    error?.message ? errorText(error) : t("epub.problem.open-failed")
  );

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

  state.contentWarning = warning ? tOptional(`epub.warning.${warning.code}`, warning.message) : "";

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
  if (!state.rendition?.manager) return null;
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
  const displayed = location?.start?.displayed;
  state.progressLabel = platform.isMobile && displayed
    ? t("epub.progressChapter", { chapter: (location.start.index || 0) + 1, page: displayed.page, total: displayed.total })
    : Number.isFinite(percentage)
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
    showReaderMessage(t("epub.opening"));
    elements.reader.classList.add("epub-loaded");
    elements.reader.replaceChildren();

    if (typeof window.ePub !== "function") {
      throw new Error("epubjs was not loaded");
    }

    if (typeof window.JSZip !== "function") {
      throw new Error("JSZip was not loaded");
    }

    state.epubBook = window.ePub({ replacements: file.epubUrl ? "none" : undefined });
    await state.epubBook.open(file.epubUrl || arrayBuffer, file.epubUrl ? "directory" : "binary");
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

    if (!platform.isMobile) state.epubBook.locations.generate(1000).then(() => {
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
  if (state.pdf && isPdfLocation(bookmark.location)) {
    state.pdf.goToLocation(bookmark.location, { keepView: true });
    return;
  }
  if (state.docReader && isDocLocation(bookmark.location)) {
    state.docReader.goToLocation(bookmark.location);
    return;
  }

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
  if (state.pdf) {
    await state.pdf.goToOutlineItem(item);
    return;
  }

  if (!state.rendition || !item?.href) {
    return;
  }

  await state.rendition.display(item.href);
  syncRenditionLocation();
  render();
}

async function goPrevious() {
  if (state.mode === "pdf") {
    state.pdf?.previous();
    return;
  }
  if (state.mode === "document") {
    state.docReader?.previous();
    return;
  }

  if (state.mode === "markdown") {
    navigateMarkdownPage("previous");
    return;
  }

  if (state.rendition) {
    await state.rendition.prev();
    syncRenditionLocation();
    render();
    return;
  }

  setPage(state.page - 1);
}

async function goNext() {
  if (state.mode === "pdf") {
    state.pdf?.next();
    return;
  }
  if (state.mode === "document") {
    state.docReader?.next();
    return;
  }

  if (state.mode === "markdown") {
    navigateMarkdownPage("next");
    return;
  }

  if (state.rendition) {
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
  if (event.ctrlKey) {
    handleWheelEvent(event);
    return;
  }

  if (state.markdown.viewMode !== "view") {
    return;
  }

  const intent = getWheelIntent(event);
  if (intent.type !== "page") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (!wheelNavLock) {
    wheelNavLock = true;
    setTimeout(() => { wheelNavLock = false; }, 300);
    navigateMarkdownPage(intent.direction);
  }
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
  if (platform.isMobile && Number.isFinite(patch.fontSize)) storage.setItem("minsepubviewer.default-font-size", String(patch.fontSize));
  if (platform.isMobile && state.mode === "markdown") {
    const viewer = document.querySelector('#markdownViewer');
    const ratio = viewer ? viewer.scrollTop / Math.max(1, viewer.scrollHeight) : 0;
    state.book.settings = mergeReadingSettings(state.book.settings, patch);
    if (state.markdown.path) storage.setItem(`minsepubviewer.reading-settings:${state.markdown.path}`, JSON.stringify(state.book.settings));
    render();
    if (viewer) viewer.scrollTop = ratio * viewer.scrollHeight;
    saveMobileSession();
    return;
  }
  if (state.mode === "document") {
    state.book = updateBookSettings(state.book, patch);
    persistBook();
    const settings = mergeReadingSettings(state.book.settings, {});
    state.docReader?.setTheme(settings.theme);
    state.docReader?.setZoom(settings.zoom);
    render();
    return;
  }
  if (state.mode === "pdf") {
    state.book = updateBookSettings(state.book, patch);
    persistBook();
    if (patch.viewMode) state.pdf?.setViewMode(patch.viewMode);
    render();
    if (patch.theme) await state.pdf?.setTheme(patch.theme);
    return;
  }
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
  if (platform.isMobile) {
    if (panel === "left") state.ui.rightPanelCollapsed = true;
    if (panel === "right") state.ui.leftPanelCollapsed = true;
  }
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
      elements.bookmarkList.textContent = t("bookmarks.empty");
    } else {
      elements.bookmarkList.className = "";
      elements.bookmarkList.replaceChildren(...annotations.bookmarks.map((bookmark) => {
        const button = document.createElement("button");
        button.className = "list-item";
        button.type = "button";
        // Older bookmarks stored the Korean default label; show it in the current language.
        button.textContent = bookmark.label && !/^\d+번 줄$/.test(bookmark.label)
          ? bookmark.label
          : t("markdown.line", { line: bookmark.line });
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
    elements.bookmarkList.textContent = t("bookmarks.empty");
    return;
  }

  elements.bookmarkList.className = "";
  elements.bookmarkList.replaceChildren(
    ...bookmarks.map((bookmark) => {
      const button = document.createElement("button");
      button.className = "list-item";
      button.type = "button";
      const pdfLocation = parsePdfLocation(bookmark.location);
      const docLocation = parseDocLocation(bookmark.location);
      button.textContent = pdfLocation
        ? t("bookmarks.pageLabel", { page: pdfLocation.pageNumber })
        : docLocation
          ? t("bookmarks.percentLabel", { percent: Math.round(docLocation.ratio * 100) })
          : bookmark.label || bookmark.location;
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
    elements.markdownHighlightList.textContent = t("highlights.empty");
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
    meta.textContent = highlight.endLine !== highlight.startLine
      ? t("markdown.lines", { start: highlight.startLine, end: highlight.endLine })
      : t("markdown.line", { line: highlight.startLine });
    const remove = document.createElement("button");
    remove.className = "annotation-remove";
    remove.type = "button";
    remove.textContent = t("common.remove");
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
    location: getSelectionLocation(),
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

  if (state.pdf) finishPdfAnnotation();
  else if (state.docReader) finishDocAnnotation();
  hideSelectionToolbar();
  render();
}

function addCurrentNote() {
  if (!state.selectedRange || !state.selectedQuote || !elements.noteBody.value.trim()) {
    return;
  }

  const note = createTextNote({
    bookId: state.book.bookId,
    location: getSelectionLocation(),
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

  if (state.pdf) finishPdfAnnotation();
  else if (state.docReader) finishDocAnnotation();
  render();
}

async function goToAnnotation(annotation) {
  if (state.pdf && isPdfRange(annotation.range)) {
    state.pdf.goToRange(annotation.range);
    return;
  }
  if (state.docReader && isDocRange(annotation.range)) {
    state.docReader.goToRange(annotation.range);
    return;
  }
  if (state.rendition && isEpubCfi(annotation.range)) {
    await state.rendition.display(annotation.range);
    syncRenditionLocation();
    render();
  }
}

async function goToSearchResult(result) {
  if (state.pdf && result.pdfPage) {
    state.pdf.goToPage(result.pdfPage);
    return;
  }
  if (state.docReader && Number.isInteger(result.docIndex)) {
    state.docReader.showMatch(result.docIndex);
    return;
  }
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
  if (state.pdf) {
    if (state.searchQuery) state.pdf.find(state.searchQuery, { again: true, previous: direction === "previous" });
    return;
  }

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

  return match?.item?.label || normalizedHref || t("search.resultFallback");
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

  if (!state.pdf && !state.docReader && (!state.epubBook || !state.rendition)) {
    state.searchStatus = t("search.openFirst");
    renderSearch();
    return;
  }

  if (!canSearch(normalizedQuery)) {
    state.searchStatus = t("search.minLength");
    renderSearch();
    return;
  }

  state.searching = true;
  state.searchStatus = t("search.searching");
  renderSearch();

  if (state.pdf) {
    state.pdf.find(normalizedQuery);
    return;
  }

  if (state.docReader) {
    const matches = state.docReader.find(normalizedQuery);
    state.searching = false;
    state.searchResults = matches.map((match) => ({ index: match.index, docIndex: match.index, excerpt: match.excerpt, label: "" }));
    state.activeSearchResultIndex = matches.length ? 0 : -1;
    state.searchStatus = matches.length
      ? (matches.length === 1 ? t("search.resultsOne") : t("search.results", { count: matches.length }))
      : t("search.noResults");
    render();
    return;
  }

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
      ? (results.length === 1 ? t("search.resultsOne") : t("search.results", { count: results.length }))
      : t("search.noResults");
    logClient("epub.search.done", {
      queryLength: normalizedQuery.length,
      results: results.length
    });
  } catch (error) {
    state.searchResults = [];
    state.searchStatus = t("search.failed");
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
  state.pdf?.refreshHighlights();
  state.docReader?.refreshHighlights();

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

async function downloadTextFile({ content, fileName, type }) {
  if (platform.exportTextFile) return platform.exportTextFile({ content, fileName, type });
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function getMarkdownContent() {
  if (state.markdownTextEditor) {
    return state.markdownTextEditor.value;
  }

  if (state.markdownEditor) {
    return state.markdownEditor.getMarkdown();
  }

  return state.markdown.content;
}

function scheduleMarkdownDocumentSync() {
  if (state.mode !== "markdown") return;

  scheduleMobileSessionSave();

  scheduleLargeMarkdownImagePreview();

  // Serializing the complete WYSIWYG document after a large paste can block
  // the renderer for seconds. Keep the editor as the source of truth while
  // typing; save, view, tab-switch, and close paths snapshot it when needed.
  if (state.markdown.dirty) return;

  state.markdown.dirty = true;
  const tab = getActiveTab();
  if (tab?.kind === "markdown" && tab.markdown) {
    tab.markdown.dirty = true;
  }
  renderMarkdownChrome();
  renderDocumentTabs();
}

function clearMarkdownImagePreviewTimer() {
  if (state.markdownImagePreviewTimer !== null) {
    window.clearTimeout(state.markdownImagePreviewTimer);
    state.markdownImagePreviewTimer = null;
  }
}

function scheduleLargeMarkdownImagePreview() {
  clearMarkdownImagePreviewTimer();
  if (!state.markdownTextEditor || !state.markdown.largeImagePreview) return;

  state.markdownImagePreviewTimer = window.setTimeout(() => {
    state.markdownImagePreviewTimer = null;
    renderLargeMarkdownImagePreview();
  }, 350);
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
  storage.setItem(MARKDOWN_ANNOTATIONS_KEY, JSON.stringify(state.markdownAnnotations));
}

function moveMarkdownAnnotations(previousKey, nextKey) {
  if (!previousKey || !nextKey || previousKey === nextKey) return;
  const annotations = getMarkdownDocumentAnnotations(state.markdownAnnotations, previousKey);
  if (!annotations.bookmarks.length && !annotations.highlights.length) return;
  const documents = { ...state.markdownAnnotations.documents };
  delete documents[previousKey];
  state.markdownAnnotations = updateMarkdownDocumentAnnotations({ ...state.markdownAnnotations, documents }, nextKey, annotations);
  storage.setItem(MARKDOWN_ANNOTATIONS_KEY, JSON.stringify(state.markdownAnnotations));
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

  renderPageNavigation();
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
  scheduleMobileSessionSave();

  const tab = getActiveTab();
  if (tab?.kind === "markdown" && tab.markdown) {
    tab.markdown.currentLine = state.markdownCurrentLine;
    tab.markdown.scrollTop = state.markdownScrollTop;
  }
}

function getMarkdownViewportMetrics() {
  return {
    scrollTop: elements.markdownViewer.scrollTop,
    scrollHeight: elements.markdownViewer.scrollHeight,
    clientHeight: elements.markdownViewer.clientHeight
  };
}

function navigateMarkdownPage(direction) {
  if (
    state.mode !== "markdown" ||
    state.markdown.viewMode !== "view" ||
    !state.markdownViewer
  ) {
    return false;
  }

  elements.markdownViewer.scrollTo({
    top: getViewportPageTarget(getMarkdownViewportMetrics(), direction),
    behavior: "auto"
  });
  rememberMarkdownViewPosition();
  renderPageNavigation();
  return true;
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
  clearMarkdownImagePreviewTimer();
  hideSelectionToolbar();
  state.markdownSelection = null;
  const editor = state.markdownEditor;
  const viewer = state.markdownViewer;
  state.markdownEditor = null;
  state.markdownTextEditor = null;
  state.markdownViewer = null;
  editor?.destroy();
  viewer?.destroy();
  elements.markdownEditor.replaceChildren();
  elements.markdownViewer.replaceChildren();
}

function createLargeMarkdownToolbarButton(label, title, action, className = "") {
  const button = document.createElement("button");
  button.className = `markdown-format-button ${className}`.trim();
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", action);
  return button;
}

function applyPlainMarkdownEdit(result) {
  const textarea = state.markdownTextEditor;
  if (!textarea || !result) return;

  textarea.value = result.content;
  textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
  scheduleMarkdownDocumentSync();
  textarea.focus();
}

function applyPlainMarkdownInline(before, after = before, placeholder = t("mdTool.placeholder")) {
  const textarea = state.markdownTextEditor;
  if (!textarea) return;

  applyPlainMarkdownEdit(wrapMarkdownTextSelection(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    { before, after, placeholder }
  ));
}

function applyPlainMarkdownBlock(prefix, stripPattern = null) {
  const textarea = state.markdownTextEditor;
  if (!textarea) return;

  applyPlainMarkdownEdit(prefixMarkdownSelectedLines(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    prefix,
    { stripPattern }
  ));
}

function renderLargeMarkdownImagePreview() {
  const shell = elements.markdownEditor.querySelector(".markdown-large-editor-body");
  const panel = elements.markdownEditor.querySelector(".markdown-image-preview");
  const toggle = elements.markdownEditor.querySelector(".markdown-image-toggle");
  if (!shell || !panel || !state.markdownTextEditor) return;

  const visible = Boolean(state.markdown.largeImagePreview);
  panel.hidden = !visible;
  shell.classList.toggle("has-image-preview", visible);
  toggle?.classList.toggle("is-active", visible);
  toggle?.setAttribute("aria-pressed", String(visible));
  if (!visible) return;

  const images = findEmbeddedMarkdownImages(state.markdownTextEditor.value);
  if (!images.length) {
    const empty = document.createElement("p");
    empty.className = "markdown-image-preview-empty";
    empty.textContent = t("mdTool.noImages");
    panel.replaceChildren(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "markdown-image-preview-header";
  header.textContent = t("mdTool.imageHeader", { count: images.length });
  const cards = images.map((item, index) => {
    const figure = document.createElement("figure");
    figure.className = "markdown-image-card";
    const image = document.createElement("img");
    image.src = item.src;
    image.alt = item.alt;
    image.loading = "lazy";
    image.decoding = "async";
    const caption = document.createElement("figcaption");
    caption.textContent = item.alt || t("mdTool.imageCaption", { index: index + 1 });
    figure.append(image, caption);
    return figure;
  });
  panel.replaceChildren(header, ...cards);
}

function toggleLargeMarkdownImagePreview() {
  state.markdown.largeImagePreview = !state.markdown.largeImagePreview;
  const tab = getActiveTab();
  if (tab?.kind === "markdown" && tab.markdown) {
    tab.markdown.largeImagePreview = state.markdown.largeImagePreview;
  }
  renderLargeMarkdownImagePreview();
}

function createLargeMarkdownFormattingToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "markdown-large-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t("mdTool.toolbar"));

  const heading = document.createElement("select");
  heading.className = "markdown-format-select";
  heading.setAttribute("aria-label", t("mdTool.paragraph"));
  [
    ["", t("mdTool.body")],
    ["1", t("mdTool.heading", { level: 1 })],
    ["2", t("mdTool.heading", { level: 2 })],
    ["3", t("mdTool.heading", { level: 3 })]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    heading.appendChild(option);
  });
  heading.addEventListener("change", () => {
    const prefix = heading.value ? `${"#".repeat(Number(heading.value))} ` : "";
    applyPlainMarkdownBlock(prefix, /^#{1,6}\s+/u);
    heading.value = "";
  });

  const imageToggle = createLargeMarkdownToolbarButton(
    t("mdTool.images"),
    t("mdTool.imagesTitle"),
    toggleLargeMarkdownImagePreview,
    "markdown-image-toggle"
  );
  imageToggle.setAttribute("aria-pressed", String(state.markdown.largeImagePreview));

  toolbar.append(
    heading,
    createLargeMarkdownToolbarButton("B", t("mdTool.bold"), () => applyPlainMarkdownInline("**", "**", t("mdTool.boldText")), "is-bold"),
    createLargeMarkdownToolbarButton("I", t("mdTool.italic"), () => applyPlainMarkdownInline("*", "*", t("mdTool.italicText")), "is-italic"),
    createLargeMarkdownToolbarButton("S", t("mdTool.strike"), () => applyPlainMarkdownInline("~~", "~~", t("mdTool.strikeText")), "is-strike"),
    createLargeMarkdownToolbarButton(t("mdTool.quote"), t("mdTool.quoteTitle"), () => applyPlainMarkdownBlock("> ")),
    createLargeMarkdownToolbarButton(t("mdTool.bullet"), t("mdTool.bulletTitle"), () => applyPlainMarkdownBlock("- ")),
    createLargeMarkdownToolbarButton(t("mdTool.numbered"), t("mdTool.numberedTitle"), () => applyPlainMarkdownBlock((index) => `${index + 1}. `)),
    createLargeMarkdownToolbarButton("☐", t("mdTool.checkbox"), () => applyPlainMarkdownBlock("- [ ] ")),
    createLargeMarkdownToolbarButton(t("mdTool.inlineCode"), t("mdTool.inlineCodeTitle"), () => applyPlainMarkdownInline("`", "`", "code")),
    createLargeMarkdownToolbarButton(t("mdTool.codeBlock"), t("mdTool.codeBlock"), () => applyPlainMarkdownInline("```\n", "\n```", "code")),
    createLargeMarkdownToolbarButton(t("mdTool.link"), t("mdTool.linkTitle"), () => {
      const url = window.prompt(t("mdTool.linkPrompt"), "https://");
      if (url) applyPlainMarkdownInline("[", `](${url})`, t("mdTool.linkText"));
    }),
    imageToggle,
    createLargeMarkdownToolbarButton(t("mdTool.wysiwyg"), t("mdTool.wysiwygTitle"), () => {
      void switchLargeMarkdownToWysiwyg();
    }, "markdown-wysiwyg-button")
  );
  return toolbar;
}

function createPlainTextMarkdownEditor(content, selectionStart = 0, selectionEnd = selectionStart) {
  const previousEditor = state.markdownEditor;
  state.markdownEditor = null;
  state.markdownTextEditor = null;
  previousEditor?.destroy();
  elements.markdownEditor.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "markdown-large-editor";
  const toolbar = createLargeMarkdownFormattingToolbar();
  const body = document.createElement("div");
  body.className = "markdown-large-editor-body";
  const textarea = document.createElement("textarea");
  textarea.className = "markdown-plain-text-editor";
  textarea.setAttribute("aria-label", t("mdTool.textEditor"));
  textarea.spellcheck = false;
  textarea.value = content;
  textarea.addEventListener("input", scheduleMarkdownDocumentSync);
  const imagePreview = document.createElement("aside");
  imagePreview.className = "markdown-image-preview";
  imagePreview.setAttribute("aria-label", t("mdTool.imagePreview"));
  body.append(textarea, imagePreview);
  wrapper.append(toolbar, body);
  elements.markdownEditor.appendChild(wrapper);
  state.markdownTextEditor = textarea;
  state.markdown.largeDocument = true;
  state.markdown.largeEditMode = "plain";
  const tab = getActiveTab();
  if (tab?.kind === "markdown" && tab.markdown) {
    tab.markdown.largeDocument = true;
    tab.markdown.largeEditMode = "plain";
    tab.markdown.largeImagePreview = state.markdown.largeImagePreview;
  }

  const start = Math.min(Math.max(0, selectionStart), content.length);
  const end = Math.min(Math.max(start, selectionEnd), content.length);
  textarea.setSelectionRange(start, end);
  renderLargeMarkdownImagePreview();
  renderMarkdownChrome();
  return textarea;
}

function createMarkdownEditor() {
  const Editor = window.toastui?.Editor;

  if (!Editor) {
    throw new Error("TOAST UI Editor failed to load");
  }

  if (
    (state.markdown.largeDocument || shouldUsePlainTextMarkdownEditor(state.markdown.content)) &&
    state.markdown.largeEditMode !== "wysiwyg"
  ) {
    createPlainTextMarkdownEditor(state.markdown.content);
    return;
  }

  state.markdownEditor = new Editor({
    el: elements.markdownEditor,
    height: "100%",
    initialEditType: "wysiwyg",
    previewStyle: "vertical",
    initialValue: state.markdown.content,
    language: getLocale() === "ko" ? "ko-KR" : "en-US",
    usageStatistics: false,
    autofocus: false,
    events: {
      change: scheduleMarkdownDocumentSync
    }
  });
}

function waitForUiPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

async function switchLargeMarkdownToWysiwyg() {
  if (!state.markdownTextEditor || state.markdown.saving) return;

  const content = state.markdownTextEditor.value;
  state.markdown.content = content;
  state.markdown.largeEditMode = "wysiwyg";
  const tab = getActiveTab();
  if (tab?.kind === "markdown" && tab.markdown) {
    tab.markdown.content = content;
    tab.markdown.largeDocument = true;
    tab.markdown.largeEditMode = "wysiwyg";
  }

  state.markdownTextEditor = null;
  elements.markdownEditor.replaceChildren();
  renderMarkdownChrome(t("markdown.switchingWysiwyg"));
  await waitForUiPaint();
  createMarkdownEditor();
  renderMarkdownChrome();
  state.markdownEditor?.focus();
}

async function switchWysiwygToLargeMarkdown() {
  if (!state.markdownEditor || !state.markdown.largeDocument || state.markdown.saving) return;

  renderMarkdownChrome(t("markdown.switchingText"));
  await waitForUiPaint();
  const content = state.markdownEditor.getMarkdown();
  state.markdown.content = content;
  state.markdown.largeEditMode = "plain";
  createPlainTextMarkdownEditor(content, content.length);
  scheduleMarkdownDocumentSync();
  state.markdownTextEditor?.focus();
}

function handleLargeMarkdownPaste(event) {
  if (
    state.mode !== "markdown" ||
    state.markdown.viewMode !== "edit" ||
    state.markdownTextEditor ||
    !state.markdownEditor
  ) {
    return;
  }

  const pastedText = event.clipboardData?.getData("text/plain") || "";
  if (!shouldUsePlainTextMarkdownEditor(pastedText)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    // Switching modes once lets Toast UI map the WYSIWYG caret to the
    // one-based Markdown line/column coordinates before it is destroyed.
    state.markdownEditor.changeMode("markdown");
    const content = state.markdownEditor.getMarkdown();
    const [startPosition, endPosition] = state.markdownEditor.getSelection();
    const next = insertTextAtMarkdownSelection(content, pastedText, startPosition, endPosition);
    state.markdown.largeImagePreview = next.content.includes("data:image/");
    const textarea = createPlainTextMarkdownEditor(
      next.content,
      next.selectionStart,
      next.selectionEnd
    );
    scheduleMarkdownDocumentSync();
    textarea.focus();
  } catch (error) {
    logClient("markdown.large-paste.failed", { error: formatError(error) });
    window.alert(t("error.switchLargeEditor"));
  }
}

function activateMarkdownDocument(document, options = {}) {
  destroyMarkdownInstances();

  const content = typeof document.content === "string" ? document.content : "";
  const largeDocument = Boolean(document.largeDocument) || shouldUsePlainTextMarkdownEditor(content);
  state.mode = "markdown";
  if (platform.isMobile) {
    let saved = {};
    try { saved = JSON.parse(storage.getItem(`minsepubviewer.reading-settings:${document.path}`) || '{}'); } catch {}
    state.book.settings = mergeReadingSettings({}, { fontSize: Number(storage.getItem('minsepubviewer.default-font-size')) || 18, ...saved });
  }
  state.markdown = {
    name: document.name || "document.md",
    path: document.path || "",
    content,
    savedContent: typeof options.savedContent === "string" ? options.savedContent : (options.dirty ? "" : content),
    dirty: Boolean(options.dirty),
    viewMode: options.viewMode === "view" ? "view" : "edit",
    saving: false,
    largeDocument,
    largeEditMode: largeDocument && document.largeEditMode === "wysiwyg" ? "wysiwyg" : "plain",
    largeImagePreview: typeof document.largeImagePreview === "boolean"
      ? document.largeImagePreview
      : content.includes("data:image/")
  };
  state.markdownCurrentLine = Math.max(1, Number(options.currentLine) || 1);
  state.markdownScrollTop = Math.max(0, Number(options.scrollTop) || 0);

  render();
  // Reading on mobile should not instantiate an editor or normalize source text.
  if (!platform.isMobile || state.markdown.viewMode !== "view") createMarkdownEditor();
  if (state.markdown.viewMode === "view") showMarkdownViewMode();
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
  state.markdown.content = content;
  state.markdown.dirty = content !== state.markdown.savedContent;
  tab.title = state.markdown.name || tab.title;
  tab.path = state.markdown.path || tab.path;
  tab.markdown = {
    ...state.markdown,
    content,
    saving: false,
    currentLine: state.markdownCurrentLine,
    scrollTop: state.markdownScrollTop
  };
  if (platform.isMobile && tab.path) {
    storage.setItem(`minsepubviewer.position:${tab.path}`, JSON.stringify({
      currentLine: tab.markdown.currentLine, scrollTop: tab.markdown.scrollTop
    }));
  }
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
    detach.title = t("tabs.openInNewWindow");
    detach.hidden = !tab.path || Boolean(dirty) || !platform?.openFileInNewWindow;
    detach.addEventListener("click", () => void platform.openFileInNewWindow(tab.path));

    const close = document.createElement("button");
    close.className = "document-tab-action";
    close.type = "button";
    close.textContent = "×";
    close.title = t("tabs.close");
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
  await destroyPdf();
  await destroyDocumentReader();
  if (sequence !== state.tabActivationSequence) return;
  state.activeTabId = tab.id;
  if (platform.isMobile && tab.path) storage.setItem("minsepubviewer.last-document", tab.path);
  renderDocumentTabs();

  if (tab.kind === "document") {
    state.mode = "document";
    await openConvertedDocument(tab.payload.file);
    if (sequence === state.tabActivationSequence) renderDocumentTabs();
    return;
  }

  if (tab.kind === "pdf") {
    state.mode = "pdf";
    await openPdfFile(tab.payload.file);
    if (sequence === state.tabActivationSequence) renderDocumentTabs();
    return;
  }

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
  const source = payload.kind === "markdown" ? payload.document : payload.file;
  if (!source) return;
  const path = source.path || "";
  const duplicate = path && state.tabs.find((tab) => tab.path.toLowerCase() === path.toLowerCase());
  if (duplicate) {
    await activateDocumentTab(duplicate.id);
    return;
  }
  const tab = {
    id: createTabId(), kind: payload.kind, title: source.name || t("common.document"), path, payload,
    markdown: payload.kind === "markdown" ? {
      name: source.name || "document.md", path, content: source.content || "", savedContent: source.content || "", dirty: false,
      viewMode: source.viewMode === "view" ? "view" : "edit", saving: false, currentLine: 1, scrollTop: 0
    } : null
  };
  state.tabs.push(tab);
  if (platform.isMobile && tab.markdown && path) {
    try {
      const position = JSON.parse(storage.getItem(`minsepubviewer.position:${path}`) || "null");
      if (position) Object.assign(tab.markdown, position);
    } catch { /* A damaged position must not prevent opening the document. */ }
  }
  await activateDocumentTab(tab.id);
  scheduleMobileSessionSave();
}

async function askHowToCloseChangedDocument(tab) {
  if (platform?.confirmSaveChanges) {
    return platform.confirmSaveChanges({
      name: tab.title || tab.markdown?.name || t("common.document"),
      kind: tab.kind
    });
  }

  if (window.confirm(t("confirm.saveChanges", { name: tab.title }))) return "save";
  return window.confirm(t("confirm.discard")) ? "discard" : "cancel";
}

async function resolveUnsavedMarkdownTab(tab) {
  if (tab.kind !== "markdown" || !tab.markdown?.dirty) return true;

  const decision = await askHowToCloseChangedDocument(tab);
  if (decision === "cancel") return false;
  if (decision === "discard") return true;
  if (decision !== "save") return false;

  if (tab.id !== state.activeTabId) {
    const activeTab = getActiveTab();
    if (["epub", "pdf", "document"].includes(activeTab?.kind) && !await resolveUnsavedEpubTab(activeTab)) return false;
    await activateDocumentTab(tab.id);
  }

  return saveMarkdown(false);
}

function getPendingEpubEdits(tab) {
  if (tab.id !== state.activeTabId || tab.kind !== state.mode || !["epub", "pdf", "document"].includes(tab.kind)) return null;

  const note = state.book.notes.find((item) => item.id === state.editingNoteId) || null;
  const textarea = note ? elements.annotationList.querySelector(".annotation-edit-input") : null;
  const editedBody = textarea?.value.trim() || "";
  const hasEditedNote = Boolean(note && textarea && editedBody !== note.body.trim());
  const hasNewNote = Boolean(
    state.selectedRange &&
    state.selectedQuote &&
    elements.noteBody.value.trim()
  );

  return hasEditedNote || hasNewNote
    ? { note, textarea, editedBody, hasEditedNote, hasNewNote }
    : null;
}

async function resolveUnsavedEpubTab(tab) {
  const pending = getPendingEpubEdits(tab);
  if (!pending) return true;

  const decision = await askHowToCloseChangedDocument(tab);
  if (decision === "cancel") return false;
  if (decision === "discard") return true;
  if (decision !== "save") return false;

  if (pending.hasEditedNote) {
    if (!pending.editedBody) {
      window.alert(t("error.noteEmpty"));
      pending.textarea.focus();
      return false;
    }
    saveEditedNote(pending.note, pending.textarea);
  }
  if (pending.hasNewNote) addCurrentNote();
  return true;
}

async function resolveUnsavedDocumentTab(tab) {
  if (tab.kind === "markdown") return resolveUnsavedMarkdownTab(tab);
  if (["epub", "pdf", "document"].includes(tab.kind)) return resolveUnsavedEpubTab(tab);
  return true;
}

async function closeDocumentTab(tabId) {
  snapshotActiveTab();
  let index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return;
  const tab = state.tabs[index];
  if (!await resolveUnsavedDocumentTab(tab)) return;

  index = state.tabs.findIndex((item) => item.id === tabId);
  if (index < 0) return;
  state.tabs.splice(index, 1);
  scheduleMobileSessionSave();
  if (tab.id !== state.activeTabId) { renderDocumentTabs(); return; }
  state.activeTabId = "";
  destroyMarkdownInstances();
  await destroyEpub();
  await destroyPdf();
  await destroyDocumentReader();
  const next = state.tabs[Math.min(index, state.tabs.length - 1)];
  if (next) await activateDocumentTab(next.id);
  else {
    if (platform.isMobile) storage.removeItem("minsepubviewer.last-document");
    state.mode = "epub";
    showReaderMessage(t("reader.openPrompt"));
    render();
    renderDocumentTabs();
  }
}

const PDF_SPREAD_KEY = "minsepubviewer.pdf-spread";
const PDF_LOADING_ID = "pdf-loading";
const PDF_FIND_NOT_FOUND = 1;
const PDF_FIND_PENDING = 3;
let pdfLocationSaveTimer = null;

function flushPdfLocation() {
  if (!pdfLocationSaveTimer) return;
  clearTimeout(pdfLocationSaveTimer);
  pdfLocationSaveTimer = null;
  if (state.pdf && state.book.bookId !== PDF_LOADING_ID) persistBook();
}

function getPdfAnnotations() {
  return [
    ...state.book.highlights,
    ...state.book.notes.map((note) => ({ ...note, color: "note" }))
  ];
}

function clearPdfSelection() {
  state.pdfSelection = null;
  if (state.mode === "pdf") {
    state.selectedRange = "";
    state.selectedQuote = "";
  }
  hideSelectionToolbar();
  renderAnnotations();
}

function finishPdfAnnotation() {
  state.pdf?.refreshHighlights();
  state.pdf?.clearSelection();
  clearPdfSelection();
}

// A collapsed selection is ignored so the selection survives typing a note in the side panel.
function handlePdfSelection(selection) {
  if (!selection || state.mode !== "pdf") return;
  state.pdfSelection = selection;
  state.selectedRange = selection.range;
  state.selectedQuote = selection.quote;
  const rowRect = elements.contentRow.getBoundingClientRect();
  const rect = selection.clientRect;
  elements.selectionToolbar.style.left = `${Math.max(48, rect.left - rowRect.left + rect.width / 2)}px`;
  elements.selectionToolbar.style.top = `${Math.max(48, rect.top - rowRect.top - 10)}px`;
  elements.selectionToolbar.hidden = false;
  renderAnnotations();
}

function handlePdfLocationChange(location) {
  if (!state.pdf || state.book.bookId === PDF_LOADING_ID) return;
  state.book = updateLastLocation(state.book, location);
  state.progressLabel = t("pdf.progress", { page: state.pdf.pageNumber, total: state.pdf.pageCount });
  clearTimeout(pdfLocationSaveTimer);
  pdfLocationSaveTimer = setTimeout(persistBook, 400);
  elements.locationLabel.textContent = state.progressLabel;
  renderPageNavigation();
  renderPdfControls();
  const bookmarked = hasBookmarkAtCurrentLocation();
  elements.bookmarkButton.classList.toggle("is-active", bookmarked);
  elements.bookmarkButton.setAttribute("aria-pressed", String(bookmarked));
  scheduleMobileSessionSave();
}

function handlePdfFindUpdate({ state: findState, current, total, pages }) {
  state.searching = findState === PDF_FIND_PENDING;
  state.searchResults = pages.map((page, index) => ({
    index,
    pdfPage: page.pageNumber,
    excerpt: t("pdf.searchPage", { page: page.pageNumber, count: page.count }),
    label: ""
  }));
  const selectedPage = state.pdf?.selectedMatchPage;
  state.activeSearchResultIndex = state.searchResults.findIndex((result) => result.pdfPage === selectedPage);
  if (total) state.searchStatus = t("pdf.searchStatus", { current, total });
  else if (findState === PDF_FIND_NOT_FOUND) state.searchStatus = t("search.noResults");
  renderSearch();
  elements.prevSearchResultButton.disabled = !total;
  elements.nextSearchResultButton.disabled = !total;
}

function renderPdfControls() {
  if (!state.pdf?.viewer) return;
  const zoom = String(state.pdf.zoomValue);
  const preset = ["auto", "page-width", "page-fit", "page-actual"].includes(zoom);
  const custom = elements.pdfZoomSelect.querySelector("option[value=\"custom\"]");
  const percent = Math.round(state.pdf.scale * 100);
  custom.hidden = preset;
  custom.textContent = t("pdf.zoomCustom", { percent });
  elements.pdfZoomSelect.value = preset ? zoom : "custom";
  elements.pdfSpreadButton.classList.toggle("is-active", state.pdf.spread);
  elements.pdfSpreadButton.setAttribute("aria-pressed", String(state.pdf.spread));
  elements.zoomLabel.textContent = `${percent}%`;
}

function describePdfError(error, reader) {
  if (reader?.passwordCancelled) return t("pdf.passwordCancelled");
  if (error?.name === "InvalidPDFException") return t("pdf.invalid");
  if (error?.name === "PasswordException") return t("pdf.passwordRetry");
  if (/dynamically imported module|Failed to fetch/i.test(error?.message || "")) return t("pdf.loadLibraryFailed");
  return error?.message ? errorText(error) : t("pdf.openFailed");
}

async function destroyPdf() {
  clearTimeout(pdfLocationSaveTimer);
  const reader = state.pdf;
  if (!reader) return;
  state.pdf = null;
  state.pdfSelection = null;
  if (state.book.bookId.startsWith("pdf-") && state.book.bookId !== PDF_LOADING_ID) persistBook();
  hideSelectionToolbar();
  state.toc = [];
  state.searchResults = [];
  state.activeSearchResultIndex = -1;
  state.searchStatus = "";
  state.searching = false;
  state.progressLabel = "";
  state.selectedRange = "";
  state.selectedQuote = "";
  await reader.destroy();
}

async function openPdfFile(fileLike) {
  const name = fileLike?.name || "document.pdf";
  const filePath = fileLike?.path || name;
  logClient("pdf.file.selected", { name, size: fileLike?.size, source: fileLike?.path ? platform.kind : "browser" });
  state.mode = "pdf";
  state.pdfMeta = null;
  state.book = createBookRecord({ bookId: PDF_LOADING_ID, title: name.replace(/\.pdf$/i, ""), filePath, settings: state.book.settings });
  state.toc = [];
  state.progressLabel = "";
  state.bookMeta = t("pdf.opening");
  render();

  const reader = new PdfReader({
    container: elements.pdfContainer,
    viewer: elements.pdfViewer,
    isMobile: platform.isMobile,
    requestPassword: (retry) => window.prompt(t(retry ? "pdf.passwordRetry" : "pdf.passwordPrompt")),
    onLocationChange: handlePdfLocationChange,
    onPageChange: () => renderPageNavigation(),
    onSelectionChange: handlePdfSelection,
    onFindUpdate: handlePdfFindUpdate,
    getHighlights: getPdfAnnotations
  });
  state.pdf = reader;

  try {
    // PDF.js takes ownership of the bytes it is given; the tab keeps its own copy.
    const source = fileLike.pdfUrl
      ? { url: fileLike.pdfUrl }
      : { data: new Uint8Array((await readFileArrayBuffer(fileLike)).slice(0)) };
    const settings = mergeReadingSettings(state.book.settings, {});
    const info = await reader.open({
      ...source,
      theme: settings.theme,
      viewMode: settings.viewMode,
      spread: storage.getItem(PDF_SPREAD_KEY) === "true",
      resolveLocation: (documentId) => {
        const saved = getBookRecord(state.library, documentId);
        state.book = saved
          ? { ...saved, filePath, title: state.book.title }
          : createBookRecord({ bookId: documentId, title: state.book.title, filePath, settings });
        return state.book.lastLocation;
      }
    });
    if (state.pdf !== reader) return;
    state.toc = info.outline;
    state.pdfMeta = { name, size: ((fileLike.size || 0) / 1024 / 1024).toFixed(2), pages: info.pageCount };
    state.progressLabel = t("pdf.progress", { page: reader.pageNumber, total: reader.pageCount });
    persistBook();
    render();
    reader.refreshHighlights();
    logClient("pdf.file.opened", { pages: info.pageCount, restored: Boolean(state.book.lastLocation) });
  } catch (error) {
    const message = describePdfError(error, reader);
    logClient("pdf.file.rejected", { name, error: formatError(error) });
    if (state.pdf === reader) {
      state.pdf = null;
      await reader.destroy();
      const paragraph = document.createElement("p");
      paragraph.className = "pdf-message";
      paragraph.textContent = message;
      elements.pdfViewer.replaceChildren(paragraph);
    }
    state.bookMeta = `${name} - ${message}`;
    render();
  }
}

async function toggleDesktopFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    logClient("fullscreen.failed", { error: formatError(error) });
  }
}

const DOC_LOADING_ID = "doc-loading";
const DOCUMENT_MAX_BYTES = 64 * 1024 * 1024;
let docLocationSaveTimer = null;

function getSelectionLocation() {
  const selection = state.mode === "document" ? state.docSelection : state.pdfSelection;
  return selection?.range === state.selectedRange ? selection.location : state.selectedRange;
}

function docProgressLabel() {
  const { page, pageCount } = state.docReader.pageState;
  return t("pdf.progress", { page, total: pageCount });
}

function clearDocSelection() {
  state.docSelection = null;
  if (state.mode === "document") {
    state.selectedRange = "";
    state.selectedQuote = "";
  }
  hideSelectionToolbar();
  renderAnnotations();
}

function finishDocAnnotation() {
  state.docReader?.refreshHighlights();
  state.docReader?.clearSelection();
  clearDocSelection();
}

// Like PDF, a collapsed selection keeps the last one so a note can be typed in the side panel.
function handleDocSelection(selection) {
  if (!selection || state.mode !== "document") return;
  state.docSelection = selection;
  state.selectedRange = selection.range;
  state.selectedQuote = selection.quote;
  const rowRect = elements.contentRow.getBoundingClientRect();
  const rect = selection.clientRect;
  elements.selectionToolbar.style.left = `${Math.max(48, rect.left - rowRect.left + rect.width / 2)}px`;
  elements.selectionToolbar.style.top = `${Math.max(48, rect.top - rowRect.top - 10)}px`;
  elements.selectionToolbar.hidden = false;
  renderAnnotations();
}

function handleDocLocationChange(location) {
  if (!state.docReader?.document || state.book.bookId === DOC_LOADING_ID) return;
  state.book = updateLastLocation(state.book, location);
  state.progressLabel = docProgressLabel();
  clearTimeout(docLocationSaveTimer);
  docLocationSaveTimer = setTimeout(() => {
    docLocationSaveTimer = null;
    persistBook();
  }, 400);
  elements.locationLabel.textContent = state.progressLabel;
  renderPageNavigation();
  const bookmarked = hasBookmarkAtCurrentLocation();
  elements.bookmarkButton.classList.toggle("is-active", bookmarked);
  elements.bookmarkButton.setAttribute("aria-pressed", String(bookmarked));
  scheduleMobileSessionSave();
}

function flushDocLocation() {
  if (!docLocationSaveTimer) return;
  clearTimeout(docLocationSaveTimer);
  docLocationSaveTimer = null;
  if (state.docReader && state.book.bookId !== DOC_LOADING_ID) persistBook();
}

// The converted page runs no scripts, so the reader attaches its handlers from here.
function installDocumentFrameHandlers(frameDocument) {
  frameDocument.addEventListener("pointerdown", () => {
    if (state.docSelection) clearDocSelection();
  });
  frameDocument.addEventListener("wheel", (event) => {
    const intent = getWheelIntent(event);
    if (intent.type !== "zoom") return;
    event.preventDefault();
    void updateSettings({ zoom: applyZoomIntent(state.book.settings, intent).zoom });
  }, { passive: false });
  frameDocument.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "F11", "Escape"].includes(event.key)) {
      if (event.key === "F11") event.preventDefault();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey }));
    }
  });
  if (platform.isMobile) {
    installReaderTouch(frameDocument, {
      viewport: elements.docWorkspace,
      frame: elements.docFrame,
      enabled: () => state.mode === "document" && Boolean(state.docReader),
      paginated: () => state.book.settings.viewMode !== "continuous",
      navigate: turnMobilePage,
      center: () => mobileUI?.center(),
      pinch: createPinchPreview({
        element: () => elements.docFrame,
        value: () => mergeReadingSettings(state.book.settings, {}).zoom,
        min: 0.4,
        max: 3,
        round: (zoom) => Math.round(zoom * 100) / 100,
        commit: (zoom) => updateSettings({ zoom })
      }),
      onError: (error) => window.alert(t("error.pageTurn", { detail: errorText(error) }))
    });
  }
}

async function destroyDocumentReader() {
  clearTimeout(docLocationSaveTimer);
  docLocationSaveTimer = null;
  const reader = state.docReader;
  if (!reader) return;
  state.docReader = null;
  state.docSelection = null;
  if (state.book.bookId !== DOC_LOADING_ID && state.mode === "document") persistBook();
  hideSelectionToolbar();
  state.searchResults = [];
  state.activeSearchResultIndex = -1;
  state.searchStatus = "";
  state.progressLabel = "";
  state.selectedRange = "";
  state.selectedQuote = "";
  reader.destroy();
}

function showDocumentMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  elements.docFrame.srcdoc = `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui,sans-serif;padding:24px;color:#555">${paragraph.outerHTML}</body>`;
}

async function openConvertedDocument(fileLike) {
  const name = fileLike?.name || "document";
  const filePath = fileLike?.path || name;
  const format = getDocumentFormat(name) || "document";
  logClient("document.file.selected", { name, size: fileLike?.size, format });
  state.mode = "document";
  state.docMeta = null;
  state.book = createBookRecord({ bookId: DOC_LOADING_ID, title: name.replace(/\.(docx|hwpx|hwp)$/i, ""), filePath, settings: state.book.settings });
  state.toc = [];
  state.progressLabel = "";
  state.bookMeta = t("document.opening");
  render();

  const reader = new DocumentReader({
    frame: elements.docFrame,
    onLocationChange: handleDocLocationChange,
    onSelectionChange: handleDocSelection,
    onReady: installDocumentFrameHandlers,
    getHighlights: getPdfAnnotations
  });
  state.docReader = reader;

  try {
    const bytes = new Uint8Array(await readFileArrayBuffer(fileLike));
    if (bytes.byteLength > DOCUMENT_MAX_BYTES) throw new Error("native.documentTooLarge");
    const converted = await convertDocument(fileLike, bytes, platform);
    if (state.docReader !== reader) return;
    const bookId = computeBookId(bytes);
    const saved = getBookRecord(state.library, bookId);
    state.book = saved
      ? { ...saved, filePath, title: state.book.title }
      : createBookRecord({ bookId, title: state.book.title, filePath, settings: state.book.settings });
    const settings = mergeReadingSettings(state.book.settings, {});
    await reader.open({ html: converted.html, layout: converted.layout, location: state.book.lastLocation, theme: settings.theme, zoom: settings.zoom, lang: getLocale() });
    if (state.docReader !== reader) return;
    state.docMeta = { name, size: (bytes.byteLength / 1024 / 1024).toFixed(2), format: format.toUpperCase() };
    state.progressLabel = docProgressLabel();
    persistBook();
    render();
    logClient("document.file.opened", { format, layout: converted.layout });
  } catch (error) {
    const message = error?.message ? errorText(error) : t("document.convertFailed");
    logClient("document.file.rejected", { name, format, error: formatError(error) });
    if (state.docReader === reader) {
      state.docReader = null;
      reader.destroy();
      showDocumentMessage(message);
    }
    state.bookMeta = `${name} - ${message}`;
    render();
  }
}

function getOpenFileKind(name) {
  const extension = String(name || "").toLowerCase();

  if (extension.endsWith(".epub")) {
    return "epub";
  }

  if (extension.endsWith(".pdf")) {
    return "pdf";
  }

  if (getDocumentFormat(extension)) {
    return "document";
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
    return platform?.getPathForFile?.(file) || "";
  } catch {
    return "";
  }
}

async function openDroppedFile(file) {
  const kind = getOpenFileKind(file?.name);

  if (!kind) {
    window.alert(t("error.unsupportedFile"));
    return;
  }

  try {
    const filePath = getDroppedFilePath(file);

    if (kind === "epub" || kind === "pdf" || kind === "document") {
      await addDocumentTab({ kind, file: {
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type || (kind === "pdf" ? "application/pdf" : kind === "epub" ? "application/epub+zip" : "application/octet-stream"),
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
    window.alert(t("error.openNamed", { name: file.name, detail: errorText(error) }));
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
      window.alert(t("error.unsupportedFile"));
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
  if (!state.markdownEditor && !state.markdownTextEditor) createMarkdownEditor();
  renderMarkdownChrome();
  (state.markdownTextEditor || state.markdownEditor)?.focus();
}

function showMarkdownViewMode() {
  const Editor = window.toastui?.Editor;
  const content = getMarkdownContent();
  const restoreScrollTop = state.markdownScrollTop;

  state.markdown.content = content;
  state.markdown.dirty = content !== state.markdown.savedContent;
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
    return false;
  }

  const previousAnnotationKey = getMarkdownAnnotationKey();
  state.markdown.saving = true;
  renderMarkdownChrome();

  try {
    // Paint the saving state before a user-requested WYSIWYG conversion can
    // occupy the renderer. Plain large-document mode returns immediately.
    await waitForUiPaint();
    const content = getMarkdownContent();
    state.markdown.content = content;

    if (!platform?.saveMarkdownFile) {
      await downloadTextFile({
        content,
        fileName: state.markdown.name || "document.md",
        type: "text/markdown;charset=utf-8"
      });
      state.markdown.savedContent = content;
      state.markdown.dirty = false;
      snapshotActiveTab();
      return true;
    }

    const result = await platform.saveMarkdownFile({
      content,
      path: state.markdown.path,
      saveAs,
      suggestedName: state.markdown.name || "document.md"
    });

    if (!result) {
      return false;
    }

    state.markdown.name = result.name;
    state.markdown.path = result.path;
    if (platform.isMobile) storage.setItem("minsepubviewer.last-document", result.path);
    state.markdown.savedContent = content;
    state.markdown.dirty = false;
    snapshotActiveTab();
    moveMarkdownAnnotations(previousAnnotationKey, getMarkdownAnnotationKey());
    scheduleMobileSessionSave();
    logClient("markdown.saved", {
      path: result.path,
      characters: content.length
    });
    return true;
  } catch (error) {
    logClient("markdown.save.failed", { error: formatError(error) });
    window.alert(t("error.saveMarkdown", { detail: errorText(error) }));
    return false;
  } finally {
    state.markdown.saving = false;
    renderMarkdownChrome();
    renderDocumentTabs();
  }
}

function closeMarkdown() {
  void closeDocumentTab(state.activeTabId);
}

async function exportAnnotations() {
  const exported = createAnnotationExport(state.book);

  const saved = await downloadTextFile({
    content: JSON.stringify(exported, null, 2),
    fileName: createExportFileName(state.book),
    type: "application/json"
  });
  if (!saved) return;

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

    const saved = await downloadTextFile({
      content: `${markdown}\n`,
      fileName: createMarkdownFileName(state.book.title),
      type: "text/markdown;charset=utf-8"
    });
    if (!saved) return;

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
    const prepared = platform.isMobile && fileLike.epubUrl && /^[0-9a-f]{64}$/.test(fileLike.bookId || "");
    const arrayBuffer = prepared ? null : await readFileArrayBuffer(fileLike);
    const content = prepared ? undefined : new Uint8Array(arrayBuffer);

    assertOpenableEpub(fileLike, content, prepared ? { maxBytes: MOBILE_EPUB_MAX_BYTES } : {});

    state.book = createBookRecord({
      content,
      ...(prepared ? { bookId: fileLike.bookId } : {}),
      title: fileLike.name.replace(/\.epub$/i, ""),
      filePath: fileLike.path || fileLike.name,
      settings: platform.isMobile ? { ...state.book.settings, fontSize: Number(storage.getItem('minsepubviewer.default-font-size')) || 18 } : state.book.settings
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
    ? t("annotations.selected", { quote: state.selectedQuote.slice(0, 80) })
    : t("annotations.selectText");
  elements.highlightButton.disabled = !state.selectedRange || !state.selectedQuote;
  elements.noteButton.disabled = !state.selectedRange || !state.selectedQuote || !elements.noteBody.value.trim();
  elements.exportAnnotationsButton.disabled = annotations.length === 0;

  if (!annotations.length) {
    elements.annotationList.className = "annotation-list empty";
    elements.annotationList.textContent = t("annotations.empty");
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
        : t("annotations.highlightMeta", { color: tOptional(`color.${annotation.color}`, annotation.color) });

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
        save.textContent = t("common.save");
        save.addEventListener("click", () => {
          saveEditedNote(annotation, textarea);
        });

        const cancel = document.createElement("button");
        cancel.className = "annotation-remove";
        cancel.type = "button";
        cancel.textContent = t("common.cancel");
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
        edit.textContent = t("common.edit");
        edit.addEventListener("click", () => {
          startEditingNote(annotation);
        });
        actions.appendChild(edit);
      }

      const remove = document.createElement("button");
      remove.className = "annotation-remove";
      remove.type = "button";
      remove.textContent = t("common.remove");
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
  elements.searchButton.disabled = state.searching || !(state.rendition || state.pdf || state.docReader);
  elements.searchStatus.className = state.searchResults.length ? "empty search-summary" : "empty";
  elements.searchStatus.textContent = state.searchStatus || (
    state.rendition || state.pdf || state.docReader ? t("search.enterTerm") : t("search.openFirst")
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
    elements.tocList.textContent = state.rendition || state.pdf || state.docReader
      ? t("toc.none")
      : t("toc.empty");
    return;
  }

  elements.tocList.className = "toc-list";
  elements.tocList.replaceChildren(
    ...items.map(({ item, depth }) => {
      const button = document.createElement("button");
      const href = item.href || "";
      const label = item.label || href || t("toc.untitled");
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

  elements.bookTitle.textContent = state.book.bookId === "sample-book" ? t("book.placeholderTitle") : state.book.title;
  if (state.markdownExporting) {
    elements.bookMeta.textContent = t("epub.converting");
  } else if (state.contentWarning) {
    elements.bookMeta.textContent = state.contentWarning;
  } else {
    elements.bookMeta.textContent = state.mode === "pdf" && state.pdf && state.pdfMeta
      ? t("pdf.meta", state.pdfMeta)
      : state.mode === "document" && state.docReader && state.docMeta
        ? t("document.meta", state.docMeta)
        : state.bookMeta || t("book.placeholderMeta");
  }
  renderPageNavigation();
  if (state.pdf) state.progressLabel = t("pdf.progress", { page: state.pdf.pageNumber, total: state.pdf.pageCount });
  if (state.docReader?.document) state.progressLabel = docProgressLabel();
  elements.locationLabel.textContent = state.rendition || state.pdf || state.docReader
    ? state.progressLabel || t("settings.locationSaved")
    : state.book.lastLocation || "page-1";
  elements.zoomLabel.textContent = `${Math.round(settings.zoom * 100)}%`;

  elements.fontFamily.value = settings.fontFamily;
  elements.fontSize.value = String(settings.fontSize);
  elements.lineHeight.value = String(settings.lineHeight);
  elements.margin.value = String(settings.margin);
  elements.theme.value = settings.theme;
  elements.languageSelect.value = getLanguagePreference();
  elements.textOnly.checked = settings.textOnly;
  const fontStatus = getFontStatus(settings);
  elements.fontStatus.textContent = fontStatus.message;
  elements.fontStatus.classList.toggle("is-warning", fontStatus.warning);

  elements.reader.style.setProperty("--reader-font", getReaderFont(settings) || "system-ui");
  elements.reader.style.setProperty("--reader-font-size", getZoomedFontSize(settings));
  elements.reader.style.setProperty("--reader-line-height", settings.lineHeight);
  elements.reader.style.setProperty("--reader-margin", settings.margin);
  elements.markdownWorkspace.style.setProperty("--markdown-zoom", settings.zoom * (platform.isMobile ? settings.fontSize / 18 : 1));

  elements.reader.classList.toggle("reader-continuous", settings.viewMode === "continuous");
  elements.reader.classList.toggle("reader-paginated", settings.viewMode === "paginated");
  elements.bookmarkButton.classList.toggle("is-active", hasBookmarkAtCurrentLocation());
  elements.bookmarkButton.setAttribute("aria-pressed", String(hasBookmarkAtCurrentLocation()));
  elements.prevSearchResultButton.disabled = !state.searchResults.length || state.searching;
  elements.nextSearchResultButton.disabled = !state.searchResults.length || state.searching;
  elements.exportMarkdownButton.disabled = !state.epubBook || state.markdownExporting;
  elements.exportMarkdownButton.textContent = state.markdownExporting ? t("toolbar.exporting") : t("toolbar.exportMarkdown");
  elements.paginatedModeButton.classList.toggle("is-active", settings.viewMode === "paginated");
  elements.continuousModeButton.classList.toggle("is-active", settings.viewMode === "continuous");
  elements.textOnlyToolbarButton.classList.toggle("is-active", settings.textOnly);
  elements.paginatedModeButton.setAttribute("aria-pressed", String(settings.viewMode === "paginated"));
  elements.continuousModeButton.setAttribute("aria-pressed", String(settings.viewMode === "continuous"));
  elements.textOnlyToolbarButton.setAttribute("aria-pressed", String(settings.textOnly));

  document.body.classList.toggle("theme-dark", settings.theme === "dark");
  document.body.classList.toggle("theme-sepia", settings.theme === "sepia");
  document.body.classList.toggle("text-only", settings.textOnly);
  document.body.classList.toggle("pdf-mode", state.mode === "pdf");
  document.body.classList.toggle("doc-mode", state.mode === "document");
  elements.docWorkspace.hidden = state.mode !== "document";
  elements.pdfWorkspace.hidden = state.mode !== "pdf";
  elements.pdfActions.hidden = state.mode !== "pdf";
  renderPdfControls();

  renderMarkdownChrome();

  renderBookmarks();
  renderToc();
  renderSearch();
  renderSidebarTabs();
  renderAnnotations();
  renderDocumentTabs();
}

function renderPageNavigation() {
  if (mobileNavigation) {
    const active = state.mode === "pdf"
      ? Boolean(state.pdf)
      : state.mode === "document"
      ? Boolean(state.docReader?.document)
      : state.mode === "epub" ? Boolean(state.rendition) : state.markdown.viewMode === "view";
    mobileNavigation.bar.hidden = !active;
    const markdown = state.mode === "markdown";
    const pagination = markdown ? getViewportPageState(getMarkdownViewportMetrics()) : null;
    mobileNavigation.label.textContent = markdown ? `${pagination.page} / ${pagination.pageCount}` : state.progressLabel || "EPUB";
    mobileUI?.progress(mobileNavigation.label.textContent);
    mobileNavigation.prev.disabled = !active || (markdown ? pagination.atStart : Boolean(state.mode === "pdf" ? state.pdf?.atStart : state.mode === "document" ? state.docReader?.pageState.atStart : getRenditionLocation()?.atStart));
    mobileNavigation.next.disabled = !active || (markdown ? pagination.atEnd : Boolean(state.mode === "pdf" ? state.pdf?.atEnd : state.mode === "document" ? state.docReader?.pageState.atEnd : getRenditionLocation()?.atEnd));
    const bookmarked = hasBookmarkAtCurrentLocation();
    mobileNavigation.mark.classList.toggle("is-active", bookmarked);
    mobileNavigation.mark.setAttribute("aria-pressed", String(bookmarked));
  }
  if (state.mode === "markdown") {
    const pagination = getViewportPageState(getMarkdownViewportMetrics());
    elements.pageLabel.textContent = `${pagination.page} / ${pagination.pageCount}`;
    elements.prevButton.disabled = state.markdown.viewMode !== "view" || pagination.atStart;
    elements.nextButton.disabled = state.markdown.viewMode !== "view" || pagination.atEnd;
    return;
  }

  if (state.mode === "document") {
    const pageState = state.docReader?.document ? state.docReader.pageState : null;
    elements.pageLabel.textContent = pageState ? t("pdf.progress", { page: pageState.page, total: pageState.pageCount }) : "-";
    elements.prevButton.disabled = !pageState || pageState.atStart;
    elements.nextButton.disabled = !pageState || pageState.atEnd;
    return;
  }

  if (state.mode === "pdf") {
    elements.pageLabel.textContent = state.pdf ? t("pdf.progress", { page: state.pdf.pageNumber, total: state.pdf.pageCount }) : "PDF";
    elements.prevButton.disabled = !state.pdf || state.pdf.atStart;
    elements.nextButton.disabled = !state.pdf || state.pdf.atEnd;
    return;
  }

  elements.pageLabel.textContent = state.rendition
    ? state.progressLabel || "EPUB"
    : `${state.page} / ${state.pageCount}`;
  elements.prevButton.disabled = !state.rendition && state.page <= 1;
  elements.nextButton.disabled = !state.rendition && state.page >= state.pageCount;
}

function renderMarkdownChrome(statusMessage = "") {
  const active = state.mode === "markdown";
  const viewing = state.markdown.viewMode === "view";

  document.body.classList.toggle("markdown-mode", active);
  document.body.classList.toggle("markdown-viewing-mode", active && viewing);
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
  const markdownLocation = state.markdown.path || t("markdown.unsaved");
  elements.bookMeta.textContent = state.markdown.saving
    ? t("markdown.saving")
    : statusMessage || (state.markdown.largeDocument
      ? `${markdownLocation} · ${state.markdown.largeEditMode === "wysiwyg" ? t("markdown.largeWysiwyg") : t("markdown.largeText")}`
      : markdownLocation);
  elements.markdownEditButton.classList.toggle("is-active", !viewing);
  elements.markdownViewButton.classList.toggle("is-active", viewing);
  elements.markdownLargeModeButton.hidden = !(
    !viewing &&
    state.markdown.largeDocument &&
    state.markdown.largeEditMode === "wysiwyg"
  );
  elements.saveMarkdownButton.disabled = state.markdown.saving || (!state.markdown.dirty && Boolean(state.markdown.path));
  elements.saveMarkdownAsButton.disabled = state.markdown.saving;
}

elements.bookInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  elements.bookInput.value = "";
  for (const file of files) await addDocumentTab({ kind: getOpenFileKind(file.name) === "pdf" ? "pdf" : "epub", file });
});

elements.openBookButton.addEventListener("click", async (event) => {
  if (!platform?.openEpubFile) {
    return;
  }

  event.preventDefault();
  try {
    const file = await platform.openEpubFile();
    if (file) await addDocumentTab({ kind: getOpenFileKind(file.name) === "pdf" ? "pdf" : "epub", file });
  } catch (error) {
    window.alert(t("error.openBook", { detail: errorText(error) }));
  }
});

// One open button for every supported format; the browser falls back to the file input.
elements.openFileButton.addEventListener("click", async (event) => {
  const open = platform?.openDocument || platform?.openFile;
  if (!open) {
    return;
  }

  event.preventDefault();
  try {
    const payload = await open();
    if (payload) await addDocumentTab(payload);
  } catch (error) {
    logClient("file.open.failed", { error: formatError(error) });
    window.alert(t("error.openFile", { detail: errorText(error) }));
  }
});

elements.newMarkdownButton.addEventListener("click", async () => {
  await addDocumentTab({ kind: "markdown", document: {
    name: "untitled.md",
    content: t("markdown.newContent"),
    viewMode: "edit"
  }});
  state.markdown.savedContent = "";
  state.markdown.dirty = true;
  snapshotActiveTab();
  render();
});

elements.fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  elements.fileInput.value = "";
  for (const file of files) {
    const kind = getOpenFileKind(file.name) || "markdown";
    if (kind === "markdown") await addDocumentTab({ kind, document: { name: file.name, content: await file.text() } });
    else await addDocumentTab({ kind, file });
  }
});

function closeRecentFilesMenu() {
  elements.recentFilesMenu.hidden = true;
  elements.recentFilesButton.setAttribute("aria-expanded", "false");
}

function positionRecentFilesMenu() {
  if (elements.recentFilesMenu.hidden) return;

  const buttonRect = (platform.isMobile ? document.querySelector('#mobileRecent') : elements.recentFilesButton).getBoundingClientRect();
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

  const recent = await platform?.getRecentFiles?.() || [];
  if (elements.recentFilesMenu.hidden) return;

  if (!recent.length) {
    const empty = document.createElement("span");
    empty.className = "recent-file-item";
    empty.setAttribute("role", "status");
    empty.textContent = t("recent.empty");
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
      try {
        const payload = await platform.openRecentFile(entry.path);
        if (payload) await addDocumentTab(payload);
      } catch (error) {
        window.alert(t("error.openRecent", { detail: errorText(error) }));
      }
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
    !document.querySelector('#mobileRecent')?.contains(event.target) &&
    !elements.recentFilesButton.contains(event.target)
  ) {
    closeRecentFilesMenu();
  }
});
window.addEventListener("resize", positionRecentFilesMenu);
elements.recentFilesButton.closest(".toolbar-tools")?.addEventListener("scroll", positionRecentFilesMenu, { passive: true });

elements.markdownEditButton.addEventListener("click", showMarkdownEditMode);
elements.markdownViewButton.addEventListener("click", showMarkdownViewMode);
elements.markdownLargeModeButton.addEventListener("click", () => {
  void switchWysiwygToLargeMarkdown();
});
elements.saveMarkdownButton.addEventListener("click", () => saveMarkdown(false));
elements.saveMarkdownAsButton.addEventListener("click", () => saveMarkdown(true));
elements.closeMarkdownButton.addEventListener("click", closeMarkdown);
elements.markdownEditor.addEventListener("paste", handleLargeMarkdownPaste, true);

elements.reader.addEventListener("wheel", handleWheelEvent, { passive: false });
elements.markdownWorkspace.addEventListener("wheel", handleMarkdownWheelEvent, {
  passive: false,
  capture: true
});
elements.reader.addEventListener("mousedown", () => {
  hideSelectionToolbar();
});

elements.markdownViewer.addEventListener("mouseup", () => requestAnimationFrame(captureMarkdownSelection));
if (platform.isMobile) {
  mobileUI = installMobileUI({ storage, platform, resize: () => refreshRenditionLayout(state.book.lastLocation),
    openFile: async () => { const payload = await platform.openFile(); if (payload) await addDocumentTab(payload); },
    tabs: () => state.tabs, activeTab: () => state.activeTabId, activate: activateDocumentTab, closeTab: closeDocumentTab });
  document.addEventListener("selectionchange", () => {
    if (state.mode === "markdown" && state.markdown.viewMode === "view") requestAnimationFrame(captureMarkdownSelection);
  });
}
elements.markdownViewer.addEventListener("mousedown", () => hideSelectionToolbar());
elements.markdownViewer.addEventListener("scroll", () => {
  rememberMarkdownViewPosition();
  renderPageNavigation();
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
  // PDF bookmarks mark a page; the stored offset and zoom do not need to match.
  const sameLocation = (bookmark) => state.mode === "pdf"
    ? parsePdfLocation(bookmark.location)?.pageNumber === state.pdf?.pageNumber
    : state.mode === "document"
      ? state.docReader?.pageForLocation(bookmark.location) === state.docReader?.pageState.page
      : bookmark.location === location;
  const exists = state.book.bookmarks.some(sameLocation);

  if (exists) {
    state.book = {
      ...state.book,
      bookmarks: state.book.bookmarks.filter((bookmark) => !sameLocation(bookmark))
    };
  } else {
    state.book = {
      ...state.book,
      bookmarks: [
        ...state.book.bookmarks,
        createBookmark({
          bookId: state.book.bookId,
          location,
          label: state.mode === "pdf"
            ? t("bookmarks.pageLabel", { page: state.pdf?.pageNumber || 1 })
            : state.rendition
              ? t("bookmarks.epubLabel", { progress: state.progressLabel || "EPUB" })
              : t("bookmarks.pageLabel", { page: state.page })
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
  void exportAnnotations().catch((error) => window.alert(t("error.export", { detail: errorText(error) })));
});
elements.noteBody.addEventListener("input", () => {
  renderAnnotations();
});
elements.pdfZoomOutButton.addEventListener("click", () => state.pdf?.zoomOut());
elements.pdfZoomInButton.addEventListener("click", () => state.pdf?.zoomIn());
elements.pdfZoomSelect.addEventListener("change", () => {
  if (elements.pdfZoomSelect.value !== "custom") state.pdf?.setZoom(elements.pdfZoomSelect.value);
});
elements.pdfRotateButton.addEventListener("click", () => state.pdf?.rotate());
elements.pdfSpreadButton.addEventListener("click", () => {
  if (!state.pdf) return;
  state.pdf.setSpread(!state.pdf.spread);
  storage.setItem(PDF_SPREAD_KEY, String(state.pdf.spread));
  renderPdfControls();
});
elements.pdfContainer.addEventListener("wheel", (event) => {
  if (!state.pdf || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  if (event.deltaY < 0) state.pdf.zoomIn();
  else state.pdf.zoomOut();
}, { passive: false });
// A new press on the page starts a new selection; presses in the side panel keep it for notes.
elements.pdfContainer.addEventListener("pointerdown", () => {
  if (state.pdfSelection) clearPdfSelection();
});
elements.selectionToolbar.addEventListener("mousedown", (event) => event.preventDefault());
elements.fullscreenButton.addEventListener("click", () => void toggleDesktopFullscreen());
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  document.body.classList.toggle("desktop-fullscreen", active);
  elements.fullscreenButton.classList.toggle("is-active", active);
  elements.fullscreenButton.setAttribute("aria-pressed", String(active));
  refreshRenditionLayoutSoon();
});
elements.languageSelect.addEventListener("change", () => {
  setLanguagePreference(elements.languageSelect.value);
});
onLanguageChange((locale) => {
  platform?.setLocale?.(locale);
  render();
});
platform?.setLocale?.(getLocale());
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
  if (event.key === "F11" && !platform.isMobile) {
    event.preventDefault();
    void toggleDesktopFullscreen();
    return;
  }

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
    if (state.markdown.viewMode === "view" && event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    }
    if (state.markdown.viewMode === "view" && event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
    }
    return;
  }

  if (event.key === "ArrowRight") {
    goNext();
  }

  if (event.key === "ArrowLeft") {
    goPrevious();
  }
});

let windowCloseApproved = false;
let windowCloseInProgress = false;

platform?.onWindowCloseRequested?.(() => {
  if (windowCloseInProgress) return;
  windowCloseInProgress = true;

  void (async () => {
    snapshotActiveTab();
    const activeTab = getActiveTab();
    if (["epub", "pdf", "document"].includes(activeTab?.kind) && !await resolveUnsavedEpubTab(activeTab)) {
      windowCloseInProgress = false;
      platform.completeWindowClose(false);
      return;
    }
    const dirtyTabIds = state.tabs
      .filter((tab) => tab.kind === "markdown" && tab.markdown?.dirty)
      .map((tab) => tab.id);

    for (const tabId of dirtyTabIds) {
      const tab = state.tabs.find((item) => item.id === tabId);
      if (tab && !await resolveUnsavedMarkdownTab(tab)) {
        windowCloseInProgress = false;
        platform.completeWindowClose(false);
        return;
      }
    }

    windowCloseApproved = true;
    platform.completeWindowClose(true);
  })().catch((error) => {
    windowCloseInProgress = false;
    logClient("window.close.failed", { error: formatError(error) });
    platform.completeWindowClose(false);
  });
});

window.addEventListener("beforeunload", (event) => {
  flushPdfLocation();
  flushDocLocation();
  if (platform.isMobile) { saveMobileSession(); return; }
  if (windowCloseApproved) return;
  snapshotActiveTab();
  if (state.tabs.some((tab) => tab.kind === "markdown" && tab.markdown?.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});

installFileDropHandlers(document);
platform?.onOpenFile?.((payload) => {
  void openFilePayload(payload);
});
platform?.onOpenFileError?.((payload) => {
  window.alert(t("error.openNamed", {
    name: payload?.name || t("common.file"),
    detail: payload?.message ? errorText({ message: payload.message }) : t("common.unknownError")
  }));
});
platform?.readyForOpenFiles?.();

applyPanelState({ persist: false, refresh: false });
render();

if (platform.isMobile) {
  mobileNavigation = createMobileNavigation({ app: elements.app,
    previous: () => turnMobilePage("previous"), next: () => turnMobilePage("next"),
    bookmark: () => elements.bookmarkButton.click() });
  installMobileTouch(elements.reader);
  installMobileTouch(elements.markdownWorkspace);
  // PDF pages are rescaled by PDF.js while the fingers move (sharp redraw shortly after).
  // Top/bottom taps always page (scrolling a zoomed page first); swipes turn pages only while the page fits.
  let pdfPinchRatio = 1;
  installReaderTouch(elements.pdfContainer, {
    pinch: {
      begin: () => { pdfPinchRatio = 1; },
      move: (ratio, center) => {
        const factor = ratio / pdfPinchRatio;
        if (Math.abs(factor - 1) < 0.02) return;
        pdfPinchRatio = ratio;
        state.pdf?.pinchZoom(factor, center);
      },
      end: () => renderPdfControls()
    },
    viewport: elements.pdfContainer,
    enabled: () => state.mode === "pdf" && Boolean(state.pdf),
    paginated: () => state.book.settings.viewMode !== "continuous" &&
      elements.pdfContainer.scrollHeight <= elements.pdfContainer.clientHeight + 2 &&
      elements.pdfContainer.scrollWidth <= elements.pdfContainer.clientWidth + 2,
    navigate: (direction) => { state.pdf?.step(direction); },
    // Page mode shows one page; scrolling past its end moves to the next one.
    scrollElement: elements.pdfContainer,
    edgePaging: () => state.book.settings.viewMode !== "continuous",
    center: () => mobileUI?.center(),
    onError: (error) => window.alert(t("error.pageTurn", { detail: errorText(error) }))
  });
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.rendition?.manager) refreshRenditionAtCurrentSize(state.book.lastLocation); }, 150);
  }).observe(elements.reader);
  renderPageNavigation();
  const saveBeforeBackground = async () => {
    saveMobileSession();
    await platform.flush();
  };
  platform.onBackground(saveBeforeBackground);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void saveBeforeBackground().catch(console.error);
  });
  let handlingBack = false;
  platform.onBackButton(async () => {
    if (handlingBack) return;
    handlingBack = true;
    try {
      if (mobileUI.back()) return;
      if (!elements.recentFilesMenu.hidden) { closeRecentFilesMenu(); return; }
      if (!state.ui.leftPanelCollapsed || !state.ui.rightPanelCollapsed) {
        state.ui.leftPanelCollapsed = true;
        state.ui.rightPanelCollapsed = true;
        applyPanelState();
        return;
      }
      if (state.tabs.length) {
        await closeDocumentTab(state.activeTabId);
        saveMobileSession();
        await platform.flush();
        return;
      }
      await platform.exit();
    } finally { handlingBack = false; }
  });
  void restoreMobileSession().catch((error) => window.alert(t("error.restoreSession", { detail: errorText(error) })))
    .then(() => platform.onExternalDocument?.(async payload => {
      await addDocumentTab(payload);
      saveMobileSession();
      await platform.flush();
    })).catch(console.error);
}
