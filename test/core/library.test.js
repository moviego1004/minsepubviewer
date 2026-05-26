import test from "node:test";
import assert from "node:assert/strict";
import {
  createLibraryState,
  getBookRecord,
  parseLibraryState,
  parseLibraryStateWithRecovery,
  serializeLibraryState,
  upsertBookRecord
} from "../../src/core/library.js";

test("createLibraryState normalizes stored books", () => {
  const library = createLibraryState({
    activeBookId: "book-1",
    books: [
      {
        bookId: "book-1",
        title: "Book",
        settings: { fontSize: 99 }
      }
    ]
  });

  assert.equal(library.version, 1);
  assert.equal(library.activeBookId, "book-1");
  assert.equal(library.books[0].settings.fontSize, 42);
});

test("upsertBookRecord adds a new active book", () => {
  const library = upsertBookRecord(createLibraryState(), {
    bookId: "book-1",
    title: "Book"
  });

  assert.equal(library.activeBookId, "book-1");
  assert.equal(library.books.length, 1);
});

test("upsertBookRecord replaces an existing book without duplicating it", () => {
  const first = upsertBookRecord(createLibraryState(), {
    bookId: "book-1",
    title: "First"
  });
  const second = upsertBookRecord(first, {
    bookId: "book-1",
    title: "Updated",
    lastLocation: "page-3"
  });

  assert.equal(second.books.length, 1);
  assert.equal(second.books[0].title, "Updated");
  assert.equal(second.books[0].lastLocation, "page-3");
});

test("getBookRecord returns null for unknown ids", () => {
  const library = createLibraryState();

  assert.equal(getBookRecord(library, "missing"), null);
});

test("library state serializes and parses safely", () => {
  const library = upsertBookRecord(createLibraryState(), {
    bookId: "book-1",
    title: "Book",
    settings: { theme: "dark" }
  });
  const parsed = parseLibraryState(serializeLibraryState(library));

  assert.equal(parsed.books[0].settings.theme, "dark");
  assert.deepEqual(parseLibraryState("{bad json"), createLibraryState());
});

test("library state can recover from backup data", () => {
  const backup = upsertBookRecord(createLibraryState(), {
    bookId: "book-1",
    title: "Recovered"
  });
  const result = parseLibraryStateWithRecovery("", serializeLibraryState(backup));

  assert.equal(result.recovered, true);
  assert.equal(result.source, "backup");
  assert.equal(result.library.books[0].title, "Recovered");
});

test("library state can recover when primary data is corrupt", () => {
  const backup = upsertBookRecord(createLibraryState(), {
    bookId: "book-1",
    title: "Recovered"
  });
  const result = parseLibraryStateWithRecovery("{bad json", serializeLibraryState(backup));

  assert.equal(result.recovered, true);
  assert.equal(result.source, "backup");
  assert.equal(result.library.books[0].title, "Recovered");
});

test("library recovery keeps valid primary data", () => {
  const primary = upsertBookRecord(createLibraryState(), {
    bookId: "book-1",
    title: "Primary"
  });
  const backup = upsertBookRecord(createLibraryState(), {
    bookId: "book-2",
    title: "Backup"
  });
  const result = parseLibraryStateWithRecovery(
    serializeLibraryState(primary),
    serializeLibraryState(backup)
  );

  assert.equal(result.recovered, false);
  assert.equal(result.source, "primary");
  assert.equal(result.library.books[0].title, "Primary");
});
