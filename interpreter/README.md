# Audio Interpreter

A Python-based tool that captures audio from your computer system or browser and transcribes it using OpenAI's Whisper API.

## Features

- Capture audio from system output or Chrome browser
- Transcribe audio using OpenAI's Whisper API
- Display transcription results in real-time
- Save transcriptions to text files

## Requirements

- Python 3.8+
- Windows OS (required for WASAPI loopback audio capture)
- OpenAI API Key

## Quick Start (Windows)

1. Clone or download this repository
2. Edit the `.env` file to add your OpenAI API key
3. Run `install.bat` to set up the environment and dependencies
4. Run `test.bat` to verify that audio capture and Whisper API integration are working
5. Run `run.bat` to start the application

## Manual Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/audio-interpreter.git
cd audio-interpreter
```

2. Create a virtual environment:

```bash
python -m venv venv
```

3. Activate the virtual environment:

```bash
# On Windows
venv\Scripts\activate
```

4. Install dependencies:

```bash
pip install -e .
```

5. Edit the `.env` file in the project root and add your OpenAI API key:

```
OPENAI_API_KEY=your_api_key_here
```

## Testing the Installation

To make sure everything is set up correctly, you can run the test script:

```bash
python src/test_whisper.py
```

This script will:

1. Check if your OpenAI API key is configured correctly
2. List all available audio devices that can be captured
3. Let you select a device for a test recording
4. Record 5 seconds of audio from the selected device
5. Send the audio to the Whisper API for transcription
6. Display the transcription result

## Usage

1. Run the application:

```bash
python src/main.py
```

2. Select an audio device from the dropdown (usually your speakers or headphones)
3. Click "Start Recording" to begin capturing audio
4. Click "Stop Recording" when you want to process the audio and get a transcription
5. The transcription will appear in the text area
6. Click "Save Transcription" to save the result to a file

## How It Works

1. The application uses PyAudioWPatch's WASAPI loopback capabilities to capture audio output from your Windows system
2. Captured audio is saved to a temporary WAV file
3. The audio file is sent to OpenAI's Whisper API for transcription
4. The transcription results are displayed in the application and can be saved to a text file

## Troubleshooting

- **No devices in dropdown**: Make sure you have audio devices enabled in Windows sound settings
- **API errors**: Verify your OpenAI API key in the `.env` file
- **Audio not being captured**: Try selecting a different audio device from the dropdown
- **Installation issues**: If you have trouble with PyAudioWPatch, you may need to install Visual C++ build tools for Python

## License

MIT

## Acknowledgments

- OpenAI for the Whisper API
- PyAudioWPatch for WASAPI loopback support
