#!/bin/bash
echo "Creating virtual environment..."

# Try to find Python installation
if command -v python3 &> /dev/null; then
    PYTHON_PATH=python3
else
    PYTHON_PATH=python
    echo "Using default Python..."
fi

echo "Using Python at: $(which $PYTHON_PATH)"
$PYTHON_PATH --version

echo "Creating virtual environment..."
$PYTHON_PATH -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo "Upgrading pip..."
python -m pip install --upgrade pip

echo "Installing package in development mode..."
python -m pip install -e .

echo "Installation complete!"
echo "To run the application, use: run.bat"
echo "To run tests, use: test.bat" 