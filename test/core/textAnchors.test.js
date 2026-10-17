import test from "node:test";
import assert from "node:assert/strict";
import {
  findTextMatches,
  formatDocLocation,
  formatDocRange,
  getScrollPageState,
  isDocLocation,
  isDocRange,
  parseDocLocation,
  parseDocRange,
  segmentsForRange
} from "../../src/core/textAnchors.js";

test("document locations store a bounded scroll ratio", () => {
  const location = formatDocLocation(0.4567891);
  assert.ok(isDocLocation(location));
  assert.deepEqual(parseDocLocation(location), { ratio: 0.45679 });
  assert.deepEqual(parseDocLocation(formatDocLocation(7)), { ratio: 1 });
  assert.equal(parseDocLocation("doc:scroll=bad"), null);
  assert.equal(parseDocLocation("pdf:page=1"), null);
});

test("document ranges round-trip character offsets", () => {
  const range = formatDocRange({ start: 12, end: 40 });
  assert.ok(isDocRange(range));
  assert.deepEqual(parseDocRange(range), { start: 12, end: 40 });
  assert.equal(parseDocRange("doc-range:9-3"), null);
  assert.throws(() => formatDocRange({ start: 5, end: 5 }), TypeError);
});

test("a range is split over consecutive text nodes", () => {
  assert.deepEqual(segmentsForRange([5, 3, 10], 3, 12), [
    { index: 0, from: 3, to: 5 },
    { index: 1, from: 0, to: 3 },
    { index: 2, from: 0, to: 4 }
  ]);
  assert.deepEqual(segmentsForRange([4, 0, 4], 4, 6), [{ index: 2, from: 0, to: 2 }]);
});

test("scroll positions map to viewport-sized pages", () => {
  assert.deepEqual(getScrollPageState({ scrollTop: 0, scrollHeight: 2500, clientHeight: 1000 }), { page: 1, pageCount: 3, ratio: 0, atStart: true, atEnd: false });
  assert.deepEqual(getScrollPageState({ scrollTop: 1500, scrollHeight: 2500, clientHeight: 1000 }), { page: 3, pageCount: 3, ratio: 1, atStart: false, atEnd: true });
  assert.equal(getScrollPageState({ scrollTop: 0, scrollHeight: 400, clientHeight: 1000 }).atEnd, true);
  // One page step scrolls 92% of the viewport and must count as the next page.
  assert.equal(getScrollPageState({ scrollTop: 920, scrollHeight: 5000, clientHeight: 1000 }).page, 2);
});

test("text search is case-insensitive and returns excerpts", () => {
  const matches = findTextMatches("Alpha beta ALPHA gamma alpha", "alpha", { context: 4 });
  assert.deepEqual(matches.map(({ start, end }) => [start, end]), [[0, 5], [11, 16], [23, 28]]);
  assert.equal(matches[1].excerpt, "…eta ALPHA gam…");
  assert.deepEqual(findTextMatches("text", "  "), []);
  assert.equal(findTextMatches("aaaa", "a", { limit: 2 }).length, 2);
});
