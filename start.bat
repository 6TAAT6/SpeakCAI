@echo off
chcp 65001 >nul
title SpeakCAI

taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

start /min "Server" cmd /c "cd /d d:\Reasonix_test2\server && npm run dev"
start /min "Client" cmd /c "cd /d d:\Reasonix_test2\client && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173
exit
