
import requests
import json

# Configuration
API_URL = "http://localhost:8000"  # Adjust if using production URL
# You can manually set your token here if you know it, or use the interactive input below
API_TOKEN = "" 
EMPLOYEE_ID = 353 # Default or change as needed

JOB_UNIQUE_ID = "extension_linkedin_post_contact_extractor"
JOB_NAME = "Chrome Ext: LinkedIn Post Contact Extractor"
JOB_DESC = "Chrome Extension that extracts contacts from LinkedIn posts automatically."

def setup_job_type():
    print(f"Setting up Job Type: {JOB_UNIQUE_ID}")
    
    token = API_TOKEN
    if not token:
        
        email = input("Enter WBL Email: ")
        password = input("Enter WBL Password: ")
        
        login_url = f"{API_URL}/api/login"
        try:
            resp = requests.post(login_url, data={"username": email, "password": password})
            resp.raise_for_status()
            token = resp.json().get("access_token")
            print("Token acquired.")
        except Exception as e:
            print(f"Login failed: {e}")
            return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

   
    types_url = f"{API_URL}/api/job-types"
    try:
        resp = requests.get(types_url, headers=headers)
        resp.raise_for_status()
        existing = resp.json()
        
        found = False
        for job in existing:
            if job.get('unique_id') == JOB_UNIQUE_ID:
                print(f"Job Type ALREADY EXISTS. ID: {job.get('id')}")
                found = True
                break
        
        if not found:
            print("Job Type NOT found. Creating it now...")
            payload = {
                "unique_id": JOB_UNIQUE_ID,
                "name": JOB_NAME,
                "job_owner_id": int(EMPLOYEE_ID), 
                "description": JOB_DESC,
                "notes": "Created via setup script"
            }
            create_resp = requests.post(types_url, json=payload, headers=headers)
            create_resp.raise_for_status()
            print("SUCCESS: Job Type Created.")
            
    except Exception as e:
        print(f"Error: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    setup_job_type()
