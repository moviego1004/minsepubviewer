import { APP_VERSION } from "../src/core/appVersion.js";
import { setText, t } from "./i18n.js";

// About dialog (settings panel button, phone ☰ menu): version, privacy note, the HWP
// specification notice Hancom asks for, and the open-source licenses the app ships with.
let dialog = null;

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function heading(key) {
  const el = element("h3");
  setText(el, key);
  return el;
}

function paragraph(key) {
  const el = element("p");
  setText(el, key);
  return el;
}

export async function openAboutDialog() {
  // The license texts are about 100KB, so they load only when the dialog is opened.
  const { OPEN_SOURCE_NOTICES } = await import("../src/core/openSourceNotices.js");
  if (!dialog) {
    dialog = element("dialog", "about-dialog");
    document.body.append(dialog);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }
  const header = element("header", "about-header");
  const title = element("h2", "", t("app.name"));
  const close = element("button", "secondary-button");
  close.type = "button";
  setText(close, "about.close");
  close.addEventListener("click", () => dialog.close());
  header.append(title, close);

  const version = element("p", "about-version", t("about.version", { version: APP_VERSION }));

  const list = element("div", "about-licenses");
  for (const notice of OPEN_SOURCE_NOTICES) {
    const item = element("details");
    const summary = element("summary");
    summary.append(element("strong", "", notice.name), element("span", "about-license-meta", [notice.version, notice.license].filter(Boolean).join(" · ")));
    item.append(summary, element("p", "about-copyright", notice.copyright), element("pre", "", notice.text));
    list.append(item);
  }

  dialog.replaceChildren(
    header,
    version,
    heading("about.privacyHeading"),
    paragraph("about.privacy"),
    heading("about.hwpHeading"),
    paragraph("about.hwpNotice"),
    paragraph("about.trademark"),
    heading("about.licensesHeading"),
    paragraph("about.licensesHint"),
    list
  );
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
