# 폴라리스 오피스 Android APK 분석 — HWP 표시와 글꼴

작성: 2026-11-02. 목적: 폴라리스 오피스가 휴대폰에서 HWP를 어떻게 보여 주는지, PC 글꼴을 모두 넣었는지 확인하고 Mins Reader의 "HWP 원본 모양 재현 로드맵"([DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) 5.1)에 반영할 점을 정리한다. 다른 형식의 표시 방식은 [POLARIS_OFFICE_FORMATS.md](POLARIS_OFFICE_FORMATS.md).

## 1. 대상과 분석 방법

| 항목 | 값 |
| --- | --- |
| 파일 | `test/PolarisOffice.apk` (Git 제외, `.gitignore`의 `test/*.apk`) |
| SHA-256 | `c75d81c0c0903ed5905e71e2d8e05416a1df253a70a4083cea5eb570e401853d` |
| 패키지 | `com.infraware.office.link`, versionName 9.0.10 (versionCode 755), targetSdk 29 |
| 네이티브 | `arm64-v8a`, `armeabi` |

- REA `open_binary` → `inspect_artifact`(항목 7,743개, 전체 확인. Evidence `ev_c3fa3692…`) → `extract_artifact`(Evidence `ev_772e6d04…`)로 압축을 풀었다.
- REA의 Android 디컴파일(JADX)은 이 PC에 `REA_JADX_MCP_JAR`가 설정되어 있지 않아 쓰지 못했다. 그래서 Java 코드는 **디컴파일하지 않았고**, dex·`.so`의 문자열(ASCII/UTF-8/UTF-16), 원본 소스 경로 문자열, 엔진에 들어 있는 글꼴 파일(sfnt 헤더 검사 + fontTools)을 근거로 삼았다.
- 앱을 실행하지 않았다(정적 분석만). 아래에서 **[관찰]** 은 파일에서 직접 확인한 사실이고, **[추정]** 은 이름이나 구조를 보고 짐작한 내용이다.

## 2. 구조 요약 — HWP를 "그림으로 그려서" 보여 준다

APK 92MB 가운데 핵심은 C++ 문서 엔진 `lib/arm64-v8a/libpolarisoffice8.so`(62.7MB)다. Java(dex 5개, 약 38MB)는 화면(UI)과 엔진 호출만 맡는다.

**[관찰]** 엔진에 남아 있는 소스 경로(2,330개)를 모듈별로 보면:

| 모듈 | 소스 파일 수 | 뜻 |
| --- | --- | --- |
| `Bwp/Filter/hwp` | 409 | HWP 해석기(가장 큼). `Hwp50/`(바이너리 5.0), `XML/HwpML/`(HWPX·HWPML), `Hwp30/`(HWP 3.0·2.x·1.x 서명 문자열) |
| `Bwp/Filter/hwp/Common/Plugin/Equation` | — | HWP 수식 엔진(`HwpEquationEngine.cpp`, `HncEqDraw.cpp`) |
| `Bwp/Filter/hwp/Common/Plugin/Chart` | 90여 개 | HWP 차트(`VcFi/HncUI`, `HncWz` — "Hnc" 접두어) |
| `Bwp/frmw/brwordp` | 144 | 공통 워드프로세서 모델·쪽 배치(`bwTextProc.cpp`, `bwFontArray.cpp` 등) |
| `Common/Render/{dc,skia,font,image}` | 100여 개 | 그리기: AGG 브러시/펜(`brAggBrush.cpp`), Skia 일부, 자체 글꼴 엔진 `BoraFont` |
| `Common/Libs/harfbuzz` | 17 | 글자 모양 처리(HarfBuzz) |
| `Pdf/xpdf-3.02pl2`, `Pdf/blocker/Reflow*` | — | PDF 보기와 PDF 재배치(reflow) |

HWP 해석기의 세부 폴더는 HWP 5.0 레코드 구조를 그대로 따른다: `DocInfo/{Font,CharShape,ParaShape,Border/FillBrush,BinData,Numbering,Bullet,TabDef,Style,Memo}`, `BodyText/Para/{LineSegment,CharShape,RangeTag,Header}`, `BodyText/ControlData/{SecDef,PageCtrl,Field,Object/Shape/{Picture,DrawingObject,Equation},TextPlugIn}`.

그리는 흐름:

1. **[관찰]** 엔진이 HWP/HWPX를 읽어 공통 문서 모델(`Bwp`, Word·ODT·슬라이드와 같은 모델)로 바꾼다. 글자·문단 속성에 형식별 확장(`PoTextAttHwp.cpp`, `PoParaAttHwp.cpp`)이 있다.
2. **[관찰]** 엔진이 쪽을 직접 배치하고 비트맵에 그린다. 엔진은 `AndroidBitmap_lockPixels`/`unlockPixels`를 쓰고, Java API 이름이 `IGetPageToBitmap`, `IEditPageRedrawBitmap`, `IGetPageThumbnail`, `IZoomInOut`, `IScroll`, `IChangeScreen`이다. HTML이나 WebView 변환이 아니다.
3. **[관찰]** 휴대폰용 보기 방식이 따로 있다: `ISetMobileViewMode`, `IGetNextBitmapForMobileView`, `setWordMobileViewMode`, `setWordReflowTextMode`, `IGetNextBitmapForReflow`. **[추정]** 워드 계열 문서를 화면 폭에 맞춰 다시 배치한 비트맵으로 보여 주는 모드다. 이 모드가 HWP에도 쓰이는지는 디컴파일 없이 확인하지 못했다(HWP 화면은 `com.infraware.office.hwp.UxHwpEditorActivity`).
4. **[관찰]** `Hwp50LineSegment.cpp`/`Hwp50LineSegmentList.cpp`로 PARA_LINE_SEG(한글이 저장해 둔 줄 위치)를 읽는다. **[추정]** 편집기이므로 엔진(`brwordp`)이 줄을 직접 다시 계산하고, LINE_SEG는 참고나 저장용으로 쓸 가능성이 크다. 정확한 용도는 확인하지 못했다.

## 3. 글꼴 — PC 글꼴을 전부 넣지 않았다

### 3.1 APK에 들어 있는 글꼴 파일

**[관찰]** `assets/fonts/`에는 화면(UI)용 Roboto 8개뿐이다. 문서용 글꼴은 **엔진 `.so` 안에 데이터로 들어 있다**(`BoraFont_Embedded.cpp`, 클래스 `BrEmbeddedFont`). sfnt 헤더를 검사해 찾은 글꼴은 아래 표와 같고, arm64·armeabi 두 엔진에 같은 목록이 들어 있다(합계 약 9MB).

| 글꼴 | 크기 | 글자 수(cmap) | 한글 음절 | 용도(추정 포함) |
| --- | --- | --- | --- | --- |
| **NanumGothic** 3.020 (NHN, OFL) | 4.3MB | 17,666 | 11,172 전부 + 한자 4,620 | **유일한 한글 본문 글꼴.** 기기에 맞는 글꼴이 없을 때 기본으로 쓰는 글꼴 |
| HYGulim / HYDotum / HYBatang (한양) | 21–30KB | 191 | 0 | 라틴 문자만 있다. 한글 글꼴의 영문 폭만 맞추는 용도로 추정 |
| HYTRSerif Bold/Italic/BoldItalic | 51–56KB | 359 | 0 | 라틴 문자만 있다 |
| HYWingding 1/2/3, HYWebdings, HYSymbol | 12–68KB | 208–224 | 0 | 개인 사용 영역(PUA) 기호. HWP 문서의 기호 문자용 |
| HyhwpEQ 1.13 (한양) | 156KB | 626 | 0 | HWP 수식 글꼴 |
| STIXGeneral 4종(TTC) | 951KB | 1,053–2,510 | 0 | 수식·수학 기호 |
| Times New Roman, Arial, Tahoma, Courier New, Verdana (Monotype/MS, "CH" 판) | 0.19–0.83MB | 773–2,887 | 0 | Office 문서의 기본 영문 글꼴. 폭이 같아야 하는 대표 글꼴 |

즉, **함초롬바탕/돋움, 휴먼명조, 한양신명조, HY헤드라인M, 맑은 고딕, 굴림, 바탕 같은 PC 한글 글꼴은 하나도 들어 있지 않다.** 한글은 모두 나눔고딕 하나, 또는 기기에 있는 글꼴로 그린다.

### 3.2 기기 글꼴 사용

- **[관찰]** Java 문자열에 `/system/fonts/`가 있고 엔진에 `/system/fonts/DroidSansFallback.ttf`, `SamsungKorean.ttf`, `SamsungEmoji`, `Noto Color Emoji`, `LG Emoji`가 있다. 엔진 내부 구조 이름은 `tagSystemFontFileStruct`, `tagFlagLoadSystemFont`, `IGetSystemFonts`/`IGetSystemFontNames`다.
- **[관찰]** dex에 `/system/fonts/AndroidClock.ttf`, `Clockopia.ttf`, `DroidSans*.ttf`, `MinionPro-Regular.otf` 등 개별 파일 이름이 있다. **[추정]** 기기 글꼴 폴더를 훑을 때 빼는 목록이다(시계용 같은 특수 글꼴).
- **[관찰]** 글꼴 이름 처리: FreeType 연결(`font2Freetype.cpp`, 문자열 `truetype`, `autofitter`, `interpreter-version`), 이름 캐시·해시(`BoraFont_NameCache.h`, `BoraFont_Hash.h`), `isFamilyFontName`, `tagSameFamilyFontListStruct`, `tagPanoseInfoStruct`(PANOSE 분류), `tagInternalFontListStruct`, `tagFontHJCTTable`(한·일·중·대만 언어별 표, `BrHJCTTable.cpp`).

### 3.3 글꼴 이름 대응표(엔진 안)

**[관찰]** 엔진의 `0x2bd0000` 부근에 한글 이름과 영문 이름의 짝이 연달아 있다(일부):

```
함초롬바탕 ↔ HCR Batang      함초롬돋움 ↔ HCR Dotum        한컴바탕 ↔ Haansoft Batang
한컴 윤고딕 230 ↔ Haan YGodic 230   한컴 쿨재즈 B ↔ Haan Cooljazz B
HY견고딕 ↔ HYGothic-Extra / HYgtrE   HY헤드라인M ↔ HYHeadLine-Medium
HY신명조 ↔ HYSinMyeongJo-Medium     HY궁서B ↔ HYGungSo-Bold
나눔고딕 에코 ↔ NanumGothic Eco      나눔바른고딕 ↔ NanumBarunGothic
휴먼편지체 ↔ Pyunji R   휴먼아미체 ↔ Ami R   휴먼옛체 ↔ Yet R   안상수2006가는 ↔ ahn2006-L
굴림체 ↔ GulimChe   돋움체 ↔ DotumChe   궁서체 ↔ GungsuhChe   바탕체 ↔ BatangChe
```

- 같은 영역에 `함초롬바탕` 다음 `폴라리스새바탕`, `함초롬돋움` 다음 `폴라리스새돋움`이 있고, 영문 내부 글꼴 이름 `PolarisNewBatang`, `PolarisNewDotum`, `Polaris Batang`, `PolarisGothicM`, `PolarisHumanGothic`, `PolarisHumanMyeongjo`가 있다.
  - **[추정]** 문서 글꼴(함초롬·휴먼명조·휴먼고딕 등)을 폴라리스 자체 글꼴로 바꾸는 표다. 그러나 이 APK에는 그 글꼴 파일이 **없다**. 그래서 별도 판(제조사 선탑재판 등)이나 내려받기로 제공한다고 추정한다(dex에 `getFontUrl`/`mFontUrl` 문자열이 있다). 확인하지 못했다.
- HWP 3.0 기본 글꼴 이름 `신명조`, `중고딕`, `견고딕`, `그래픽`(`Hwp30FaceNameArray` 옆), Office 테마 기본 `맑은 고딕`, 문서 기본값 `함초롬돋움/함초롬바탕`(`bwTextProc.cpp` 옆)도 있다.
- Java API `IGetHangulFontMappingTable`, `IGetDocFontNameList`, `IGetUseFontNames`: **[추정]** 문서에 쓰인 글꼴과 실제로 대체된 글꼴을 화면에 보여 주는 기능이다.

### 3.4 정리: 폴라리스의 글꼴 전략

1. PC 한글 글꼴은 넣지 않는다(라이선스와 용량 때문으로 추정). 한글은 **나눔고딕 하나 + 기기 글꼴**로 그린다.
2. 반드시 맞아야 하는 것만 넣는다: 기호(HY 윙딩/심볼, PUA), 수식(HyhwpEQ, STIX), Office 영문 기본 글꼴 5종(폭이 다르면 줄바꿈이 크게 어긋나기 때문).
3. 이름 대응표(한글↔영문 별칭, 같은 계열 목록, PANOSE)로 문서 글꼴 이름을 "있는 글꼴"에 맞춘다.
4. 쪽 배치는 엔진이 직접 하고 결과를 비트맵으로 그린다. 그래서 대체 글꼴의 글자 폭이 달라도 쪽 모양(표, 그림 위치, 쪽 크기)은 유지된다. 대신 줄 안의 글자 끝 위치는 원본과 달라질 수 있다(**[추정]**, 실기기 비교는 하지 않았다).

## 4. Mins Reader에 적용할 점

현재 Mins Reader(`src/core/hwpBinary.js`)는 글꼴 이름을 명조 계열이면 `Noto Serif KR`·serif, 아니면 `Malgun Gothic`·`Noto Sans KR`·sans-serif로 바꾸고, 기기 글꼴에 맡긴다.

1. **로드맵 A(무료 한글 글꼴 동봉 + 대응표)가 폴라리스 방식과 같다.** 폴라리스도 한글 본문 글꼴은 나눔고딕(OFL) 하나만 넣었다. Mins Reader는 다음 순서를 권한다.
   - 1단계: 고딕 1종(나눔고딕 또는 Noto Sans KR) + 명조 1종(나눔명조 또는 Noto Serif KR)을 `@font-face`로 동봉. 한글 11,172자만 남기는 부분 글꼴(subset)과 WOFF2로 줄이면 글꼴당 1~2MB 정도다(**[추정]**, 직접 만들어 확인해야 함).
   - 2단계: 3.3의 별칭을 참고해 `fontFamily` 대응표를 만든다. 예: 함초롬바탕/한컴바탕/HY신명조/휴먼명조/신명조/바탕(체) → 명조. 함초롬돋움/한컴돋움/HY중고딕/휴먼고딕/중고딕/굴림/돋움/맑은 고딕 → 고딕. HY헤드라인M/HY견고딕/견고딕 → 굵은 고딕(font-weight 700). 궁서/HY궁서 → 명조 또는 기울지 않은 붓글씨 대체. 영문 별칭(HCR Batang, HYSinMyeongJo-Medium 등)도 같은 규칙에 넣는다.
   - 폴라리스가 넣은 HY 글꼴, Monotype Arial/Times New Roman 등은 **상용 라이선스 글꼴이라 가져다 쓸 수 없다.** 영문은 폭이 같은 무료 글꼴(Liberation Sans/Serif/Mono, 폭이 Arial/Times/Courier New와 같음, OFL)로 대신할 수 있다.
2. **기호·PUA 문자 대응.** 폴라리스가 HYWingding·HYSymbol을 따로 넣은 것은 HWP 문서에 PUA 기호(□, ※, 원 숫자 같은 한글 전용 기호)가 자주 나오기 때문이다. Mins Reader는 HWP 텍스트를 만들 때 자주 나오는 PUA 코드를 유니코드 기호로 바꾸는 표를 검토한다(한컴 PUA→유니코드 변환표는 공개 자료로 조사 필요). 글꼴 동봉보다 싸다.
3. **수식.** 폴라리스는 수식 엔진과 전용 글꼴을 넣었다. Mins Reader는 당분간 수식 스크립트 텍스트나 대체 표시를 유지하고, 필요할 때 MathJax/KaTeX 변환을 따로 검토한다(범위가 큼).
4. **원본 쪽 모양 보기(C-1/C-2).** 폴라리스는 엔진이 쪽 배치를 직접 하는 방식(2번 흐름)이다. 같은 결과를 내려면 Mins Reader도 LINE_SEG 기반 쪽 배치(C-2)나 hwpjs WASM(C-1)이 필요하다. 이 분석으로 순서를 바꿀 근거는 없다. 다만 "글꼴이 달라도 쪽 모양은 유지"하려면 **쪽 배치와 글꼴 대체를 함께** 해야 한다는 점은 확인되었다.
5. **휴대폰 기본 보기.** 폴라리스도 워드 계열에 모바일 보기/재배치 모드를 따로 둔다. Mins Reader의 결정("기본은 재배치 보기, 원본 쪽 보기는 선택")과 같은 방향이다.

## 5. 확인하지 못한 것

- Java 코드 디컴파일(JADX 미설정): 글꼴 내려받기(`getFontUrl`)가 실제로 문서 글꼴용인지, `/system/fonts` 훑기의 제외 규칙, HWP가 모바일 보기 모드를 쓰는지.
- 엔진 함수 분석(Ghidra 등): LINE_SEG를 배치에 쓰는지, 대응표의 정확한 짝 구조와 대체 우선순위(PANOSE 비교 방식).
- 실기기 실행과 화면 비교: 폴라리스로 같은 HWP를 열어 Mins Reader와 비교하지 않았다.
- `PolarisNewBatang` 등 폴라리스 자체 글꼴 파일의 위치와 배포 방식.

## 6. 재현 방법

```powershell
# 1) APK 정보 (Android SDK build-tools)
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt2.exe" dump badging test\PolarisOffice.apk
# 2) 압축 해제: REA open_binary(path=test\PolarisOffice.apk) → extract_artifact, 또는 7-Zip 등으로 새 빈 폴더에 풀기
# 3) 엔진 안 글꼴 찾기: lib/arm64-v8a/libpolarisoffice8.so에서 sfnt 헤더(0x00010000, ttcf)를 찾고
#    표 목록에 cmap이 있는 것만 fontTools.TTFont로 열어 name/maxp/cmap 확인
#    (python -I로 실행, 스크립트는 압축 해제 폴더 밖에 둔다)
# 4) 문자열: ASCII·UTF-16LE·UTF-8 한글 문자열을 뽑아 "sources/" 경로, "BoraFont", "/system/fonts", 글꼴 이름 검색
```

Java 디컴파일까지 하려면 jadx-headless-mcp 0.7.1 JAR와 JDK 17 이상을 준비하고 `REA_JADX_MCP_JAR`를 설정한 뒤 REA를 다시 시작한다. 그 뒤 `inspect_android_package`, `search_android_classes`("Font", "hwp"), `inspect_android_method`를 쓴다.
