// One app version for the PC and Android builds. Each release build raises the last number
// by one (0.1.4 -> 0.1.5) and the Android versionCode by one. Release files are written to
// build/ as MinsReader_ver<version>.exe / .apk; a new build is always numbered above every
// release file already there, so a file is never overwritten.
// Run directly to bump only: node scripts/bump-version.cjs
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");
const RELEASE_FILE = /^MinsReader_ver(\d+\.\d+\.\d+)\.(exe|apk)$/;
const files = {
  package: path.join(root, "package.json"),
  lock: path.join(root, "package-lock.json"),
  installer: path.join(root, "installer.nsi"),
  gradle: path.join(root, "android", "app", "build.gradle")
};

function parseVersion(version) {
  const parts = String(version).split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Unsupported version: ${version}`);
  }
  return parts;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function nextPatch(version) {
  const parts = parseVersion(version);
  parts[2] += 1;
  return parts.join(".");
}

function writeJson(file, value, original) {
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`.replace(/\n/g, eol), "utf8");
}

function readVersions() {
  const gradle = fs.readFileSync(files.gradle, "utf8");
  const versionName = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
  const versionCode = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
  if (!versionName || !Number.isInteger(versionCode)) throw new Error("Android versionName/versionCode not found");
  return { app: JSON.parse(fs.readFileSync(files.package, "utf8")).version, android: versionName, versionCode };
}

// Release files already in build/ (newest first).
function listReleaseFiles(dir = buildDir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .map((name) => ({ name, match: RELEASE_FILE.exec(name) }))
    .filter(({ match }) => match)
    .map(({ name, match }) => ({ name, version: match[1], extension: match[2], path: path.join(dir, name) }))
    .sort((a, b) => compareVersions(b.version, a.version) || b.name.localeCompare(a.name));
}

function latestReleaseFile(extension, dir = buildDir) {
  return listReleaseFiles(dir).find((file) => file.extension === extension) || null;
}

function maxVersion(versions) {
  return versions.filter(Boolean).reduce((highest, version) => (compareVersions(version, highest) > 0 ? version : highest));
}

// Returns the new version and a restore() that puts every file back, for failed builds.
function bumpVersion({ releaseDir = buildDir } = {}) {
  const originals = Object.fromEntries(Object.entries(files)
    .filter(([, file]) => fs.existsSync(file))
    .map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
  const current = readVersions();
  // Continue from the highest of the PC version, the Android version and the newest release file.
  const base = maxVersion([current.app, current.android, listReleaseFiles(releaseDir)[0]?.version]);
  const version = nextPatch(base);
  const versionCode = current.versionCode + 1;

  const packageJson = JSON.parse(originals.package);
  packageJson.version = version;
  writeJson(files.package, packageJson, originals.package);

  if (originals.lock) {
    const lock = JSON.parse(originals.lock);
    lock.version = version;
    if (lock.packages?.[""]) lock.packages[""].version = version;
    writeJson(files.lock, lock, originals.lock);
  }

  fs.writeFileSync(files.installer, originals.installer.replace(/(!define\s+APP_VERSION\s+)"[^"]+"/, `$1"${version}"`), "utf8");
  fs.writeFileSync(files.gradle, originals.gradle
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`), "utf8");

  return {
    version,
    versionCode,
    restore() {
      for (const [key, content] of Object.entries(originals)) fs.writeFileSync(files[key], content, "utf8");
    }
  };
}

function releaseFileName(version, extension) {
  return `MinsReader_ver${version}.${extension}`;
}

module.exports = { RELEASE_FILE, bumpVersion, compareVersions, latestReleaseFile, listReleaseFiles, maxVersion, nextPatch, readVersions, releaseFileName };

if (require.main === module) {
  console.log(bumpVersion().version);
}
