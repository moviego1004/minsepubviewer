!define APP_NAME      "Mins EPUB Viewer"
!define APP_VERSION   "0.1.0"
!define APP_ID        "com.mins.epubviewer"
!define APP_EXE       "Mins EPUB Viewer.exe"
!define OUT_FILE      "MinsEPUBViewer-${APP_VERSION}-setup.exe"
!define INSTALL_DIR   "$PROGRAMFILES64\${APP_NAME}"
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define SOURCE_DIR    "build\win-unpacked"

; --- Metadata ---------------------------------------------------------------
Name              "${APP_NAME}"
OutFile           "build\${OUT_FILE}"
InstallDir        "${INSTALL_DIR}"
InstallDirRegKey  HKLM "${REG_UNINSTALL}" "InstallLocation"
RequestExecutionLevel admin
SetCompressor     /SOLID lzma
Unicode           True

; --- Includes ---------------------------------------------------------------
!include "MUI2.nsh"
!include "FileFunc.nsh"
!insertmacro GetSize

!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\orange.bmp"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"

; --- Install ----------------------------------------------------------------
Section "MainSection" SEC_MAIN

  SetOutPath "$INSTDIR"
  SetOverwrite on

  ; Electron 바이너리 및 리소스 복사
  File /r "${SOURCE_DIR}\*.*"

  ; 언인스톨러 생성
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; 시작 메뉴 바로 가기
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; 바탕화면 바로 가기
  CreateShortcut  "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; 프로그램 추가/제거 등록
  WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayName"      "${APP_NAME}"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayVersion"   "${APP_VERSION}"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "Publisher"        "Mins"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "UninstallString"  '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${REG_UNINSTALL}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoModify"         1
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoRepair"         1

  ; 설치 크기 계산 후 기록
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "EstimatedSize" "$0"

SectionEnd

; --- Uninstall --------------------------------------------------------------
Section "Uninstall"

  ; 바로 가기 삭제
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; 설치 폴더 삭제 (logs 등 사용자 데이터는 유지)
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.html"
  Delete "$INSTDIR\*.txt"
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir  "$INSTDIR"

  ; 레지스트리 정리
  DeleteRegKey HKLM "${REG_UNINSTALL}"

SectionEnd

