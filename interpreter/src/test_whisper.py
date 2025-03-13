#!/usr/bin/env python3
"""
Test script to verify that Whisper API integration is working correctly.
This script will record a short audio sample and transcribe it.
"""

import os
import sys
import time
import tempfile
import wave
from pathlib import Path
from dotenv import load_dotenv

# Import the necessary libraries
try:
    import pyaudiowpatch as pyaudio
    import openai
    import numpy as np
except ImportError as e:
    print(f"Error importing required libraries: {e}")
    print("Please make sure you have installed all dependencies with 'pip install -e .'")
    sys.exit(1)

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
if not env_path.exists():
    print(f"Error: .env file not found at {env_path}")
    print("Please create a .env file with your OpenAI API key.")
    sys.exit(1)

load_dotenv(dotenv_path=env_path)

# Check OpenAI API key
api_key = os.getenv("OPENAI_API_KEY")
if not api_key or api_key == "your_openai_api_key_here":
    print("Error: OpenAI API key not found or not set in .env file.")
    print("Please set the OPENAI_API_KEY environment variable.")
    sys.exit(1)

# Audio settings
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_SIZE = 1024
RECORD_SECONDS = 5

def get_loopback_devices():
    """Get a list of available loopback devices."""
    p = pyaudio.PyAudio()
    loopback_devices = []
    
    try:
        # Check if PyAudio has the loopback device info generator
        if not hasattr(p, 'get_loopback_device_info_generator'):
            print("Error: PyAudioWPatch is not installed correctly.")
            print("The get_loopback_device_info_generator method is not available.")
            print("Please make sure you've installed PyAudioWPatch, not the regular PyAudio.")
            return []
        
        with p.get_loopback_device_info_generator() as devices:
            for device in devices:
                loopback_devices.append({
                    'index': device['index'],
                    'name': device['name']
                })
                
        if not loopback_devices:
            print("No loopback devices found. Make sure your audio devices are enabled in Windows settings.")
    except Exception as e:
        print(f"Error getting loopback devices: {e}")
    finally:
        p.terminate()
        
    return loopback_devices

def record_audio(device_index):
    """Record audio from the selected device."""
    p = pyaudio.PyAudio()
    frames = []
    
    try:
        stream = p.open(
            format=pyaudio.paInt16,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            frames_per_buffer=CHUNK_SIZE,
            input=True,
            input_device_index=device_index
        )
        
        print(f"\nRecording {RECORD_SECONDS} seconds of audio from device {device_index}...")
        
        for i in range(0, int(SAMPLE_RATE / CHUNK_SIZE * RECORD_SECONDS)):
            data = stream.read(CHUNK_SIZE)
            frames.append(data)
            # Print progress
            progress = i / int(SAMPLE_RATE / CHUNK_SIZE * RECORD_SECONDS) * 100
            print(f"Recording: {progress:.1f}%", end="\r")
            
        print("\nRecording complete!")
        
        stream.stop_stream()
        stream.close()
        
        # Save recording to a temporary file
        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        
        with wave.open(temp_file.name, 'wb') as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(b''.join(frames))
        
        print(f"Audio saved to {temp_file.name}")
        return temp_file.name
    
    except Exception as e:
        print(f"Error recording audio: {e}")
        return None
    finally:
        p.terminate()

def transcribe_audio(audio_file):
    """Transcribe audio using OpenAI's Whisper API."""
    try:
        client = openai.OpenAI()
        
        print("\nTranscribing audio with Whisper API...")
        
        with open(audio_file, "rb") as file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=file
            )
        
        print("\nTranscription successful!")
        print(f"\nTranscription: {transcription.text}")
        
        return transcription.text
    
    except Exception as e:
        print(f"Error transcribing audio: {e}")
        return None

def main():
    """Main function."""
    print("===== Whisper API Integration Test =====")
    print("\nThis script will test the Whisper API integration by recording audio and transcribing it.")
    
    # Get loopback devices
    devices = get_loopback_devices()
    
    if not devices:
        print("No loopback devices found. Exiting.")
        return
    
    print("\nAvailable loopback devices:")
    for i, device in enumerate(devices):
        print(f"{i+1}. {device['name']} (device index: {device['index']})")
    
    # Choose device
    try:
        choice = int(input("\nEnter the number of the device to use for recording: "))
        if choice < 1 or choice > len(devices):
            print("Invalid choice. Exiting.")
            return
        
        device_index = devices[choice-1]['index']
        
        # Record audio
        audio_file = record_audio(device_index)
        if not audio_file:
            print("Failed to record audio. Exiting.")
            return
        
        # Transcribe audio
        transcription = transcribe_audio(audio_file)
        if not transcription:
            print("Failed to transcribe audio. Exiting.")
            return
        
        print("\nTest completed successfully!")
        
        # Clean up temporary file
        if os.path.exists(audio_file):
            os.unlink(audio_file)
            
    except ValueError:
        print("Invalid input. Please enter a number.")
    except KeyboardInterrupt:
        print("\nTest interrupted by user.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main() 