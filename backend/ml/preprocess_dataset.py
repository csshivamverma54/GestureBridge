"""
preprocess_dataset.py  (backend/ml/preprocess_dataset.py)
----------------------------------------------------------
Offline preprocessing pipeline for the WLASL dataset.

What it does:
  1. Parses curated_WLASL.json to build a (video_path, gloss) index.
  2. Skips every video_id listed in missing.txt.
  3. Skips video files that do not exist on disk.
  4. For each usable video:
       a. Opens the video with OpenCV.
       b. Extracts the full 218-dim multi-modal feature vector per frame
          via MediaPipe Holistic (hands + pose + face + velocity +
          interaction + acceleration + NMM + finger angles + wrist
          orientation + body distances).
          Feature layout per frame:
            [left_hand(63) | right_hand(63) | pose(24) | face(27)
             | velocity(3) | interaction(2) | accel(3) | nmm(10)
             | finger_angles(15) | wrist_quat(4) | body_dist(4)]  = 218 dims
       c. Handles frames with no detection (carry-forward + zero-pad).
       d. Pads or truncates to exactly SEQUENCE_LENGTH frames.
       e. Produces N_AUGMENTATIONS augmented copies per original sequence.
  5. Saves:
       - processed/X.npy          → float32 array (N, 45, 218)
       - processed/y.npy          → int32  array  (N,)
       - processed/labels.json    → {int: gloss_string} mapping
       - processed/meta.json      → run metadata

DATA AUGMENTATION  (key for small per-class sample counts)
-----------------------------------------------------------
Each original video produces N_AUGMENTATIONS extra variants, effectively
multiplying the dataset. With 8 augmentations and ~7 original videos per
class → 7 × 9 = 63 training samples per class for ~200 classes.

Augmentation variants:
  1. Gaussian noise       — additive noise (σ=0.01) on all landmarks
  2. Scale jitter         — scale factor ∈ [0.85, 1.15] (hand size variation)
  3. Temporal crop        — drop 0–25% frames from start or end + re-pad
  4. Mirror/flip          — swap left ↔ right hand slots
  5. Time warp            — non-linear frame resampling (speed variation)
  6. 2D rotation jitter   — small random rotation in XY plane (±8.6°)
  7. Noise + mirror       — combo: noise applied to mirrored sequence
  8. Scale + time-warp    — combo: scale jitter on time-warped sequence

Both hands (126-dim) are preserved in every augmentation. The mirror variant
is especially important — it teaches the model about left-handed signers
and signs that differ between dominant/non-dominant hands.

Usage (from backend/):
    python -m ml.preprocess_dataset \\
        --dataset_dir data/WLASL \\
        --json_path   data/WLASL/curated_WLASL.json \\
        --output_dir  ml/processed \\
        --sequence_length 30 \\
        --min_samples 3 \\
        --workers 4 \\
        --augmentations 8
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml.utils.landmarks import (
    LANDMARK_VECTOR_SIZE,
    SINGLE_HAND_SIZE,
    HANDS_SIZE,          # = SINGLE_HAND_SIZE * 2 = 126 (both hands boundary)
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
# Data Augmentation
# ------------------------------------------------------------------
def _time_warp(seq: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """
    Non-linear time warp: resample the T frames using a smooth random
    mapping so fast/slow signers are modelled.  The output has the same
    T length as the input.
    """
    T = seq.shape[0]
    # Build a smooth warp by creating a few random control points and
    # interpolating with a cubic spline equivalent.
    n_knots = rng.integers(3, 6)
    knot_x  = np.sort(rng.uniform(0, T, n_knots))
    knot_y  = knot_x + rng.normal(0, T * 0.08, n_knots)
    # Clamp and append boundary knots so the whole range is covered
    knot_x  = np.concatenate([[0], knot_x, [T - 1]])
    knot_y  = np.concatenate([[0], knot_y, [T - 1]])
    # Linear interpolation of the warp field, then sample with np.interp
    new_idx = np.interp(np.arange(T), knot_x, knot_y)
    new_idx = np.clip(new_idx, 0, T - 1).astype(np.float32)
    # Use floor/ceil blend for smoother output
    lo = np.floor(new_idx).astype(int)
    hi = np.minimum(lo + 1, T - 1)
    frac = (new_idx - lo)[:, np.newaxis]
    warped = (seq[lo] * (1 - frac) + seq[hi] * frac).astype(np.float32)
    return warped


def _rotate_2d(seq: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """
    Apply a small random 2D rotation (in the XY image plane) to all
    hand landmarks.  Keeps Z coordinate unchanged.

    seq: (T, 126) — layout: [lx0,ly0,lz0, lx1,ly1,lz1, …(63 values) |
                              rx0,ry0,rz0, …(63 values)]
    """
    angle = rng.uniform(-0.15, 0.15)   # radians (~±8.6°)
    cos_a, sin_a = float(np.cos(angle)), float(np.sin(angle))
    out = seq.copy()
    # Process each hand slot independently (same rotation applied to both)
    for start in (0, SINGLE_HAND_SIZE):
        end = start + SINGLE_HAND_SIZE
        chunk = out[:, start:end]           # (T, 63)
        xs = chunk[:, 0::3].copy()          # every x coord: indices 0,3,6,…
        ys = chunk[:, 1::3].copy()          # every y coord: indices 1,4,7,…
        chunk[:, 0::3] = cos_a * xs - sin_a * ys
        chunk[:, 1::3] = sin_a * xs + cos_a * ys
        out[:, start:end] = chunk
    return out.astype(np.float32)


def _augment_sequence(seq: np.ndarray, rng: np.random.Generator) -> list[np.ndarray]:
    """
    Produce up to 8 augmented variants of a full 218-dim landmark sequence.
    Each augmentation preserves the temporal structure (crucial for LSTM)
    and keeps ALL feature slots intact; only hand coordinates are rotated.

    seq: np.ndarray shape (T=45, 218)
    Returns: list of up to 8 np.ndarray each shape (T=45, 218)
    """
    T = seq.shape[0]
    augmented = []

    # ── 1. Gaussian noise ─────────────────────────────────────────────
    noise = seq.copy()
    noise += rng.normal(0, 0.01, noise.shape).astype(np.float32)
    augmented.append(noise)

    # ── 2. Scale jitter (hand size / distance variation) ─────────────
    scale = seq.copy()
    factor = rng.uniform(0.85, 1.15)
    scale = (scale * factor).astype(np.float32)
    augmented.append(scale)

    # ── 3. Temporal crop + re-pad (simulate late/early signing) ───────
    crop = seq.copy()
    drop = rng.integers(0, max(1, T // 4))
    if rng.random() < 0.5:
        crop = np.vstack([crop[drop:], np.zeros((drop, LANDMARK_VECTOR_SIZE), dtype=np.float32)])
    else:
        crop = np.vstack([np.zeros((drop, LANDMARK_VECTOR_SIZE), dtype=np.float32), crop[:T - drop]])
    augmented.append(crop)

    # ── 4. Mirror: swap left-hand and right-hand slots ────────────────
    #    Only the first HANDS_SIZE (=126) bytes are the hand landmarks.
    #    The remaining dims (pose, face, velocity, interaction) are kept
    #    as-is; velocity and interaction distances are hand-agnostic
    #    scalars so they remain valid for both signing directions.
    mirror = seq.copy()
    left_slot  = mirror[:, :SINGLE_HAND_SIZE].copy()          # cols 0–62
    right_slot = mirror[:, SINGLE_HAND_SIZE:HANDS_SIZE].copy() # cols 63–125
    mirror[:, :SINGLE_HAND_SIZE]         = right_slot
    mirror[:, SINGLE_HAND_SIZE:HANDS_SIZE] = left_slot
    augmented.append(mirror)

    # ── 5. Time warp (signing speed variation) ────────────────────────
    warped = _time_warp(seq, rng)
    augmented.append(warped)

    # ── 6. 2D rotation jitter (slight signer head/body tilt) ──────────
    rotated = _rotate_2d(seq, rng)
    augmented.append(rotated)

    # ── 7. Noise + mirror combo ───────────────────────────────────────
    #    Mirrors the sequence then adds noise — teaches both handedness
    #    variants with natural landmark jitter.
    noisy_mirror = mirror.copy()
    noisy_mirror += rng.normal(0, 0.01, noisy_mirror.shape).astype(np.float32)
    augmented.append(noisy_mirror)

    # ── 8. Scale + time-warp combo ────────────────────────────────────
    #    Simulates a differently-sized hand signing at a different speed.
    scale_factor = rng.uniform(0.85, 1.15)
    scaled_warped = (warped * scale_factor).astype(np.float32)
    augmented.append(scaled_warped)

    return augmented


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
            len(skipped_glosses), min_samples,
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
    Extract one video's landmark sequence + augmented copies.
    Returns (list_of_sequences, gloss, video_id, success_bool)
    where list_of_sequences[0] is the original, rest are augmentations.
    """
    video_path, gloss, video_id, sequence_length, n_augmentations = args
    try:
        hands = build_hands_solution(static_image_mode=True, max_num_hands=2)
        seq = extract_sequence_from_video(
            video_path,
            sequence_length=sequence_length,
            hands_solution=hands,
        )
        hands.close()
        seq = pad_or_truncate(seq, sequence_length)
        seq = normalize_sequence(seq)

        sequences = [seq]
        if n_augmentations > 0:
            rng = np.random.default_rng()
            aug = _augment_sequence(seq, rng)
            sequences.extend(aug[:n_augmentations])

        return sequences, gloss, video_id, True
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
    n_augmentations: int,
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

    unique_glosses = sorted(set(e[1] for e in entries))
    gloss_to_idx = {g: i for i, g in enumerate(unique_glosses)}
    idx_to_gloss = {i: g for g, i in gloss_to_idx.items()}

    log.info("Found %d unique glosses.", len(unique_glosses))
    log.info("Augmentations per video: %d → effective samples ≈ %d",
             n_augmentations, len(entries) * (1 + n_augmentations))

    labels_path = output_dir / "labels.json"
    with open(labels_path, "w", encoding="utf-8") as f:
        json.dump(idx_to_gloss, f, indent=2, ensure_ascii=False)
    log.info("Saved labels.json → %s", labels_path)

    work_args = [
        (video_path, gloss, video_id, sequence_length, n_augmentations)
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
                sequences, gloss, vid_id, _ = result
                if sequences is not None:
                    for seq in sequences:
                        X_list.append(seq)
                        y_list.append(gloss_to_idx[gloss])
                else:
                    failed += 1

            if done % 100 == 0 or done == total:
                log.info(
                    "Progress: %d / %d  (seqs so far: %d  failed: %d)",
                    done, total, len(X_list), failed,
                )

    if not X_list:
        log.error("All videos failed processing. Check MediaPipe installation.")
        sys.exit(1)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int32)

    log.info("Total sequences (orig + augmented): %d  shape=%s", len(X), X.shape)

    np.save(output_dir / "X.npy", X)
    np.save(output_dir / "y.npy", y)
    log.info("Saved X.npy and y.npy → %s", output_dir)

    # Class balance report
    class_counts = defaultdict(int)
    for label in y_list:
        class_counts[label] += 1
    counts = list(class_counts.values())
    log.info("Per-class sample stats: min=%d max=%d mean=%.1f",
             min(counts), max(counts), sum(counts) / len(counts))

    meta = {
        "total_samples": int(len(X)),
        "original_videos": int(total - failed),
        "failed_samples": int(failed),
        "augmentations_per_video": n_augmentations,
        "sequence_length": sequence_length,
        "landmark_vector_size": LANDMARK_VECTOR_SIZE,
        "num_classes": len(unique_glosses),
        "glosses": unique_glosses,
        "min_samples_per_gloss": min_samples,
        "per_class_min": int(min(counts)),
        "per_class_max": int(max(counts)),
        "per_class_mean": round(sum(counts) / len(counts), 1),
    }
    with open(output_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    log.info("Saved meta.json → %s", output_dir / "meta.json")

    log.info(
        "Pipeline complete. Total: %d  Failed: %d  Classes: %d",
        len(X), failed, len(unique_glosses),
    )


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Preprocess WLASL videos into landmark sequences with augmentation."
    )
    parser.add_argument("--dataset_dir", type=str, required=True)
    parser.add_argument("--json_path",   type=str, default=None)
    parser.add_argument("--output_dir",  type=str, default="ml/processed")
    parser.add_argument("--sequence_length", type=int, default=45,
                        help="Frames per sequence (default 45 ≈ 1.5 s at 30 FPS).")
    parser.add_argument("--min_samples",     type=int, default=3,
                        help="Min original videos per gloss (default 3)")
    parser.add_argument("--workers",         type=int, default=4)
    parser.add_argument("--augmentations",   type=int, default=8,
                        help="Augmented copies per original video (default 8). "
                             "Set 0 to disable augmentation. Max 8: noise, "
                             "scale, crop, mirror, time-warp, rotation, "
                             "noise+mirror, scale+warp.")
    args = parser.parse_args()

    run_pipeline(
        dataset_dir=Path(args.dataset_dir).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        sequence_length=args.sequence_length,
        min_samples=args.min_samples,
        workers=args.workers,
        n_augmentations=args.augmentations,
        json_path=Path(args.json_path).resolve() if args.json_path else None,
    )


if __name__ == "__main__":
    main()
