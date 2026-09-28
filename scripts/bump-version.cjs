const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const installerPath = path.join(root, "installer.nsi");

function bumpPatch(version) {
  const parts = String(version).split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Unsupported semantic version: ${version}`);
  }

  parts[2] += 1;
  return parts.join(".");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const nextVersion = bumpPatch(packageJson.version);
packageJson.version = nextVersion;
writeJson(packagePath, packageJson);

if (fs.existsSync(lockPath)) {
  const lockJson = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lockJson.version = nextVersion;
  if (lockJson.packages?.[""]) {
    lockJson.packages[""].version = nextVersion;
  }
  writeJson(lockPath, lockJson);
}

const installer = fs.readFileSync(installerPath, "utf8")
  .replace(/(!define\s+APP_VERSION\s+)"[^"]+"/, `$1"${nextVersion}"`);
fs.writeFileSync(installerPath, installer, "utf8");

console.log(nextVersion);
