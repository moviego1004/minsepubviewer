import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_READING_SETTINGS,
  mergeReadingSettings,
  normalizeReadingSettings
} from "../../src/core/settings.js";

test("default reading settings are valid", () => {
  assert.equal(DEFAULT_READING_SETTINGS.fontSize, 18);
  assert.equal(DEFAULT_READING_SETTINGS.theme, "light");
  assert.equal(DEFAULT_READING_SETTINGS.textOnly, false);
});

test("partial settings merge without losing defaults", () => {
  const settings = normalizeReadingSettings({ fontSize: 22, theme: "sepia" });

  assert.equal(settings.fontSize, 22);
  assert.equal(settings.theme, "sepia");
  assert.equal(settings.lineHeight, DEFAULT_READING_SETTINGS.lineHeight);
});

test("invalid numeric settings are clamped", () => {
  const settings = normalizeReadingSettings({
    fontSize: 3,
    lineHeight: 8,
    margin: -10,
    zoom: 99
  });

  assert.equal(settings.fontSize, 10);
  assert.equal(settings.lineHeight, 2.4);
  assert.equal(settings.margin, 0);
  assert.equal(settings.zoom, 2.5);
});

test("invalid enum and empty font values fall back to defaults", () => {
  const settings = normalizeReadingSettings({ fontFamily: "   ", theme: "blue" });

  assert.equal(settings.fontFamily, "system");
  assert.equal(settings.theme, "light");
});

test("mergeReadingSettings applies a patch over current settings", () => {
  const settings = mergeReadingSettings(
    { fontSize: 20, theme: "dark" },
    { textOnly: true }
  );

  assert.equal(settings.fontSize, 20);
  assert.equal(settings.theme, "dark");
  assert.equal(settings.textOnly, true);
});

