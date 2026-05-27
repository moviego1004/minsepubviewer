@echo off
setlocal

cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js 20 or newer.
  exit /b 1
)

if not exist "node_modules\.bin\electron-builder.cmd" (
  echo Installing dependencies...
  npm.cmd ci
  if errorlevel 1 exit /b 1
)

npm.cmd run build
