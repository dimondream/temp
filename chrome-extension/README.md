# Tab Audio Recorder Chrome Extension

A Chrome extension that captures audio from browser tabs in the background and allows you to save, listen to, and download the recordings.

## Features

- Record audio from any tab
- Display recording status with a badge on the extension icon
- View list of all recordings in the popup
- Play, download, or delete recordings
- Automatic file naming with timestamps and duration

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. Make sure to replace the placeholder icon files with actual PNG files

## Usage

1. Navigate to a tab with audio content you want to record
2. Click the extension icon in the toolbar to start recording
3. Click it again to stop recording
4. Click the extension icon and open the popup to see your recordings
5. Use the controls to play, download, or delete recordings

## Testing

The extension includes a test HTML file (`test-audio.html`) that you can use to test audio recording functionality. Open it in Chrome, play the audio or use the text-to-speech feature, and record using the extension.

## Technical Details

- Uses the Chrome tabCapture API to capture audio from tabs
- Offscreen document for processing the audio in the background
- MediaRecorder API for recording audio streams
- Chrome Storage API for saving recordings
- Popup UI built with vanilla JavaScript

## Permissions

This extension requires the following permissions:

- `tabCapture`: To capture audio from tabs
- `offscreen`: To process audio in the background
- `storage`: To save recordings
- `activeTab`: To access information about the current tab

## Known Issues

- Recording stops if the background service worker is terminated
- Cannot record from secure websites like chrome:// URLs
- Large recordings may use significant storage space

## License

MIT
