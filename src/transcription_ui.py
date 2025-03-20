#!/usr/bin/env python3
"""
Continuous audio transcription UI using Whisper API.
This module provides a simple UI for recording and transcribing audio in real-time.
"""

import os
import sys
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QTextEdit, QLabel, QComboBox, QMessageBox, QProgressBar
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer

# Import local modules
from audio_recorder import AudioRecorder
from transcription_service import TranscriptionService

# Import the necessary libraries
try:
    import pyaudiowpatch as pyaudio
    import openai
except ImportError as e:
    print(f"Error importing required library: {e}")
    print("Please make sure all dependencies are installed:")
    print("  pip install -e .")
    sys.exit(1)

# Load environment variables
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

# Check for OpenAI API key
if not os.getenv("OPENAI_API_KEY"):
    print("Error: OPENAI_API_KEY not found in environment variables.")
    print("Please add your OpenAI API key to the .env file.")
    sys.exit(1)

# Configure OpenAI client
openai.api_key = os.getenv("OPENAI_API_KEY")

class TranscriptionUI(QMainWindow):
    """Main window for the transcription application."""
    
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Audio Transcription")
        self.setMinimumSize(600, 400)
        
        # Initialize components
        self.audio_recorder = AudioRecorder(chunk_duration=10)  # 10-second chunks
        self.transcription_service = TranscriptionService()
        
        # Initialize UI components
        self.init_ui()
        
        # Initialize state
        self.is_recording = False
        self.chunk_count = 0
        
        # Set up timer for checking transcription results and status
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self.check_updates)
        self.update_timer.start(100)  # Check every 100ms for smoother updates
        
    def init_ui(self):
        """Initialize the user interface."""
        # Create central widget and layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        
        # Device selection
        device_layout = QHBoxLayout()
        device_label = QLabel("Audio Device:")
        self.device_combo = QComboBox()
        self.refresh_devices()
        device_layout.addWidget(device_label)
        device_layout.addWidget(self.device_combo)
        layout.addLayout(device_layout)
        
        # Control buttons
        button_layout = QHBoxLayout()
        self.start_button = QPushButton("Start Recording")
        self.start_button.clicked.connect(self.toggle_recording)
        self.stop_button = QPushButton("Stop Recording")
        self.stop_button.clicked.connect(self.toggle_recording)
        self.stop_button.setEnabled(False)
        button_layout.addWidget(self.start_button)
        button_layout.addWidget(self.stop_button)
        layout.addLayout(button_layout)
        
        # Status display
        self.status_label = QLabel("Ready")
        layout.addWidget(self.status_label)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 10)  # 10 seconds per chunk
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_bar)
        
        # Transcription display
        self.transcription_display = QTextEdit()
        self.transcription_display.setReadOnly(True)
        layout.addWidget(self.transcription_display)
        
        # Set up progress timer
        self.progress_timer = QTimer()
        self.progress_timer.timeout.connect(self.update_progress)
        
    def refresh_devices(self):
        """Refresh the list of available audio devices."""
        self.device_combo.clear()
        p = pyaudio.PyAudio()
        
        try:
            # Get default WASAPI loopback device
            default_loopback = p.get_default_wasapi_loopback()
            if default_loopback:
                self.device_combo.addItem(
                    f"{default_loopback['name']} (Index: {default_loopback['index']})",
                    default_loopback['index']
                )
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to get audio devices: {str(e)}")
        finally:
            p.terminate()
    
    def toggle_recording(self):
        """Toggle the recording state."""
        if not self.is_recording:
            self.start_recording()
        else:
            self.stop_recording()
    
    def start_recording(self):
        """Start the recording process."""
        try:
            device_index = self.device_combo.currentData()
            if device_index is None:
                QMessageBox.warning(self, "Error", "Please select an audio device.")
                return
                
            if self.audio_recorder.start_recording(device_index):
                self.transcription_service.start_processing(self.audio_recorder.audio_queue)
                self.is_recording = True
                self.start_button.setEnabled(False)
                self.stop_button.setEnabled(True)
                self.status_label.setText("Recording...")
                self.progress_bar.setValue(0)
                self.progress_timer.start(1000)  # Update every second
                self.chunk_count = 0
            else:
                QMessageBox.warning(self, "Error", "Failed to start recording.")
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to start recording: {str(e)}")
    
    def stop_recording(self):
        """Stop the recording process."""
        self.progress_timer.stop()
        self.progress_bar.setValue(0)
        self.audio_recorder.stop_recording()
        self.transcription_service.stop_processing()
        self.is_recording = False
        self.start_button.setEnabled(True)
        self.stop_button.setEnabled(False)
        self.status_label.setText("Ready")
        
        # Clean up temporary files
        self.audio_recorder.cleanup()
    
    def update_progress(self):
        """Update the progress bar."""
        if self.is_recording:
            current_value = self.progress_bar.value()
            if current_value < 10:  # 10 seconds per chunk
                self.progress_bar.setValue(current_value + 1)
            else:
                self.progress_bar.setValue(0)
                self.chunk_count += 1
                self.status_label.setText(f"Recording... (Chunk {self.chunk_count})")
    
    def check_updates(self):
        """Check for new transcription results and status updates."""
        if not self.is_recording:
            return
            
        # Check for status updates
        while True:
            status = self.transcription_service.get_next_status()
            if status is None:
                break
            self.status_label.setText(status)
            
        # Check for transcription results
        while True:
            transcription = self.transcription_service.get_next_transcription()
            if transcription is None:
                break
                
            # Append new transcription to display
            self.transcription_display.append(transcription)
            # Scroll to bottom
            self.transcription_display.verticalScrollBar().setValue(
                self.transcription_display.verticalScrollBar().maximum()
            )
    
    def closeEvent(self, event):
        """Handle application closure."""
        if self.is_recording:
            self.stop_recording()
        event.accept()

def main():
    """Main function to run the application."""
    app = QApplication(sys.argv)
    window = TranscriptionUI()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main() 