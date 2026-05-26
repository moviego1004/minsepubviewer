import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOpenableEpub,
  describeEpubOpenFailure,
  getEpubOpenProblem
} from "../../src/core/epubValidation.js";

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const TEXT_BYTES = new Uint8Array([0x41, 0x42, 0x43]);

test("getEpubOpenProblem accepts normal EPUB file metadata and ZIP bytes", () => {
  const problem = getEpubOpenProblem(
    { name: "book.epub", type: "application/epub+zip", size: ZIP_BYTES.byteLength },
    ZIP_BYTES
  );

  assert.equal(problem, null);
});

test("getEpubOpenProblem rejects missing files", () => {
  assert.equal(getEpubOpenProblem(null, null).code, "missing-file");
});

test("getEpubOpenProblem rejects unsupported names and mime types", () => {
  assert.equal(
    getEpubOpenProblem({ name: "book.pdf", type: "application/pdf", size: 100 }, ZIP_BYTES).code,
    "unsupported-file"
  );
});

test("getEpubOpenProblem rejects empty EPUB payloads", () => {
  assert.equal(
    getEpubOpenProblem({ name: "empty.epub", type: "application/epub+zip", size: 0 }, new Uint8Array()).code,
    "empty-file"
  );
});

test("getEpubOpenProblem rejects files above the configured size limit", () => {
  assert.equal(
    getEpubOpenProblem(
      { name: "large.epub", type: "application/epub+zip", size: 11 },
      ZIP_BYTES,
      { maxBytes: 10 }
    ).code,
    "file-too-large"
  );
});

test("getEpubOpenProblem rejects non-ZIP EPUB payloads", () => {
  assert.equal(
    getEpubOpenProblem(
      { name: "broken.epub", type: "application/epub+zip", size: TEXT_BYTES.byteLength },
      TEXT_BYTES
    ).code,
    "invalid-zip"
  );
});

test("assertOpenableEpub throws a coded error for invalid files", () => {
  assert.throws(
    () => assertOpenableEpub({ name: "broken.epub", size: TEXT_BYTES.byteLength }, TEXT_BYTES),
    (error) => error.code === "invalid-zip"
  );
});

test("describeEpubOpenFailure explains corrupt EPUB package failures", () => {
  const description = describeEpubOpenFailure(
    new Error("Can't find end of central directory")
  );

  assert.equal(description.code, "corrupt-epub");
});

test("describeEpubOpenFailure explains unsupported EPUB structures", () => {
  const description = describeEpubOpenFailure(
    new Error("Could not find META-INF/container.xml")
  );

  assert.equal(description.code, "unsupported-epub");
});

test("describeEpubOpenFailure explains protected EPUB files", () => {
  const description = describeEpubOpenFailure(
    new Error("Encrypted publication rights are not available")
  );

  assert.equal(description.code, "protected-epub");
});

test("describeEpubOpenFailure explains memory-heavy failures", () => {
  const description = describeEpubOpenFailure(
    new Error("Array buffer allocation failed: out of memory")
  );

  assert.equal(description.code, "memory-heavy");
});

test("describeEpubOpenFailure falls back to a generic open failure", () => {
  const description = describeEpubOpenFailure(new Error("Unexpected failure"));

  assert.equal(description.code, "open-failed");
});
