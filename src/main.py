#!/usr/bin/env python3
"""
Audio Interpreter - A tool that captures system audio and transcribes it using OpenAI's Whisper API
"""

import os
import sys
import time
import threading
import tempfile
import wave
from pathlib import Path
import numpy as np
from dotenv import load_dotenv
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QPushButton,
    QLabel, QTextEdit, QComboBox, QHBoxLayout, QFileDialog
)
from PyQt6.QtCore import QTimer, pyqtSignal, QObject, Qt

# For handling audio
import pyaudiowpatch as pyaudio
import openai

# Load environment variables
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

# Audio settings
SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", "16000"))
CHANNELS = int(os.getenv("CHANNELS", "1"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1024"))
RECORD_SECONDS = int(os.getenv("RECORD_SECONDS", "5"))

class AudioSignals(QObject):
    """Custom signals for audio processing threads"""
    transcription_ready = pyqtSignal(str)
    error = pyqtSignal(str)

class AudioRecorder:
    """Handles recording audio from system output."""
    
    def __init__(self):
        self.p = pyaudio.PyAudio()
        self.signals = AudioSignals()
        self.is_recording = False
        self.recording_thread = None
        self.frames = []
        self.temp_file = None
        self.stream = None
        self.current_device = None
        
    def get_loopback_devices(self):
        """Get a list of available loopback devices."""
        loopback_devices = []
        
        with self.p.get_loopback_device_info_generator() as devices:
            for device in devices:
                loopback_devices.append({
                    'index': device['index'],
                    'name': device['name']
                })
                
        return loopback_devices
    
    def start_recording(self, device_index):
        """Start recording audio from the selected device."""
        if self.is_recording:
            return
            
        self.is_recording = True
        self.frames = []
        self.current_device = device_index
        
        # Start the recording in a separate thread
        self.recording_thread = threading.Thread(target=self._record)
        self.recording_thread.daemon = True
        self.recording_thread.start()
    
    def stop_recording(self):
        """Stop the current recording and save it to a temporary file."""
        if not self.is_recording:
            return
            
        self.is_recording = False
        
        if self.recording_thread:
            self.recording_thread.join()
            
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            
        # Save recording to a temporary file
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        
        with wave.open(self.temp_file.name, 'wb') as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(self.p.get_sample_size(pyaudio.paInt16))
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(b''.join(self.frames))
        
        # Transcribe the audio
        threading.Thread(target=self._transcribe_audio, args=(self.temp_file.name,)).start()
    
    def _record(self):
        """Record audio from the selected device."""
        try:
            # Get device info
            wasapi_info = self.p.get_host_api_info_by_type(pyaudio.paWASAPI)
            
            # Open stream in loopback mode
            self.stream = self.p.open(
                format=pyaudio.paInt16,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                frames_per_buffer=CHUNK_SIZE,
                input=True,
                input_device_index=self.current_device,
                stream_callback=self._callback
            )
            
            print(f"Recording started from device {self.current_device}")
            self.stream.start_stream()
            
            # Keep the stream active until recording is stopped
            while self.is_recording:
                time.sleep(0.1)
                
        except Exception as e:
            self.signals.error.emit(f"Recording error: {str(e)}")
            self.is_recording = False
    
    def _callback(self, in_data, frame_count, time_info, status):
        """Callback function for audio stream."""
        self.frames.append(in_data)
        return (in_data, pyaudio.paContinue)
    
    def _transcribe_audio(self, audio_file):
        """Transcribe audio using OpenAI's Whisper API."""
        try:
            client = openai.OpenAI()
            
            with open(audio_file, "rb") as file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=file
                )
            
            self.signals.transcription_ready.emit(transcription.text)
            
        except Exception as e:
            self.signals.error.emit(f"Transcription error: {str(e)}")
        
        # Clean up temporary file
        if os.path.exists(audio_file):
            os.unlink(audio_file)

    def cleanup(self):
        """Clean up resources."""
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        
        self.p.terminate()

class MainWindow(QMainWindow):
    """Main application window."""
    
    def __init__(self):
        super().__init__()
        self.audio_recorder = AudioRecorder()
        self.init_ui()
        
    def init_ui(self):
        """Initialize the user interface."""
        self.setWindowTitle("Audio Interpreter")
        self.setGeometry(100, 100, 800, 600)
        
        # Main widget and layout
        main_widget = QWidget()
        main_layout = QVBoxLayout()
        
        # Device selection
        device_layout = QHBoxLayout()
        device_label = QLabel("Select Audio Device:")
        self.device_combo = QComboBox()
        self.populate_devices()
        
        device_layout.addWidget(device_label)
        device_layout.addWidget(self.device_combo)
        main_layout.addLayout(device_layout)
        
        # Control buttons
        button_layout = QHBoxLayout()
        
        self.record_button = QPushButton("Start Recording")
        self.record_button.clicked.connect(self.toggle_recording)
        
        self.save_button = QPushButton("Save Transcription")
        self.save_button.clicked.connect(self.save_transcription)
        self.save_button.setEnabled(False)
        
        button_layout.addWidget(self.record_button)
        button_layout.addWidget(self.save_button)
        main_layout.addLayout(button_layout)
        
        # Status label
        self.status_label = QLabel("Ready")
        main_layout.addWidget(self.status_label)
        
        # Transcription display
        transcription_label = QLabel("Transcription:")
        main_layout.addWidget(transcription_label)
        
        self.transcription_text = QTextEdit()
        self.transcription_text.setReadOnly(True)
        main_layout.addWidget(self.transcription_text)
        
        # Set the main layout
        main_widget.setLayout(main_layout)
        self.setCentralWidget(main_widget)
        
        # Connect signals
        self.audio_recorder.signals.transcription_ready.connect(self.update_transcription)
        self.audio_recorder.signals.error.connect(self.show_error)
        
        # Auto-refresh device list periodically
        self.refresh_timer = QTimer()
        self.refresh_timer.timeout.connect(self.populate_devices)
        self.refresh_timer.start(5000)  # Refresh every 5 seconds
    
    def populate_devices(self):
        """Populate the device combo box with available loopback devices."""
        # Save the current selection
        current_text = self.device_combo.currentText()
        
        # Clear and repopulate
        self.device_combo.clear()
        
        devices = self.audio_recorder.get_loopback_devices()
        for device in devices:
            self.device_combo.addItem(device['name'], device['index'])
        
        # Restore previous selection if it exists
        if current_text:
            index = self.device_combo.findText(current_text)
            if index >= 0:
                self.device_combo.setCurrentIndex(index)
    
    def toggle_recording(self):
        """Toggle between recording and not recording."""
        if self.audio_recorder.is_recording:
            # Stop recording
            self.audio_recorder.stop_recording()
            self.record_button.setText("Start Recording")
            self.status_label.setText("Processing audio...")
        else:
            # Start recording
            device_index = self.device_combo.currentData()
            if device_index is not None:
                self.audio_recorder.start_recording(device_index)
                self.record_button.setText("Stop Recording")
                self.status_label.setText("Recording...")
    
    def update_transcription(self, text):
        """Update the transcription text area with the transcribed text."""
        self.transcription_text.append(text)
        self.status_label.setText("Transcription complete")
        self.save_button.setEnabled(True)
    
    def show_error(self, error_message):
        """Show an error message in the status label."""
        self.status_label.setText(f"Error: {error_message}")
        self.record_button.setText("Start Recording")
    
    def save_transcription(self):
        """Save the transcription to a file."""
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save Transcription", "", "Text Files (*.txt);;All Files (*)"
        )
        
        if file_path:
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(self.transcription_text.toPlainText())
                self.status_label.setText(f"Transcription saved to {file_path}")
            except Exception as e:
                self.status_label.setText(f"Error saving file: {str(e)}")
    
    def closeEvent(self, event):
        """Handle the window close event."""
        # Clean up audio resources
        self.audio_recorder.cleanup()
        event.accept()

def main():
    """Application entry point."""
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main() 