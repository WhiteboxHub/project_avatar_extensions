
import csv
import json
from pathlib import Path
from datetime import datetime


def create_candidates_template(output_path='data/candidates_template.csv'):
    headers = ['Email', 'Password', 'FirstName', 'LastName', 'Phone', 'ResumePath', 'Status']
    sample_data = [
        ['candidate1@example.com', 'password123', 'John', 'Doe', '1234567890', 'resumes/john_doe_resume.pdf', 'Active'],
        ['candidate2@example.com', 'password456', 'Jane', 'Smith', '0987654321', 'resumes/jane_smith_resume.pdf', 'Active']
    ]
    
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(sample_data)
    
    print(f'Template created: {output_path}')


def generate_report(applied_jobs_csv='data/applied_jobs.csv', output_path='logs/report.json'):
    try:
        import pandas as pd
        
        df = pd.read_csv(applied_jobs_csv)
        
        report = {
            'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_applications': len(df),
            'by_candidate': df.groupby('CandidateEmail').size().to_dict(),
            'by_status': df.groupby('Status').size().to_dict(),
            'recent_applications': df.tail(10).to_dict('records')
        }
        
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f'Report generated: {output_path}')
        print(f'Total applications: {report["total_applications"]}')
        print(f'By candidate: {report["by_candidate"]}')
        
    except Exception as e:
        print(f'Error generating report: {e}')


if __name__ == '__main__':
    # Create template when run directly
    create_candidates_template()


