// Finds the JDK and Android SDK for the Android build scripts (build-android.js, create-upload-key.cjs,
// release.cjs). Returns an environment with JAVA_HOME/ANDROID_HOME set and the JDK first on PATH.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function javaEnv(base = process.env) {
  const env = { ...base };
  // A shell started before the JDK moved can still carry a JAVA_HOME that no longer exists.
  if (env.JAVA_HOME && !fs.existsSync(path.join(env.JAVA_HOME, "bin/java.exe")) && !fs.existsSync(path.join(env.JAVA_HOME, "bin/java"))) delete env.JAVA_HOME;
  const studioJava = "C:/Program Files/Android/Android Studio/jbr";
  if (!env.JAVA_HOME && fs.existsSync(path.join(studioJava, "bin/java.exe"))) env.JAVA_HOME = studioJava;
  const installedJava = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs/Eclipse Adoptium/jdk-21");
  if (!env.JAVA_HOME && installedJava && fs.existsSync(path.join(installedJava, "bin/java.exe"))) env.JAVA_HOME = installedJava;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  if (env.JAVA_HOME) env[pathKey] = `${path.join(env.JAVA_HOME, "bin")}${path.delimiter}${env[pathKey] || ""}`;
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Android/Sdk"));
  if (sdk && fs.existsSync(sdk)) env.ANDROID_HOME = sdk;
  return env;
}

// A JDK tool (keytool, jarsigner) from JAVA_HOME when known, else from PATH.
function javaTool(env, name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const fromHome = env.JAVA_HOME && path.join(env.JAVA_HOME, "bin", exe);
  return fromHome && fs.existsSync(fromHome) ? fromHome : name;
}

// The Play upload key lives outside the repository: ~/.minsreader/upload-key.properties
// (or the file named by MINS_UPLOAD_KEY_PROPERTIES), next to upload-key.jks.
// android/app/build.gradle reads the same file.
function uploadKeyPropertiesPath(env = process.env) {
  return env.MINS_UPLOAD_KEY_PROPERTIES || path.join(os.homedir(), ".minsreader", "upload-key.properties");
}

module.exports = { javaEnv, javaTool, uploadKeyPropertiesPath };
