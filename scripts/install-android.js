import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const { latestReleaseFile } = createRequire(import.meta.url)("./bump-version.cjs");

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android/Sdk"));
const adb = sdk ? join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb") : "adb";
// Installs the newest release build: build/MinsReader_ver<version>.apk
const release = latestReleaseFile("apk");
if (!release) {
  console.error("build 폴더에 MinsReader_ver<버전>.apk가 없습니다. npm.cmd run release:android로 먼저 빌드해 주세요.");
  process.exit(1);
}
const apk = release.path;
console.log(`설치할 APK: build/${release.name}`);

// -d selects a USB device, never an unrelated running emulator.
const serial = process.argv[2];
const target = serial ? ["-s", serial] : ["-d"];
function run(args) {
  const result = spawnSync(adb, args, { encoding: "utf8" });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}
if (!run([...target, "get-state"])) {
  console.error("USB로 휴대폰을 연결하고 USB 디버깅을 켠 뒤, 휴대폰에서 이 PC를 허용해 주세요. 여러 기기라면 기기 ID를 인자로 지정하세요.");
  process.exit(1);
}
if (!run([...target, "install", "-r", apk])) {
  console.error("앱 설치에 실패했습니다. 기존 앱을 자동 삭제하지 않았습니다.");
  process.exit(1);
}
if (!run([...target, "shell", "am", "start", "-n", "com.mins.epubviewer/.MainActivity"])) process.exit(1);
console.log("Mins Reader를 휴대폰에 설치하고 실행했습니다.");
