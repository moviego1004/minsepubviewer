@echo off
setlocal

cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js 20 or newer.
  exit /b 1
)

if not exist "node_modules\.bin\esbuild.cmd" goto install_dependencies
if not exist "node_modules\.bin\electron-builder.cmd" goto install_dependencies
goto build_app

:install_dependencies
echo Installing dependencies...
call npm.cmd ci
if errorlevel 1 exit /b 1

:build_app
rem Raises the version by one and writes build\MinsReader_ver<version>.exe and .apk
node scripts\release.cjs
exit /b %errorlevel%
