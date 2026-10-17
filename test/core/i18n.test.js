import test from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGES,
  SUPPORTED_LOCALES,
  isMessageKey,
  normalizeLanguagePreference,
  resolveLocale,
  translate,
  translateErrorMessage
} from "../../src/core/i18n.js";

test("every locale defines the same message keys", () => {
  const reference = Object.keys(MESSAGES.en).sort();
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), reference, `${locale} keys differ from en`);
  }
});

test("every message is non-empty and uses the same placeholders in all locales", () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(MESSAGES.en)) {
    for (const locale of SUPPORTED_LOCALES) {
      const text = MESSAGES[locale][key];
      assert.equal(typeof text, "string");
      assert.ok(text.trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(english), `${locale}.${key} placeholders`);
    }
  }
});

test("resolves the language preference against system languages", () => {
  assert.equal(resolveLocale("ko", ["en-US"]), "ko");
  assert.equal(resolveLocale("system", ["ko-KR", "en-US"]), "ko");
  assert.equal(resolveLocale("system", ["fr-FR", "en-GB"]), "en");
  assert.equal(resolveLocale("system", ["ja-JP"]), "en");
  assert.equal(resolveLocale("system", "ko_KR"), "ko");
  assert.equal(normalizeLanguagePreference("de"), "system");
});

test("translates with parameters and falls back to the key", () => {
  assert.equal(translate("ko", "search.results", { count: 3 }), "결과 3개");
  assert.equal(translate("en", "search.results", { count: 3 }), "3 results");
  assert.equal(translate("en", "missing.key"), "missing.key");
  assert.equal(translate("en", "markdown.line", {}), "Line {line}");
});

test("translates native error keys and leaves other messages unchanged", () => {
  assert.ok(isMessageKey("native.pickerBusy"));
  assert.equal(isMessageKey("Plain sentence."), false);
  assert.equal(translateErrorMessage("en", new Error("native.pickerBusy")), "A file picker is already open.");
  assert.equal(translateErrorMessage("ko", new Error("disk full")), "disk full");
  assert.equal(
    translateErrorMessage("en", new Error("Error invoking remote method 'document:convert-hwp': Error: document.invalidHwp")),
    "Invalid or corrupted HWP file."
  );
});
