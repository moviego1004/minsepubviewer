import test from "node:test";
import assert from "node:assert/strict";
import {
  applyZoomIntent,
  getScrollBoundaryIntent,
  getWheelIntent
} from "../../src/core/readerControls.js";

test("wheel without Ctrl goes to the next page when scrolling down", () => {
  assert.deepEqual(getWheelIntent({ deltaY: 120, ctrlKey: false }), {
    type: "page",
    direction: "next"
  });
});

test("wheel without Ctrl goes to the previous page when scrolling up", () => {
  assert.deepEqual(getWheelIntent({ deltaY: -120, ctrlKey: false }), {
    type: "page",
    direction: "previous"
  });
});

test("Ctrl wheel creates zoom intents", () => {
  assert.deepEqual(getWheelIntent({ deltaY: -120, ctrlKey: true }), {
    type: "zoom",
    direction: "in"
  });

  assert.deepEqual(getWheelIntent({ deltaY: 120, ctrlKey: true }), {
    type: "zoom",
    direction: "out"
  });
});

test("zero wheel delta is ignored", () => {
  assert.deepEqual(getWheelIntent({ deltaY: 0, ctrlKey: false }), { type: "none" });
});

test("applyZoomIntent updates and clamps zoom", () => {
  assert.equal(
    applyZoomIntent({ zoom: 1 }, { type: "zoom", direction: "in" }).zoom,
    1.1
  );

  assert.equal(
    applyZoomIntent({ zoom: 0.61 }, { type: "zoom", direction: "out" }).zoom,
    0.6
  );
});

test("scroll boundary intent scrolls before moving to the next page", () => {
  assert.equal(
    getScrollBoundaryIntent({ scrollTop: 100, scrollHeight: 1200, clientHeight: 600 }, "next"),
    "scroll"
  );

  assert.equal(
    getScrollBoundaryIntent({ scrollTop: 600, scrollHeight: 1200, clientHeight: 600 }, "next"),
    "page"
  );
});

test("scroll boundary intent scrolls before moving to the previous page", () => {
  assert.equal(
    getScrollBoundaryIntent({ scrollTop: 100, scrollHeight: 1200, clientHeight: 600 }, "previous"),
    "scroll"
  );

  assert.equal(
    getScrollBoundaryIntent({ scrollTop: 0, scrollHeight: 1200, clientHeight: 600 }, "previous"),
    "page"
  );
});

