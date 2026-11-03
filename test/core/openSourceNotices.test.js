import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPEN_SOURCE_NOTICES } from "../../src/core/openSourceNotices.js";
import { APP_VERSION } from "../../src/core/appVersion.js";

const readJson = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));

test("open-source notices match the installed library versions", () => {
  for (const notice of OPEN_SOURCE_NOTICES) {
    if (!notice.package) continue;
    const installed = readJson(`../../node_modules/${notice.package}/package.json`).version;
    assert.equal(notice.version, installed, `${notice.name}: run npm.cmd run notices`);
  }
});

test("every open-source notice carries its license text", () => {
  assert.ok(OPEN_SOURCE_NOTICES.length > 0);
  for (const notice of OPEN_SOURCE_NOTICES) {
    assert.ok(notice.license, notice.name);
    assert.ok(notice.copyright, notice.name);
    assert.ok(notice.text.length > 300, notice.name);
  }
});

test("every shipped dependency has an open-source notice", () => {
  const listed = new Set(OPEN_SOURCE_NOTICES.map((notice) => notice.package));
  for (const name of Object.keys(readJson("../../package.json").dependencies)) {
    assert.ok(listed.has(name), `${name} is missing from scripts/build-notices.cjs`);
  }
});

test("the About dialog version follows package.json", () => {
  assert.equal(APP_VERSION, readJson("../../package.json").version);
});
