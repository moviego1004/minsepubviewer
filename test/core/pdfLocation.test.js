import test from "node:test";
import assert from "node:assert/strict";
import {
  createPdfDocumentId,
  formatPdfLocation,
  formatPdfRange,
  getPdfRangeFirstPage,
  isPdfLocation,
  isPdfRange,
  mergePdfRects,
  normalizePdfZoom,
  parsePdfLocation,
  parsePdfRange
} from "../../src/core/pdfLocation.js";

test("PDF locations round-trip page, zoom, offsets and rotation", () => {
  const location = formatPdfLocation({ pageNumber: 12, zoom: "page-width", left: -3.456, top: 701.239, rotation: 90 });
  assert.ok(isPdfLocation(location));
  assert.deepEqual(parsePdfLocation(location), { pageNumber: 12, zoom: "page-width", left: -3.46, top: 701.24, rotation: 90 });
});

test("PDF locations tolerate missing or damaged values", () => {
  assert.deepEqual(parsePdfLocation("pdf:page=3"), { pageNumber: 3, zoom: "page-width", left: null, top: null, rotation: 0 });
  assert.equal(parsePdfLocation("pdf:page=0"), null);
  assert.equal(parsePdfLocation("epubcfi(/6/2)"), null);
  assert.equal(parsePdfLocation(undefined), null);
  assert.equal(parsePdfLocation("pdf:page=2&rotation=45").rotation, 0);
  assert.equal(parsePdfLocation(formatPdfLocation({ pageNumber: 1, rotation: -90 })).rotation, 270);
});

test("PDF zoom accepts presets and bounded numeric scales", () => {
  assert.equal(normalizePdfZoom("page-fit"), "page-fit");
  assert.equal(normalizePdfZoom("1.256"), 1.26);
  assert.equal(normalizePdfZoom(40), "page-width");
  assert.equal(normalizePdfZoom("bad", "auto"), "auto");
});

test("PDF document ids come from the PDF fingerprint", () => {
  assert.equal(createPdfDocumentId("AB12-cd"), "pdf-ab12cd");
  assert.throws(() => createPdfDocumentId(""), TypeError);
});

test("selection rectangles on the same line are merged", () => {
  assert.deepEqual(mergePdfRects([[10, 700, 50, 712], [49, 700.5, 90, 712], [10, 680, 40, 692], [5, 5, 5, 9]]), [
    [10, 700, 90, 712],
    [10, 680, 40, 692]
  ]);
});

test("PDF highlight ranges round-trip by page", () => {
  const range = formatPdfRange([
    { pageNumber: 4, rects: [[100, 200, 50, 210]] },
    { pageNumber: 3, rects: [[1, 1, 20, 12]] },
    { pageNumber: 5, rects: [] }
  ]);
  assert.ok(isPdfRange(range));
  assert.deepEqual(parsePdfRange(range), [
    { pageNumber: 3, rects: [[1, 1, 20, 12]] },
    { pageNumber: 4, rects: [[50, 200, 100, 210]] }
  ]);
  assert.equal(getPdfRangeFirstPage(range), 3);
  assert.deepEqual(parsePdfRange("pdf-range:{broken"), []);
  assert.throws(() => formatPdfRange([]), TypeError);
});
