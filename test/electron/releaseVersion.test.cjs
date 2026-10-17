const test = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, nextPatch, releaseFileName } = require("../../scripts/bump-version.cjs");

test("release versions raise the last number by one", () => {
  assert.equal(nextPatch("0.1.3"), "0.1.4");
  assert.equal(nextPatch("1.9.9"), "1.9.10");
  assert.throws(() => nextPatch("0.1"), /Unsupported version/);
});

test("the higher of the PC and Android versions is continued", () => {
  assert.ok(compareVersions("0.1.3", "0.1.0") > 0);
  assert.ok(compareVersions("0.1.10", "0.1.9") > 0);
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
});

test("release files are named MinsReader_ver<version>", () => {
  assert.equal(releaseFileName("0.1.4", "exe"), "MinsReader_ver0.1.4.exe");
  assert.equal(releaseFileName("0.1.4", "apk"), "MinsReader_ver0.1.4.apk");
});
