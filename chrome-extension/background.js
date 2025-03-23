// Global recording state
let isRecording = false;
let recordingTabId = null;

// Handle clicks on the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  // If we're already recording, stop the recording
  if (isRecording) {
    await stopRecording();
    return;
  }

  // Otherwise start recording
  await startRecording(tab);
});

// Function to start recording
async function startRecording(tab) {
  console.log("Starting recording for tab:", tab.id, tab.title);
  
  return new Promise(async (resolve, reject) => {
    try {
      // Store the current tab ID
      recordingTabId = tab.id;
      
      // Check for existing offscreen document
      const existingContexts = await chrome.runtime.getContexts({});
      console.log("Existing contexts:", existingContexts);
      
      const offscreenDocument = existingContexts.find(
        (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
      );
      
      console.log("Found existing offscreen document:", offscreenDocument);

      // If an offscreen document is not already open, create one
      if (!offscreenDocument) {
        console.log("Creating new offscreen document...");
        try {
          await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Recording from chrome.tabCapture API',
          });
          console.log("Offscreen document created successfully");
        } catch (error) {
          console.error("Failed to create offscreen document:", error);
          return reject(new Error("Failed to create offscreen document: " + error.message));
        }
      }

      // Get a MediaStream for the active tab
      console.log("Getting media stream ID for tab:", tab.id);
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tab.id
      });
      console.log("Stream ID obtained:", streamId);

      // Send the stream ID to the offscreen document to start recording
      console.log("Sending start-recording message to offscreen document");
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'start-recording',
          target: 'offscreen',
          data: {
            streamId: streamId,
            tabId: tab.id,
            tabTitle: tab.title
          }
        });
        
        console.log("Response from offscreen:", response);
        
        if (response && response.success) {
          isRecording = true;
          updateBadge(true);
          resolve({ success: true });
        } else {
          reject(new Error("Failed to start recording: " + (response?.error || "Unknown error")));
        }
      } catch (error) {
        console.error("Error sending start-recording message:", error);
        reject(new Error("Failed to communicate with offscreen document: " + error.message));
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      reject(error);
    }
  });
}

// Stop recording function
async function stopRecording() {
  console.log("stopRecording called, isRecording:", isRecording);
  
  if (!isRecording) {
    console.warn("Not recording, nothing to stop");
    return Promise.resolve({ status: 'not_recording' });
  }
  
  // Send stop message to offscreen document
  console.log("Sending stop-recording message to offscreen document");
  
  return new Promise((resolve, reject) => {
    try {
      // First check if the offscreen document exists
      chrome.runtime.getContexts({}).then(contexts => {
        const offscreenExists = contexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');
        
        if (!offscreenExists) {
          console.log("No offscreen document found, can't send stop message");
          isRecording = false;
          recordingTabId = null;
          updateBadge(false);
          return resolve({ status: 'no_offscreen_document' });
        }
        
        // Send the message to stop recording
        chrome.runtime.sendMessage({
          type: 'stop-recording',
          target: 'offscreen'
        }).then(response => {
          console.log("Stop recording response from offscreen:", response);
          isRecording = false;
          recordingTabId = null;
          updateBadge(false);
          console.log("Recording stopped in background");
          resolve({ success: true, response });
        }).catch(error => {
          console.error("Error in stop recording message:", error);
          // We still consider the recording stopped even if there's an error
          isRecording = false;
          recordingTabId = null;
          updateBadge(false);
          resolve({ success: false, error: error.message });
        });
      }).catch(error => {
        console.error("Error checking contexts:", error);
        isRecording = false;
        recordingTabId = null;
        updateBadge(false);
        resolve({ success: false, error: error.message });
      });
    } catch (error) {
      console.error("Exception in stopRecording:", error);
      isRecording = false;
      recordingTabId = null;
      updateBadge(false);
      resolve({ success: false, error: error.message });
    }
  });
}

// Update the extension badge to show recording status
function updateBadge(recording) {
  if (recording) {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Listen for messages from the offscreen document or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
  // Route messages from popup to offscreen and vice versa
  if (message.target === 'offscreen') {
    // First check if offscreen document exists
    chrome.runtime.getContexts({}).then(contexts => {
      const offscreenExists = contexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');
      
      if (!offscreenExists) {
        console.log("Offscreen document doesn't exist for message:", message.type);
        sendResponse({ error: "Offscreen document is not available" });
        return;
      }
      
      // Forward the message to offscreen document
      try {
        chrome.runtime.sendMessage(message)
          .then(response => {
            console.log("Forwarded response from offscreen:", response);
            sendResponse(response);
          })
          .catch(error => {
            console.error("Error forwarding message to offscreen:", error);
            sendResponse({ error: error.message || "Failed to send message to offscreen document" });
          });
      } catch (error) {
        console.error("Exception forwarding message:", error);
        sendResponse({ error: error.message });
      }
    });
    
    return true; // Keep the channel open for async response
  }
  
  if (message.target !== 'background') {
    // Not for us
    return false;
  }
  
  if (message.type === 'recording-complete') {
    // Handle recording complete
    console.log('Recording complete:', message.data);
    
    // Notify popup if it's open
    try {
      chrome.runtime.sendMessage({
        type: 'recording-complete',
        target: 'popup',
        data: message.data
      }).catch(err => console.log("Error sending to popup (probably not open):", err));
    } catch (e) {
      console.log("Error notifying popup (probably not open):", e);
    }
    
    // We still respond to the original sender
    sendResponse({ received: true });
    return false;
  } else if (message.type === 'get-recording-state') {
    // Return current recording state
    sendResponse({ isRecording: isRecording });
    return false; // No need for async response
  } else if (message.type === 'start-recording-popup') {
    // Start recording from popup
    chrome.tabs.get(message.data.tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      
      startRecording(tab)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
    });
    return true; // Keep the channel open for async response
  } else if (message.type === 'stop-recording') {
    // Handle stop recording message from popup
    console.log("Received stop-recording message from popup");
    stopRecording()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }
  
  // If we got here, we didn't handle the message
  sendResponse({ error: "Unhandled message type" });
  return false;
});

// Handle tab closing while recording
chrome.tabs.onRemoved.addListener((tabId) => {
  if (isRecording && tabId === recordingTabId) {
    stopRecording();
  }
}); 