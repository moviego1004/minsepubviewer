import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnnotationExport,
  createBookmark,
  createHighlight,
  createTextNote,
  updateTextNoteBody
} from "../../src/core/annotations.js";

test("bookmark creation requires a location", () => {
  assert.throws(
    () => createBookmark({ bookId: "book-1", location: "" }),
    /location is required/
  );
});

test("bookmark creation returns a stable string id and metadata", () => {
  const bookmark = createBookmark({
    bookId: "book-1",
    location: "epubcfi(/6/2)",
    label: " Chapter 1 "
  });

  assert.equal(typeof bookmark.id, "string");
  assert.equal(bookmark.type, "bookmark");
  assert.equal(bookmark.label, "Chapter 1");
});

test("highlight creation requires range and selected text", () => {
  assert.throws(
    () => createHighlight({ bookId: "book-1", location: "loc", range: "", quote: "text" }),
    /range is required/
  );

  assert.throws(
    () => createHighlight({ bookId: "book-1", location: "loc", range: "range", quote: "" }),
    /quote is required/
  );
});

test("highlight creation defaults to yellow", () => {
  const highlight = createHighlight({
    bookId: "book-1",
    location: "loc",
    range: "range",
    quote: "Selected text"
  });

  assert.equal(highlight.type, "highlight");
  assert.equal(highlight.color, "yellow");
});

test("text note creation requires body", () => {
  assert.throws(
    () => createTextNote({
      bookId: "book-1",
      location: "loc",
      range: "range",
      body: ""
    }),
    /body is required/
  );
});

test("text note creation stores quote and body", () => {
  const note = createTextNote({
    bookId: "book-1",
    location: "loc",
    range: "range",
    quote: " Selected text ",
    body: " My note "
  });

  assert.equal(note.type, "note");
  assert.equal(note.quote, "Selected text");
  assert.equal(note.body, "My note");
});

test("text note body can be updated", () => {
  const note = createTextNote({
    id: "note-1",
    bookId: "book-1",
    location: "loc",
    range: "range",
    body: "Original"
  });
  const updated = updateTextNoteBody(note, " Updated note ");

  assert.equal(updated.id, "note-1");
  assert.equal(updated.body, "Updated note");
  assert.equal(typeof updated.updatedAt, "string");
});

test("text note update requires a note and body", () => {
  const note = createTextNote({
    bookId: "book-1",
    location: "loc",
    range: "range",
    body: "Original"
  });

  assert.throws(() => updateTextNoteBody(null, "Body"), /note is required/);
  assert.throws(() => updateTextNoteBody(note, ""), /body is required/);
});

test("annotation export contains book metadata, highlights, and notes", () => {
  const highlight = createHighlight({
    id: "highlight-1",
    bookId: "book-1",
    location: "epubcfi(/6/2)",
    range: "epubcfi(/6/2)",
    quote: "Highlighted text",
    color: "green",
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  const note = createTextNote({
    id: "note-1",
    bookId: "book-1",
    location: "epubcfi(/6/4)",
    range: "epubcfi(/6/4)",
    quote: "Noted text",
    body: "Important",
    createdAt: "2026-01-01T00:00:01.000Z"
  });
  const exported = createAnnotationExport({
    bookId: "book-1",
    title: "Book",
    filePath: "book.epub",
    highlights: [highlight],
    notes: [note]
  });

  assert.equal(exported.version, 1);
  assert.equal(exported.book.title, "Book");
  assert.equal(exported.highlights[0].quote, "Highlighted text");
  assert.equal(exported.notes[0].body, "Important");
});

test("annotation export rejects missing book input", () => {
  assert.throws(() => createAnnotationExport(null), /book is required/);
});

