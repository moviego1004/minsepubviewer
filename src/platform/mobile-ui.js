import { errorText, setAttributeText, setText, t } from "../../web/i18n.js";

const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_PATHS = {
  toc: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4a2 2 0 1 0 0-4M9 15a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  gauge: 'M5.6 18.4a9 9 0 1 1 12.8 0M12 13l4-4',
  reflow: 'M4 6h16M4 12h12a3 3 0 0 1 0 6h-5M13 15l-3 3l3 3M4 18h3',
  pages: 'M8 3h9l3 3v12H8zM4 7v14h11',
  newDocument: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  export: 'M12 15V4M8 8l4-4l4 4M5 14v6h14v-6',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5h.01',
  chevron: 'M9 6l6 6l-6 6'
};
const svgIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
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
  // The dialog has padding, so a click targeting it may still be inside the sheet.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
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
  const menuRow = (iconName, labelKey, action, { chevron = false } = {}) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mobile-menu-row';
    el.innerHTML = `<span class="mobile-menu-icon">${svgIcon(iconName)}</span>`;
    const label = document.createElement('span');
    label.className = 'mobile-menu-label';
    setText(label, labelKey);
    el.append(label);
    if (chevron) el.insertAdjacentHTML('beforeend', `<span class="mobile-menu-chevron">${svgIcon('chevron')}</span>`);
    el.addEventListener('click', () => Promise.resolve(action(el)).catch(error => window.alert(errorText(error))));
    return el;
  };
  const switchRow = (iconName, labelKey, checked, action) => {
    const el = menuRow(iconName, labelKey, action);
    el.setAttribute('role', 'switch');
    el.setAttribute('aria-checked', String(checked));
    el.insertAdjacentHTML('beforeend', '<span class="mobile-switch" aria-hidden="true"></span>');
    return el;
  };
  // Two exclusive choices backed by the toolbar buttons with the given ids.
  const segment = options => {
    const group = document.createElement('div');
    group.className = 'mobile-segment';
    group.setAttribute('role', 'group');
    for (const [labelKey, id] of options) {
      const el = button(labelKey, () => click(id));
      el.setAttribute('aria-pressed', String(document.getElementById(id).classList.contains('is-active')));
      group.append(el);
    }
    return group;
  };
  const section = (titleKey, items) => {
    const wrap = document.createElement('section');
    wrap.className = 'mobile-menu-section';
    const title = document.createElement('h3');
    setText(title, titleKey);
    const group = document.createElement('div');
    group.className = 'mobile-menu-group';
    group.append(...items);
    wrap.append(title, group);
    return wrap;
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
    const view = [
      segment([['mobile.paginated', 'paginatedModeButton'], ['mobile.continuous', 'continuousModeButton']]),
      menuRow('toc', 'mobile.tocBookmarks', () => click('leftPanelToggle'), { chevron: true }),
      menuRow('sliders', 'mobile.readingSettings', () => click('rightPanelToggle'), { chevron: true }),
      switchRow('gauge', 'mobile.progressToggle', document.body.classList.contains('show-reading-progress'), el => {
        const enabled = document.body.classList.toggle('show-reading-progress');
        storage.setItem(progressKey, String(enabled));
        el.setAttribute('aria-checked', String(enabled));
      })
    ];
    for (const [id, iconName, labelKey] of [['pdfReflowButton', 'reflow', 'mobile.pdfReflowToggle'], ['hwpPagesButton', 'pages', 'mobile.hwpPagesToggle']]) {
      const toggle = document.getElementById(id);
      if (toggle && !toggle.hidden) view.push(switchRow(iconName, labelKey, toggle.getAttribute('aria-pressed') === 'true', () => click(id)));
    }
    const documentItems = [];
    if (document.body.classList.contains('markdown-mode')) {
      documentItems.push(
        segment([['mobile.editDocument', 'markdownEditButton'], ['mobile.readMode', 'markdownViewButton']]),
        menuRow('save', 'markdown.saveCopy', () => click('saveMarkdownButton')),
        menuRow('export', 'markdown.exportFile', () => click('saveMarkdownAsButton'))
      );
    } else if (!document.getElementById('exportMarkdownButton').disabled) {
      documentItems.push(menuRow('export', 'mobile.exportMarkdown', () => click('exportMarkdownButton')));
    }
    documentItems.push(menuRow('newDocument', 'mobile.newMarkdown', () => click('newMarkdownButton')));
    dialog.replaceChildren(
      header('mobile.menu'),
      section('mobile.sectionView', view),
      section('mobile.sectionDocument', documentItems),
      section('mobile.sectionApp', [menuRow('info', 'about.open', () => click('aboutButton'), { chevron: true })])
    );
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
