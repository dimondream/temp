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

# Audio settings
SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", "16000"))
CHANNELS = int(os.getenv("CHANNELS", "1"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1024"))
RECORD_SECONDS = int(os.getenv("RECORD_SECONDS", "5"))

def get_loopback_devices():
    """Get a list of available loopback devices."""
    p = pyaudio.PyAudio()
    loopback_devices = []
    
    try:
        # Get default WASAPI loopback device
        default_loopback = p.get_default_wasapi_loopback()
        if not default_loopback:
            print("No default WASAPI loopback device found.")
            return []
            
        print("\nAvailable audio devices:")
        print(f"\nFound loopback device:")
        print(f"  Name: {default_loopback['name']}")
        print(f"  Index: {default_loopback['index']}")
        print(f"  Default Sample Rate: {default_loopback['defaultSampleRate']}")
        print(f"  Max Input Channels: {default_loopback['maxInputChannels']}")
        print(f"  Max Output Channels: {default_loopback['maxOutputChannels']}")
        loopback_devices.append(default_loopback)
        
        return loopback_devices
    
    except Exception as e:
        print(f"Error getting devices: {str(e)}")
        return []
    
    finally:
        p.terminate()

def record_audio(device_index):
    """Record audio from the selected device."""
    p = pyaudio.PyAudio()
    frames = []
    
    try:
        # Get device info
        device_info = p.get_device_info_by_index(device_index)
        default_rate = int(device_info['defaultSampleRate'])
        input_channels = int(device_info['maxInputChannels'])
        print(f"\nDevice information:")
        print(f"  Name: {device_info['name']}")
        print(f"  Index: {device_info['index']}")
        print(f"  Default Sample Rate: {default_rate}")
        print(f"  Max Input Channels: {input_channels}")
        print(f"  Max Output Channels: {device_info['maxOutputChannels']}")
        
        # Open stream
        stream = p.open(
            format=pyaudio.paInt16,
            channels=input_channels,
            rate=default_rate,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=CHUNK_SIZE,
            stream_callback=None
        )
        
        print(f"\nRecording {RECORD_SECONDS} seconds of audio from device {device_index}...")
        print("Please play some audio on your system to test the recording.")
        
        # Calculate number of chunks based on default_rate
        num_chunks = int(default_rate / CHUNK_SIZE * RECORD_SECONDS)
        for i in range(num_chunks):
            try:
                data = stream.read(CHUNK_SIZE)
                frames.append(data)
                # Print progress
                progress = i / num_chunks * 100
                print(f"Recording: {progress:.1f}%", end="\r")
            except Exception as e:
                print(f"\nError reading audio data: {str(e)}")
                return None
        
        print("\nRecording complete!")
        
        # Save the recorded audio to a temporary file
        temp_dir = tempfile.gettempdir()
        temp_file = os.path.join(temp_dir, "test_recording.wav")
        
        with wave.open(temp_file, 'wb') as wf:
            wf.setnchannels(input_channels)
            wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
            wf.setframerate(default_rate)
            wf.writeframes(b''.join(frames))
        
        print(f"Audio saved to: {temp_file}")
        return temp_file
    
    except Exception as e:
        print(f"Error recording audio: {str(e)}")
        return None
    
    finally:
        if 'stream' in locals():
            stream.stop_stream()
            stream.close()
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
    """Main function to run the test."""
    print("===== Whisper API Integration Test =====\n")
    print("This script will test the Whisper API integration by recording audio and transcribing it.\n")
    
    # Get available loopback devices
    loopback_devices = get_loopback_devices()
    if not loopback_devices:
        print("No loopback devices found. Exiting.")
        return
    
    # Print available devices
    print("\nAvailable loopback devices:")
    for i, device in enumerate(loopback_devices, 1):
        print(f"{i}. {device['name']} (device index: {device['index']})")
    
    # Get user input for device selection
    audio_file = None
    try:
        choice = int(input("\nEnter the number of the device to use for recording: "))
        if choice < 1 or choice > len(loopback_devices):
            print("Invalid choice. Please select a number from the list.")
            return
        
        device_index = loopback_devices[choice - 1]['index']
        
        # Record audio
        audio_file = record_audio(device_index)
        if audio_file is None:
            print("Failed to record audio. Please try a different device.")
            return
        
        # Transcribe audio
        print("\nTranscribing audio...")
        transcription = transcribe_audio(audio_file)
        if transcription:
            print("\nTranscription result:")
            print(transcription)
        else:
            print("Failed to transcribe audio.")
            
    except ValueError:
        print("Invalid input. Please enter a number.")
    except KeyboardInterrupt:
        print("\nTest interrupted by user.")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        # Clean up temporary file
        if audio_file and os.path.exists(audio_file):
            # Commenting out the file deletion to preserve the recording
            # try:
            #     os.unlink(audio_file)
            #     print("\nCleaned up temporary audio file.")
            # except Exception as e:
            #     print(f"\nWarning: Failed to delete temporary file: {e}")
            print(f"\nRecorded audio file preserved at: {audio_file}")
        
        print("\nTest completed.")

if __name__ == "__main__":
    main() 