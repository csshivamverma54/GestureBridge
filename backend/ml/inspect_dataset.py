"""
inspect_dataset.py  (backend/ml/inspect_dataset.py)
-----------------------------------------------------
Stand-alone dataset inspection script.

Run BEFORE preprocessing to validate the WLASL dataset layout and print
a summary report. Nothing is modified — this is read-only analysis.

Usage (from backend/):
    python -m ml.inspect_dataset --dataset_dir ../data/WLASL

Expected directory layout:
    <dataset_dir>/
        videos/              ← one .mp4 per sample
        WLASL_v0.3.json      ← metadata with gloss + video IDs
        missing.txt          ← video IDs to skip (one per line)

Output:
    - Total glosses, total video entries, missing entries
    - Per-gloss sample count distribution
    - Video file existence check
    - Estimated dataset size
    - Writes a human-readable report to <dataset_dir>/dataset_report.txt
"""

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def load_wlasl_json(json_path: Path) -> list:
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_missing_ids(missing_path: Path) -> set:
    """Return a set of video-ID strings listed in missing.txt."""
    if not missing_path.exists():
        return set()
    with open(missing_path, "r", encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


def collect_entries(data: list, missing_ids: set, videos_dir: Path):
    """
    Flatten WLASL JSON into a list of dicts.

    Each dict:  {gloss, video_id, video_path, exists_on_disk}
    """
    entries = []
    for item in data:
        gloss = item["gloss"]
        for instance in item.get("instances", []):
            vid_id = str(instance.get("video_id", ""))
            video_path = videos_dir / f"{vid_id}.mp4"
            entries.append(
                {
                    "gloss": gloss,
                    "video_id": vid_id,
                    "video_path": str(video_path),
                    "in_missing": vid_id in missing_ids,
                    "exists_on_disk": video_path.exists(),
                }
            )
    return entries


# ------------------------------------------------------------------
# Report builder
# ------------------------------------------------------------------
def build_report(dataset_dir: Path) -> str:
    json_path = dataset_dir / "WLASL_v0.3.json"
    missing_path = dataset_dir / "missing.txt"
    videos_dir = dataset_dir / "videos"

    lines = ["=" * 60, "GestureBridge — WLASL Dataset Inspection Report", "=" * 60]

    # --- JSON check ---
    if not json_path.exists():
        lines.append(f"[ERROR] WLASL_v0.3.json not found at: {json_path}")
        return "\n".join(lines)

    data = load_wlasl_json(json_path)
    missing_ids = load_missing_ids(missing_path)
    entries = collect_entries(data, missing_ids, videos_dir)

    total_glosses = len(data)
    total_entries = len(entries)
    missing_flagged = sum(1 for e in entries if e["in_missing"])
    missing_file = sum(1 for e in entries if not e["exists_on_disk"] and not e["in_missing"])
    usable = [e for e in entries if not e["in_missing"] and e["exists_on_disk"]]

    lines.append(f"\nDataset directory : {dataset_dir}")
    lines.append(f"Total glosses     : {total_glosses}")
    lines.append(f"Total entries     : {total_entries}")
    lines.append(f"  Flagged missing : {missing_flagged}  (in missing.txt)")
    lines.append(f"  File not found  : {missing_file}  (not in missing.txt but absent)")
    lines.append(f"  Usable entries  : {len(usable)}")

    # --- Per-gloss distribution ---
    gloss_counts = Counter(e["gloss"] for e in usable)
    sorted_counts = sorted(gloss_counts.items(), key=lambda x: -x[1])

    lines.append(f"\nUnique glosses (usable) : {len(gloss_counts)}")
    lines.append(f"Max samples per gloss   : {sorted_counts[0][1] if sorted_counts else 0}")
    lines.append(f"Min samples per gloss   : {sorted_counts[-1][1] if sorted_counts else 0}")
    lines.append(
        f"Avg samples per gloss   : "
        f"{sum(gloss_counts.values()) / len(gloss_counts):.2f}" if gloss_counts else "N/A"
    )

    lines.append("\nTop 20 most-frequent glosses:")
    for gloss, cnt in sorted_counts[:20]:
        lines.append(f"  {gloss:<30} {cnt} samples")

    lines.append("\nBottom 10 least-frequent glosses:")
    for gloss, cnt in sorted_counts[-10:]:
        lines.append(f"  {gloss:<30} {cnt} samples")

    # Glosses with only 1 sample (cannot be split into train/val/test)
    single_sample = [g for g, c in gloss_counts.items() if c == 1]
    lines.append(
        f"\nGlosses with only 1 sample (will be train-only): {len(single_sample)}"
    )

    # --- Disk usage estimate ---
    total_bytes = sum(
        os.path.getsize(e["video_path"])
        for e in usable
        if os.path.exists(e["video_path"])
    )
    lines.append(f"\nEstimated video size on disk : {total_bytes / (1024**3):.2f} GB")
    lines.append("\n" + "=" * 60)

    return "\n".join(lines)


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Inspect the WLASL dataset and print a summary report."
    )
    parser.add_argument(
        "--dataset_dir",
        type=str,
        required=True,
        help="Path to the WLASL dataset root directory.",
    )
    parser.add_argument(
        "--save_report",
        action="store_true",
        default=True,
        help="Save report to <dataset_dir>/dataset_report.txt",
    )
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir).resolve()
    if not dataset_dir.exists():
        print(f"[ERROR] Dataset directory not found: {dataset_dir}", file=sys.stderr)
        sys.exit(1)

    report = build_report(dataset_dir)
    print(report)

    if args.save_report:
        report_path = dataset_dir / "dataset_report.txt"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    main()
