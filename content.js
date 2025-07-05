// Content script that runs on all websites
let isExtensionEnabled = true;
let suggestionBox = null;
let currentField = null;
let autoFillPopup = null;
let detectedForm = null;
let formFields = [];
let currentFormId = null; // Track which form we've shown auto-fill for

// Smart field normalization - groups similar field types together
const FIELD_NORMALIZATION_MAP = {
  // Phone number variations
  'phone': ['phone', 'phone number', 'mobile', 'mobile number', 'cell', 'cell phone', 'telephone', 'tel', 'contact number', 'contact', 'phone no', 'mobile no', 'cell no', 'work phone', 'home phone'],
  
  // Email variations
  'email': ['email', 'email address', 'e-mail', 'e-mail address', 'electronic mail', 'mail', 'email id', 'work email', 'personal email'],
  
  // Name variations
  'full_name': ['full name', 'name', 'your name', 'complete name', 'full legal name', 'legal name', 'display name'],
  'first_name': ['first name', 'given name', 'forename', 'fname', 'first', 'name (first)', 'given', 'firstname'],
  'last_name': ['last name', 'surname', 'family name', 'lname', 'last', 'name (last)', 'lastname', 'familyname'],
  'middle_name': ['middle name', 'middle initial', 'middle', 'mi', 'middlename'],
  
  // Address variations
  'address': ['address', 'street address', 'home address', 'mailing address', 'address line 1', 'street', 'addr', 'address1', 'street1'],
  'address_line_2': ['address line 2', 'apartment', 'apt', 'suite', 'unit', 'address 2', 'street address 2', 'address2', 'apt/suite'],
  'city': ['city', 'town', 'locality', 'municipality'],
  'state': ['state', 'province', 'region', 'state/province', 'state or province', 'st'],
  'postal_code': ['postal code', 'zip code', 'zip', 'postcode', 'postal', 'pincode', 'pin', 'zipcode'],
  'country': ['country', 'nation', 'nationality', 'country/region'],
  
  // Company/Work variations
  'company': ['company', 'organization', 'employer', 'company name', 'business', 'firm', 'corporation', 'current employer', 'workplace'],
  'job_title': ['job title', 'position', 'title', 'role', 'occupation', 'designation', 'current position', 'position title', 'job role'],
  'department': ['department', 'division', 'team', 'dept', 'group'],
  'work_experience': ['experience', 'years of experience', 'work experience', 'professional experience', 'years experience'],
  'salary': ['salary', 'expected salary', 'current salary', 'compensation', 'pay', 'wage', 'income'],
  
  // Personal info variations
  'date_of_birth': ['date of birth', 'birth date', 'birthday', 'dob', 'birthdate', 'born'],
  'age': ['age', 'your age'],
  'gender': ['gender', 'sex'],
  
  // Contact variations
  'website': ['website', 'web site', 'url', 'homepage', 'blog', 'personal website', 'portfolio', 'portfolio url'],
  'linkedin': ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin link'],
  'social_media': ['twitter', 'facebook', 'instagram', 'social', 'social media'],
  
  // Additional fields
  'message': ['message', 'comment', 'comments', 'note', 'notes', 'description', 'details', 'additional info', 'cover letter', 'about', 'bio'],
  'subject': ['subject', 'topic', 'regarding', 'title', 'reason'],
  'password': ['password', 'pass', 'pwd', 'passphrase'],
  'username': ['username', 'user name', 'login', 'user id', 'userid'],
  
  // Education
  'school': ['school', 'university', 'college', 'institution', 'alma mater', 'education', 'university/college'],
  'degree': ['degree', 'qualification', 'education level', 'highest education', 'major', 'field of study'],
  'graduation_year': ['graduation year', 'year graduated', 'completion year', 'grad year'],
  'gpa': ['gpa', 'grade point average', 'cgpa', 'grades'],
  
  // Emergency contact
  'emergency_contact': ['emergency contact', 'emergency contact name', 'next of kin', 'reference'],
  'emergency_phone': ['emergency phone', 'emergency contact phone', 'emergency number', 'reference phone'],
  
  // Job application specific
  'availability': ['availability', 'start date', 'available from', 'when can you start', 'notice period'],
  'visa_status': ['visa status', 'work authorization', 'authorization to work', 'eligible to work', 'work permit'],
  'relocation': ['willing to relocate', 'relocation', 'open to relocation', 'relocate'],
  'reference_name': ['reference name', 'reference', 'referee name', 'professional reference'],
  'reference_phone': ['reference phone', 'reference contact', 'referee phone'],
  'reference_email': ['reference email', 'referee email'],
  'cover_letter': ['cover letter', 'why interested', 'motivation', 'why you', 'personal statement'],
  
  // Skills and certifications
  'skills': ['skills', 'technical skills', 'key skills', 'relevant skills', 'core competencies'],
  'certifications': ['certifications', 'certificates', 'licenses', 'professional certifications'],
  'languages': ['languages', 'language skills', 'spoken languages'],
  
  // Additional personal details
  'portfolio_url': ['portfolio', 'portfolio url', 'work samples', 'projects', 'github'],
  'how_did_you_hear': ['how did you hear', 'heard about', 'source', 'referral source'],
  'preferred_contact': ['preferred contact', 'best time to contact', 'contact preference']
};

// Create reverse lookup map for faster field type detection
const FIELD_TYPE_LOOKUP = {};
Object.keys(FIELD_NORMALIZATION_MAP).forEach(normalizedType => {
  FIELD_NORMALIZATION_MAP[normalizedType].forEach(variation => {
    FIELD_TYPE_LOOKUP[variation.toLowerCase()] = normalizedType;
  });
});

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
  
  // Inject CSS styles for the extension
  injectStyles();
  
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

function injectStyles() {
  // Only inject styles once
  if (document.getElementById('autofill-extension-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'autofill-extension-styles';
  style.textContent = `
    .autofill-suggestions {
      position: fixed !important;
      background: white !important;
      border: 1px solid #ccc !important;
      border-radius: 4px !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
      z-index: 999999 !important;
      font-family: Arial, sans-serif !important;
      font-size: 14px !important;
      max-height: 200px !important;
      overflow-y: auto !important;
    }
    
    .autofill-popup {
      position: fixed !important;
      background: #2196F3 !important;
      color: white !important;
      border-radius: 12px !important;
      font-family: Arial, sans-serif !important;
      z-index: 999998 !important;
      box-shadow: 0 6px 25px rgba(0,0,0,0.3) !important;
    }
    
    .autofill-save-option {
      position: fixed !important;
      background: #4CAF50 !important;
      color: white !important;
      border-radius: 8px !important;
      font-family: Arial, sans-serif !important;
      z-index: 999997 !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
    }
    
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
      animation: slideOutRight 0.3s ease-in forwards !important;
    }
  `;
  
  document.head.appendChild(style);
}

function attachEventListeners() {
  // Listen for input events on all text inputs
  document.addEventListener('input', handleInputEvent, true);
  document.addEventListener('focus', handleFocusEvent, true);
  document.addEventListener('blur', handleBlurEvent, true);
  document.addEventListener('click', handleClickEvent, true);
  
  // Enhanced mutation observer for dynamic websites (SPAs, AJAX forms)
  const observer = new MutationObserver((mutations) => {
    let shouldResetFormTracking = false;
    
    mutations.forEach((mutation) => {
      // Check if new form elements were added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            // Check if the added node contains form fields
            const hasFormFields = node.querySelectorAll && 
              node.querySelectorAll('input, textarea, select, [contenteditable], [role="textbox"]').length > 0;
            
            if (hasFormFields || 
                node.tagName === 'FORM' || 
                node.classList?.contains('form') ||
                node.classList?.contains('form-container')) {
              shouldResetFormTracking = true;
            }
          }
        });
      }
    });
    
    // Reset form tracking when new forms are detected
    if (shouldResetFormTracking && currentFormId && !document.querySelector('.autofill-popup')) {
      currentFormId = null;
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also handle page navigation for SPAs
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // Reset form tracking on navigation
      currentFormId = null;
      hideAutoFillPopup();
      hideSuggestions();
      hideSaveOption();
    }
  }).observe(document, { subtree: true, childList: true });
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
    
    // Add a small delay to handle dynamically loaded forms
    setTimeout(() => {
      // Detect if this is part of a form and check for auto-fill opportunity
      detectFormAndShowAutoFill(element);
      
      // Show individual field suggestions
      showSuggestions(element);
    }, 100); // 100ms delay to allow form to fully load
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
  // Universal form field detection - works on ALL websites
  if (!element || !element.tagName) return false;
  
  const tagName = element.tagName.toLowerCase();
  
  // Standard text inputs and textareas
  if (tagName === 'textarea') return true;
  
  if (tagName === 'input') {
    const inputType = (element.type || 'text').toLowerCase();
    
    // Include all text-based input types that can be auto-filled
    const allowedTypes = [
      'text', 'email', 'tel', 'url', 'search', 'password', 
      'number', 'date', 'datetime-local', 'month', 'week', 
      'time', 'color', 'range'
    ];
    
    // Also accept inputs without explicit type (defaults to text)
    if (!element.type || allowedTypes.includes(inputType)) {
      return true;
    }
  }
  
  // Custom form elements (many job sites use these)
  if (tagName === 'select') return true;
  
  // Content-editable elements (some modern forms use these)
  if (element.contentEditable === 'true' || element.contentEditable === '') {
    return true;
  }
  
  // Elements with role="textbox" (ARIA accessibility)
  if (element.getAttribute('role') === 'textbox') return true;
  
  // Check for common data attributes used by form libraries
  if (element.hasAttribute('data-input') || 
      element.hasAttribute('data-field') ||
      element.hasAttribute('data-form-field')) {
    return true;
  }
  
  // Check for common CSS classes used by form frameworks
  const className = element.className || '';
  const formFieldClasses = [
    'form-control', 'form-input', 'input', 'textbox', 
    'text-field', 'field-input', 'form-field'
  ];
  
  if (formFieldClasses.some(cls => className.includes(cls))) {
    return true;
  }
  
  return false;
}

function normalizeFieldName(rawFieldName) {
  if (!rawFieldName || typeof rawFieldName !== 'string') {
    return null;
  }
  
  // Clean and normalize the field name
  const cleaned = rawFieldName.toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')  // Replace special chars with spaces
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
  
  // Direct lookup in our normalization map
  if (FIELD_TYPE_LOOKUP[cleaned]) {
    return FIELD_TYPE_LOOKUP[cleaned];
  }
  
  // Try partial matching for compound field names
  const words = cleaned.split(' ');
  
  // Check if any combination of words matches our patterns
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= words.length; j++) {
      const phrase = words.slice(i, j).join(' ');
      if (FIELD_TYPE_LOOKUP[phrase]) {
        return FIELD_TYPE_LOOKUP[phrase];
      }
    }
  }
  
  // Check individual words for key terms
  for (const word of words) {
    if (FIELD_TYPE_LOOKUP[word]) {
      return FIELD_TYPE_LOOKUP[word];
    }
  }
  
  // Special pattern matching for common variations
  if (cleaned.includes('phone') || cleaned.includes('mobile') || cleaned.includes('tel')) {
    return 'phone';
  }
  if (cleaned.includes('email') || cleaned.includes('mail')) {
    return 'email';
  }
  if (cleaned.includes('address') || cleaned.includes('street')) {
    return 'address';
  }
  if (cleaned.includes('name') && !cleaned.includes('user') && !cleaned.includes('company')) {
    if (cleaned.includes('first') || cleaned.includes('given')) return 'first_name';
    if (cleaned.includes('last') || cleaned.includes('family') || cleaned.includes('surname')) return 'last_name';
    if (cleaned.includes('middle')) return 'middle_name';
    return 'full_name';
  }
  if (cleaned.includes('city') || cleaned.includes('town')) {
    return 'city';
  }
  if (cleaned.includes('state') || cleaned.includes('province')) {
    return 'state';
  }
  if (cleaned.includes('zip') || cleaned.includes('postal') || cleaned.includes('pin')) {
    return 'postal_code';
  }
  if (cleaned.includes('country')) {
    return 'country';
  }
  if (cleaned.includes('company') || cleaned.includes('organization')) {
    return 'company';
  }
  
  // If no normalization found, return the original cleaned name
  return cleaned.replace(/\s+/g, '_');
}

function getFieldIdentifier(element) {
  // Universal field identification that works on ALL websites including Google Forms
  // Priority: Most specific to least specific
  
  let rawIdentifier = null;
  
  // 1. aria-label (modern accessibility standard - works everywhere)
  if (element.getAttribute('aria-label') && element.getAttribute('aria-label').trim()) {
    rawIdentifier = element.getAttribute('aria-label').trim();
  }
  
  // 2. Associated label element (including aria-labelledby for Google Forms)
  if (!rawIdentifier) {
    const label = findAssociatedLabel(element);
    if (label && label.trim().length > 1) {
      // Don't use generic labels like "Your answer"
      const trimmedLabel = label.trim();
      if (trimmedLabel !== 'Your answer' && !trimmedLabel.match(/^(Enter your|Type your|Fill in|Answer)/i)) {
        rawIdentifier = trimmedLabel;
      }
    }
  }
  
  // 3. placeholder text (very common on modern sites)
  if (!rawIdentifier && element.placeholder && element.placeholder.trim()) {
    rawIdentifier = element.placeholder.trim();
  }
  
  // 4. name attribute (backend form processing standard)
  if (!rawIdentifier && element.name && element.name.trim()) {
    rawIdentifier = element.name.trim();
  }
  
  // 5. id attribute (unique identifier)
  if (!rawIdentifier && element.id && element.id.trim()) {
    rawIdentifier = element.id.trim();
  }
  
  // 6. title attribute (tooltip text)
  if (!rawIdentifier && element.title && element.title.trim()) {
    rawIdentifier = element.title.trim();
  }
  
  // 7. For Google Forms and similar: Try to find question text in nearby containers
  if (!rawIdentifier) {
    const questionText = findGoogleFormsQuestionText(element);
    if (questionText) {
      rawIdentifier = questionText;
    }
  }
  
  // If we found a raw identifier, try to normalize it
  if (rawIdentifier) {
    const normalizedName = normalizeFieldName(rawIdentifier);
    if (normalizedName) {
      return normalizedName;
    }
  }
  
  // 8. Fallback: input type + position (ensures uniqueness)
  const form = element.closest('form') || document.body;
  const inputs = form.querySelectorAll('input, textarea, select');
  const index = Array.from(inputs).indexOf(element);
  return `${element.type || 'text'}_field_${index}`;
}

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

function getDisplayNameForNormalizedField(normalizedFieldName, originalLabel = null) {
  // If we have the original label and it's not a generic one, use it
  if (originalLabel && originalLabel.length > 1 && 
      !originalLabel.match(/^(Your answer|Enter your|Type your|Fill in|Answer)/i)) {
    return originalLabel;
  }
  
  // Map normalized field names to user-friendly display names
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
  
  // Return the display name or fallback to converting the normalized name
  return displayNames[normalizedFieldName] || 
         normalizedFieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function saveFieldData(element, fieldName = null, value = null) {
  const normalizedFieldName = fieldName || getFieldIdentifier(element);
  value = value || element.value.trim();
  
  if (value.length < 2) return;
  
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    return;
  }
  
  // Get the original label for display purposes
  const originalLabel = findAssociatedLabel(element) || 
                       element.getAttribute('aria-label') || 
                       element.placeholder;
  
  const formData = {
    fieldName: normalizedFieldName,  // Use normalized name as the key
    value: value,
    domain: window.location.hostname,
    url: window.location.href,
    label: originalLabel || getDisplayNameForNormalizedField(normalizedFieldName),
    originalLabel: originalLabel  // Keep original for reference
  };
  
  chrome.runtime.sendMessage({
    action: 'saveFormData',
    data: formData
  }, (response) => {
    if (chrome.runtime.lastError) {
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
    
    // Enhanced field selection - works on ALL websites
    const allFields = form.querySelectorAll(`
      input[type="text"], 
      input[type="email"], 
      input[type="tel"], 
      input[type="url"], 
      input[type="search"], 
      input[type="password"],
      input[type="number"],
      input[type="date"],
      input:not([type]),
      textarea,
      select,
      [contenteditable="true"],
      [role="textbox"],
      [data-input],
      [data-field],
      [data-form-field],
      .form-control,
      .form-input,
      .input,
      .textbox,
      .text-field,
      .field-input,
      .form-field
    `);
    
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
      if (!isFormField(field)) return; // Double-check it's a valid form field
      
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
    
    // Handle different types of form elements
    if (element.tagName.toLowerCase() === 'select') {
      // Handle select dropdowns
      const options = Array.from(element.options);
      const matchingOption = options.find(option => 
        option.text.toLowerCase() === bestSuggestion.value.toLowerCase() ||
        option.value.toLowerCase() === bestSuggestion.value.toLowerCase()
      );
      
      if (matchingOption) {
        element.selectedIndex = matchingOption.index;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (element.contentEditable === 'true' || element.contentEditable === '') {
      // Handle content-editable elements
      element.textContent = bestSuggestion.value;
      element.innerHTML = bestSuggestion.value;
      
      // Trigger input and change events for content-editable
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    } else {
      // Handle regular input fields and textareas
      element.value = bestSuggestion.value;
      
      // Trigger comprehensive events to ensure all frameworks detect the change
      const events = [
        'input',
        'change', 
        'blur',
        'keyup',
        'keydown'
      ];
      
      events.forEach(eventType => {
        element.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
      
      // Also trigger React-style events for React-based forms
      if (window.React) {
        const reactEvents = [
          'onInput',
          'onChange',
          'onBlur'
        ];
        
        reactEvents.forEach(eventName => {
          if (element[eventName]) {
            element[eventName]({ target: element, currentTarget: element });
          }
        });
      }
      
      // Trigger Vue.js events for Vue-based forms
      if (window.Vue) {
        element.dispatchEvent(new CustomEvent('vue:updated', { 
          bubbles: true, 
          detail: { value: bestSuggestion.value }
        }));
      }
      
      // Focus and blur to ensure validation triggers
      element.focus();
      setTimeout(() => {
        element.blur();
      }, 50);
    }
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
    
    // Enhanced field selection - works on ALL websites
    const allFields = document.querySelectorAll(`
      input[type="text"], 
      input[type="email"], 
      input[type="tel"], 
      input[type="url"], 
      input[type="search"], 
      input[type="password"],
      input[type="number"],
      input[type="date"],
      input:not([type]),
      textarea,
      select,
      [contenteditable="true"],
      [role="textbox"],
      [data-input],
      [data-field],
      [data-form-field],
      .form-control,
      .form-input,
      .input,
      .textbox,
      .text-field,
      .field-input,
      .form-field
    `);
    
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
      // Double-check it's a valid form field
      if (!isFormField(field)) return;
      
      // Skip fields that are already filled (unless it's a very short value)
      if (field.value && field.value.trim().length > 2) return;
      
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
  // Get the original label for display
  const originalLabel = findAssociatedLabel(element) || 
                       element.getAttribute('aria-label') || 
                       element.placeholder;
  
  // Use the new display name function with the original label as fallback
  return getDisplayNameForNormalizedField(fieldIdentifier, originalLabel);
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
