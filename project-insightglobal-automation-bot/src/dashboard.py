
import sys
from pathlib import Path
from datetime import datetime
import shutil


try:
    import pandas as pd
except ImportError:
    print('Error: pandas not installed. Run: pip install pandas')
    sys.exit(1)


class JobBotDashboard:
    def __init__(self):
        self.base_dir = Path(__file__).parent.parent
        self.candidates_file = self.base_dir / 'data' / 'candidates.csv'
        self.applied_jobs_file = self.base_dir / 'data' / 'applied_jobs.csv'
    
    def show_menu(self):
        print('\n' + '='*60)
        print('Job Bot Dashboard')
        print('='*60)
        print('\n1. View Candidates')
        print('2. View Application Statistics')
        print('3. View Recent Applications')
        print('4. View Applications by Candidate')
        print('5. Export Report')
        print('6. Clear Application History (Caution!)')
        print('0. Exit')
        print()
    
    def view_candidates(self):
        try:
            if not self.candidates_file.exists():
                print('No candidates file found!')
                return
            
            df = pd.read_csv(self.candidates_file)
            print('\n' + '='*60)
            print('Candidates List')
            print('='*60)
            print(f'\nTotal Candidates: {len(df)}')
            print(f'Active: {len(df[df["Status"].str.lower() == "active"])}')
            print(f'Inactive: {len(df[df["Status"].str.lower() == "inactive"])}')
            print('\n' + df[['Email', 'FirstName', 'LastName', 'Status']].to_string(index=False))
            
        except Exception as e:
            print(f'Error viewing candidates: {e}')
    
    def view_statistics(self):
        try:
            if not self.applied_jobs_file.exists():
                print('\nNo applications yet!')
                return
            
            df = pd.read_csv(self.applied_jobs_file)
            
            print('\n' + '='*60)
            print('Application Statistics')
            print('='*60)
            
            print(f'\nðŸ“Š Total Applications: {len(df)}')
            
            print('\nðŸ“§ By Candidate:')
            by_candidate = df.groupby('CandidateEmail').size().sort_values(ascending=False)
            for email, count in by_candidate.items():
                print(f'  â€¢ {email}: {count}')
            
            print('\nðŸ“ˆ By Status:')
            by_status = df.groupby('Status').size()
            for status, count in by_status.items():
                print(f'  â€¢ {status}: {count}')
            
            print('\nðŸ“… By Date:')
            df['AppliedDate'] = pd.to_datetime(df['AppliedDate'])
            df['Date'] = df['AppliedDate'].dt.date
            by_date = df.groupby('Date').size().tail(7)
            for date, count in by_date.items():
                print(f'  â€¢ {date}: {count}')
            
        except Exception as e:
            print(f'Error viewing statistics: {e}')
    
    def view_recent_applications(self):
        try:
            if not self.applied_jobs_file.exists():
                print('\nNo applications yet!')
                return
            
            df = pd.read_csv(self.applied_jobs_file)
            
            print('\n' + '='*60)
            print('Recent Applications (Last 20)')
            print('='*60)
            print()
            
            recent = df.tail(20)[['CandidateEmail', 'JobTitle', 'AppliedDate', 'Status']]
            print(recent.to_string(index=False))
            
        except Exception as e:
            print(f'Error viewing recent applications: {e}')
    
    def view_applications_by_candidate(self):
        try:
            if not self.applied_jobs_file.exists():
                print('\nNo applications yet!')
                return
            
            df = pd.read_csv(self.applied_jobs_file)
            
            candidates = df['CandidateEmail'].unique()
            
            print('\n' + '='*60)
            print('Select Candidate:')
            print('='*60)
            
            for idx, email in enumerate(candidates, 1):
                count = len(df[df['CandidateEmail'] == email])
                print(f'{idx}. {email} ({count} applications)')
            
            print('0. Back')
            
            try:
                choice = int(input('\nEnter choice: '))
                if choice == 0:
                    return
                if 1 <= choice <= len(candidates):
                    selected_email = candidates[choice - 1]
                    candidate_apps = df[df['CandidateEmail'] == selected_email]
                    
                    print(f'\n' + '='*60)
                    print(f'Applications for {selected_email}')
                    print('='*60)
                    print()
                    print(candidate_apps[['JobTitle', 'JobID', 'AppliedDate', 'Status']].to_string(index=False))
                else:
                    print('Invalid choice')
            except ValueError:
                print('Invalid input')
            
        except Exception as e:
            print(f'Error: {e}')
    
    def export_report(self):
        try:
            if not self.applied_jobs_file.exists():
                print('\nNo applications yet!')
                return
            
            df = pd.read_csv(self.applied_jobs_file)
            report_dir = self.base_dir / 'reports'
            report_dir.mkdir(exist_ok=True)
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            report_file = report_dir / f'application_report_{timestamp}.xlsx'
            
            with pd.ExcelWriter(report_file, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='All Applications', index=False)
                by_candidate = df.groupby('CandidateEmail').agg({
                    'JobTitle': 'count',
                    'AppliedDate': ['min', 'max']
                }).reset_index()
                by_candidate.columns = ['Email', 'Total Applications', 'First Application', 'Last Application']
                by_candidate.to_excel(writer, sheet_name='By Candidate', index=False)
                by_status = df.groupby('Status').size().reset_index(name='Count')
                by_status.to_excel(writer, sheet_name='By Status', index=False)
            
            print(f'\nâœ… Report exported to: {report_file}')
            
        except Exception as e:
            print(f'Error exporting report: {e}')
    
    def clear_history(self):
        print('\nâš ï¸  WARNING: This will delete all application history!')
        confirm = input('Type "DELETE" to confirm: ')
        
        if confirm == 'DELETE':
            try:
                if self.applied_jobs_file.exists():
                    backup_dir = self.base_dir / 'backups'
                    backup_dir.mkdir(exist_ok=True)
                    
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    backup_file = backup_dir / f'applied_jobs_backup_{timestamp}.csv'
                    shutil.copy(self.applied_jobs_file, backup_file)
                    df = pd.DataFrame(columns=['CandidateEmail', 'JobTitle', 'JobID', 'AppliedDate', 'Status'])
                    df.to_csv(self.applied_jobs_file, index=False)
                    print(f'\nâœ… History cleared!')
                    print(f'Backup saved to: {backup_file}')
                else:
                    print('\nNo history to clear')
            except Exception as e:
                print(f'Error: {e}')
        else:
            print('\nOperation cancelled')
    
    def run(self):
        while True:
            self.show_menu()
            
            try:
                choice = input('Enter choice: ').strip()
                
                if choice == '1':
                    self.view_candidates()
                elif choice == '2':
                    self.view_statistics()
                elif choice == '3':
                    self.view_recent_applications()
                elif choice == '4':
                    self.view_applications_by_candidate()
                elif choice == '5':
                    self.export_report()
                elif choice == '6':
                    self.clear_history()
                elif choice == '0':
                    print('\nGoodbye!')
                    break
                else:
                    print('\nInvalid choice. Please try again.')
                
                input('\nPress Enter to continue...')
                
            except KeyboardInterrupt:
                print('\n\nExiting...')
                break
            except Exception as e:
                print(f'\nError: {e}')
                input('\nPress Enter to continue...')


def main():
    dashboard = JobBotDashboard()
    dashboard.run()


if __name__ == '__main__':
    main()


