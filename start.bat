@echo off
echo 🚀 SpeakCAI 启动中...

start "SpeakCAI Backend" cmd /k "cd /d %~dp0server && npm run dev"
start "SpeakCAI Frontend" cmd /k "cd /d %~dp0client && npm run dev"

timeout /t 4 /nobreak >nul
start http://localhost:5173
