@echo off
title SpeakCAI

set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "CLIENT=%ROOT%client"

echo =====================================
echo   SpeakCAI - English Speaking Coach
echo =====================================
echo.

:: Step 1 - Release ports 3000/3001/5173
echo [1/3] Releasing ports...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Step 2 - Check and install dependencies
echo [2/3] Checking dependencies...
if not exist "%SERVER%\node_modules" (
    echo   Installing server dependencies...
    cd /d "%SERVER%" && call npm i
    if errorlevel 1 (
        echo   [ERROR] Server npm install failed.
        pause
        exit /b 1
    )
)
if not exist "%CLIENT%\node_modules" (
    echo   Installing client dependencies...
    cd /d "%CLIENT%" && call npm i
    if errorlevel 1 (
        echo   [ERROR] Client npm install failed.
        pause
        exit /b 1
    )
)

:: Check .env
if not exist "%SERVER%\.env" (
    echo   [WARN] server\.env not found. Please configure API keys:
    echo     XUNFEI_APP_ID / XUNFEI_API_KEY / XUNFEI_API_SECRET / DEEPSEEK_API_KEY
)

:: Step 3 - Start services
echo [3/3] Starting services...
start /min "SpeakCAI-Server" cmd /c "cd /d "%SERVER%" && npm run dev"
start /min "SpeakCAI-Client" cmd /c "cd /d "%CLIENT%" && npm run dev"

echo   Backend:  http://localhost:3000
echo   Frontend: http://localhost:5173
echo.

timeout /t 3 /nobreak >nul
start http://localhost:5173
exit
