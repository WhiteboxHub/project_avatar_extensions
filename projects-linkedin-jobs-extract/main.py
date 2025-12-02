from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

import datetime
import time
import yaml
import random
from bs4 import BeautifulSoup
from pathlib import Path
import pandas as pd
import re
import os
from urllib.parse import urlparse, urlunparse
import csv
from ChooseCandidate import chooseCandidate

from position_role import ML_roles, UI_roles, QA_roles

def detect_platform(domain):
    domain = domain.replace("careers.", "").replace("jobs.", "").replace("www.", "")
    platform = domain.split('.')[0]
    return platform

def remove_query_parameters(url):
    parsed_url = urlparse(url)
    return urlunparse(parsed_url._replace(query='', fragment=''))

def extract_job_id_from_url(url):
    try:
        parsed_url = urlparse(url)
        path_parts = [part for part in parsed_url.path.split('/') if part]

        if not path_parts:
            return None

        if 'lever.co' in parsed_url.netloc:
            if path_parts[-1] == "apply":
                return path_parts[-2] 
            else:
                return path_parts[-1]
        elif "greenhouse.io" in parsed_url.netloc:
            if path_parts[-1] == "job_app":
                return None
            else:
                return path_parts[-1]
        elif "ashbyhq.com" in parsed_url.netloc:
            if path_parts[-1] == "application":
                return path_parts[-2]
            else:
                return path_parts[-1]
        elif "workdayjobs.com" in parsed_url.netloc or "myworkdayjobs.com" in parsed_url.netloc:
            if path_parts[-1] == "login":
                return None 
            else:
                return path_parts[-1]
        elif "jobvite.com" in parsed_url.netloc:
            if path_parts[-1] == "apply":
                return path_parts[-2]
            else:
                return path_parts[-1]
        else:
            return path_parts[-1]
    except Exception as e:
        print(f"Error extracting job ID from URL: {e}")
        return None

def extract_platform_and_company_from_url(url):
    parsed_url = urlparse(url)
    domain = parsed_url.netloc.lower()
    platform = detect_platform(domain)
    company = None
    if "greenhouse.io" in domain:
        platform = "greenhouse"
        company = parsed_url.path.split('/')[1] if len(parsed_url.path.split('/')) > 1 else domain.split('.')[0]
    elif "lever.co" in domain:
        platform = "lever"
        company = parsed_url.path.split('/')[1] if len(parsed_url.path.split('/')) > 1 else domain.split('.')[0]
    elif "jobvite.com" in domain:
        platform = "jobvite"
        company = parsed_url.path.split('/')[2] if len(parsed_url.path.split('/')) > 2 else domain.split('.')[0]
    elif "ashbyhq.com" in domain:
        platform = "ashby"
        company = parsed_url.path.split('/')[1] if len(parsed_url.path.split('/')) > 1 else domain.split('.')[0]
    elif "workdayjobs.com" in domain or "myworkdayjobs.com" in domain:
        platform = "workday"
        subdomain = domain.split('.')[0]
        if subdomain.startswith("wd"):
            company = subdomain
        else:
            company = subdomain
    elif "smartrecruiters.com" in domain:
        platform = "smartRecruiters"
        company = domain.split('.')[0]
    elif "icims.com" in domain:
        platform = "iCIMS"
        company = domain.split('.')[0]
    elif "bamboohr.com" in domain:
        platform = "bambooHR"
        company = domain.split('.')[0]
    elif "recruitee.com" in domain:
        platform = "recruitee"
        company = domain.split('.')[0]
    elif "jazzhr.com" in domain:
        platform = "jazzHR"
        company = domain.split('.')[0]
    elif "ziprecruiter.com" in domain:
        platform = "zipRecruiter"
        company = domain.split('.')[0]
    else:        
        platform = detect_platform(domain)
        company = domain.split('.')[0]
    return platform, company

def append_link_to_csv(link, platform, company, output_folder, csv_filename, linkedin_id, platform_job_id):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    
    csv_path = os.path.join(output_folder, csv_filename)
    file_exists = os.path.isfile(csv_path)

    existing_job_ids = set()  

    if file_exists:
        with open(csv_path, mode='r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                existing_job_ids.add(row['linkedin_id'])  

    if linkedin_id in existing_job_ids:
        print(f"LinkedIn Job ID {linkedin_id} already exists. Skipping...")
        return
    
    next_id = 1
    if file_exists and os.path.getsize(csv_path) > 0:
        with open(csv_path, mode='r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            rows = list(reader)
            if rows:
                last_id = int(rows[-1]['id'])
                next_id = last_id + 1

    fieldnames = ['id', 'linkedin_id', 'company', 'platform', 'job_id', 'platform_link']

    with open(csv_path, mode='a', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        if not file_exists or os.path.getsize(csv_path) == 0:
            writer.writeheader()  

        platform = platform.lower()

        if platform in ['greenhouse', 'lever', 'jobvite', 'workday' , 'ashby']:
            writer.writerow({
                'id': next_id,  
                'linkedin_id': linkedin_id,  
                'company': company,
                'platform': platform,
                'job_id': platform_job_id,
                'platform_link': link
            })
        else:
            writer.writerow({
                'id': next_id,  
                'linkedin_id': linkedin_id,  
                'company': '', 
                'platform': '',  
                'job_id': '',  
                'platform_link': link
            })

    print(f"Job ID {linkedin_id} added successfully with serial number {next_id}.")

class ApplyBot:
    def __init__(self, username, password, locations, 
                 blacklist=[], blacklisttitles=[], positions=[],
                 output_folder="output", csv_filename="linkedin_jobs.csv"):
        self.username = username
        self.password = password   
        self.locations = locations
        self.blacklist = blacklist
        self.blacklisttitles = blacklisttitles
        
        self.positions = positions
        self.output_folder = output_folder
        self.csv_filename = csv_filename
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service)
        self.wait = WebDriverWait(self.driver, 30)
        self.locator = {
            "direct_apply_button": (By.CSS_SELECTOR, 'button.jobs-apply-button:not(.jobs-apply-button--top-card)'),
            "job_listings": (By.CSS_SELECTOR, 'div.job-card-container'),
            "search": (By.CSS_SELECTOR, 'input.jobs-search-box__keyboard-text-input[aria-label="Search by title, skill, or company"]')
        }
        self.login_to_linkedin()

    def login_to_linkedin(self):
        self.driver.get('https://www.linkedin.com/login')
        self.sleep(180)
        self.driver.find_element(By.ID, 'username').send_keys(self.username)
        self.driver.find_element(By.ID, 'password').send_keys(self.password)
        self.driver.find_element(By.CSS_SELECTOR, 'button[data-litms-control-urn="login-submit"]').click()
        self.sleep(10)
        self.findingCombos_postion_location()

    def sleep(self, sleeptime=random.randrange(3, 9)):
        randomtime = sleeptime
        time.sleep(randomtime)

    def roletypestr_convertion(self):
        rolearr = []
        if rolearr == []:
            return ""
        elif rolearr == [1] or rolearr == [2] or rolearr == [3]:
            return f"&f_WT={str(rolearr[0])}"
        elif rolearr == [1, 2]:
            return "&f_WT=1%2C3"
        elif rolearr == [1, 3]:
            return "&f_WT=1%2C2"
        elif rolearr == [2, 3]:
            return "&f_WT=3%2C2"
        elif rolearr == [1, 2, 3]:
            return "&f_WT=1%2C3%2C2"

    def findingCombos_postion_location(self):
        combolist = []
        jobs_found = False  
        while len(combolist) < len(self.positions) * len(self.locations):
            for i in self.positions:
                for j in self.locations:
                    combo = (i, j)
                    combolist.append(combo)
                    print(f"Processing combo: Position={i}, Location={j}")  
                    if self.Get_job_application_page(position=i, location=j):
                        jobs_found = True
            if not jobs_found:
                print("No jobs found. Exiting loop.")
                break 

    def Get_job_application_page(self, location, position):
        
        location_str = f"&location={location}"
        position_str = f"&keywords={position}"
        
        Job_per_page = 0
        self.sleep()
        rolestring = self.roletypestr_convertion()
        
        while True:
            URL = "https://www.linkedin.com/jobs/search/?keywords=" + position_str + rolestring + location_str + "&f_TPR=r86400" + "&start=" + str(Job_per_page)
            print(f"Loading page: {URL}") 
            self.driver.get(URL)
            self.sleep(10)
    
            job_listings = self.get_elements("job_listings")
            if not job_listings:
                print("No more job listings found. Exiting pagination.")
                break
            
            self.load_and_scroll_page()
            self.process_job_listings(job_listings)
            Job_per_page += 25

    def process_job_listings(self, job_listings):
        jobIDs = {}
        for link in job_listings:
            if 'Applied' not in link.text:
                if link.text not in self.blacklist:
                    jobID = link.get_attribute("data-job-id")
                    if jobID == "search":
                        continue
                    else:
                        jobIDs[jobID] = "To be processed"
        if len(jobIDs) > 0:
            self.job_apply_loop(jobIDs)

    def job_apply_loop(self, jobIDS):
        for jobID in jobIDS:
            if jobIDS[jobID] == "To be processed":
                try:
                    self.Start_extracting_links_with_jobid(jobID)
                except Exception as e:
                    print(f"Error processing job ID {jobID}: {e}")
                    continue

    def Start_extracting_links_with_jobid(self, jobid):
        self.Get_Job_page_with_jobid(jobid)
        self.sleep(4)
        apply_urls = self.get_apply_button_urls()
        
        linkedin_url = self.driver.current_url
        linkedin_job_id = linkedin_url.split('/')[-2] if linkedin_url.endswith('/') else linkedin_url.split('/')[-1]
        
        for url, platform, company in apply_urls:
            cleaned_url = remove_query_parameters(url)
            platform_job_id = extract_job_id_from_url(cleaned_url)  
            append_link_to_csv(cleaned_url, platform, company, self.output_folder, self.csv_filename, linkedin_job_id, platform_job_id)

    def Get_Job_page_with_jobid(self, jobID):
        joburl = f"https://www.linkedin.com/jobs/view/{jobID}/"
        self.driver.get(joburl)
        self.job_page = self.load_and_scroll_page()
        self.sleep(1)
        return self.job_page

    def load_and_scroll_page(self):
        scrollpage = 0
        while scrollpage < 4000:
            self.driver.execute_script("window.scrollTo(0," + str(scrollpage) + ");")
            scrollpage += 500
            self.sleep(0.2)
        self.sleep()
        self.driver.execute_script("window.scrollTo(0,0);")
        page = BeautifulSoup(self.driver.page_source, 'lxml')
        return page

    def is_element_present(self, locator):
        return len(self.driver.find_elements(*locator)) > 0

    def get_elements(self, type) -> list:
        elements = []
        if type in self.locator:
            locator = self.locator[type]
            try:
                elements = self.driver.find_elements(*locator)
                if not elements:
                    print(f"No elements found for locator: {locator}")
            except Exception as e:
                print(f"Error finding elements: {e}")
        return elements

    def get_apply_button_urls(self):
        apply_urls = set()
        try:
            buttons = self.get_elements("direct_apply_button")
            for button in buttons:
                button_text = button.text.strip()
                if "Easy Apply" in button_text:
                    continue
                elif "Apply" in button_text:
                    original_url = self.driver.current_url
                    self.wait.until(EC.element_to_be_clickable(button)).click()
                    time.sleep(5)

                    if len(self.driver.window_handles) > 1:
                        self.driver.switch_to.window(self.driver.window_handles[-1])
                        new_url = self.driver.current_url
                        
                        if new_url != original_url:
                            platform, company = extract_platform_and_company_from_url(new_url)
                            apply_urls.add((new_url, platform, company))
                            print(new_url)

                        self.driver.close()
                        self.driver.switch_to.window(self.driver.window_handles[0])

                    time.sleep(10)

        except Exception as e:
            print(f"Exception in get_apply_button_urls: {e}")
        
        return apply_urls
        
def Main():
    fileLocation = chooseCandidate()
    with open(fileLocation,'r') as stream:
        try:
            parameters = yaml.safe_load(stream)
        except yaml.YAMLError as exc:
            raise exc

    assert len(parameters['positions']) > 0
    assert len(parameters['locations']) > 0
    assert parameters['username'] is not None
    assert parameters['password'] is not None

    username = parameters['username']
    password = parameters['password']
    locations = [l for l in parameters['locations'] if l is not None]
    role_type = parameters['role_type']

    if role_type == 'ML':
        positions = ML_roles
    elif role_type == "UI":
        positions = UI_roles
    elif role_type == "QA":
        positions = QA_roles
    blacklist = parameters.get('blacklist', [])
    blacklisttitles = parameters.get('blackListTitles', [])   
    
    current_time = datetime.datetime.now()
    timestamp = current_time.strftime("%Y-%m-%d_%H-%M-%S")
    csv_filename = f"linkedin_jobs_{timestamp}.csv"
    output_folder = "output"

    ApplyBot(
        username=username,
        password=password,
        locations=locations,        
        blacklist=blacklist,
        blacklisttitles=blacklisttitles,
        positions=positions,
        output_folder=output_folder,
        csv_filename=csv_filename  
    )

Main()