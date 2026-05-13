@echo off
REM ============================================================
REM LetusLogis RPA Worker 시작 스크립트
REM ------------------------------------------------------------
REM Windows 작업 스케줄러에 이 파일을 등록하면 PC 부팅 시 자동 실행됨.
REM
REM 사용법:
REM   1) 더블클릭하면 즉시 실행됨 (창 닫으면 종료)
REM   2) 작업 스케줄러에서 "작업 시 다음 프로그램 시작" 으로 등록
REM
REM 환경:
REM   - Node.js 필요 (https://nodejs.org)
REM   - .env 파일에 Supabase 자격증명 있어야 함
REM ============================================================

REM 이 .bat 파일이 있는 폴더의 부모(=프로젝트 루트) 로 이동
cd /d "%~dp0\.."

REM 로그 디렉터리 생성 (없으면)
if not exist "logs" mkdir logs

REM 시작 메시지
echo.
echo ===== LetusLogis Local RPA Worker =====
echo Started at: %date% %time%
echo Working dir: %cd%
echo Logs:        logs\worker.log
echo Press Ctrl+C to stop.
echo.

REM Worker 실행 — stdout/stderr 를 파일에도 같이 기록
REM (날짜별로 로그 파일 분리하고 싶으면 worker_%date:~0,4%%date:~5,2%%date:~8,2%.log 형태로)
node scripts/worker.mjs

REM 종료 시 표시 (실수로 닫혔는지 확인용)
echo.
echo ===== Worker exited at %date% %time% =====
echo (이 창은 자동으로 닫히지 않습니다. 5초 후 닫힙니다.)
timeout /t 5 /nobreak >nul
