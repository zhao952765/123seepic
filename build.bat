@echo off
cd /d "f:\1\123看图"
call npm run build:electron
echo Exit code: %ERRORLEVEL%