"""
landmarks.py
------------
MediaPipe-based hand landmark extraction using the Tasks API
(mediapipe >= 0.10.9 with any protobuf version).

The old mp.solutions.hands API was removed in mediapipe 0.10.14+.
This module uses mp.tasks.python.vision.HandLandmarker instead.

Responsibilities:
  - Load the hand_landmarker.task model once.
  - Extract 21 hand landmarks (x, y, z) for BOTH hands per frame.
    → flat vector of 126 floats (left-hand 63 + right-hand 63).
  - Missing hand slots are filled with a zero vector.
  - Normalize each hand's landmarks relative to its own wrist
    (translation + scale invariant), then identify left vs right
    from the MediaPipe handedness label so the concatenation order
    is always deterministic: [left_hand(63) | right_hand(63)].

This module is imported by both the offline preprocessing pipeline
(ml/preprocess_dataset.py) and the live inference module (ml/predictor.py).
"""

import numpy as np
import cv2
from pathlib import Path

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------
NUM_LANDMARKS = 21
COORDS_PER_LANDMARK = 3
SINGLE_HAND_SIZE = NUM_LANDMARKS * COORDS_PER_LANDMARK  # 63
NUM_HANDS = 2
LANDMARK_VECTOR_SIZE = SINGLE_HAND_SIZE * NUM_HANDS      # 126

# Path to the bundled .task model file (next to this package)
_ML_DIR = Path(__file__).resolve().parent.parent   # backend/ml/
_MODEL_PATH = _ML_DIR / "hand_landmarker.task"


# ------------------------------------------------------------------
# Lazy-import mediapipe tasks (avoids top-level import at module load)
# ------------------------------------------------------------------
def _get_landmarker_class():
    from mediapipe.tasks import python as _mp_tasks
    from mediapipe.tasks.python import vision as _mp_vision
    from mediapipe.tasks.python.core import base_options as _base_options
    return _mp_tasks, _mp_vision, _base_options


# ------------------------------------------------------------------
# Build a HandLandmarker instance (replaces build_hands_solution)
# ------------------------------------------------------------------
def build_hands_solution(
    static_image_mode: bool = True,   # kept for API compatibility
    max_num_hands: int = 2,           # default is now 2 for both hands
    min_detection_confidence: float = 0.5,
    min_tracking_confidence: float = 0.5,
):
    """
    Create and return a MediaPipe HandLandmarker (Tasks API) configured
    to detect up to `max_num_hands` hands (default 2).

    The returned object has a .close() method and a .detect() method,
    wrapped below so callers don't need to know the API details.

    Parameters match the old solutions.Hands() signature for drop-in
    compatibility with existing code.
    """
    if not _MODEL_PATH.exists():
        raise FileNotFoundError(
            f"hand_landmarker.task not found at {_MODEL_PATH}.\n"
            "Download it with:\n"
            "  curl -L -o backend/ml/hand_landmarker.task "
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
            "hand_landmarker/float16/1/hand_landmarker.task"
        )

    _mp_tasks, _mp_vision, _base_options = _get_landmarker_class()

    base_opts = _base_options.BaseOptions(model_asset_path=str(_MODEL_PATH))
    options = _mp_vision.HandLandmarkerOptions(
        base_options=base_opts,
        running_mode=_mp_vision.RunningMode.IMAGE,
        num_hands=max_num_hands,
        min_hand_detection_confidence=min_detection_confidence,
        min_hand_presence_confidence=min_detection_confidence,
        min_tracking_confidence=min_tracking_confidence,
    )
    return _mp_vision.HandLandmarker.create_from_options(options)


# ------------------------------------------------------------------
# Core extraction helpers
# ------------------------------------------------------------------
def _normalize_hand(coords: np.ndarray) -> np.ndarray:
    """
    Normalize a (21, 3) hand coordinate array:
      1. Translate: subtract wrist (landmark 0) so it becomes the origin.
      2. Scale: divide by max absolute value → all values in [-1, 1].
    Returns a flat (63,) vector.
    """
    coords = coords - coords[0]
    max_val = np.max(np.abs(coords))
    if max_val > 0:
        coords /= max_val
    return coords.flatten()  # (63,)


def extract_landmarks_from_result(result) -> np.ndarray:
    """
    Convert a HandLandmarker detection result into a normalized flat vector
    for BOTH hands concatenated as [left_hand(63) | right_hand(63)].

    • If only one hand is detected the other slot is zeros.
    • If no hands are detected the full 126-dim vector is zeros.
    • Handedness labels from MediaPipe are used to assign left vs. right
      correctly regardless of detection order.

    Returns np.ndarray of shape (126,), dtype float32.
    """
    left  = np.zeros(SINGLE_HAND_SIZE, dtype=np.float32)
    right = np.zeros(SINGLE_HAND_SIZE, dtype=np.float32)

    if result.hand_landmarks and result.handedness:
        for hand_lms, handedness_list in zip(
            result.hand_landmarks, result.handedness
        ):
            # handedness_list is a list of Category objects;
            # the dominant label is the first entry.
            label = handedness_list[0].category_name.lower()  # "left" or "right"
            coords = np.array(
                [[lm.x, lm.y, lm.z] for lm in hand_lms],
                dtype=np.float32,
            )  # (21, 3)
            normalized = _normalize_hand(coords)  # (63,)
            if label == "left":
                left = normalized
            else:
                right = normalized

    return np.concatenate([left, right])  # (126,)


def extract_landmarks_from_frame(frame_bgr: np.ndarray, hands_solution) -> np.ndarray:
    """
    Run the HandLandmarker on a single BGR frame and return the
    two-hand landmark vector of shape (126,).

    Parameters
    ----------
    frame_bgr : np.ndarray
        Raw BGR frame as returned by cv2.VideoCapture.read().
    hands_solution : HandLandmarker
        An already-initialised HandLandmarker instance (reuse across frames).

    Returns
    -------
    np.ndarray of shape (126,), dtype float32.
    """
    from mediapipe import Image, ImageFormat

    # Convert BGR → RGB, wrap in mp.Image
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = Image(image_format=ImageFormat.SRGB, data=frame_rgb)

    result = hands_solution.detect(mp_image)
    return extract_landmarks_from_result(result)


# ------------------------------------------------------------------
# Video-level extraction (unchanged public interface)
# ------------------------------------------------------------------
def extract_sequence_from_video(
    video_path: str,
    sequence_length: int = 30,
    hands_solution=None,
) -> np.ndarray:
    """
    Extract a fixed-length landmark sequence from a video file.

    Strategy:
      1. Open video with OpenCV.
      2. Sample `sequence_length` frames uniformly across the video.
      3. Run HandLandmarker on each sampled frame (detects up to 2 hands).
      4. If a frame has no detection, carry forward the last valid landmark
         vector (or leave as zeros at the start).

    Parameters
    ----------
    video_path     : str — path to the video file.
    sequence_length: int — number of frames in the output sequence (default 30).
    hands_solution : HandLandmarker or None — if None, a temporary one is created.

    Returns
    -------
    np.ndarray of shape (sequence_length, 126), dtype float32.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return np.zeros((sequence_length, LANDMARK_VECTOR_SIZE), dtype=np.float32)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    total_frames = max(total_frames, 1)

    sample_indices = np.linspace(0, total_frames - 1, sequence_length, dtype=int)

    own_solution = hands_solution is None
    if own_solution:
        hands_solution = build_hands_solution(static_image_mode=True, max_num_hands=2)

    sequence  = np.zeros((sequence_length, LANDMARK_VECTOR_SIZE), dtype=np.float32)
    last_valid = np.zeros(LANDMARK_VECTOR_SIZE, dtype=np.float32)

    try:
        for out_idx, frame_idx in enumerate(sample_indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, float(frame_idx))
            ret, frame = cap.read()
            if not ret or frame is None:
                sequence[out_idx] = last_valid
                continue

            vec = extract_landmarks_from_frame(frame, hands_solution)

            if np.any(vec != 0):
                last_valid = vec

            sequence[out_idx] = vec if np.any(vec != 0) else last_valid
    finally:
        cap.release()
        if own_solution:
            hands_solution.close()

    return sequence  # (30, 126)
