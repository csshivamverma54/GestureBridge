import os
from pathlib import Path
from huggingface_hub import HfApi

token_file = Path.home() / ".cache" / "huggingface" / "token"
token = token_file.read_text().strip()
api = HfApi(token=token)

repo_id = "csshivamverma54/gesturebridge-wlasl"
videos_dir = Path("backend/data/WLASL/videos").resolve()
curated_json = Path("backend/data/WLASL/curated_WLASL.json").resolve()

print(f"Uploading videos from {videos_dir} to {repo_id}...")

# 1. Upload curated_WLASL.json
api.upload_file(
    path_or_fileobj=str(curated_json),
    path_in_repo="curated_WLASL.json",
    repo_id=repo_id,
    repo_type="dataset",
    commit_message="Add curated WLASL dictionary metadata"
)
print("Uploaded curated_WLASL.json")

# 2. Upload video folder
api.upload_folder(
    folder_path=str(videos_dir),
    path_in_repo="videos",
    repo_id=repo_id,
    repo_type="dataset",
    commit_message="Upload 2,600 curated WLASL video clips for GestureBridge Text-to-Sign"
)
print("Upload of video folder complete!")

