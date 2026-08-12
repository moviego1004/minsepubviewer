@echo off
setlocal

cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js 20 or newer.
  exit /b 1
)

if not exist "node_modules\.bin\esbuild.cmd" goto install_dependencies
if not exist "node_modules\.bin\electron.cmd" goto install_dependencies
goto run_app

:install_dependencies
echo Installing dependencies...
call npm.cmd ci
if errorlevel 1 exit /b 1

:run_app
call npm.cmd run desktop
exit /b %errorlevel%
