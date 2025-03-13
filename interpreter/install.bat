@echo off
echo Setting up Audio Interpreter...

:: Check if Python is installed
python --version 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo Python not found! Please install Python 3.8 or higher.
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
) else (
    echo Virtual environment already exists, skipping creation.
)

:: Activate virtual environment and install dependencies
echo Activating virtual environment and installing dependencies...
call venv\Scripts\activate.bat && ^
pip install -e .

if %ERRORLEVEL% NEQ 0 (
    echo Failed to install dependencies.
    exit /b 1
)

echo.
echo Installation completed successfully!
echo.
echo To run the application:
echo 1. Open a command prompt in this directory
echo 2. Run: venv\Scripts\python src\main.py
echo.
echo Press any key to exit...
pause > nul 