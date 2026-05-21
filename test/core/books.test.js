import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBookId,
  createBookRecord,
  updateBookSettings,
  updateLastLocation
} from "../../src/core/books.js";

test("computeBookId returns the same id for the same content", () => {
  assert.equal(computeBookId("epub content"), computeBookId("epub content"));
});

test("computeBookId rejects unsupported input", () => {
  assert.throws(() => computeBookId(null), /content must be/);
});

test("createBookRecord builds a book from content", () => {
  const book = createBookRecord({
    content: "epub content",
    title: " My Book ",
    filePath: "C:/books/my-book.epub"
  });

  assert.equal(book.bookId.length, 64);
  assert.equal(book.title, "My Book");
  assert.equal(book.filePath, "C:/books/my-book.epub");
  assert.equal(book.settings.theme, "light");
  assert.deepEqual(book.bookmarks, []);
});

test("createBookRecord accepts an explicit book id", () => {
  const book = createBookRecord({
    bookId: "explicit-id",
    title: "Book"
  });

  assert.equal(book.bookId, "explicit-id");
});

test("updateLastLocation stores a trimmed location", () => {
  const book = createBookRecord({ bookId: "book-1", title: "Book" });
  const updated = updateLastLocation(book, " epubcfi(/6/2) ");

  assert.equal(updated.lastLocation, "epubcfi(/6/2)");
  assert.equal(typeof updated.updatedAt, "string");
});

test("updateLastLocation rejects an empty location", () => {
  const book = createBookRecord({ bookId: "book-1", title: "Book" });

  assert.throws(() => updateLastLocation(book, ""), /location is required/);
});

test("updateBookSettings merges and normalizes settings", () => {
  const book = createBookRecord({
    bookId: "book-1",
    title: "Book",
    settings: { theme: "dark", fontSize: 20 }
  });

  const updated = updateBookSettings(book, { textOnly: true, fontSize: 99 });

  assert.equal(updated.settings.theme, "dark");
  assert.equal(updated.settings.textOnly, true);
  assert.equal(updated.settings.fontSize, 42);
});

