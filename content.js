// Content script that runs on all websites
let isExtensionEnabled = true;
let suggestionBox = null;
let currentField = null;
let autoFillPopup = null;
let detectedForm = null;
let formFields = [];
let currentFormId = null; // Track which form we've shown auto-fill for

// Utility function to check if extension context is valid
function isExtensionContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

// Initialize the extension
init();

function init() {
  // Check if extension is enabled
  if (!isExtensionContextValid()) {
    console.log('Extension context not available during initialization');
    return;
  }
  
  chrome.storage.local.get(['extensionEnabled'], (result) => {
    if (chrome.runtime.lastError) {
      console.log('Extension context error during initialization:', chrome.runtime.lastError.message);
      return;
    }
    
    isExtensionEnabled = result.extensionEnabled !== false;
    if (isExtensionEnabled) {
      attachEventListeners();
    }
  });
}

function attachEventListeners() {
  // Listen for input events on all text inputs
  document.addEventListener('input', handleInputEvent, true);
  document.addEventListener('focus', handleFocusEvent, true);
  document.addEventListener('blur', handleBlurEvent, true);
  document.addEventListener('click', handleClickEvent, true);
  
  // Also listen for dynamic content changes to reset form tracking
  const observer = new MutationObserver(() => {
    // Reset form tracking when DOM changes significantly
    // This ensures auto-fill popup can appear for dynamically added forms
    if (currentFormId && !document.querySelector('.autofill-popup')) {
      currentFormId = null;
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function handleInputEvent(event) {
  if (!isExtensionEnabled || !isExtensionContextValid()) return;
  
  const element = event.target;
  if (isFormField(element) && element.value.length > 1) {
    // Show save button instead of auto-saving
    clearTimeout(element.saveTimeout);
    element.saveTimeout = setTimeout(() => {
      showSaveOption(element);
    }, 1500); // Wait 1.5 seconds after user stops typing
  }
}

function handleFocusEvent(event) {
  if (!isExtensionEnabled || !isExtensionContextValid()) return;
  
  const element = event.target;
  if (isFormField(element)) {
    currentField = element;
    
    // Detect if this is part of a form and check for auto-fill opportunity
    detectFormAndShowAutoFill(element);
    
    // Show individual field suggestions
    showSuggestions(element);
  }
}

function handleBlurEvent(event) {
  // Hide suggestions when field loses focus
  setTimeout(() => {
    if (suggestionBox && !suggestionBox.contains(document.activeElement)) {
      hideSuggestions();
    }
  }, 200);
}

function handleClickEvent(event) {
  // Don't hide popups when clicking on them
  const saveOption = document.querySelector('.autofill-save-option');
  if (saveOption && saveOption.contains(event.target)) {
    return; // Don't hide if clicking on save option
  }
  
  const autoFillPopupElement = document.querySelector('.autofill-popup');
  if (autoFillPopupElement && autoFillPopupElement.contains(event.target)) {
    return; // Don't hide if clicking on auto-fill popup
  }
  
  // Hide suggestions when clicking outside
  if (suggestionBox && !suggestionBox.contains(event.target) && event.target !== currentField) {
    hideSuggestions();
  }
  
  // Don't hide auto-fill popup when clicking outside - it should only close on button clicks
}

function isFormField(element) {
  return (
    (element.tagName === 'INPUT' && 
     ['text', 'email', 'tel', 'url', 'search'].includes(element.type)) ||
    element.tagName === 'TEXTAREA'
  );
}

function getFieldIdentifier(element) {
  // Universal field identification that works on ALL websites including Google Forms
  // Priority: Most specific to least specific
  
  // 1. aria-label (modern accessibility standard - works everywhere)
  if (element.getAttribute('aria-label') && element.getAttribute('aria-label').trim()) {
    return element.getAttribute('aria-label').trim();
  }
  
  // 2. Associated label element (including aria-labelledby for Google Forms)
  const label = findAssociatedLabel(element);
  if (label && label.trim().length > 1) {
    // Don't use generic labels like "Your answer"
    const trimmedLabel = label.trim();
    if (trimmedLabel !== 'Your answer' && !trimmedLabel.match(/^(Enter your|Type your|Fill in|Answer)/i)) {
      return trimmedLabel;
    }
  }
  
  // 3. placeholder text (very common on modern sites)
  if (element.placeholder && element.placeholder.trim()) {
    return element.placeholder.trim();
  }
  
  // 4. name attribute (backend form processing standard)
  if (element.name && element.name.trim()) {
    return element.name.trim();
  }
  
  // 5. id attribute (unique identifier)
  if (element.id && element.id.trim()) {
    return element.id.trim();
  }
  
  // 6. title attribute (tooltip text)
  if (element.title && element.title.trim()) {
    return element.title.trim();
  }
  
  // 7. For Google Forms and similar: Try to find question text in nearby containers
  const questionText = findGoogleFormsQuestionText(element);
  if (questionText) {
    return questionText;
  }
  
  // 8. Fallback: input type + position (ensures uniqueness)
  const form = element.closest('form') || document.body;
  const inputs = form.querySelectorAll('input, textarea, select');
  const index = Array.from(inputs).indexOf(element);
  return `${element.type || 'text'}_field_${index}`;
}

// Removed complex normalizeFieldName function - using direct label matching now

// Removed detectFieldTypeFromContext function - using simple field identification now

function findAssociatedLabel(element) {
  // Universal label detection that works on ALL websites including Google Forms
  
  // Method 0: aria-labelledby (Google Forms and modern web apps)
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    // Split by space to handle multiple IDs
    const labelIds = labelledBy.split(/\s+/);
    for (const labelId of labelIds) {
      const labelElement = document.getElementById(labelId);
      if (labelElement) {
        const labelText = cleanLabelText(labelElement.textContent);
        if (isValidLabelText(labelText)) {
          return labelText;
        }
      }
    }
  }
  
  // Method 1: Standard HTML label with 'for' attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return cleanLabelText(label.textContent);
  }
  
  // Method 2: Parent label element (input inside label)
  const parentLabel = element.closest('label');
  if (parentLabel) {
    return cleanLabelText(parentLabel.textContent);
  }
  
  // Method 3: Previous sibling label
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === 'LABEL') {
      return cleanLabelText(sibling.textContent);
    }
    sibling = sibling.previousElementSibling;
  }
  
  // Method 4: Search parent containers for text (works for most websites)
  let currentElement = element.parentElement;
  let searchDepth = 0;
  
  while (currentElement && searchDepth < 5) {
    // Look for any text elements that could be labels
    const textElements = currentElement.querySelectorAll('*');
    
    for (const textEl of textElements) {
      if (textEl === element || textEl.contains(element)) continue;
      
      const text = cleanLabelText(textEl.textContent);
      if (isValidLabelText(text)) {
        return text;
      }
    }
    
    currentElement = currentElement.parentElement;
    searchDepth++;
  }
  
  // Method 5: Look for nearby text nodes (for any website structure)
  const nearbyText = findNearbyText(element);
  if (nearbyText) return nearbyText;
  
  return null;
}

function cleanLabelText(text) {
  if (!text) return '';
  
  return text
    .trim()
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/[*:]/g, '')  // Remove asterisks and colons
    .replace(/\(required\)/gi, '') // Remove "required" text
    .replace(/\(optional\)/gi, '') // Remove "optional" text
    .trim();
}

function isValidLabelText(text) {
  if (!text || text.length < 2 || text.length > 100) return false;
  
  // Skip if it's just numbers, symbols, or common non-label text
  if (/^\d+$/.test(text)) return false;
  if (/^[^a-zA-Z]*$/.test(text)) return false;
  if (/^(submit|button|click|here|go|ok|yes|no)$/i.test(text)) return false;
  
  return true;
}

function findNearbyText(element) {
  // Look for text in nearby elements (works for any website layout)
  const rect = element.getBoundingClientRect();
  const allElements = document.querySelectorAll('*');
  
  let closestText = null;
  let closestDistance = Infinity;
  
  for (const el of allElements) {
    if (el === element || el.contains(element) || element.contains(el)) continue;
    
    const elRect = el.getBoundingClientRect();
    const text = cleanLabelText(el.textContent);
    
    if (!isValidLabelText(text)) continue;
    
    // Calculate distance (prioritize elements above or to the left)
    const distance = Math.sqrt(
      Math.pow(rect.left - elRect.left, 2) + 
      Math.pow(rect.top - elRect.top, 2)
    );
    
    if (distance < closestDistance && distance < 200) { // Within 200px
      closestDistance = distance;
      closestText = text;
    }
  }
  
  return closestText;
}

function showSaveOption(element) {
  const fieldName = getFieldIdentifier(element);
  const value = element.value.trim();
  
  if (value.length < 2) return;
  
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log('Extension context invalidated, skipping save option');
    return;
  }
  
  // Check if this exact value is already saved for this field
  chrome.runtime.sendMessage({
    action: 'checkIfExists',
    fieldName: fieldName,
    value: value
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Extension context error:', chrome.runtime.lastError.message);
      return;
    }
    if (response && !response.exists) {
      displaySaveOption(element, fieldName, value);
    }
    // If exists, don't show save option at all
  });
}

function displaySaveOption(element, fieldName, value) {
  // Remove any existing save option
  hideSaveOption();
  
  // Get the human-readable label for display
  const displayLabel = getDisplayName(fieldName, element);
  
  const saveOption = document.createElement('div');
  saveOption.className = 'autofill-save-option';
  saveOption.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 999999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: slideDown 0.4s ease-out;
    min-width: 300px;
    max-width: 500px;
    text-align: center;
  `;
  
  // Add CSS animation
  if (!document.getElementById('autofill-styles')) {
    const style = document.createElement('style');
    style.id = 'autofill-styles';
    style.textContent = `
      @keyframes slideDown {
        from { 
          opacity: 0; 
          transform: translateX(-50%) translateY(-20px); 
        }
        to { 
          opacity: 1; 
          transform: translateX(-50%) translateY(0); 
        }
      }
      @keyframes slideUp {
        from { 
          opacity: 1; 
          transform: translateX(-50%) translateY(0); 
        }
        to { 
          opacity: 0; 
          transform: translateX(-50%) translateY(-20px); 
        }
      }
      .autofill-save-option.hiding {
        animation: slideUp 0.3s ease-in forwards;
      }
    `;
    document.head.appendChild(style);
  }
  
  saveOption.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
      <span style="font-weight: 500;">💾 Save "${displayLabel}" for future use?</span>
      <div style="display: flex; gap: 8px;">
        <button id="saveBtn" style="background: white; color: #4CAF50; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s;">Save</button>
        <button id="closeBtn" style="background: transparent; color: white; border: 2px solid white; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 13px; transition: all 0.2s;">✕</button>
      </div>
    </div>
  `;
  
  const saveBtn = saveOption.querySelector('#saveBtn');
  const closeBtn = saveOption.querySelector('#closeBtn');
  
  // Add hover effects
  saveBtn.addEventListener('mouseenter', () => {
    saveBtn.style.background = '#f0f0f0';
    saveBtn.style.transform = 'scale(1.05)';
  });
  saveBtn.addEventListener('mouseleave', () => {
    saveBtn.style.background = 'white';
    saveBtn.style.transform = 'scale(1)';
  });
  
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255,255,255,0.2)';
    closeBtn.style.transform = 'scale(1.05)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'transparent';
    closeBtn.style.transform = 'scale(1)';
  });
  
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveFieldData(element, fieldName, value);
    hideSaveOption();
    showSavedConfirmation();
  });
  
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideSaveOption();
  });
  
  // Auto-hide after 10 seconds with smooth animation
  const autoHideTimer = setTimeout(() => {
    hideSaveOption();
  }, 10000);
  
  // Store timer reference to clear it if manually closed
  saveOption.autoHideTimer = autoHideTimer;
  
  document.body.appendChild(saveOption);
}

function hideSaveOption() {
  const existingSaveOption = document.querySelector('.autofill-save-option');
  if (existingSaveOption) {
    // Clear auto-hide timer
    if (existingSaveOption.autoHideTimer) {
      clearTimeout(existingSaveOption.autoHideTimer);
    }
    
    // Add hiding animation
    existingSaveOption.classList.add('hiding');
    
    // Remove after animation
    setTimeout(() => {
      if (existingSaveOption.parentNode) {
        existingSaveOption.remove();
      }
    }, 300);
  }
}

function showSavedConfirmation() {
  const confirmation = document.createElement('div');
  confirmation.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #2196F3;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    animation: slideDown 0.4s ease-out;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  
  confirmation.innerHTML = '✓ Saved successfully!';
  document.body.appendChild(confirmation);
  
  setTimeout(() => {
    confirmation.style.animation = 'slideUp 0.3s ease-in forwards';
    setTimeout(() => {
      if (confirmation.parentNode) {
        confirmation.remove();
      }
    }, 300);
  }, 2000);
}

function saveFieldData(element, fieldName = null, value = null) {
  fieldName = fieldName || getFieldIdentifier(element);
  value = value || element.value.trim();
  
  if (value.length < 2) return;
  
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log('Extension context invalidated, cannot save data');
    return;
  }
  
  const formData = {
    fieldName: fieldName,
    value: value,
    domain: window.location.hostname,
    url: window.location.href,
    label: findAssociatedLabel(element) || fieldName
  };
  
  chrome.runtime.sendMessage({
    action: 'saveFormData',
    data: formData
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Extension context error while saving:', chrome.runtime.lastError.message);
      return;
    }
  });
}

async function showSuggestions(element) {
  const fieldName = getFieldIdentifier(element);
  
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    return;
  }
  
  // Get suggestions for this exact field
  chrome.runtime.sendMessage({
    action: 'getFormData',
    fieldName: fieldName
  }, (response) => {
    if (chrome.runtime.lastError) {
      return;
    }
    
    const suggestions = (response && response.data) ? response.data : [];
    
    if (suggestions.length > 0) {
      displaySuggestionBox(element, suggestions);
    }
  });
}

function displaySuggestionBox(element, suggestions) {
  hideSuggestions(); // Remove any existing suggestion box
  
  const rect = element.getBoundingClientRect();
  suggestionBox = document.createElement('div');
  suggestionBox.className = 'autofill-suggestions';
  suggestionBox.style.cssText = `
    position: fixed;
    top: ${rect.bottom + window.scrollY + 2}px;
    left: ${rect.left + window.scrollX}px;
    width: ${rect.width}px;
    max-height: 200px;
    overflow-y: auto;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
  `;
  
  suggestions.slice(0, 5).forEach((suggestion, index) => {
    const suggestionItem = document.createElement('div');
    suggestionItem.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
      transition: background-color 0.2s;
    `;
    
    suggestionItem.textContent = suggestion.value;
    
    suggestionItem.addEventListener('mouseenter', () => {
      suggestionItem.style.backgroundColor = '#f0f0f0';
    });
    
    suggestionItem.addEventListener('mouseleave', () => {
      suggestionItem.style.backgroundColor = 'white';
    });
    
    suggestionItem.addEventListener('click', () => {
      element.value = suggestion.value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      hideSuggestions();
      
      // Save usage frequency
      saveFieldData(element);
    });
    
    suggestionBox.appendChild(suggestionItem);
  });
  
  document.body.appendChild(suggestionBox);
}

function hideSuggestions() {
  if (suggestionBox) {
    suggestionBox.remove();
    suggestionBox = null;
  }
}

async function detectFormAndShowAutoFill(focusedElement) {
  try {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      return;
    }
    
    // Find the form or container
    const form = focusedElement.closest('form') || document.body;
    
    // Generate a unique ID for this form
    const formId = generateFormId(form);
    
    // Don't show if auto-fill popup is already visible for this specific form
    if (autoFillPopup && currentFormId === formId) return;
    
    const allFields = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="search"], textarea');
    
    if (allFields.length < 2) return; // Need at least 2 fields
    
    // Get all saved data
    const result = await chrome.runtime.sendMessage({action: 'getAllFormData'});
    
    if (chrome.runtime.lastError) {
      return;
    }
    
    const savedData = result?.data || {};
    
    // Find matching fields using exact label matching
    const matchingFields = [];
    allFields.forEach(field => {
      if (field === focusedElement) return; // Skip the currently focused field
      
      const fieldId = getFieldIdentifier(field);
      
      // Look for exact match in saved data
      if (savedData[fieldId] && savedData[fieldId].length > 0) {
        // Create a deep copy to avoid reference issues
        const fieldSuggestions = savedData[fieldId].map(item => ({
          value: item.value,
          frequency: item.frequency,
          lastUsed: item.lastUsed,
          domain: item.domain,
          label: item.label
        }));
        
        matchingFields.push({
          element: field,
          fieldId: fieldId,
          suggestions: fieldSuggestions
        });
      }
    });
    
    // Show auto-fill popup if we have matches
    if (matchingFields.length > 0) {
      currentFormId = formId;
      showAutoFillPopup(matchingFields);
    }
  } catch (error) {
    console.error('Error in detectFormAndShowAutoFill:', error);
  }
}

// Removed complex smart field matching - using direct label matching only

function generateFormId(form) {
  try {
    // Generate a unique ID for the form based on its characteristics
    if (form.id) return `form-${form.id}`;
    if (form.tagName === 'FORM' && form.action) return `form-${form.action}`;
    
    // Generate ID based on form structure and position
    const formIndex = Array.from(document.querySelectorAll('form')).indexOf(form);
    const fieldCount = form.querySelectorAll('input, textarea, select').length;
    
    return `form-${formIndex}-${fieldCount}-${form.tagName}`;
  } catch (error) {
    console.error('Error generating form ID:', error);
    return `form-default-${Date.now()}`;
  }
}

function showAutoFillPopup(matchingFields) {
  // Remove any existing auto-fill popup
  hideAutoFillPopup();
  
  autoFillPopup = document.createElement('div');
  autoFillPopup.className = 'autofill-popup';
  autoFillPopup.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    background: #2196F3;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 999998;
    box-shadow: 0 6px 25px rgba(0,0,0,0.3);
    animation: slideInRight 0.4s ease-out;
    min-width: 280px;
    max-width: 400px;
  `;
  
  // Update CSS animations
  const existingStyle = document.getElementById('autofill-styles');
  if (existingStyle) {
    existingStyle.textContent += `
      @keyframes slideInRight {
        from { 
          opacity: 0; 
          transform: translateX(20px); 
        }
        to { 
          opacity: 1; 
          transform: translateX(0); 
        }
      }
      @keyframes slideOutRight {
        from { 
          opacity: 1; 
          transform: translateX(0); 
        }
        to { 
          opacity: 0; 
          transform: translateX(20px); 
        }
      }
      .autofill-popup.hiding {
        animation: slideOutRight 0.3s ease-in forwards;
      }
    `;
  }
  
  const fieldsList = matchingFields.map(field => {
    const displayLabel = getDisplayName(field.fieldId, field.element);
    return `<div style="margin: 4px 0; font-size: 13px; opacity: 0.9;">
      📝 ${displayLabel}: "${field.suggestions[0].value}"
    </div>`
  }).join('');
  
  autoFillPopup.innerHTML = `
    <div style="margin-bottom: 12px;">
      <div style="font-weight: 600; margin-bottom: 8px;">🚀 Auto-Fill Available!</div>
      <div style="font-size: 13px; opacity: 0.9;">Found ${matchingFields.length} matching field${matchingFields.length > 1 ? 's' : ''}:</div>
    </div>
    <div style="margin-bottom: 15px; max-height: 120px; overflow-y: auto;">
      ${fieldsList}
    </div>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button id="autoFillAllBtn" style="background: white; color: #2196F3; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s;">Fill All</button>
      <button id="autoFillCloseBtn" style="background: transparent; color: white; border: 2px solid white; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;">Later</button>
    </div>
  `;
  
  const fillAllBtn = autoFillPopup.querySelector('#autoFillAllBtn');
  const closeBtn = autoFillPopup.querySelector('#autoFillCloseBtn');
  
  // Add hover effects
  fillAllBtn.addEventListener('mouseenter', () => {
    fillAllBtn.style.background = '#f0f0f0';
    fillAllBtn.style.transform = 'scale(1.05)';
  });
  fillAllBtn.addEventListener('mouseleave', () => {
    fillAllBtn.style.background = 'white';
    fillAllBtn.style.transform = 'scale(1)';
  });
  
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255,255,255,0.2)';
    closeBtn.style.transform = 'scale(1.05)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'transparent';
    closeBtn.style.transform = 'scale(1)';
  });
  
  fillAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fillAllMatchingFields(matchingFields);
    hideAutoFillPopup();
    showAutoFillSuccess(matchingFields.length);
  });
  
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideAutoFillPopup();
  });
  
  // Don't auto-hide - stays until user clicks a button
  document.body.appendChild(autoFillPopup);
  
  // Store matching fields for later use
  formFields = matchingFields;
}

function fillAllMatchingFields(matchingFields) {
  matchingFields.forEach((field, index) => {
    const element = field.element;
    const fieldId = field.fieldId;
    const suggestions = field.suggestions;
    
    // Validate we have suggestions
    if (!suggestions || suggestions.length === 0) {
      return;
    }
    
    const bestSuggestion = suggestions[0]; // Use the most frequent/recent suggestion
    
    // Fill the field
    element.value = bestSuggestion.value;
    
    // Trigger events to ensure the website recognizes the change
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  });
}

function hideAutoFillPopup() {
  if (autoFillPopup) {
    // Add hiding animation
    autoFillPopup.classList.add('hiding');
    
    // Remove after animation
    setTimeout(() => {
      if (autoFillPopup && autoFillPopup.parentNode) {
        autoFillPopup.remove();
        autoFillPopup = null;
        currentFormId = null; // Reset form tracking when popup is hidden
      }
    }, 300);
  }
}

function showAutoFillSuccess(count) {
  const success = document.createElement('div');
  success.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    animation: slideInRight 0.4s ease-out;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  
  success.innerHTML = `✅ Filled ${count} field${count > 1 ? 's' : ''} successfully!`;
  document.body.appendChild(success);
  
  setTimeout(() => {
    success.style.animation = 'slideOutRight 0.3s ease-in forwards';
    setTimeout(() => {
      if (success.parentNode) {
        success.remove();
      }
    }, 300);
  }, 3000);
}

async function triggerManualAutoFill() {
  try {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      return {success: false, message: 'Extension context invalidated'};
    }
    
    // Find all form fields on the page
    const allFields = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="search"], textarea');
    
    if (allFields.length === 0) {
      return {success: false, message: 'No form fields found'};
    }
    
    // Get available data for matching
    const result = await chrome.runtime.sendMessage({action: 'getAllFormData'});
    
    if (chrome.runtime.lastError) {
      return {success: false, message: 'Extension context error'};
    }
    
    const savedData = result?.data || {};
    
    // Find matching fields using direct label matching
    const matchingFields = [];
    allFields.forEach(field => {
      // Skip fields that are already filled
      if (field.value && field.value.trim().length > 0) return;
      
      const fieldId = getFieldIdentifier(field);
      
      // Look for exact match in saved data
      if (savedData[fieldId] && savedData[fieldId].length > 0) {
        // Create a deep copy to avoid reference issues
        const fieldSuggestions = savedData[fieldId].map(item => ({
          value: item.value,
          frequency: item.frequency,
          lastUsed: item.lastUsed,
          domain: item.domain,
          label: item.label
        }));
        
        matchingFields.push({
          element: field,
          fieldId: fieldId,
          suggestions: fieldSuggestions
        });
      }
    });
    
    if (matchingFields.length === 0) {
      return {success: false, message: 'No matching data found'};
    }
    
    // Fill all matching fields
    fillAllMatchingFields(matchingFields);
    showAutoFillSuccess(matchingFields.length);
    
    return {success: true, count: matchingFields.length};
  } catch (error) {
    console.error('Error in manual auto-fill:', error);
    return {success: false, message: 'Error occurred'};
  }
}

function getDisplayName(fieldIdentifier, element) {
  // If we have the actual label, use it
  const label = findAssociatedLabel(element);
  if (label && label.trim().length > 1) {
    return label.trim();
  }
  
  // Otherwise use the field identifier (cleaned up)
  return fieldIdentifier.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Listen for extension toggle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isExtensionContextValid()) {
    console.log('Extension context invalidated, cannot process message');
    return false;
  }
  
  if (request.action === 'toggleExtension') {
    isExtensionEnabled = request.enabled;
    if (!isExtensionEnabled) {
      hideSuggestions();
      hideSaveOption();
      hideAutoFillPopup();
      currentFormId = null; // Reset form tracking
    }
  } else if (request.action === 'triggerAutoFill') {
    // Trigger auto-fill from popup
    triggerManualAutoFill().then(result => {
      sendResponse(result);
    }).catch(error => {
      console.error('Error in triggerAutoFill:', error);
      sendResponse({success: false, message: 'Extension context error'});
    });
    return true; // Will respond asynchronously
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  hideSuggestions();
  hideSaveOption();
  hideAutoFillPopup();
  currentFormId = null; // Reset form tracking
});

function findGoogleFormsQuestionText(element) {
  // Specific function to handle Google Forms and similar dynamic form structures
  let currentContainer = element.parentElement;
  let searchDepth = 0;
  
  while (currentContainer && searchDepth < 8) {
    // Look for elements that might contain question text
    const questionCandidates = currentContainer.querySelectorAll('div, span, label, h1, h2, h3, h4, h5, h6');
    
    for (const candidate of questionCandidates) {
      // Skip if this element contains our input field
      if (candidate.contains(element)) continue;
      
      const text = cleanLabelText(candidate.textContent);
      
      // Look for question-like text patterns
      if (isQuestionText(text)) {
        return text;
      }
    }
    
    currentContainer = currentContainer.parentElement;
    searchDepth++;
  }
  
  return null;
}

function isQuestionText(text) {
  if (!text || text.length < 3 || text.length > 200) return false;
  
  // Skip common non-question text
  if (/^(your answer|enter|type|fill|click|submit|button|required|optional|\*|\.{3,})$/i.test(text)) {
    return false;
  }
  
  // Skip if it's just numbers or symbols
  if (/^[\d\s\-_+=\[\](){}|\\\/.,;:!@#$%^&*]+$/.test(text)) {
    return false;
  }
  
  // Look for question patterns or meaningful field names
  if (
    /\b(name|first|last|email|phone|address|city|state|zip|country|company|title|age|date|birth)\b/i.test(text) ||
    /\?$/.test(text) || // Ends with question mark
    text.includes('What') || text.includes('How') || text.includes('When') || text.includes('Where') ||
    text.length >= 5 // Reasonable length for a field label
  ) {
    return true;
  }
  
  return false;
}
