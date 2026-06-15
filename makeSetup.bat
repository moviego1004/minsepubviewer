@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "SEQ_FILE=.build-sequence"
set "BUILD_DIR=build"
set "NSIS_SCRIPT=installer.nsi"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js 20 or newer.
  exit /b 1
)

set "MAKENSIS="
for /f "delims=" %%M in ('where makensis.exe 2^>nul') do (
  if not defined MAKENSIS set "MAKENSIS=%%M"
)
if not defined MAKENSIS (
  if exist "%ProgramFiles(x86)%\NSIS\makensis.exe" set "MAKENSIS=%ProgramFiles(x86)%\NSIS\makensis.exe"
)
if not defined MAKENSIS (
  if exist "%ProgramFiles%\NSIS\makensis.exe" set "MAKENSIS=%ProgramFiles%\NSIS\makensis.exe"
)
if not defined MAKENSIS (
  echo makensis.exe was not found. Please install NSIS or add it to PATH.
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"`) do set "APP_VERSION=%%V"
if not defined APP_VERSION set "APP_VERSION=0.1.0"

for /f "usebackq delims=" %%D in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format yyyyMMdd"`) do set "BUILD_DATE=%%D"

set "LAST_DATE="
set "LAST_SEQ=0"
if exist "%SEQ_FILE%" (
  for /f "tokens=1,2 delims==" %%A in (%SEQ_FILE%) do (
    if /i "%%A"=="date" set "LAST_DATE=%%B"
    if /i "%%A"=="sequence" set "LAST_SEQ=%%B"
  )
)

if "%LAST_DATE%"=="%BUILD_DATE%" (
  set /a BUILD_SEQ=LAST_SEQ+1
) else (
  set /a BUILD_SEQ=1
)

if %BUILD_SEQ% LSS 10 (
  set "SEQ_PAD=00%BUILD_SEQ%"
) else if %BUILD_SEQ% LSS 100 (
  set "SEQ_PAD=0%BUILD_SEQ%"
) else (
  set "SEQ_PAD=%BUILD_SEQ%"
)
set "BUILD_NUMBER=%BUILD_DATE%.%SEQ_PAD%"
set "DISPLAY_VERSION=%APP_VERSION%.%BUILD_NUMBER%"
set "OUT_FILE=MinsEpubViewer-%DISPLAY_VERSION%-setup.exe"

echo Preparing setup build %DISPLAY_VERSION%

if exist "%BUILD_DIR%" (
  echo Removing previous build files...
  rmdir /s /q "%BUILD_DIR%"
  if errorlevel 1 exit /b 1
)

if not exist "node_modules\.bin\electron-builder.cmd" (
  echo Installing dependencies...
  npm.cmd ci
  if errorlevel 1 exit /b 1
)

echo Building Electron package...
npm.cmd run build
if errorlevel 1 exit /b 1

if not exist "%BUILD_DIR%\win-unpacked\Mins EPUB Viewer.exe" (
  echo Expected Electron build output was not found: %BUILD_DIR%\win-unpacked\Mins EPUB Viewer.exe
  exit /b 1
)

echo Creating NSIS installer...
"%MAKENSIS%" ^
  /DAPP_VERSION=%APP_VERSION% ^
  /DBUILD_NUMBER=%BUILD_NUMBER% ^
  /DDISPLAY_VERSION=%DISPLAY_VERSION% ^
  /DOUT_FILE=%OUT_FILE% ^
  "%NSIS_SCRIPT%"
if errorlevel 1 exit /b 1

(
  echo date=%BUILD_DATE%
  echo sequence=%BUILD_SEQ%
) > "%SEQ_FILE%"

echo.
echo Setup build complete:
echo   %BUILD_DIR%\%OUT_FILE%

endlocal
