// Create a vanilla JS UI instead of React
document.addEventListener('DOMContentLoaded', () => {
  // Create DOM elements
  const container = document.getElementById('root');
  container.className = 'w-[300px] shadow-none border-0';

  // Header
  const header = document.createElement('div');
  header.className = 'pb-2';
  
  const title = document.createElement('h2');
  title.className = 'text-xl font-bold';
  title.textContent = 'Tab Audio Recorder';
  
  const status = document.createElement('p');
  status.className = 'text-sm text-muted-foreground';
  status.id = 'recording-status';
  status.textContent = 'Ready to record';
  
  header.appendChild(title);
  header.appendChild(status);
  container.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.className = 'space-y-4';
  
  // Button controls
  const btnContainer = document.createElement('div');
  btnContainer.className = 'flex gap-2';
  
  const recordBtn = document.createElement('button');
  recordBtn.className = 'bg-blue-500 hover:bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium';
  recordBtn.textContent = 'Record';
  recordBtn.id = 'start-recording';
  
  const stopBtn = document.createElement('button');
  stopBtn.className = 'bg-gray-400 hover:bg-gray-500 text-white rounded-md px-4 py-2 text-sm font-medium';
  stopBtn.textContent = 'Stop';
  stopBtn.id = 'stop-recording';
  stopBtn.disabled = true;
  
  btnContainer.appendChild(recordBtn);
  btnContainer.appendChild(stopBtn);
  content.appendChild(btnContainer);
  
  // Info text
  const infoText = document.createElement('p');
  infoText.className = 'text-xs text-muted-foreground';
  infoText.textContent = 'Recordings available for direct download only';
  content.appendChild(infoText);
  
  // Separator
  const separator = document.createElement('hr');
  separator.className = 'h-px my-2 bg-gray-200 border-0';
  content.appendChild(separator);
  
  // Download section (initially hidden)
  const downloadSection = document.createElement('div');
  downloadSection.className = 'space-y-2 hidden';
  downloadSection.id = 'direct-download-container';
  
  const downloadHeader = document.createElement('div');
  downloadHeader.className = 'flex justify-between items-center';
  
  const downloadTitle = document.createElement('h3');
  downloadTitle.className = 'font-medium';
  downloadTitle.textContent = 'Direct Download';
  
  downloadHeader.appendChild(downloadTitle);
  downloadSection.appendChild(downloadHeader);
  
  const downloadText = document.createElement('p');
  downloadText.className = 'text-sm';
  downloadText.textContent = 'Latest recording is ready for download.';
  downloadSection.appendChild(downloadText);
  
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'w-full bg-green-500 hover:bg-green-600 text-white rounded-md px-4 py-2 text-sm font-medium flex items-center justify-center';
  downloadBtn.id = 'direct-download-btn';
  
  const downloadIcon = document.createElement('span');
  downloadIcon.className = 'mr-2 h-4 w-4 inline-block';
  downloadIcon.innerHTML = '⬇️';
  
  downloadBtn.appendChild(downloadIcon);
  downloadBtn.appendChild(document.createTextNode('Download Recording'));
  downloadSection.appendChild(downloadBtn);
  
  content.appendChild(downloadSection);
  container.appendChild(content);

// Global state
let isRecording = false;
  let directDownloadInfo = null;

  // Event Handlers
  recordBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);
  downloadBtn.addEventListener('click', handleDirectDownload);

  // Check if recording when popup opens
  checkRecordingState();
  
  // Check for direct download
  checkForDirectDownload();
  
  // Functions
  function checkRecordingState() {
    chrome.runtime.sendMessage({ type: 'get-recording-state', target: 'background' }, (response) => {
      if (response && response.isRecording) {
        updateRecordingUI(true);
      }
    });
  }

async function startRecording() {
  try {
      // Update UI
      updateRecordingUI(true);
    
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      alert('No active tab found');
        updateRecordingUI(false);
      return;
    }
    
    // Send message to background script to start recording
      const response = await chrome.runtime.sendMessage({
        type: 'start-recording-popup',
        target: 'background',
        data: { tabId: tab.id }
      });
      
      console.log("Start recording response:", response);
      
      if (response && response.success) {
        // Already updated UI
      } else if (response && response.error) {
        console.error("Error from background:", response.error);
        updateRecordingUI(false);
        alert(`Error: ${response.error}`);
      } else {
        console.error("Invalid response from background");
        updateRecordingUI(false);
        alert('Error: Invalid response from background');
    }
  } catch (error) {
    console.error('Error starting recording:', error);
      updateRecordingUI(false);
      alert(`Error: ${error.message}`);
  }
}

function stopRecording() {
  console.log("Stop recording button clicked");
  
    // Update UI immediately
  updateRecordingUI(false);
  
  // Send message to background script to stop recording
  try {
    chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'background'
    })
    .then(response => {
      console.log("Stop recording response:", response);
      
        // Check for direct download after a short delay
      setTimeout(() => {
          checkForDirectDownload();
      }, 3000);
    })
    .catch(error => {
      console.error("Error in stop recording response:", error);
      
        // Still try to check for direct download
      setTimeout(() => {
          checkForDirectDownload();
      }, 3000);
    });
  } catch (error) {
    console.error("Exception sending stop message:", error);
    
      // Still try to check for direct download
    setTimeout(() => {
        checkForDirectDownload();
    }, 3000);
  }
}

function updateRecordingUI(recording) {
  isRecording = recording;
  
  if (recording) {
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      document.getElementById('recording-status').textContent = 'Recording in progress...';
      
      // Hide direct download section when starting a new recording
      document.getElementById('direct-download-container').classList.add('hidden');
    } else {
      recordBtn.disabled = false;
      stopBtn.disabled = true;
      document.getElementById('recording-status').textContent = 'Ready to record';
    }
  }

function checkForDirectDownload() {
    chrome.runtime.sendMessage({
      type: 'get-direct-download', 
      target: 'background' 
    }, (response) => {
      if (response && response.info) {
        directDownloadInfo = response.info;
        showDirectDownloadOption(directDownloadInfo);
      }
    });
  }

  function showDirectDownloadOption(info) {
    if (!info || !info.url) return;
    
    const downloadContainer = document.getElementById('direct-download-container');
    downloadContainer.classList.remove('hidden');
  }

  function handleDirectDownload() {
    if (directDownloadInfo && directDownloadInfo.url) {
    const a = document.createElement('a');
      a.href = directDownloadInfo.url;
      a.download = directDownloadInfo.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    }
  }
}); 