import test from "node:test";
import assert from "node:assert/strict";
import {
  findEmbeddedMarkdownImages,
  getTextOffsetFromMarkdownPosition,
  insertTextAtMarkdownSelection,
  prefixMarkdownSelectedLines,
  wrapMarkdownTextSelection,
  shouldUsePlainTextMarkdownEditor
} from "../../src/core/markdownEditing.js";

test("large markdown detection checks both character and line counts", () => {
  assert.equal(shouldUsePlainTextMarkdownEditor("a".repeat(10), { characterThreshold: 10 }), true);
  assert.equal(shouldUsePlainTextMarkdownEditor("a\nb\nc", { characterThreshold: 100, lineThreshold: 3 }), true);
  assert.equal(shouldUsePlainTextMarkdownEditor("short\ntext", { characterThreshold: 100, lineThreshold: 3 }), false);
});

test("markdown positions convert from one-based line and column values", () => {
  const content = "first\nsecond\nthird";

  assert.equal(getTextOffsetFromMarkdownPosition(content, [1, 1]), 0);
  assert.equal(getTextOffsetFromMarkdownPosition(content, [2, 3]), 8);
  assert.equal(getTextOffsetFromMarkdownPosition(content, [99, 1]), content.length);
});

test("large pasted text replaces the current markdown selection", () => {
  assert.deepEqual(
    insertTextAtMarkdownSelection("first\nsecond", "PASTE", [2, 2], [2, 5]),
    {
      content: "first\nsPASTEnd",
      selectionStart: 12,
      selectionEnd: 12
    }
  );
});

test("inline markdown formatting wraps selected text", () => {
  assert.deepEqual(
    wrapMarkdownTextSelection("alpha beta", 6, 10, { before: "**", placeholder: "굵은 텍스트" }),
    { content: "alpha **beta**", selectionStart: 8, selectionEnd: 12 }
  );
});

test("block markdown formatting prefixes all selected lines", () => {
  assert.deepEqual(
    prefixMarkdownSelectedLines("# one\ntwo\nthree", 0, 9, "## ", { stripPattern: /^#{1,6}\s+/u }),
    { content: "## one\n## two\nthree", selectionStart: 0, selectionEnd: 13 }
  );
});

test("embedded markdown images are extracted without decoding base64 data", () => {
  const images = findEmbeddedMarkdownImages([
    "![cover](data:image/png;base64,QUJD)",
    "<img alt=\"inside\" src=\"data:image/jpeg;base64,REVG\">"
  ].join("\n"));

  assert.deepEqual(images, [
    { alt: "cover", src: "data:image/png;base64,QUJD" },
    { alt: "inside", src: "data:image/jpeg;base64,REVG" }
  ]);
});
