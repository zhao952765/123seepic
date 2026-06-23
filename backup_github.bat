@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "SOURCE_DIR=f:\1\123看图"
set "DEST_DIR=F:\1\上传"

REM 使用 PowerShell 生成时间戳（避免中文日期问题）
for /f "usebackq delims=" %%i in (`powershell -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"`) do set "TIMESTAMP=%%i"

set "BACKUP_NAME=123看图_GitHub_Bak_%TIMESTAMP%"
set "BACKUP_PATH=%DEST_DIR%\%BACKUP_NAME%"

echo ============================================
echo   123看图 - GitHub Backup
echo ============================================
echo.
echo Target: %BACKUP_PATH%
echo.

if not exist "%BACKUP_PATH%" mkdir "%BACKUP_PATH%"

echo [1/6] Copying root config files...
robocopy "%SOURCE_DIR%" "%BACKUP_PATH%" ^
    package.json ^
    package-lock.json ^
    tsconfig.json ^
    svelte.config.js ^
    vite.config.ts ^
    electron-builder.yml ^
    index.html ^
    .gitignore ^
    _build.mjs ^
    build.bat ^
    backup_github.bat ^
    123.ico ^
    README.md ^
    CHANGELOG.md ^
    INSTALL.md ^
    RELEASE_NOTES.md ^
    /NFL /NDL /NJH /NJS >nul

echo [2/6] Copying src directory...
robocopy "%SOURCE_DIR%\src" "%BACKUP_PATH%\src" /E /NFL /NDL /NJH /NJS >nul

echo [3/6] Copying electron directory...
robocopy "%SOURCE_DIR%\electron" "%BACKUP_PATH%\electron" /E /NFL /NDL /NJH /NJS >nul

echo [4/6] Checking static directory...
if exist "%SOURCE_DIR%\static" (
    robocopy "%SOURCE_DIR%\static" "%BACKUP_PATH%\static" /E /NFL /NDL /NJH /NJS >nul
    echo   static copied
) else (
    echo   static not found, skip
)

echo [5/6] Checking scripts directory...
if exist "%SOURCE_DIR%\scripts" (
    robocopy "%SOURCE_DIR%\scripts" "%BACKUP_PATH%\scripts" /E /NFL /NDL /NJH /NJS >nul
    echo   scripts copied
) else (
    echo   scripts not found, skip
)

echo [6/6] Cleaning temp files...
if exist "%BACKUP_PATH%\*.tmp" del /Q "%BACKUP_PATH%\*.tmp" >nul 2>&1
if exist "%BACKUP_PATH%\*.temp" del /Q "%BACKUP_PATH%\*.temp" >nul 2>&1
if exist "%BACKUP_PATH%\*.log" del /Q "%BACKUP_PATH%\*.log" >nul 2>&1

echo.
echo ============================================
echo   Backup complete!
echo   Location: %BACKUP_PATH%
echo ============================================
echo.

explorer "%BACKUP_PATH%"

endlocal
pause