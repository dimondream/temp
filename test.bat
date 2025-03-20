@echo off
echo Activating virtual environment...
call venv\Scripts\activate

echo Running tests...
python src\test_whisper.py

echo Done.
pause 