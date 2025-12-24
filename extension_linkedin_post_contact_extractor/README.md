# WBL LinkedIn Post Contact Extractor - Chrome Extension

##  Project Overview
The **WBL LinkedIn Post Contact Extractor** is a custom Google Chrome extension designed for Whitebox Learning employees. It automates the process of finding and extracting contact information (names, emails, phones) from LinkedIn posts and synchronizes this data directly with the WBL Backend.

This tool streamlines lead generation from LinkedIn by:
1.  **Extracting Data**: Parsing post content for email addresses and phone numbers.
2.  **Saving Candidates**: Automatically storing valid contacts in the WBL database (`vendor_contact` table).
3.  **Logging Activity**: tracking the number of extractions and saving a **CSV backup** of the findings into the employee's Job Activity Log.

---

##  Key Features
-   **Automated Feed Scrolling**: Automatically scrolls through the LinkedIn feed to load and analyze posts.
-   **Smart Contact Extraction**: Uses Regex patterns to identify emails, phone numbers, and location data within post text.
-   **Duplicate Prevention**: Checks simple local history and handles 409/400 errors from the backend to avoid saving the same person twice.
-   **Real-time Stats**: Displays "Found" vs "Saved" counts in the extension popup.
-   **Backend Integration**:
    -   Pushes contacts to `/api/vendor_contact`.
    -   Logs session activity to `/api/job_activity_logs`.
-   **Auto-CSV Generation**: When extraction stops, a structured CSV of all found contacts is generated and appended to the **Activity Log Notes** in the backend.

---

##  Project Structure

| File | Description |
| :--- | :--- |
| `manifest.json` | Extension configuration, permissions (host permissions for LinkedIn & WBL API). |
| `background.js` | The central brain. Handles API calls, manages extraction state, and generates the final CSV log. |
| `content.js` | Injected into LinkedIn pages. Performs the scrolling and DOM parsing to find post text. |
| `popup.html/js` | The user interface. Allows users to configure settings, start/stop extraction, and view live stats. |
| `setup.html/js` | An internal helper page for auto-configuring tokens (optional flow). |
| `setup_extension_job_type.py` | Python script to auto-generate the required Job Type ID in the backend database. |

---

## Installation Guide

### 1. Prerequisites
Ensure the **WBL Backend** is running and the "Job Type" has been created.
*   **Run the Setup Script**:
    ```bash
    cd extension_linkedin_post_contact_extractor
    python setup_extension_job_type.py
    ```
    This ensures the `job_activity_log` table will accept entries with the unique ID: `extension_linkedin_post_contact_extractor`.

### 2. Load into Chrome
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (toggle in the top-right corner).
3.  Click **Load unpacked** (top-left).
4.  Select the `extension_linkedin_post_contact_extractor` folder from your repository.
5.  The extension icon (WBL Logo) should appear in your toolbar.

---

## Configuration

Before using the tool, you must connect it to your WBL account.

1.  Click the **WBL Extractor** extension icon.
2.  Click **"System Config"** or the Settings gear icon (if available).
3.  **Authentication**:
    *   Click **"Auto-generate token & ID"**.
    *   Enter your **WBL Email** and **Password**.
    *   The system will automatically fetch your **Employee ID** and **API Token**.
4.  **Targeting (Optional)**:
    *   **Keywords**: Enter terms to filter posts (e.g., "Java, Python, Hiring"). *Note: Basic filtering is currently implementation-dependent; often it extracts all visible posts.*
    *   **Candidate ID**: (Optional) Link these extractions to a specific candidate in the system.
5.  Click **Save Configuration**.

---

## Usage Workflow

1.  **Navigate to LinkedIn**: Go to `linkedin.com/feed` or a specific search results page (e.g., search for "hiring developer" -> click "Posts").
2.  **Open Extension**: Click the icon in the toolbar.
3.  **Start**: Click the green **Start Extraction** button.
    *   The page will begin to scroll automatically.
    *   **"Found"**: Number of contacts extracted from the DOM.
    *   **"Saved"**: Number of contacts successfully pushed to the verified database.
4.  **Stop**: Click **Stop Extraction** when finished.
    *   **Important**: Stopping triggers the final synchronization.
    *   The extension will send a final log to the Backend.
    *   **Notes field update**: The Activity Log notes will automatically be populated with a **CSV dump** of all contacts found during the session.

---

## Technical Details & Data Flow

### API Endpoints Used
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/login` | Authenticate user and retrieve JWT Token. |
| `POST` | `/api/vendor_contact` | Save individual extracted contact details details immediately. |
| `GET` | `/api/job-types` | Verify the Job Type ID for logging. |
| `POST` | `/api/job_activity_logs` | Create a log entry summarizing the session (Count + CSV Notes). |

### CSV Note Format
The CSV data appended to the Job Activity Log follows this format:
```csv
Name,Email,Phone,Company,Location,LinkedIn ID,Profile URL,Source
"John Doe","john@example.com","555-0199","Tech Corp","NY","john-doe-123","...","user@wbl.com"
...
```

### Environment Switching
To switch between **Localhost** and **Production**:
1.  Open `background.js`.
2.  Modify the `WBL_API_URL` constant at the top:
    ```javascript
    // Local
    const WBL_API_URL = "http://localhost:8000";
    // Production
    // const WBL_API_URL = "https://whitebox-learning.com/api";
    ```
3.  Reload the extension in `chrome://extensions/`.

---

## Troubleshooting

*   **Extension stuck / not scrolling**: Refresh the LinkedIn page and try again. LinkedIn's dynamic DOM updates can sometimes detach content scripts.
*   **"Authentication Failed"**: Your token may have expired. Go to Config and re-enter credentials to generate a new token.
*   **"Job Type Not Found"**: Run the `setup_extension_job_type.py` script against the target database (Local vs Prod).
*   **CORS Errors**: Ensure the backend allows `chrome-extension://` origins or `*` (wildcard) is enabled in `main.py` CORS middleware.
