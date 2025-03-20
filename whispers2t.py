#!/usr/bin/env python
# To run this script with your conda environment:
# Method 1: Activate the environment first, then run the script
#   conda activate whispers2t
#   python whispers2t.py
#
# Method 2: Use the full path to the Python interpreter
#   C:/Users/huang/anaconda3/envs/whispers2t/python.exe whispers2t.py

import whisper_s2t
import pyaudiowpatch as pyaudio
import numpy as np
import time
import wave
import os
import tempfile
import logging
import threading
from collections import deque
from functools import lru_cache

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('WhisperTranscriber')

# Audio settings
CHUNK = 4096
FORMAT = pyaudio.paInt16
CHANNELS = 1
TARGET_SAMPLE_RATE = 16000  # Target sample rate for Whisper
MAX_BUFFER_SECONDS = 30  # Increased from 10 to 30 seconds for better context
WINDOW_SIZE_SECONDS = 15  # Sliding window size for transcription

# We'll maintain a history of recent transcriptions for context
class TranscriptionHistory:
    def __init__(self, max_history=5):
        self.history = []
        self.max_history = max_history
        
    def add(self, text):
        if not text:
            return
            
        # Only add if it's different from the last entry
        if not self.history or text != self.history[-1]:
            self.history.append(text)
            # Trim history if needed
            if len(self.history) > self.max_history:
                self.history.pop(0)
    
    def get_prompt(self):
        """Get recent history as a prompt for the next transcription"""
        if not self.history:
            return None
        
        # Return the most recent transcription as context
        return self.history[-1]

def list_audio_devices():
    """List available audio input devices with their sample rates"""
    p = pyaudio.PyAudio()
    info = "\nAvailable audio input devices:\n"
    
    # Get regular input devices
    for i in range(p.get_device_count()):
        dev = p.get_device_info_by_index(i)
        if dev.get('maxInputChannels') > 0:
            sample_rate = int(dev.get('defaultSampleRate', 0))
            info += f"Index {i}: {dev.get('name')} - {sample_rate} Hz\n"
    
    # Try to get WASAPI loopback devices
    try:
        default_loopback = p.get_default_wasapi_loopback()
        if default_loopback:
            info += f"\nWASAPI Loopback devices (use these for system audio):\n"
            info += f"Index {default_loopback['index']}: {default_loopback['name']} (loopback) - {int(default_loopback['defaultSampleRate'])} Hz\n"
    except Exception as e:
        info += f"\nUnable to detect WASAPI loopback devices: {e}\n"
    
    p.terminate()
    return info

def get_device_by_index(p, device_index):
    """Get device info, handling special case for loopback devices"""
    try:
        # First try regular device
        device_info = p.get_device_info_by_index(device_index)
        
        # If it's a loopback device (name contains "loopback" case insensitive)
        if "loopback" in device_info.get('name', '').lower():
            # Get the proper loopback device
            try:
                loopback_device = p.get_wasapi_loopback_analogue_by_index(device_index)
                if loopback_device:
                    return loopback_device
            except:
                # Fall back to default loopback
                default_loopback = p.get_default_wasapi_loopback()
                if default_loopback:
                    return default_loopback
        
        return device_info
    except Exception as e:
        logger.error(f"Error getting device {device_index}: {e}")
        return None

class OptimizedAudioTranscriber:
    def __init__(self, model_identifier="medium", backend="CTranslate2", 
                 device="cpu", compute_type="int8", lang_code="en",
                 vad_filter=True):
        """Initialize the transcriber with WhisperS2T model and audio processing"""
        logger.info(f"Loading {model_identifier} model with {backend} backend...")
        self.model = whisper_s2t.load_model(
            model_identifier=model_identifier, 
            backend=backend,
            device=device,
            compute_type=compute_type
        )
        logger.info("Model loaded successfully!")
        
        # Set improved transcription parameters
        self.lang_code = lang_code
        self.vad_filter = vad_filter  # Whether to use VAD filtering
        
        self.p = None
        self.stream = None
        self.audio_buffer = []  # Store raw audio chunks
        self.is_recording = False
        self.transcription_thread = None
        self.lock = threading.Lock()
        self.last_transcription = ""
        self.device_sample_rate = TARGET_SAMPLE_RATE  # Will be updated with actual device rate
        self.transcription_history = TranscriptionHistory()
        
        # Create a temp dir for audio files that will be cleaned up automatically
        self.temp_dir = tempfile.TemporaryDirectory()
    
    def __del__(self):
        """Clean up resources"""
        self.stop_recording()
        if self.temp_dir:
            self.temp_dir.cleanup()
        if self.p:
            self.p.terminate()
    
    def _audio_callback(self, in_data, frame_count, time_info, status):
        """Callback for audio stream - collect audio chunks"""
        with self.lock:
            self.audio_buffer.append(in_data)
        return (in_data, pyaudio.paContinue)
    
    def _normalize_audio(self, audio_file):
        """Normalize audio volume for better recognition"""
        # Create a path for the normalized audio
        normalized_path = os.path.join(self.temp_dir.name, f"normalized_{time.time()}.wav")
        
        try:
            # Use ffmpeg for normalization
            import subprocess
            cmd = [
                "ffmpeg",
                "-y",  # Overwrite output file if it exists
                "-i", audio_file,  # Input file
                "-af", "loudnorm=I=-16:LRA=11:TP=-1.5",  # Normalize to broadcast standards
                normalized_path  # Output file
            ]
            
            # Run ffmpeg (hide output)
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            if result.returncode == 0:
                # Successfully normalized, use the new file
                return normalized_path
            else:
                # Log error and return original file
                logger.error(f"Normalization error: {result.stderr.decode()}")
                return audio_file
                
        except Exception as e:
            logger.error(f"Error during normalization: {e}")
            return audio_file
    
    def _save_audio_buffer(self):
        """Save current audio buffer to a WAV file"""
        temp_path = os.path.join(self.temp_dir.name, f"audio_{time.time()}.wav")
        
        # First save at the device's native sample rate
        with wave.open(temp_path, 'wb') as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(self.p.get_sample_size(FORMAT))
            wf.setframerate(self.device_sample_rate)
            
            with self.lock:
                if not self.audio_buffer:
                    return None
                
                # Write all chunks to the file
                for chunk in self.audio_buffer:
                    wf.writeframes(chunk)
        
        # If device sample rate is not 16kHz, we need to convert
        if self.device_sample_rate != TARGET_SAMPLE_RATE:
            # Create a temporary file for the resampled audio
            resampled_path = os.path.join(self.temp_dir.name, f"resampled_{time.time()}.wav")
            
            try:
                # Use ffmpeg for resampling - use high quality settings for better accuracy
                import subprocess
                cmd = [
                    "ffmpeg",
                    "-y",  # Overwrite output file if it exists
                    "-i", temp_path,  # Input file
                    "-ar", str(TARGET_SAMPLE_RATE),  # Output sample rate
                    "-ac", "1",  # Output channels (mono)
                    "-af", "highpass=f=50,lowpass=f=7000",  # Filter frequencies for speech
                    "-q:a", "0",  # Use highest quality
                    resampled_path  # Output file
                ]
                
                # Run ffmpeg (hide output)
                result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                
                if result.returncode == 0:
                    # Successfully resampled with filtering, use the new file
                    return resampled_path
                else:
                    # Log error and try a simpler conversion
                    logger.error(f"Advanced resampling error: {result.stderr.decode()}")
                    # Try simpler conversion
                    cmd = [
                        "ffmpeg",
                        "-y",
                        "-i", temp_path,
                        "-ar", str(TARGET_SAMPLE_RATE),
                        "-ac", "1",
                        resampled_path
                    ]
                    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    if result.returncode == 0:
                        return resampled_path
                    else:
                        return temp_path
                    
            except Exception as e:
                logger.error(f"Error during resampling: {e}")
                return temp_path
        
        # Normalize the audio
        return self._normalize_audio(temp_path)
    
    def _limit_buffer_size(self):
        """Limit the buffer size to maximum allowed length"""
        with self.lock:
            # Calculate max chunks based on device rate and max duration
            max_chunks = int((self.device_sample_rate * MAX_BUFFER_SECONDS) / CHUNK)
            
            # Remove oldest chunks if buffer is too large
            if len(self.audio_buffer) > max_chunks:
                excess = len(self.audio_buffer) - max_chunks
                self.audio_buffer = self.audio_buffer[excess:]
                logger.debug(f"Limited buffer size, removed {excess} old chunks")
    
    def start_recording(self, input_device_index=None):
        """Start recording audio from the specified device"""
        if self.is_recording:
            logger.warning("Already recording")
            return
            
        try:
            # Initialize PyAudio
            if not self.p:
                self.p = pyaudio.PyAudio()
            
            # Get device info, with special handling for loopback devices
            device_info = None
            if input_device_index is not None:
                device_info = get_device_by_index(self.p, input_device_index)
                if not device_info:
                    raise ValueError(f"Device with index {input_device_index} not found or not a valid input device")
                
                self.device_sample_rate = int(device_info.get('defaultSampleRate', TARGET_SAMPLE_RATE))
                input_channels = int(device_info.get('maxInputChannels', 1))
                logger.info(f"Device: {device_info.get('name')} - Sample rate: {self.device_sample_rate} Hz - Channels: {input_channels}")
            else:
                # Default device
                self.device_sample_rate = TARGET_SAMPLE_RATE
                input_channels = CHANNELS
            
            # Clear previous buffer
            with self.lock:
                self.audio_buffer = []
            
            # Open audio stream with device's native sample rate
            self.stream = self.p.open(
                format=FORMAT,
                channels=input_channels,  # Use the device's channel count
                rate=self.device_sample_rate,  # Use device's native rate
                input=True,
                input_device_index=input_device_index,
                frames_per_buffer=CHUNK,
                stream_callback=self._audio_callback
            )
            
            self.is_recording = True
            logger.info(f"Started recording from device index: {input_device_index} at {self.device_sample_rate} Hz")
            
            # Start transcription thread
            self.transcription_thread = threading.Thread(target=self._transcription_loop)
            self.transcription_thread.daemon = True
            self.transcription_thread.start()
            
        except Exception as e:
            logger.error(f"Error starting recording: {e}")
            if self.stream:
                self.stream.close()
                self.stream = None
            self.is_recording = False
            raise
    
    def stop_recording(self):
        """Stop recording and clean up resources"""
        if not self.is_recording:
            return
            
        logger.info("Stopping recording...")
        self.is_recording = False
        
        # Stop and close the stream
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            self.stream = None
        
        # Wait for transcription thread to finish
        if self.transcription_thread:
            self.transcription_thread.join(timeout=2.0)
            self.transcription_thread = None
            
        logger.info("Recording stopped")
    
    def _transcription_loop(self):
        """Background thread that periodically transcribes audio"""
        while self.is_recording:
            # Sleep to collect enough audio
            time.sleep(3.0)  # Increased from 2.0 to 3.0 seconds for more context
            
            # Limit buffer size
            self._limit_buffer_size()
            
            # Process current buffer
            try:
                # Get buffer length
                with self.lock:
                    buffer_length = len(self.audio_buffer)
                
                if buffer_length > 5:  # Make sure we have at least some data
                    # Transcribe current buffer
                    transcription = self.transcribe_buffer()
                    
                    # Print transcription if we got something new
                    if transcription and transcription != self.last_transcription:
                        print(f"\nTranscription: {transcription}")
                        self.last_transcription = transcription
                        # Add to history
                        self.transcription_history.add(transcription)
            except Exception as e:
                logger.error(f"Error in transcription loop: {e}")
    
    def transcribe_buffer(self):
        """Transcribe the current audio buffer"""
        # Save audio buffer to file
        audio_file = self._save_audio_buffer()
        if not audio_file:
            return ""
            
        try:
            # Get prompt from history for context
            prompt = self.transcription_history.get_prompt()
            
            # Transcribe with WhisperS2T using only supported parameters
            # Some parameters like beam_size are not available in your version
            results = self.model.transcribe_with_vad(
                [audio_file],
                lang_codes=[self.lang_code],
                tasks=['transcribe'],
                initial_prompts=[prompt] if prompt else [None],
                batch_size=1
                # Removed unsupported parameters:
                # beam_size, best_of, temperature, patience, etc.
            )
            
            # Check if we got results
            if not results or len(results) == 0 or len(results[0]) == 0:
                return ""
                
            # Get the main utterance
            utterance = results[0][0]
            
            # Check if it's a valid utterance
            if not isinstance(utterance, dict) or 'text' not in utterance:
                return ""
                
            # Get the text and do some post-processing
            text = utterance.get('text', '').strip()
            
            # Skip if very short and no punctuation (likely noise)
            if len(text) < 3 and not any(c in text for c in '.!?,;'):
                return ""
                
            return text
            
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return ""

def main():
    print(list_audio_devices())
    
    # Ask for model size preference
    print("\nSelect model size:")
    print("1. small (faster but less accurate)")
    print("2. medium (recommended balance for CPU)")
    print("3. large-v2 (slowest but most accurate)")
    
    model_choice = input("Enter choice [2]: ") or "2"
    
    model_map = {
        "1": "small",
        "2": "medium",
        "3": "large-v2"
    }
    
    model_id = model_map.get(model_choice, "medium")
    
    # Create the transcriber with optimized settings
    transcriber = OptimizedAudioTranscriber(
        model_identifier=model_id,
        backend="CTranslate2",
        device="cpu", 
        compute_type="int8"
    )
    
    try:
        # Get device index (or use default)
        device_index = int(input("\nEnter input device index (or press Enter for default): ") or "-1")
        if device_index == -1:
            device_index = None
            
        print("\nStarting transcription. Press Ctrl+C to stop...\n")
        transcriber.start_recording(input_device_index=device_index)
        
        # Keep running until user interrupts
        while True:
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        print("\nStopping...")
    except ValueError as e:
        print(f"\nError: {e}")
    finally:
        if 'transcriber' in locals():
            transcriber.stop_recording()
        print("Transcription ended.")

if __name__ == "__main__":
    main()