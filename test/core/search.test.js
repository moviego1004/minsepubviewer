import test from "node:test";
import assert from "node:assert/strict";
import {
  canSearch,
  createSearchResult,
  getSearchNavigationIndex,
  limitSearchResults,
  normalizeSearchQuery
} from "../../src/core/search.js";

test("normalizeSearchQuery trims and collapses whitespace", () => {
  assert.equal(normalizeSearchQuery("  hello\n  world  "), "hello world");
});

test("canSearch requires at least two normalized characters", () => {
  assert.equal(canSearch("a"), false);
  assert.equal(canSearch("ab"), true);
  assert.equal(canSearch(" 한 "), false);
  assert.equal(canSearch("한국"), true);
});

test("limitSearchResults caps result lists", () => {
  assert.deepEqual(limitSearchResults([1, 2, 3], 2), [1, 2]);
  assert.deepEqual(limitSearchResults("bad", 2), []);
});

test("createSearchResult normalizes display fields", () => {
  const result = createSearchResult({
    cfi: "epubcfi(/6/2)",
    excerpt: "  some\n result  ",
    href: "chapter.xhtml",
    label: " Chapter 1 ",
    index: 2
  });

  assert.equal(result.id, "epubcfi(/6/2)-2");
  assert.equal(result.excerpt, "some result");
  assert.equal(result.label, "Chapter 1");
});

test("getSearchNavigationIndex wraps next and previous result movement", () => {
  assert.equal(getSearchNavigationIndex(-1, 3, "next"), 0);
  assert.equal(getSearchNavigationIndex(0, 3, "next"), 1);
  assert.equal(getSearchNavigationIndex(2, 3, "next"), 0);
  assert.equal(getSearchNavigationIndex(0, 3, "previous"), 2);
});

test("getSearchNavigationIndex returns -1 when there are no results", () => {
  assert.equal(getSearchNavigationIndex(0, 0, "next"), -1);
});
