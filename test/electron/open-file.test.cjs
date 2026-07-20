const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  findSupportedFilePath,
  getSupportedFileKind
} = require("../../electron/open-file.cjs");

test("getSupportedFileKind recognizes EPUB and Markdown extensions", () => {
  assert.equal(getSupportedFileKind("book.EPUB"), "epub");
  assert.equal(getSupportedFileKind("notes.md"), "markdown");
  assert.equal(getSupportedFileKind("notes.MARKDOWN"), "markdown");
  assert.equal(getSupportedFileKind("notes.txt"), null);
});

test("findSupportedFilePath extracts an absolute file argument", () => {
  const filePath = path.resolve("C:/Books/sample.epub");

  assert.equal(
    findSupportedFilePath(["viewer.exe", "--flag", filePath], "C:/Elsewhere"),
    filePath
  );
});

test("findSupportedFilePath resolves a relative second-instance argument", () => {
  assert.equal(
    findSupportedFilePath(["viewer.exe", "draft.md"], "C:/Documents"),
    path.resolve("C:/Documents", "draft.md")
  );
});
