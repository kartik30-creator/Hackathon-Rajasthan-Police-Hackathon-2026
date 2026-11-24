@echo off
title TRACEPOINT AI
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher "py" was not found. Install Python 3.10-3.12 and enable Add Python to PATH.
  pause
  exit /b 1
)
if not exist .venv (
  echo Creating virtual environment...
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Could not create environment. Try: py -3.11 -m venv .venv
    pause
    exit /b 1
  )
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed. Check your internet connection and Python version.
  pause
  exit /b 1
)
echo.
echo Starting TRACEPOINT AI at http://127.0.0.1:8000
start "" http://127.0.0.1:8000
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
pause
