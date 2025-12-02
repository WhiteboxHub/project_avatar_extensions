# LinkedIn Auto Connector

A Chrome extension that automatically sends LinkedIn connection requests from JSON contact data with customizable messages and timing controls.

## Features

-  Bulk connection requests from JSON contact data
-  Customizable connection messages with name templating
-  Configurable delay between requests (15-60 seconds)
-  Progress tracking and real-time status updates
-  Connection logging and CSV export
-  Safety controls to respect LinkedIn limits

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the extension folder
5. Pin the extension icon to your toolbar

## Usage

### 1. Prepare Your Contact Data

Create a JSON file with contact information. Supported formats:

**Format 1 - Array of contacts:**
```json
[
  {
    "contactName": "John Doe",
    "linkedInUrl": "https://linkedin.com/in/johndoe"
  },
  {
    "contactName": "Jane Smith",
    "linkedInUrl": "https://linkedin.com/in/janesmith"
  }
]
```


> **Important**: Only contacts with valid `linkedInUrl` fields will be processed.

### 2. Configure Settings

1. Click the extension icon to open the popup
2. **Upload JSON File**: Select your prepared JSON file
3. **Connection Message** (Optional): Customize your invitation message
   - Use `{{name}}` or `{{contactName}}` to insert the contact's name
   - Example: `"Hi {{name}}, I'd like to connect with you to discuss opportunities."`
4. **Delay between requests**: 15-60 seconds (recommended: 15+ seconds)
5. **Max Connections**: Limit the number of connections per session (1-50)

### 3. Start Auto-Connecting

1. Navigate to **LinkedIn.com** in the current tab
2. Click **Start Auto Connecting**
3. Monitor progress in the popup
4. Use **Stop** to pause the process at any time

## Message Templates

The extension supports dynamic message templates:

- `{{name}}` - Inserts the contact's name
- `{{contactName}}` - Alternative name placeholder

**Default Template** (used if no custom message provided):
```
"Hi {{name}}, As a GenAI enthusiast with relevant skills, I'd like to connect to explore opportunities and learn from your experience."
```

## Output & Logging

### Connection Logs
- Download CSV logs of all connection attempts
- Includes timestamp, contact name, LinkedIn URL, status, and error messages
- Useful for tracking success rates and troubleshooting

### Log Format
```csv
Timestamp,Contact Name,LinkedIn URL,Status,Message/Error
"2024-01-15T10:30:00Z","John Doe","https://linkedin.com/in/johndoe","success","Connection sent successfully"
```

## Safety & Limits

- **Minimum 15-second delay** between requests to avoid LinkedIn rate limits
- **Maximum 50 connections** per session to prevent detection
- **Automatic stops** if LinkedIn UI changes are detected
- **Manual stop button** for immediate cancellation

## Troubleshooting

**"Please navigate to LinkedIn.com first"**
- Ensure you're on LinkedIn.com in the current tab
- Refresh the page and try again

**"No valid contacts found"**
- Check your JSON file structure
- Ensure all contacts have valid `linkedInUrl` fields
- Verify JSON syntax is correct

**Connection failures**
- LinkedIn may have updated their UI
- Check that profiles are accessible and not restricted
- Verify you haven't reached LinkedIn's connection limit

**Extension not working**
- Ensure you're using the latest version
- Check Chrome extension permissions
- Restart Chrome and reload the extension

## Technical Details

- **Manifest V3** Chrome Extension
- Uses Chrome scripting API for UI automation
- Stores settings locally in Chrome storage
- Implements shadow DOM traversal for LinkedIn's dynamic UI
- Includes retry logic and error handling

## File Structure

```
linkedin-auto-connector/
├── manifest.json
├── background.js      # Background process management
├── popup.html        # Extension UI
├── popup.js          # UI logic and settings
└── icons/            # Extension icons
```

## Privacy & Security

- All data processed locally in your browser
- No external servers or data collection
- API keys and settings stored securely in Chrome storage
- Only accesses LinkedIn.com domains

## Disclaimer

This tool is for personal use and should be used in compliance with:
- LinkedIn's Terms of Service
- Respectful outreach practices
- Applicable laws and regulations

Use responsibly and avoid spamming connections.

---

**Made for efficient LinkedIn networking**
