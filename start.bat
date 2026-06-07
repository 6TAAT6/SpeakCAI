@echo off
title SpeakCAI — 前后端
echo 🚀 SpeakCAI 启动中...

start /b cmd /c "cd /d %~dp0server && npm run dev"
start /b cmd /c "cd /d %~dp0client && npm run dev"

timeout /t 4 /nobreak >nul
start http://localhost:5173
echo.
echo ✅ 后端 http://localhost:3000
echo ✅ 前端 http://localhost:5173
echo.
echo 按任意键停止所有服务...
pause >nul
taskkill //F //IM node.exe 2>nul
echo 🛑 已关闭
