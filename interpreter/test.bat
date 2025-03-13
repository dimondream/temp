@echo off
echo Running Whisper API Integration Test...

:: Check if virtual environment exists
if not exist venv (
    echo Virtual environment not found. Please run install.bat first.
    exit /b 1
)

:: Activate virtual environment and run the test script
call venv\Scripts\activate.bat && ^
python src\test_whisper.py

if %ERRORLEVEL% NEQ 0 (
    echo An error occurred while running the test.
    exit /b 1
)

exit /b 0 