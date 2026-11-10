@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required: https://nodejs.org
  echo Opening the online version instead...
  start "" https://numanak-b221210105.github.io/meydan/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies, this happens only once...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)
echo Starting Meydan on http://localhost:5173 ...
call npm run dev -- --open
pause
