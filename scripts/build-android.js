import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const env = { ...process.env };
const studioJava = "C:/Program Files/Android/Android Studio/jbr";
if (!env.JAVA_HOME && existsSync(join(studioJava, "bin/java.exe"))) env.JAVA_HOME = studioJava;
const installedJava = env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Programs/Eclipse Adoptium/jdk-21");
if (!env.JAVA_HOME && installedJava && existsSync(join(installedJava, "bin/java.exe"))) env.JAVA_HOME = installedJava;
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
if (env.JAVA_HOME) env[pathKey] = `${join(env.JAVA_HOME, "bin")}${process.platform === "win32" ? ";" : ":"}${env[pathKey] || ""}`;
const java = spawnSync("java", ["-version"], { env, encoding: "utf8" });
if (java.error || java.status !== 0) {
  console.error("Java JDK를 찾지 못했습니다. scripts/setup-android.ps1로 설치하거나 JAVA_HOME을 설정해 주세요. doc/ANDROID.md 참고.");
  process.exit(1);
}
const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Android/Sdk"));
if (!existsSync("android/local.properties") && (!sdk || !existsSync(sdk))) {
  console.error("Android SDK를 찾지 못했습니다. Android Studio에서 SDK 36을 설치한 뒤 Android 프로젝트를 열어 주세요.");
  process.exit(1);
}
if (sdk && existsSync(sdk)) env.ANDROID_HOME = sdk;
const windows = process.platform === "win32";
const command = windows ? (env.ComSpec || join(env.SystemRoot || "C:/Windows", "System32/cmd.exe")) : "./gradlew";
const result = spawnSync(command, windows ? ["/d", "/c", ".\\gradlew.bat assembleDebug"] : ["assembleDebug"], {
  cwd: resolve("android"), env, stdio: "inherit"
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
