@echo off
echo Creating virtual environment...
python -m venv venv

echo Activating virtual environment...
call venv\Scripts\activate

echo Upgrading pip...
python -m pip install --upgrade pip

echo Installing package in development mode...
python -m pip install -e .

echo Installation complete!
echo To run the application, use: run.bat
echo To run tests, use: test.bat
pause 