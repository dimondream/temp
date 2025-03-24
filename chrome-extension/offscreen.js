// Global variables
let mediaRecorder = null;
let audioChunks = [];
let currentTabId = null;
let currentTabTitle = null;
let recordingStartTime = null;
let audioStream = null; // Store the stream for cleanup

console.log("Offscreen script loaded");

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in offscreen:", message);
  
  if (message.target !== 'offscreen') {
    console.log("Message not for offscreen, ignoring");
    return false;
  }
  
  if (message.type === 'start-recording') {
    console.log("Starting recording with data:", message.data);
    startRecording(message.data)
      .then(() => {
        console.log("Recording started successfully");
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error("Error starting recording:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for the async response
  } else if (message.type === 'stop-recording') {
    console.log("Stopping recording from message");
    try {
      stopRecording();
      console.log("Recording stopped successfully via message");
      sendResponse({ success: true, message: "Recording stopped" });
    } catch (error) {
      console.error("Error stopping recording via message:", error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep channel open for response
  } else if (message.type === 'check-direct-download') {
    // Check localStorage for latest recording URL
    try {
      const url = localStorage.getItem('latest_recording_url');
      const name = localStorage.getItem('latest_recording_name');
      console.log("Returning direct download info:", { url, name });
      sendResponse({ url, name });
    } catch (e) {
      console.error("Error retrieving download URL:", e);
      sendResponse({ error: e.message });
    }
    return true;
  }
  
  return false;
});

// Function to start recording
async function startRecording(data) {
  try {
    // Extract the data
    const { streamId, tabId, tabTitle } = data;
    currentTabId = tabId;
    currentTabTitle = tabTitle;
    
    console.log("Setting up recording with streamId:", streamId);
    
    // Get the media stream
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false  // We only want audio, not video
    };
    
    console.log("Requesting media with constraints:", JSON.stringify(constraints));
    audioStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("Media stream obtained:", audioStream);
    
    // Test audio stream
    const audioTracks = audioStream.getAudioTracks();
    console.log("Audio tracks:", audioTracks.length);
    audioTracks.forEach((track, i) => {
      console.log(`Track ${i}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });
    
    // Create audio context for monitoring (optional)
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(audioStream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    
    // Connect the audio to the output to continue playing to the user
    source.connect(audioContext.destination);
    
    // Set up media recorder with explicit MIME type
    const options = { mimeType: 'audio/webm' };
    console.log("Creating MediaRecorder with options:", options);
    mediaRecorder = new MediaRecorder(audioStream, options);
    console.log("MediaRecorder state:", mediaRecorder.state);
    
    // Store the audio data as it comes in
    mediaRecorder.ondataavailable = (event) => {
      console.log("Data available event, size:", event.data.size);
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    // Handle recording stopped
    mediaRecorder.onstop = () => {
      console.log("MediaRecorder stopped, chunks:", audioChunks.length);
      
      if (audioChunks.length === 0) {
        console.error("No audio data was captured");
        document.getElementById('status').textContent = 'Error: No audio data captured';
        return;
      }
      
      // Create a Blob from the recorded chunks
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      console.log("Created audio blob, size:", audioBlob.size);
      
      // Generate a unique name for the recording
      const recordingDuration = Date.now() - recordingStartTime;
      const formattedDuration = formatDuration(recordingDuration);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Recording_${timestamp}_${formattedDuration}.webm`;
      
      // Create a direct download link
      const downloadUrl = URL.createObjectURL(audioBlob);
      console.log("Created download URL:", downloadUrl);
      
      // Create a temporary downloadable link
      try {
        const tempLink = document.createElement('a');
        tempLink.style.display = 'none';
        tempLink.href = downloadUrl;
        tempLink.download = fileName;
        document.body.appendChild(tempLink);
        
        // Store the download URL in localStorage for access
        localStorage.setItem('latest_recording_url', downloadUrl);
        localStorage.setItem('latest_recording_name', fileName);
        
        console.log("Created download link element");
        document.getElementById('status').textContent = 'Download ready: ' + fileName;
        
        // Notify the background script about the direct download
        chrome.runtime.sendMessage({
          type: 'direct-download-ready',
          target: 'background',
          data: {
            name: fileName,
            url: downloadUrl
          }
        }, response => {
          console.log("Direct download notification response:", response);
        });
      } catch (e) {
        console.error("Error creating download link:", e);
      }
      
      // Reset the chunks array
      audioChunks = [];
      
      // Clean up the stream
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }
    };
    
    // Start recording with a shorter interval to get more chunks
    recordingStartTime = Date.now();
    console.log("Starting MediaRecorder");
    mediaRecorder.start(500); // Collect data in 500ms chunks
    
    // Update status
    document.getElementById('status').textContent = `Recording audio from tab: ${tabTitle}`;
    console.log("Recording started for tab:", tabTitle);
  } catch (error) {
    console.error('Error in startRecording:', error);
    document.getElementById('status').textContent = `Error: ${error.message}`;
    throw error; // Re-throw for proper error handling
  }
}

// Function to stop recording
function stopRecording() {
  console.log("stopRecording called, mediaRecorder:", mediaRecorder ? mediaRecorder.state : "null");
  
  if (!mediaRecorder) {
    console.warn("No mediaRecorder to stop");
    return;
  }
  
  try {
    if (mediaRecorder.state === 'recording') {
      console.log("Stopping mediaRecorder");
      mediaRecorder.stop();
      document.getElementById('status').textContent = 'Recording stopped. Processing...';
    } else {
      console.warn("MediaRecorder not in recording state:", mediaRecorder.state);
    }
    
    // Clean up stream regardless of state
    if (audioStream) {
      console.log("Stopping audio tracks");
      audioStream.getTracks().forEach(track => {
        track.stop();
        console.log("Track stopped:", track.id);
      });
      audioStream = null;
    }
  } catch (error) {
    console.error("Error stopping recording:", error);
    document.getElementById('status').textContent = `Error stopping: ${error.message}`;
  }
}

// Helper function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}-${remainingSeconds.toString().padStart(2, '0')}`;
} 