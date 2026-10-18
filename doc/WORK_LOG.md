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
