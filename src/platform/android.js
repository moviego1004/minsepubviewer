import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { createPersistentStorage } from "./storage.js";
import { hydrateMobileFile } from "./mobile-files.js";
import { errorText, initI18n, setText, t } from "../../web/i18n.js";

const Documents = registerPlugin("ReaderDocuments");
// PDF.js legacy build copied by scripts/build-mobile.js, for older Android WebViews.
globalThis.MINS_PDFJS_BASE = "/vendor/pdfjs/";
globalThis.MINS_MAMMOTH_URL = "/vendor/mammoth/mammoth.browser.min.js";
let preview = null;

function closeImagePreview() {
  if (!preview) return false;
  preview.close();
  return true;
}

async function openImageWindow({ src, alt = "", title = t("image.title") }) {
  closeImagePreview();
  const dialog = document.createElement("dialog");
  dialog.className = "mobile-image-preview";
  dialog.setAttribute("aria-label", title);
  const close = document.createElement("button");
  close.textContent = t("common.close");
  close.addEventListener("click", () => dialog.close());
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  dialog.append(close, image);
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (preview === dialog) preview = null;
  });
  document.body.append(dialog);
  preview = dialog;
  dialog.showModal();
}

async function bootstrap() {
  if (!Capacitor.isNativePlatform()) throw new Error(t("android.runInApp"));
  let storageErrorShown = false;
  const storage = await createPersistentStorage({
    read: async () => (await Documents.readState()).values || {},
    write: (values) => Documents.writeState({ values }),
    onError: (error) => {
      console.error("Reading data could not be saved", error);
      if (!storageErrorShown) {
        storageErrorShown = true;
        window.alert(t("android.storageFailed"));
      }
    }
  });
  const hydrate = async (descriptor) => {
    if (descriptor?.kind === "epub" && !descriptor.cancelled) {
      const prepared = await Documents.prepareEpub({ path: descriptor.path });
      descriptor = { ...descriptor, ...prepared };
    }
    return hydrateMobileFile(descriptor, Capacitor.convertFileSrc);
  };
  let picking = false;
  async function pick(kind) {
    if (picking) return null;
    picking = true;
    try { return await hydrate(await Documents.pickFile({ kind })); }
    finally { picking = false; }
  }

  globalThis.minsePlatform = {
    kind: "android",
    isMobile: true,
    storage,
    flush: () => storage.flush(),
    setFullscreen: (enabled) => Documents.setFullscreen({ enabled }),
    openFile: () => pick(null),
    onExternalDocument: (callback) => {
      let pending = Promise.resolve();
      return Documents.addListener("externalDocument", event => {
        pending = pending.then(async () => {
          if (event.error) throw new Error(event.detail ? `${errorText({ message: event.error })}
${errorText({ message: event.detail })}` : event.error);
          await callback(await hydrate(event.file));
        }).catch(error => window.alert(error?.message ? errorText(error) : t("native.sharedOpenFailed")));
      });
    },
    log: (payload) => console.debug(payload.event, payload.details),
    // The book button opens EPUB or PDF; the reader picks the tab kind from the file name.
    openEpubFile: async () => {
      const result = await pick(null);
      if (result && result.kind === "markdown") throw new Error("native.kindMismatch");
      return result?.file || null;
    },
    openMarkdownFile: async () => (await pick("markdown"))?.document || null,
    openRecentFile: async (path) => hydrate(await Documents.openRecent({ path })),
    getRecentFiles: async () => (await Documents.listRecent()).files || [],
    saveMarkdownFile: async (payload) => {
      const result = await Documents.saveMarkdown(payload);
      return result.cancelled ? null : result;
    },
    exportTextFile: async (payload) => {
      const result = await Documents.exportText(payload);
      return !result.cancelled;
    },
    openImageWindow,
    onBackground: (callback) => App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) void Promise.resolve(callback()).catch(console.error);
    }),
    onBackButton: (callback) => App.addListener("backButton", async () => {
      if (closeImagePreview()) return;
      try { await callback(); } catch (error) { console.error(error); }
    }),
    exit: async () => { await storage.flush(); await App.exitApp(); }
  };
  document.body.classList.add("platform-android");
  initI18n(storage);
  setText(document.querySelector(".brand small"), "app.platformAndroid");
  setText(document.querySelector("#saveMarkdownButton"), "markdown.saveCopy");
  document.querySelector("#saveMarkdownButton").dataset.i18nTitle = "markdown.saveCopyTitle";
  document.querySelector("#saveMarkdownButton").title = t("markdown.saveCopyTitle");
  setText(document.querySelector("#saveMarkdownAsButton"), "markdown.exportFile");
  await import("../../web/app.js");
}

bootstrap().catch((error) => {
  console.error(error);
  const message = document.createElement("p");
  message.className = "mobile-startup-error";
  message.textContent = t("android.startFailed", { detail: error?.message ? errorText(error) : "" });
  document.body.replaceChildren(message);
});
