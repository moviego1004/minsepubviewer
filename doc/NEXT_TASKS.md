# 다음 작업

최종 갱신: 2026-11-03 (다른 PC 재개 절차는 HANDOFF.md "최신 상태와 재개 절차")

전체 요구사항·개발 방안·로드맵은 [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) 5장 "앞으로 할 일"을 기준으로 한다.

## 현재 요청 — 0.1.12 기록 + M9 원본 쪽 보기 (진행 중, 2026-11-03)

- 사용자 요청: "작업 계획 중 1, 3 진행하고 커밋, 푸시 해줘" — 1 = 미커밋 0.1.12 버전 올림 기록·커밋, 3 = M9 원본 쪽 보기(DEVELOPMENT_PLAN 5.1 C-1 → C-2).
- 1 완료: 0.1.12(versionCode 13, 2026-11-02 16:04 빌드, M7·M8·HWPX 그림 포함) 버전 파일과 문서 커밋.
- 3 계획: C-1 먼저 — 이 PC에 Rust(`~/.cargo/bin`)가 있음. hwpjs 소스를 받아 스레드 없는 `wasm32` 대상으로 `toHtml` 빌드가 되는지, 크기·Android WebView 동작을 시험. 되면 휴대폰 보기 메뉴에 "원본 쪽 모양" 전환(기본은 재배치 유지). 안 되면 C-2(PARA_LINE_SEG 자체 쪽 배치) 범위를 다시 제안.
- 보류(사용자와 더 논의): XLSX·PPTX 지원 여부 — 다른 앱이 많아 할지 말지부터 논의.

## 현재 요청 — 휴대폰 HWP 원본 서식 표시 (1단계 구현, 실기기 확인 대기, 2026-11-01)

- 사용자 요청: 휴대폰에서 HWP 내용은 보이지만 원본 서식(글꼴, 색상 등)과 많이 다르다. 원본 서식대로 보여 줄 수 없는지.
- 판단: 원본 쪽 배치(PC와 동일) 재현은 지금 불가 — `@ohah/hwpjs`의 Android 사전 빌드(`node_modules/@ohah/hwpjs/android/.../libhwpjs-prebuilt.a`)는 React Native용이고 toJson/toMarkdown만 있으며 toHtml이 없음. 공개 WASM은 공유 메모리(SharedArrayBuffer) 필요. 그래서 제안 1단계(자체 해석기에 DocInfo 서식 적용)를 진행.
- 완료: 글꼴(한글·영문 글꼴 이름 + 명조/고딕 대체), 글자 크기, 굵게·기울임·밑줄·취소선·위/아래 첨자, 글자 색, 음영(글자 배경), 자간 / 문단 정렬·왼쪽/오른쪽 여백·들여쓰기/내어쓰기·문단 위/아래 간격·줄 간격(%·고정), 문단 배경색 / 표 칸 너비 비율·안쪽 여백·세로 정렬·테두리(선 종류·굵기·색)·칸 배경색. 다크 테마는 원본 색을 밝게 그린 뒤 반전.
- 남은 일(제안, 미착수): 그림(BinData), 자동 번호·글머리표(가., 1)), 머리말·꼬리말, 장평(글자 폭), 문단 테두리. HWPX·XML HWP(`hwpXml.js`)에도 같은 서식 적용. 휴대폰 실기기에서 실제 문서 확인(사용자, `build/MinsReader_ver0.1.10.apk`).

## 현재 요청 — 실패하던 화면 시험 2개 + HWPX 그림 (완료, 2026-11-02)

- 사용자 요청: "xml 형식은 test 폴더 밑에 트러스트기획_화주 중심 무역 증빙 관리 서비스.hwpx 로 넣어 놨어. 실패하는 것과 xml 형식 hwp 보이기부터 진행해줘. 다되면 커밋, 푸시해줘". 엑셀·PPT는 사용자가 나중에 다시 검토하기로 함(보류).
- 확인: 받은 파일은 보통 HWPX(ZIP 안 XML)이며 `.gitignore`(`test/*.hwpx`)로 커밋 제외. M8로 서식은 이미 표시되고, 빠진 것은 그림 1개(서비스 구성도)뿐이었음 → HWPX 그림 표시 추가. (HWPML 단일 XML 파일은 여전히 시험 파일 없음.)
- 완료: `src/core/hwpXml.js` `owpmlImagePaths`·`hp:pic` 처리, `web/document-convert.js` 그림 data URL, `web/document-reader.js` `.hwp-figure`. `test:documents`: 검색 후 위치를 기대하던 잘못된 단계 수정 + HWPX 그림 확인. `test:reader`: 전체 제한 90초 → 180초(실제 소요 약 100~107초).
- 남은 일: `test:reader` 실행 중 가끔(6번 중 1번) epub.js 콘솔 오류 `Cannot read properties of undefined (reading 'bounds')` — 공유 Markdown을 보다 EPUB을 다시 열 때. 압축 안 된 epub.js로 5번 재현 시도했으나 재현 안 됨, 원인 미확정. 2026-09-28 기록(HANDOFF)에도 같은 오류가 있었던 오래된 문제.
- 다음(제안): 실기기 확인용 새 빌드(0.1.12) → M9 원본 쪽 보기(사용자 결정). XLSX·PPTX는 보류.

## 이전 요청 — M7 HWP 기호(PUA) 대응 (완료, 2026-11-02)

- 사용자 요청: "반영해서 푸시하고 M7 진행해줘"(사용자가 직접 빌드한 0.1.11 버전 올림은 `704fc1a`로 커밋·푸시). 함께 받은 질문: 오피스 파일 중 엑셀·PPT도 볼 수 있는지 → 지금은 못 봄(아래 제안).
- 조사: PC의 실제 HWP/HWPX 92개 중 변환되는 58개에서 사설 영역 문자는 13개 문서에 있었고 두 종류뿐(U+F0xx 기호 글꼴 문자, U+F0000대 한컴 확장 영역). 옛한글(한양 PUA)은 없었음.
- 완료: `src/core/hwpSymbols.js`(기호 글꼴 표 5개, 한컴 표 245자, `symbolHtml`, `symbolFontTable`, `symbolFontRange`), `hwpBinary.js`(7개 언어 글꼴 읽기, 글자 모양별 기호 표), `hwpXml.js`(HWPX·HWPML 글자에 적용), `web/document-reader.js`(`.hwp-sym` 테두리 글자, 기호 글꼴 `@font-face`), `scripts/build-mobile.js`·`package.json`(Noto Sans Symbols 2 기호 부분 글꼴 동봉).
- 사용자 확인 필요: 실기기. 변환 결과는 한컴 화면과 직접 비교하지 못함(한컴 글꼴의 글자 모양과 문맥으로 판단).
- 하지 않은 것: 옛한글(한양 PUA → 첫가끝 자모, 공개 표 KTUG Hanyang PUA Table), 한컴 확장 영역의 나머지 기호(문서에서 본 적 없는 것), DOCX 글머리표 표 통합.
- 제안(미착수): **XLSX 읽기 전용 보기** — SheetJS 등으로 시트를 HTML 표로 바꿔 기존 변환 문서 뷰어에 표시(폴라리스 분석 6항). **PPTX**는 슬라이드 모양 재현 비용이 커서 후순위(우선 글자·그림만 슬라이드별로 보여 주는 방식 검토 가능). XLS/PPT(옛 이진 형식)는 더 어려움.
- 다음(제안 순서): XLSX 보기(사용자 결정) → XML HWP 서식(시험 파일 확보 시) → M9 원본 쪽 보기(사용자 결정). 기존 실패 `test:reader`(Markdown 최근 파일 단계)·`test:documents`(DOCX 위치 복원 단계, 이번 변경 없이도 3/3 실패) 원인 조사도 후보.

## 이전 요청 — M8 HWPX 서식 (완료, 2026-11-02)

- 사용자 요청: "M8 진행해줘"(계획 M8).
- 범위: HWPX(`Contents/header.xml`)의 글꼴·글자 모양(`charPr`)·문단 모양(`paraPr`)·테두리/배경(`borderFill`)을 이진 HWP와 같은 방식(`.hcN`/`.hpN`/`.hbN` 클래스, M1 글꼴 대체, M2 나눔 글꼴)으로 적용. 표 칸 너비 비율·안쪽 여백·세로 정렬·테두리, 글상자(`drawText`) 글자도 이진 HWP와 맞춤.
- 제외: 그림, 각주·미주, 머리말·꼬리말, 자동 번호. XML HWP(HWPML)는 시험 파일이 없어 이번 범위에서 제외(제안 단계로 남김).
- 완료: `src/core/hwpXml.js` `readOwpmlHeader`·`convertOwpmlSection(document, styles)`, `web/document-convert.js`가 header.xml을 읽어 적용(못 읽으면 예전처럼 서식 없이). 단위 시험 2개, 문서 화면 시험에 HWPX 서식(빨간 굵은 제목·가운데 정렬·회색 칸) 확인 추가.
- 사용자 확인 필요: 실기기, 다양한 실제 HWPX(특히 글자 단위 여백 `unit="CHAR"`, 고정 줄 간격 — 확인한 파일에 없어 적용하지 않음).
- 다음(제안 순서): M7 HWP 기호(PUA, 자료 조사 먼저) → XML HWP(HWPML) 서식(시험 파일 확보 시) → M9 원본 쪽 보기(사용자 결정). 기존 실패 `test:reader`(Markdown 최근 파일 단계 시간 초과) 원인 조사도 후보.

## 이전 요청 — M6 PDF 재배치 보기 (완료, `be3c242` 푸시, 2026-11-02)

- 사용자 요청: "pdf 진행해줘"(계획 M6).
- 완료: `src/core/pdfReflow.js`(PDF.js 글자 항목 → 줄 → 문단·제목·목록, 하이픈 이음, 한중일 줄 이음, 반복 머리글·쪽 번호 제거), `web/pdf-reader.js` `readPdfText`(뷰어 없이 쪽별 글자), `web/app.js` `openPdfReflow`/`togglePdfReflow`(PC 도구 막대 "재배치", 휴대폰 ☰ 메뉴). PDF와 같은 책 기록을 쓰고 위치는 PDF 쪽 위치로 저장해 두 보기가 같은 쪽에서 이어짐. 글자 없는 PDF는 `pdf.reflowNoText` 안내.
- 한계: 그림·표 모양·다단 읽기 순서는 재현하지 않음. 재배치 보기의 형광펜(문자 위치)은 원본 보기에, 원본 보기의 형광펜은 재배치 보기에 나타나지 않음.
- 사용자 확인 필요: 실제 PDF(논문·보고서·다단)에서의 문단 나눔, 실기기.
- 다음(제안 순서): M8 HWPX 서식 → M7 HWP 기호(PUA, 자료 조사 먼저) → M9 원본 쪽 보기(사용자 결정).

## 이전 요청 — M5 DOCX 서식 보기 (완료, 2026-11-02)

- 사용자 요청: 지금까지 변경 커밋 → 계획 이어서 진행 → 테스트 통과 시 커밋·푸시.
- 완료: DOCX를 `docx-preview` 0.4.1로 변환(글꼴·색·문단·표·글머리표). PC는 쪽 모양(`layout: true`), 휴대폰은 쪽 크기·머리말·꼬리말 없이 화면 폭 재배치. 글꼴 이름 뒤에 M1 대체 목록(`withFontFallback`), Word Symbol 글머리표(U+F0B7 등)는 유니코드로. docx-preview 실패 시 mammoth.
- 주의: 변환기가 바뀌어 기존 DOCX의 형광펜(문자 위치)·위치가 한 번 어긋날 수 있다.
- 사용자 확인 필요: 실제 휴대폰에서 실제 DOCX 표시.
- 다음(제안 순서): M6 PDF 재배치 보기 → M8 HWPX 서식 → M7 HWP 기호 → M9 원본 쪽 보기(사용자 결정).

## 이전 요청 — 폴라리스 분석 모바일 반영 (M1~M4 완료, 2026-11-02)

- 사용자 요청: 폴라리스 분석을 모바일에 반영할 개발 계획을 세워 DEVELOPMENT_PLAN에 정리하고 차례대로 진행.
- 계획: [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) 5.1 "모바일 반영 계획" 표(M1~M9).
- 완료(자동 검증): M1 HWP 글꼴 대응표(`src/core/hwpFonts.js`), M2 나눔고딕·나눔명조 동봉(1.84MB, `web/document-reader.js`의 `@font-face`), M3 Android MIME `application/hangul`, M4 변환 문서 내용 판별(`src/core/documentSniff.js`, `web/document-convert.js`).
- 에뮬레이터 확인(2026-11-02, 사용자 지시로 `scripts/install_app_adb.py` 작성): API 36(WebView 133)에서 생성 HWP의 "바탕" 글꼴이 나눔명조로 표시되고 `.woff2`가 로컬 서버에서 제공됨. API 30(WebView 83)은 `||=` 문법 오류로 앱이 멈췄음 → 휴대폰 묶음 대상을 `chrome80`으로 낮춰 시작 오류는 해결. 그래도 WebView 83에서는 화면 배치가 깨지고 외부 열기 HWP가 안 열림(원인 미조사, 낮은 우선순위, [ANDROID.md](ANDROID.md) "오래된 WebView").
- 사용자 확인 필요: 다음 APK를 실제 휴대폰에 설치해 HWP 글꼴(명조/고딕/굵은 제목)이 나눔 글꼴로 보이는지. 이번 변경으로는 APK를 만들지 않았다(버전 0.1.10 그대로). 만들려면 `npm.cmd run android:apk`.
- 다음(제안 순서): ~~M5 DOCX 서식 보기~~(완료) → M6 PDF 재배치 보기 → M8 HWPX 서식 → M7 HWP 기호(PUA, 자료 조사 먼저) → M9 원본 쪽 보기(사용자 결정).
- 이 PC의 기존 문제(이번 변경과 무관, 변경 전 코드에서도 같은 단계에서 실패): `npm.cmd run test:reader`는 EPUB 쪽 넘김 후 위치 저장 대기에서, `npm.cmd run test:documents`는 DOCX 위치 복원(스크롤 1466) 대기에서 시간 초과. 원인 미조사.

## 현재 요청 — 폴라리스 오피스 형식별 표시 방식 분석 (완료, 2026-11-02)

- 사용자 요청: REA로 폴라리스 오피스가 HWP 외 다른 문서 형식을 보여 주는 방식을 분석·정리. 코드 변경 없음.
- 결과: [POLARIS_OFFICE_FORMATS.md](POLARIS_OFFICE_FORMATS.md). C++ 엔진 하나(워드 Bwp·Sheet·Pdf 모듈)가 모든 형식을 비트맵으로 그려 SurfaceView에 표시, 슬라이드 쇼만 OpenGL. 보기 방식은 쪽 그대로/연속/여백 없이/휴대폰 재배치, PDF는 xpdf + 자체 렌더러 + 재배치 모드.
- 제안(미착수): DOCX "원본 모양 보기"(docx-preview 시험), PDF 재배치 보기(PDF.js getTextContent), 첫 바이트로 형식 판별, Android MIME `application/hangul` 추가 검토. XLSX/PPTX 추가는 우선순위 낮음.
- 미검증: Java 디컴파일(JADX 미설정), 엔진 함수 분석, 실기기 화면.

## 현재 요청 — 폴라리스 오피스 APK 분석 (완료, 2026-11-02)

- 사용자 요청: REA로 `test/PolarisOffice.apk`를 분석해 휴대폰 HWP 표시 방식, PC 글꼴을 모두 넣었는지 정리(doc 폴더). 코드 변경 없음.
- 결과: [POLARIS_OFFICE_ANALYSIS.md](POLARIS_OFFICE_ANALYSIS.md). C++ 엔진이 직접 쪽 배치·비트맵 그리기. 한글 본문 글꼴은 엔진 안의 나눔고딕 하나뿐이고 PC 한글 글꼴(함초롬·휴먼·HY 본문)은 없다. 기호(HY 윙딩/심볼)·수식(HyhwpEQ, STIX)·Office 영문 5종만 넣고, 나머지는 기기 글꼴과 이름 대응표로 대체.
- 제안(미착수): 로드맵 A를 이 결과에 맞춰 진행 — 고딕·명조 무료 글꼴 부분 글꼴 동봉, 분석 문서 3.3의 별칭을 참고한 대응표, HWP PUA 기호를 유니코드로 바꾸는 표, 영문은 Liberation 글꼴 검토.
- 미검증: Java 디컴파일(JADX 미설정), 엔진 함수 분석, 실기기 화면 비교.

## 다음에 이어서 할 일 — HWP 원본 모양 재현 (사용자 결정 대기, 2026-11-01)

사용자 논의: 글꼴 때문에 한계가 있음, 폴라리스 오피스 같은 방식(자체 엔진)은 왜 어려운지. 결론과 진행 순서는 [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) 5.1의 "원본 모양 재현 로드맵" 참고. 요약:
1. A. 무료 한글 글꼴 동봉 + 글꼴 대응표(추천, 먼저). 먼저 사용자 문서의 글꼴 이름 집계.
2. C-1. hwpjs를 공유 메모리 없는 WASM으로 직접 빌드(Rust 설치 필요)해 휴대폰 "원본 쪽 모양 보기" 시험.
3. C-2. 안 되면 PARA_LINE_SEG로 자체 쪽 배치.
- 확인 필요(사용자): `build/MinsReader_ver0.1.10.apk` 실기기에서 HWP 서식 표시. 원본 비교용으로 같은 문서의 한글 PDF 내보내기 파일이 있으면 좋음.
- 재개 방법: AGENTS.md와 doc/HANDOFF.md·NEXT_TASKS.md·WORK_LOG.md·DEVELOPMENT_PLAN.md를 읽고 "HWP 원본 모양 재현 로드맵 A부터 진행" 요청.

## 제안 단계 — 휴대폰 HWP 표시 품질 (2026-10-18 제안 → 2026-11-01 1단계 진행)

사용자 질문: PC와 휴대폰의 HWP 모습이 많이 다른데 어쩔 수 없는지(의견만, 코딩 안 함).
답변 요지: 휴대폰은 자체 해석기(텍스트·표)라 차이가 남. ① 자체 해석기에 글자 모양·정렬·표 너비·그림·자동 번호 보강(추천) ② `@ohah/hwpjs`를 공유 메모리 없는 WASM으로 직접 빌드해 "원본 모양" 보기 추가(Rust 도구, 1~2일 시험) ③ 공개 WASM 그대로(불확실). 사용자가 방향을 정하면 진행.

## 현재 요청 — 일부 HWP만 "Failed to fetch" (원인 재현·수정 완료, 실기기 확인 대기, 2026-10-18)

사용자 요청(0.1.8 실기기): "내 파일"에서 열거나 앱 안에서 열어도 일부 HWP는 "Failed to fetch". 샘플 `test/202604_트러스트기획_분양트러스트 서비스 기획안_v0.5.hwp`(개인 문서, `.gitignore`로 제외).

결과:
- 원인(Electron Chromium에서 재현): 한글이 저장한 HWP 5.0은 압축된 본문 뒤에 CRC-32와 원래 크기(8바이트)를 붙인다. 브라우저 `DecompressionStream('deflate-raw')`은 이것을 압축 뒤 쓰레기 데이터로 보고 오류를 내며, Chrome은 이를 "Failed to fetch"로 표시. 실제 바이너리 HWP 5.0 샘플 3개 모두 실패했으므로 휴대폰에서 열린 "HWP"는 HWPX나 XML 형식이었을 것. Node의 zlib은 관대하고, 생성 시험 파일에는 이 꼬리가 없어 시험이 놓침.
- 수정: 압축 해제를 pako 1.0.11(MIT·Zlib, jszip이 이미 쓰는 판)의 `inflateRaw`로 교체. 필요할 때만 불러옴(PC는 `node_modules/pako/dist/pako_inflate.min.js`, Android는 `vendor/pako/`).
- 시험 보강: 생성 HWP에 한글과 같은 꼬리 추가(→ 모의 Android 스모크가 Chromium에서 실제와 같은 조건으로 검사).

남은 일:
- 사용자: `build/MinsReader_ver0.1.9.apk`로 같은 HWP 파일 열기 확인.

## 현재 요청 — 다른 앱에서 열기 시 "Failed to fetch" (수정·빌드 완료, 실기기 확인 대기, 2026-10-18)

사용자 요청(0.1.7 실기기): "내 파일"에서 HWP를 열기 → 앱 목록에 Mins Reader가 보이는 것은 맞음(카톡·메일 첨부도 같아야 함). 그런데 열면 "Failed to fetch"만 뜸. 모든 형식 확인.

결과:
- 원인(코드 분석, 실기기 재현은 못 함): 앱 사본을 WebView가 `fetch(convertFileSrc(path))`로 읽는데, Capacitor 로컬 서버는 확장자로 콘텐츠 형식을 정하며 `.hwp`/`.hwpx`는 형식을 몰라 요청이 실패. 앱 안 "파일 열기"도 같은 경로라 함께 실패했을 것.
- 수정: 변환 문서(DOCX·HWP·HWPX)와 Markdown/TXT 사본은 플러그인 `readDocument`로 직접 읽음(base64). PDF·EPUB은 형식이 알려진 URL 경로 유지.
- 열기/공유 목록: MIME 추가(`application/hwp`, `application/x-hwpx`, `application/vnd.hancom.hwpml`, `application/x-zip-compressed`, `application/x-pdf`). 이미 `application/octet-stream`도 받으므로 형식을 모르는 메신저 첨부도 목록에 나타남(실제 파일 이름으로 형식 확인).

형식별 다른 앱에서 열기 경로: EPUB(사본 압축 해제 후 URL), PDF(URL, application/pdf), DOCX·HWP·HWPX·MD·TXT(플러그인 직접 읽기).

남은 일:
- 사용자: `build/MinsReader_ver0.1.8.apk`로 "내 파일"·카톡·메일에서 HWP·HWPX·DOCX·PDF·EPUB·MD 열기 확인. 카톡·메일 목록에 Mins Reader가 안 보이는 형식이 있으면 앱과 파일 형식을 알려 주면 MIME 추가.

## 현재 요청 — 스크롤(밀기)로도 쪽 이동 (구현·검증 완료, 사용자 실기기 확인 대기, 2026-10-18)

사용자 요청(0.1.6 실기기): 위·아래 탭뿐 아니라 스크롤로도 쪽이 넘어가야 함. PDF는 스크롤로 이동이 안 됨. 다른 형식도 확인해서 수정.

형식별 확인 결과:
- PDF 쪽 보기: 쪽이 화면에 다 들어오면 밀기로 넘어갔지만, 쪽이 화면보다 조금이라도 크면(휴대폰 쪽 너비 맞춤에서 흔함) 밀기가 쪽 안 스크롤만 하고 끝에서 멈춤 → **수정**: 쪽 끝(또는 처음)에 닿은 상태에서 계속 밀면 다음(이전) 쪽. 옆으로 다 보이는 쪽은 좌우 밀기도 같음.
- PDF 연속 보기, EPUB 연속 보기, MD, 변환 문서 연속 보기: 일반 스크롤로 문서 전체를 이동(문제 없음, 이번에 자동 검사 추가).
- EPUB 쪽 보기, 변환 문서(DOCX·HWP) 쪽 보기: 밀기로 쪽 이동(문제 없음, 변환 문서 검사 추가).

남은 일:
- 사용자: `build/MinsReader_ver0.1.7.apk` 실기기 확인(PDF 쪽 끝에서 계속 밀기, 쪽 중간에서는 스크롤만).

## 현재 요청 — 터치 구역, PDF 탭 넘김, 열린 문서 창, 빌드 규칙 (구현·검증 완료, 사용자 실기기 확인 대기, 2026-10-18)

사용자 요청(0.1.5 실기기 테스트):
1. 아래쪽을 눌러 다음 쪽을 기대했는데 전체 화면이 켜지거나 꺼짐. 형광펜을 쓰려고 가운데를 누르면 전체 화면이 전환됨 → 쪽 넘김과 전체 화면을 사용자 중심으로 구분.
2. PDF는 화면 위·아래 탭으로 쪽이 넘어가지 않음.
3. 열린 문서 창: 위 "닫기"(창 닫기)와 문서 옆 "닫기"(문서 닫기)가 같은 글자라 헷갈림 → 아이콘 등으로 보기 좋게.
4. 빌드 경로와 버전 번호 규칙을 지키고 빌드 스크립트에 반영.

결과(상세는 WORK_LOG 2026-10-18 두 번째 항목):
1. 원인: 연속 스크롤 화면, MD, 그리고 쪽이 화면보다 큰 PDF에서는 위·아래 탭이 꺼져 있어 모든 탭이 가운데 탭(전체 화면 전환)으로 처리됨. → 위·아래 1/3 탭은 모든 보기 방식에서 쪽 이동(스크롤 화면은 한 화면씩), 가운데 한 번 탭은 동작 없음(선택·형광펜용), 가운데 **두 번 탭**만 전체 화면 전환. 전체 화면에 들어갈 때 처음 3번은 해제 방법 안내.
2. PDF 탭은 `PdfReader.step`: 확대해서 쪽이 화면보다 크면 쪽 안에서 한 화면씩 스크롤, 쪽 끝에서 다음 쪽(이전은 앞 쪽의 끝으로).
3. 열린 문서 창: 제목 "열린 문서" + 오른쪽 위 ✕ 아이콘(창 닫기), 문서마다 형식 표시(EPUB·PDF·HWP·MD 색 배지)·이름(길면 말줄임)·작은 ✕ 아이콘(이 문서 닫기), 지금 보는 문서 강조. 메뉴 창도 같은 머리말.
4. 모든 빌드 명령(`build.bat`, `makeSetup.bat`, `npm run build`, `release*`, `android:apk`)이 `scripts/release.cjs`를 거쳐 버전 +1, `build/MinsReader_ver<버전>.exe/.apk`로 저장. `build/`에 있는 기존 배포 파일보다 낮거나 같은 번호는 쓰지 않음. 결과 파일 이름·위치를 빌드 끝에서 검사. `android:install`은 가장 높은 버전 APK 설치.

남은 일:
- 사용자: `build/MinsReader_ver0.1.6.apk` 실기기 확인(위·아래 탭, 가운데 두 번 탭, 가운데 길게 눌러 형광펜, PDF 탭 넘김, 열린 문서 창).
- `build/`에 이전 규칙 이름 파일(`MinsEpubViewer-0.1.0...-setup.exe`, `MinsEPUBViewer-Android-0.1.3-debug.apk`)이 남아 있음. 사용자 파일이라 삭제하지 않았음.

## 현재 요청 — 휴대폰 테스트 문제 3건 (구현·검증 완료, 사용자 실기기 재확인 대기, 2026-10-18)

사용자 요청(0.1.4 APK 실기기 테스트 결과):
1. 두 손가락 확대·축소가 손가락을 움직이는 동안 반영되지 않고, 글자 크기 알림만 보인 뒤 손을 떼야 적용됨 → 움직이는 동안 바로 확대·축소.
2. PDF가 확대·축소되지 않음.
3. HWP, HWPX가 열리지 않음.

결과(상세는 WORK_LOG 2026-10-18):
1. EPUB·MD·변환 문서: 손가락을 움직이는 동안 화면을 그 비율로 바로 확대·축소하고(CSS transform, 손가락 사이가 기준점), 손을 떼면 새 글자 크기/배율로 다시 배치. 글자 크기 알림 상자는 제거.
2. PDF: PDF.js가 두 손가락 확대를 직접 처리하지 않아(앱용 TouchManager는 뷰어 라이브러리 밖) 앱이 `PDFViewer.updateScale({ scaleFactor, origin, drawingDelay })`로 손가락 위치 기준 실시간 확대, 잠시 뒤 선명하게 다시 그림.
3. HWP 5.0: 휴대폰용 자체 읽기 모듈 `src/core/hwpBinary.js`(OLE 복합 파일 + 레코드 해석, 본문·표·병합 칸·글상자·각주). 쪽 배치·이미지·글꼴은 제외. PC는 계속 쪽 배치를 재현하는 `@ohah/hwpjs` 사용.
   HWPX: 코드 경로는 정상이며 실기기에서 실패한 원인은 오류 문구 없이 확인 불가 → 모의 Android 스모크에 HWPX 단계를 추가해 열림 확인. 실제 HWPX 파일에서 실패하면 화면의 오류 문구와 파일(가능하면)을 받아 재현해야 함.

남은 일:
- 사용자: `build/MinsReader_ver0.1.5.apk`로 실기기 확인(핀치 확대 EPUB·MD·PDF·DOCX/HWP, HWP 5.0과 HWPX 열기).
- HWP 5.0 휴대폰 변환에서 빠지는 것: 쪽 번호, 자동 문단 번호(가., 1) 등), 머리말·꼬리말, 그림. 필요하면 DocInfo의 문단 번호 정의 해석을 추가.
- 암호·배포용 HWP는 안내 문구만 표시.

## 현재 요청 — 오피스·한글 문서 지원과 배포 크기 축소 (구현·검증 완료, 사용자 테스트 대기, 커밋 전, 2026-10-17)

결과 요약: DOCX·HWPX·XML HWP는 PC·Android 공통, 바이너리 HWP 5.0은 PC만 지원. 상세와 수치는 WORK_LOG 2026-10-17 "오피스·한글 문서 지원" 참고.

남은 일:
- 사용자 테스트: PC 설치본(`build.bat`/`makeSetup.bat`)과 APK(`android/app/build/outputs/apk/debug/app-debug.apk`) 실사용 확인. 특히 실제 DOCX/HWPX 문서, 큰 HWP, 휴대폰 터치·확대.
- 실제 HWPX 파일 샘플로 변환 확인(지금은 규격 기반 생성 파일만 확인).
- Android HWP 5.0: `@ohah/hwpjs` 패키지에 React Native용 `android` 폴더가 있어 네이티브 연동 가능성 조사(공유 메모리 WASM 대신).
- 배포 크기의 대부분은 Electron 런타임. 크게 줄이려면 시스템 WebView2를 쓰는 셸(Tauri 등)로의 전환을 별도 과제로 검토.
- 기존 의존성 보안 경고: epubjs 내장 @xmldom/xmldom(<=0.8.14), Toast UI의 dompurify(<=3.4.15). 이번 작업에서 생긴 것은 아니며 미조치.


사용자 요청: 제안 순서대로 HWP·HWPX·DOCX 지원, 배포 파일 크기 축소 방안(공통 라이브러리 별도 받기 등) 검토·적용, 빌드·테스트 준비가 되면 알릴 것.

계획:
1. 변환 문서 뷰어(공통): 변환한 HTML을 스크립트 없는 iframe에 표시. 이어보기(스크롤 위치), 쪽 단위 이동, 검색, 책갈피, 형광펜·메모(텍스트 오프셋 기록), 확대, 테마, 한/영 문구. 원본 파일은 수정하지 않는 읽기 전용.
2. DOCX: mammoth 1.13.0 브라우저 번들(PC·Android). 필요할 때만 불러온다.
3. HWPX(OWPML zip)·HWPML(XML .hwp): 자체 XML 변환기, 텍스트·표 위주(이미지·쪽 배치 제외). HWPX 실제 파일 샘플은 없어 규격 기반 테스트만 가능.
4. HWP 5.0: PC는 Electron 메인 프로세스에서 @ohah/hwpjs 네이티브 모듈로 HTML 변환. Android는 공유 메모리 제약으로 이번에는 안내 문구만 표시.
5. 배포 크기: 현재 크기를 측정하고 PC(Electron 언어 파일, 불필요한 모듈 파일 제외, 최소화 빌드)와 Android(최소화된 PDF.js)를 줄인다. 실행 중 라이브러리를 내려받는 방식은 장단점을 비교해 보고한다.
6. 검증: 단위 테스트, 스모크 테스트, PC 패키지 빌드, APK 빌드. 실기기·설치본 테스트는 사용자가 진행.

## 현재 요청 — PDF 지원 범용 뷰어 "Mins Reader" (구현 완료, `fff1c45` 커밋·푸시)

사용자 요청(2026-10-17): EPUB/MD에 더해 PDF도 보는 범용 뷰어로 확장. PC(Windows)와 Android 먼저, iOS는 Mac이 없어 보류. 시작 시 `origin/master`와 로컬이 `39cef44`로 일치함을 확인했다.

사용자가 정한 사항:
- PDF 기능은 PDF.js(`pdfjs-dist`)가 제공하는 범위까지만 적용한다(렌더링, 페이지/연속 보기, 확대/맞춤, 회전, 텍스트 선택, 검색, 목차, 링크). 스캔본 영역 형광펜, OCR, 양식 저장, PDF 편집은 하지 않는다.
- 형광펜은 방식 B: 텍스트 레이어 선택 → 앱이 그리고 앱 내부에 저장(원본 PDF 미수정). 기존 색상/메모/책갈피/사이드바/내보내기와 연동한다.
- 모든 메뉴는 다국어 지원, 최소 한국어/영어.
- 앱 이름은 "Mins Reader". `appId`(`com.mins.epubviewer`)와 기존 데이터 경로는 유지한다.

단계:
0. `npm.cmd run test:reader`의 `bounds` 오류 진단/수정.
1. 다국어 기반: 공용 사전(ko/en), `data-i18n`, 시스템 언어 기본 + 설정 변경, Electron 대화상자, Android `strings.xml`, 키 일치 테스트.
2. PC PDF 뷰어: 열기/드롭/탭/최근 파일/파일 연결, PDF.js 뷰어 기능, 이어보기(페이지·배율), 전체 화면, 형광펜 B.
3. Android PDF: 선택/외부 열기·공유 수신, 앱 내부 사본, 터치·핀치, 전체 화면, 세션 복원.
4. 앱 이름 Mins Reader로 변경(데이터 경로 보존).
5. iOS: 보류(Mac 또는 클라우드 macOS 빌드 + Apple 개발자 계정 필요).

추가 요청(작업 중): 첫 화면 "MD 열기"가 MD 전용처럼 보임 → **파일 열기**(EPUB·PDF·MD 공통)로 변경, EPUB 전용 폴더 아이콘 버튼은 숨김. HWP/DOC 지원 가능 여부 질문 → 검토 결과만 보고.

완료: 0~4단계 구현과 PC/모의 Android 검증. 상세는 WORK_LOG 2026-10-17.

남은 일:
- ~~Java 컴파일/APK~~ 2026-10-17 이 PC에서 APK 빌드와 Java 테스트 통과. 남은 것: 실기기에서 PDF 열기·공유·확대·형광펜·복원 확인.
- 패키지 빌드(`build.bat`/`makeSetup.bat`)로 이전 설치본 위 업그레이드: 바로가기 정리, 실행 파일 이름, 기존 읽기 기록(프로필 폴더) 유지 확인. (사용자가 직접 테스트하기로 함)
- 실제 한글/대용량/스캔 PDF로 PC 확인, 툴바가 좁은 창에서 가로 스크롤되는 점 정리 여부 결정.
- 사용자 요청(2026-10-17): HWP·HWPX·DOCX 등 지원. 샘플은 `test/sample/`(개인 문서, `.gitignore`로 제외, 커밋 금지).
  평가 결과(임시 폴더에서 실행, 저장소 미반영):
  - `@ohah/hwpjs@0.1.0-rc.10`(MIT): HWP 5.0 샘플 2개 모두 HTML 변환 성공(60–140ms). 쪽 배치·제목 상자·이미지까지 한컴 뷰어에 가깝게 재현(절대 위치 HTML, SVG 표). 정식 출시 전이라 디버그 출력이 많다.
  - 제약: 브라우저 WASM 빌드는 공유 메모리(SharedArrayBuffer, 초기 256MB)를 요구 → Android WebView에서 그대로 사용 곤란. PC는 Electron 메인 프로세스의 네이티브 모듈(win32-x64 .node)로 우회 가능.
  - `hwp.js@0.0.3`: 두 HWP 모두 압축 해제 오류로 실패 → 제외.
  - 샘플 3은 확장자 `.hwp`이지만 HWPML(XML). 두 라이브러리 모두 미지원 → HWPX와 함께 자체 XML 해석 필요.
  - DOCX는 mammoth 1.13.0(BSD-2) 후보, 구형 DOC는 비권장.

## 우선 진단할 발견 사항

- (2026-10-17 재확인: 5회 연속 통과, 미재현. 간헐 경쟁 상태로 추정하며 재발 시 진단) `npm.cmd run test:reader`에서 undefined의 bounds 접근 오류로 실패했다. `scripts/smoke-reader.cjs:256`에서 수집한 런타임 오류를 검사하다 실패하므로, 다음 작업은 발생 단계와 앱/EPUB.js 호출 경로를 확인하고 원인에 맞는 수정 및 재검증부터 권장한다.

## 다음 권장 작업 — 구현 지시 대기

사용자는 기기/버전과 무관하게 화면이 자동 대응하는지 질문했다. 현재 대응 범위는 설명했으며, 전자잉크 최적화나 최소 버전 변경을 요청한 것은 아니다.

1. 실기기 호환성 확인
   - 갤럭시 휴대폰/탭과 대상 Android 이북리더에서 모델, Android/WebView 버전, 화면 크기, 시스템 글자 배율을 기록한다.
   - 세로/가로 회전, 분할 화면, 작은 화면 메뉴, 큰 글꼴, 전체 화면 복원, 긴 문서/이미지 EPUB를 확인한다.
   - 가장 오래된 지원 대상 기기의 WebView에서 `100dvh`, dialog, ResizeObserver 및 es2022 번들이 동작하는지 확인한다. 필요할 때만 호환성 보완 또는 지원 하한을 결정한다.
2. Android 실제 파일 흐름 확인
   - SAF 파일 선택, 취소, 클라우드 제공자, 다른 앱으로 열기/여러 파일 공유를 확인한다.
   - 백그라운드 종료·재실행 후 읽기 위치/Markdown 초안, 저장 실패와 외부 내보내기를 확인한다.
3. 전자잉크 대응 범위 결정
   - 현재 전용 갱신/잔상 제어와 모델 감지가 없다. 실제 기기 문제와 사용자 요구를 확인한 뒤 구현 범위를 정한다.
4. 배포 및 버전 정책
   - (2026-10-17 완료) PC·Android 버전 통일, 배포 파일 `MinsReader_ver<버전>`과 빌드마다 버전 +1. HANDOFF 참고.
   - 다른 PC의 디버그 서명 차이에 주의하고 배포 서명키는 Git 외부에서 관리한다.

## 기존 후속 후보

- 검색 debounce/이전·다음 단축키/대형 EPUB 검색 성능.
- 한글 폰트 표시와 설치 여부, 실제 대형/다국어 EPUB 안정화.
- MD 상대경로 이미지, 보관함 관리, PC와 앱 데이터 이동/동기화.
- 자세한 기존 방향은 DEVELOPMENT_PLAN.md, Android 제한은 ANDROID.md 참고.

## 기록 방법

작업 시작 시 이 파일에 범위와 계획을 적고, 종료 시 완료/남은 일을 갱신한다. 실제 명령·결과·미검증 사항은 WORK_LOG.md에 추가하고 HANDOFF.md의 현황도 맞춘다.

## 현재 요청 — 특정 EPUB 열기 실패 원인 조사 (2026-10-25)

- 요청: 제공 EPUB이 열리지 않는 원인부터 파악. 원본 EPUB 및 뷰어 기능 수정·빌드는 범위 밖.
- 계획: ZIP 무결성, OPF manifest/spine 참조, 현재 epubjs 로딩 실패를 확인하고 결과 기록.

### 2026-10-25 조사 결과 — 원인 확인 완료

- content.opf spine에 manifest에 없는 c0~c9가 먼저 나와 첫 장 URL이 undefined. 설치된 epubjs 첫 장 로딩에서 indexOf 오류 재현. 잘못된 참조를 메모리에서만 제거하면 첫 장 로딩 성공.
- 원본·제품 코드 변경 없음. ZIP CRC 검사 통과, XML 파싱 오류 미검출. 전체 렌더링·실기기 미검증.
- 제안 단계: 생성기의 spine 갱신 문제 수정/별도 교정 사본, 뷰어의 잘못된 참조 검증·오류 안내. 이번 요청은 원인 조사까지만 완료.

## 현재 요청 — EPUB 교정본 생성 (2026-10-25)

- 요청: 원인 조사한 EPUB을 교정. 원본을 보존하고 같은 폴더에 별도 교정본 생성.
- 계획: content.opf의 c0~c9 잘못된 참조만 제거, 다른 항목 바이트 보존과 ZIP CRC·전체 장 로딩 검증. 뷰어 코드 변경 없음.

## EPUB 교정본 생성 완료 (2026-10-25)

- 사용자 요청에 따라 원본 옆 `포즈랑 의 투자 이야기_교정본.epub` 생성(6,965,277바이트). 원본 보존.
- OPF spine의 존재하지 않는 c0~c9 참조 10개만 제거. OPF 외 모든 파일의 압축 해제 바이트가 원본과 동일함을 확인. mimetype은 첫 항목·무압축 유지.
- 검증: 교정 ZIP CRC 통과, spine 10개 모두 manifest에 존재, 설치된 epubjs Packaging/Spine/Archive/Section으로 전체 10개 장 로딩 성공. 원본 바이트 불변 확인.
- 미검증: 실제 뷰어 화면·Android 실기기 표시 및 정식 EPUBCheck. 뷰어 코드 변경·빌드·커밋 없음. 개인 EPUB은 저장소에 넣지 않음.
- 남은 제안: 생성기 spine 갱신 문제 및 뷰어 오류 안내 개선은 미착수. 이번 EPUB 교정 요청 완료.
