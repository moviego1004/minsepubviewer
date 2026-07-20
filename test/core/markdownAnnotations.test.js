import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarkdownBookmark,
  createMarkdownHighlight,
  lineRangeFromSource,
  parseMarkdownAnnotationState
} from "../../src/core/markdownAnnotations.js";

test("markdown selection resolves to source line numbers", () => {
  assert.deepEqual(lineRangeFromSource("# Title\n\nHello world\nNext", "Hello world"), {
    startLine: 3, endLine: 3, startOffset: 9, endOffset: 20
  });
});

test("markdown annotations normalize line data", () => {
  assert.equal(createMarkdownBookmark(8).line, 8);
  assert.equal(createMarkdownHighlight({ startLine: 2, endLine: 4, quote: "text", color: "orange" }).color, "orange");
  assert.deepEqual(parseMarkdownAnnotationState("bad").documents, {});
});
