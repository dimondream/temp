#!/usr/bin/env python3
"""
Transcription service using OpenAI's Whisper API.
This module handles the transcription of audio chunks.
"""

import os
import threading
import queue
from pathlib import Path
import openai
from datetime import datetime
import time

class TranscriptionService:
    """Service for handling audio transcription using Whisper API."""
    
    def __init__(self):
        """Initialize the transcription service."""
        self.is_processing = False
        self.processing_thread = None
        self.transcription_queue = queue.Queue()
        self.current_chunk = None
        self.processing_lock = threading.Lock()
        self.status_queue = queue.Queue()  # For status updates
        
    def start_processing(self, audio_queue):
        """
        Start processing audio chunks for transcription.
        
        Args:
            audio_queue (queue.Queue): Queue containing audio chunk file paths
        """
        if self.is_processing:
            return False
            
        self.is_processing = True
        self.processing_thread = threading.Thread(
            target=self._process_chunks,
            args=(audio_queue,)
        )
        self.processing_thread.daemon = True  # Make thread daemon so it exits when main program exits
        self.processing_thread.start()
        return True
        
    def stop_processing(self):
        """Stop the transcription processing."""
        with self.processing_lock:
            self.is_processing = False
            if self.processing_thread:
                self.processing_thread.join(timeout=1.0)  # Wait up to 1 second for thread to finish
                
    def get_next_transcription(self):
        """
        Get the next transcription result.
        
        Returns:
            str: Transcribed text, or None if no transcription is available
        """
        try:
            return self.transcription_queue.get_nowait()
        except queue.Empty:
            return None
            
    def get_next_status(self):
        """
        Get the next status update.
        
        Returns:
            str: Status message, or None if no status is available
        """
        try:
            return self.status_queue.get_nowait()
        except queue.Empty:
            return None
            
    def _process_chunks(self, audio_queue):
        """Internal method for processing audio chunks."""
        while self.is_processing:
            try:
                # Get next audio chunk with a short timeout
                chunk_file = audio_queue.get(timeout=0.1)
                if not chunk_file or not os.path.exists(chunk_file):
                    continue
                    
                # Update status
                self.status_queue.put(f"Processing chunk: {os.path.basename(chunk_file)}")
                
                # Process the chunk immediately
                start_time = time.time()
                with open(chunk_file, "rb") as file:
                    transcription = openai.audio.transcriptions.create(
                        model="whisper-1",
                        file=file
                    )
                    
                # Add transcription to queue with timestamp and processing time
                if transcription and transcription.text:
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    processing_time = time.time() - start_time
                    self.transcription_queue.put(
                        f"[{timestamp}] ({processing_time:.1f}s) {transcription.text}"
                    )
                    self.status_queue.put(f"Chunk processed in {processing_time:.1f}s")
                else:
                    self.status_queue.put("No transcription available for chunk")
                    
                # Clean up the chunk file immediately
                try:
                    os.unlink(chunk_file)
                except Exception as e:
                    print(f"Error deleting chunk file: {str(e)}")
                    
            except queue.Empty:
                continue
            except Exception as e:
                error_msg = f"Error processing audio chunk: {str(e)}"
                print(error_msg)
                self.status_queue.put(error_msg)
                continue 