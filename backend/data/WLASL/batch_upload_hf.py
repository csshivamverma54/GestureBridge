import time
from pathlib import Path
from huggingface_hub import HfApi, HfFolder
from huggingface_hub.errors import HfHubHTTPError

token_file = Path.home() / ".cache" / "huggingface" / "token"
token = token_file.read_text().strip()
api = HfApi(token=token)

repo_id = "csshivamverma54/gesturebridge-wlasl"
videos_dir = Path("backend/data/WLASL/videos").resolve()
curated_json = Path("backend/data/WLASL/curated_WLASL.json").resolve()

# Wait out any remaining cooldown if needed
def safe_api_call(fn, *args, **kwargs):
    while True:
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            if "429" in str(e) or "rate limit" in str(e).lower():
                print("Rate limit reached. Sleeping for 310 seconds to allow quota window to reset...")
                time.sleep(310)
            else:
                raise e

# 1. Ensure curated_WLASL.json is uploaded
print("Ensuring curated_WLASL.json is committed...")
try:
    safe_api_call(
        api.upload_file,
        path_or_fileobj=str(curated_json),
        path_in_repo="curated_WLASL.json",
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Add curated WLASL dictionary"
    )
except Exception as e:
    print("curated_WLASL.json upload status:", e)

# 2. Get list of all local video files
all_local_files = sorted(list(videos_dir.glob("*.mp4")))
print(f"Total local video files to upload: {len(all_local_files)}")

# 3. Get currently existing files in repo
existing_in_repo = set()
try:
    existing_in_repo = set(safe_api_call(api.list_repo_files, repo_id=repo_id, repo_type="dataset"))
except Exception as e:
    print("Could not list repo files, will proceed with upload:", e)

pending_files = [f for f in all_local_files if f"videos/{f.name}" not in existing_in_repo]
print(f"Files remaining to upload: {len(pending_files)}")

BATCH_SIZE = 350
for idx in range(0, len(pending_files), BATCH_SIZE):
    batch = pending_files[idx:idx + BATCH_SIZE]
    batch_num = idx // BATCH_SIZE + 1
    total_batches = (len(pending_files) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"\n--- Uploading Batch {batch_num}/{total_batches} ({len(batch)} files) ---")

    # Upload batch files individually or as folder
    from huggingface_hub import CommitOperationAdd
    operations = [
        CommitOperationAdd(path_in_repo=f"videos/{f.name}", path_or_fileobj=str(f))
        for f in batch
    ]
    
    safe_api_call(
        api.create_commit,
        repo_id=repo_id,
        repo_type="dataset",
        operations=operations,
        commit_message=f"Upload video batch {batch_num}/{total_batches} ({len(batch)} files)"
    )
    print(f"Batch {batch_num} committed successfully.")

    if idx + BATCH_SIZE < len(pending_files):
        print("Pausing 310 seconds to respect Hugging Face rate limit quota (1000 requests / 5 min)...")
        time.sleep(310)

print("\nAll video files successfully uploaded to Hugging Face dataset!")

