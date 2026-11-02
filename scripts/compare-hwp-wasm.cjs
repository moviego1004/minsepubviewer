// Checks web/vendor/hwp/hwp_core.wasm against the native @ohah/hwpjs addon (devDependency, same
// version) on real HWP files, after rebuilding the WebAssembly (npm.cmd run build:hwp-wasm).
//   node scripts/compare-hwp-wasm.cjs <file.hwp>...
// Each file runs in its own process: the native addon ends the process when its parser panics.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

if (process.argv[2] === "--one") {
  const bytes = readFileSync(process.argv[3]);
  let native;
  try {
    native = require(path.join(__dirname, "../node_modules/@ohah/hwpjs/dist/index.js")).toHtml(bytes);
  } catch (error) {
    native = `error: ${error.message}`;
  }
  import(pathToFileURL(path.join(__dirname, "../web/hwp-wasm.js")).href).then(async ({ convertHwpWithModule }) => {
    const module = await WebAssembly.compile(readFileSync(path.join(__dirname, "../web/vendor/hwp/hwp_core.wasm")));
    let wasm;
    try {
      wasm = await convertHwpWithModule(module, bytes);
    } catch (error) {
      wasm = `error: ${error.message}`;
    }
    console.log(native === wasm ? "same" : native.startsWith("error") && wasm.startsWith("error") ? "both failed" : `DIFFERENT (native ${native.length}, wasm ${wasm.length})`);
  });
} else {
  let different = 0;
  for (const file of process.argv.slice(2)) {
    let result;
    try {
      result = execFileSync(process.execPath, [__filename, "--one", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      result = "native addon crashed";
    }
    if (result.startsWith("DIFFERENT")) different += 1;
    console.log(`${result}\t${path.basename(file)}`);
  }
  process.exitCode = different ? 1 : 0;
}
