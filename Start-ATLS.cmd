@echo off
setlocal
if not exist "%~dp0.venv\Scripts\python.exe" (
    echo Python environment not found. Follow the setup steps in README.md.
    exit /b 1
)
"%~dp0.venv\Scripts\python.exe" "%~dp0scripts\start_atls.py" %*
exit /b %errorlevel%
