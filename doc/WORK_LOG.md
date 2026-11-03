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

## 2026-10-17 (계속) — Android 빌드 환경 설치, APK 빌드, HWP 평가

- 사용자 요청: 이 PC에서 Android 빌드(YTHelper 참고), JDK/SDK는 이 프로젝트 전용이 아니라 PC 전체에서 범용으로 쓰도록 설치. 라이선스 동의 승인. PC 설치본은 사용자가 직접 테스트. HWP·HWPX·DOCX 지원 의견 요청, 샘플은 `test/sample`.
- 확인: YTHelper `local.properties`와 사용자 환경 변수는 `%LOCALAPPDATA%AndroidSdk`, `%LOCALAPPDATA%MinsAndroidjdk-21`을 가리켰지만 두 폴더 모두 없었다. javac/adb/Android Studio도 없음.
- `scripts/setup-android.ps1`: JDK 기본 위치를 `%LOCALAPPDATA%ProgramsEclipse Adoptiumjdk-21`로 변경(`-JdkRoot`/`-SdkRoot` 지원), 내려받기·로그는 `%LOCALAPPDATA%Androidsetup-downloads`, 남은 빈 임시 폴더 정리, 없는 예전 JDK PATH 항목 제거. PowerShell 5.1에서 sdkmanager stderr 경고로 중단되던 문제와 파이프 응답이 전달되지 않던 문제를 수정(응답 파일 → cmd.exe 입력, `--install` 대상 라이선스만 동의).
- 설치 중 한 번 `--licenses`로 직접 시험했다가 모든 SDK 라이선스가 기록되어, 필요한 `android-sdk-license` 외 기록 파일은 삭제했다.
- 설치 결과: Temurin JDK 21.0.12, cmdline-tools 22.0, platform-tools(adb 37.0.1), Platform 36, Build Tools 35.0.0/36.0.0. 사용자 환경 변수 JAVA_HOME/ANDROID_HOME/Path 설정(관리자 권한 없음, 이 Windows 사용자 전체에 적용).
- `scripts/build-android.js`: 이 환경의 `NoDefaultCurrentDirectoryInExePath=1` 때문에 `gradlew.bat`를 못 찾아 `.gradlew.bat`로 명시. 기본 JDK 탐색 경로도 새 위치로.
- Java 테스트 `ReaderFilesTest` 2건이 예전 한국어 문구(보관함/경로)를 확인하고 있어 `native.outsideLibrary`/`native.invalidEntryPath` 키 비교로 수정.
- 검증: `npm.cmd run android:apk` → BUILD SUCCESSFUL, `app-debug.apk` 8.0MB(PDF.js 자산 포함 확인). `gradlew testDebugUnitTest` 5/5 통과. `npm.cmd test` 119 통과. 실기기 미확인.
- HWP 평가: NEXT_TASKS 참고. `test/sample/`은 `.gitignore`에 추가.

## 2026-10-17 (계속) — 오피스·한글 문서 지원과 배포 크기 축소

- 사용자 요청: 제안 순서대로 HWP·HWPX·DOCX 지원, 배포 크기 축소 방안 검토(공통 라이브러리 별도 받기 등), 빌드·테스트 준비되면 알릴 것.
- 공통: `web/document-reader.js`(변환 HTML을 sandbox=allow-same-origin iframe에 표시, 스크립트·on* 속성·javascript: 링크 제거, 링크 이동 차단), `src/core/textAnchors.js`(doc:scroll 위치, doc-range 문자 오프셋, 쪽 단위 이동, 검색), `web/document-convert.js`(형식 판별·변환). `app.js`에 document 모드(탭, 이어보기, 쪽 이동, 책갈피(비율 %), 형광펜·메모, 검색, 테마, Ctrl+휠 확대, 모바일 탭·핀치 확대).
- DOCX: mammoth 1.13.0 브라우저 번들을 처음 열 때만 불러옴. HWPX(OWPML zip)·HWPML(.hwp XML): `src/core/hwpXml.js`(문단·줄바꿈·표·병합, 문서 메타데이터 미표시, UTF-16 선언·UTF-8 실제 인코딩 처리). 실제 HWPML 샘플: 문단 108, 표 5, 셀 78(원본 태그 수와 일치).
- HWP 5.0: PC는 `document:convert-hwp` IPC로 메인 프로세스에서 `@ohah/hwpjs` 네이티브 변환(64MB 이하). 쪽 바탕이 투명해지는 문제를 CSS로 수정(.hpa). Android는 `document.hwpDesktopOnly` 안내. Electron 원격 오류 문자열에서 메시지 키를 꺼내 번역하도록 `translateErrorMessage` 보강.
- 열기 경로: 파일 열기 입력/대화상자(문서 필터 추가), 드롭, 명령줄(.docx/.hwp/.hwpx), Android 선택기·공유(MIME 추가, 원래 확장자로 앱 사본 저장, 64MB). 파일 연결(.docx/.hwp 기본 앱 등록)은 다른 앱 기본값을 바꿀 수 있어 추가하지 않음.
- 배포 크기: 0.1.0 설치본 101.9MB(풀린 크기 238MB, app.asar 19.4MB에 Toast UI 원본·Capacitor·epubjs 원본과 의존성 포함). 이번 패키지는 app.asar 7.5MB(PDF·DOCX·HWP 포함), 언어 파일 55개(25MB) → 2개. 풀린 크기 276MB 중 Electron 42 런타임이 약 265MB(`Mins Reader.exe` 216MB). zip 압축 129.6MB → NSIS LZMA 설치본은 약 100MB 예상(미측정). APK 8.1MB(PDF.js min, mammoth 0.4MB 포함).
- 실행 중 라이브러리 내려받기 방식은 줄어드는 양이 수 MB(PDF.js·mammoth)에 그치고 첫 사용에 인터넷·무결성 확인이 필요해 채택하지 않음. 큰 절감은 Electron 대신 시스템 WebView2를 쓰는 셸 전환이 필요(별도 검토 과제).
- 검증: `npm.cmd test` 129 통과, `test:reader` 통과(DOCX 탭 넘김·HWP 5.0 안내 추가), `test:pdf` 통과, `test:documents`(신규) 통과, Electron 개발 실행으로 실제 HWP 5.0 샘플 열림 확인, `npm.cmd run build` 후 **패키지된 `Mins Reader.exe`**에서 PDF·DOCX·HWP 5.0(13쪽) 열림을 DevTools 프로토콜로 확인, `android:apk` 성공, Java 테스트 5/5.
- 중간 발견·수정: 쪽 이동이 화면 높이의 92%라 쪽 번호가 바뀌지 않던 문제(반올림·끝은 마지막 쪽), 연속 스크롤 설정에서는 모바일 탭 넘김이 꺼지는 것은 EPUB과 같은 의도된 동작.
- 테스트 중 개발 프로필(%APPDATA%MinsEPUBviewer)의 최근 파일에 들어간 테스트 항목 3개를 제거(사용자 항목 7개 유지). 같은 프로필의 내부 책 기록(localStorage)에는 테스트 문서 기록이 남아 있을 수 있음.
- 미검증: 실기기, 설치 파일(NSIS) 실제 크기·업그레이드, 실제 DOCX/HWPX 사용자 문서, 매우 큰 HWP.

## 2026-10-17 (계속) — 배포 파일 이름과 버전 규칙

- 사용자 지시: 앞으로 앱 빌드 파일은 `MinsReader_ver<버전>`, 빌드할 때마다 버전 번호를 하나씩 올린다.
- `scripts/bump-version.cjs` 재작성: PC(0.1.0)와 Android(0.1.3) 중 높은 버전에서 이어서 마지막 자리 +1, Android versionCode +1. package.json·package-lock·installer.nsi·android/app/build.gradle을 함께 갱신하고 실패 시 되돌리는 restore() 제공.
- `scripts/release.cjs` 추가(`npm.cmd run release`, `release:pc`, `release:android`): 버전을 올린 뒤 PC 패키지+NSIS 설치 파일(`build/MinsReader_ver<버전>.exe`)과 APK 복사본(`build/MinsReader_ver<버전>.apk`)을 만든다. 빌드 실패 시 버전 복원. `build/win-unpacked`만 지워 이전 배포 파일을 보존(이전 `makeSetup.bat`은 build 폴더 전체를 삭제했음).
- `makeSetup.bat`은 `node scripts/release.cjs pc`를 호출하는 얇은 래퍼로 변경(날짜·일련번호 방식 제거).
- 검증: `test/electron/releaseVersion.test.cjs` 3개 통과. `npm.cmd run release` 실행 → 0.1.4(versionCode 5), `build/MinsReader_ver0.1.4.exe` 94.1MB, `build/MinsReader_ver0.1.4.apk` 7.5MB 생성. 설치 파일 실행·업그레이드는 사용자 테스트 예정.

## 2026-10-18 — 휴대폰 핀치 확대, PDF 확대, HWP·HWPX 열기

- 사용자 요청(0.1.4 실기기 테스트): ① 핀치 확대·축소가 손을 뗄 때만 반영되고 비율 알림 상자만 보임 → 바로 반영 ② PDF 확대·축소 안 됨 ③ HWP, HWPX가 열리지 않음.
- 시작 확인: 미커밋 변경 없음, `master` = `origin/master` = `a07e9d4`.
- 원인: ① `touch-reader.js`가 핀치 중에는 글자 크기 알림만 보이고 `touchend`에서 `setFont` 호출 ② `supportsPinchToZoom`은 PDFViewer 옵션일 뿐 실제 핀치 처리(TouchManager)는 PDF.js 전체 앱 쪽 코드라 이 앱에는 없었음, WebView 기본 확대도 꺼져 있음 ③ HWP 5.0은 휴대폰에서 의도적으로 "PC 전용" 안내만 표시. HWPX는 코드 경로상 문제를 찾지 못함(실기기 오류 문구 미확보).
- 변경:
  - `src/platform/touch-reader.js`: `fontSize/previewFont/setFont` 대신 `pinch: { begin(center), move(ratio, center), end(ratio) }` 콜백. 손가락 사이 중심을 최상위 화면 좌표로 넘김.
  - `web/app.js`: `createPinchPreview`(움직이는 동안 대상 요소에 `transform: scale`, 손가락 중심 기준, 부모는 잠시 overflow hidden, 손을 떼면 글자 크기/배율 저장 후 transform 해제. EPUB은 `relocated`까지 기다려 깜빡임 축소). EPUB은 `#reader`, MD는 `#markdownViewer`, 변환 문서는 `#docFrame`. PDF는 `state.pdf.pinchZoom(factor, center)`.
  - `web/pdf-reader.js`: `pinchZoom` — `PDFViewer.updateScale({ drawingDelay: 400, scaleFactor, origin })`, 배율 0.25–5.
  - `src/platform/mobile-ui.js`, `web/mobile.css`, 언어 사전: 글자 크기 알림(`mobile.fontSize`) 제거.
  - `src/core/hwpBinary.js`(신규): OLE 복합 파일(FAT·DIFAT·미니 스트림), HWP 레코드(확장 크기 포함), 문단 텍스트 제어 문자, 표(셀 주소·병합), 글상자(gso), 각주·미주. 암호(`document.hwpEncrypted`)·배포용(`document.hwpDistribution`) 문구 추가, `document.hwpDesktopOnly` 삭제.
  - `web/document-convert.js`: `platform.convertHwp`가 없으면(Android·브라우저) 자체 모듈 사용, 압축 해제는 `DecompressionStream('deflate-raw')`. `web/document-reader.js`에 글상자·각주 스타일.
  - 테스트: `test/core/hwpBinary.test.js`(4개), `scripts/sample-documents.cjs`에 `createSampleHwp`(devDependency `cfb@1.2.2`로 복합 파일 생성), `test:reader`에 실시간 핀치(EPUB·MD·PDF·DOCX, 손가락을 뗀 상태가 아닌 움직이는 중 확대 확인)와 휴대폰 HWP 5.0·HWPX 열기 단계.
- 실제 샘플 비교(개인 문서, 커밋 안 함): 자체 모듈 대 `@ohah/hwpjs` 글자 일치율 90%, 96.5%. 빠진 것은 쪽 번호, 자동 문단 번호, 일부 머리말. 변환 시간 3–25ms. 표 25·26개 표시.
- 검증: `npm.cmd test` 136 통과, `test:reader` 통과, `test:pdf` 통과, `test:documents` 통과(첫 실행은 DOCX 위치 복원 대기 시간 초과 1회, 재실행 통과), `npm.cmd run release` → 0.1.5(versionCode 6) `build/MinsReader_ver0.1.5.exe` 94.1MB, `build/MinsReader_ver0.1.5.apk` 7.5MB 생성. 첫 실행은 셸에 남은 예전 JAVA_HOME(삭제된 MinsAndroid 경로) 때문에 Android 단계에서 실패하고 버전이 되돌려짐 → `scripts/build-android.js`가 존재하지 않는 JAVA_HOME을 무시하도록 수정 후 재실행 성공.
- 미검증: 실기기 핀치 체감·성능(특히 큰 EPUB 재배치), 실제 HWPX 사용자 파일, 휴대폰에서 큰 HWP.

## 2026-10-18 (계속) — 터치 구역 분리, PDF 탭 넘김, 열린 문서 창, 빌드 규칙

- 사용자 요청: 위 NEXT_TASKS 4건(쪽 넘김과 전체 화면 구분·형광펜용 가운데 탭, PDF 위·아래 탭, 열린 문서 창 아이콘, 빌드 경로·버전 규칙을 스크립트에 반영).
- 원인: `getTouchNavigation`이 `continuous`이면 탭까지 모두 꺼서, EPUB 연속 스크롤·MD·변환 문서 연속 보기·쪽이 화면보다 큰 PDF(기본 쪽 너비 맞춤에서 흔함)에서는 위·아래 탭도 가운데 탭 처리 → `center()` 전체 화면 전환. 가운데 한 번 탭도 전체 화면 전환이라 형광펜 시작과 충돌.
- 변경:
  - `src/core/touchNavigation.js`: `continuous`는 밀기만 끄고 위·아래 탭은 유지. `isCenterTap` 추가(가운데 1/3, 350ms·12px 이내).
  - `src/platform/touch-reader.js`: 가운데 두 번 탭(350ms, 40px 이내)에서만 `center()`. 쪽 이동 탭은 두 번 탭 대기를 초기화.
  - `web/pdf-reader.js`: `step(direction)` — 현재 쪽의 화면상 위·아래 경계 기준으로 0.9화면씩 스크롤, 남은 부분이 화면 5% 미만이면 쪽 이동(PDF.js가 쪽 위에 남기는 몇 px 여백 때문). `web/app.js`의 PDF 탭은 `step` 사용(아래 이동 버튼은 기존대로 쪽 단위).
  - `src/platform/mobile-ui.js`, `web/mobile.css`: 창 머리말(제목 + ✕ 아이콘), 열린 문서 목록(형식 배지·말줄임 이름·✕ 아이콘·현재 문서 강조), 전체 화면 안내 문구(처음 3번). 문구 `mobile.closePopup`, `mobile.closeDocument`, `mobile.fullscreenHint`(ko/en).
  - 빌드: `scripts/bump-version.cjs`에 `listReleaseFiles`/`latestReleaseFile`/`maxVersion`, 다음 번호는 PC·Android·`build/` 기존 배포 파일 중 최고 +1. `scripts/release.cjs`가 결과 위치·이름 검사. `package.json`: `build` → release(둘 다), 기존 폴더 빌드는 `build:pc-dir`, `android:apk` → release android, electron-builder artifactName도 `MinsReader_ver${version}`. `build.bat` → release. `scripts/install-android.js`는 `build/`의 최고 버전 APK 설치.
  - 테스트: touchNavigation 5개(연속 화면 탭·가운데 탭), releaseVersion에 배포 파일 목록·최고 버전 검사, `test:reader`에 가운데 한 번 탭은 전체 화면 유지·두 번 탭 해제, 확대한 PDF 아래 탭 스크롤→다음 쪽→위 탭 이전 쪽, 열린 문서 창 아이콘·현재 문서.
- 검증: `npm.cmd test` 139 통과, `test:reader`·`test:pdf`·`test:documents` 통과. 열린 문서 창은 실제 CSS로 375px 화면 미리보기 확인(긴 이름 말줄임, ✕ 아이콘 표시). `npm.cmd run build`(새 경로) → 0.1.6(versionCode 7), `build/MinsReader_ver0.1.6.exe` 94.1MB, `build/MinsReader_ver0.1.6.apk` 7.5MB.
- 미검증: 실기기 터치 체감(두 번 탭 간격 350ms가 적절한지), 실제 형광펜 흐름(길게 눌러 선택 → 도구 막대).

## 2026-10-18 (계속) — 스크롤(밀기)로 쪽 이동

- 사용자 요청: 위·아래 탭뿐 아니라 스크롤로도 쪽 이동. PDF는 스크롤로 이동이 안 됨. 다른 형식도 확인·수정.
- 조사: 모의 Android에서 PDF 쪽이 화면에 맞을 때는 위로 밀기로 다음 쪽 이동 확인. 쪽이 화면보다 크면 `paginated()`가 거짓이 되어 밀기는 PDF.js 쪽 안 스크롤만 하고(쪽 보기는 한 쪽만 표시) 끝에서 다음 쪽으로 가지 않음 → 휴대폰에서 "스크롤로 이동 안 됨"의 원인. 다른 형식: EPUB·변환 문서 쪽 보기는 밀기로 쪽 이동, 연속 보기·MD는 일반 스크롤.
- 변경:
  - `src/core/touchNavigation.js`: `getScrollEdges`, `getEdgeSwipe`(48px 이상·800ms 이내, 세로는 끝/처음, 가로는 오른쪽/왼쪽 끝).
  - `src/platform/touch-reader.js`: `scrollElement`, `edgePaging` 옵션. 밀기 시작 150ms 안에 스크롤이 있었거나(관성 스크롤 중) 밀기 동안 스크롤되면 쪽 이동 안 함 → 끝에 닿는 스크롤 자체는 쪽을 넘기지 않고, 끝에서 한 번 더 밀어야 넘어감.
  - `web/app.js`: PDF는 쪽 보기에서만 `edgePaging`.
  - 테스트: touchNavigation 6번째 시험(끝 밀기), `test:reader`에 확대한 PDF 쪽 가운데 밀기는 스크롤만·끝에서 밀기 다음 쪽·처음에서 내려 밀기 이전 쪽, PDF 연속 보기 스크롤로 3/3, EPUB 연속 보기 스크롤로 위치 변경, DOCX 쪽 보기 밀기로 쪽 이동.
  - 시험 환경 주의: 숨긴 Electron 창은 스크립트로 바꾼 스크롤의 scroll 이벤트를 다음 입력 프레임까지 미뤄서, 시험에서는 스크롤 설정 뒤 `requestAnimationFrame` 두 번을 기다린다.
- 검증: `npm.cmd test` 140 통과, `test:reader`·`test:pdf`·`test:documents` 통과, `npm.cmd run build` → 0.1.7(versionCode 8), `build/MinsReader_ver0.1.7.exe` 94.1MB, `build/MinsReader_ver0.1.7.apk` 7.5MB.
- 미검증: 실기기 체감(끝에서 한 번 더 미는 방식이 자연스러운지, 관성 스크롤 판정 150ms).

## 2026-10-18 (계속) — 다른 앱에서 연 HWP의 "Failed to fetch"

- 사용자 요청: "내 파일"에서 HWP를 Mins Reader로 열면 "Failed to fetch". 카톡·메일 첨부도 목록에 Mins Reader가 보여야 함. 모든 형식 확인.
- 조사: 외부 열기와 앱 안 파일 열기 모두 `importDocument` → `hydrateMobileFile`이 `fetch(Capacitor.convertFileSrc(path))`로 앱 사본을 읽음. Capacitor `WebViewLocalServer.getMimeType`은 `URLConnection.guessContentTypeFromName`(확장자) → 실패 시 스트림 추측이라 `.hwp`/`.hwpx`는 형식이 비고 요청이 실패하는 것으로 판단(이 PC에 휴대폰·에뮬레이터가 없어 실기기 재현은 못 함). 모의 Android 스모크는 바이트를 직접 넘겨 이 경로를 거치지 않았음.
- 변경:
  - `ReaderDocumentsPlugin.readDocument`: 앱 관리 폴더 파일만, 64MB 이하, base64로 반환.
  - `src/platform/mobile-files.js`: `readDocument` 인자, 변환 문서·Markdown은 이것으로 읽음(UTF-8 디코딩). `src/platform/android.js`가 플러그인 결과를 `atob`으로 바이트 변환.
  - `AndroidManifest.xml`: VIEW·SEND 필터에 `application/hwp`, `application/x-hwpx`, `application/vnd.hancom.hwpml`, `application/x-zip-compressed`, `application/x-pdf` 추가.
  - 테스트: mobile-files에 "변환 문서는 URL fetch 없이 읽음"(HWP·HWPX·DOCX·MD, 크기 초과).
- 검증: `npm.cmd test` 141 통과, `test:reader` 통과, `npm.cmd run build` → 0.1.8(versionCode 9) `build/MinsReader_ver0.1.8.exe` 94.1MB·`build/MinsReader_ver0.1.8.apk` 7.5MB, `gradlew testDebugUnitTest` 통과, APK 매니페스트(aapt2)에서 MIME 20종 확인.
- 미검증: 실기기에서 "내 파일"·카톡·메일로 열기(각 앱이 보내는 MIME에 따라 목록 표시 여부가 달라짐).

## 2026-10-18 (계속) — 일부 HWP의 "Failed to fetch" 원인 재현과 수정

- 사용자 요청: 0.1.8에서도 일부 HWP가 "Failed to fetch"(외부 열기·앱 안 열기 모두). 안 열리는 샘플을 `test/`에 둠.
- 재현: Node에서는 변환 성공. Electron(Chromium, Android WebView와 같은 엔진)에서 `DecompressionStream('deflate-raw')`로 바꾸면 실제 HWP 5.0 3개 모두 `TypeError: Failed to fetch`. 각 구역 압축 데이터 뒤 8바이트 = CRC-32 + 원래 크기(예: 마지막 4바이트 0x6d7b = 28027 = 해제 크기). 부분 출력만 쓰는 우회는 한 파일에서 끝부분이 빠짐(21432 대 24127자) → 기각.
- 0.1.8의 `readDocument` 수정은 그대로 유효(파일 읽기 경로)하나, 실제 실패는 그 다음 단계인 압축 해제였음. 앞 판단에서 시험 파일이 실제 파일과 달라 놓친 것.
- 변경: `web/document-convert.js` 압축 해제를 pako `inflateRaw`로(지연 로드, `MINS_PAKO_URL`), `package.json` 직접 의존성 `pako@1.0.11`과 PC 패키지 파일 목록, `scripts/build-mobile.js`가 `vendor/pako/` 복사, `src/platform/android.js` 경로 설정, `scripts/sample-documents.cjs` 생성 HWP에 CRC·크기 꼬리, 단위 시험 1개 추가, `.gitignore`에 `test/*.hwp` 등(사용자가 test 바로 아래 둔 개인 문서).
- 검증: pako 결과가 zlib과 4개 구역 모두 바이트 단위로 같음. Electron Chromium에서 실제 HWP 3개 변환 성공(Node와 같은 길이). `npm.cmd test` 142 통과, `test:reader`(꼬리 있는 HWP를 Chromium에서 변환)·`test:documents` 통과, `npm.cmd run build` → 0.1.9(versionCode 10) exe 94.1MB·apk 7.5MB, APK에 `assets/public/vendor/pako/`, PC app.asar에 pako 포함 확인.
- 미검증: 실기기.

## 2026-10-18 (계속) — 개발 계획 문서 정리

- 사용자 요청: doc 폴더에 개발 계획(기능 요구사항, 개발 방안, 완료된 것, 앞으로 할 것)을 정리. 기존 문서가 있으면 갱신.
- 변경: `doc/DEVELOPMENT_PLAN.md`를 전면 개편(초기 영문 EPUB 계획 → 현재 제품 기준 한국어 로드맵). 지원 형식·공통 기능·휴대폰 조작·배포 요구사항 표와 상태, 구조와 형식별 방법, 시험·빌드 방법, 버전별 완료 내역, 우선순위별 할 일, 결정 기록. 초기 계획은 부록 요약(원문은 Git 기록). `HANDOFF.md` 문서 안내, `NEXT_TASKS.md`에 로드맵 참조와 HWP 표시 품질 제안(사용자 결정 대기) 추가.
- 검증: 문서만 변경. 버전·명령·경로·시험 개수(142)를 현재 코드와 대조.

## EPUB 열기 실패 조사 (2026-10-25)

- 사용자 요청: 제공한 투자 이야기 EPUB이 안 열리는 원인부터 파악. 원본 파일·제품 코드 수정과 빌드는 하지 않음. 시작 Git 작업 트리는 깨끗했음.
- 원인: `OEBPS/content.opf` manifest에는 `chap001`~`chap010`만 있으나 spine 앞부분에 존재하지 않는 `c0`~`c9` 참조 10개가 남아 있음. 뒤에는 정상 chap 참조 10개도 있어 총 20개로 해석됨.
- 검증: JSZip CRC 검사 통과(6,965,026바이트, 150항목), XML/XHTML/OPF 파싱 오류 미검출. 설치된 epubjs의 Packaging → Spine.unpack → 첫 Section.load → Archive.request 경로를 Node에서 재현: 원본 첫 href가 undefined이고 `Cannot read properties of undefined (reading indexOf)` 발생. 잘못된 itemref 10개를 메모리에서만 제거하면 spine 10개·첫 href chap001.xhtml·첫 장 로딩 성공. 이는 렌더링 전체 성공이나 정식 EPUB 적합성 검사 결과는 아님.
- Electron 별도 진단 프로세스는 유효한 출력이 없어 UI 재현 증거로 사용하지 않음. Android 실기기 및 전체 책 표시 미검증. 기능 변경이 없으므로 빌드·단위 시험은 실행하지 않음.
- 다음 단계(제안, 미착수): EPUB 생성기의 오래된 spine 참조 누적을 수정하거나 원본과 별도 교정 사본에서 잘못된 참조를 제거. 뷰어에는 누락 manifest 참조 사전 검증과 명확한 오류 안내 검토. 자동으로 추측하여 장을 연결하지 않음.
- 재현: 로컬 샘플 ZIP의 OEBPS/content.opf에서 manifest item id와 spine itemref idref 집합을 비교한 뒤, 설치된 epubjs/lib/{packaging,spine,archive}.js로 첫 Section.load를 실행. 개인 EPUB은 저장소에 복사하지 않음.

- 변경 파일: doc/NEXT_TASKS.md(조사 범위·결과), doc/HANDOFF.md(현재 진단 상태), doc/WORK_LOG.md(근거·미검증 기록).

## EPUB 교정본 생성 완료 (2026-10-25)

- 사용자 요청에 따라 원본 옆 `포즈랑 의 투자 이야기_교정본.epub` 생성(6,965,277바이트). 원본 보존.
- OPF spine의 존재하지 않는 c0~c9 참조 10개만 제거. OPF 외 모든 파일의 압축 해제 바이트가 원본과 동일함을 확인. mimetype은 첫 항목·무압축 유지.
- 검증: 교정 ZIP CRC 통과, spine 10개 모두 manifest에 존재, 설치된 epubjs Packaging/Spine/Archive/Section으로 전체 10개 장 로딩 성공. 원본 바이트 불변 확인.
- 미검증: 실제 뷰어 화면·Android 실기기 표시 및 정식 EPUBCheck. 뷰어 코드 변경·빌드·커밋 없음. 개인 EPUB은 저장소에 넣지 않음.
- 남은 제안: 생성기 spine 갱신 문제 및 뷰어 오류 안내 개선은 미착수. 이번 EPUB 교정 요청 완료.

## 휴대폰 HWP 원본 서식 표시 (2026-11-01)

- 사용자 요청: 모바일에서 HWP 내용은 잘 보이지만 원본 포맷(폰트, 색상 등)과 너무 다름. 원본 포맷·스타일대로 보여 줄 수 없는지.
- 조사: `@ohah/hwpjs`의 Android 사전 빌드 정적 라이브러리는 React Native 브리지용이며 toHtml 없음(toJson/toMarkdown). 공개 WASM은 공유 메모리 필요. Rust 도구 없음. → 원본 쪽 배치 대신 자체 해석기에 DocInfo 서식 적용(2026-10-18 제안 1단계).
- 변경 파일: `src/core/hwpBinary.js`(DocInfo 글꼴·글자 모양·문단 모양·테두리/배경 해석, 글자 모양 구간 span, 문단 모양 유지한 표 앞뒤 문단 재개, 표 칸 너비 비율·안쪽 여백·세로 정렬, 문단 끝 공백 제거), `web/document-reader.js`(다크 테마 반전용 `has-own-colors`), `scripts/sample-documents.cjs`(`createSampleHwp({ styled: true })`로 DocInfo 포함 시험 파일), `test/core/hwpBinary.test.js`(서식 클래스·DocInfo 없는 문서 시험 2개), 문서(NEXT_TASKS, HANDOFF, DEVELOPMENT_PLAN, 이 기록).
- 결정 이유: 실제 HWP 샘플 3개(`test/sample/`, `test/`의 개인 문서, Git 제외)의 DocInfo 값을 PC hwpjs `toHtml` 결과(cs/ps 클래스의 글꼴·크기·색·굵게·자간·정렬)와 대조해 위치·단위를 확인. 문단 테두리는 일반 문단 다수가 실선 테두리 ID를 가리켜 적용하지 않고 배경색만 적용. 기본 크기 17px는 15pt 본문이 25px로 너무 커서 1rem=14px로 정함.
- 검증: `npm.cmd test` 144개 통과. `node --check web/app.js` 통과. `npm.cmd run test:reader` 통과. `npm.cmd run android:sync` 통과. 실제 샘플 3개를 375px 폭 브라우저(앱의 BASE_CSS와 같은 스타일)로 렌더링해 글꼴 크기·굵게·색·표 배경/테두리·내어쓰기·다크 반전을 눈으로 확인. 가로 넘침: 2개 문서 없음, 1개 문서는 넓은 숫자 표 하나가 약 90px 넘침.
- 이어서 사용자 요청으로 `npm.cmd run android:apk` 실행: 성공, 버전 0.1.9 → 0.1.10(versionCode 11), `build/MinsReader_ver0.1.10.apk` 7.5MB. 변경 파일 추가: `package.json`, `package-lock.json`, `android/app/build.gradle`, `installer.nsi`(release 스크립트의 버전 올림).
- 미검증: Android 실기기 설치와 표시. 기기에 없는 한글 글꼴(휴먼명조, HY헤드라인M 등)은 명조/고딕 대체 글꼴로 보임. 그림·자동 번호·머리말/꼬리말·장평은 아직 미지원.
- 재현: `node --input-type=module -e "..."`로 `convertHwpBinary(bytes, zlib inflateRaw)` 결과를 HTML로 저장하고 `web/document-reader.js`의 BASE_CSS와 함께 375px 폭에서 열기. 참조값은 `require('@ohah/hwpjs/dist/index.js').toHtml(buffer)`.

## HWP 원본 모양 재현 방안 정리 (2026-11-01)

- 사용자 요청: 글꼴 한계, 폴라리스 오피스 방식, 자체 엔진(C)이 왜 어려운지 논의한 내용을 다른 PC에서 이어갈 수 있게 개발 계획 문서에 정리.
- 변경 파일: `doc/DEVELOPMENT_PLAN.md`(5.1 "원본 모양 재현 로드맵": 원인, 상용 뷰어 방식, 병목, A → C-1 → C-2 진행 순서), `doc/NEXT_TASKS.md`(다음에 이어서 할 일, 재개 방법), `doc/HANDOFF.md`(현재 상태 한 줄), 이 기록.
- 검증: 문서만 변경. 코드·빌드 변경 없음. Rust 미설치(`cargo` 없음)는 이번 세션에서 확인한 사실.


## 폴라리스 오피스 APK 분석 (2026-11-02)

- 사용자 요청: REA로 `test/PolarisOffice.apk`를 분석해 휴대폰 HWP 표시 방식과 PC 글꼴 동봉 여부를 정리하고 doc 폴더에 기록.
- 시작 상태: 미추적 `minsepubviewer.7z`, `test/PolarisOffice.apk`(둘 다 보존, 커밋하지 않음).
- 방법: REA `open_binary`·`inspect_artifact`(항목 7,743개, 전체)·`extract_artifact`. REA Android 디컴파일은 `REA_JADX_MCP_JAR` 미설정으로 쓰지 못함 → dex·`.so` 문자열, 소스 경로 문자열, 엔진 안 sfnt 글꼴 검사(fontTools 4.61.1). `aapt2 dump badging`으로 판 확인(9.0.10).
- 결과: `libpolarisoffice8.so`(62.7MB)가 HWP 5.0/HWPX/HWP 3.0 해석·쪽 배치·비트맵 그리기를 모두 한다. 엔진 안 글꼴 18개(약 9MB): 나눔고딕(한글 전부), 라틴 문자만 있는 HYGulim/HYDotum/HYBatang/HYTRSerif, HY 윙딩·심볼(PUA), HyhwpEQ, STIX TTC, Times New Roman/Arial/Tahoma/Courier New/Verdana. PC 한글 글꼴은 없다. 기기 `/system/fonts` 사용, 한글↔영문 글꼴 별칭 표와 폴라리스 자체 글꼴(PolarisNewBatang 등, APK에는 없음)로 대체.
- 변경 파일: `doc/POLARIS_OFFICE_ANALYSIS.md`(새 문서), `doc/DEVELOPMENT_PLAN.md`(5.1 근거 한 줄), `doc/NEXT_TASKS.md`, `doc/HANDOFF.md`, 이 기록, `.gitignore`(`test/*.apk` 제외).
- 검증: 문서만 변경. 분석 문서의 수치는 이번 실행 결과(arm64·armeabi 두 엔진에서 같은 글꼴 목록 확인). 코드·빌드 변경 없음.
- 미검증: Java 디컴파일, 엔진 함수 분석(LINE_SEG 사용 여부, 대체 우선순위), 폴라리스 실기기 화면 비교.
- 재현: 분석 문서 6장.

## 폴라리스 오피스 형식별 표시 방식 분석 (2026-11-02)

- 사용자 요청: REA로 폴라리스 오피스가 다른 문서 형식을 보여 주는 방식을 분석·정리.
- 방법: REA `open_binary`·`extract_artifact`(Evidence `ev_63d0e2b0…`)로 다시 풀고, `aapt2 dump xmltree`로 매니페스트(열기 화면·MIME·pathPattern) 확인. dex·엔진 문자열에서 소스 모듈, `E$EV_DOCTYPE`, 열기 방식, 그리기 콜백, PDF·슬라이드 쇼 경로 확인. JADX는 여전히 미설정.
- 결과: 엔진 하나가 모든 형식을 비트맵으로 그림(`UxSurfaceView`, `OnDrawBitmap` 계열). 형식별 화면 6개. 슬라이드 쇼 OpenGL. PDF는 xpdf 3.02pl2 해석 + 자체 렌더러(Splash 없음) + 재배치 + 원본 주석. EPUB은 enum만 있고 열기 목록에는 없음. HWPX MIME 미등록. 점이 많은 파일 이름용 pathPattern 반복.
- 변경 파일: `doc/POLARIS_OFFICE_FORMATS.md`(새 문서), `doc/POLARIS_OFFICE_ANALYSIS.md`(링크), `doc/NEXT_TASKS.md`, `doc/HANDOFF.md`, 이 기록.
- 검증: 문서만 변경. Mins Reader Android MIME 목록을 `android/app/src/main/AndroidManifest.xml`과 대조(`application/hangul`만 없음). 코드·빌드 변경 없음.
- 미검증: Java 디컴파일, 엔진 함수 분석, 실기기 화면.

## 폴라리스 분석 모바일 반영 M1~M4 (2026-11-02)

- 사용자 요청: 폴라리스 분석을 모바일에 반영할 개발 계획을 세워 개발 계획 문서에 갱신하고 차례대로 진행.
- 계획: `doc/DEVELOPMENT_PLAN.md` 5.1 "모바일 반영 계획" M1~M9(작고 위험 낮은 것부터). 상용 글꼴 동봉·네이티브 엔진 전환·XLSX/PPTX는 하지 않기로 기록.
- 변경 파일:
  - M1: `src/core/hwpFonts.js`(새, 글꼴 분류·CSS), `src/core/hwpBinary.js`(인라인 대응 → `fontCss`, 헤드라인·견고딕 계열 굵게), `test/core/hwpFonts.test.js`(새), `test/core/hwpBinary.test.js`(글꼴 목록 기대값).
  - M2: `package.json`·`package-lock.json`(`@fontsource/nanum-gothic`·`nanum-myeongjo` 5.3.0 고정, PC 패키지 파일 목록), `web/document-reader.js`(`bundledFontCss`), `scripts/build-mobile.js`(글꼴 복사), `src/platform/android.js`(`MINS_DOC_FONT_URL`), `scripts/smoke-reader.cjs`(글꼴 로드 확인 추가).
  - M3: `android/app/src/main/AndroidManifest.xml`(열기·공유 두 곳에 `application/hangul`), `doc/ANDROID.md`.
  - M4: `src/core/documentSniff.js`(새, ZIP 중앙 목록·OLE·HWPML·PDF 판별), `web/document-convert.js`(내용 우선, 이름은 대체), `web/app.js`(정보 표시 형식은 변환 결과 형식), `test/core/documentSniff.test.js`(새).
  - 문서: DEVELOPMENT_PLAN, ANDROID, NEXT_TASKS, HANDOFF, 이 기록.
- 결정 이유: `@fontsource`의 한국어 단일 부분 글꼴이 한글 11,172자를 모두 담고 굵기당 0.34~0.58MB라 분할 파일(굵기당 1.5~2MB) 대신 사용(fontTools로 WOFF 판 cmap 확인). 보통·굵게만 넣고 800 굵기는 브라우저가 700으로 대신. 기본 본문 글꼴(DOCX 등)은 바꾸지 않음. HWPX는 `META-INF/container.xml`도 있어 EPUB보다 먼저 판별.
- 검증(이번 실행):
  - `npm.cmd test` 150개 통과. `node --check web/app.js` 통과.
  - `npm.cmd run build:mobile`·`npm.cmd run android:sync` 통과(`android/app/src/main/assets/public/vendor/fonts/`에 4개 파일).
  - Electron Chromium에서 `buildDocumentHtml` 결과를 `sandbox="allow-same-origin"` srcdoc iframe에 넣고 `document.fonts.load`로 네 글꼴 모두 로드 확인(`dist/mobile/vendor/fonts` 경로, 임시 스크립트, 저장소 밖).
  - `ANDROID_HOME` 지정 후 `gradlew assembleDebug` 성공(디버그, 버전 변경 없음, 빌드 결과물 삭제).
  - `npm.cmd run test:reader`·`npm.cmd run test:documents`: 실패. 변경을 잠시 stash한 기준 코드에서도 같은 단계(EPUB 위치 저장 대기, DOCX 스크롤 1466 복원 대기)에서 실패해 이번 변경과 무관한 이 PC의 기존 문제로 판단. 그래서 새로 넣은 스모크 글꼴 검사 단계까지는 도달하지 못함.
- 미검증: Android 실기기·에뮬레이터 표시. API 30 에뮬레이터(WebView 83)는 켜졌으나 `adb install`/`push`가 `connection reset`으로 계속 실패해 중단. 구형 WebView가 Capacitor 로컬 서버의 `.woff2`(MIME 추측 실패 가능)를 받는지 확인 필요. 실제 사용자 HWP의 글꼴 분류(이 PC에 `test/sample/` 없음).
- 재현: `npm.cmd test`; `npm.cmd run build:mobile` 후 `dist/mobile/vendor/fonts` 확인; `npm.cmd run android:apk`로 APK를 만들어 HWP를 열고 글꼴 확인.

## adb 없이 에뮬레이터 설치 스크립트 + 에뮬레이터 확인 (2026-11-02)

- 사용자 요청: adb 차단 때문에 `scripts/install_app_adb` 참고, 필요하면 수정해서 에뮬레이터 설치.
- 발견: 사용자가 넣은 `scripts/install_app_adb.py`는 YTHelper의 호환용 진입점으로 `scripts/scripts/install_app.py`(없음)를 불렀다. `D:/dev/YTHelper/scripts/install_app.py`(adb-shell 0.4.4 직접 TCP·WinUSB)를 이 앱에 맞게 옮겨 전체 구현으로 교체: 패키지 `com.mins.epubviewer`, APK 선택(`--apk`/`MINS_APK`/디버그 출력·`build/MinsReader_ver*.apk` 중 최신), `MINS_*` 환경 변수, `--no-launch`, 서명 불일치 안내(앱 자동 삭제 없음).
- 에뮬레이터 결과:
  - API 30 Pixel_5(WebView 83.0.4103.106): 스크립트로 설치·실행 성공. 앱은 `Uncaught SyntaxError: Unexpected token '='`(mobile.js의 `||=`, 이번 변경 전부터 있던 코드)로 시작하지 못함 → `scripts/build-mobile.js`의 esbuild 대상을 `es2022` → `chrome80`으로 바꿔 해결(`||=` 0개 확인). 이후에도 화면 배치가 깨지고 외부 열기 HWP가 열리지 않음 — 원인 미조사, 기록만.
  - API 36 Pixel_7(WebView 133.0.6943.137): 부팅 대기 후 설치·실행 성공. `createSampleHwp({ styled: true })`를 `/sdcard/Download`에 넣고 `am start VIEW content://media/...`로 열어 화면 캡처: "5.0 검사 문서"(원래 "바탕")가 나눔명조로 표시, logcat에 `Handling local request: .../nanum-myeongjo-korean-400-normal.woff2`.
- 변경 파일: `scripts/install_app_adb.py`, `scripts/build-mobile.js`, `doc/ANDROID.md`, `doc/DEVELOPMENT_PLAN.md`, `doc/NEXT_TASKS.md`, `doc/HANDOFF.md`, 이 기록.
- 검증: `npm.cmd test` 150개 통과, `npm.cmd run android:sync` 통과, `gradlew assembleDebug` 성공(버전 번호 그대로). 에뮬레이터 결과는 위와 같음.
- 미검증: 실제 휴대폰(USB `--usb` 경로 포함), WebView 83 화면 배치 문제의 원인.

## M5 DOCX 서식 보기 (2026-11-02)

- 사용자 요청: 지금까지 변경을 커밋하고(`34972e9`) 계획을 이어서 진행, 테스트 통과 시 커밋·푸시.
- 변경:
  - `package.json`·`package-lock.json`: `docx-preview` 0.4.1(Apache-2.0, 2026-09-21 배포, 75KB, JSZip 전역 사용) 고정, PC 패키지 파일 목록 추가.
  - `web/document-convert.js`: 스크립트 로더 공통화(`loadGlobal`), DOCX는 docx-preview(`useBase64URL`, PC는 쪽 나눔·머리말/꼬리말, 휴대폰은 `ignoreWidth/Height`), 글꼴 값에 대체 목록 추가, Symbol/Wingdings 사설 영역 글머리표 → 유니코드, 실패 시 mammoth.
  - `src/core/hwpFonts.js`: `withFontFallback`(CSS 글꼴 값 + 한글 글꼴 기준 대체 목록), `test/core/hwpFonts.test.js`.
  - `web/document-reader.js`: `is-docx` 본문 클래스(기본 표 테두리 규칙 미적용), 휴대폰 쪽 여백 제거·PC 쪽 종이 표시, 다크 테마 반전 대상에 DOCX 포함.
  - `scripts/build-mobile.js`·`src/platform/android.js`: `vendor/docx-preview/` 복사·URL. 스모크 두 개는 `h1` 대신 첫 문단으로 제목 확인.
- 결정 이유: 폴라리스처럼 원본 서식에 가깝게 보이되 휴대폰은 읽기 쉬운 재배치를 유지. 기존 형광펜은 문자 위치 기준이라 변환기 교체로 한 번 어긋날 수 있음(0.1.x 단계라 감수).
- 검증(이번 실행): `npm.cmd test` 151개 통과, `node --check web/app.js` 통과, `npm.cmd run android:sync` 통과, `gradlew assembleDebug` 성공. Electron에서 python-docx로 만든 서식 DOCX(빨간 바탕체, 맑은 고딕 굵게, 가운데 정렬, 표 테두리, 글머리표)를 휴대폰/PC 모드로 그려 화면 확인. API 36 에뮬레이터에 `scripts/install_app_adb.py --tcp`로 설치, VIEW로 열어 같은 서식과 나눔명조 표시 확인(처음엔 글머리표가 안 보여 유니코드 대체 추가 후 재확인).
- `npm.cmd run test:documents`: DOCX 열기·형광펜·책갈피·검색 통과, 위치 복원 대기(이번엔 스크롤 732)에서 시간 초과 — 변경 전과 같은 단계의 기존 문제. `npm.cmd run test:reader`: 기존과 같은 EPUB 단계에서 시간 초과.
- 미검증: 실기기, 큰 실제 DOCX(그림·각주·섹션 여러 개)의 속도와 모양, WebView 83.

## M6 PDF 재배치 보기 (2026-11-02)

- 사용자 요청: "pdf 진행해줘" — 계획 M6 PDF 재배치 보기.
- 변경:
  - `src/core/pdfReflow.js`(새): `reflowPdfPages(pages)` — 기준선으로 줄, 줄 간격·들여쓰기·글자 크기·목록 기호·문장 끝으로 문단, 본문(가장 많은 글자 크기)의 1.2배 이상은 h3, 1.6배 이상은 h2. 영어 하이픈 이음, 한자·가나는 공백 없이 이음. 3줄 이상 쪽의 첫/끝 줄이 쪽의 절반 이상(최소 3쪽)에서 반복되면(숫자 무시) 머리글로 제거, 끝 줄의 쪽 번호 제거. `test/core/pdfReflow.test.js`(새, 6개).
  - `web/pdf-reader.js`: 문서 열기 옵션 공통화(`loadDocument`), `readPdfText`.
  - `web/app.js`: `openPdfReflow`, `togglePdfReflow`, `reflowPageNumber`, `reflowPdfLocation`; `state.pdfReflow`(탭 전환·닫기·전환 시 초기화), 설정 키 `minsepubviewer.pdf-reflow`.
  - `web/index.html`(`#pdfReflowButton`), `src/platform/mobile-ui.js`(☰ 메뉴 항목), `src/locales/ko.js`·`en.js`(`pdf.reflow`, `pdf.reflowTitle`, `pdf.reflowNoText`, `mobile.pdfReflowToggle`), `web/document-reader.js`(쪽 구분선은 CSS `attr(data-page)`라 검색·형광펜 글자에 안 들어감).
  - `scripts/smoke-pdf.cjs`: 재배치 켜기 → 3쪽 글자 확인 → 끄기 단계 추가.
- 결정 이유: 재배치를 변환 문서 뷰어에 태워 검색·형광펜·확대·테마를 그대로 재사용. 책 기록은 PDF와 공유하고 위치는 쪽 단위 PDF 위치로 저장(배율·회전은 유지)해 보기를 바꿔도 같은 쪽.
- 검증(이번 실행): `npm.cmd test` 157개 통과, `node --check web/app.js` 통과, `npm.cmd run test:pdf` 통과(재배치 단계 포함, 콘솔 오류 없음), `npm.cmd run android:sync` 통과, `gradlew assembleDebug` 성공. PyMuPDF로 만든 한국어 3쪽 PDF(제목, 절 제목, 들여쓴 문단, 목록, 반복 머리글, 쪽 번호)를 Node PDF.js로 재배치해 구조 확인, Electron에서 화면 확인. API 36 에뮬레이터: PDF 열기 → ☰ "PDF reflow view: Off" → 켜짐 시 화면 폭 재배치·쪽 구분선 표시, 끄면 원본 보기가 같은 쪽(2/3)으로 돌아옴.
- 미검증: 실제 PDF(다단 논문, 표, 각주), 큰 PDF의 글자 추출 시간(모든 쪽을 한 번에 읽음), 실기기, WebView 83.

## M8 HWPX 서식 (2026-11-02)

- 사용자 요청: "M8 진행해줘". 시작 시 미커밋 변경은 사용자의 버전 올림(0.1.10 → 0.1.11: `package.json`, `package-lock.json`, `android/app/build.gradle`, `installer.nsi`)과 줄바꿈만 다른 생성 파일이었고, 버전 올림은 보존하고 이번 커밋에 넣지 않음.
- 변경:
  - `src/core/hwpXml.js`: `readOwpmlHeader` — `hh:fontface`(언어별 글꼴), `hh:charPr`(크기·상대 크기·굵게·기울임·밑줄·취소선·위/아래 첨자·자간·글자 색·음영), `hh:paraPr`(정렬·여백·들여쓰기·줄 간격 %·문단 배경), `hh:borderFill`(선 종류·굵기·색, 칸 배경)을 `.hcN/.hpN/.hbN` CSS로. `convertOwpmlSection(document, styles)` — 문단·글자 구간·표 칸에 클래스, 칸 너비 비율·안쪽 여백(`hasMargin`이 0이면 표 `inMargin`)·세로 정렬, 글상자(`drawText`) 글자를 `.hwp-box`로. 끝 공백 제거.
  - `web/document-convert.js`: HWPX의 `Contents/header.xml`을 읽어 `<style>`과 함께 적용, 실패 시 서식 없이.
  - `test/core/hwpXml.test.js`: 머리 정보 해석·구역 적용 시험 2개. `scripts/sample-documents.cjs`·`scripts/smoke-documents.cjs`: 시험용 HWPX에 header.xml, 화면 시험에서 계산된 색·굵기·정렬·칸 배경·테두리 확인.
- 확인한 형식 사실(PC의 실제 HWPX 10개 대조, 파일은 저장소에 넣지 않음): 한글 2016 이후 문단 여백은 `hp:switch`의 case에 실제 값, default에 2배 값(이진 HWP와 같음) → default를 /200pt로 사용. 글자 크기 `height`는 1/100pt. 취소선 없는 글자 모양도 `strikeout shape="3D"`를 씀(327개 중 325개) → 3D·NONE은 취소선 아님. 줄 간격은 PERCENT(3348)·AT_LEAST(2)만 있었고 FIXED는 없어 PERCENT만 적용. 칸 크기·여백은 1/100pt.
- 검증(이번 실행): `npm.cmd test` 159개 통과, `node --check web/app.js`·`web/document-convert.js` 통과, `npm.cmd run test:documents` 통과(HWPX 서식 단계 포함; 직전까지 시간 초과 나던 DOCX 위치 복원도 이번엔 통과), `npm.cmd run android:sync` 통과, `gradlew assembleDebug` 성공. 실제 HWPX 9개 Node 변환 오류 없음(5.7MB 문서 0.6초). Electron 화면: 제목 표 빨간 테두리·가운데 큰 글씨, 칸 배경, 내어쓰기, 명조/고딕 구분, 표 머리 배경색. API 36 에뮬레이터에 설치해 VIEW로 열어 같은 서식(나눔명조·나눔고딕) 확인.
- `npm.cmd run test:reader`: Markdown 최근 파일 다시 열기 단계에서 시간 초과 — 이번 변경을 빼고 돌려도 같은 곳에서 실패(기존 문제).
- 미검증: 실기기, 글자 단위 여백(`unit="CHAR"`)·고정 줄 간격 문서, 그림·각주·머리말, WebView 83. XML HWP(HWPML) 서식은 하지 않음.

## M7 HWP 기호(PUA) 대응 (2026-11-02)

- 사용자 요청: "내가 수동으로 빌드 했었어. 반영해서 푸시하고 M7 진행해줘." 0.1.11 버전 올림(사용자 빌드 `build/MinsReader_ver0.1.11.apk`·`.exe`, 13:09)은 `704fc1a`로 커밋해 M8(`f2f83e4`)과 함께 푸시. HANDOFF에 빌드 시각상 M8 포함 여부가 불확실하다고 기록.
- 조사(실제 문서): PC의 HWP 72개·HWPX 20개 중 앱 변환기로 읽히는 58개에서 사설 영역 문자를 글자 모양의 7개 언어 글꼴과 함께 셈. 13개 문서에서 두 종류만 나옴.
  - U+F0xx(F06D, F071, F072, F075, F09E, F09F, F0E0, F0E8): 글자의 기호 글꼴 칸도 휴먼명조·맑은 고딕 같은 일반 글꼴. 한컴 Haan Wing2(HANWing2.ttf)로 그리면 ④⑨⦿ 등이 되어 문맥("OS◇DB", "운영◇관리", 목록 머리)과 안 맞고, MS Wingdings로 그리면 ❍ ❑ ❒ ◆ · • → ➔로 모두 맞음 → Wingdings 기준으로 결정.
  - U+F0000대(F02B1–F02B8, F012B, F0832): 한컴오피스 2020과 함께 설치된 함초롬바탕·돋움(HANBatang.ttf 등)에 글자 모양이 있음(네모 숫자, 동그라미 "인", 굵은 이중 가로줄). 공개 대응표는 찾지 못함(검색: 한컴 PUA 표 없음, 공개 표는 옛한글용 한양 PUA뿐).
- 표의 근거:
  - Wingdings·Wingdings 2·Wingdings 3·Webdings → Unicode WG2 N4384(L2/12-368, 2012, https://www.unicode.org/wg2/docs/n4384.pdf)의 상세 표에서 글자 열(U+F0xx)과 UCS 열을 읽음(221/216/172/222개). LibreOffice `fontcvt.cxx`는 대부분 자체 사설 영역(StarSymbol)으로 보내서 쓰지 않음.
  - Symbol → https://www.unicode.org/Public/MAPPINGS/VENDORS/ADOBE/symbol.txt (사설 영역 대상 제외, 160개).
  - 한컴 확장 영역 245자(동그라미/네모 한글 단어 64자 ×2, 가–하 네모, 모음 ㅏ–ㅣ 네모·동그라미, 숫자 6종, 이중 가로줄): 함초롬바탕 글자를 그려 읽은 뒤, 테두리를 연결 요소로 떼어 내고 남은 글자를 후보 글자들과 겹쳐 비교 → 231자 자동 일치, 14자는 글자가 테두리에 붙어 자동 비교가 틀린 것으로 확대해 눈으로 확인. 반쯤 칠한 동그라미 숫자(F02A6–F02AF)는 대응 문자가 없어 제외. F0832는 가장 가까운 ═(U+2550).
- 변경: `src/core/hwpSymbols.js`(새), `src/core/hwpBinary.js`(DocInfo 7개 언어 글꼴, `symbolTable`), `src/core/hwpXml.js`(HWPX `symbolTable`, HWPML·HWPX 글자에 적용), `web/document-reader.js`(`.hwp-sym` 네모·동그라미·검은 네모, 기호 글꼴), `scripts/build-mobile.js`, `package.json`·`package-lock.json`(`@fontsource/noto-sans-symbols-2` 5.3.0 고정, OFL), `test/core/hwpSymbols.test.js`(새, 3개).
- 휴대폰 글꼴 확인: API 36 에뮬레이터의 `/system/fonts` 207개(이모지 제외)를 가져와 대응 대상 문자를 셈 → Wingdings 221개 중 135개, Wingdings 2 157개, Wingdings 3 155개, Webdings 204개를 그릴 수 없음(❍ U+1F53E, 화살표 U+1F86A·1F87A 등; 처음 설치에서 실제로 빈칸). Noto Sans Symbols 2 기호 부분 글꼴의 unicode-range를 더하면 0개. 그래서 U+2B00 이상 대상 문자만 `unicode-range`로 붙여 필요할 때만 읽음.
- 검증(이번 실행): `npm.cmd test` 162개 통과, `node --check`(document-reader) 통과, 실제 문서 58개 재변환 시 남은 사설 영역 문자 0개, `npm.cmd run test:pdf` 통과, `npm.cmd run android:sync` 통과, `gradlew assembleDebug` 성공. Electron에서 기호 시험 HWPX를 밝게·어둡게 표시 확인. API 36 에뮬레이터: 처음엔 ❍·화살표 빈칸 → 기호 글꼴 추가 후 모두 표시 확인.
- 기존 실패: `npm.cmd run test:documents`는 DOCX 위치 복원(스크롤 732) 단계에서 시간 초과 — M7 변경을 빼고도 3/3 실패(M8 때 한 번 통과는 우연으로 보임). `npm.cmd run test:reader`는 Markdown 최근 파일 단계 시간 초과(기존).
- 미검증: 실기기, 한컴 화면과의 직접 비교, 기호 글꼴 칸이 Symbol인 실제 문서(이번 문서들엔 없음), WebView 83.
- 사용자 질문 답: XLSX·PPTX·XLS·PPT는 현재 열 수 없음(Android 열기 목록에도 없음). 제안은 NEXT_TASKS M7 항목.

## 실패하던 화면 시험 2개 수정, HWPX 그림 표시 (2026-11-02)

- 사용자 요청: 실패하는 시험과 "xml 형식 hwp"(`test/트러스트기획_화주 중심 무역 증빙 관리 서비스.hwpx`, 사용자 개인 문서, `.gitignore` 대상이라 커밋 안 함) 표시, 끝나면 커밋·푸시. M7(`08bd5b1`)은 요청대로 먼저 푸시함. 엑셀·PPT는 사용자 보류.
- 받은 파일: ZIP 안에 XML이 든 보통 HWPX. M8 서식으로 이미 잘 보였고(제목 선, 표 머리 배경, 오른쪽 정렬), 빠진 것은 `hp:pic` 그림 1개(`BinData/image1.png`, 3000×2253, 725KB)뿐.
- HWPX 그림: `hc:img binaryItemIDRef` → `Contents/content.hpf` 항목(없으면 `BinData/<id>.*`) → data URL. 본문이 참조하는 그림만 읽음. PNG·JPEG·GIF·BMP·WebP만(WMF/EMF 제외). `treatAsChar="1"`이면 줄 안, 아니면 문단 사이 `.hwp-figure`. 너비는 `hp:sz`(1/100pt)를 rem으로, 화면 폭 넘지 않게.
- `test:documents` 원인: DOCX 형광펜 위치(스크롤 732)를 저장한 뒤 "문단 7"을 검색하면 화면이 맨 앞으로 가고, 앱이 그 위치를 제때 기록하면 다시 열 때 맨 앞이 맞는 동작인데 시험은 732를 기대함. 숨긴 창에서 requestAnimationFrame·400ms 저장 대기 타이밍에 따라 통과/실패가 갈림(M8 때 통과는 기록을 놓친 경우). 앱은 `beforeunload`에서 대기 중 위치를 저장하므로 앱 버그 아님. 시험을 "검색 뒤 형광펜 문단으로 돌아가 → 그 위치가 저장된 것 확인 → 다시 열기"로 수정, 시간 초과 메시지에 스크롤 값 추가. HWPX 시험 파일에 4×4 PNG를 넣고 그림 표시 확인 추가.
- `test:reader` 원인: 단계별 대기가 아니라 시험 전체 제한 90초. 단계마다 경과 시간을 찍어 보니 멈춘 곳 없이 360줄 근처에서 90초를 다 씀(전체 약 100~107초). 180초로 늘림. 그 과정에서 6번 중 1번 epub.js 콘솔 오류(`reading 'bounds'`, 공유 Markdown → EPUB 다시 열기 직후)가 나서 마지막 "콘솔 오류 없음" 검사에 걸림. 압축 안 된 epub.js·오류 스택 출력으로 5번 더 돌렸으나 재현 안 됨 → 원인 미확정, 앱 코드는 바꾸지 않음.
- 변경: `src/core/hwpXml.js`, `web/document-convert.js`, `web/document-reader.js`, `test/core/hwpXml.test.js`(그림 시험 1개), `scripts/sample-documents.cjs`(4×4 PNG 생성), `scripts/smoke-documents.cjs`, `scripts/smoke-reader.cjs`.
- 검증(이번 실행): `npm.cmd test` 163개 통과, `node --check`(app.js, document-convert.js) 통과, `npm.cmd run test:documents` 4번 연속 통과(수정 후), `npm.cmd run test:reader` 2번 통과(+임시 사본 5번 통과), `npm.cmd run test:pdf` 통과, `npm.cmd run android:sync` 통과, `gradlew assembleDebug` 성공. Electron에서 받은 HWPX의 서비스 구성도 그림 표시 확인, API 36 에뮬레이터에서 같은 그림을 넣은 시험 HWPX로 표시 확인(시험 파일·에뮬레이터 사본은 삭제).
- 미검증: 실기기, 큰 그림 여러 장 문서의 메모리·속도, 떠 있는 그림의 원래 위치(왼쪽/가운데/글 뒤 등은 재현 안 함), HWP 5.0 이진 문서의 그림(아직 미지원).

## 다른 PC 인수인계 문서 정리 (2026-11-02)

- 사용자 요청: "커밋 푸시해줘. 다른 pc에서도 작업 이어서 할 수 있도록 관련 문서들도 다 커밋해줘". 시작 시 작업 트리 깨끗, `master`와 `origin/master`가 `c8e4f34`로 일치.
- 변경: `doc/HANDOFF.md`에 "최신 상태와 재개 절차 (2026-11-02)" 절 추가(이날 커밋 목록, `npm.cmd ci` 필요 이유, 확인 명령과 이날 결과, 에뮬레이터 설치 방법, Git 제외 개인 시험 문서, 0.1.12 빌드 필요, 알려진 epub.js `bounds` 오류가 2026-09-28부터 있던 문제라는 점). 기존 "이번 검증 (2026-10-17)" 제목은 "이전 검증"으로 바꿈. `doc/NEXT_TASKS.md`에 재개 절차 위치와 `bounds` 오류 이력 표시.
- 검증: 문서만 변경. 적은 명령·경로(`scripts/install_app_adb.py`, `.gitignore`의 `test/*.hwpx`·`test/*.apk`, `npm.cmd run test:*`)가 실제와 맞는지 확인. 시험·빌드는 다시 돌리지 않음(직전 결과는 위 항목).

## 0.1.12 빌드 기록 (2026-11-03)

- 사용자 요청: "작업 계획 중 1, 3 진행하고 커밋, 푸시 해줘"(1 = 0.1.12 기록·커밋).
- 확인: 작업 시작 시 미커밋 변경은 버전 올림(`package.json`·`package-lock.json` 0.1.12, `android/app/build.gradle` versionCode 13, `installer.nsi`)과 줄바꿈만 다른 파일(`android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, `web/vendor/toastui-editor-*`, `android:sync` 부산물)뿐. `build/MinsReader_ver0.1.12.apk`(10,180,255 B)·`.exe`가 2026-11-02 16:04에 있음 → 마지막 커밋 `3443b1a`(15:59) 뒤 빌드라 M7·M8·HWPX 그림 포함.
- 변경: 버전 파일 4개 커밋, `doc/HANDOFF.md`(현재 버전 0.1.12), `doc/NEXT_TASKS.md`(이번 요청과 계획). 줄바꿈만 다른 파일은 커밋하지 않음.
- 검증: 빌드는 다시 돌리지 않음(기존 산출물의 파일 시각·크기만 확인). 실기기 설치·표시는 미검증.

## M9 휴대폰 HWP 원본 쪽 보기 (2026-11-03)

- 사용자 요청: "작업 계획 중 1, 3 진행하고 커밋, 푸시 해줘"(3 = M9). 엑셀·PPT는 더 논의하기로 함.
- 조사: npm hwpjs의 `hwpjs.wasm32-wasi.wasm`은 메모리를 공유(flags 3)로 가져와 SharedArrayBuffer가 필요하지만 스레드 생성 가져오기는 없음 → 스레드 없이 다시 빌드 가능하다고 판단. GitHub 저장소는 2026-09 이후 Zig로 다시 쓰여 Rust 구현은 `legacy/`에 보관됨 → npm 판과 같은 태그 `@ohah/hwpjs@0.1.0-rc.10`(33cf33e3)의 `crates/hwp-core`(순수 Rust: cfb, flate2, encoding_rs 등)를 사용. Cargo git 의존성은 그 커밋의 URL 없는 서브모듈 때문에 실패해 스크립트가 태그를 얕게 받아 경로 의존성으로 씀. 받은 소스는 `node --test`가 훑지 않도록 `node_modules/.cache/hwpjs-src/`에 둠.
- 변경: `native/hwp-wasm/`(C ABI 래퍼 `hwp_alloc`·`hwp_to_html`·`hwp_out_*`, Cargo.lock), `scripts/build-hwp-wasm.cjs`, `package.json`(`build:hwp-wasm`), `web/vendor/hwp/hwp_core.wasm`·`LICENSE.hwpjs.txt`(MIT), `web/hwp-wasm.js`(변환마다 새 인스턴스 → 메모리 반환, panic 함정 뒤에도 다음 변환 정상), `web/document-convert.js`(`hwpPages` 선택, 쪽 HTML 글꼴에 나눔 대체 목록, 실패 시 재배치+`pagesError`), `web/document-reader.js`(`fitWidth` 쪽 폭 맞춤·회전 시 다시 맞춤, `rangeView`), `src/core/textAnchors.js`(보기 이름이 붙은 범위 `doc-range:page:`), `web/app.js`(`hwpPagesButton`, `toggleHwpPages`, 메타에 "원본 쪽 모양"/"원본 쪽 보기 실패"), `web/index.html`, `src/platform/mobile-ui.js`(☰ 메뉴 항목), `src/platform/android.js`(`MINS_HWP_WASM_URL`), `scripts/build-mobile.js`, `src/locales/ko.js`·`en.js`, `scripts/sample-documents.cjs`(문단 머리 24바이트·글자 수·PARA_LINE_SEG, SheetJS cfb가 FAT 빈 칸을 ENDOFCHAIN으로 채우는 것을 FREESECT로 고침, `controls: false` 선택 — hwpjs가 시험용 표·각주 레코드를 너무 짧다고 거부), `scripts/smoke-reader.cjs`(실패 시 재배치, 쪽 보기·폭 맞춤, 되돌리기), `test/core/hwpWasm.test.js`(새, 4개), `test/core/textAnchors.test.js`(1개 추가).
- 결정 이유: 쪽 배치를 직접 만드는(C-2) 대신 PC와 같은 해석기를 써서 PC·휴대폰 결과를 같게 함. 휴대폰 기본은 재배치 유지(A4 쪽은 글씨가 작음). 형광펜은 보기마다 글자 순서가 달라 보기별로 분리. 빌드 결과물 wasm은 Rust 없는 PC도 앱을 빌드할 수 있게 커밋(toastui 묶음과 같은 방식). hwpjs 시험 파일(`crates/hwp-core/tests/fixtures`)은 pyhwp(AGPL) 출신으로 보여 저장소에 넣지 않음.
- 검증(이번 실행): 실제 HWP 14개(개인·회사 문서, 저장소에 넣지 않음)에서 WASM과 PC 네이티브 `toHtml` 출력이 바이트 단위로 같음(2개는 둘 다 같은 오류). `npm.cmd test` 168개 통과, `node --check` 통과, `npm.cmd run test:documents` 통과, `npm.cmd run test:reader` 통과, `npm.cmd run test:pdf` 통과, `npm.cmd run android:sync` 통과, `gradlew assembleDebug` 성공(10.6MB, `assets/public/vendor/hwp/hwp_core.wasm` 포함). API 36 Pixel_7 에뮬레이터에 설치해 HWP 2개를 VIEW로 열고 ☰ 메뉴로 원본 쪽 보기 전환: 정관 문서는 A4 쪽이 화면 폭에 맞게 정상 표시, 공모전 문제 문서는 hwpjs가 여러 쪽 글자를 1쪽에 겹쳐 그림(PC 네이티브 출력도 같음). 에뮬레이터에 넣은 문서는 삭제.
- 발견: `Welcome to Hwp.hwp`에서 hwpjs 네이티브 panic이 Node 프로세스를 종료시킴(PC Electron 메인 프로세스 위험, PC 앱에서 직접 재현은 안 함). WASM은 RuntimeError로 끝나 재배치로 넘어감.
- 미검증: 실기기, WebView 83 같은 구형 WebView(WebAssembly 자체는 지원), 큰 문서의 휴대폰 메모리, PC 앱에서 위 panic 재현.

## M9 후속 — PC도 WASM, 쪽을 넘어가는 문단 나누기 (2026-11-03)

- 사용자 요청: "엑셀, ppt는 일단 제외하자. 나머지 작업 진행해줘". 엑셀·PPT 제외를 NEXT_TASKS·DEVELOPMENT_PLAN에 기록.
- PC: `electron/main.cjs`가 `web/hwp-wasm.js`(`convertHwpWithModule` 추가)와 asar 안의 `hwp_core.wasm`으로 변환. `web/document-convert.js`는 PC 쪽 변환이 실패하면 내장 재배치 해석기로 열고 "원본 쪽 보기 실패"를 표시(PC는 전환 버튼 없음). `package.json`: `@ohah/hwpjs`를 devDependencies로, 설치본 `files`·`asarUnpack`에서 제거. `scripts/compare-hwp-wasm.cjs`(문서마다 별도 프로세스로 네이티브·WASM 비교) 추가.
- 쪽 나눔: hwpjs JSON으로 공모전 문제 HWP를 보니 5·9·15·22번 문단의 줄 위치가 문단 중간에 0 근처로 돌아감(쪽 넘김). hwp-core `pagination.rs`는 문단 첫 줄만 보고, 새 위치가 본문 높이 20% 아래면 쪽을 안 나눔 → 다음 쪽 줄이 앞 쪽 위에 겹침. 한컴 파서 코드는 고치지 않고 래퍼(`native/hwp-wasm/src/split.rs`)에서 변환 전에 문단을 나눔: 줄 위치가 앞 줄보다 작고 0.5cm 미만인 줄에서, 글자(UTF-16)·글자 모양 위치·줄 정보·영역 태그·문단 머리 개수를 나눔. 조절 문자가 문단 끝(13)뿐인 문단만, 단이 2개 이상인 구역은 제외. 시험 생성기에 `spanning` 선택(둘째 줄이 다음 쪽인 문단) 추가.
- 검증(이번 실행): `npm.cmd test` 169개 통과(새 시험: 나눈 문단이 2쪽으로 — 네이티브는 1쪽에 겹쳐 실패함을 확인), `test:documents`·`test:reader`·`test:pdf` 통과, `android:sync`·`gradlew assembleDebug` 성공(10.7MB). 실제 문서 16개 비교: 11개 동일, 5개 달라짐(모두 쪽 넘김 문단 있는 문서) — 공모전 B 13→5쪽, 공모전 A 8→4쪽, ITO 운영지침 42→13쪽, 예정가격 143→49쪽, 정관 10쪽 그대로(한 쪽 경계만 이동). 공모전 B·ITO는 Electron으로 그려 쪽 끝·다음 쪽 첫 줄과 쪽 번호가 이어지는 것 확인. Electron 개발 실행(`electron .`)으로 `Welcome to Hwp.hwp`(네이티브는 Node 종료) → 앱 유지·재배치로 열림, 정관 → 쪽 보기로 열림(로그). `build:pc-dir` 설치본 폴더의 Electron 런타임(`ELECTRON_RUN_AS_NODE`)으로 asar 안의 `web/hwp-wasm.js`·`hwp_core.wasm`을 불러 정관 10쪽 변환 확인.
- 미검증: 설치본 창에서 직접 열어 본 화면(화면 캡처에 다른 창이 찍혀 폐기), 실기기, 휴대폰에서 바뀐 쪽 나눔(에뮬레이터는 이전 WASM으로만 확인), 한글 프로그램 화면과의 쪽 단위 비교. 설치본은 로그를 asar 안(`root/logs`)에 쓰려 해서 남기지 못하는 기존 문제 발견(미수정).

## 설치본 로그·HWP 재배치 보강·편의 기능·Google Play 검토 (2026-11-03)

- 사용자 요청: "1, 2, 3, 편의 기능 진행해줘. 그 후에 구글 앱스토어에 올리기에 적합한지 검토해서 의견 제시해주고 커밋, 푸시해줘". 실기기 확인은 사용자가 몰아서 함.
- 1 로그: `electron/main.cjs` `logDirectory()` — 설치본은 `app.getPath("userData")/logs`, 2MB 넘으면 `app.log.1`로 교체. 이전에는 asar 안에 쓰려다 실패해 설치본 로그가 없었음.
- 2 그림: `src/core/hwpBinary.js` `readBinItems`(DocInfo 태그 18), `readPictures`(태그 85의 오프셋 71 BinItem → `BinData/BIN%04X.*`, 펼침 실패 시 원본), `renderPicture`(개체 속성 bit 0이면 글자처럼, 아니면 `.hwp-figure`, 너비는 HWPUNIT/100pt), `imageType`(내용으로 판별). `web/document-convert.js` `bmpToPng`·`recodeBmpDataUrls`(createImageBitmap + OffscreenCanvas/canvas, 작아질 때만). 실제 문서: 그림 있는 문서 65개, hwpjs보다 많이 찾음(sql 퀴즈 11 vs 8).
- 3 서식: 문단 모양 bit 23-24/25-27과 오프셋 30(번호·글머리표 ID, 1부터), NUMBERING(태그 23: 7수준 × 12바이트 머리 + 형식 문자열, 뒤에 시작 번호와 5.0.2.5+ 수준별 시작 번호), BULLET(태그 24, 오프셋 12 글자), 구역 정의 `secd` 오프셋 18의 개요 번호 ID. 처음엔 시작 번호를 모든 수준에 적용해 "2.2.2."가 나와 수준별 시작으로 고침("2. 2.1. 2.1.1."). `head`/`foot`는 구역 앞뒤 `.hwp-page-header/.hwp-page-footer`, 조절 문자만 있는 빈 문단은 생략. 장평은 (자간 + 장평-100)/200em. 문단 테두리는 테두리/배경 + 간격, 연결(bit 28)은 `+`·`:has` 규칙.
- 4 편의: `web/app.js` 검색 번호(`searchSequence`)로 이전 EPUB 검색 중단, `searchWhileTyping`(450ms, PDF·변환 문서만, 한글 조합 중 제외), `submitSearch`(같은 검색어면 다음 결과), Ctrl+F·F3·Shift+F3, 입력창 안의 ←/→는 쪽 넘김 안 함. Markdown 그림: `markdown:read-image` IPC(그림 확장자만, 32MB 이하, .md/.markdown/.txt 옆) + blob URL, 뷰어 정리 때 해제. 기록 옮기기: `src/core/libraryTransfer.js`(`createRecordsTransfer`, `parseRecordsTransfer`, `mergeRecords` — 새 책은 경로 없이 추가, 같은 책은 주석 합치기·나중 위치·이 기기 경로와 설정 유지), 보기 설정 패널 UI, ko/en 문구.
- 시험: `test/core/hwpBinary.test.js`(그림, 형식 판별, 번호·글머리표, 머리말, 문단 테두리, 번호 형식), `test/core/libraryTransfer.test.js`(새, 4개), `scripts/sample-documents.cjs`(`picture`, `lists`, `createSamplePng` 내보냄), `scripts/smoke-documents.cjs`(입력 중 검색·Enter·F3), `scripts/smoke-reader.cjs`(기록 내보내기·가져오기).
- 검증(이번 실행): `npm.cmd test` 179개 통과. `test:documents`·`test:pdf` 통과. `test:reader`는 첫 실행에 DOCX 두 손가락 확대 단계 시간 초과(이번 변경과 무관한 단계), 이어서 기록 가져오기 단계 실패(새 책 주석 개수 미집계 → 수정) 후 통과. 실제 HWP 2,326개 일괄 변환: HWP 5.0 235개 모두 성공, 2,091개는 HWP 3.0(수정 전과 같은 결과). Electron 렌더러에서 BMP 재압축 측정. 실제 앱(Electron 개발 실행)으로 Markdown 상대 경로 그림 2개 표시, 없는 파일·웹 주소는 그대로 확인. `android:sync`·`assembleDebug` 성공(10.7MB). `build:pc-dir` 설치본으로 정관 HWP 열기 → 프로필 폴더 `logs/app.log`에 기록 확인.
- Google Play 검토: 코드 변경 없이 [PLAY_STORE_REVIEW.md](PLAY_STORE_REVIEW.md) 작성. 확인한 사실: targetSdk 36, 권한 INTERNET뿐, 네이티브 라이브러리 없음, 런처 아이콘은 Capacitor 기본, 오픈소스 고지·HWP 공개 문서 출처 문구 없음, 디버그 서명 APK만 있음, `allowBackup=true`.
- 미검증: 실기기 전부, 휴대폰에서 기록 가져오기 파일 선택, 휴대폰 BMP 재압축 속도·메모리, 문단 테두리가 있는 실제 문서, 개인 계정 여부(Play 비공개 테스트 조건).

## 기록 자동 동기화 + 휴대폰 Markdown 원본 저장 (2026-11-03)

- 사용자 요청: 클라우드 동기화가 되는지 질문 → 현재는 열기만 되고 동기화·원본 저장은 안 된다고 답하고 3단계 제안 → "1, 2번 먼저 진행하고 커밋, 푸시해줘".
- 변경:
  - `src/core/libraryTransfer.js`: 삭제 기록(`deleted`: 주석 id → 삭제 시각, 180일 보관, `normalizeDeleted`·`recordDeleted`), 병합 시 삭제가 나중이면 양쪽 사본에서 제거, 새 책의 주석도 삭제 기록 적용.
  - `web/app.js`: 동기화(`syncRecords`, `scheduleRecordsSync`, `chooseSyncFile`, `stopSync`, `renderSyncStatus`, `syncState`), 공통 병합 적용 `applyMergedRecords`(가져오기와 공유), 삭제 지점 4곳에 삭제 기록, 저장 시 동기화 예약, PC 창 닫기 전 동기화, 휴대폰 백그라운드 전환 시 동기화, Markdown 저장 결과 `original` 안내(실패·충돌은 알림 창).
  - `electron/main.cjs`·`preload.cjs`: `records:choose-sync-file`·`records:read-sync`·`records:write-sync`(.json 절대 경로만, 64MB, 임시 파일 → rename).
  - `src/platform/android.js`, `ReaderDocumentsPlugin.java`: `chooseSyncFile`·`readSyncFile`·`writeSyncFile`, `reader-sources.json`(사본 → 원본 URI·수정 시각), `pickFile` 읽기·쓰기·영구 권한, Markdown 영구 권한, `writeOriginal`(원본이 그사이 바뀌면 `changed`), 다시 열 때 원본이 더 새로우면 다시 가져오기.
  - `web/index.html`·`src/locales/*`: 자동 동기화 화면과 문구, `native.sync*` 오류, `markdown.savedToOriginal` 등.
  - 시험: `test/core/libraryTransfer.test.js`(삭제 유지·만료 2개 추가), `scripts/smoke-reader.cjs`(모의 동기화 파일: 만들기 → 다른 기기 변경 병합·삭제 반영).
- 결정 이유: Google 로그인·서버 없이 사용자가 고른 클라우드 폴더의 파일 하나로 동기화 → 개인정보처리방침 "수집 없음" 유지, Play 심사 부담 없음. 원본 덮어쓰기는 다른 곳의 변경을 잃지 않도록 수정 시각을 비교해 보수적으로.
- 검증(이번 실행): `npm.cmd test` 181개 통과, `test:documents`·`test:pdf` 통과, `test:reader` 통과(첫 실행 1회는 알려진 epub.js `bounds` 콘솔 오류로 마지막 검사 실패, 재실행 2회 통과), `android:sync`·`assembleDebug`·`testDebugUnitTest` 성공. PC: 실제 메인 프로세스를 임시 프로필로 띄워 동기화 파일 쓰기 → 파일 수정 → 병합 확인, 임시 파일 남지 않음. 에뮬레이터(API 36 Pixel_7, WebView 원격 디버깅으로 조작): 동기화 파일 만들기(다운로드 폴더) → 다른 기기처럼 파일 수정 → 앱 강제 종료·재실행 뒤 시작 동기화로 병합(영구 권한 유지), Markdown을 파일 선택으로 열어 수정·저장 → 원본 반영(`saved`), 원본을 밖에서 바꾼 뒤 저장 → 덮어쓰지 않음(`changed`). 시험 파일은 삭제.
- 발견: 에뮬레이터 부팅 직후(부하 높음) 파일 선택 중 앱 프로세스가 시스템에 의해 종료되어 선택 결과를 잃음 — 메모리가 부족한 휴대폰에서도 생길 수 있는 Android 동작(Capacitor 복원 처리 미구현, 기존부터). 스크립트로 편집기 DOM에 넣은 글자는 변경 이벤트가 안 나서 시험에서는 읽기 모드 전환으로 변경을 감지시킴(실사용 입력과 무관).
- 참고: 2026-11-03 앞선 확인에서 Electron 개발 실행(`electron .`)을 사용자 프로필 그대로 써서, 이 PC 앱의 최근 파일 목록에 시험용 Markdown(삭제됨)과 HWP 몇 개가 들어갔을 수 있음. 동기화 확인부터는 임시 프로필 사용.
- 미검증: 실기기, Google Drive·OneDrive 앱 같은 실제 클라우드 제공자의 영구 권한과 쓰기, 두 기기 동시 동기화.
