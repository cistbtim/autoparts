@echo off
cd /d "%~dp0\.."
set /p SPARETO_URL="Paste Spareto product URL: "
if "%SPARETO_URL%"=="" (
  echo No URL entered.
  pause
  exit /b 1
)
echo Scraping...
node scripts\scrape-spareto.mjs "%SPARETO_URL%" --deep | clip
if %errorlevel%==0 (
  echo Done — JSON copied to clipboard. Paste it into "Match from Spareto" in the app.
) else (
  echo Scrape failed — check the URL and try again.
)
pause
