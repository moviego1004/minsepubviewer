// Runs one Gradle task in android/ (default assembleDebug), e.g. node scripts/build-android.js bundleRelease
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";

const { javaEnv } = createRequire(import.meta.url)("./java-env.cjs");
const task = process.argv[2] || "assembleDebug";
if (!/^[A-Za-z:]+$/.test(task)) {
  console.error(`Gradle 작업 이름이 올바르지 않습니다: ${task}`);
  process.exit(1);
}
const env = javaEnv();
const java = spawnSync("java", ["-version"], { env, encoding: "utf8" });
if (java.error || java.status !== 0) {
  console.error("Java JDK를 찾지 못했습니다. scripts/setup-android.ps1로 설치하거나 JAVA_HOME을 설정해 주세요. doc/ANDROID.md 참고.");
  process.exit(1);
}
if (!existsSync("android/local.properties") && !env.ANDROID_HOME) {
  console.error("Android SDK를 찾지 못했습니다. Android Studio에서 SDK 36을 설치한 뒤 Android 프로젝트를 열어 주세요.");
  process.exit(1);
}
const windows = process.platform === "win32";
const command = windows ? (env.ComSpec || join(env.SystemRoot || "C:/Windows", "System32/cmd.exe")) : "./gradlew";
const result = spawnSync(command, windows ? ["/d", "/c", `.\\gradlew.bat ${task}`] : [task], {
  cwd: resolve("android"), env, stdio: "inherit"
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
