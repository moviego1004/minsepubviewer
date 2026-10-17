@echo off
rem Builds build\MinsReader_ver<version>.exe and raises the app version by one.
rem For the APK as well, run: npm.cmd run release
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js 22 or newer.
  exit /b 1
)

if not exist "node_modules\.bin\electron-builder.cmd" (
  echo Installing dependencies...
  call npm.cmd ci
  if errorlevel 1 exit /b 1
)

node scripts\release.cjs pc
exit /b %errorlevel%
