// Moving reading records between the desktop and the phone: one JSON file with the library (reading
// positions, bookmarks, highlights, notes per book) and the Markdown annotations. Books are matched
// by id, which comes from the content (EPUB and converted documents: a hash of the file; PDF: its
// fingerprint), so the same file on another device finds its record.
import { createBookRecord } from "./books.js";
import { createLibraryState } from "./library.js";
import { createMarkdownAnnotationState } from "./markdownAnnotations.js";

export const TRANSFER_FORMAT = "mins-reader-records";
export const TRANSFER_VERSION = 1;
const ANNOTATION_LISTS = ["bookmarks", "highlights", "notes", "textBoxes"];

export function createRecordsTransfer({ library, markdownAnnotations, exportedAt = new Date().toISOString() }) {
  return {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt,
    library: createLibraryState(library),
    markdownAnnotations: createMarkdownAnnotationState(markdownAnnotations)
  };
}

export function parseRecordsTransfer(text) {
  let data;
  try {
    data = JSON.parse(String(text || ""));
  } catch {
    throw new Error("records.invalidFile");
  }
  if (!data || data.format !== TRANSFER_FORMAT || !data.library || !Array.isArray(data.library.books)) {
    throw new Error("records.invalidFile");
  }
  if (Number(data.version) > TRANSFER_VERSION) throw new Error("records.newerVersion");
  return {
    library: createLibraryState({ books: data.library.books.filter((book) => book && typeof book.bookId === "string" && book.bookId) }),
    markdownAnnotations: createMarkdownAnnotationState(data.markdownAnnotations)
  };
}

const time = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

// Items with the same id are the same annotation: the one changed last is kept. Others are added.
function mergeItems(local = [], incoming = []) {
  const merged = [...local];
  let added = 0;
  for (const item of incoming) {
    if (!item || typeof item !== "object") continue;
    const index = item.id ? merged.findIndex((existing) => existing?.id === item.id) : -1;
    if (index < 0) {
      merged.push(item);
      added += 1;
    } else if (time(item.updatedAt || item.createdAt) > time(merged[index].updatedAt || merged[index].createdAt)) {
      merged[index] = item;
    }
  }
  return { items: merged, added };
}

// Merges imported records into the local ones. A book only on the other device is added (its file
// path there means nothing here and is dropped); a book on both keeps this device's file path and
// settings, takes the reading position saved last and gains the other device's annotations.
export function mergeRecords(local, incoming) {
  const books = [...local.library.books];
  const summary = { booksAdded: 0, booksUpdated: 0, annotationsAdded: 0 };
  for (const theirs of incoming.library.books) {
    const index = books.findIndex((book) => book.bookId === theirs.bookId);
    if (index < 0) {
      const added = createBookRecord({ ...theirs, filePath: "" });
      books.push(added);
      summary.booksAdded += 1;
      summary.annotationsAdded += ANNOTATION_LISTS.reduce((sum, list) => sum + added[list].length, 0);
      continue;
    }
    const ours = books[index];
    const merged = { ...ours };
    let changed = false;
    for (const list of ANNOTATION_LISTS) {
      const { items, added } = mergeItems(ours[list], theirs[list]);
      merged[list] = items;
      if (added) {
        summary.annotationsAdded += added;
        changed = true;
      }
    }
    if (theirs.lastLocation && time(theirs.updatedAt) > time(ours.updatedAt)) {
      merged.lastLocation = theirs.lastLocation;
      merged.updatedAt = theirs.updatedAt;
      changed = true;
    }
    if (changed) summary.booksUpdated += 1;
    books[index] = merged;
  }

  const documents = { ...local.markdownAnnotations.documents };
  for (const [key, theirs] of Object.entries(incoming.markdownAnnotations.documents || {})) {
    const ours = documents[key] || {};
    const bookmarks = mergeItems(ours.bookmarks, theirs?.bookmarks);
    const highlights = mergeItems(ours.highlights, theirs?.highlights);
    documents[key] = { ...ours, bookmarks: bookmarks.items, highlights: highlights.items };
    summary.annotationsAdded += bookmarks.added + highlights.added;
  }

  return {
    library: createLibraryState({ ...local.library, books }),
    markdownAnnotations: createMarkdownAnnotationState({ documents }),
    summary
  };
}
