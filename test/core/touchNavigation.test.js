import test from "node:test";
import assert from "node:assert/strict";
import { getTouchNavigation } from "../../src/core/touchNavigation.js";

const gesture = { start: { x: 200, y: 300 }, end: { x: 200, y: 300 }, duration: 120, height: 600 };
test("left/up swipes advance and right/down swipes go back", () => {
  for (const [end, expected] of [[{ x: 100, y: 300 }, "next"], [{ x: 200, y: 180 }, "next"],
    [{ x: 300, y: 300 }, "previous"], [{ x: 200, y: 420 }, "previous"]]) {
    assert.equal(getTouchNavigation({ ...gesture, end }), expected);
  }
});
test("top and bottom taps navigate, while the middle is left for selection", () => {
  for (const [y, expected] of [[50, "previous"], [550, "next"], [300, null]]) {
    assert.equal(getTouchNavigation({ ...gesture, start: { x: 200, y }, end: { x: 200, y } }), expected);
  }
});
test("selection, links, pinch, long press and continuous scroll never turn a page", () => {
  const tap = { ...gesture, start: { x: 20, y: 550 }, end: { x: 20, y: 550 } };
  for (const restriction of [{ selected: true }, { interactive: true }, { multitouch: true }, { duration: 600 }, { continuous: true }]) {
    assert.equal(getTouchNavigation({ ...tap, ...restriction }), null);
  }
  assert.equal(getTouchNavigation({ ...gesture, end: { x: 220, y: 310 } }), null);
});
