import test from "node:test";
import assert from "node:assert/strict";
import {
  createEpubContentSample,
  summarizeEpubContent
} from "../../src/core/epubDiagnostics.js";

test("createEpubContentSample normalizes text and media counters", () => {
  const sample = createEpubContentSample({
    text: "  First   second\nthird  ",
    imageCount: 2,
    mediaCount: 1,
    spineItemCount: 1
  });

  assert.equal(sample.textLength, "First second third".length);
  assert.equal(sample.wordCount, 3);
  assert.equal(sample.imageCount, 2);
  assert.equal(sample.mediaCount, 1);
});

test("summarizeEpubContent reports image-only EPUB content", () => {
  const summary = summarizeEpubContent([
    { imageCount: 8, mediaCount: 1, spineItemCount: 3 }
  ]);

  assert.equal(summary.textLength, 0);
  assert.equal(summary.warnings[0].code, "image-only");
});

test("summarizeEpubContent reports low selectable text", () => {
  const summary = summarizeEpubContent([
    { text: "short text", imageCount: 0 }
  ]);

  assert.equal(summary.warnings[0].code, "low-text");
});

test("summarizeEpubContent reports image-heavy content", () => {
  const summary = summarizeEpubContent(
    [{ textLength: 4, wordCount: 1, imageCount: 6, mediaCount: 1 }],
    { minTextChars: 1, imageHeavyRatio: 0.3 }
  );

  assert.equal(summary.warnings[0].code, "image-heavy");
});

test("summarizeEpubContent returns no warnings for text-rich content", () => {
  const summary = summarizeEpubContent([
    { textLength: 1000, wordCount: 160, imageCount: 1 }
  ]);

  assert.deepEqual(summary.warnings, []);
});
