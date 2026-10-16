@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080
  node server.mjs
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    start "" http://localhost:8080
    py -m http.server 8080
  ) else (
    echo Weder Node.js noch Python gefunden. Bitte Node.js LTS von https://nodejs.org installieren.
    pause
  )
)
