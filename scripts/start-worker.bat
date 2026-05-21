@echo off
title LetusLogis RPA Worker

REM Move to project root (parent of /scripts)
cd /d "%~dp0\.."

REM Make logs dir if missing
if not exist "logs" mkdir logs

echo.
echo ===== LetusLogis Local RPA Worker =====
echo Started: %date% %time%
echo Project: %cd%
echo.

REM Use full node path so Task Scheduler finds it without PATH env
"C:\Program Files\nodejs\node.exe" scripts/worker.mjs >> logs\worker.log 2>&1

echo.
echo ===== Worker exited at %date% %time% =====
timeout /t 5 /nobreak >nul
