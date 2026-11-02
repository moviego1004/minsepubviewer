# 폴라리스 오피스 Android APK 분석 — 형식별 표시 방식

작성: 2026-11-02. HWP와 글꼴은 [POLARIS_OFFICE_ANALYSIS.md](POLARIS_OFFICE_ANALYSIS.md)에 따로 정리했다. 이 문서는 그 밖의 형식(워드·시트·슬라이드·PDF·텍스트 등)을 어떻게 보여 주는지 정리하고 Mins Reader에 참고할 점을 적는다.

## 1. 대상과 방법

- 대상: `test/PolarisOffice.apk`, `com.infraware.office.link` 9.0.10, SHA-256 `c75d81c0…401853d`(앞 문서와 같은 파일).
- REA `open_binary` → `extract_artifact`(Evidence `ev_63d0e2b0…`, 항목 전체를 풀었다). `aapt2 dump xmltree`로 AndroidManifest를 읽었다. 그 밖에는 dex 5개와 엔진 `libpolarisoffice8.so`(arm64)의 문자열·소스 경로·형식 표지 문자열을 근거로 삼았다.
- 한계: JADX 미설정으로 Java 디컴파일을 하지 못했다. 엔진 함수 분석이나 앱 실행도 하지 않았다. **[관찰]** 은 파일에서 직접 확인한 사실이고, **[추정]** 은 이름과 구조를 보고 짐작한 내용이다.

## 2. 공통 구조 — 엔진 하나가 모든 형식을 그린다

**[관찰]**

- C++ 엔진 하나(`libpolarisoffice8.so`)가 모든 형식의 읽기·배치·그리기를 한다. Java는 엔진 하나(`com.infraware.office.evengine.EvInterface`/`EvNative`)를 부르고 화면과 메뉴만 맡는다.
- 엔진은 모듈 세 개로 나뉜다. 소스 경로 첫 부분 기준이다.
  - `Bwp`(워드프로세서): DOC, DOCX, RTF, ODT, TXT, HTML/MHT, HWP. 슬라이드도 같은 모델의 `Bwp/Filter/slide`, `Bwp/frmw/ppt`를 쓴다.
  - `Sheet`: XLS, XLSX, CSV, ODS. 계산 엔진은 `Sheet/frmw/calc`, `Functions`.
  - `Pdf`: xpdf 3.02pl2로 해석하고 자체 렌더러로 그린다.
- 공통 그리기 계층은 `Common/Render/{dc,agg,skia,image,shape,font}`, `Common/Libs/harfbuzz`다. 이미지 해석기는 `Bmp, Gif, JPG9a(libjpeg 9a), JPGXR, Png(libpng 1.6.35), Tiff, Pcx, Wbmp, Wmf`, `openjpeg`(JPEG 2000)를 넣었다.
- 화면 출력: 모든 문서 화면이 공통 `com.infraware.office.common.UxSurfaceView`(SurfaceView)에 그린다. 엔진이 비트맵을 채워 콜백으로 넘긴다. 콜백 이름은 `OnDrawBitmap`, `OnDrawExtBitmap`/`OnDrawExtHHBitmap`/`OnDrawExtVHBitmap`, `OnDrawBlockBitmap`, `OnDrawThumbnailBitmap`이고, 엔진 쪽은 `AndroidBitmap_lockPixels`를 쓴다.
  - **[추정]** `Ext…HH/VH` 비트맵은 화면 바깥(가로·세로) 영역을 미리 그려 둔 것으로, 스크롤과 확대를 빠르게 보여 주는 용도다.
- 형식 판별: 엔진 문서 형식 목록 `E$EV_DOCTYPE`(Java enum). 값은 `ASCI, BMV, BORA, BWP, CELL, COMIC_CNI/TNS/ZIP, DOC, DOCX, EPUB, GUL, HTML, HWP, IMAGE_BWP, JOHAP, JUNGUMGUL, MFI, MHT, NXL, ODP, ODS, ODT, PDF, PPT, PPTX, RTF, SNB, XLS, XLSX, XLS_CHART, ZIP`이다.
  - EPUB·COMIC·GUL(훈민정음)·JUNGUMGUL(정음글로벌)·SNB(삼성 노트) 등은 목록에만 있고, 이 판의 열기 목록(3장)에는 없다.
  - 엔진은 확장자와 내용이 다르면 따로 처리한다. 엔진 문자열 `ext = DOCX and contents are not DOCX`, `This Document is not Hwp50 Format`, `HwpX Format Type`, `HwpML Format Type`, `HWP Document File V3.00` 서명이 그 근거다.
- 열기 방식(`E$EV_DOCUMENT_OPEN_MODE`): `PRINT_LAYOUT`(쪽 그대로), `CONTINUOUSVIEW`(연속), `NOMARGINVIEW`(여백 없이), `BASICVIEW`, `WEBVIEW`. 별도로 휴대폰용 `ISetMobileViewMode`/`IGetNextBitmapForMobileView`(워드 계열 재배치)와 `IGetNextBitmapForReflow`가 있다.

## 3. 열기 목록(AndroidManifest)

**[관찰]** 실행 진입점은 `com.infraware.service.ActLauncher` 하나다. 형식에 따라 아래 화면으로 나뉜다.

| 화면(Activity) | 형식 |
| --- | --- |
| `office.word.UxWordEditorActivity` | DOC, DOCX, RTF, ODT, TXT(문서로 열 때) |
| `office.hwp.UxHwpEditorActivity` | HWP, HWPX |
| `office.sheet.UxSheetEditorActivity` | XLS, XLSX, CSV |
| `office.slide.UxSlideEditorActivity`, `UxSlideShowActivity`, `UxSlidePreViewActivity` | PPT, PPTX, PPSX |
| `office.viewer.UxPdfViewerActivity` | PDF |
| `office.texteditor.UxTextEditorActivity` | TXT(텍스트 편집기) |

- MIME 20개: `application/hwp`, `application/x-hwp`, `application/haansofthwp`, `application/hangul`, `application/vnd.hancom.hwp`, MS Office·OOXML 6종, `application/vnd.oasis.opendocument.text`, `application/pdf`, `text/plain`, `text/comma-separated-values`, `application/octet-stream`, `application/x-msdownload`, `*/*`.
  - `application/x-hwpx`나 `.hwpx` 확장자는 등록하지 않았다. `*/*`와 `octet-stream`으로 받는다.
- 확장자: `pathPattern`으로 `.doc .docx .hwp .pdf .ppt .pptx .xls .xlsx`(대·소문자 따로)와 자체 형식 `.word .sheet .slide`를 받는다.
  - 파일 이름에 점이 여러 개 있으면 Android `pathPattern`이 첫 점에서 짝을 찾지 못한다. 그래서 `.*\..*\.hwp`부터 `.*\..*\..*\..*\..*\..*\.hwp`까지 점 개수별 패턴을 6벌 반복해 넣었다(105개 필터가 `host="*"`). scheme은 `file`, `content`.

## 4. 형식별 표시 방식

### 4.1 워드 계열 — DOC / DOCX / RTF / ODT / HTML·MHT / TXT

- **[관찰]** 필터 위치:
  - DOCX: `Bwp/Filter/word/Docx`(161개 파일, `word/styles.xml` 등)
  - DOC 바이너리: `Bwp/Filter/officex_b`, OLE 스트림 이름 `0Table`, `DecryptedWordDocumentStream`(암호 문서 해제)
  - RTF: `Supplementary/rtf`(`CRtfParaAtt`, `CRtfTextAtt`, `CRtfPicture`, `CRtfDrawing`)
  - ODT: `Common/Filter/odf`, `Bwp/Filter/odf_b`
  - HTML·MHT: `Bwp/Filter/html`, `MIME-Version`, `multipart/related`, `Content-Location`
  - TXT: `Bwp/frmw/txt`
- 모든 형식을 같은 문서 모델(`brwordp`)로 바꾼 뒤 엔진이 쪽을 배치한다. 보기 방식은 "쪽 그대로 / 연속 / 여백 없이 / 휴대폰 재배치"를 고를 수 있다(2장).
- 테마 글꼴·색: `Common/Base/theme/BrThemeFont.cpp`에 Office 기본 테마 XML을 엔진에 넣었다(본문 `맑은 고딕`, 언어별 대체 글꼴 목록 `<a:font script="Hang" …>`). 문서에 테마가 없을 때 쓴다.

### 4.2 시트 — XLS / XLSX / CSV / ODS

- **[관찰]** `Sheet/frmw/ss`(81), `Sheet/frmw/calc`(64), `Sheet/frmw/Chart`(68), `Sheet/Filter/officex_s`(XLSX), `Sheet/Filter/odf_s`, `sparkline`, `ExternalLinks`가 있다. API는 `ISheetCalculateNow`, `ISheetGetCalculationMode`, `ISheetSetFitPageScale`, `ISheetPrintArea` 등이다.
- **[추정]** 셀 격자·차트·스파크라인을 엔진이 그려 비트맵으로 넘긴다. 수식은 엔진 계산기로 다시 계산할 수 있다. 화면은 쪽이 아니라 시트 격자를 스크롤하는 방식이다(인쇄 미리보기는 따로 있음).

### 4.3 슬라이드 — PPT / PPTX / PPSX / ODP

- **[관찰]** `Bwp/Filter/slide`(113, `pptx/…`, `PowerPoint Document`/`Current User` OLE 스트림)를 쓴다.
- 편집 화면은 비트맵 콜백 `OnPptDrawSlidesBitmap`, `OnPptGetSlidenoteBitmap`, `OnPptDrawMasterLayoutBitmap`을 쓴다.
- **슬라이드 쇼는 OpenGL**로 보여 준다: `uxcontrol.uicontrol.slide.SlideShowGLSurfaceView`, `GLES20`/`EGL14`, `OnPptSlideShowDrawBitmap`. 화면 전환 효과 목록(`eEV_SLIDESHOW_EFFECT_FERRISWHEEL`, `…CHECKERBOARD`, `…EFFECTOPTION_PARTICLES_IN` 등)과 영상(`VideoListener`, `TextureView`)도 있다.
  - **[추정]** 엔진이 슬라이드를 비트맵으로 그리고, 화면 전환 효과는 GPU가 담당한다.
- PPTX에 넣은 글꼴을 읽는다: `p:embeddedFontLst`, `ptxEmbeddedFont`, `libeot`(EOT 압축 해제. MTX 압축은 미구현이라는 오류 문자열이 있음).

### 4.4 PDF

- **[관찰]** 해석은 xpdf 3.02pl2(`Pdf/xpdf-3.02pl2/xpdf`, `fofi` 글꼴 파서)가 맡는다. 그리기는 xpdf의 Splash가 아니다(엔진에 `Splash` 문자열 0개). 자체 렌더러 `Pdf/render/*`(`RenderOutputDev`, `PageBitmapObj`, `EdgeGlyph`, `RgxFont`)와 쪽 비트맵 캐시 `Pdf/pdf2cache`를 쓴다.
- CJK 문서용 Adobe CMap(`Adobe-Korea1/GB1/CNS1/Japan1` 계열, `…PK` 접미어)을 엔진에 넣었다.
  - **[추정]** 접미어 `PK`는 압축본이라는 뜻이다. PDF에 글꼴이 없을 때는 앞 문서의 내장 나눔고딕 등으로 대체한다(`NanumGothic-KSCpc-EUC-H` 문자열).
- **PDF 재배치(reflow)**: `Pdf/blocker/{Blocker, BlockObj, LineArray, PathColl, ImageColl, PageRect, ReflowBlockObj, ReflowTextLineObj}`, Java `setReflowModeForPDF`, `IGetNextBitmapForReflow`, `mImageReflownTable`.
  - **[추정]** 쪽의 글자와 그림을 덩어리·줄 단위로 나눈 뒤, 화면 폭에 맞게 다시 배치해 그린다.
- 주석: `Pdf/annot/PdfAnnotList`, `app/Free{Line,Pencil,Polygon,Square,Circle,Textbox}`, `StickyNoteBitmapObj`(원본 PDF에 주석 저장). 검색: `app/FindManager`. 변환: `pdf2Doc/pdf2doc.cpp`(기기 안 변환)와 클라우드 변환 `IHttpPdfConvertToOffice`가 함께 있다. 내보내기: `PDFGenerater`(모든 형식 → PDF).

### 4.5 텍스트

- **[관찰]** TXT는 두 경로로 연다. 엔진 워드 화면(`Bwp/frmw/txt`, `eEV_DOCTYPE_ASCI`)과 별도 Java 텍스트 편집기(`office.texteditor.*` 클래스 약 70개)다. dex에 `EUC-KR`, `UTF-8`, `UTF-16LE` 문자열이 있다.
  - **[추정]** 텍스트 편집기는 문자 인코딩(한글 EUC-KR 포함)을 골라 읽는 일반 Android 편집기다.

## 5. Mins Reader와 비교·참고할 점

| 형식 | 폴라리스 | Mins Reader 현재 |
| --- | --- | --- |
| EPUB | 이 판에서는 열지 않음(enum만 있음) | epub.js |
| PDF | xpdf + 자체 렌더러, 재배치 모드, 주석을 원본에 저장 | PDF.js 6.3.289, 형광펜·메모는 앱 내부 저장 |
| DOCX | 엔진이 쪽 배치(원본 모양) + 휴대폰 재배치 | mammoth 1.13.0 → 의미 위주 HTML(서식 대부분 사라짐) |
| HWP/HWPX | 엔진이 쪽 배치 | PC hwpjs 쪽 배치, 휴대폰은 자체 해석기 재배치 |
| XLSX/PPTX/DOC/RTF/ODT | 지원 | 미지원 |

참고할 점(제안, 미착수):

1. **보기 방식 두 가지는 맞는 방향이다.** 폴라리스도 "쪽 그대로(PRINT_LAYOUT)"와 "휴대폰 재배치(Mobile View·Reflow)"를 함께 둔다. Mins Reader의 "기본은 재배치, 원본 쪽 보기는 선택" 계획([DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) 5.1)과 같다. DOCX에도 같은 두 방식을 적용할 수 있다.
2. **DOCX 서식 보강.** 원본 모양에 가깝게 보이려면 mammoth 대신(또는 함께) 쪽·서식을 살리는 `docx-preview`(npm, Apache-2.0) 같은 HTML 렌더러를 "원본 모양 보기"로 시험해 볼 만하다. 판·크기·라이선스는 도입 전에 다시 확인한다.
3. **PDF 재배치 보기.** 폴라리스처럼 글자 덩어리를 뽑아 화면 폭으로 다시 흘리는 기능이다. PDF.js `getTextContent()`의 글자 위치로 줄·문단을 묶어 HTML로 다시 흘리는 방식이 가능하다(표·다단은 어려움). 스캔 PDF는 불가하다.
4. **열기 목록 보강(Android).** 파일 이름에 점이 여러 개면 `pathPattern`이 실패하는 문제를 폴라리스는 점 개수별 패턴을 반복해 해결했다. Mins Reader는 현재 MIME(`application/octet-stream` 포함)으로 받는다. "내 파일" 앱이 MIME을 주지 않는 경우가 확인되면 같은 방식을 쓴다. HWP MIME 별칭 가운데 `application/haansofthwp`, `application/vnd.hancom.hwp`는 Mins Reader `android/app/src/main/AndroidManifest.xml`에 이미 있다. `application/hangul`만 없으므로 추가를 검토한다(2026-11-02 대조).
5. **내용으로 형식 판별.** 폴라리스는 확장자와 내용이 다른 경우를 따로 처리한다. Mins Reader도 파일 첫 바이트로 판별하면 잘못 붙은 확장자에 강해진다. ZIP(`PK\x03\x04`) 안 `mimetype`/`[Content_Types].xml`/`Contents/`, OLE(`D0 CF 11 E0`) 안 `FileHeader`(HWP)·`WordDocument`, `%PDF-`로 구분한다.
6. **새 형식 추가는 신중히.** 폴라리스는 형식마다 큰 엔진 모듈(시트·슬라이드 각 수백 파일)을 넣었다. Mins Reader가 읽기 전용으로 넣는다면 XLSX는 SheetJS 등으로 HTML 표를 만드는 정도가 현실적이다. PPTX는 원본 모양 재현 비용이 커서 우선순위를 낮게 둔다.
7. **그리기 방식은 따라 하지 않는다.** 폴라리스는 네이티브 엔진 → 비트맵 → SurfaceView 구조다. Mins Reader는 WebView 안의 HTML·Canvas(PDF.js)가 같은 역할을 하므로 구조를 바꿀 이유가 없다.

## 6. 확인하지 못한 것

- Java 디컴파일: ActLauncher가 형식별 화면을 고르는 규칙, TXT가 어느 화면으로 가는지, Mobile View를 HWP·DOC에도 쓰는지.
- 엔진 함수 분석: 쪽 비트맵을 조각(타일)으로 그리는지, PDF 재배치 규칙, CMap 압축 형식.
- 실기기 실행: 형식별 실제 화면과 속도.

## 7. 재현

```powershell
$bt = "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0"
& "$bt\aapt2.exe" dump xmltree --file AndroidManifest.xml test\PolarisOffice.apk > manifest.txt
# REA open_binary(test\PolarisOffice.apk) → extract_artifact로 새 임시 폴더에 풀기
# classes*.dex, lib/arm64-v8a/libpolarisoffice8.so에서 ASCII/UTF-16 문자열을 뽑아
#   "sources/" 경로(모듈별 집계), "eEV_DOCTYPE_", "eEV_DOCUMENT_OPEN_MODE_", "OnDraw", "Reflow" 검색
```
