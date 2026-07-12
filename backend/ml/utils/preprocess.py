"""
preprocess.py  (ml/utils/preprocess.py)
----------------------------------------
Shared preprocessing helpers used by both the offline training pipeline
and the live inference module.

This file REPLACES the original stub that only resized raw pixel frames.
The project now works on MediaPipe landmark sequences, not raw images.

Functions kept / added:
  - normalize_sequence()   : normalise a (T, 63) landmark array in place.
  - pad_or_truncate()      : enforce a fixed sequence length.
  - preprocess_landmark_sequence() : single entry-point for inference.

The original preprocess_frame() is preserved (renamed with a deprecation
note) so that any code that imported it does not hard-crash immediately.
"""

import numpy as np
import cv2


# ------------------------------------------------------------------
# Constants (mirror ml/utils/landmarks.py to avoid circular imports)
# ------------------------------------------------------------------
SEQUENCE_LENGTH = 30
LANDMARK_VECTOR_SIZE = 126   # 21 landmarks × 3 coords × 2 hands


# ------------------------------------------------------------------
# Sequence-level helpers (used in training and inference)
# ------------------------------------------------------------------
def pad_or_truncate(sequence: np.ndarray, length: int = SEQUENCE_LENGTH) -> np.ndarray:
    """
    Ensure a landmark sequence has exactly `length` frames.

    - If longer  → keep the first `length` frames.
    - If shorter → pad with zero-vectors at the end (representing
                   "no detection" frames, which the LSTM masks).

    Parameters
    ----------
    sequence : np.ndarray, shape (T, 63)
    length   : int

    Returns
    -------
    np.ndarray, shape (length, 63), dtype float32
    """
    sequence = np.array(sequence, dtype=np.float32)
    T = sequence.shape[0]

    if T >= length:
        return sequence[:length]

    pad = np.zeros((length - T, sequence.shape[1]), dtype=np.float32)
    return np.vstack([sequence, pad])


def normalize_sequence(sequence: np.ndarray) -> np.ndarray:
    """
    Return the sequence unchanged.

    landmarks.py already normalizes each frame to the wrist-relative
    coordinate system scaled to [-1, 1].  Applying a second global
    min-max rescaling *destroys inter-sample variation* — two completely
    different gestures become indistinguishable because every sequence
    is independently remapped to [0, 1].

    Dataset-level standardization (zero mean, unit std per feature) is
    applied once during training via train.py using training-set statistics,
    and those same stats are stored for inference-time use.
    """
    return np.array(sequence, dtype=np.float32)


def preprocess_landmark_sequence(
    sequence: np.ndarray,
    mean: np.ndarray = None,
    std: np.ndarray = None,
) -> np.ndarray:
    """
    Full inference-time preprocessing for a raw landmark sequence.

    Applies:
      1. pad_or_truncate         → fixed (30, 126) shape
      2. z-score standardization → (seq - mean) / std  using training-set
         statistics loaded from ml/normalizer.npz (if provided)
      3. np.expand_dims          → batch dim → (1, 30, 126)

    Parameters
    ----------
    sequence : np.ndarray, shape (T, 126)  — T may differ from 30
    mean     : np.ndarray shape (126,) or None — per-feature training mean
    std      : np.ndarray shape (126,) or None — per-feature training std

    Returns
    -------
    np.ndarray, shape (1, 30, 126), dtype float32
    """
    seq = pad_or_truncate(sequence, SEQUENCE_LENGTH)
    if mean is not None and std is not None:
        seq = (seq - mean) / (std + 1e-8)
    return np.expand_dims(seq, axis=0).astype(np.float32)   # (1, 30, 63)


# ------------------------------------------------------------------
# Legacy helper (kept for backward compatibility — do not use in new code)
# ------------------------------------------------------------------
def preprocess_frame(frame: np.ndarray) -> np.ndarray:
    """
    DEPRECATED: original pixel-based frame preprocessor.
    The project now uses MediaPipe landmark sequences.
    This function is kept so that old imports do not break immediately.
    """
    frame = cv2.resize(frame, (224, 224))
    frame = frame / 255.0
    frame = np.expand_dims(frame, axis=0)
    return frame
