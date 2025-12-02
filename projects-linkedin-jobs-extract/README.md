#Linkedin_jobs with vendors Extract 

## Overview
This project automates the process of applying for jobs on LinkedIn by extracting job application URLs, identifying the hiring platform, and storing the details in a CSV file. It utilizes Selenium for web automation and supports platforms such as Greenhouse, Lever, Jobvite, Workday, and Ashby.

## Features
- Automates login to LinkedIn.
- Searches for job postings based on user-defined roles and locations.
- Extracts job application URLs from job listings.
- Detects the hiring platform and extracts job IDs.
- Stores job details in a structured CSV file.
- Prevents duplicate job entries.

## Prerequisites
Ensure you have the following installed:
- Python 3.x
- Google Chrome
- Chrome WebDriver (managed automatically by `webdriver_manager`)
- Required Python packages (listed in `requirements.txt`)

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/linkedin-job-automation.git
   cd linkedin-job-automation
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure the `parameters.yaml` file with your LinkedIn credentials and job preferences.

## Usage
1. Run the automation script:
   ```bash
   python main.py
   ```
2. The script will:
   - Log in to LinkedIn (manual verification required).
   - Search for jobs based on configured positions and locations.
   - Extract application links and identify the platform.
   - Save job details in `output/linkedin_jobs_<timestamp>.csv`.

## File Structure
- `main.py`: Entry point for running the automation.
- `ApplyBot.py`: Core automation logic using Selenium.
- `ChooseCandidate.py`: Reads user preferences from `parameters.yaml`.
- `position_role.py`: Contains predefined job roles for filtering.
- `output/`: Directory where CSV files with extracted job links are stored.

## Supported Platforms
The script supports detecting and extracting job IDs from the following hiring platforms:
- Greenhouse
- Lever
- Jobvite
- Workday
- Ashby

## Customization
- Modify `parameters.yaml` to change search preferences.
- Adjust `blacklist` and `blacklisttitles` to filter out unwanted job postings.
- Extend `position_role.py` to include additional job roles.

## Troubleshooting
- Ensure LinkedIn credentials are correct.
- Increase Selenium wait times if elements are not loading.
- Check if ChromeDriver is up-to-date.


