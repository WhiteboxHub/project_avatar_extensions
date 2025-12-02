# 🔍 LinkedIn Easy Apply Job Fetcher

A simple Chrome Extension that fetches **Easy Apply** LinkedIn job listings for a given keyword and location (posted today).  
It saves the results (Job ID, Title, Company, Location) into a downloadable JSON file.

---

## ⚙️ How to Install

1. Open Chrome and go to:  
   `chrome://extensions/`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked**
4. Select the folder containing this project (`linkedin-job-fetcher`)

---

## 🚀 How to Use

1. Click the extension icon (LinkedIn Easy Apply Job Fetcher)
2. Enter:
   - **Keyword** (e.g., “ML Engineer”)
   - **Location** (e.g., “India”)
3. Click **Fetch Jobs**
4. The tool will open LinkedIn, scroll through pages, and automatically download a JSON file containing job details.

---

## 📦 Output Example
```json
[
  {
    "jobId": "4335903095",
    "title": "System Engineer",
    "company": "House of Shipping",
    "location": "Mumbai, Maharashtra, India (On-site)"
  }
]
