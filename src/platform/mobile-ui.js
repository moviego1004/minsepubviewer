import { errorText, setAttributeText, setText, t } from "../../web/i18n.js";

export function installMobileUI({ storage, platform, resize, openFile, tabs, activate, closeTab }) {
  const toolbar = document.querySelector('.toolbar');
  const controls = document.createElement('div');
  controls.className = 'mobile-tools';
  const dialog = document.createElement('dialog');
  dialog.className = 'mobile-menu';
  document.body.append(dialog);
  const progress = document.createElement('output');
  progress.className = 'mobile-fullscreen-progress';
  document.body.append(progress);
  const progressKey = 'minsepubviewer.fullscreen-progress';
  document.body.classList.toggle('show-reading-progress', storage.getItem(progressKey) === 'true');
  // Labels are message keys; plain text (document titles) is passed with { text }.
  const button = (label, action, id) => {
    const el = document.createElement('button');
    el.type = 'button';
    if (typeof label === 'string') setText(el, label); else el.textContent = label.text;
    if (id) el.id = id;
    el.addEventListener('click', () => Promise.resolve(action()).catch(error => window.alert(errorText(error))));
    return el;
  };
  const click = id => { dialog.close(); document.getElementById(id).click(); };
  function full(value) {
    document.body.classList.toggle('mobile-fullscreen', value);
    storage.setItem('minsepubviewer.fullscreen', String(value));
    void platform.setFullscreen?.(value).catch(console.error);
    requestAnimationFrame(resize);
  }
  function menu() {
    dialog.replaceChildren(button('common.close', () => dialog.close()));
    dialog.append(button({ text: t('mobile.progressToggle', { state: t(document.body.classList.contains('show-reading-progress') ? 'common.on' : 'common.off') }) }, () => {
      const enabled = document.body.classList.toggle('show-reading-progress');
      storage.setItem(progressKey, String(enabled)); dialog.close(); menu();
    }));
    for (const [label, id] of [['mobile.newMarkdown', 'newMarkdownButton'], ['mobile.tocBookmarks', 'leftPanelToggle'], ['mobile.readingSettings', 'rightPanelToggle'], ['mobile.paginated', 'paginatedModeButton'], ['mobile.continuous', 'continuousModeButton']]) dialog.append(button(label, () => click(id)));
    if (document.body.classList.contains('markdown-mode')) {
      for (const [label, id] of [['mobile.editDocument', 'markdownEditButton'], ['mobile.readMode', 'markdownViewButton'], ['markdown.saveCopy', 'saveMarkdownButton'], ['markdown.exportFile', 'saveMarkdownAsButton']]) dialog.append(button(label, () => click(id)));
    } else if (!document.getElementById('exportMarkdownButton').disabled) dialog.append(button('mobile.exportMarkdown', () => click('exportMarkdownButton')));
    dialog.showModal();
  }
  function documents() {
    dialog.replaceChildren(button('common.close', () => dialog.close()));
    for (const tab of tabs()) {
      const row = document.createElement('div');
      row.className = 'mobile-document-row';
      row.append(button({ text: tab.title }, async () => { dialog.close(); await activate(tab.id); }), button('common.close', async () => { await closeTab(tab.id); dialog.close(); documents(); }));
      dialog.append(row);
    }
    if (!tabs().length) dialog.append(t('mobile.noDocuments'));
    dialog.showModal();
  }
  controls.append(button('mobile.openFile', openFile, 'mobileOpenFile'), button('mobile.resume', () => click('recentFilesButton'), 'mobileRecent'), button('mobile.documents', documents, 'mobileDocuments'), button('mobile.fullscreen', () => full(true), 'mobileFullscreen'), button({ text: '☰' }, menu, 'mobileMenu'));
  toolbar.append(controls);
  document.body.append(document.getElementById('recentFilesMenu'));
  setAttributeText(document.getElementById('mobileMenu'), 'aria-label', 'mobile.menu');
  const toast = document.createElement('output');
  toast.className = 'mobile-font-toast'; toast.hidden = true;
  document.body.append(toast);
  let timer;
  full(storage.getItem('minsepubviewer.fullscreen') === 'true');
  return {
    progress: text => { progress.textContent = text; },
    center: () => full(!document.body.classList.contains('mobile-fullscreen')),
    previewFont(size) { toast.textContent = t('mobile.fontSize', { size }); toast.hidden = false; clearTimeout(timer); timer = setTimeout(() => { toast.hidden = true; }, 900); },
    back() { if (dialog.open) { dialog.close(); return true; } if (document.body.classList.contains('mobile-fullscreen')) { full(false); return true; } return false; }
  };
}
