@echo off
echo Activating virtual environment...
call venv\Scripts\activate

echo Running audio interpreter...
python src\main.py

echo Done.
pause 