# 🚀 Auto-Fill Assistant

> Universal Chrome extension that automatically saves and fills form data across any website.

## ✨ What It Does

- **Works everywhere**: Google Forms, Amazon, LinkedIn, job sites, surveys - any website
- **Smart field matching**: Uses labels, aria-attributes, and context to fill the right data
- **Your choice**: You decide what to save, extension only suggests
- **100% private**: All data stays on your computer, never shared

## 🎯 How It Works

1. **Type in any form** → Extension offers to save data after 1.5 seconds
2. **Click "Save"** → Data stored with the field's actual label
3. **Visit other forms** → Auto-fill popup appears for matching fields
4. **Click "Fill All"** → Entire form completed instantly

## 🔧 Installation

### Chrome Web Store (Coming Soon)
*Extension will be published to Chrome Web Store*

### Manual Installation
1. Download this repository
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" → Click "Load unpacked"
4. Select the extension folder → Done!

## 💡 Key Features

- ✅ **Universal compatibility** - Works on all websites
- ✅ **Perfect accuracy** - Never fills wrong data in wrong fields
- ✅ **Google Forms support** - Full compatibility with modern forms
- ✅ **Privacy first** - No tracking, no external servers
- ✅ **One-click filling** - Complete forms instantly
- ✅ **Smart suggestions** - Individual field auto-complete

## 🛠️ Technical Details

**Field Detection Priority:**
1. aria-label / aria-labelledby
2. HTML labels and placeholder text
3. Name/ID attributes
4. Context-aware text detection

**Storage:** Chrome local storage API (secure, private, no cloud sync)
**Compatibility:** Chrome 88+ (Manifest V3)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes and test
4. Submit pull request

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

**Install once, save time forever!** 🚀
