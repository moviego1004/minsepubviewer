import test from "node:test";
import assert from "node:assert/strict";
import { buildTextOnlyCss, createTextOnlyPolicy } from "../../src/core/textOnly.js";

test("text-only css hides image and media elements", () => {
  const css = buildTextOnlyCss();

  assert.match(css, /img/);
  assert.match(css, /svg/);
  assert.match(css, /video/);
  assert.match(css, /display: none !important/);
  assert.match(css, /background-image: none !important/);
});

test("text-only css preserves captions by default", () => {
  const css = buildTextOnlyCss();

  assert.doesNotMatch(css, /figcaption/);
});

test("text-only css can hide captions and cover", () => {
  const css = buildTextOnlyCss({ keepCaptions: false, hideCover: true });

  assert.match(css, /figcaption/);
  assert.match(css, /\.cover/);
  assert.match(css, /#cover/);
});

test("text-only policy returns empty css when disabled", () => {
  const policy = createTextOnlyPolicy({ textOnly: false });

  assert.equal(policy.enabled, false);
  assert.equal(policy.css, "");
});

test("text-only policy returns css when enabled", () => {
  const policy = createTextOnlyPolicy({ textOnly: true });

  assert.equal(policy.enabled, true);
  assert.match(policy.css, /img/);
});

