import { createBookRecord, updateBookSettings, updateLastLocation } from "../src/core/books.js";
import { createBookmark } from "../src/core/annotations.js";
import { applyZoomIntent, getWheelIntent } from "../src/core/readerControls.js";
import { DEFAULT_READING_SETTINGS, mergeReadingSettings } from "../src/core/settings.js";

const state = {
  book: createBookRecord({
    bookId: "sample-book",
    title: "Minse EPUB Viewer",
    settings: DEFAULT_READING_SETTINGS
  }),
  page: 1,
  pageCount: 5
};

const elements = {
  bookInput: document.querySelector("#bookInput"),
  bookTitle: document.querySelector("#bookTitle"),
  bookMeta: document.querySelector("#bookMeta"),
  reader: document.querySelector("#reader"),
  fontFamily: document.querySelector("#fontFamily"),
  fontSize: document.querySelector("#fontSize"),
  lineHeight: document.querySelector("#lineHeight"),
  theme: document.querySelector("#theme"),
  textOnly: document.querySelector("#textOnly"),
  zoomLabel: document.querySelector("#zoomLabel"),
  locationLabel: document.querySelector("#locationLabel"),
  pageLabel: document.querySelector("#pageLabel"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  bookmarkButton: document.querySelector("#bookmarkButton"),
  bookmarkList: document.querySelector("#bookmarkList")
};

function setPage(nextPage) {
  state.page = Math.min(state.pageCount, Math.max(1, nextPage));
  state.book = updateLastLocation(state.book, `page-${state.page}`);
  render();
}

function updateSettings(patch) {
  state.book = updateBookSettings(state.book, patch);
  render();
}

function renderBookmarks() {
  const bookmarks = state.book.bookmarks;

  if (!bookmarks.length) {
    elements.bookmarkList.className = "empty";
    elements.bookmarkList.textContent = "아직 북마크가 없습니다.";
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
        const page = Number(bookmark.location.replace("page-", ""));
        if (Number.isFinite(page)) {
          setPage(page);
        }
      });
      return button;
    })
  );
}

function render() {
  const settings = mergeReadingSettings(state.book.settings, {});
  const fontMap = {
    system: '"Segoe UI", system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    "sans-serif": '"Segoe UI", Arial, sans-serif',
    monospace: '"Cascadia Mono", Consolas, monospace'
  };

  elements.bookTitle.textContent = state.book.title;
  elements.pageLabel.textContent = `${state.page} / ${state.pageCount}`;
  elements.locationLabel.textContent = state.book.lastLocation || "page-1";
  elements.zoomLabel.textContent = `${Math.round(settings.zoom * 100)}%`;

  elements.fontFamily.value = settings.fontFamily;
  elements.fontSize.value = String(settings.fontSize);
  elements.lineHeight.value = String(settings.lineHeight);
  elements.theme.value = settings.theme;
  elements.textOnly.checked = settings.textOnly;

  elements.reader.style.setProperty("--reader-font", fontMap[settings.fontFamily] || fontMap.system);
  elements.reader.style.setProperty("--reader-font-size", settings.fontSize);
  elements.reader.style.setProperty("--reader-line-height", settings.lineHeight);
  elements.reader.style.setProperty("--reader-zoom", settings.zoom);

  document.body.classList.toggle("theme-dark", settings.theme === "dark");
  document.body.classList.toggle("theme-sepia", settings.theme === "sepia");
  document.body.classList.toggle("text-only", settings.textOnly);

  renderBookmarks();
}

elements.bookInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  const content = new Uint8Array(await file.arrayBuffer());
  state.book = createBookRecord({
    content,
    title: file.name.replace(/\.epub$/i, ""),
    filePath: file.name,
    settings: state.book.settings
  });
  state.page = 1;
  elements.bookMeta.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  render();
});

elements.reader.addEventListener("wheel", (event) => {
  const intent = getWheelIntent(event);

  if (intent.type === "none") {
    return;
  }

  event.preventDefault();

  if (intent.type === "zoom") {
    state.book = {
      ...state.book,
      settings: applyZoomIntent(state.book.settings, intent)
    };
    render();
    return;
  }

  setPage(intent.direction === "next" ? state.page + 1 : state.page - 1);
}, { passive: false });

elements.prevButton.addEventListener("click", () => setPage(state.page - 1));
elements.nextButton.addEventListener("click", () => setPage(state.page + 1));

elements.bookmarkButton.addEventListener("click", () => {
  const location = `page-${state.page}`;
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
          label: `${state.page} 페이지`
        })
      ]
    };
  }

  render();
});

elements.fontFamily.addEventListener("change", () => updateSettings({ fontFamily: elements.fontFamily.value }));
elements.fontSize.addEventListener("input", () => updateSettings({ fontSize: Number(elements.fontSize.value) }));
elements.lineHeight.addEventListener("input", () => updateSettings({ lineHeight: Number(elements.lineHeight.value) }));
elements.theme.addEventListener("change", () => updateSettings({ theme: elements.theme.value }));
elements.textOnly.addEventListener("change", () => updateSettings({ textOnly: elements.textOnly.checked }));

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    setPage(state.page + 1);
  }

  if (event.key === "ArrowLeft") {
    setPage(state.page - 1);
  }
});

render();

