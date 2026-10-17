// One app version for the PC and Android builds. Each release build raises the last number
// by one (0.1.4 -> 0.1.5) and the Android versionCode by one.
// Run directly to bump only: node scripts/bump-version.cjs
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
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

// Returns the new version and a restore() that puts every file back, for failed builds.
function bumpVersion() {
  const originals = Object.fromEntries(Object.entries(files)
    .filter(([, file]) => fs.existsSync(file))
    .map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
  const current = readVersions();
  // The PC and Android versions were kept apart before; continue from the higher one.
  const base = compareVersions(current.app, current.android) >= 0 ? current.app : current.android;
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

module.exports = { bumpVersion, compareVersions, nextPatch, readVersions, releaseFileName };

if (require.main === module) {
  console.log(bumpVersion().version);
}
