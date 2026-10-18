import test from "node:test";
import assert from "node:assert/strict";
import { getTouchNavigation, isCenterTap } from "../../src/core/touchNavigation.js";

const gesture = { start: { x: 200, y: 300 }, end: { x: 200, y: 300 }, duration: 120, height: 600 };
const tapAt = (y, extra = {}) => ({ ...gesture, start: { x: 200, y }, end: { x: 200, y }, ...extra });
test("left/up swipes advance and right/down swipes go back", () => {
  for (const [end, expected] of [[{ x: 100, y: 300 }, "next"], [{ x: 200, y: 180 }, "next"],
    [{ x: 300, y: 300 }, "previous"], [{ x: 200, y: 420 }, "previous"]]) {
    assert.equal(getTouchNavigation({ ...gesture, end }), expected);
  }
});
test("top and bottom taps navigate, while the middle is left for selection", () => {
  for (const [y, expected] of [[50, "previous"], [550, "next"], [300, null]]) {
    assert.equal(getTouchNavigation(tapAt(y)), expected);
  }
});
test("in scrolling views taps still page but swipes are left to scrolling", () => {
  assert.equal(getTouchNavigation(tapAt(550, { continuous: true })), "next");
  assert.equal(getTouchNavigation(tapAt(50, { continuous: true })), "previous");
  assert.equal(getTouchNavigation({ ...gesture, end: { x: 200, y: 180 }, continuous: true }), null);
});
test("selection, links, pinch and long press never turn a page", () => {
  const tap = tapAt(550, { start: { x: 20, y: 550 }, end: { x: 20, y: 550 } });
  for (const restriction of [{ selected: true }, { interactive: true }, { multitouch: true }, { duration: 600 }]) {
    assert.equal(getTouchNavigation({ ...tap, ...restriction }), null);
  }
  assert.equal(getTouchNavigation({ ...gesture, end: { x: 220, y: 310 } }), null);
});
test("only short, still taps in the middle third count as center taps", () => {
  assert.equal(isCenterTap(tapAt(300)), true);
  assert.equal(isCenterTap(tapAt(300, { continuous: true })), true);
  for (const tap of [tapAt(50), tapAt(550), tapAt(300, { selected: true }), tapAt(300, { interactive: true }),
    tapAt(300, { duration: 500 }), { ...gesture, end: { x: 230, y: 300 } }]) {
    assert.equal(isCenterTap(tap), false);
  }
});

test("swiping past the end of a page that scrolls turns the page", async () => {
  const { getEdgeSwipe, getScrollEdges } = await import("../../src/core/touchNavigation.js");
  const metrics = { scrollTop: 0, scrollLeft: 0, scrollHeight: 1200, scrollWidth: 400, clientHeight: 700, clientWidth: 400 };
  assert.deepEqual(getScrollEdges(metrics), { top: true, bottom: false, left: true, right: true });
  assert.deepEqual(getScrollEdges({ ...metrics, scrollTop: 500 }), { top: false, bottom: true, left: true, right: true });
  const swipe = (dy, edges, extra = {}) => getEdgeSwipe({ start: { x: 200, y: 400 }, end: { x: 200, y: 400 + dy }, duration: 200, edges, ...extra });
  const atBottom = getScrollEdges({ ...metrics, scrollTop: 500 });
  const middle = getScrollEdges({ ...metrics, scrollTop: 250 });
  assert.equal(swipe(-120, atBottom), "next");
  assert.equal(swipe(120, getScrollEdges(metrics)), "previous");
  assert.equal(swipe(-120, middle), null, "the page scrolls first");
  assert.equal(swipe(120, atBottom), null);
  assert.equal(swipe(-20, atBottom), null, "short drags are not swipes");
  assert.equal(swipe(-120, atBottom, { selected: true }), null);
  assert.equal(swipe(-120, atBottom, { duration: 1200 }), null);
  const sideways = (dx, edges) => getEdgeSwipe({ start: { x: 200, y: 400 }, end: { x: 200 + dx, y: 400 }, duration: 200, edges });
  assert.equal(sideways(-120, middle), "next", "a page that fits sideways turns with horizontal swipes");
  assert.equal(sideways(-120, { ...middle, right: false }), null);
});
