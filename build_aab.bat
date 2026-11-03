@echo off
setlocal

cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js 22 or newer.
  exit /b 1
)

if not exist "android\keystore\upload.properties" if not defined MINS_UPLOAD_KEY_PROPERTIES (
  echo Upload key not found: android\keystore\upload.properties
  echo Copy upload.jks and upload.properties into android\keystore first. See doc\ANDROID.md.
  exit /b 1
)

if not exist "node_modules\.bin\esbuild.cmd" goto install_dependencies
if not exist "node_modules\.bin\cap.cmd" goto install_dependencies
goto build_aab

:install_dependencies
echo Installing dependencies...
call npm.cmd ci
if errorlevel 1 exit /b 1

:build_aab
rem Raises the version by one and writes build\MinsReader_verX.Y.Z.aab (Play App Bundle, upload-key signed)
node scripts\release.cjs aab
exit /b %errorlevel%
