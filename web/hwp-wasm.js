// HWP 5.0 to page-layout HTML in the browser: the hwp-core parser of @ohah/hwpjs 0.1.0-rc.10, the
// same one the desktop app runs natively, built for wasm32 without threads or imports
// (native/hwp-wasm, scripts/build-hwp-wasm.cjs). The phone uses it for the original page view.
// Each conversion gets a fresh instance: its memory is dropped afterwards, and a parser panic
// (a WebAssembly trap) cannot leave a broken instance behind.
const DEFAULT_URL = "/web/vendor/hwp/hwp_core.wasm";
let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const url = globalThis.MINS_HWP_WASM_URL || DEFAULT_URL;
    modulePromise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => WebAssembly.compile(buffer));
    modulePromise.catch(() => { modulePromise = null; });
  }
  return modulePromise;
}

export async function convertHwpToPageHtml(bytes) {
  let exports;
  try {
    exports = (await WebAssembly.instantiate(await loadModule(), {})).exports;
  } catch {
    throw new Error("document.converterLoadFailed");
  }
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let ok;
  try {
    const pointer = exports.hwp_alloc(data.byteLength);
    new Uint8Array(exports.memory.buffer, pointer, data.byteLength).set(data);
    ok = exports.hwp_to_html(pointer, data.byteLength);
  } catch {
    throw new Error("document.invalidHwp");
  }
  const text = new TextDecoder().decode(new Uint8Array(exports.memory.buffer, exports.hwp_out_ptr(), exports.hwp_out_len()));
  if (!ok) throw new Error("document.invalidHwp");
  return text;
}
