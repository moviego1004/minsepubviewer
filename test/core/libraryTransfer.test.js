import test from "node:test";
import assert from "node:assert/strict";
import { createLibraryState } from "../../src/core/library.js";
import { createRecordsTransfer, mergeRecords, normalizeDeleted, parseRecordsTransfer, recordDeleted } from "../../src/core/libraryTransfer.js";

const book = (input) => ({ title: "책", settings: {}, ...input });

test("records round-trip through the transfer file", () => {
  const library = createLibraryState({ books: [book({ bookId: "a", lastLocation: "epubcfi(/6/2)", highlights: [{ id: "h1", range: "r", quote: "q" }] })] });
  const markdownAnnotations = { version: 1, documents: { "markdown:c:/notes.md": { bookmarks: [{ id: "b1", line: 3 }], highlights: [] } } };
  const text = JSON.stringify(createRecordsTransfer({ library, markdownAnnotations, exportedAt: "2026-11-03T00:00:00.000Z" }));
  const parsed = parseRecordsTransfer(text);
  assert.equal(parsed.library.books[0].lastLocation, "epubcfi(/6/2)");
  assert.equal(parsed.library.books[0].highlights[0].id, "h1");
  assert.deepEqual(parsed.markdownAnnotations.documents["markdown:c:/notes.md"].bookmarks, [{ id: "b1", line: 3 }]);
});

test("other files are refused", () => {
  assert.throws(() => parseRecordsTransfer("not json"), { message: "records.invalidFile" });
  assert.throws(() => parseRecordsTransfer(JSON.stringify({ highlights: [] })), { message: "records.invalidFile" });
  assert.throws(() => parseRecordsTransfer(JSON.stringify({ format: "mins-reader-records", version: 9, library: { books: [] } })), { message: "records.newerVersion" });
});

test("merging adds new books without their paths and joins annotations of shared books", () => {
  const local = {
    library: createLibraryState({ books: [book({
      bookId: "shared", filePath: "C:/books/a.epub", lastLocation: "old", updatedAt: "2026-11-01T00:00:00.000Z",
      settings: { fontSize: 22 },
      highlights: [{ id: "h1", quote: "mine", createdAt: "2026-10-01T00:00:00.000Z" }]
    })] }),
    markdownAnnotations: { version: 1, documents: {} }
  };
  const incoming = {
    library: createLibraryState({ books: [
      book({
        bookId: "shared", filePath: "/app/documents/a.epub", lastLocation: "new", updatedAt: "2026-11-02T00:00:00.000Z",
        settings: { fontSize: 14 },
        highlights: [
          { id: "h1", quote: "edited there", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z" },
          { id: "h2", quote: "theirs" }
        ],
        bookmarks: [{ id: "b1", location: "x" }]
      }),
      book({ bookId: "phone-only", filePath: "/app/documents/b.pdf", lastLocation: "pdf:page=3" })
    ] }),
    markdownAnnotations: { version: 1, documents: { "markdown:/notes.md": { bookmarks: [{ id: "m1", line: 2 }], highlights: [] } } }
  };
  const { library, markdownAnnotations, summary } = mergeRecords(local, incoming);
  const shared = library.books.find((item) => item.bookId === "shared");
  assert.equal(shared.filePath, "C:/books/a.epub");
  assert.equal(shared.settings.fontSize, 22);
  assert.equal(shared.lastLocation, "new");
  assert.deepEqual(shared.highlights.map((item) => item.quote), ["edited there", "theirs"]);
  assert.equal(shared.bookmarks.length, 1);
  const added = library.books.find((item) => item.bookId === "phone-only");
  assert.equal(added.filePath, "");
  assert.equal(added.lastLocation, "pdf:page=3");
  assert.deepEqual(markdownAnnotations.documents["markdown:/notes.md"].bookmarks, [{ id: "m1", line: 2 }]);
  assert.deepEqual(summary, { booksAdded: 1, booksUpdated: 1, annotationsAdded: 3 });
});

test("an older position from the other device does not move this one back", () => {
  const local = { library: createLibraryState({ books: [book({ bookId: "a", lastLocation: "mine", updatedAt: "2026-11-03T00:00:00.000Z" })] }), markdownAnnotations: { documents: {} } };
  const incoming = { library: createLibraryState({ books: [book({ bookId: "a", lastLocation: "theirs", updatedAt: "2026-11-01T00:00:00.000Z" })] }), markdownAnnotations: { documents: {} } };
  const { library, summary } = mergeRecords(local, incoming);
  assert.equal(library.books[0].lastLocation, "mine");
  assert.deepEqual(summary, { booksAdded: 0, booksUpdated: 0, annotationsAdded: 0 });
});

test("an annotation deleted on one device stays deleted after merging the other device's copy", () => {
  const highlight = { id: "h1", quote: "q", createdAt: "2026-11-01T00:00:00.000Z" };
  const phone = { library: createLibraryState({ books: [book({ bookId: "a", highlights: [] })] }), markdownAnnotations: { documents: { m: { bookmarks: [], highlights: [] } } }, deleted: { h1: "2026-11-02T00:00:00.000Z", m1: "2026-11-02T00:00:00.000Z" } };
  const desktop = { library: createLibraryState({ books: [book({ bookId: "a", highlights: [highlight] })] }), markdownAnnotations: { documents: { m: { bookmarks: [{ id: "m1", line: 1, createdAt: "2026-11-01T00:00:00.000Z" }], highlights: [] } } }, deleted: {} };
  // The desktop takes the phone's file: its copy of the highlight goes.
  const onDesktop = mergeRecords(desktop, phone);
  assert.deepEqual(onDesktop.library.books[0].highlights, []);
  assert.deepEqual(onDesktop.markdownAnnotations.documents.m.bookmarks, []);
  assert.equal(onDesktop.deleted.h1, "2026-11-02T00:00:00.000Z");
  // The phone takes the desktop's file: the highlight does not come back.
  const onPhone = mergeRecords(phone, desktop);
  assert.deepEqual(onPhone.library.books[0].highlights, []);
  assert.equal(onPhone.summary.annotationsAdded, 0);
});

test("an annotation changed after its deletion elsewhere is kept, and old deletions expire", () => {
  const local = { library: createLibraryState({ books: [book({ bookId: "a", notes: [{ id: "n1", body: "b", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z" }] })] }), markdownAnnotations: { documents: {} } };
  const incoming = { library: createLibraryState({ books: [] }), markdownAnnotations: { documents: {} }, deleted: { n1: "2026-11-02T00:00:00.000Z" } };
  assert.equal(mergeRecords(local, incoming).library.books[0].notes.length, 1);
  const now = Date.parse("2026-11-03T00:00:00.000Z");
  assert.deepEqual(normalizeDeleted({ old: "2026-01-01T00:00:00.000Z", fresh: "2026-10-01T00:00:00.000Z" }, now), { fresh: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(Object.keys(recordDeleted({}, ["x", ""], "2026-11-03T00:00:00.000Z")), ["x"]);
});
