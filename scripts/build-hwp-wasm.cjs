// Builds web/vendor/hwp/hwp_core.wasm: the HWP 5.0 parser of @ohah/hwpjs 0.1.0-rc.10 (hwp-core,
// MIT) for wasm32-unknown-unknown, used by the phone's original page view (web/hwp-wasm.js).
// The published hwpjs WASM needs shared memory (SharedArrayBuffer), which the app's WebView does
// not give; this build has no imports at all. Needs Rust (rustup) and git.
const { execFileSync } = require("node:child_process");
const { copyFileSync, existsSync, mkdirSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");

const TAG = "@ohah/hwpjs@0.1.0-rc.10";
const COMMIT = "33cf33e37465a626bb6e30964de48cc2fafc1896";
const crate = resolve(__dirname, "../native/hwp-wasm");
const source = resolve(__dirname, "../node_modules/.cache/hwpjs-src");
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
const read = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: "utf8" }).trim();

if (!existsSync(join(source, ".git"))) {
  run("git", ["clone", "--quiet", "--depth", "1", "--branch", TAG, "https://github.com/ohah/hwpjs.git", source]);
}
const head = read("git", ["rev-parse", "HEAD"], source);
if (head !== COMMIT) throw new Error(`${source} is at ${head}, expected ${COMMIT} (${TAG}). Delete the folder and run again.`);

run("rustup", ["target", "add", "wasm32-unknown-unknown"], crate);
run("cargo", ["build", "--release", "--locked", "--target", "wasm32-unknown-unknown"], crate);

const output = resolve(__dirname, "../web/vendor/hwp");
mkdirSync(output, { recursive: true });
copyFileSync(join(crate, "target/wasm32-unknown-unknown/release/hwp_wasm.wasm"), join(output, "hwp_core.wasm"));
copyFileSync(join(source, "LICENSE"), join(output, "LICENSE.hwpjs.txt"));
console.log(`web/vendor/hwp/hwp_core.wasm ${statSync(join(output, "hwp_core.wasm")).size} bytes`);
