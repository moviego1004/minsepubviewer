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

test("release files in build/ are found newest first and set the floor for the next version", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { latestReleaseFile, listReleaseFiles, maxVersion } = require("../../scripts/bump-version.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mins-release-"));
  try {
    for (const name of ["MinsReader_ver0.1.9.exe", "MinsReader_ver0.1.10.apk", "MinsReader_ver0.1.9.apk", "MinsReader-0.2.0.exe", "app-debug.apk"]) {
      fs.writeFileSync(path.join(dir, name), "");
    }
    assert.deepEqual(listReleaseFiles(dir).map((file) => file.name), ["MinsReader_ver0.1.10.apk", "MinsReader_ver0.1.9.exe", "MinsReader_ver0.1.9.apk"]);
    assert.equal(latestReleaseFile("exe", dir).version, "0.1.9");
    assert.equal(latestReleaseFile("apk", dir).version, "0.1.10");
    assert.equal(maxVersion(["0.1.5", "0.1.4", listReleaseFiles(dir)[0].version]), "0.1.10");
    assert.deepEqual(listReleaseFiles(path.join(dir, "missing")), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
