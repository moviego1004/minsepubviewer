// The only way to make app builds (build.bat, makeSetup.bat, npm run build / release / android:apk).
// Raises the app version by one and writes, directly in build/:
//   build/MinsReader_ver<version>.exe  (Windows installer)
//   build/MinsReader_ver<version>.apk  (Android, debug-signed, for passing around)
//   build/MinsReader_ver<version>.aab  (Android App Bundle for Play, signed with the upload key)
// Usage: node scripts/release.cjs [pc] [android] [aab]   (pc and android when no target is given)
// The aab target needs the upload key (npm.cmd run android:upload-key, once per key; see doc/ANDROID.md).
// A failed build puts the previous version back, so version numbers are not skipped.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { RELEASE_FILE, bumpVersion, releaseFileName } = require("./bump-version.cjs");
const { javaEnv, javaTool, uploadKeyPropertiesPath } = require("./java-env.cjs");

const root = path.resolve(__dirname, "..");
const buildDir = path.join(root, "build");
const requested = process.argv.slice(2).map((target) => target.toLowerCase());
const unknown = requested.filter((target) => !["pc", "android", "aab"].includes(target));
if (unknown.length) {
  console.error(`Unknown release target: ${unknown.join(", ")} (use pc, android and/or aab)`);
  process.exit(1);
}
const targets = requested.length ? requested : ["pc", "android"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} ${args.join(" ")} failed (${result.status})`);
}

// npm.cmd needs cmd.exe on Windows.
function npm(script) {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/c", `npm.cmd run ${script}`]);
  } else {
    run("npm", ["run", script]);
  }
}

function findMakensis() {
  const candidates = [
    ...String(process.env.PATH || "").split(path.delimiter).map((dir) => path.join(dir, "makensis.exe")),
    path.join(process.env["ProgramFiles(x86)"] || "", "NSIS", "makensis.exe"),
    path.join(process.env.ProgramFiles || "", "NSIS", "makensis.exe")
  ];
  return candidates.find((file) => file && fs.existsSync(file)) || null;
}

function buildPc(version) {
  const makensis = findMakensis();
  if (!makensis) throw new Error("makensis.exe was not found. Install NSIS or add it to PATH.");
  // Only the unpacked app is rebuilt; earlier release files in build/ are kept.
  fs.rmSync(path.join(buildDir, "win-unpacked"), { recursive: true, force: true });
  npm("build:pc-dir");
  if (!fs.existsSync(path.join(buildDir, "win-unpacked", "Mins Reader.exe"))) {
    throw new Error("Electron build output was not found: build/win-unpacked/Mins Reader.exe");
  }
  const outFile = releaseFileName(version, "exe");
  run(makensis, [`/DAPP_VERSION=${version}`, `/DDISPLAY_VERSION=${version}`, `/DOUT_FILE=${outFile}`, "installer.nsi"]);
  return path.join(buildDir, outFile);
}

let synced = false;
function syncAndroid() {
  if (!synced) npm("android:sync");
  synced = true;
}

function buildAndroid(version) {
  syncAndroid();
  run(process.execPath, [path.join(root, "scripts", "build-android.js")]);
  const apk = path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!fs.existsSync(apk)) throw new Error("APK was not found: android/app/build/outputs/apk/debug/app-debug.apk");
  const target = path.join(buildDir, releaseFileName(version, "apk"));
  fs.mkdirSync(buildDir, { recursive: true });
  fs.copyFileSync(apk, target);
  return target;
}

// Play App Bundle signed with the upload key; jarsigner checks the signature before it is copied.
function buildAab(version) {
  syncAndroid();
  run(process.execPath, [path.join(root, "scripts", "build-android.js"), "bundleRelease"]);
  const aab = path.join(root, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
  if (!fs.existsSync(aab)) throw new Error("AAB was not found: android/app/build/outputs/bundle/release/app-release.aab");
  const env = javaEnv();
  const check = spawnSync(javaTool(env, "jarsigner"), ["-verify", aab], { env, encoding: "utf8" });
  if (check.error || check.status !== 0 || !/jar verified/i.test(check.stdout || "")) {
    throw new Error(`AAB signature check failed: ${check.error?.message || (check.stdout || check.stderr || "").trim()}`);
  }
  const target = path.join(buildDir, releaseFileName(version, "aab"));
  fs.mkdirSync(buildDir, { recursive: true });
  fs.copyFileSync(aab, target);
  return target;
}

// Checked before the version is raised, so a missing key does not cost a version number.
if (targets.includes("aab")) {
  const keyFile = uploadKeyPropertiesPath();
  if (!fs.existsSync(keyFile)) {
    console.error(`Upload key not found: ${keyFile}
Create it once with npm.cmd run android:upload-key (or copy it from the PC that has it).`);
    process.exit(1);
  }
}

const bump = bumpVersion();
console.log(`Release version ${bump.version} (Android versionCode ${bump.versionCode})`);
try {
  const outputs = [];
  if (targets.includes("pc")) outputs.push(buildPc(bump.version));
  if (targets.includes("android")) outputs.push(buildAndroid(bump.version));
  if (targets.includes("aab")) outputs.push(buildAab(bump.version));
  for (const file of outputs) {
    if (path.dirname(file) !== buildDir || !RELEASE_FILE.test(path.basename(file)) || !fs.existsSync(file)) {
      throw new Error(`Release file does not follow build/MinsReader_ver<version>: ${file}`);
    }
  }
  console.log("\nRelease files:");
  for (const file of outputs) console.log(`  ${path.relative(root, file)}  (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
} catch (error) {
  bump.restore();
  console.error(`\nRelease failed; the version was restored. ${error.message}`);
  process.exit(1);
}
