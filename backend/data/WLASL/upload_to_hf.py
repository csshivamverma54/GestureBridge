"""
upload_to_hf.py — Download curated WLASL videos and upload to a Hugging Face Dataset.

Usage:
  1. Extract curated videos locally for offline development:
       python upload_to_hf.py --local-only

  2. Upload curated videos to your own Hugging Face Dataset:
       python upload_to_hf.py --repo your-username/gesturebridge-wlasl --token hf_...

  3. Upload custom local videos folder:
       python upload_to_hf.py --repo your-username/gesturebridge-wlasl --token hf_... --videos-dir ./videos
"""

import argparse
import io
import json
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CURATED_JSON = BASE_DIR / "curated_WLASL.json"
LOCAL_VIDEOS_DIR = BASE_DIR / "videos"
DEFAULT_SOURCE_ZIP = "https://huggingface.co/datasets/lavinal712/WLASL/resolve/main/videos.zip"


def get_curated_video_ids(json_path: Path) -> set[str]:
    """Parse curated_WLASL.json to collect all needed 5-digit video IDs."""
    if not json_path.exists():
        print(f"[!] {json_path} not found.")
        return set()
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    ids = set()
    for entry in data:
        for inst in entry.get("instances", []):
            vid = str(inst.get("video_id", "")).zfill(5)
            if vid:
                ids.add(vid)
    return ids


def download_progress_hook(count, block_size, total_size):
    if total_size > 0:
        percent = min(100, int(count * block_size * 100 / total_size))
        mb_downloaded = (count * block_size) / (1024 * 1024)
        total_mb = total_size / (1024 * 1024)
        sys.stdout.write(f"\rDownloading WLASL archive: {percent}% ({mb_downloaded:.1f}/{total_mb:.1f} MB)")
        sys.stdout.flush()


def extract_curated_videos(zip_path: Path, output_dir: Path, needed_ids: set[str]):
    """Extract only videos belonging to the curated vocabulary."""
    output_dir.mkdir(parents=True, exist_ok=True)
    extracted = 0
    print(f"\nExtracting {len(needed_ids)} curated sign videos to {output_dir}...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        namelist = zf.namelist()
        for name in namelist:
            fname = Path(name).name
            if not fname.endswith(".mp4"):
                continue
            stem = Path(fname).stem
            padded = stem.zfill(5)
            if padded in needed_ids or stem in needed_ids:
                dest = output_dir / f"{padded}.mp4"
                if not dest.exists():
                    with zf.open(name) as src, open(dest, "wb") as dst:
                        dst.write(src.read())
                extracted += 1
    print(f"[✓] Extracted {extracted} curated video clips to {output_dir}")
    return extracted


def upload_to_huggingface(videos_dir: Path, repo_id: str, token: str):
    """Upload folder of mp4 videos to Hugging Face Dataset repository."""
    try:
        from huggingface_hub import HfApi
    except ImportError:
        print("[!] huggingface_hub is not installed. Run: pip install huggingface_hub")
        sys.exit(1)

    api = HfApi(token=token)
    print(f"\nEnsuring repository '{repo_id}' exists on Hugging Face...")
    api.create_repo(repo_id=repo_id, repo_type="dataset", exist_ok=True, private=False)

    print(f"Uploading videos from {videos_dir} to https://huggingface.co/datasets/{repo_id} (folder: videos/)...")
    api.upload_folder(
        folder_path=str(videos_dir),
        path_in_repo="videos",
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Add curated WLASL video clips for GestureBridge Text-to-Sign",
    )
    print(f"\n[✓] Successfully uploaded videos to https://huggingface.co/datasets/{repo_id}")
    print(f"\nSet this in your environment or Render dashboard:")
    print(f"  WLASL_CDN_URL=https://huggingface.co/datasets/{repo_id}/resolve/main/videos\n")


def main():
    parser = argparse.ArgumentParser(description="Manage GestureBridge WLASL videos and Hugging Face CDN.")
    parser.add_argument("--repo", help="Hugging Face Dataset repo ID, e.g. 'username/gesturebridge-wlasl'")
    parser.add_argument("--token", help="Hugging Face write token (or set HF_TOKEN env var)")
    parser.add_argument("--videos-dir", type=Path, default=LOCAL_VIDEOS_DIR, help="Local directory for videos")
    parser.add_argument("--zip-source", default=DEFAULT_SOURCE_ZIP, help="Source URL for WLASL videos zip")
    parser.add_argument("--local-only", action="store_true", help="Download and extract locally without uploading")

    args = parser.parse_args()

    token = args.token or os.getenv("HF_TOKEN")
    needed_ids = get_curated_video_ids(CURATED_JSON)
    print(f"Loaded {len(needed_ids)} target sign video IDs from {CURATED_JSON.name}")

    args.videos_dir.mkdir(parents=True, exist_ok=True)
    existing_videos = list(args.videos_dir.glob("*.mp4"))

    # If videos directory has fewer than 100 videos, download and unpack from Hugging Face source
    if len(existing_videos) < 100:
        temp_zip = BASE_DIR / "wlasl_source.zip"
        if not temp_zip.exists():
            print(f"Downloading WLASL video archive from {args.zip_source}...")
            urllib.request.urlretrieve(args.zip_source, temp_zip, reporthook=download_progress_hook)
            print()
        extract_curated_videos(temp_zip, args.videos_dir, needed_ids)
        if temp_zip.exists():
            try:
                temp_zip.unlink()
            except Exception:
                pass
    else:
        print(f"Found {len(existing_videos)} existing videos in {args.videos_dir}")

    if args.local_only:
        print("[✓] Local video setup complete.")
        return

    if not args.repo:
        print("\n[i] Local videos are ready. To publish to your Hugging Face CDN, run:")
        print("    python upload_to_hf.py --repo your-username/gesturebridge-wlasl --token hf_yourToken")
        return

    if not token:
        print("[!] A Hugging Face write token is required to upload. Pass --token hf_... or set HF_TOKEN.")
        sys.exit(1)

    upload_to_huggingface(args.videos_dir, args.repo, token)


if __name__ == "__main__":
    main()

