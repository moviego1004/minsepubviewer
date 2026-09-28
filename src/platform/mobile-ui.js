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
  const button = (label, action, id) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label;
    if (id) el.id = id;
    el.addEventListener('click', () => Promise.resolve(action()).catch(error => window.alert(error.message)));
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
    dialog.replaceChildren(button('닫기', () => dialog.close()));
    dialog.append(button(`전체 화면 진행 표시: ${document.body.classList.contains('show-reading-progress') ? '켜짐' : '꺼짐'}`, () => {
      const enabled = document.body.classList.toggle('show-reading-progress');
      storage.setItem(progressKey, String(enabled)); dialog.close(); menu();
    }));
    for (const [label, id] of [['새 문서 · Markdown 만들기', 'newMarkdownButton'], ['목차·책갈피', 'leftPanelToggle'], ['읽기 설정', 'rightPanelToggle'], ['페이지 방식', 'paginatedModeButton'], ['연속 스크롤', 'continuousModeButton']]) dialog.append(button(label, () => click(id)));
    if (document.body.classList.contains('markdown-mode')) {
      for (const [label, id] of [['문서 편집', 'markdownEditButton'], ['읽기 모드', 'markdownViewButton'], ['사본 저장', 'saveMarkdownButton'], ['파일로 내보내기', 'saveMarkdownAsButton']]) dialog.append(button(label, () => click(id)));
    } else if (!document.getElementById('exportMarkdownButton').disabled) dialog.append(button('Markdown으로 내보내기', () => click('exportMarkdownButton')));
    dialog.showModal();
  }
  function documents() {
    dialog.replaceChildren(button('닫기', () => dialog.close()));
    for (const tab of tabs()) {
      const row = document.createElement('div');
      row.className = 'mobile-document-row';
      row.append(button(tab.title, async () => { dialog.close(); await activate(tab.id); }), button('닫기', async () => { await closeTab(tab.id); dialog.close(); documents(); }));
      dialog.append(row);
    }
    if (!tabs().length) dialog.append('열린 문서가 없습니다.');
    dialog.showModal();
  }
  controls.append(button('파일 열기', openFile, 'mobileOpenFile'), button('이어 읽기', () => click('recentFilesButton'), 'mobileRecent'), button('열린 문서', documents, 'mobileDocuments'), button('전체 화면', () => full(true), 'mobileFullscreen'), button('☰', menu, 'mobileMenu'));
  toolbar.append(controls);
  document.body.append(document.getElementById('recentFilesMenu'));
  document.getElementById('mobileMenu').setAttribute('aria-label', '메뉴');
  const toast = document.createElement('output');
  toast.className = 'mobile-font-toast'; toast.hidden = true;
  document.body.append(toast);
  let timer;
  full(storage.getItem('minsepubviewer.fullscreen') === 'true');
  return {
    progress: text => { progress.textContent = text; },
    center: () => full(!document.body.classList.contains('mobile-fullscreen')),
    previewFont(size) { toast.textContent = `글자 크기 ${size}`; toast.hidden = false; clearTimeout(timer); timer = setTimeout(() => { toast.hidden = true; }, 900); },
    back() { if (dialog.open) { dialog.close(); return true; } if (document.body.classList.contains('mobile-fullscreen')) { full(false); return true; } return false; }
  };
}
