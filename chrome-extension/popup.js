// DOM elements
const startRecordingBtn = document.getElementById('start-recording');
const stopRecordingBtn = document.getElementById('stop-recording');
const recordingStatus = document.getElementById('recording-status');
const recordingsList = document.getElementById('recordings-list');

// Add a refresh button
const refreshBtn = document.createElement('button');
refreshBtn.textContent = 'Refresh List';
refreshBtn.className = 'btn refresh-btn';
refreshBtn.style.marginLeft = '10px';
refreshBtn.addEventListener('click', loadRecordings);
document.querySelector('.controls').appendChild(refreshBtn);

// Debug: Check storage contents
console.log("Storage debug");
chrome.storage.local.get(['recordings'], result => {
  console.log("Recordings in storage:", result.recordings);
  
  // Try to display any recordings found directly
  if (result.recordings && result.recordings.length > 0) {
    console.log("Found recordings, forcing display");
    displayRecordings(result.recordings);
  } else {
    console.log("No recordings found in storage");
    // Try with null key to get all storage data
    chrome.storage.local.get(null, allData => {
      console.log("All storage data:", allData);
    });
  }
});

// Global state
let isRecording = false;
let currentAudio = null;

// Check if currently recording when popup opens
chrome.runtime.sendMessage({ type: 'get-recording-state', target: 'background' }, (response) => {
  if (response && response.isRecording) {
    updateRecordingUI(true);
  }
});

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load recordings
  loadRecordings();
  
  // Check for direct download
  checkForDirectDownload();
  
  // Set up button event listeners
  startRecordingBtn.addEventListener('click', startRecording);
  stopRecordingBtn.addEventListener('click', stopRecording);
});

// Function to start recording
async function startRecording() {
  try {
    // Disable the button to prevent multiple clicks
    startRecordingBtn.disabled = true;
    recordingStatus.textContent = 'Starting recording...';
    
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      alert('No active tab found');
      startRecordingBtn.disabled = false;
      recordingStatus.textContent = 'Ready to record';
      return;
    }
    
    // Send message to background script to start recording
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'start-recording-popup',
        target: 'background',
        data: { tabId: tab.id }
      });
      
      console.log("Start recording response:", response);
      
      if (response && response.success) {
        // Update UI
        updateRecordingUI(true);
      } else if (response && response.error) {
        console.error("Error from background:", response.error);
        recordingStatus.textContent = `Error: ${response.error}`;
        startRecordingBtn.disabled = false;
      } else {
        console.error("Invalid response from background");
        recordingStatus.textContent = 'Error: Invalid response from background';
        startRecordingBtn.disabled = false;
      }
    } catch (msgError) {
      console.error("Message error:", msgError);
      recordingStatus.textContent = `Error: ${msgError.message}`;
      startRecordingBtn.disabled = false;
    }
  } catch (error) {
    console.error('Error starting recording:', error);
    recordingStatus.textContent = `Error: ${error.message}`;
    startRecordingBtn.disabled = false;
  }
}

// Function to stop recording
function stopRecording() {
  console.log("Stop recording button clicked");
  
  // Update UI immediately to show we're processing
  recordingStatus.textContent = 'Stopping recording...';
  
  // Disable the button to prevent multiple clicks
  stopRecordingBtn.disabled = true;
  
  // Update UI first
  updateRecordingUI(false);
  
  // Send message to background script to stop recording
  try {
    chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'background'
    })
    .then(response => {
      console.log("Stop recording response:", response);
      
      // Show processing status
      recordingStatus.textContent = 'Processing recording...';
      
      // Reload recordings after a short delay
      setTimeout(() => {
        console.log("Loading recordings after stop");
        // Try both loading methods
        loadRecordings();
        loadDirectRecordings();
        recordingStatus.textContent = 'Ready to record';
      }, 3000);
    })
    .catch(error => {
      console.error("Error in stop recording response:", error);
      recordingStatus.textContent = 'Ready to record';
      
      // Still try to load recordings after a delay
      setTimeout(() => {
        loadRecordings();
        loadDirectRecordings();
      }, 3000);
    });
  } catch (error) {
    console.error("Exception sending stop message:", error);
    recordingStatus.textContent = 'Error stopping: ' + error.message;
    
    // Still try to load recordings after a delay
    setTimeout(() => {
      loadRecordings();
      loadDirectRecordings();
    }, 3000);
  }
}

// Function to update UI when recording state changes
function updateRecordingUI(recording) {
  isRecording = recording;
  
  if (recording) {
    startRecordingBtn.disabled = true;
    stopRecordingBtn.disabled = false;
    recordingStatus.textContent = 'Recording in progress...';
    recordingStatus.classList.add('status-recording');
  } else {
    startRecordingBtn.disabled = false;
    stopRecordingBtn.disabled = true;
    recordingStatus.textContent = 'Ready to record';
    recordingStatus.classList.remove('status-recording');
  }
}

// Function to load recordings from storage
function loadRecordings() {
  console.log("Loading recordings from storage...");
  try {
    chrome.storage.local.get(['recordings'], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading recordings:", chrome.runtime.lastError);
        recordingsList.innerHTML = '<div class="no-recordings">Error loading recordings</div>';
        return;
      }
      
      console.log("Storage.get callback received:", result);
      const recordings = result.recordings || [];
      console.log(`Found ${recordings.length} recordings in storage`);
      
      // Use our display function
      displayRecordings(recordings);
    });
  } catch (error) {
    console.error("Exception in loadRecordings:", error);
    recordingsList.innerHTML = '<div class="no-recordings">Error: ' + error.message + '</div>';
  }
}

// Function to create a recording item element
function createRecordingItem(recording) {
  const recordingItem = document.createElement('div');
  recordingItem.className = 'recording-item';
  recordingItem.dataset.id = recording.id;
  
  // Create title
  const title = document.createElement('div');
  title.className = 'recording-title';
  title.textContent = recording.tabTitle || 'Unknown tab';
  
  // Create info
  const info = document.createElement('div');
  info.className = 'recording-info';
  
  // Format date
  const date = new Date(recording.timestamp);
  const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  
  // Format duration
  const duration = formatDuration(recording.duration);
  
  info.textContent = `${formattedDate} • ${duration}`;
  
  // Create audio element
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.src = recording.data;
  
  // Create controls
  const controls = document.createElement('div');
  controls.className = 'recording-controls';
  
  // Play button
  const playBtn = document.createElement('button');
  playBtn.className = 'recording-btn play-btn';
  playBtn.textContent = 'Play';
  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      // Stop any currently playing audio
      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      
      audio.play();
      playBtn.textContent = 'Pause';
      currentAudio = audio;
    } else {
      audio.pause();
      playBtn.textContent = 'Play';
    }
  });
  
  // Listen for audio ended event
  audio.addEventListener('ended', () => {
    playBtn.textContent = 'Play';
  });
  
  // Download button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'recording-btn download-btn';
  downloadBtn.textContent = 'Download';
  downloadBtn.addEventListener('click', () => {
    // Create a temporary anchor element
    const a = document.createElement('a');
    a.href = recording.data;
    a.download = recording.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
  
  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'recording-btn delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    deleteRecording(recording.id);
  });
  
  // Add all elements to the recording item
  controls.appendChild(playBtn);
  controls.appendChild(downloadBtn);
  controls.appendChild(deleteBtn);
  
  recordingItem.appendChild(title);
  recordingItem.appendChild(info);
  recordingItem.appendChild(controls);
  recordingItem.appendChild(audio);
  
  return recordingItem;
}

// Function to delete a recording
function deleteRecording(id) {
  if (confirm('Are you sure you want to delete this recording?')) {
    chrome.storage.local.get(['recordings'], (result) => {
      const recordings = result.recordings || [];
      const updatedRecordings = recordings.filter(rec => rec.id !== id);
      
      chrome.storage.local.set({ recordings: updatedRecordings }, () => {
        loadRecordings();
      });
    });
  }
}

// Helper function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'popup') return;
  
  if (message.type === 'recording-state-changed') {
    updateRecordingUI(message.data.isRecording);
  } else if (message.type === 'recording-complete') {
    loadRecordings();
  }
});

// Function to manually display recordings
function displayRecordings(recordings) {
  if (!recordings || recordings.length === 0) {
    recordingsList.innerHTML = '<div class="no-recordings">No recordings yet</div>';
    return;
  }
  
  // Sort recordings by timestamp (newest first)
  recordings.sort((a, b) => b.timestamp - a.timestamp);
  
  // Clear previous list
  recordingsList.innerHTML = '';
  
  // Add each recording to the list
  recordings.forEach((recording, index) => {
    try {
      console.log(`Creating UI for recording ${index+1}:`, recording.name);
      const recordingItem = createRecordingItem(recording);
      recordingsList.appendChild(recordingItem);
    } catch (error) {
      console.error(`Error creating UI for recording ${index+1}:`, error);
      const errorItem = document.createElement('div');
      errorItem.className = 'recording-item error';
      errorItem.textContent = `Error loading recording ${index+1}: ${error.message}`;
      recordingsList.appendChild(errorItem);
    }
  });
}

// Add a direct download button if available
function checkForDirectDownload() {
  console.log("Checking for direct download URL...");
  try {
    // Try to access the offscreen document's localStorage through a workaround
    chrome.runtime.sendMessage({
      type: 'check-direct-download',
      target: 'offscreen'
    })
    .then(response => {
      console.log("Direct download check response:", response);
      if (response && response.url && response.name) {
        console.log("Got direct download URL from offscreen:", response);
        addDirectDownloadButton(response.url, response.name);
      } else if (response && response.error) {
        console.warn("Error checking for direct download:", response.error);
      } else {
        console.log("No direct download URL available");
      }
    })
    .catch(error => {
      console.warn("Error in direct download check:", error);
      // Not critical, can fail silently
    });
  } catch (e) {
    console.error("Exception checking for direct download:", e);
    // Not critical, can fail silently
  }
}

// Add a direct download button to the UI
function addDirectDownloadButton(url, name) {
  const container = document.querySelector('.recordings-container');
  
  // Create a section for direct download
  const directDownloadDiv = document.createElement('div');
  directDownloadDiv.className = 'direct-download';
  directDownloadDiv.innerHTML = '<h3>Latest Recording</h3>';
  
  // Create the download button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn download-btn';
  downloadBtn.textContent = 'Download ' + name;
  downloadBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
  
  directDownloadDiv.appendChild(downloadBtn);
  
  // Insert at the beginning of the container
  container.insertBefore(directDownloadDiv, container.firstChild);
}

// Function to load recordings from individual storage items (fallback)
function loadDirectRecordings() {
  console.log("Trying to load recordings directly by key pattern...");
  
  chrome.storage.local.get(null, (allData) => {
    if (chrome.runtime.lastError) {
      console.error("Error accessing storage:", chrome.runtime.lastError);
      return;
    }
    
    console.log("Got all storage data:", allData);
    
    // Look for keys matching the recording_* pattern
    const recordingKeys = Object.keys(allData).filter(key => 
      key.startsWith('recording_'));
    
    console.log("Found recording keys:", recordingKeys);
    
    if (recordingKeys.length === 0) {
      console.log("No direct recordings found");
      return;
    }
    
    // Extract the recordings
    const recordings = recordingKeys.map(key => allData[key]);
    console.log("Found direct recordings:", recordings.length);
    
    // Display them
    displayRecordings(recordings);
  });
}

// Add a button to manually try loading recordings directly
const loadDirectBtn = document.createElement('button');
loadDirectBtn.textContent = 'Search Storage';
loadDirectBtn.className = 'btn';
loadDirectBtn.style.marginLeft = '10px';
loadDirectBtn.addEventListener('click', loadDirectRecordings);
document.querySelector('.controls').appendChild(loadDirectBtn); 