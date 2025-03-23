# Transcription App with Floating UI

A browser extension that captures tab audio and transcribes it in real-time using AWS Transcribe. Features a draggable floating UI similar to commercial transcription tools.

## Features

- **Tab Audio Capture**: Captures audio from browser tabs using Chrome's tabCapture API
- **Real-time Transcription**: Transcribes audio in real-time using AWS Transcribe
- **Floating UI**: Draggable, minimizable floating window that stays on top
- **Multiple Languages**: Supports transcription in multiple languages
- **Save & Copy**: Save transcriptions as text files or copy to clipboard
- **Microphone Fallback**: Falls back to microphone input if tab capture isn't available

## Installation

### Development Mode

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build the extension:
   ```
   npm run build
   ```
4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `build` folder

### From Chrome Web Store (Coming Soon)

## Usage

1. **Activate the Extension**:

   - Click the extension icon in your browser toolbar
   - Grant necessary permissions when prompted

2. **Start Transcription**:

   - The floating UI will appear on your screen
   - Click the play button (▶) to start transcription
   - The button will turn red (■) when recording

3. **Manage Transcription**:

   - Use the minimize button (↘) to collapse the window
   - Drag the header bar to reposition the window
   - Use the buttons to:
     - 🔊/🔇: Mute/unmute
     - 🗑️: Clear transcript
     - 📋: Copy to clipboard
     - 💾: Download as text file

4. **Language Selection**:
   - Choose your preferred language from the dropdown
   - The transcription will restart in the new language if already recording

## Troubleshooting

### Extension Context Errors

If you see "Extension context is invalid" errors:

1. Reload the page
2. Make sure the extension is enabled
3. Try closing and reopening Chrome
4. Ensure you're not in Device Emulation mode in DevTools

### Tab Capture Issues

Tab capture requires:

1. User interaction (click on extension icon)
2. Desktop Chrome (not mobile or device emulation mode)
3. Proper permissions

## Privacy

This extension:

- Only captures audio when you explicitly start recording
- Processes audio through AWS Transcribe
- Doesn't store audio or transcriptions on servers
- All data stays on your device unless you choose to save it

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
