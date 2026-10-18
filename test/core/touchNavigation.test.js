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
