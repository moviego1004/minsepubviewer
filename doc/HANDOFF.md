# 다른 PC에서 이어서 작업하기

최종 갱신: 2026-11-02 (한국 시간)

## 먼저 읽을 문서

1. 저장소 루트 `AGENTS.md`: 모든 PC에서 적용할 작업 및 기록 규칙.
2. 이 문서: 현재 상태, 환경과 재개 절차.
3. [NEXT_TASKS.md](NEXT_TASKS.md): 다음 작업과 미검증 항목.
4. [WORK_LOG.md](WORK_LOG.md): 실제 작업과 검증 이력.
5. [ANDROID.md](ANDROID.md): Android 구조, 빌드, 설치, 데이터 정책.
6. [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md): 기능 요구사항, 개발 방안, 완료 내역, 앞으로 할 일(전체 로드맵). 2026-10-18 전면 개편.
7. [POLARIS_OFFICE_ANALYSIS.md](POLARIS_OFFICE_ANALYSIS.md): 폴라리스 오피스 APK의 HWP 표시·글꼴 전략 분석(2026-11-02), 로드맵 A 참고 자료. 형식별(워드·시트·슬라이드·PDF) 표시 방식은 [POLARIS_OFFICE_FORMATS.md](POLARIS_OFFICE_FORMATS.md).

## 현재 상태

- 저장소: https://github.com/moviego1004/minsepubviewer.git
- 이번 인수인계 대상 브랜치: `master`. 정확한 커밋은 `git log -5 --oneline`으로 확인한다.
- 앱 이름은 **Mins Reader**(이전 Mins EPUB Viewer). `appId` `com.mins.epubviewer`와 PC 기존 사용자 데이터 폴더는 유지한다.
- EPUB, Markdown에 더해 **PDF**(PDF.js 6.3.289)를 읽는다. 툴바의 **파일 열기** 하나로 세 형식을 연다. 메뉴·알림은 **한국어/영어** 지원(보기 설정 → 언어).
- Electron Windows 앱과 Capacitor Android 앱이 `web/`, `src/core/`를 공유한다. 실제 UI는 순수 JavaScript 기반이며 초기 계획의 React는 현재 구현이 아니다.
- EPUB/Markdown 열기, 읽기 설정, 위치 복원, 책갈피/주석, Markdown 편집 및 내보내기 코드가 있다.
- PDF: `web/pdf-reader.js`(PDF.js 뷰어 래퍼), `src/core/pdfLocation.js`(위치·형광펜 좌표 문자열). 이어보기(쪽·배율·위치), 목차, 검색, 책갈피, 형광펜/메모(앱 내부 저장, 원본 미수정), 테마, 두 쪽 보기, 회전, PC 전체 화면(F11). 재배치 보기(2026-11-02, `src/core/pdfReflow.js`): 글자를 화면 폭으로 다시 흘려 변환 문서 뷰어로 보여 줌, 같은 책 기록·PDF 쪽 위치 공유, 이 보기의 형광펜은 이 보기에서만 보임, 설정 키 `minsepubviewer.pdf-reflow`.
- 다국어: `src/locales/ko.js`, `en.js`(키 일치 테스트), `web/i18n.js`(`data-i18n` 적용). Electron 대화상자와 Android Java 오류(`native.*` 키)도 같은 사전을 쓴다.
- 변환 문서(읽기 전용): DOCX(docx-preview 0.4.1로 서식 유지, PC 쪽 모양·휴대폰 재배치, 실패 시 mammoth 1.13.0, 2026-11-02), HWPX·XML HWP(자체 변환기 `src/core/hwpXml.js`, 텍스트·표; HWPX는 `Contents/header.xml` 서식(글꼴·글자·문단 모양·표 테두리/배경)도 이진 HWP와 같은 클래스로 적용, 2026-11-02), 바이너리 HWP 5.0(PC는 Electron 메인 프로세스의 `@ohah/hwpjs@0.1.0-rc.10` 네이티브 모듈로 쪽 배치 재현, Android와 브라우저는 자체 모듈 `src/core/hwpBinary.js`로 본문·표·각주와 DocInfo 서식(글꼴·크기·색·문단 정렬·여백·표 테두리/배경, 2026-11-01)을 화면 폭에 맞춰 재배치, 압축 해제는 pako — 브라우저 `DecompressionStream`은 HWP 구역 끝의 CRC·크기 꼬리 때문에 실패). 뷰어는 `web/document-reader.js`(스크립트 없는 iframe), 위치·형광펜은 `src/core/textAnchors.js`.
- 변환 문서 글꼴(2026-11-02): 나눔고딕·나눔명조(OFL, `@fontsource/*` 5.3.0) 한국어 WOFF2 보통·굵게를 iframe `@font-face`로 동봉(1.84MB). HWP 글꼴 이름 → 명조/고딕/굵은 제목/고정폭/기호 분류는 `src/core/hwpFonts.js`. 변환 문서 형식은 내용으로 판별(`src/core/documentSniff.js`). API 36 에뮬레이터 확인, 실기기 확인 전. adb.exe 전송이 막히면 `python scripts/install_app_adb.py --tcp|--usb`([ANDROID.md](ANDROID.md)). 휴대폰 묶음은 esbuild `chrome80` 대상.
- 배포 축소: PC 패키지는 필요한 파일만 넣고(Electron 언어 ko·en만, PDF.js min, HWP는 Windows용 `.node`만), Toast UI는 devDependency로 옮겼다. 사용자 샘플 `test/sample/`은 Git 제외.
- iOS는 Mac/Xcode가 없어 보류.
- 휴대폰 터치 구역(`src/core/touchNavigation.js`): 위·아래 1/3 탭은 쪽 이동(스크롤 화면은 한 화면씩), 가운데 한 번 탭은 선택·형광펜용으로 비워 두고 가운데 두 번 탭(`isCenterTap` + 350ms)이 전체 화면 전환. PDF 탭은 `PdfReader.step`(확대한 쪽 안에서 먼저 스크롤). PDF 쪽 보기에서 쪽이 화면보다 크면 쪽 끝에 닿은 채 계속 미는 동작이 쪽 이동(`getEdgeSwipe`, `touch-reader`의 `scrollElement`/`edgePaging`; 밀기 시작 150ms 안에 스크롤이 있었거나 밀기 중 스크롤되면 무시).
- 휴대폰 두 손가락 확대: EPUB·MD·변환 문서는 움직이는 동안 화면을 바로 확대(transform)하고 손을 떼면 글자 크기/배율로 다시 배치, PDF는 `PdfReader.pinchZoom`(PDF.js `updateScale`)으로 실시간 확대. 공통 제스처는 `src/platform/touch-reader.js`의 `pinch: { begin, move, end }`.
- Android 문서 읽기 경로: EPUB(압축 해제 폴더 URL)·PDF(앱 사본 URL)는 `convertFileSrc`, DOCX·HWP·HWPX·Markdown은 플러그인 `readDocument`(base64). Capacitor 로컬 서버가 `.hwp` 등 모르는 확장자를 제공하지 못해 "Failed to fetch"가 났기 때문(2026-10-18).
- Android에는 네이티브 문서 가져오기/저장, 다른 앱의 열기/공유 수신, 앱 내부 사본과 상태 저장, 모바일 메뉴/전체 화면/터치 조작이 구현되어 있다.
- 버전과 배포 파일(2026-10-17 사용자 지시): PC와 Android는 한 버전을 쓴다(`package.json` version = Android versionName, versionCode는 빌드마다 +1). 배포 파일을 만들 때마다 마지막 자리를 1씩 올리고 `build/MinsReader_ver<버전>.exe`(PC 설치 파일), `build/MinsReader_ver<버전>.apk`로 저장한다. 모든 빌드 명령이 `scripts/release.cjs`를 거친다: `build.bat`·`npm.cmd run build`·`release`(둘 다), `makeSetup.bat`·`release:pc`, `android:apk`·`release:android`. 다음 번호는 PC 버전·Android 버전·`build/`의 기존 `MinsReader_ver*` 파일 중 가장 높은 것 +1(기존 파일 덮어쓰기 방지). 실패하면 버전을 되돌린다. Electron 폴더 빌드만 필요하면 내부용 `build:pc-dir`. 현재 0.1.10(versionCode 11, 2026-11-01 APK만 빌드, PC 설치 파일은 0.1.9가 마지막).
- 화면 영역에 맞춘 반응형 배치와 ResizeObserver 기반 EPUB 재배치가 있다. Android 최소 API 24(7.0), target/compile API 36이다.
- 기기 모델 자동 분류나 전자잉크 전용 갱신/잔상 제어는 없다. Android 버전만으로 호환성을 보장할 수 없으며 WebView와 실제 기기 검증이 필요하다.

## 새 PC 준비

Git 및 Node.js 22 이상을 준비한다. 새 폴더에서는:

```powershell
git clone https://github.com/moviego1004/minsepubviewer.git
cd minsepubviewer
npm.cmd ci
npm.cmd test
```

이미 복제한 PC에서는 먼저 `git status`로 로컬 작업을 확인한다. 변경을 보존하고 작업 트리가 깨끗한 상태에서 `git pull --ff-only origin master`로 갱신한다. 분기 충돌 시 강제 초기화하지 않는다.

Codex에서 이 저장소 폴더를 열고 다음과 같이 요청하면 된다:

> AGENTS.md와 doc/HANDOFF.md, doc/NEXT_TASKS.md, doc/WORK_LOG.md를 읽고 현재 코드와 대조해 작업을 이어가 줘. 개발 계획과 결과도 해당 문서에 갱신해 줘.

Windows 앱 실행은 `npm.cmd run desktop`, 웹 개발 실행은 `npm.cmd run dev`이다.

Android는 JDK 21과 SDK Platform 36이 필요하다. 설치가 안 되어 있으면 `scripts/setup-android.ps1` 또는 Android Studio로 준비한다. SDK 라이선스는 확인 후 수락한다. 자세한 내용은 [ANDROID.md](ANDROID.md)를 따른다.

```powershell
npm.cmd run android:sync
npm.cmd run android:apk   # 버전 +1, build/MinsReader_ver<버전>.apk
# 선택: USB 디버깅 기기 설치(가장 높은 버전 APK)
npm.cmd run android:install
```

## PC 간 전달 범위와 주의점

- Git에는 소스, 잠금 파일, Android Gradle wrapper, 문서가 포함된다. `node_modules`, SDK/JDK, `android/local.properties`, 생성된 `dist`/`build`/APK는 새 PC에서 준비한다.
- GitHub 인증도 새 PC에서 별도로 설정한다. 토큰/키를 문서에 넣지 않는다.
- 기본 디버그 서명키는 PC마다 달라질 수 있다. 다른 PC의 APK로 기존 설치를 업데이트할 때 서명 불일치가 생길 수 있다. 기존 앱을 무조건 삭제하지 말고 중요한 문서를 먼저 내보내고 서명 정책을 확인한다. 키를 Git에 넣지 않는다.
- 앱 내부 책/주석/읽기 기록과 Codex 채팅은 이 저장소 문서 동기화와 별개다. 앱 데이터의 PC 간 자동 동기화는 구현되지 않았다.
- 테스트 화면 캡처는 과거 UI 참고 자료이며 현재 버전의 실기기 검증 증거로 간주하지 않는다.

## 이번 검증 (2026-10-17)

- 시작 시 `git fetch` 후 로컬 `master`와 `origin/master`가 `39cef44`로 일치했다.
- `npm.cmd test`: 119개 통과.
- `npm.cmd run test:reader`: 통과(모의 Android 연결부, PDF URL 열기·탭 이동·재실행 복원, 한/영 전환 포함). 2026-09-28의 `bounds` 오류는 5회 실행에서 재현되지 않았다.
- `npm.cmd run test:pdf`(신규): 통과(열기, 목차, 쪽 이동, 책갈피, 형광펜, 검색, 다크 테마, 배율, 재시작 복원, 언어 전환).
- `npm.cmd run android:sync`: 통과. 실제 `npx electron .`에 PDF 경로를 넘겨 열리는 것을 로그로 확인했다.
- 이후 같은 날 JDK 21과 Android SDK를 이 PC 사용자 공용 위치(`%LOCALAPPDATA%ProgramsEclipse Adoptiumjdk-21`, `%LOCALAPPDATA%AndroidSdk`)에 설치했다. `npm.cmd run android:apk` 성공(8.0MB), `gradlew testDebugUnitTest` 5개 통과. 다른 프로젝트(YTHelper 등)도 같은 `JAVA_HOME`/`ANDROID_HOME`을 쓴다.
- **미검증**: 처음에는 JDK/SDK가 없어 `android:apk`를 실행하지 못했으나 위와 같이 해결했다. 실기기, 패키지된 설치본(NSIS 업그레이드, 프로필 폴더 유지), Electron 파일 대화상자 문구는 확인하지 않았다.

## 이전 검증 (2026-09-28)

- `npm.cmd test`: 107개 통과.
- `node --check web/app.js`: 통과.
- `npm.cmd run android:sync`: 모바일 빌드 및 Capacitor 동기화 통과. 샌드박스의 상위 폴더 읽기 제한으로 첫 실행이 실패하여 권한을 확장한 재실행으로 확인했다.
- `npm.cmd run test:reader`: 실패. 문서 위치 복원 이후 `Uncaught TypeError: Cannot read properties of undefined (reading 'bounds')`가 수집되어 `scripts/smoke-reader.cjs:256`의 오류 없음 검사가 실패했다. 원인은 미확정이며 다음 작업에서 우선 진단한다.
- 이번 인수인계에서는 실기기 검사와 APK/Java 검사 재실행을 하지 않았다. 기존 Android 문서의 2026-09-26 빌드 완료 기록은 과거 기록이다.

## EPUB 열기 실패 조사 (2026-10-25)

- 사용자 요청: 제공한 투자 이야기 EPUB이 안 열리는 원인부터 파악. 원본 파일·제품 코드 수정과 빌드는 하지 않음. 시작 Git 작업 트리는 깨끗했음.
- 원인: `OEBPS/content.opf` manifest에는 `chap001`~`chap010`만 있으나 spine 앞부분에 존재하지 않는 `c0`~`c9` 참조 10개가 남아 있음. 뒤에는 정상 chap 참조 10개도 있어 총 20개로 해석됨.
- 검증: JSZip CRC 검사 통과(6,965,026바이트, 150항목), XML/XHTML/OPF 파싱 오류 미검출. 설치된 epubjs의 Packaging → Spine.unpack → 첫 Section.load → Archive.request 경로를 Node에서 재현: 원본 첫 href가 undefined이고 `Cannot read properties of undefined (reading indexOf)` 발생. 잘못된 itemref 10개를 메모리에서만 제거하면 spine 10개·첫 href chap001.xhtml·첫 장 로딩 성공. 이는 렌더링 전체 성공이나 정식 EPUB 적합성 검사 결과는 아님.
- Electron 별도 진단 프로세스는 유효한 출력이 없어 UI 재현 증거로 사용하지 않음. Android 실기기 및 전체 책 표시 미검증. 기능 변경이 없으므로 빌드·단위 시험은 실행하지 않음.
- 다음 단계(제안, 미착수): EPUB 생성기의 오래된 spine 참조 누적을 수정하거나 원본과 별도 교정 사본에서 잘못된 참조를 제거. 뷰어에는 누락 manifest 참조 사전 검증과 명확한 오류 안내 검토. 자동으로 추측하여 장을 연결하지 않음.
- 재현: 로컬 샘플 ZIP의 OEBPS/content.opf에서 manifest item id와 spine itemref idref 집합을 비교한 뒤, 설치된 epubjs/lib/{packaging,spine,archive}.js로 첫 Section.load를 실행. 개인 EPUB은 저장소에 복사하지 않음.

## EPUB 교정본 생성 완료 (2026-10-25)

- 사용자 요청에 따라 원본 옆 `포즈랑 의 투자 이야기_교정본.epub` 생성(6,965,277바이트). 원본 보존.
- OPF spine의 존재하지 않는 c0~c9 참조 10개만 제거. OPF 외 모든 파일의 압축 해제 바이트가 원본과 동일함을 확인. mimetype은 첫 항목·무압축 유지.
- 검증: 교정 ZIP CRC 통과, spine 10개 모두 manifest에 존재, 설치된 epubjs Packaging/Spine/Archive/Section으로 전체 10개 장 로딩 성공. 원본 바이트 불변 확인.
- 미검증: 실제 뷰어 화면·Android 실기기 표시 및 정식 EPUBCheck. 뷰어 코드 변경·빌드·커밋 없음. 개인 EPUB은 저장소에 넣지 않음.
- 남은 제안: 생성기 spine 갱신 문제 및 뷰어 오류 안내 개선은 미착수. 이번 EPUB 교정 요청 완료.

## 휴대폰 HWP 원본 서식 표시 (2026-11-01)

- 사용자 요청: 휴대폰 HWP의 글꼴·색 등이 원본과 너무 다름. 시작 시 미커밋 변경은 doc 3개(2026-10-25 EPUB 조사 기록)뿐이었고 보존함.
- 변경: `src/core/hwpBinary.js`가 `DocInfo`를 읽어(`readDocInfo`) 글자 모양 `.hcN`, 문단 모양 `.hpN`, 테두리/배경 `.hbN` 클래스를 담은 `<style>`을 문서 앞에 붙이고, 문단(PARA_CHAR_SHAPE 구간)·표 칸에 적용. 크기는 rem(1rem = 원본 10pt = 14px, 읽기 배율로 추가 확대). DocInfo를 못 읽으면 예전처럼 서식 없이 표시. `web/document-reader.js`는 `.hwp-styled` 문서에 `has-own-colors`를 붙여 다크 테마에서 밝게 그린 뒤 반전.
- 확인한 형식 사실(실제 샘플과 PC hwpjs 출력 대조): 글자 크기·칸 크기는 1/100pt, 문단 여백·들여쓰기는 2배 값(/200pt), 자간은 값/200em, 음영 0xFFFFFFFF는 없음, 테두리선 종류 0은 없음, 칸 안쪽 여백 0xFFFF는 표 기본값(TABLE 레코드 10~17바이트) 사용, 테두리/배경 ID는 1부터.
- 2026-11-01 `npm.cmd run android:apk` 성공: `build/MinsReader_ver0.1.10.apk`(7.5MB, versionCode 11). 실기기 설치·표시 확인은 사용자 몫(미검증).
- PC는 바뀌지 않음(계속 hwpjs 쪽 배치). 서식은 바이너리 HWP 5.0과 HWPX(2026-11-02 M8)에 적용되고 XML HWP(HWPML)는 아직 텍스트·표만.
- 다음 작업(사용자 결정 대기): HWP 원본 모양 재현. 글꼴 동봉(A) → hwpjs WASM 직접 빌드(C-1) → 자체 쪽 배치(C-2) 순서 제안. 상세는 DEVELOPMENT_PLAN.md 5.1 "원본 모양 재현 로드맵", NEXT_TASKS.md 첫 항목.
