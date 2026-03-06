@echo off
title NEXI CHAT
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install from https://nodejs.org/
    goto :end
)

if not exist "%~dp0nexichat\package.json" (
    echo [ERROR] nexichat folder or package.json not found. Put this script in project root.
    goto :end
)

cd /d "%~dp0nexichat"
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Check network or Node.js.
        goto :end
    )
    echo Done.
)

if exist "scripts\launcher.js" (
    node scripts/launcher.js
) else (
    call npm run start-all
)
if errorlevel 1 (
    echo [ERROR] Start failed. See above for details.
)
goto :end

:end
echo.
echo Press any key to close...
pause >nul
