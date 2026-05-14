@echo off
chcp 65001 >nul
title LetusLogis RPA Worker

REM ============================================================
REM LetusLogis RPA Worker startup script
REM ------------------------------------------------------------
REM Usage:
REM   1) Double-click to run immediately (closing window stops it)
REM   2) Register in Windows Task Scheduler with trigger
REM      "When I log on" or "When the computer starts"
REM
REM Requirements:
REM   - Node.js installed (https://nodejs.org)
REM   - .env file must contain Supabase credentials
REM ============================================================

REM Move to project root (parent of /scripts)
cd /d "%~dp0\.."

REM Make logs dir if missing
if not exist "logs" mkdir logs

echo.
echo ===== LetusLogis Local RPA Worker =====
echo Started   : %date% %time%
echo Project   : %cd%
echo Press Ctrl+C to stop.
echo.

REM Run the worker — append all output to logs/worker.log
REM (so the script works fine when launched hidden by Task Scheduler)
node scripts/worker.mjs >> logs\worker.log 2>&1

echo.
echo ===== Worker exited at %date% %time% =====
echo This window will close in 5 seconds.
timeout /t 5 /nobreak >nul
