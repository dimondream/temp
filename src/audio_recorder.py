#!/usr/bin/env python3
"""
Audio recording module for continuous recording in chunks.
This module handles the audio recording process using PyAudioWPatch.
"""

import os
import wave
import tempfile
import threading
import queue
import subprocess
import shutil
import sys
from pathlib import Path
import pyaudiowpatch as pyaudio
from datetime import datetime
from pydub import AudioSegment

class AudioRecorder:
    """Class for handling continuous audio recording in chunks."""
    
    def __init__(self, chunk_duration=10):  # 10 seconds for faster processing
        """
        Initialize the audio recorder.
        
        Args:
            chunk_duration (int): Duration of each audio chunk in seconds
        """
        self.chunk_duration = chunk_duration
        self.is_recording = False
        self.recording_thread = None
        self.audio_queue = queue.Queue()
        self.current_chunk = []
        self.temp_dir = tempfile.gettempdir()
        self.recording_lock = threading.Lock()
        self.stream = None
        self.p = None
        self.frames = []  # Store frames temporarily
        
        # Configure pydub to use ffmpeg
        ffmpeg_path = self._find_ffmpeg()
        if ffmpeg_path:
            AudioSegment.converter = ffmpeg_path
            print(f"Configured pydub to use ffmpeg at: {ffmpeg_path}")
        else:
            print("Warning: ffmpeg not found. Audio will be saved in WAV format.")
            print("Please install ffmpeg from https://ffmpeg.org/download.html")
        
    def _find_ffmpeg(self):
        """Find ffmpeg executable in the system."""
        # First try to find ffmpeg in PATH
        ffmpeg_path = shutil.which('ffmpeg')
        if ffmpeg_path:
            print(f"Found ffmpeg in PATH: {ffmpeg_path}")
            return ffmpeg_path
            
        # Check common installation paths
        possible_paths = [
            os.path.join(os.environ.get('PROGRAMFILES', ''), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.environ.get('LOCALAPPDATA', ''), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.environ.get('USERPROFILE', ''), 'AppData', 'Local', 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.environ.get('USERPROFILE', ''), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            'ffmpeg.exe',  # Check if it's in current directory
        ]
        
        print("Checking common ffmpeg installation paths:")
        for path in possible_paths:
            print(f"Checking path: {path}")
            if os.path.exists(path):
                print(f"Found ffmpeg at: {path}")
                return path
                
        # Try to run ffmpeg -version to check if it's available
        try:
            result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True)
            if result.returncode == 0:
                print("Found ffmpeg through command execution")
                return 'ffmpeg'
        except Exception as e:
            print(f"Error checking ffmpeg version: {str(e)}")
                
        return None
            
    def start_recording(self, device_index):
        """
        Start recording audio from the specified device.
        
        Args:
            device_index (int): Index of the audio device to record from
            
        Returns:
            bool: True if recording started successfully, False otherwise
        """
        with self.recording_lock:
            if self.is_recording:
                return False
                
            self.is_recording = True
            self.frames = []  # Clear frames buffer
            self.recording_thread = threading.Thread(
                target=self._record_audio,
                args=(device_index,)
            )
            self.recording_thread.daemon = True  # Make thread daemon
            self.recording_thread.start()
            return True
        
    def stop_recording(self):
        """Stop the recording process."""
        with self.recording_lock:
            self.is_recording = False
            if self.stream:
                try:
                    self.stream.stop_stream()
                    self.stream.close()
                except Exception as e:
                    print(f"Error closing stream: {str(e)}")
            if self.p:
                try:
                    self.p.terminate()
                except Exception as e:
                    print(f"Error terminating PyAudio: {str(e)}")
            if self.recording_thread:
                self.recording_thread.join(timeout=1.0)  # Wait up to 1 second
            
    def get_next_chunk(self):
        """
        Get the next recorded audio chunk.
        
        Returns:
            str: Path to the audio chunk file, or None if no chunk is available
        """
        try:
            return self.audio_queue.get_nowait()
        except queue.Empty:
            return None
            
    def _save_chunk(self, frames, device_info):
        """Save audio frames to a file and add to queue."""
        if not frames:
            return
            
        # Save as WAV first
        temp_file = os.path.join(
            self.temp_dir,
            f"chunk_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        )
        wav_file = temp_file + '.wav'
        
        # Save raw audio data as WAV
        with wave.open(wav_file, 'wb') as wf:
            wf.setnchannels(int(device_info['maxInputChannels']))
            wf.setsampwidth(self.p.get_sample_size(pyaudio.paInt16))
            wf.setframerate(int(device_info['defaultSampleRate']))
            wf.writeframes(b''.join(frames))
        
        # If ffmpeg is not available, use WAV directly
        if not AudioSegment.converter:
            self.audio_queue.put(wav_file)
            self.current_chunk.append(wav_file)
            return
            
        try:
            # Convert to MP3 using pydub
            audio = AudioSegment.from_wav(wav_file)
            mp3_file = temp_file + '.mp3'
            
            # Export with high quality settings
            audio.export(
                mp3_file,
                format='mp3',
                parameters=[
                    "-q:a", "0",  # Use highest quality
                    "-b:a", "192k"  # Set bitrate to 192kbps
                ]
            )
            
            # Clean up WAV file
            os.unlink(wav_file)
            
            # Add MP3 file to queue
            self.audio_queue.put(mp3_file)
            self.current_chunk.append(mp3_file)
            
        except Exception as e:
            print(f"Error converting to MP3: {str(e)}")
            # If conversion fails, use WAV file
            self.audio_queue.put(wav_file)
            self.current_chunk.append(wav_file)
            
    def _record_audio(self, device_index):
        """Internal method for recording audio in chunks."""
        self.p = pyaudio.PyAudio()
        
        try:
            # Get device info
            device_info = self.p.get_device_info_by_index(device_index)
            default_rate = int(device_info['defaultSampleRate'])
            input_channels = int(device_info['maxInputChannels'])
            
            # Open stream
            self.stream = self.p.open(
                format=pyaudio.paInt16,
                channels=input_channels,
                rate=default_rate,
                input=True,
                input_device_index=device_index,
                frames_per_buffer=1024,
                stream_callback=None
            )
            
            # Calculate frames needed for chunk_duration
            frames_per_chunk = int(default_rate * self.chunk_duration)
            frames_collected = 0
            chunk_frames = []
            
            while self.is_recording:
                try:
                    data = self.stream.read(1024, exception_on_overflow=False)
                    chunk_frames.append(data)
                    frames_collected += 1024
                    
                    # If we have collected enough frames for a chunk
                    if frames_collected >= frames_per_chunk:
                        self._save_chunk(chunk_frames, device_info)
                        chunk_frames = []
                        frames_collected = 0
                        
                except Exception as e:
                    print(f"Error reading audio data: {str(e)}")
                    break
            
            # Save any remaining frames
            if chunk_frames:
                self._save_chunk(chunk_frames, device_info)
                
        except Exception as e:
            print(f"Error in recording thread: {str(e)}")
        finally:
            if self.stream:
                try:
                    self.stream.stop_stream()
                    self.stream.close()
                except Exception as e:
                    print(f"Error closing stream: {str(e)}")
            if self.p:
                try:
                    self.p.terminate()
                except Exception as e:
                    print(f"Error terminating PyAudio: {str(e)}")
            
    def cleanup(self):
        """Clean up temporary files."""
        for chunk_file in self.current_chunk:
            try:
                if os.path.exists(chunk_file):
                    os.unlink(chunk_file)
            except Exception as e:
                print(f"Error deleting temporary file {chunk_file}: {str(e)}")
        self.current_chunk.clear() 