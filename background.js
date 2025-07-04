// Background script for Chrome extension
chrome.runtime.onInstalled.addListener(() => {
  // Extension installed
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveFormData') {
    saveFormData(request.data);
    sendResponse({success: true});
  } else if (request.action === 'getFormData') {
    getFormData(request.fieldName).then(data => {
      sendResponse({data: data});
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'checkIfExists') {
    checkIfValueExists(request.fieldName, request.value).then(exists => {
      sendResponse({exists: exists});
    });
    return true; // Will respond asynchronously
  } else if (request.action === 'getAllFormData') {
    getAllFormData().then(data => {
      sendResponse({data: data});
    });
    return true; // Will respond asynchronously
  }
});

// Save form data to Chrome storage
async function saveFormData(formData) {
  try {
    const result = await chrome.storage.local.get(['formDataStore']);
    let dataStore = result.formDataStore || {};
    
    const key = formData.fieldName; // Use exact field name as key
    if (!dataStore[key]) {
      dataStore[key] = [];
    }
    
    // Check if value already exists
    const existingIndex = dataStore[key].findIndex(item => item.value === formData.value);
    if (existingIndex !== -1) {
      // Update frequency
      dataStore[key][existingIndex].frequency += 1;
      dataStore[key][existingIndex].lastUsed = Date.now();
    } else {
      // Add new entry
      dataStore[key].push({
        value: formData.value,
        frequency: 1,
        lastUsed: Date.now(),
        domain: formData.domain,
        label: formData.label || formData.fieldName
      });
    }
    
    // Sort by frequency and last used
    dataStore[key].sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
      return b.lastUsed - a.lastUsed;
    });
    
    // Keep only top 10 entries per field
    dataStore[key] = dataStore[key].slice(0, 10);
    
    await chrome.storage.local.set({formDataStore: dataStore});
  } catch (error) {
    // Silently handle storage errors
  }
}

// Get form data from Chrome storage
async function getFormData(fieldName) {
  try {
    const result = await chrome.storage.local.get(['formDataStore']);
    const dataStore = result.formDataStore || {};
    const key = fieldName; // Use exact field name as key
    return dataStore[key] || [];
  } catch (error) {
    return [];
  }
}

// Check if a value already exists for a field
async function checkIfValueExists(fieldName, value) {
  try {
    const result = await chrome.storage.local.get(['formDataStore']);
    const dataStore = result.formDataStore || {};
    const key = fieldName; // Use exact field name as key
    
    if (!dataStore[key]) {
      return false;
    }
    
    return dataStore[key].some(item => item.value === value);
  } catch (error) {
    return false;
  }
}

// Get all form data for auto-fill detection
async function getAllFormData() {
  try {
    const result = await chrome.storage.local.get(['formDataStore']);
    return result.formDataStore || {};
  } catch (error) {
    return {};
  }
}
