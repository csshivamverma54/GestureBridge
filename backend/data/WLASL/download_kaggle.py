import kagglehub
import os

print("Starting download of risangbaskoro/wlasl-processed...")
path = kagglehub.dataset_download("risangbaskoro/wlasl-processed")
print("Path to dataset files:", path)

# Inspect files in the downloaded path
if os.path.exists(path):
    print("Contents of dataset:")
    for root, dirs, files in os.walk(path):
        print(f"Directory: {root} (dirs: {len(dirs)}, files: {len(files)})")
        if files:
            print("  Sample files:", files[:10])

