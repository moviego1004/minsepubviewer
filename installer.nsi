!ifndef APP_NAME
  !define APP_NAME      "Mins EPUB Viewer"
!endif
!ifndef APP_VERSION
  !define APP_VERSION   "0.1.0"
!endif
!ifndef APP_ID
  !define APP_ID        "com.mins.epubviewer"
!endif
!ifndef APP_EXE
  !define APP_EXE       "Mins EPUB Viewer.exe"
!endif
!ifndef BUILD_NUMBER
  !define BUILD_NUMBER  "local"
!endif
!ifndef DISPLAY_NAME
  !define DISPLAY_NAME  "MinsEpubViewer"
!endif
!ifndef DISPLAY_VERSION
  !define DISPLAY_VERSION "${APP_VERSION}.${BUILD_NUMBER}"
!endif
!ifndef OUT_FILE
  !define OUT_FILE      "MinsEpubViewer-${DISPLAY_VERSION}-setup.exe"
!endif
!ifndef SOURCE_DIR
  !define SOURCE_DIR    "build\win-unpacked"
!endif
!define INSTALL_DIR   "$PROGRAMFILES64\${APP_NAME}"
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

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

  ; Electron binaries and resources
  File /r "${SOURCE_DIR}\*.*"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Start menu shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; Desktop shortcut
  CreateShortcut  "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; Add/Remove Programs registration
  WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayName"      "${DISPLAY_NAME}"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayVersion"   "${DISPLAY_VERSION}"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "DisplayIcon"      "$INSTDIR\${APP_EXE},0"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "Publisher"        "Mins"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKLM "${REG_UNINSTALL}" "UninstallString"  '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${REG_UNINSTALL}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoModify"         1
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoRepair"         1

  ; Store installed size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "EstimatedSize" "$0"

SectionEnd

; --- Uninstall --------------------------------------------------------------
Section "Uninstall"

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; Remove install folder; user data stored elsewhere is preserved
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

  ; Remove registry entries
  DeleteRegKey HKLM "${REG_UNINSTALL}"

SectionEnd
