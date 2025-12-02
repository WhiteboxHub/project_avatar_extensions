
import os
import sys
import time
import random
import logging
import configparser
from datetime import datetime
from pathlib import Path
import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager


class InsightGlobalJobBot:
    def __init__(self, config_path='config/settings.ini'):
        self.base_dir = Path(__file__).parent.parent
        self.config = self._load_config(config_path)
        self._setup_logging()
        self.driver = None
        self.wait = None
        self.current_candidate = None
        
    def _load_config(self, config_path):
        config = configparser.ConfigParser()
        config_file = self.base_dir / config_path
        config.read(config_file)
        return config
    
    def _setup_logging(self):
        log_dir = self.base_dir / 'logs'
        log_dir.mkdir(exist_ok=True)
        
        log_file = log_dir / f'jobbot_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger(__name__)
        self.logger.info('JobBot initialized')
    
    def random_wait(self, min_sec=None, max_sec=None):
        if min_sec is None:
            min_sec = float(self.config.get('bot', 'random_delay_min', fallback=2))
        if max_sec is None:
            max_sec = float(self.config.get('bot', 'random_delay_max', fallback=5))
        delay = random.uniform(min_sec, max_sec)
        time.sleep(delay)
    
    def setup_driver(self):
        try:
            options = webdriver.ChromeOptions()
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_argument('--start-maximized')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            options.add_argument('--disable-software-rasterizer')
            options.add_argument('--disable-extensions')
            headless = self.config.getboolean('bot', 'headless', fallback=False)
            if headless:
                options.add_argument('--headless')
            
            # Add user agent
            options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
            
            self.driver = webdriver.Chrome(
                service=Service(ChromeDriverManager().install()),
                options=options
            )
            
            implicit_wait = int(self.config.get('bot', 'implicit_wait', fallback=10))
            explicit_wait = int(self.config.get('bot', 'explicit_wait', fallback=30))
            
            self.driver.implicitly_wait(implicit_wait)
            self.wait = WebDriverWait(self.driver, explicit_wait)
            
            self.logger.info('WebDriver setup successful')
            return True
        except Exception as e:
            self.logger.error(f'Failed to setup WebDriver: {e}')
            return False
    
    def load_candidates(self):
        try:
            candidates_file = self.base_dir / 'data' / 'candidates.csv'
            if not candidates_file.exists():
                self.logger.error(f'Candidates file not found: {candidates_file}')
                return []
            
            df = pd.read_csv(candidates_file)
            # Filter active candidates
            df = df[df['Status'].str.lower() == 'active']
            candidates = df.to_dict('records')
            
            self.logger.info(f'Loaded {len(candidates)} active candidates')
            return candidates
        except Exception as e:
            self.logger.error(f'Error loading candidates: {e}')
            return []
    
    def login(self, email, password):
        try:
            self.driver.get('https://jobs.insightglobal.com/')
            self.random_wait()
            
            # Click Sign In
            sign_in = self.wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//a[@href='https://jobs.insightglobal.com/users/login.aspx']")
                )
            )
            sign_in.click()
            self.random_wait()
            
            # Enter credentials
            email_field = self.wait.until(EC.presence_of_element_located((By.ID, 'txtUser')))
            password_field = self.wait.until(EC.presence_of_element_located((By.ID, 'txtPassword')))
            
            email_field.clear()
            email_field.send_keys(email)
            self.random_wait(0.5, 1.5)
            
            password_field.clear()
            password_field.send_keys(password)
            self.random_wait(0.5, 1.5)
            
            # Click login button
            login_btn = self.wait.until(
                EC.element_to_be_clickable(
                    (By.ID, 'ContentPlaceHolder1_LoginControl1_cmdOK')
                )
            )
            login_btn.click()
            self.random_wait()
            
            # Verify login success
            try:
                self.wait.until(
                    EC.presence_of_element_located((By.XPATH, "//a[contains(@href,'logout') or contains(text(),'Sign Out')]"))
                )
                self.logger.info(f'Login successful for {email}')
                return True
            except TimeoutException:
                self.logger.error(f'Login verification failed for {email}')
                return False
                
        except Exception as e:
            self.logger.error(f'Login failed for {email}: {e}')
            return False
    
    def search_jobs(self, keywords, location):
        try:
            self.driver.get('https://jobs.insightglobal.com/')
            self.random_wait()
            
            # Enter search criteria
            keyword_field = self.wait.until(
                EC.presence_of_element_located((By.XPATH, '//*[@id=\"textinput\"]'))
            )
            location_field = self.wait.until(
                EC.presence_of_element_located((By.ID, 'locationinput'))
            )
            
            keyword_field.clear()
            keyword_field.send_keys(keywords)
            self.random_wait(0.5, 1.5)
            
            # Clear location field multiple times to ensure default postal code is removed
            self.logger.info(f'Clearing default location and setting: {location}')
            location_field.click()
            self.random_wait(0.3, 0.7)
            
            # Method 1: Select all and delete
            location_field.send_keys(Keys.CONTROL + 'a')
            location_field.send_keys(Keys.DELETE)
            self.random_wait(0.3, 0.7)
            
            # Method 2: Clear with JavaScript as backup
            try:
                self.driver.execute_script("arguments[0].value = '';", location_field)
                self.random_wait(0.3, 0.7)
            except Exception as js_err:
                self.logger.warning(f'JavaScript clear failed: {js_err}')
            
            # Method 3: Use Selenium clear()
            location_field.clear()
            self.random_wait(0.3, 0.7)
            
            # Now enter the desired location
            location_field.send_keys(location)
            self.random_wait(0.5, 1.5)
            
            # Click search
            search_btn = self.wait.until(
                EC.element_to_be_clickable((By.XPATH, '//*[@id="homesearch"]'))
            )
            search_btn.click()
            self.random_wait()
            
            self.logger.info(f'Search complete for keywords: {keywords}, location: {location}')
            return True
            
        except Exception as e:
            self.logger.error(f'Search failed: {e}')
            return False
    
    def get_applied_jobs(self, candidate_email):
        try:
            applied_file = self.base_dir / 'data' / 'applied_jobs.csv'
            
            if not applied_file.exists():
                # Create new file with headers
                df = pd.DataFrame(columns=['CandidateEmail', 'JobTitle', 'JobID', 'AppliedDate', 'Status'])
                df.to_csv(applied_file, index=False)
                return set()
            
            df = pd.read_csv(applied_file)
            candidate_jobs = df[df['CandidateEmail'] == candidate_email]
            return set(candidate_jobs['JobID'].astype(str))
            
        except Exception as e:
            self.logger.error(f'Error loading applied jobs: {e}')
            return set()
    
    def save_applied_job(self, candidate_email, job_title, job_id, status='Applied'):
        try:
            applied_file = self.base_dir / 'data' / 'applied_jobs.csv'
            
            new_record = {
                'CandidateEmail': candidate_email,
                'JobTitle': job_title,
                'JobID': job_id,
                'AppliedDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'Status': status
            }
            
            if applied_file.exists():
                df = pd.read_csv(applied_file)
                df = pd.concat([df, pd.DataFrame([new_record])], ignore_index=True)
            else:
                df = pd.DataFrame([new_record])
            
            df.to_csv(applied_file, index=False)
            self.logger.info(f'Saved application record: {job_title}')
            
        except Exception as e:
            self.logger.error(f'Error saving applied job: {e}')
    
    def apply_to_jobs(self, candidate, max_applications=10):
        try:
            applied_jobs = self.get_applied_jobs(candidate['Email'])
            applications_count = 0
            
            # Track which job we're on (elements become stale after navigation)
            job_index = 0
            
            while applications_count < max_applications:
                # Re-find job listings each iteration
                try:
                    jobs = self.driver.find_elements(By.XPATH, '//div[@class=\"job-title\"]')
                    
                    if job_index == 0:
                        self.logger.info(f'Found {len(jobs)} job listings in current search')
                    
                    # Check if we've processed all jobs
                    if job_index >= len(jobs):
                        self.logger.info(f'Processed all {len(jobs)} jobs in this search')
                        break
                    
                    job = jobs[job_index]
                    idx = job_index
                    
                except Exception as e:
                    self.logger.error(f'Error finding job listings: {e}')
                    break
                
                try:
                                    
                    self.driver.execute_script('window.scrollTo(0, 0);')
                    self.random_wait(0.5, 1)
                    
                    # Scroll job into view with centered positioning
                    self.driver.execute_script('arguments[0].scrollIntoView({block: "center", inline: "center"});', job)
                    self.random_wait(1, 2)
                    
                                                        
                    try:
                        job_title_elem = job.find_element(By.XPATH, ".//a")
                        job_title = job_title_elem.text.strip()
                        job_href = job_title_elem.get_attribute('href')
                    except:
                        job_title = f'Job_{idx}'
                        job_href = None
                    
                    # Try to get unique job ID from multiple sources
                    job_id = None
                    
                    # Method 1: Extract from href URL (most reliable)
                    if job_href:
                        try:
                            # Extract job ID from URL like: jobid=123456 or /job/123456
                            if 'jobid=' in job_href:
                                job_id = job_href.split('jobid=')[1].split('&')[0]
                                self.logger.info(f'Extracted job ID from URL (jobid): {job_id}')
                            elif '/job/' in job_href:
                                job_id = job_href.split('/job/')[1].split('/')[0].split('?')[0]
                                self.logger.info(f'Extracted job ID from URL (/job/): {job_id}')
                        except:
                            pass
                    
                    # Method 2: Try data-job-id attribute
                    if not job_id:
                        job_id = job.get_attribute('data-job-id')
                        if job_id:
                            self.logger.info(f'Got job ID from data-job-id: {job_id}')
                    
                    # Method 3: Try getting from any id attribute
                    if not job_id:
                        job_id = job.get_attribute('id')
                        if job_id:
                            self.logger.info(f'Got job ID from id attribute: {job_id}')
                    
                    # Fallback: Create unique ID from title + position
                    if not job_id:
                        # Use title hash to make it more unique
                        import hashlib
                        title_hash = hashlib.md5(job_title.encode()).hexdigest()[:8]
                        job_id = f'job_{title_hash}_{idx}'
                        self.logger.info(f'Using fallback job ID: {job_id}')
                    
                    self.logger.info(f'Final Job ID: {job_id}, Title: {job_title}')
                    
                                                            # Skip if already applied
                    if job_id in applied_jobs:
                        self.logger.info(f'Skipping job {job_id} ({job_title}) - already applied')
                        job_index += 1  # Move to next job
                        continue
                    
                    self.logger.info(f'Processing new job: {job_title}')
                    
                    # Click on job using JavaScript to avoid interception
                    try:
                        self.driver.execute_script('arguments[0].click();', job)
                        self.logger.info('Clicked job using JavaScript')
                    except Exception as click_err:
                        self.logger.warning(f'JavaScript click failed, trying link: {click_err}')
                        # Fallback: try clicking the link inside
                        link = job.find_element(By.XPATH, ".//a")
                        self.driver.execute_script('arguments[0].click();', link)
                    
                    self.random_wait()
                    
                                        # Find and click Apply button with multiple strategies
                    try:
                        # Try different selectors for Apply button
                        apply_btn = None
                        apply_selectors = [
                            '//a[contains(@class, \"quick-apply\")]',
                            '//a[contains(text(), \"Apply\")]',
                            '//button[contains(text(), \"Apply\")]',
                            '//input[@value=\"Apply\"]',
                            '//a[contains(@href, \"apply\")]'
                        ]
                        
                        for selector in apply_selectors:
                            try:
                                apply_btn = WebDriverWait(self.driver, 5).until(
                                    EC.presence_of_element_located((By.XPATH, selector))
                                )
                                if apply_btn:
                                    self.logger.info(f'Found apply button with: {selector}')
                                    break
                            except TimeoutException:
                                continue
                        
                                                                        
                        if not apply_btn:
                            self.logger.warning(f'Apply button not found for job: {job_title}')
                            self.save_applied_job(candidate['Email'], job_title, job_id, 'No Apply Button')
                            self.driver.back()
                            self.random_wait()
                            job_index += 1  # Move to next job
                            continue
                        
                        # Scroll apply button into view and click with JavaScript
                        self.driver.execute_script('arguments[0].scrollIntoView({block: \"center\"});', apply_btn)
                        self.random_wait(0.5, 1)
                        self.driver.execute_script('arguments[0].click();', apply_btn)
                        self.logger.info('Clicked apply button using JavaScript')
                        self.random_wait()
                        
                        # Handle application form if present
                        form_success = self.fill_application_form(candidate)
                        
                        if form_success:
                            # Save application record
                            self.save_applied_job(candidate['Email'], job_title, job_id, 'Applied')
                            applications_count += 1
                            self.logger.info(f'Successfully applied to: {job_title}')
                        else:
                            self.logger.warning(f'Application form submission may have failed for: {job_title}')
                            self.save_applied_job(candidate['Email'], job_title, job_id, 'Form Error')
                        
                        # Form handler already navigates back, just wait
                        self.random_wait()
                        
                    except Exception as apply_error:
                        self.logger.error(f'Error during apply process: {apply_error}')
                        self.save_applied_job(candidate['Email'], job_title, job_id, 'Error')
                        # Try to navigate back to search results
                        try:
                            # Try clicking back to search results if available
                            back_btn = self.driver.find_element(
                                By.XPATH, 
                                "//a[contains(@href, '/results.aspx') and contains(text(), 'Back to Search')]"
                            )
                            self.driver.execute_script('arguments[0].click();', back_btn)
                            self.random_wait()
                        except:
                            # Fallback: use browser back
                            try:
                                self.driver.back()
                                self.random_wait()
                            except:
                                                                # Last resort: go to home and search again
                                self.logger.warning('Failed to navigate back, may need to re-search')
                                job_index += 1  # Move to next job
                                continue
                    
                except Exception as e:
                    self.logger.error(f'Error applying to job {idx}: {e}')
                
                # Always move to next job after processing (success or failure)
                job_index += 1
            
            self.logger.info(f'Applied to {applications_count} jobs in this search for {candidate["Email"]}')
            return applications_count
            
        except Exception as e:
            self.logger.error(f'Error in apply_to_jobs: {e}')
            return 0
    
    def fill_application_form(self, candidate):
        try:
            self.logger.info('Starting application form fill process')
            
            # Step 1: Select the first available resume (radio button)
            try:
                resume_radio = WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located(
                        (By.ID, 'ContentPlaceHolder1_grdItem_btnSelect_0')
                    )
                )
                # Click using JavaScript to avoid interception
                self.driver.execute_script('arguments[0].click();', resume_radio)
                self.logger.info('Selected resume radio button')
                self.random_wait(0.5, 1)
            except TimeoutException:
                self.logger.warning('Resume selection radio not found - may already be uploaded')
            except Exception as e:
                self.logger.error(f'Error selecting resume: {e}')
            
            # Step 2: Fill LinkedIn URL if available in candidate data
            try:
                linkedin_field = self.driver.find_element(
                    By.ID, 'ContentPlaceHolder1_txtLinkedInUrl'
                )
                # Remove readonly attribute
                self.driver.execute_script(
                    "arguments[0].removeAttribute('readonly');", 
                    linkedin_field
                )
                linkedin_field.clear()
                
                # Get LinkedIn URL from candidate if available
                linkedin_url = candidate.get('LinkedInUrl', '')
                if linkedin_url:
                    linkedin_field.send_keys(linkedin_url)
                    self.logger.info(f'Filled LinkedIn URL: {linkedin_url}')
                else:
                    self.logger.info('No LinkedIn URL provided in candidate data')
                
                self.random_wait(0.5, 1)
            except NoSuchElementException:
                self.logger.warning('LinkedIn URL field not found')
            except Exception as e:
                self.logger.error(f'Error filling LinkedIn URL: {e}')
            
            # Step 3: Fill Phone Number
            try:
                phone_field = self.driver.find_element(
                    By.ID, 'ContentPlaceHolder1_txtPhone2'
                )
                # Remove readonly attribute
                self.driver.execute_script(
                    "arguments[0].removeAttribute('readonly');", 
                    phone_field
                )
                phone_field.clear()
                phone_field.send_keys(candidate['Phone'])
                self.logger.info(f'Filled phone number: {candidate["Phone"]}')
                self.random_wait(0.5, 1)
            except NoSuchElementException:
                self.logger.warning('Phone field not found')
            except Exception as e:
                self.logger.error(f'Error filling phone: {e}')
            
                        # Step 4: Answer minimum requirements question - Select "No"
            try:
                # Try to find "No" radio button
                min_req_no = self.driver.find_element(
                    By.ID,
                    'ContentPlaceHolder1_chkMinReq_1'
                )
                self.driver.execute_script('arguments[0].click();', min_req_no)
                self.logger.info('Selected "No" for minimum requirements')
                self.random_wait(0.5, 1)
            except NoSuchElementException:
                # Fallback: try using name and value
                try:
                    min_req_no = self.driver.find_element(
                        By.XPATH,
                        "//input[@name='ctl00$ContentPlaceHolder1$chkMinReq' and @value='No']"
                    )
                    self.driver.execute_script('arguments[0].click();', min_req_no)
                    self.logger.info('Selected "No" for minimum requirements (fallback)')
                    self.random_wait(0.5, 1)
                except:
                    self.logger.warning('Minimum requirements question not found')
            except Exception as e:
                self.logger.error(f'Error answering minimum requirements: {e}')
            
            # Step 5: Click "Apply Now" button
            try:
                apply_now_btn = WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located(
                        (By.ID, 'ContentPlaceHolder1_cmdApply')
                    )
                )
                # Scroll into view and click
                self.driver.execute_script(
                    'arguments[0].scrollIntoView({block: "center"});', 
                    apply_now_btn
                )
                self.random_wait(0.5, 1)
                self.driver.execute_script('arguments[0].click();', apply_now_btn)
                self.logger.info('Clicked "Apply Now" button')
                self.random_wait(2, 3)  # Wait for submission to complete
            except TimeoutException:
                self.logger.error('"Apply Now" button not found')
                return False
            except Exception as e:
                self.logger.error(f'Error clicking Apply Now: {e}')
                return False
            
            # Step 6: Wait for confirmation and click "Back to Search Results"
            try:
                back_to_search = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//a[contains(@href, '/results.aspx') and contains(text(), 'Back to Search Results')]")
                    )
                )
                self.driver.execute_script('arguments[0].click();', back_to_search)
                self.logger.info('Clicked "Back to Search Results"')
                self.random_wait(1, 2)
                return True
            except TimeoutException:
                self.logger.warning('"Back to Search Results" button not found - navigating back manually')
                self.driver.back()
                self.random_wait()
                return True
            except Exception as e:
                self.logger.error(f'Error clicking Back to Search Results: {e}')
                self.driver.back()
                self.random_wait()
                return True
            
        except Exception as e:
            self.logger.error(f'Error filling application form: {e}')
            return False
    
    def logout(self):
        try:
            # Try multiple logout selectors
            logout_selectors = [
                "//a[@href='/?logout=1']",
                "//a[contains(@href,'logout')]",
                "//a[contains(text(),'Logout')]",
                "//a[contains(text(),'Sign Out')]"
            ]
            
            logout_link = None
            for selector in logout_selectors:
                try:
                    logout_link = WebDriverWait(self.driver, 5).until(
                        EC.presence_of_element_located((By.XPATH, selector))
                    )
                    if logout_link:
                        self.logger.info(f'Found logout link with: {selector}')
                        break
                except TimeoutException:
                    continue
            
            if not logout_link:
                self.logger.warning('Logout link not found, continuing anyway')
                return True
            
            # Click logout using JavaScript
            self.driver.execute_script('arguments[0].click();', logout_link)
            self.random_wait()
            self.logger.info('Logged out successfully')
            return True
        except Exception as e:
            self.logger.error(f'Logout failed: {e}')
            # Even if logout fails, we can continue to next candidate
            return True
    
    def process_candidate(self, candidate):
        try:
            self.logger.info(f'Processing candidate: {candidate["Email"]}')
            self.current_candidate = candidate
            
            # Login
            if not self.login(candidate['Email'], candidate['Password']):
                self.logger.error(f'Login failed for {candidate["Email"]}')
                return False
            
                        # Get search keywords
            keywords_list = self.config.get('search', 'keywords').split(',')
            
            # Check if candidate has a preferred location, otherwise use config
            if 'PreferredLocation' in candidate and candidate['PreferredLocation'] and str(candidate['PreferredLocation']).strip():
                locations_list = [str(candidate['PreferredLocation']).strip()]
                self.logger.info(f'Using candidate preferred location: {locations_list[0]}')
            else:
                locations_list = self.config.get('search', 'location').split(',')
                self.logger.info(f'Using config locations: {locations_list}')
            
            max_apps = int(self.config.get('search', 'max_applications_per_candidate', fallback=10))
            
            total_applications = 0
            
            # Search and apply for each keyword-location combination
            for keyword in keywords_list:
                keyword = keyword.strip()
                for location in locations_list:
                    location = location.strip()
                    
                    if total_applications >= max_apps:
                        break
                    
                    self.logger.info(f'Searching: {keyword} in {location}')
                    
                    if self.search_jobs(keyword, location):
                        apps = self.apply_to_jobs(candidate, max_apps - total_applications)
                        total_applications += apps
                    
                    if total_applications >= max_apps:
                        break
            
            self.logger.info(f'Total applications for {candidate["Email"]}: {total_applications}')
            
            # Logout
            self.logout()
            
            return True
            
        except Exception as e:
            self.logger.error(f'Error processing candidate {candidate["Email"]}: {e}')
            return False
    
    def run(self):
        try:
            # Setup driver
            if not self.setup_driver():
                self.logger.error('Failed to setup driver. Exiting.')
                return
            
            # Load candidates
            candidates = self.load_candidates()
            
            if not candidates:
                self.logger.error('No active candidates found. Exiting.')
                return
            
            # Process each candidate
            for idx, candidate in enumerate(candidates, 1):
                self.logger.info(f'\n{'='*50}')
                self.logger.info(f'Processing candidate {idx}/{len(candidates)}')
                self.logger.info(f'{'='*50}\n')
                
                self.process_candidate(candidate)
                
                # Add delay between candidates
                if idx < len(candidates):
                    delay = random.uniform(30, 60)
                    self.logger.info(f'Waiting {delay:.1f} seconds before next candidate...')
                    time.sleep(delay)
            
            self.logger.info('\nAll candidates processed successfully!')
            
        except KeyboardInterrupt:
            self.logger.warning('Process interrupted by user')
        except Exception as e:
            self.logger.error(f'Unexpected error in run: {e}')
        finally:
            if self.driver:
                self.driver.quit()
                self.logger.info('Browser closed')


def main():
    print('='*60)
    print('Insight Global Job Application Bot')
    print('Multi-Candidate Automation')
    print('='*60)
    print()
    
    bot = InsightGlobalJobBot()
    bot.run()


if __name__ == '__main__':
    main()






























