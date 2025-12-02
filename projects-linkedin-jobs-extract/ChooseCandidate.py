import os
import yaml

def chooseCandidate(directory="configs"):
    
    yaml_files = [f for f in os.listdir(directory) if f.endswith('.yaml') or f.endswith('.yml')]
    
    
    if not yaml_files:
        print("No YAML files found in the directory.")
        return
    
    
    for idx, file_name in enumerate(yaml_files, 1):
        print(f"{idx} = {file_name}")
    
    
    try:
        selected_number = int(input("Enter the number of the file you want to select: "))
        
    
        if 1 <= selected_number <= len(yaml_files):
            selected_file = yaml_files[selected_number - 1]
            file_path = os.path.join(directory, selected_file)
            
            
            print(f"\nSelected File Path: {file_path}")
            
            return file_path
        else:
            print("Invalid selection. Please enter a number corresponding to the listed files.")
    except ValueError:
        print("Invalid input. Please enter a valid number.")



directory_path = "configs"  



    