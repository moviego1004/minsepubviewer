import { errorText, setAttributeText, setText, t } from "../../web/i18n.js";

const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const KIND_LABELS = { epub: 'EPUB', pdf: 'PDF', markdown: 'MD', document: 'DOC' };

function documentKindLabel(tab) {
  if (tab.kind === 'document') {
    const extension = /\.([a-z0-9]+)$/i.exec(tab.title || '')?.[1];
    if (extension) return extension.toUpperCase().slice(0, 4);
  }
  return KIND_LABELS[tab.kind] || 'DOC';
}

export function installMobileUI({ storage, platform, resize, openFile, tabs, activeTab = () => '', activate, closeTab }) {
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
  // Round icon button; the label key is read by screen readers and shown as a tooltip.
  const iconButton = (labelKey, className, action) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.innerHTML = CLOSE_ICON;
    setAttributeText(el, 'aria-label', labelKey);
    setAttributeText(el, 'title', labelKey);
    el.addEventListener('click', () => Promise.resolve(action()).catch(error => window.alert(errorText(error))));
    return el;
  };
  // Popup title with the close (x) button for the popup itself.
  const header = (titleKey) => {
    const head = document.createElement('header');
    head.className = 'mobile-menu-header';
    const title = document.createElement('h2');
    setText(title, titleKey);
    head.append(title, iconButton('mobile.closePopup', 'mobile-menu-close', () => dialog.close()));
    return head;
  };
  const hint = document.createElement('output');
  hint.className = 'mobile-hint';
  hint.hidden = true;
  document.body.append(hint);
  let hintTimer;
  const hintKey = 'minsepubviewer.fullscreen-hint-count';
  // How to leave full screen is shown the first few times it is entered.
  function showFullscreenHint() {
    const count = Number(storage.getItem(hintKey)) || 0;
    if (count >= 3) return;
    storage.setItem(hintKey, String(count + 1));
    setText(hint, 'mobile.fullscreenHint');
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.hidden = true; }, 2600);
  }
  function full(value, { showHint = true } = {}) {
    if (value && showHint && !document.body.classList.contains('mobile-fullscreen')) showFullscreenHint();
    if (!value) hint.hidden = true;
    document.body.classList.toggle('mobile-fullscreen', value);
    storage.setItem('minsepubviewer.fullscreen', String(value));
    void platform.setFullscreen?.(value).catch(console.error);
    requestAnimationFrame(resize);
  }
  function menu() {
    dialog.replaceChildren(header('mobile.menu'));
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
    dialog.replaceChildren(header('mobile.documents'));
    const list = document.createElement('ul');
    list.className = 'mobile-document-list';
    for (const tab of tabs()) {
      const row = document.createElement('li');
      row.className = `mobile-document-row${tab.id === activeTab() ? ' is-active' : ''}`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'mobile-document-open';
      const badge = document.createElement('span');
      badge.className = `mobile-document-kind kind-${tab.kind}`;
      badge.textContent = documentKindLabel(tab);
      const name = document.createElement('span');
      name.className = 'mobile-document-name';
      name.textContent = tab.title;
      open.append(badge, name);
      open.addEventListener('click', () => { dialog.close(); void Promise.resolve(activate(tab.id)).catch(error => window.alert(errorText(error))); });
      row.append(open, iconButton('mobile.closeDocument', 'mobile-document-close', async () => {
        await closeTab(tab.id);
        if (tabs().length) documents(); else dialog.close();
      }));
      list.append(row);
    }
    if (tabs().length) dialog.append(list);
    else {
      const empty = document.createElement('p');
      empty.className = 'mobile-menu-empty';
      setText(empty, 'mobile.noDocuments');
      dialog.append(empty);
    }
    if (!dialog.open) dialog.showModal();
  }
  controls.append(button('mobile.openFile', openFile, 'mobileOpenFile'), button('mobile.resume', () => click('recentFilesButton'), 'mobileRecent'), button('mobile.documents', documents, 'mobileDocuments'), button('mobile.fullscreen', () => full(true), 'mobileFullscreen'), button({ text: '☰' }, menu, 'mobileMenu'));
  toolbar.append(controls);
  document.body.append(document.getElementById('recentFilesMenu'));
  setAttributeText(document.getElementById('mobileMenu'), 'aria-label', 'mobile.menu');
  full(storage.getItem('minsepubviewer.fullscreen') === 'true', { showHint: false });
  return {
    progress: text => { progress.textContent = text; },
    center: () => full(!document.body.classList.contains('mobile-fullscreen')),
    back() { if (dialog.open) { dialog.close(); return true; } if (document.body.classList.contains('mobile-fullscreen')) { full(false); return true; } return false; }
  };
}
