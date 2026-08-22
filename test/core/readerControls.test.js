import test from "node:test";
import assert from "node:assert/strict";
import {
  applyZoomIntent,
  getScrollBoundaryIntent,
  getViewportPageState,
  getViewportPageTarget,
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

test("viewport page target moves one visible page in either direction", () => {
  const metrics = { scrollTop: 600, scrollHeight: 2400, clientHeight: 600 };

  assert.equal(getViewportPageTarget(metrics, "previous"), 0);
  assert.equal(getViewportPageTarget(metrics, "next"), 1200);
});

test("viewport page target stays within the scroll range", () => {
  assert.equal(
    getViewportPageTarget({ scrollTop: 0, scrollHeight: 1800, clientHeight: 600 }, "previous"),
    0
  );
  assert.equal(
    getViewportPageTarget({ scrollTop: 1500, scrollHeight: 1800, clientHeight: 600 }, "next"),
    1200
  );
});

test("viewport page state reports the visible page and boundaries", () => {
  assert.deepEqual(
    getViewportPageState({ scrollTop: 600, scrollHeight: 1800, clientHeight: 600 }),
    { page: 2, pageCount: 3, atStart: false, atEnd: false }
  );
  assert.deepEqual(
    getViewportPageState({ scrollTop: 1200, scrollHeight: 1800, clientHeight: 600 }),
    { page: 3, pageCount: 3, atStart: false, atEnd: true }
  );
  assert.deepEqual(
    getViewportPageState({ scrollTop: 1100, scrollHeight: 1700, clientHeight: 600 }),
    { page: 3, pageCount: 3, atStart: false, atEnd: true }
  );
});

