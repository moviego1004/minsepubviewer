import test from "node:test";
import assert from "node:assert/strict";
import {
  createBookmark,
  createHighlight,
  createTextNote
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

