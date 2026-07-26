"""
build_asl_dataset.py  (backend/ml/build_asl_dataset.py)
---------------------------------------------------------
Phase 1: Extract 63-feature MediaPipe hand-landmark vectors from the
ASL alphabet image dataset stored in backend/database/data/.

Dataset layout
--------------
  database/data/
    0/   → class A (5 000 images)
    1/   → class B
    ...
    25/  → class Z
    26/  → del
    27/  → space

Output
------
  ml/processed/asl_letter_features.npz
    X  : float32  (N, 63)   — wrist-centred, scale-normalised landmarks
    y  : int32    (N,)      — class indices
    labels : dict[int, str] — {0: 'A', ..., 27: 'space'}

Invariant preprocessing (per spec Phase 1.2)
--------------------------------------------
  1. Wrist-centering : subtract Landmark 0 from all 21 landmarks
  2. Scale-norm      : divide by |L0 – L9| (Wrist → Middle MCP distance)

Run from backend/:
    python -m ml.build_asl_dataset
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────
_BASE_DIR  = Path(__file__).parent.parent          # backend/
_DATA_DIR  = _BASE_DIR / "database" / "data"
_OUT_DIR   = Path(__file__).parent / "processed"
_OUT_NPZ   = _OUT_DIR / "asl_letter_features.npz"
_OUT_JSON  = _OUT_DIR / "asl_letter_labels.json"

# Class mapping: folder index → letter / token
_CLASS_MAP: dict[int, str] = {i: chr(ord("A") + i) for i in range(26)}
_CLASS_MAP[26] = "del"
_CLASS_MAP[27] = "space"

# ── MediaPipe setup ────────────────────────────────────────────────────────
_mp_hands = mp.solutions.hands

# Maximum images to sample per class (set None for all 5 000 — very slow)
MAX_PER_CLASS: int = 1000   # 1 000 × 28 ≈ 28 000 samples, takes ~5–10 min


# ── Feature helpers ────────────────────────────────────────────────────────

def _normalise_hand(landmarks: np.ndarray) -> np.ndarray | None:
    """
    Apply wrist-centering + scale normalisation to 21×3 landmark array.

    Parameters
    ----------
    landmarks : (21, 3) float32 — raw MediaPipe world or normalised coordinates

    Returns
    -------
    (63,) float32 — flattened normalised vector, or None if scale is zero.
    """
    # Step 1: wrist-centering
    wrist = landmarks[0].copy()          # Landmark 0
    centred = landmarks - wrist          # (21, 3)

    # Step 2: scale by Wrist → Middle-MCP (Landmark 9) distance
    scale = float(np.linalg.norm(centred[9]))
    if scale < 1e-8:
        return None

    normed = centred / scale             # (21, 3)
    return normed.flatten().astype(np.float32)   # (63,)


def _extract_from_image(
    img_bgr: np.ndarray,
    hands_solution,
) -> np.ndarray | None:
    """
    Run MediaPipe Hands on one frame and return the normalised feature vector.
    Returns None when no hand is detected.
    """
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_rgb.flags.writeable = False
    results = hands_solution.process(img_rgb)
    img_rgb.flags.writeable = True

    if not results.multi_hand_world_landmarks:
        # Fallback to normalised landmarks if world coordinates not available
        if not results.multi_hand_landmarks:
            return None
        lms_raw = results.multi_hand_landmarks[0].landmark
        arr = np.array([[lm.x, lm.y, lm.z] for lm in lms_raw], dtype=np.float32)
    else:
        lms_raw = results.multi_hand_world_landmarks[0].landmark
        arr = np.array([[lm.x, lm.y, lm.z] for lm in lms_raw], dtype=np.float32)

    return _normalise_hand(arr)


# ── Main extraction loop ───────────────────────────────────────────────────

def build_dataset(max_per_class: int = MAX_PER_CLASS) -> None:
    _OUT_DIR.mkdir(parents=True, exist_ok=True)

    X_list: list[np.ndarray] = []
    y_list: list[int]        = []

    with _mp_hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=0.3,
        model_complexity=0,
    ) as hands:

        for class_idx in sorted(
            int(d) for d in os.listdir(_DATA_DIR) if d.isdigit()
        ):
            class_dir = _DATA_DIR / str(class_idx)
            label     = _CLASS_MAP.get(class_idx, f"cls{class_idx}")
            img_files = sorted(class_dir.glob("*.jpg"))[:max_per_class]

            extracted = 0
            for img_path in img_files:
                img = cv2.imread(str(img_path))
                if img is None:
                    continue
                feat = _extract_from_image(img, hands)
                if feat is None:
                    continue
                X_list.append(feat)
                y_list.append(class_idx)
                extracted += 1

            log.info(
                "Class %2d (%6s): %d / %d extracted",
                class_idx, label, extracted, len(img_files),
            )

    if not X_list:
        log.error("No features extracted — check database/data/ path and MediaPipe install.")
        return

    X = np.stack(X_list, axis=0).astype(np.float32)   # (N, 63)
    y = np.array(y_list, dtype=np.int32)               # (N,)

    np.savez_compressed(str(_OUT_NPZ), X=X, y=y)
    with open(_OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(_CLASS_MAP, f, indent=2)

    log.info(
        "Dataset saved → %s  |  X: %s  y: %s  |  classes: %d",
        _OUT_NPZ, X.shape, y.shape, len(_CLASS_MAP),
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Extract ASL letter features from image dataset")
    parser.add_argument("--max", type=int, default=MAX_PER_CLASS,
                        help=f"Max images per class (default {MAX_PER_CLASS})")
    args = parser.parse_args()
    build_dataset(max_per_class=args.max)
