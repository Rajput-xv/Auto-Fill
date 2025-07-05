// Popup script
document.addEventListener('DOMContentLoaded', () => {
  loadExtensionState();
  loadStats();
  
  document.getElementById('toggleButton').addEventListener('click', toggleExtension);
  document.getElementById('fillAllButton').addEventListener('click', triggerFillAll);
  document.getElementById('clearButton').addEventListener('click', clearAllData);
});

async function loadExtensionState() {
  const result = await chrome.storage.local.get(['extensionEnabled']);
  const isEnabled = result.extensionEnabled !== false;
  
  updateToggleButton(isEnabled);
}

function updateToggleButton(isEnabled) {
  const toggleButton = document.getElementById('toggleButton');
  const statusIndicator = document.getElementById('statusIndicator');
  const toggleText = document.getElementById('toggleText');
  
  if (isEnabled) {
    toggleButton.className = 'toggle-button enabled';
    statusIndicator.className = 'status-indicator status-enabled';
    toggleText.textContent = 'Extension Enabled';
  } else {
    toggleButton.className = 'toggle-button disabled';
    statusIndicator.className = 'status-indicator status-disabled';
    toggleText.textContent = 'Extension Disabled';
  }
}

async function toggleExtension() {
  const result = await chrome.storage.local.get(['extensionEnabled']);
  const currentState = result.extensionEnabled !== false;
  const newState = !currentState;
  
  await chrome.storage.local.set({extensionEnabled: newState});
  updateToggleButton(newState);
  
  // Notify content scripts
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'toggleExtension',
      enabled: newState
    }).catch(() => {
      // Ignore errors if content script is not loaded
    });
  }
}

async function loadStats() {
  const result = await chrome.storage.local.get(['formDataStore']);
  const dataStore = result.formDataStore || {};
  const statsContainer = document.getElementById('statsContainer');
  
  statsContainer.innerHTML = '';
  
  const totalFields = Object.keys(dataStore).length;
  let totalEntries = 0;
  
  Object.values(dataStore).forEach(fieldData => {
    totalEntries += fieldData.length;
  });
  
  if (totalFields === 0) {
    statsContainer.innerHTML = '<div class="stats-item"><span>No data saved yet</span></div>';
    return;
  }
  
  // Show total stats
  const totalStatsItem = document.createElement('div');
  totalStatsItem.className = 'stats-item';
  totalStatsItem.innerHTML = `
    <span>Total Fields:</span>
    <span>${totalFields}</span>
  `;
  statsContainer.appendChild(totalStatsItem);
  
  const totalEntriesItem = document.createElement('div');
  totalEntriesItem.className = 'stats-item';
  totalEntriesItem.innerHTML = `
    <span>Total Entries:</span>
    <span>${totalEntries}</span>
  `;
  statsContainer.appendChild(totalEntriesItem);
  
  // Show top fields
  const sortedFields = Object.entries(dataStore)
    .sort(([,a], [,b]) => b.length - a.length)
    .slice(0, 5);
  
  if (sortedFields.length > 0) {
    const separator = document.createElement('div');
    separator.style.cssText = 'margin: 10px 0; border-top: 1px solid #ddd; padding-top: 10px;';
    separator.innerHTML = '<strong>Top Fields:</strong>';
    statsContainer.appendChild(separator);
    
    sortedFields.forEach(([fieldName, entries]) => {
      const fieldItem = document.createElement('div');
      fieldItem.className = 'stats-item';
      // Convert normalized field name back to readable format
      const displayName = getDisplayNameForPopup(fieldName);
      fieldItem.innerHTML = `
        <span>${displayName}:</span>
        <span>${entries.length} entries</span>
      `;
      statsContainer.appendChild(fieldItem);
    });
  }
}

async function clearAllData() {
  if (confirm('Are you sure you want to clear all saved data? This action cannot be undone.')) {
    await chrome.storage.local.remove(['formDataStore']);
    loadStats();
  }
}

async function triggerFillAll() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      // Send message to content script to trigger auto-fill
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'triggerAutoFill'
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script might not be loaded
          updateFillButton('No form detected', true);
          setTimeout(() => {
            updateFillButton('🚀 Fill Current Form', false);
          }, 2000);
        } else if (response && response.success) {
          updateFillButton(`✅ Filled ${response.count} fields`, true);
          setTimeout(() => {
            updateFillButton('🚀 Fill Current Form', false);
          }, 2000);
        } else {
          updateFillButton('No matching data found', true);
          setTimeout(() => {
            updateFillButton('🚀 Fill Current Form', false);
          }, 2000);
        }
      });
    }
  } catch (error) {
    console.error('Error triggering fill all:', error);
    updateFillButton('Error occurred', true);
    setTimeout(() => {
      updateFillButton('🚀 Fill Current Form', false);
    }, 2000);
  }
}

function updateFillButton(text, disabled) {
  const fillButton = document.getElementById('fillAllButton');
  fillButton.textContent = text;
  fillButton.disabled = disabled;
}

function getDisplayNameForPopup(normalizedFieldName) {
  // Convert normalized field names back to user-friendly display names
  const displayNames = {
    'phone': 'Phone Number',
    'email': 'Email Address',
    'full_name': 'Full Name',
    'first_name': 'First Name',
    'last_name': 'Last Name',
    'middle_name': 'Middle Name',
    'address': 'Address',
    'address_line_2': 'Address Line 2',
    'city': 'City',
    'state': 'State/Province',
    'postal_code': 'Postal Code',
    'country': 'Country',
    'company': 'Company',
    'job_title': 'Job Title',
    'department': 'Department',
    'work_experience': 'Work Experience',
    'salary': 'Salary',
    'date_of_birth': 'Date of Birth',
    'age': 'Age',
    'gender': 'Gender',
    'website': 'Website',
    'linkedin': 'LinkedIn',
    'social_media': 'Social Media',
    'message': 'Message',
    'subject': 'Subject',
    'password': 'Password',
    'username': 'Username',
    'school': 'School/University',
    'degree': 'Degree',
    'graduation_year': 'Graduation Year',
    'gpa': 'GPA',
    'emergency_contact': 'Emergency Contact',
    'emergency_phone': 'Emergency Phone',
    'availability': 'Availability',
    'visa_status': 'Visa Status',
    'relocation': 'Relocation',
    'reference_name': 'Reference Name',
    'reference_phone': 'Reference Phone',
    'reference_email': 'Reference Email',
    'cover_letter': 'Cover Letter',
    'skills': 'Skills',
    'certifications': 'Certifications',
    'languages': 'Languages',
    'portfolio_url': 'Portfolio URL',
    'how_did_you_hear': 'How Did You Hear',
    'preferred_contact': 'Preferred Contact'
  };
  
  // If we have a predefined display name, use it
  if (displayNames[normalizedFieldName]) {
    return displayNames[normalizedFieldName];
  }
  
  // Fallback to converting the normalized name
  return normalizedFieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
