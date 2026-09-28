import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { createPersistentStorage } from "./storage.js";
import { hydrateMobileFile } from "./mobile-files.js";

const Documents = registerPlugin("ReaderDocuments");
let preview = null;

function closeImagePreview() {
  if (!preview) return false;
  preview.close();
  return true;
}

async function openImageWindow({ src, alt = "", title = "이미지" }) {
  closeImagePreview();
  const dialog = document.createElement("dialog");
  dialog.className = "mobile-image-preview";
  dialog.setAttribute("aria-label", title);
  const close = document.createElement("button");
  close.textContent = "닫기";
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
  if (!Capacitor.isNativePlatform()) throw new Error("Android 앱에서 실행해 주세요.");
  let storageErrorShown = false;
  const storage = await createPersistentStorage({
    read: async () => (await Documents.readState()).values || {},
    write: (values) => Documents.writeState({ values }),
    onError: (error) => {
      console.error("Reading data could not be saved", error);
      if (!storageErrorShown) {
        storageErrorShown = true;
        window.alert("읽기 기록을 저장하지 못했습니다. 기기의 저장 공간을 확인해 주세요.");
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
          if (event.error) throw new Error(event.error);
          await callback(await hydrate(event.file));
        }).catch(error => window.alert(error.message || "공유 파일을 열지 못했습니다."));
      });
    },
    log: (payload) => console.debug(payload.event, payload.details),
    openEpubFile: async () => (await pick("epub"))?.file || null,
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
  document.querySelector(".brand small").textContent = "Android Reader";
  document.querySelector("#saveMarkdownButton").textContent = "사본 저장";
  document.querySelector("#saveMarkdownButton").title = "앱 내부 사본에 저장합니다";
  document.querySelector("#saveMarkdownAsButton").textContent = "파일로 내보내기";
  await import("../../web/app.js");
}

bootstrap().catch((error) => {
  console.error(error);
  const message = document.createElement("p");
  message.className = "mobile-startup-error";
  message.textContent = `앱을 시작하지 못했습니다. 앱을 다시 실행해 주세요. ${error.message || ""}`;
  document.body.replaceChildren(message);
});
