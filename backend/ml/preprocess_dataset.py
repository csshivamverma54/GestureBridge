"""
preprocess_dataset.py  (backend/ml/preprocess_dataset.py)
----------------------------------------------------------
Offline preprocessing pipeline for the WLASL dataset.

What it does:
  1. Parses WLASL_v0.3.json to build a (video_path, gloss) index.
  2. Skips every video_id listed in missing.txt.
  3. Skips video files that do not exist on disk.
  4. For each usable video:
       a. Opens the video with OpenCV.
       b. Extracts 21 MediaPipe hand landmarks for BOTH hands per frame.
          Each frame → 126 floats (left-hand 63 + right-hand 63).
       c. Handles frames with no detection (carry-forward + zero-pad).
       d. Pads or truncates to exactly SEQUENCE_LENGTH frames.
       e. Applies per-sequence normalization.
  5. Saves:
       - processed/X.npy          → float32 array (N, 30, 126)
       - processed/y.npy          → int32  array  (N,)
       - processed/labels.json    → {int: gloss_string} mapping
       - processed/meta.json      → run metadata (counts, glosses, etc.)

Usage (from backend/):
    python -m ml.preprocess_dataset \\
        --dataset_dir ../data/WLASL \\
        --output_dir  ml/processed \\
        --sequence_length 30 \\
        --min_samples 3 \\
        --workers 4

The --min_samples flag drops glosses that have fewer than N usable
videos (they cannot form a meaningful train/val/test split).

Progress is printed to stdout so you can monitor a long run.
"""

import argparse
import json
import logging
import os
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

# Add backend root to path so relative imports work when run as __main__
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml.utils.landmarks import (
    LANDMARK_VECTOR_SIZE,
    build_hands_solution,
    extract_sequence_from_video,
)
from ml.utils.preprocess import normalize_sequence, pad_or_truncate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Dataset parsing
# ------------------------------------------------------------------
def load_missing_ids(missing_path: Path) -> set:
    if not missing_path.exists():
        log.warning("missing.txt not found — no videos will be skipped.")
        return set()
    with open(missing_path, "r", encoding="utf-8") as f:
        ids = {line.strip() for line in f if line.strip()}
    log.info("Loaded %d missing video IDs from %s", len(ids), missing_path)
    return ids


def parse_wlasl_json(json_path: Path, videos_dir: Path, missing_ids: set, min_samples: int):
    """
    Return a list of (video_path, gloss, video_id) tuples for usable videos,
    filtered by min_samples threshold.
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # First pass: collect all candidate entries grouped by gloss
    gloss_map = defaultdict(list)
    for item in data:
        gloss = item["gloss"].strip()
        for instance in item.get("instances", []):
            vid_id = str(instance.get("video_id", "")).strip()
            if vid_id in missing_ids:
                continue
            video_path = videos_dir / f"{vid_id}.mp4"
            if not video_path.exists():
                continue
            gloss_map[gloss].append((str(video_path), gloss, vid_id))

    # Second pass: filter by min_samples
    all_entries = []
    skipped_glosses = []
    for gloss, entries in gloss_map.items():
        if len(entries) < min_samples:
            skipped_glosses.append((gloss, len(entries)))
            continue
        all_entries.extend(entries)

    if skipped_glosses:
        log.info(
            "Skipped %d glosses with fewer than %d samples: %s ... (showing first 10)",
            len(skipped_glosses),
            min_samples,
            [g for g, _ in skipped_glosses[:10]],
        )

    log.info(
        "Parsed dataset: %d usable entries across %d glosses",
        len(all_entries),
        len(set(e[1] for e in all_entries)),
    )
    return all_entries


# ------------------------------------------------------------------
# Per-video worker (used by ProcessPoolExecutor)
# ------------------------------------------------------------------
def _process_one(args):
    """
    Top-level function (must be picklable for multiprocessing).
    Returns (sequence_array, gloss, video_id, success_bool).
    """
    video_path, gloss, video_id, sequence_length = args
    try:
        # Each worker creates its own MediaPipe instance — detect both hands
        hands = build_hands_solution(static_image_mode=True, max_num_hands=2)
        seq = extract_sequence_from_video(
            video_path,
            sequence_length=sequence_length,
            hands_solution=hands,
        )
        hands.close()
        seq = pad_or_truncate(seq, sequence_length)
        seq = normalize_sequence(seq)
        return seq, gloss, video_id, True
    except Exception as exc:  # noqa: BLE001
        return None, gloss, video_id, False, str(exc)


# ------------------------------------------------------------------
# Main pipeline
# ------------------------------------------------------------------
def run_pipeline(
    dataset_dir: Path,
    output_dir: Path,
    sequence_length: int,
    min_samples: int,
    workers: int,
    json_path: Path = None,
):
    videos_dir = dataset_dir / "videos"
    if json_path is None:
        json_path = dataset_dir / "WLASL_v0.3.json"
    missing_path = dataset_dir / "missing.txt"

    if not json_path.exists():
        log.error("JSON not found at %s", json_path)
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    missing_ids = load_missing_ids(missing_path)
    entries = parse_wlasl_json(json_path, videos_dir, missing_ids, min_samples)

    if not entries:
        log.error("No usable entries found. Check dataset paths and min_samples.")
        sys.exit(1)

    # Build label → index mapping (sorted alphabetically for reproducibility)
    unique_glosses = sorted(set(e[1] for e in entries))
    gloss_to_idx = {g: i for i, g in enumerate(unique_glosses)}
    idx_to_gloss = {i: g for g, i in gloss_to_idx.items()}

    log.info("Found %d unique glosses.", len(unique_glosses))

    # Save labels.json immediately so it is available even if processing aborts
    labels_path = output_dir / "labels.json"
    with open(labels_path, "w", encoding="utf-8") as f:
        json.dump(idx_to_gloss, f, indent=2, ensure_ascii=False)
    log.info("Saved labels.json → %s", labels_path)

    # Prepare worker arguments
    work_args = [
        (video_path, gloss, video_id, sequence_length)
        for video_path, gloss, video_id in entries
    ]

    X_list = []
    y_list = []
    failed = 0
    done = 0
    total = len(work_args)

    log.info("Starting preprocessing with %d workers …", workers)

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_process_one, arg): arg for arg in work_args}
        for future in as_completed(futures):
            result = future.result()
            done += 1

            if len(result) == 5:  # error tuple
                _, gloss, vid_id, _, err_msg = result
                log.debug("Failed %s (%s): %s", vid_id, gloss, err_msg)
                failed += 1
            else:
                seq, gloss, vid_id, _ = result
                if seq is not None:
                    X_list.append(seq)
                    y_list.append(gloss_to_idx[gloss])
                else:
                    failed += 1

            if done % 100 == 0 or done == total:
                log.info(
                    "Progress: %d / %d  (failed: %d)", done, total, failed
                )

    if not X_list:
        log.error("All videos failed processing. Check MediaPipe installation.")
        sys.exit(1)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int32)

    log.info("Processed %d sequences  shape=%s", len(X), X.shape)

    # Save arrays
    np.save(output_dir / "X.npy", X)
    np.save(output_dir / "y.npy", y)
    log.info("Saved X.npy and y.npy → %s", output_dir)

    # Save metadata
    meta = {
        "total_samples": int(len(X)),
        "failed_samples": int(failed),
        "sequence_length": sequence_length,
        "landmark_vector_size": LANDMARK_VECTOR_SIZE,
        "num_classes": len(unique_glosses),
        "glosses": unique_glosses,
        "min_samples_per_gloss": min_samples,
    }
    with open(output_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    log.info("Saved meta.json → %s", output_dir / "meta.json")

    log.info(
        "Pipeline complete. Usable: %d  Failed: %d  Classes: %d",
        len(X),
        failed,
        len(unique_glosses),
    )


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Preprocess WLASL videos into landmark sequences."
    )
    parser.add_argument(
        "--dataset_dir",
        type=str,
        required=True,
        help="Path to WLASL dataset root (contains videos/ and missing.txt).",
    )
    parser.add_argument(
        "--json_path",
        type=str,
        default=None,
        help="Override JSON path (e.g. data/WLASL/curated_WLASL.json). "
             "Defaults to <dataset_dir>/WLASL_v0.3.json.",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="ml/processed",
        help="Directory to save X.npy, y.npy, labels.json, meta.json.",
    )
    parser.add_argument(
        "--sequence_length",
        type=int,
        default=30,
        help="Fixed number of frames per sequence (default: 30).",
    )
    parser.add_argument(
        "--min_samples",
        type=int,
        default=3,
        help="Minimum samples per gloss (glosses below this are dropped).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Number of parallel worker processes (default: 4).",
    )
    args = parser.parse_args()

    run_pipeline(
        dataset_dir=Path(args.dataset_dir).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        sequence_length=args.sequence_length,
        min_samples=args.min_samples,
        workers=args.workers,
        json_path=Path(args.json_path).resolve() if args.json_path else None,
    )


if __name__ == "__main__":
    main()
