# 개발 작업 기록

새 작업은 아래에 날짜별로 추가한다. 요청/계획, 변경, 검증, 남은 일 및 중요한 결정을 기록하고 현재 요약은 HANDOFF.md와 NEXT_TASKS.md에 반영한다.

## 2026-09-28 — Android 작업 저장 및 PC 간 인수인계

- 사용자 요청: 현재 변경을 커밋/푸시하고 `doc/` 아래에 다른 PC의 Codex가 이어갈 자료를 남길 것. 앞으로도 계획과 결과를 지속 기록할 것.
- 기존 미커밋 변경을 보존하여 Android 프로젝트, 플랫폼 연결부, 모바일 UI/터치/파일 저장 코드, 빌드·설치 스크립트 및 테스트를 함께 인수인계한다. 기존에 스테이징된 EPUB/Markdown 관련 파일도 포함한다.
- 코드 확인 결과: Android API 24 이상 설정, 화면 크기 변화에 따른 재배치 지원. 기기 모델별 분류 및 전자잉크 전용 최적화는 없음. 모든 Android/WebView/단말 조합을 검증한 상태가 아님.
- 문서: `doc/HANDOFF.md`, `doc/NEXT_TASKS.md`, `doc/WORK_LOG.md`, `doc/ANDROID.md`, `doc/DEVELOPMENT_PLAN.md`. 루트 `AGENTS.md`에 시작 전 읽기 및 작업 전후 문서 갱신 규칙 추가. 기존 `docs/` 경로는 새 위치 안내로 유지한다.
- 검증: `npm.cmd test` 107개 통과, `node --check web/app.js` 통과, `npm.cmd run android:sync` 통과. sync 첫 실행은 샌드박스 읽기 권한 제한으로 실패했고 권한 확장 후 성공했다.
- APK/Java 검사와 실제 Android 단말 검사는 이번에 재실행하지 않음. 다음 우선순위는 실기기 호환성 확인이며 구체적 구현 요청은 아직 없음.
- 빌드 산출물, SDK 로컬 설정 및 서명키는 Git 제외 정책을 유지한다.
- 추가 검증: `npm.cmd run test:reader` 실패(exit 1). 위치 저장/복원 로그 이후 `Uncaught TypeError: Cannot read properties of undefined (reading 'bounds')`가 발생했고 `scripts/smoke-reader.cjs:256`에서 오류 배열이 비어 있어야 한다는 검사가 실패했다. 이 인수인계 요청에서는 원인 수정까지 확장하지 않았으며 다음 작업의 첫 진단 대상으로 남긴다. 이 테스트는 모의 Android 플랫폼을 사용하므로 실기기 검증과 별개다.
- 로컬 커밋: `c7904ef` (`Add Android reader support and cross-PC development handoff`). 첫 `git push origin master`는 자동 승인 검토가 GitHub 목적지 소유/신뢰 증거 부족으로 차단했다. `gh` 도구가 없어 계정 소유 확인은 수행하지 못했고 사용자에게 정확한 목적지 업로드 확인을 요청했다. 원격 전송 완료로 추정하지 않는다.
- 후속 정리: 변경 파일 4개의 줄 끝 공백/빈 줄을 정리했다. 기능 변경은 없다.

## 2026-10-17 — PDF 지원, 다국어(ko/en), 앱 이름 Mins Reader

- 사용자 요청: PDF도 보는 범용 뷰어(PC·Android, iOS는 Mac 부재로 보류). PDF는 라이브러리 제공 기능까지만, 형광펜은 앱 내부 저장(방식 B), 모든 메뉴 한/영 다국어, 앱 이름 Mins Reader. 작업 중 추가 요청: "MD 열기"를 범용 문구로, HWP/DOC 가능 여부 질문.
- 시작 확인: `git fetch` 후 `master` = `origin/master` = `39cef44`, 미커밋 변경 없음.
- 다국어: `src/core/i18n.js`, `src/locales/{ko,en}.js`, `web/i18n.js`. `index.html`은 `data-i18n*` 속성, `app.js`·모바일 UI·Android 부트스트랩 문구를 키로 교체. Electron 대화상자는 렌더러가 `app:set-locale`로 알린 언어 사용. Java 오류 문구는 `native.*` 키로 바꾸고 화면에서 번역. Toast UI 편집기 언어는 문서를 열 때 적용(실행 중 전환은 다음 열기부터).
- PDF: `pdfjs-dist@6.3.289`(Apache-2.0, 6.4.299는 출시 2주라 제외). `web/pdf-reader.js`가 PDFViewer/FindController/LinkService를 감싸고, `src/core/pdfLocation.js`가 `pdf:page=..&zoom=..&left=..&top=..` 위치와 `pdf-range:` 형광펜 좌표(PDF 좌표계)를 다룬다. 책 식별자는 PDF fingerprint(`pdf-<hash>`). 테마는 PDF.js pageColors, 쪽 모드에서 휠 끝 도달 시 쪽 이동.
- PC: `.pdf` 파일 연결·명령줄 열기·드롭, 통합 `document:open` 대화상자, `.mjs/.wasm/.png` MIME, 패키지 파일 목록에 PDF.js 자산 추가, F11/버튼 전체 화면(도구 숨김).
- Android: 매니페스트 `application/pdf` 열기/공유, 플러그인 PDF 가져오기(512MB), `mobile-files.js`가 PDF를 URL로 전달, `build-mobile.js`가 PDF.js legacy 빌드 복사, PDF 화면 탭/스와이프(쪽이 화면에 맞을 때만)와 백그라운드 시 위치 저장.
- 이름: Electron productName/창 제목/설치 스크립트/Capacitor appName/strings.xml을 Mins Reader로. 패키지 앱은 기존 "Mins EPUB Viewer" 프로필 폴더가 있으면 계속 사용. NSIS는 이전 이름 바로가기·exe를 정리. `appId`, npm 패키지 이름(개발 프로필 경로), 저장 키는 유지.
- "MD 열기" → "파일 열기"(EPUB·PDF·MD·TXT), EPUB 전용 폴더 아이콘 버튼 숨김.
- 테스트: `test/core/i18n.test.js`, `test/core/pdfLocation.test.js`, mobile-files PDF 케이스, `scripts/smoke-pdf.cjs`(`npm.cmd run test:pdf`), `scripts/sample-pdf.cjs`, `test:reader`에 PDF·언어 전환 단계.
- 검증 결과: `npm.cmd test` 119 통과, `test:reader` 통과, `test:pdf` 통과, `android:sync` 통과, `npx electron . <pdf>`로 PDF 열림 로그 확인. `test:reader`의 이전 `bounds` 오류는 5회 미재현.
- 미검증: 이 PC에 JDK/SDK가 없어 `android:apk`(Java 컴파일)·실기기 미실행. 패키지 설치본 업그레이드·프로필 유지, Electron 대화상자 문구, 실제 한글/스캔/대용량 PDF 미확인.
- HWP/DOC 검토: DOCX는 mammoth 1.13.0(BSD-2) 읽기 전용 변환 가능, HWP는 @ohah/hwpjs 0.1.0-rc.10(MIT, 2026-03) 또는 hwp.js 0.0.3(2022 이후 정체) — 표·이미지 품질 확인 필요, 구형 DOC는 비권장. 구현은 사용자 결정 대기.
- 커밋/푸시: 사용자 요청으로 `fff1c45`를 `origin/master`에 푸시했다(`39cef44..fff1c45`). 푸시 후 `git status -sb`에서 로컬과 원격 일치 확인.
