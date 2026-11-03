// One-time: creates a Play upload key in the git-ignored android/keystore/ folder.
//   android/keystore/upload.jks         (PKCS12 key store, alias "upload")
//   android/keystore/upload.properties  (store path, alias, generated password)
// Not needed when an existing upload key is copied there (the same key can serve several apps).
// Usage: npm.cmd run android:upload-key
// Refuses to run when the properties file already exists, so a key is never replaced by accident.
// Back up both files. With Play App Signing a lost upload key can be reset through Play Console,
// but that takes a support request and a few days.
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { javaEnv, javaTool, uploadKeyPropertiesPath } = require("./java-env.cjs");

const propertiesFile = uploadKeyPropertiesPath();
const dir = path.dirname(propertiesFile);
const storeFile = path.join(dir, "upload.jks");
if (fs.existsSync(propertiesFile) || fs.existsSync(storeFile)) {
  console.error(`업로드 키가 이미 있습니다: ${fs.existsSync(propertiesFile) ? propertiesFile : storeFile}\n덮어쓰지 않습니다.`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const env = javaEnv();
const password = crypto.randomBytes(24).toString("base64url");
env.MINS_UPLOAD_KEY_PASSWORD = password;
const result = spawnSync(javaTool(env, "keytool"), [
  "-genkeypair", "-keystore", storeFile, "-storetype", "PKCS12", "-alias", "upload",
  "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=Mins Reader",
  "-storepass:env", "MINS_UPLOAD_KEY_PASSWORD", "-keypass:env", "MINS_UPLOAD_KEY_PASSWORD"
], { env, stdio: "inherit" });
if (result.error || result.status !== 0) {
  console.error(`keytool 실패: ${result.error?.message || result.status}`);
  fs.rmSync(storeFile, { force: true });
  process.exit(1);
}
fs.writeFileSync(propertiesFile, [
  "# Play upload key. Never commit; back up together with upload.jks.",
  "storeFile=upload.jks",
  `storePassword=${password}`,
  "keyAlias=upload",
  `keyPassword=${password}`,
  ""
].join("\n"), { encoding: "utf8", mode: 0o600 });
console.log(`업로드 키를 만들었습니다:\n  ${storeFile}\n  ${propertiesFile}\n두 파일을 안전한 곳에 백업하세요(저장소에 넣지 말 것).`);
