"""
predictor.py  (backend/ml/predictor.py)
-----------------------------------------
Production inference module for the GestureBridge gesture classifier.

This module is imported by backend/routes/gesture.py (the /predict route).
It is the ONLY file the Flask app interacts with for ML inference.

Public API
----------
predict_gesture(landmark_sequence) → dict
    Accepts a MediaPipe landmark sequence and returns:
      - predicted_word  : str   — the top-1 predicted sign
      - confidence      : float — softmax probability of top-1 (0–1)
      - top5            : list  — top-5 [{word, confidence}] dicts

Loading strategy
----------------
The model and labels are loaded once at module import time (singleton
pattern) so the Flask app pays the load cost only on startup, not per
request.

If the model file does not exist (e.g., before training completes) the
module logs a warning and returns a graceful "model not ready" response
rather than crashing the server.

Input contract
--------------
`landmark_sequence` can be:
  - np.ndarray of shape (T, 126) — raw landmark sequence from MediaPipe
    (left-hand 63 floats + right-hand 63 floats per frame)
  - list of lists / nested Python floats — JSON-decoded body from the
    frontend webcam module (shape inferred at runtime)

The sequence does NOT need to be pre-padded; preprocess_landmark_sequence()
handles that.
"""

import json
import logging
from pathlib import Path
from typing import Union

import numpy as np
import torch
import torch.nn.functional as F

from ml.utils.preprocess import preprocess_landmark_sequence

log = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Paths (relative to backend/ — where the Flask app is launched)
# ------------------------------------------------------------------
_ML_DIR         = Path(__file__).parent           # backend/ml/
_MODEL_PATH     = _ML_DIR / "gesture_model.pt"
_LABELS_PATH    = _ML_DIR / "labels.json"
_META_PATH      = _ML_DIR / "model_meta.json"
_NORMALIZER_PATH = _ML_DIR / "normalizer.npz"

# ------------------------------------------------------------------
# Singleton model + labels (loaded once at import)
# ------------------------------------------------------------------
_model = None
_labels: dict = {}        # {int_index: word_string}
_num_classes: int = 0
_feat_mean: np.ndarray = None   # per-feature training mean (182,)
_feat_std:  np.ndarray = None   # per-feature training std  (182,)


def _load_labels(labels_path: Path) -> dict:
    """Load idx_to_label mapping from labels.json."""
    if not labels_path.exists():
        log.warning("labels.json not found at %s — predictions will return raw indices.", labels_path)
        return {}
    with open(labels_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


def _load_model(model_path: Path, meta_path: Path, num_classes: int):
    """Load the PyTorch model state dict. Returns None if file does not exist."""
    if not model_path.exists():
        log.warning(
            "Model file not found at %s. "
            "Run ml/train.py to train the model before starting the server.",
            model_path,
        )
        return None

    # Determine num_classes from meta file if available
    if num_classes == 0 and meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        num_classes = meta.get("num_classes", 0)

    if num_classes == 0:
        log.error(
            "Cannot load model: num_classes is 0. "
            "Ensure labels.json and model_meta.json are present in %s.",
            model_path.parent,
        )
        return None

    try:
        from ml.model import GestureBridgeLSTM
        model = GestureBridgeLSTM(num_classes=num_classes)
        state = torch.load(str(model_path), map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        model.eval()
        log.info("GestureBridge model loaded from %s (classes=%d)", model_path, num_classes)
        return model
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to load model: %s", exc)
        return None


def _initialize():
    """Load model and labels into module-level singletons."""
    global _model, _labels, _num_classes, _feat_mean, _feat_std
    _labels      = _load_labels(_LABELS_PATH)
    _num_classes = len(_labels)
    _model       = _load_model(_MODEL_PATH, _META_PATH, _num_classes)

    # Load normalizer stats (saved by train.py)
    if _NORMALIZER_PATH.exists():
        npz = np.load(str(_NORMALIZER_PATH))
        _feat_mean = npz["mean"]   # (63,)
        _feat_std  = npz["std"]    # (63,)
        log.info("Normalizer stats loaded from %s", _NORMALIZER_PATH)
    else:
        _feat_mean = None
        _feat_std  = None
        log.warning("normalizer.npz not found — running without standardization.")

    log.info(
        "Predictor initialized — classes: %d  model_ready: %s",
        _num_classes,
        _model is not None,
    )


# Initialize on import
_initialize()


# ------------------------------------------------------------------
# Public inference API
# ------------------------------------------------------------------
def predict_gesture(landmark_sequence: Union[np.ndarray, list]) -> dict:
    """
    Run inference on a MediaPipe landmark sequence.

    Parameters
    ----------
    landmark_sequence : np.ndarray or list
        Shape (T, 182) — T variable-length frames, each with 182 floats.
        Feature layout per frame (produced by landmarks.py):
          left_hand(63) | right_hand(63) | pose(24) | face(27)
          | velocity(3) | interaction_dist(2)

    Returns
    -------
    dict with keys:
        predicted_word : str   — top-1 predicted sign language word
        confidence     : float — softmax probability for top-1 (0–1)
        top5           : list  — [{"word": str, "confidence": float}, …]
                                  sorted highest → lowest (up to 5)
    """
    if _model is None:
        return {
            "predicted_word": "model_not_ready",
            "confidence": 0.0,
            "top5": [],
            "error": "Model not loaded. Please train the model first.",
        }

    # ── Coerce input to numpy ──────────────────────────────────────
    if not isinstance(landmark_sequence, np.ndarray):
        landmark_sequence = np.array(landmark_sequence, dtype=np.float32)

    if landmark_sequence.ndim == 1:
        # Single flat vector: reshape to (1, 63) — treated as a 1-frame sequence
        landmark_sequence = landmark_sequence.reshape(1, -1)

    # ── Preprocess: pad/truncate + z-score standardize → (1, 30, 182) ─
    X = preprocess_landmark_sequence(landmark_sequence, mean=_feat_mean, std=_feat_std)

    # ── Inference ──────────────────────────────────────────────────
    tensor = torch.from_numpy(X.astype(np.float32))       # (1, 30, 182)
    with torch.no_grad():
        logits = _model(tensor)                            # (1, num_classes)
        probs  = F.softmax(logits, dim=-1)[0].numpy()     # (num_classes,)

    top1_idx  = int(np.argmax(probs))
    top1_conf = float(probs[top1_idx])
    top1_word = _labels.get(top1_idx, f"class_{top1_idx}")

    # Top-5 (or all classes if fewer than 5)
    k = min(5, len(probs))
    top_k_indices = np.argsort(probs)[-k:][::-1]
    top5 = [
        {
            "word": _labels.get(int(idx), f"class_{idx}"),
            "confidence": round(float(probs[idx]), 4),
        }
        for idx in top_k_indices
    ]

    return {
        "predicted_word": top1_word,
        "confidence": round(top1_conf, 4),
        "top5": top5,
    }


def reload_model():
    """
    Hot-reload the model and labels from disk.

    Useful after retraining without restarting the Flask server.
    Can be called from an admin endpoint or a management CLI.
    """
    log.info("Reloading model and labels …")
    _initialize()
