@echo off
echo Starting Audio Interpreter...

:: Check if virtual environment exists
if not exist venv (
    echo Virtual environment not found. Please run install.bat first.
    exit /b 1
)

:: Activate virtual environment and run the application
call venv\Scripts\activate.bat && ^
python src\main.py

if %ERRORLEVEL% NEQ 0 (
    echo An error occurred while running the application.
    exit /b 1
)

exit /b 0 