// Electron, Android and the browser share the reader, not their file APIs.
// The Android bootstrap installs its adapter before importing the reader.
export const platform = globalThis.minsePlatform || {
  ...globalThis.minseDesktop,
  kind: globalThis.minseDesktop ? "desktop" : "browser",
  isMobile: false,
  storage: globalThis.localStorage,
  flush: async () => {},
  log(payload) {
    void fetch("/__client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
};

export const storage = platform.storage;
