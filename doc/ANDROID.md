# Android 개발 안내

Windows 앱과 Android 앱은 같은 저장소의 `web/` 화면과 `src/core/` 로직을 사용합니다.
Android 프로젝트는 Capacitor 8 기반이며 Android Studio에서 `android/`를 열면 됩니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/core/` | 공통 설정, EPUB 위치, 책갈피, 주석, Markdown 처리 |
| `web/app.js`, `web/styles.css` | 공통 뷰어 |
| `src/platform/index.js` | Electron / 브라우저 / Android 연결부 선택 |
| `src/platform/android.js` | Android 파일 API, 이미지 보기, 앱 생명주기 연결 |
| `src/platform/storage.js` | 동기식 읽기 모델과 순차적인 영구 저장 연결 |
| `src/platform/mobile-files.js` | 가져온 EPUB/PDF/MD를 공통 뷰어 입력으로 변환 (PDF는 URL로 전달) |
| `web/pdf-reader.js`, `src/core/pdfLocation.js` | PDF.js 기반 PDF 보기, PDF 위치·형광펜 좌표 형식 |
| `web/i18n.js`, `src/core/i18n.js`, `src/locales/` | 한국어/영어 UI 문구 |
| `web/mobile.css` | Android 전용 화면 보정 |
| `electron/` | Windows 앱 및 PC 파일 처리 |
| `android/` | Android Studio 프로젝트와 문서 처리 플러그인 |
| `dist/mobile/` | 생성된 모바일 웹 자산, Git 제외 (`vendor/pdfjs/`에 PDF.js legacy 빌드 복사) |

`window.minseDesktop`은 Electron preload에 유지됩니다. 공통 화면은 이제 `platform`을 사용합니다.
Android는 앱 시작 시 영구 저장 데이터를 먼저 읽고 공통 화면을 초기화합니다.
Android 빌드에 Node 서버나 Electron은 포함하지 않습니다.

## 빌드 환경

- Node.js 22 이상
- JDK 21
- Android SDK Platform 36 및 SDK Build Tools
- 기기 테스트 시 USB 디버깅 또는 Android 에뮬레이터
- Android Studio 2025.2.1 이상은 선택 사항입니다. 명령줄 빌드와 USB 설치에는 필요하지 않습니다.

현재 프로젝트는 `minSdkVersion=24`, `compileSdkVersion=36`, `targetSdkVersion=36`입니다.
최소 Android 7.0 설정은 프레임워크 기준이며 구형 기기/WebView에서의 동작 보장은 아직 검증하지 않았습니다.

Windows에서 필수 도구만 설치하려면 다음 스크립트를 실행합니다.
SDK 라이선스를 직접 확인하며 설치하려면 `-AcceptSdkLicenses`를 생략합니다.

```powershell
./scripts/setup-android.ps1 -AcceptSdkLicenses
```

공식 배포 파일의 SHA-256을 검사하고 현재 사용자 계정에 설치합니다. 이 저장소 전용이 아니라 같은 Windows 사용자의
모든 프로젝트(Android Studio, 다른 Gradle 프로젝트 포함)가 함께 쓰는 위치입니다. 관리자 권한은 필요 없습니다.

- JDK 21: `%LOCALAPPDATA%/Programs/Eclipse Adoptium/jdk-21` (`-JdkRoot`로 변경 가능, 2026-10-17 이전에는 `%LOCALAPPDATA%/MinsAndroid/jdk-21`)
- Android SDK: `%LOCALAPPDATA%/Android/Sdk` (Android Studio 기본 위치, `-SdkRoot`로 변경 가능)
- 내려받은 설치 파일과 로그: `%LOCALAPPDATA%/Android/setup-downloads`
- Command-line Tools 22.0, Platform 36, Build Tools 35.0.0/36.0.0, Platform Tools(ADB)
- 사용자 환경 변수 `JAVA_HOME`, `ANDROID_HOME`과 기존 값을 보존한 `Path` 설정

새 터미널에서는 `java`, `adb`를 바로 사용할 수 있습니다. 현재 Codex 창을 재시작하지 않아도
이 프로젝트의 빌드·설치 스크립트는 위 설치 경로를 자동으로 찾습니다.

Android Studio를 사용하는 경우:

```powershell
npm.cmd ci
npm.cmd run android:sync
npm.cmd run android:open
```

Android Studio에서 Gradle 동기화를 완료한 후 기기를 선택하고 Run을 실행합니다.
웹 코드를 변경한 후에는 `android:sync`를 다시 실행해야 APK에 반영됩니다.

디버그 APK를 명령줄에서 만들려면(빌드할 때마다 버전 +1):

```powershell
npm.cmd run android:apk
```

결과: `build/MinsReader_ver<버전>.apk`. `android:apk`는 `release:android`와 같다. Gradle 중간 산출물(`android/app/build/outputs/apk/debug/app-debug.apk`)은 배포 파일로 쓰지 않는다.

빌드 스크립트는 `JAVA_HOME`이 없으면 Android Studio JDK와 위 기본 JDK 경로를 찾습니다. 다른 경로에 설치했다면
`JAVA_HOME`에 JDK 디렉터리, `ANDROID_HOME`에 Android SDK 디렉터리를 지정하거나,
Android Studio에서 프로젝트를 열어 `android/local.properties`를 생성합니다.
첫 Gradle 빌드는 의존성 다운로드를 위한 인터넷 연결이 필요합니다.
## Play 스토어용 AAB (2026-11-03)

```powershell
npm.cmd run android:upload-key   # 키가 없는 PC에서만: 새 업로드 키 생성(이미 있으면 거부). 보통은 기존 키를 복사
npm.cmd run release:aab          # 버전 +1 → build/MinsReader_ver<버전>.aab
```

- 업로드 키: 사용자의 기존 업로드 키(다른 앱과 공용, CN=Mins Consulting, 별칭 `upload`)를 `android/keystore/upload.jks`·`upload.properties`(storeFile·storePassword·keyAlias·keyPassword, storeFile은 이 파일 기준 상대 경로)에 둔다. `android/keystore/` 폴더 전체가 `.gitignore`에 있어 커밋되지 않는다. 다른 경로는 `MINS_UPLOAD_KEY_PROPERTIES`로 지정. 다른 PC에서 AAB를 만들 때는 이 폴더를 복사한다(새 키를 만들면 Play가 다른 키라 거부).
- `android/app/build.gradle`이 이 파일이 있을 때만 release 서명 설정을 만든다. 파일이 없으면 `release:aab`가 버전을 올리기 전에 멈춘다.
- 결과 확인: 스크립트가 `jarsigner -verify`로 서명을 검사한 뒤 복사한다. 서명자 확인은 `keytool -printcert -jarfile build/MinsReader_ver<버전>.aab`(CN=Mins Consulting, SHA-256 06:C5:78:D4:…:97:13).
- Play Console에서는 Play App Signing(앱 서명 키는 Google 보관)을 쓰고 이 키를 업로드 키로 쓴다. 업로드 키를 잃으면 Play Console에서 재설정 요청을 할 수 있다.
- release 서명 앱은 디버그 APK와 서명이 달라 서로 업데이트로 설치되지 않는다(스토어 설치본으로 바꾸려면 디버그 앱을 지우고 설치, 그 전에 기록 내보내기).

## 케이블 없이 APK 파일로 설치

전달용 APK: `npm.cmd run release:android`(PC 설치 파일까지 함께는 `npm.cmd run release`)가 버전을 하나 올리고 `build/MinsReader_ver<버전>.apk`로 저장합니다(디버그 서명). 예: `build/MinsReader_ver0.1.4.apk`. 이전 이름의 0.1.3 파일은 `build/MinsEPUBViewer-Android-0.1.3-debug.apk`였습니다.
이 파일은 해당 버전 빌드의 사본이며, 다시 빌드하면 최신 APK는
`android/app/build/outputs/apk/debug/app-debug.apk`에서 가져옵니다.

1. 메일 또는 개인 클라우드로 APK를 휴대폰에 내려받습니다.
2. 갤럭시의 **내 파일 → 다운로드**에서 APK를 누릅니다.
3. 설치 권한 안내가 나타나면 APK를 여는 앱에 대해 **이 출처 허용**을 켜고 설치합니다.
4. 설치 후 Mins Reader에서 EPUB, PDF 또는 MD를 엽니다.

이 방식에는 USB 디버깅이나 삼성 USB 드라이버가 필요하지 않습니다.
메일에서 APK 첨부를 제한하면 개인 클라우드의 다운로드 링크를 이용합니다.
갤럭시의 보안 위험 자동 차단 설정에 따라 설치가 제한될 수 있습니다.
참고: [삼성의 알 수 없는 앱 설치 안내](https://www.samsung.com/us/support/troubleshoot/TSG10001913/).

## USB로 휴대폰에 설치 (선택 사항)

1. 휴대폰에서 개발자 옵션을 활성화하고 **USB 디버깅**을 켭니다.
2. 데이터 전송이 가능한 USB 케이블로 PC와 연결합니다.
3. 휴대폰에 나타나는 **USB 디버깅 허용** 창에서 이 PC의 연결을 허용합니다.
4. 다음 명령으로 디버그 APK를 만들고 설치·실행합니다(`android:install`은 `build/`의 가장 높은 버전 `MinsReader_ver*.apk`를 설치).

```powershell
npm.cmd run android:apk
npm.cmd run android:install
```

설치 명령은 USB 기기 한 대만 대상으로 합니다. 여러 기기를 연결했다면
`adb devices -l`로 확인한 기기 ID를 `npm.cmd run android:install -- 기기ID`에 전달하세요.
앱 업데이트 시 내부 데이터를 유지하는 `adb install -r`을 사용합니다.
서명이 다른 기존 앱이 있으면 설치가 실패할 수 있으며, 스크립트는 기존 앱을 자동 삭제하지 않습니다.
Windows에서 USB 기기가 인식되지 않으면 해당 휴대폰 제조사의 USB 드라이버가 추가로 필요할 수 있습니다.

### adb.exe 전송이 막힐 때: `scripts/install_app_adb.py` (2026-11-02)

이 PC에서는 `adb install`/`adb push`가 `connection reset`으로 실패했습니다. 이때는 adb.exe 없이 ADB 프로토콜을 직접 쓰는 스크립트로 설치합니다(YTHelper의 `install_app.py`를 이 앱에 맞게 옮김). 필요: Python 3, `python -m pip install adb-shell==0.4.4`. 다른 adb 서버가 같은 에뮬레이터를 잡고 있으면 먼저 `adb kill-server`.

```powershell
python scripts\install_app_adb.py --check   # 고를 APK와 연결 방식만 표시
python scripts\install_app_adb.py --tcp     # 에뮬레이터 127.0.0.1:5555(콘솔 포트+1)
python scripts\install_app_adb.py --usb     # USB 휴대폰(Windows WinUSB)
python scripts\install_app_adb.py --apk build\MinsReader_ver0.1.11.apk
```

- APK: `--apk` → `MINS_APK` → Gradle 디버그 출력(`android/app/build/outputs/apk/debug`)과 `build/`의 가장 높은 `MinsReader_ver*.apk` 가운데 더 최근 파일.
- 환경 변수: `MINS_ADB_TRANSPORT`(tcp|usb), `MINS_ADB_HOST`, `MINS_ADB_PORT`, `MINS_ADB_KEY`(기본 `~/.android/adbkey`), `MINS_BOOT_TIMEOUT`(초, 기본 180. 막 켠 에뮬레이터는 400 정도).
- `pm install -t -r`로 바꿔 설치하고 앱을 지우지 않습니다. 서명이 다르면 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`을 알리고 멈춥니다. 설치 뒤 MainActivity를 실행합니다(`--no-launch`로 생략).
- 디버그 APK만 빌드(버전 번호 그대로): `cd android; $env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; .\gradlew.bat assembleDebug`.
- Git Bash에서 기기 경로(`/sdcard/...`)를 쓰는 명령은 `MSYS_NO_PATHCONV=1`이 필요합니다(경로가 `C:/Program Files/Git/...`로 바뀜).
- 확인(2026-11-02): API 30(WebView 83)·API 36(WebView 133) 에뮬레이터에서 설치·실행 성공.

### 오래된 WebView

- 휴대폰용 묶음(`dist/mobile/web/mobile.js`)은 esbuild `target: "chrome80"`으로 만듭니다(2026-11-02, 이전 `es2022`). WebView 83은 `||=`를 몰라 앱이 시작하자마자 멈췄습니다(`Uncaught SyntaxError: Unexpected token '='`).
- 문법 오류를 고친 뒤에도 WebView 83(업데이트 안 된 Android 11 에뮬레이터)에서는 화면 배치가 깨지고 외부 열기로 받은 HWP가 열리지 않았습니다. 원인 미조사(CSS 기능 지원 범위로 추정). 실제 휴대폰은 Play 스토어로 WebView가 갱신되므로 우선순위는 낮게 둡니다.

이 APK는 개인 기기 테스트용 디버그 서명을 사용합니다. Play 스토어 등록에는 별도 배포 서명이 필요합니다.

Windows 실행은 `npm.cmd run desktop`입니다. 빌드는 모두 `scripts/release.cjs`를 거칩니다: `build.bat`·`npm.cmd run build`·`npm.cmd run release`(PC+APK), `makeSetup.bat`·`release:pc`(PC만), `android:apk`·`release:android`(APK만), `release:aab`·`android:aab`(Play용 AAB). 빌드마다 버전 +1, 결과는 `build/MinsReader_ver<버전>.exe/.apk/.aab`이며 `build/`에 있는 기존 배포 파일보다 항상 높은 번호를 씁니다.

## 파일과 저장 정책

### 앱 이름, PDF, 다국어 (0.2 작업, 2026-10-17)

- 앱 표시 이름을 **Mins Reader**로 바꿨습니다. `appId`/패키지 이름 `com.mins.epubviewer`는 기존 설치 업데이트를 위해 유지합니다.
- PDF를 **파일 열기**, 다른 앱으로 열기/공유(`application/pdf`)로 받을 수 있습니다. PDF는 앱 내부 보관함(`reader-documents/*.pdf`, 512MB 이하)에 복사하고,
  웹 화면에는 바이트 대신 `convertFileSrc` URL을 넘겨 PDF.js가 직접 읽습니다.
- PDF 재배치 보기(2026-11-02): ☰ 메뉴 "PDF 재배치 보기: 켜짐/꺼짐". 글자만 화면 폭으로 다시 흘립니다(그림·표 모양·다단 순서 제외, 스캔 PDF는 안내 문구).
- PDF.js 6.3.289(`pdfjs-dist`, Apache-2.0)의 **legacy 빌드**를 `scripts/build-mobile.js`가 `dist/mobile/vendor/pdfjs/`로 복사합니다(약 5.3MB, CMap·표준 글꼴·wasm 포함).
- PDF 기능은 PDF.js가 제공하는 범위만 씁니다: 페이지/연속 보기, 확대·맞춤, 회전, 두 쪽 보기, 텍스트 선택, 검색, 목차, 링크, 테마 색상.
  형광펜·메모·책갈피는 앱 내부 기록(PDF 좌표)이며 원본 PDF를 수정하지 않습니다. 스캔 PDF 영역 형광펜, OCR, 양식 저장은 지원하지 않습니다.
- PDF 확대·축소는 앱이 두 손가락 움직임을 PDF.js `updateScale`로 넘겨 바로 확대하고, 잠시 뒤 선명하게 다시 그립니다(2026-10-18, PDF.js 뷰어 라이브러리는 핀치를 직접 처리하지 않음). 쪽이 화면에 다 들어올 때만 상하단 탭/스와이프로 쪽을 넘기고, 확대해서 스크롤이 생기면 스크롤을 우선합니다.
- DOCX·HWPX·XML 형식 HWP(64MB 이하)는 앱 사본을 읽어 HTML로 바꿔 읽기 전용으로 보여 줍니다(DOCX는 `dist/mobile/vendor/docx-preview/`로 서식을 살려 화면 폭에 재배치, 실패 시 `vendor/mammoth/`. HWP 5.0과 HWPX는 문서의 글꼴·글자·문단·표 서식을 적용해 화면 폭에 재배치(HWPX는 2026-11-02부터, 그림 포함), XML HWP는 텍스트·표만). 한글 문서의 사설 영역 기호는 유니코드로 바꾸고, 휴대폰 글꼴에 없는 기호는 `vendor/fonts/noto-sans-symbols-2/`(382KB)로 그림(2026-11-02).
  변환 문서와 Markdown 사본은 플러그인 `readDocument`로 읽습니다. 앱 파일 URL(`convertFileSrc`)은 Capacitor 로컬 서버가 확장자로 형식을 정하는데 `.hwp`/`.hwpx`를 몰라 "Failed to fetch"가 났습니다(0.1.8에서 수정).
- 변환 문서용 동봉 글꼴(2026-11-02): `scripts/build-mobile.js`가 `@fontsource/nanum-gothic`·`nanum-myeongjo`의 한국어 WOFF2(보통·굵게)와 LICENSE를 `dist/mobile/vendor/fonts/`로 복사(1.84MB). `src/platform/android.js`가 `MINS_DOC_FONT_URL=/vendor/fonts`를 설정. API 36 에뮬레이터(WebView 133)에서 로컬 서버가 `.woff2`를 제공하고 HWP의 "바탕" 글꼴이 나눔명조로 그려지는 것을 확인(2026-11-02). 실기기는 사용자 확인 대기.
- 다른 앱으로 열기/공유 MIME: EPUB, PDF(`application/pdf`, `application/x-pdf`), DOCX, HWP(`application/x-hwp`, `application/hwp`, `application/haansofthwp`, `application/hangul`(2026-11-02, 폴라리스 오피스 목록 참고), `application/vnd.hancom.hwp`, `application/vnd.hancom.hwpml`), HWPX(`application/hwp+zip`, `application/x-hwpx`, `application/vnd.hancom.hwpx`, `application/haansofthwpx`), Markdown·TXT, 그리고 메신저가 쓰는 `application/octet-stream`·ZIP(파일 이름으로 형식 확인).
  바이너리 HWP 5.0 원본 쪽 보기(2026-11-03, ☰ 메뉴 "HWP 원본 쪽 보기", 기본 끔): hwpjs 해석기를 WebAssembly로 빌드한 `web/vendor/hwp/hwp_core.wasm`(약 700KB, PC 앱도 같은 파일 사용, 쪽을 넘어가는 문단 나누기 포함, 가져오기 없음 → SharedArrayBuffer·교차 출처 격리 불필요)을 `scripts/build-mobile.js`가 `dist/mobile/vendor/hwp/`로 복사하고 `MINS_HWP_WASM_URL`로 읽는다. API 36 에뮬레이터(WebView 133)에서 로컬 서버의 `.wasm` 제공과 쪽 표시 확인. 다시 빌드하려면 Rust(rustup)와 git이 있는 PC에서 `npm.cmd run build:hwp-wasm`.
  재배치 보기(2026-11-03 보강): 그림(PNG·JPEG·GIF·BMP·WebP, BMP는 WebView에서 PNG로 다시 압축), 번호·글머리표·개요 번호, 머리말·꼬리말(구역 앞뒤 한 번), 장평, 문단 테두리.
  기록 옮기기(2026-11-03): 보기 설정 → 기록 내보내기(`exportText`로 저장)/가져오기(`<input type=file>`, Capacitor 파일 선택). 실기기 미확인.
  기록 자동 동기화(2026-11-03): 플러그인 `chooseSyncFile`(만들기 `ACTION_CREATE_DOCUMENT` / 선택 `ACTION_OPEN_DOCUMENT`, `takePersistableUriPermission` 읽기·쓰기), `readSyncFile`, `writeSyncFile`(64MB 이하). API 36 에뮬레이터에서 다운로드 폴더에 만들기 → 다른 기기 변경 병합 → 앱 강제 종료·재실행 뒤 시작 동기화 성공(영구 권한 유지) 확인.
  Markdown 원본 저장(2026-11-03): `pickFile`이 읽기·쓰기·영구 권한을 요청하고 Markdown이면 영구 권한을 받아 둠. `saveMarkdown` 결과의 `original`: `saved`/`changed`(원본이 그사이 바뀜, 덮어쓰지 않음)/`failed`/`none`. 출처는 `files/reader-sources.json`. 에뮬레이터에서 원본 저장(`saved`)과 외부 변경 뒤 보호(`changed`) 확인. Google Play 준비 사항은 [PLAY_STORE_REVIEW.md](PLAY_STORE_REVIEW.md).
  바이너리 HWP 5.0은 자체 모듈(`src/core/hwpBinary.js`)로 본문·표·글상자·각주를 읽고, 2026-11-01부터 DocInfo의 글꼴·크기·색·문단 정렬/여백·표 테두리/배경을 화면 폭에 맞춰 적용합니다(쪽 배치·그림·자동 번호 제외, 압축 해제는 pako `inflateRaw`(`dist/mobile/vendor/pako/`). WebView의 `DecompressionStream`은 한글이 압축 본문 뒤에 붙이는 CRC·크기 8바이트 때문에 "Failed to fetch"로 실패해 0.1.9에서 교체).
  암호·배포용 HWP는 안내 문구만 보입니다.
- 화면 터치(2026-10-18): 위쪽 1/3 탭은 이전, 아래쪽 1/3 탭은 다음(연속 스크롤·확대한 PDF에서는 한 화면씩 스크롤 후 쪽 이동). 가운데 한 번 탭은 아무 동작도 하지 않아 선택·형광펜에 쓰고, 가운데를 **두 번** 탭하면 전체 화면을 켜고 끕니다(처음 3번은 안내 문구). 밀기(스와이프) 쪽 넘김은 내용이 스스로 스크롤되지 않을 때. PDF 쪽 보기에서 쪽이 화면보다 크면 쪽 안을 스크롤하고, 쪽 끝(처음)에 닿은 뒤 한 번 더 밀면 다음(이전) 쪽으로 넘어갑니다(2026-10-18). 연속 보기는 스크롤로 문서 전체를 이동합니다.
- EPUB·MD·변환 문서의 두 손가락 확대는 움직이는 동안 화면을 바로 확대하고, 손을 떼면 새 글자 크기/배율로 다시 배치합니다.
- 메뉴·알림 문구는 한국어/영어를 지원합니다(보기 설정 → 언어, 기본은 시스템 언어). Java 오류는 `native.*` 키로 전달해 화면 언어로 표시합니다.

### 다른 앱과 클라우드에서 열기 (0.1.3)

- EPUB·PDF·Markdown 파일의 **다른 앱으로 열기** 또는 **공유** 목록에서 Mins Reader(이전 이름 Mins EPUB Viewer)를 선택할 수 있도록 등록했습니다.
- 앱이 꺼져 있으면 시작 후 문서를 열고, 이미 실행 중이면 새 문서로 받습니다. 여러 파일 공유도 순서대로 처리합니다.
- 일부 메신저의 일반 파일 형식(`application/octet-stream`, ZIP)도 받되, 실제 파일 이름은 EPUB/MD/Markdown/TXT인지 확인합니다. 텍스트 메시지 공유는 파일 가져오기로 처리하지 않습니다.
- Google Drive 등 Android 문서 제공자는 **파일 열기 → 제공자 선택**으로 접근할 수 있습니다. 최초 열기는 네트워크가 필요할 수 있습니다.
- 가져온 문서는 앱 내부 사본입니다. 이후 **이어 읽기**에서 EPUB·MD 읽던 위치를 복원하고 오프라인에서도 읽습니다. 클라우드 원본과 자동 동기화하지 않으며 다른 공유 URI로 다시 받으면 별도 사본이 될 수 있습니다.
- 메신저·Drive의 실제 선택 목록과 URI 권한 전달은 실기기 검증이 필요합니다.

### 모바일 읽기 조작 (0.1.2)

- **파일 열기**는 EPUB/Markdown을 함께 선택합니다. **이어 읽기**는 최근 파일, **열린 문서**는 탭 대신 문서 목록을 표시합니다.
- **☰ 메뉴**에서 새 Markdown 문서 만들기, 목차·책갈피, 읽기 설정, 편집·저장·내보내기를 사용합니다.
- **전체 화면**은 상하단 도구와 Android 시스템 표시줄을 숨깁니다. 본문 가운데 터치 또는 Android 뒤로 가기로 도구를 복원합니다. 전체 화면 사용 여부는 저장됩니다.
- 메뉴의 **전체 화면 진행 표시**는 작은 읽기 위치 표시를 켜고 끕니다. 기본값은 꺼짐입니다.
- 두 손가락을 벌리거나 오므리면 글자 크기(10–42)를 안내하고, 손을 떼면 반영합니다. EPUB·MD 문서별로 저장되며 새 문서는 마지막 사용 크기로 시작합니다.
- 페이지 이동·문서 전환·재실행 후에도 글자 크기와 읽던 위치를 복원합니다. 이미지로만 구성된 책과 고정 레이아웃 EPUB의 이미지 속 글자는 재조판할 수 없습니다.
- 모바일 본문 높이에 남아 있던 PC용 56px 차감을 제거했습니다.

- 시스템 파일 선택기(SAF)로 EPUB 또는 MD/Markdown/TXT 파일 하나를 선택합니다.
- 선택한 파일을 앱 내부 보관함으로 복사합니다. 외부 파일 전체 접근 권한은 요청하지 않습니다.
- 같은 URI를 다시 선택하면 기존 앱 사본을 엽니다. 2026-11-03부터는 원본이 더 새롭고 사본에 자체 수정이 없으면 다시 가져옵니다.
- 이름이 같은 서로 다른 URI의 문서는 별개로 보관합니다.
- 최근 파일 목록은 최대 50개이며, 목록에서 밀려난 사본을 자동 삭제하지 않습니다.
- **사본 저장**은 앱 내부 Markdown 파일을 저장하고, 파일 선택으로 연 문서는 원본에도 저장합니다(2026-11-03부터. 원본이 다른 곳에서 바뀌었거나 쓸 권한이 없으면 사본만 저장하고 알림).
- **파일로 내보내기**는 Android 저장 창을 열어 외부에 파일을 만듭니다. 취소·실패 시 저장 완료로 처리하지 않습니다.
- EPUB 주석과 EPUB→MD 내보내기도 Android 저장 창을 이용합니다.
- 가져오기 제한은 EPUB 512MB, Markdown 16MB입니다. 내보내기는 UTF-8 기준 16MB까지입니다.
  EPUB은 저장소에서 압축을 풀고 필요한 장과 이미지만 읽습니다. 압축 해제 합계는 2GB, 개별 항목은 256MB까지이며 기기별 렌더링 성능은 별도 확인이 필요합니다.
- EPUB 전체를 웹 화면 메모리로 전달하거나 모바일에서 전체 위치 목록을 미리 생성하지 않습니다.
- EPUB 페이지 모드에서는 좌/상 방향 스와이프로 다음, 우/하 방향으로 이전 페이지로 이동합니다.
  본문 상단 1/3 터치는 이전, 하단 1/3 터치는 다음입니다. 아래 고정 버튼도 사용할 수 있습니다.
  가운데 터치와 길게 누르기는 선택·형광펜 조작에 남겨 둡니다. 연속 스크롤 모드에서는 기본 스크롤을 사용합니다.
- 읽기 기록은 앱 내부 JSON 파일에 원자적으로 교체 저장합니다. 저장 작업은 순차 처리하며 실패 시 재시도할 수 있습니다.
- 마지막 문서, EPUB CFI, Markdown 스크롤 위치를 복원하며, 최근 파일 메뉴에서 다시 열 때도 읽던 위치를 사용합니다. 수정한 Markdown 초안은 변경 후 약 600ms와
  백그라운드 전환 시 보관합니다. 저장 직전의 강제 종료나 저장 공간 부족까지 무손실을 보장하지는 않습니다.
- 앱 삭제 또는 앱 데이터 초기화 시 앱 내부 사본과 읽기 기록이 사라질 수 있으므로 중요한 MD는 외부로 내보내세요.

## 검증

```powershell
npm.cmd test
npm.cmd run test:reader
npm.cmd run test:pdf
npm.cmd run android:sync
```

`test:reader`의 PDF 단계는 `dist/mobile/vendor/pdfjs/`를 사용하므로 먼저 `npm.cmd run build:mobile` 또는 `android:sync`를 실행합니다.

- 공통 로직과 모바일 파일 입력/저장 큐 테스트
- Chromium 비표시 창에서 412×860 크기로 EPUB·MD 열기와 위치 복원 검사
- 미저장 Markdown 초안 복원, 닫기 취소/버리기, 패널 및 뒤로 가기 검사
- 실제 Chromium 터치 이벤트로 상하단 탭·네 방향 스와이프·고정 버튼·책갈피 검사
- 두 손가락 확대·축소, EPUB/MD 글자 크기 복원, 전체 화면과 가운데 터치, 본문 높이·메뉴 표시 검사 (Android 시스템 표시줄은 실기기 확인 필요)
- 파일을 닫고 재시작한 뒤 최근 파일 메뉴에서 EPUB·MD 위치 복원 검사
- Android Java 단위 검사: 70MiB ZIP 스트리밍 압축 해제·캐시 재사용·경로 별칭·압축 경로 이탈 방지·책 식별자 호환성
- 모바일 웹 자산 빌드 및 Android 프로젝트 동기화

`test:reader`는 **모의 플랫폼 연결부를 사용**합니다. Android 플러그인, SAF, 실제 WebView 검증을 대신하지 않습니다.
검사 화면은 `build/mobile-smoke.png`, `build/mobile-epub-smoke.png`에 생성됩니다.

2026-09-26에 JDK 21과 Android SDK를 설치하고 `npm.cmd run android:apk`로
**Java/Gradle 컴파일 및 디버그 APK 생성을 완료**했습니다(과거 기록). 실기기 동작 검증은 휴대폰 연결 후 진행합니다.

2026-10-17 PDF·다국어 변경은 `android:sync`와 모의 연결부 `test:reader`(PDF URL 열기·탭 이동·재실행 복원 포함)까지만 확인했습니다.
2026-10-17 같은 날 이 PC에 `setup-android.ps1`로 JDK 21(Temurin 21.0.12)과 SDK를 설치한 뒤 `npm.cmd run android:apk`로
**디버그 APK 생성(8.0MB, PDF.js 자산 포함)과 `gradlew testDebugUnitTest`(Java 5개) 통과를 확인**했습니다. 실기기 동작은 아직 확인하지 않았습니다.

설치 스크립트 참고: Windows PowerShell 5.1은 sdkmanager의 stderr 경고를 오류로 처리하고, 파이프로 넘긴 `y` 응답을 `.bat`에 전달하지 못합니다.
스크립트는 이를 피하려고 응답 파일을 `cmd.exe` 입력으로 넘기고, 선택한 패키지(`--install`)의 라이선스만 동의합니다.
빌드 스크립트는 `NoDefaultCurrentDirectoryInExePath` 환경에서도 동작하도록 `.gradlew.bat`를 명시합니다.

## 실기기에서 이어서 확인할 항목

1. 다운로드·클라우드 문서 제공자에서 파일 선택, 취소, 잘못된 형식, 크기 제한
2. EPUB 목차·페이지 이동, 형광펜·메모, 이미지 확대와 Android 뒤로 가기
3. 앱 재시작과 백그라운드 종료 후 문서·위치·Markdown 초안 복원
4. 한글 입력, 선택·복사, 키보드 표시 및 화면 회전
5. 저장 창 취소, 외부 내보내기 실패, 저장 공간 부족 시 데이터 보존
6. 그림 많은 EPUB, 긴 Markdown, 태블릿 화면 및 시스템 글자 크기
7. PDF: 선택기·다른 앱 공유로 열기, 대용량/한글(CMap) PDF, 두 손가락 확대, 텍스트 선택 후 형광펜, 재실행 위치 복원, 오래된 WebView의 legacy 빌드 동작
8. 영어 시스템 언어에서 메뉴·오류 문구, 앱 표시 이름 Mins Reader

## 후속 범위

- 휴대폰 전용 메뉴 재구성, EPUB 스와이프와 텍스트 선택 충돌 조정
- MD 상대경로 이미지 폴더 접근 (현재 폴더 가져오기 없음; 포함된 data URL 이미지와 접근 가능한 웹 이미지 사용)
- 보관함 삭제·원본 다시 가져오기 UI, PC와의 데이터 이동/동기화
- 대용량 Markdown 초안 저장 비용 최적화, 기기별 메모리 측정
- 배포용 앱 아이콘·서명·스토어 준비

참고: [Capacitor 환경 설정](https://capacitorjs.com/docs/getting-started/environment-setup),
[Android 문서 접근](https://developer.android.com/training/data-storage/shared/documents-files).
