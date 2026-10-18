# 다른 PC에서 이어서 작업하기

최종 갱신: 2026-10-18 (한국 시간)

## 먼저 읽을 문서

1. 저장소 루트 `AGENTS.md`: 모든 PC에서 적용할 작업 및 기록 규칙.
2. 이 문서: 현재 상태, 환경과 재개 절차.
3. [NEXT_TASKS.md](NEXT_TASKS.md): 다음 작업과 미검증 항목.
4. [WORK_LOG.md](WORK_LOG.md): 실제 작업과 검증 이력.
5. [ANDROID.md](ANDROID.md): Android 구조, 빌드, 설치, 데이터 정책.
6. [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md): 초기 계획 및 이후 방향.

## 현재 상태

- 저장소: https://github.com/moviego1004/minsepubviewer.git
- 이번 인수인계 대상 브랜치: `master`. 정확한 커밋은 `git log -5 --oneline`으로 확인한다.
- 앱 이름은 **Mins Reader**(이전 Mins EPUB Viewer). `appId` `com.mins.epubviewer`와 PC 기존 사용자 데이터 폴더는 유지한다.
- EPUB, Markdown에 더해 **PDF**(PDF.js 6.3.289)를 읽는다. 툴바의 **파일 열기** 하나로 세 형식을 연다. 메뉴·알림은 **한국어/영어** 지원(보기 설정 → 언어).
- Electron Windows 앱과 Capacitor Android 앱이 `web/`, `src/core/`를 공유한다. 실제 UI는 순수 JavaScript 기반이며 초기 계획의 React는 현재 구현이 아니다.
- EPUB/Markdown 열기, 읽기 설정, 위치 복원, 책갈피/주석, Markdown 편집 및 내보내기 코드가 있다.
- PDF: `web/pdf-reader.js`(PDF.js 뷰어 래퍼), `src/core/pdfLocation.js`(위치·형광펜 좌표 문자열). 이어보기(쪽·배율·위치), 목차, 검색, 책갈피, 형광펜/메모(앱 내부 저장, 원본 미수정), 테마, 두 쪽 보기, 회전, PC 전체 화면(F11).
- 다국어: `src/locales/ko.js`, `en.js`(키 일치 테스트), `web/i18n.js`(`data-i18n` 적용). Electron 대화상자와 Android Java 오류(`native.*` 키)도 같은 사전을 쓴다.
- 변환 문서(읽기 전용): DOCX(mammoth 1.13.0), HWPX·XML HWP(자체 변환기 `src/core/hwpXml.js`, 텍스트·표), 바이너리 HWP 5.0(PC는 Electron 메인 프로세스의 `@ohah/hwpjs@0.1.0-rc.10` 네이티브 모듈로 쪽 배치 재현, Android와 브라우저는 자체 모듈 `src/core/hwpBinary.js`로 본문·표·각주만). 뷰어는 `web/document-reader.js`(스크립트 없는 iframe), 위치·형광펜은 `src/core/textAnchors.js`.
- 배포 축소: PC 패키지는 필요한 파일만 넣고(Electron 언어 ko·en만, PDF.js min, HWP는 Windows용 `.node`만), Toast UI는 devDependency로 옮겼다. 사용자 샘플 `test/sample/`은 Git 제외.
- iOS는 Mac/Xcode가 없어 보류.
- 휴대폰 두 손가락 확대: EPUB·MD·변환 문서는 움직이는 동안 화면을 바로 확대(transform)하고 손을 떼면 글자 크기/배율로 다시 배치, PDF는 `PdfReader.pinchZoom`(PDF.js `updateScale`)으로 실시간 확대. 공통 제스처는 `src/platform/touch-reader.js`의 `pinch: { begin, move, end }`.
- Android에는 네이티브 문서 가져오기/저장, 다른 앱의 열기/공유 수신, 앱 내부 사본과 상태 저장, 모바일 메뉴/전체 화면/터치 조작이 구현되어 있다.
- 버전과 배포 파일(2026-10-17 사용자 지시): PC와 Android는 한 버전을 쓴다(`package.json` version = Android versionName, versionCode는 빌드마다 +1). 배포 파일을 만들 때마다 마지막 자리를 1씩 올리고 `build/MinsReader_ver<버전>.exe`(PC 설치 파일), `build/MinsReader_ver<버전>.apk`로 저장한다. 명령: `npm.cmd run release`(둘 다), `release:pc`(=`makeSetup.bat`), `release:android`. 실패하면 버전을 되돌린다. 개발용 `npm.cmd run build`/`android:apk`는 버전을 올리지 않는다. 현재 0.1.5(versionCode 6).
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
npm.cmd run android:apk
# 선택: USB 디버깅 기기 설치
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
