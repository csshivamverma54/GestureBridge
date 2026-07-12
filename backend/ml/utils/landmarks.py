"""
landmarks.py
------------
MediaPipe Holistic landmark extraction for ASL recognition.

Extracts 5 feature groups per frame and concatenates them into a single
flat vector:

  ┌─────────────────────────────────────────────────────────────────────┐
  │  Feature group          Dims  Description                           │
  ├─────────────────────────────────────────────────────────────────────┤
  │  Left hand landmarks     63   21 × (x,y,z), wrist-normalised        │
  │  Right hand landmarks    63   21 × (x,y,z), wrist-normalised        │
  │  Pose landmarks          36   12 upper-body joints × (x,y,z),       │
  │                               shoulder-width normalised             │
  │  Face landmarks          30   10 lip/chin/jaw points × (x,y,z),     │
  │                               nose-bridge anchored + scale          │
  │  Velocity (dominant)      3   Δ(x,y,z) of dominant wrist vs prev   │
  │  Interaction distances    2   dist(fingertips→lips), dist(fing→palm)│
  ├─────────────────────────────────────────────────────────────────────┤
  │  TOTAL                  197                                         │
  └─────────────────────────────────────────────────────────────────────┘

Why each group matters for ASL:
  HANDS  — shape, finger extension, orientation — the primary articulator.
  POSE   — shoulder/elbow/wrist macro-movement captures the arc of a sign
           and eliminates camera-distance artefacts via shoulder-width
           normalisation.
  FACE   — lip boundary + chin position for spatial referencing:
           signs like "good", "thank you" approach the lips; "mother"/"father"
           approach the chin — the face coords resolve that ambiguity.
  VELOCITY — Δwrist encodes signing *speed and direction* of motion.
             Signs with the same final shape but different movement
             trajectories (e.g. "want" vs. "need") are disambiguated.
  INTERACTION DISTANCES — explicit proximity features:
    • fingertip→lips  : distinguishes contact signs (kiss, eat, drink)
                        from non-contact signs.
    • fingertip→palm  : captures two-hand interaction (clap, help, open).

NORMALIZATION STRATEGY:
  • Each hand: translate wrist → origin; scale by max |coord| → [-1, 1].
  • Pose: translate shoulder-midpoint → origin; scale by shoulder width.
  • Face: translate nose bridge → origin; scale by face bounding-box size.
  • Velocity: not further normalised (already in normalised wrist coords).
  • Interaction distances: normalised by shoulder width.

All six groups are combined in extract_sequence_from_video() which uses
mp.solutions.holistic to get all landmarks in a single MediaPipe inference
pass — efficient and consistent.
"""

import numpy as np
import cv2
from pathlib import Path

# ------------------------------------------------------------------
# Constants — exported for all downstream modules
# ------------------------------------------------------------------
NUM_HAND_LANDMARKS   = 21
COORDS               = 3
SINGLE_HAND_SIZE     = NUM_HAND_LANDMARKS * COORDS   # 63
NUM_HANDS            = 2
HANDS_SIZE           = SINGLE_HAND_SIZE * NUM_HANDS  # 126

# 12 upper-body pose joints used (see _POSE_INDICES below)
_POSE_INDICES = [
    11, 12,   # left shoulder, right shoulder
    13, 14,   # left elbow,    right elbow
    15, 16,   # left wrist,    right wrist
    23, 24,   # left hip,      right hip
    # elbow and hip included for forearm-arc tracking
]
# Add nose (0) and two eye corners for face-relative context
_POSE_EXTRA_INDICES = []   # kept separate for clarity; all merged below
POSE_JOINTS   = len(_POSE_INDICES)   # 8  → 24 dims
POSE_SIZE     = POSE_JOINTS * COORDS  # 24

# 10 face landmarks: 4 lip corners + 2 upper lip + 2 lower lip + chin + nose
_FACE_INDICES = [
    0,     # nose tip  (anchor)
    13, 14,  # upper lip top & bottom  (inner lip)
    17, 0,   # lower lip + reuse nose (chin area covered by MediaPipe face mesh)
    61, 291, # left/right lip corners
    199,   # chin (approx — face mesh landmark 199 is chin)
    10, 152, # forehead & menton  (bounding box for scale)
]
# Deduplicate while preserving order
_seen = set()
_FACE_UNIQUE = []
for _i in _FACE_INDICES:
    if _i not in _seen:
        _FACE_UNIQUE.append(_i)
        _seen.add(_i)
FACE_POINTS   = len(_FACE_UNIQUE)   # 9 unique
FACE_SIZE     = FACE_POINTS * COORDS  # 27

VELOCITY_SIZE    = COORDS            # 3  (Δx, Δy, Δz dominant wrist)
INTERACTION_SIZE = 2                 # fingertips→lips dist + fingertips→palm dist

# ── Grand total ─────────────────────────────────────────────────────
LANDMARK_VECTOR_SIZE = (
    HANDS_SIZE + POSE_SIZE + FACE_SIZE + VELOCITY_SIZE + INTERACTION_SIZE
)
# = 126 + 24 + 27 + 3 + 2 = 182

# Re-export the alias the rest of the codebase uses
__all__ = [
    "LANDMARK_VECTOR_SIZE",
    "SINGLE_HAND_SIZE",
    "build_hands_solution",
    "extract_landmarks_from_frame",
    "extract_sequence_from_video",
]


# ------------------------------------------------------------------
# Holistic solution builder
# ------------------------------------------------------------------
def build_hands_solution(
    static_image_mode: bool = False,
    max_num_hands: int = 2,             # kept for API compat — unused by holistic
    min_detection_confidence: float = 0.5,
    min_tracking_confidence: float = 0.5,
):
    """
    Create and return a MediaPipe Holistic solution object.

    Despite the name (kept for drop-in compatibility with existing callers)
    this now returns mp.solutions.holistic.Holistic, which provides hands,
    pose AND face landmarks in a single inference pass.

    Parameters mirror the old build_hands_solution() signature so that
    preprocess_dataset.py does not need to be changed.
    """
    import mediapipe as mp
    return mp.solutions.holistic.Holistic(
        static_image_mode=static_image_mode,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=min_detection_confidence,
        min_tracking_confidence=min_tracking_confidence,
    )


# ------------------------------------------------------------------
# Per-hand normalisation
# ------------------------------------------------------------------
def _normalize_hand(coords: np.ndarray) -> np.ndarray:
    """
    Normalise a (21, 3) hand array relative to its own wrist.
      1. Translate: wrist (index 0) → origin.
      2. Scale: divide by max |coord| → all values in [-1, 1].
    Returns flat (63,).
    """
    coords = coords - coords[0]
    scale = np.max(np.abs(coords))
    if scale > 1e-8:
        coords /= scale
    return coords.flatten().astype(np.float32)


# ------------------------------------------------------------------
# Pose normalisation
# ------------------------------------------------------------------
def _extract_pose(pose_landmarks) -> np.ndarray:
    """
    Extract and normalise 8 upper-body pose joints → (24,).

    Normalisation:
      • Origin  = shoulder midpoint ((L_shoulder + R_shoulder) / 2)
      • Scale   = shoulder width     |L_shoulder - R_shoulder|
    This makes the representation independent of the signer's distance
    from the camera and their position in the frame.
    """
    out = np.zeros(POSE_SIZE, dtype=np.float32)
    if pose_landmarks is None:
        return out

    lms = pose_landmarks.landmark
    try:
        ls = np.array([lms[11].x, lms[11].y, lms[11].z], dtype=np.float32)
        rs = np.array([lms[12].x, lms[12].y, lms[12].z], dtype=np.float32)
    except IndexError:
        return out

    origin = (ls + rs) / 2.0
    scale  = float(np.linalg.norm(rs - ls))
    if scale < 1e-8:
        scale = 1.0

    coords = []
    for idx in _POSE_INDICES:
        try:
            lm = lms[idx]
            coords.append([(lm.x - origin[0]) / scale,
                           (lm.y - origin[1]) / scale,
                           (lm.z - origin[2]) / scale])
        except IndexError:
            coords.append([0.0, 0.0, 0.0])

    return np.array(coords, dtype=np.float32).flatten()   # (24,)


# ------------------------------------------------------------------
# Face normalisation
# ------------------------------------------------------------------
def _extract_face(face_landmarks) -> np.ndarray:
    """
    Extract and normalise 9 face landmarks (lip corners + chin + nose) → (27,).

    Normalisation:
      • Origin = nose bridge (landmark 0)
      • Scale  = distance from forehead (lm 10) to chin (lm 152)
                 ≈ face bounding-box height
    This provides a reference frame that is invariant to head position
    and distance.  Facial landmarks near the lips and chin serve as a
    spatial target for signs like "good", "thank you", "mother", "father".
    """
    out = np.zeros(FACE_SIZE, dtype=np.float32)
    if face_landmarks is None:
        return out

    lms = face_landmarks.landmark
    try:
        nose   = np.array([lms[0].x,   lms[0].y,   lms[0].z],   dtype=np.float32)
        top    = np.array([lms[10].x,  lms[10].y,  lms[10].z],  dtype=np.float32)
        bottom = np.array([lms[152].x, lms[152].y, lms[152].z], dtype=np.float32)
    except IndexError:
        return out

    origin = nose
    scale  = float(np.linalg.norm(bottom - top))
    if scale < 1e-8:
        scale = 1.0

    coords = []
    for idx in _FACE_UNIQUE:
        try:
            lm = lms[idx]
            coords.append([(lm.x - origin[0]) / scale,
                           (lm.y - origin[1]) / scale,
                           (lm.z - origin[2]) / scale])
        except IndexError:
            coords.append([0.0, 0.0, 0.0])

    return np.array(coords, dtype=np.float32).flatten()   # (27,)


# ------------------------------------------------------------------
# Interaction distance features
# ------------------------------------------------------------------
def _interaction_features(
    left_lms,
    right_lms,
    face_lms,
    pose_lms,
    shoulder_scale: float,
) -> np.ndarray:
    """
    Compute 2 interaction distance scalars (normalised by shoulder width):

      dist[0] = mean distance of dominant-hand fingertips to lips centre
      dist[1] = distance of dominant-hand fingertips to non-dominant palm

    These are "contact boundary" features: they spike near zero when a
    hand touches the lips (eat, drink, good, thank-you) or when two hands
    interact (help, open, clap).  They provide explicit proximity signals
    that the LSTM would otherwise have to infer from raw coordinates.

    Returns np.ndarray (2,) float32.  All zeros if landmarks unavailable.
    """
    if shoulder_scale < 1e-8:
        shoulder_scale = 1.0

    # ── Determine dominant (right) and non-dominant (left) hand ──────
    # In WLASL most signers are right-handed; we use right as dominant.
    dominant_lms  = right_lms   # may be None
    nondominant_lms = left_lms  # may be None

    # Fingertip landmark indices (MediaPipe hand): 4,8,12,16,20
    FINGERTIP_IDX = [4, 8, 12, 16, 20]

    # ── Dominant fingertips ───────────────────────────────────────────
    dom_tips = np.zeros((5, 3), dtype=np.float32)
    if dominant_lms is not None:
        lms = dominant_lms.landmark
        for i, idx in enumerate(FINGERTIP_IDX):
            try:
                dom_tips[i] = [lms[idx].x, lms[idx].y, lms[idx].z]
            except IndexError:
                pass
    dom_center = dom_tips.mean(axis=0)   # (3,)

    # ── Lips centre (face landmark 13 = upper inner lip) ─────────────
    lips_center = np.zeros(3, dtype=np.float32)
    if face_lms is not None:
        try:
            lm = face_lms.landmark[13]
            lips_center = np.array([lm.x, lm.y, lm.z], dtype=np.float32)
        except IndexError:
            pass

    dist_to_lips = float(np.linalg.norm(dom_center - lips_center)) / shoulder_scale

    # ── Non-dominant palm centre (landmark 9 = middle finger MCP) ────
    palm_center = np.zeros(3, dtype=np.float32)
    if nondominant_lms is not None:
        try:
            lm = nondominant_lms.landmark[9]
            palm_center = np.array([lm.x, lm.y, lm.z], dtype=np.float32)
        except IndexError:
            pass

    dist_to_palm = float(np.linalg.norm(dom_center - palm_center)) / shoulder_scale

    return np.array([dist_to_lips, dist_to_palm], dtype=np.float32)


# ------------------------------------------------------------------
# Per-frame extraction (public, used by predictor for live inference)
# ------------------------------------------------------------------
def extract_landmarks_from_frame(
    frame_bgr: np.ndarray,
    hands_solution,
    prev_dominant_wrist: np.ndarray = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Run the Holistic model on a single BGR frame.

    Parameters
    ----------
    frame_bgr          : np.ndarray (H, W, 3) BGR
    hands_solution     : mp.solutions.holistic.Holistic instance
    prev_dominant_wrist: np.ndarray (3,) or None — previous frame's
                         normalised dominant wrist position (for velocity)

    Returns
    -------
    vec  : np.ndarray (LANDMARK_VECTOR_SIZE,) float32 — full feature vector
    dominant_wrist : np.ndarray (3,) — current dominant (right) wrist in
                     normalised hand coords (for velocity on next frame)
    """
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    frame_rgb.flags.writeable = False
    result = hands_solution.process(frame_rgb)

    # ── Hands (126) ──────────────────────────────────────────────────
    left_hand  = np.zeros(SINGLE_HAND_SIZE, dtype=np.float32)
    right_hand = np.zeros(SINGLE_HAND_SIZE, dtype=np.float32)

    if result.left_hand_landmarks:
        coords = np.array(
            [[lm.x, lm.y, lm.z] for lm in result.left_hand_landmarks.landmark],
            dtype=np.float32,
        )
        left_hand = _normalize_hand(coords)

    if result.right_hand_landmarks:
        coords = np.array(
            [[lm.x, lm.y, lm.z] for lm in result.right_hand_landmarks.landmark],
            dtype=np.float32,
        )
        right_hand = _normalize_hand(coords)

    # Dominant wrist in *normalised hand space* (for velocity)
    # right_hand[0:3] is wrist (landmark 0) after normalisation = always (0,0,0)
    # So use RAW wrist position from pose instead (more stable across frames)
    dominant_wrist = np.zeros(3, dtype=np.float32)
    if result.pose_landmarks:
        try:
            pw = result.pose_landmarks.landmark[16]   # right wrist
            dominant_wrist = np.array([pw.x, pw.y, pw.z], dtype=np.float32)
        except IndexError:
            pass

    # ── Velocity (3) ─────────────────────────────────────────────────
    if prev_dominant_wrist is not None:
        velocity = dominant_wrist - prev_dominant_wrist
    else:
        velocity = np.zeros(VELOCITY_SIZE, dtype=np.float32)

    # ── Pose (24) ────────────────────────────────────────────────────
    pose_vec = _extract_pose(result.pose_landmarks)

    # ── Face (27) ────────────────────────────────────────────────────
    face_vec = _extract_face(result.face_landmarks)

    # ── Shoulder scale (for interaction dist normalisation) ───────────
    shoulder_scale = 1.0
    if result.pose_landmarks:
        try:
            lms = result.pose_landmarks.landmark
            ls = np.array([lms[11].x, lms[11].y, lms[11].z], dtype=np.float32)
            rs = np.array([lms[12].x, lms[12].y, lms[12].z], dtype=np.float32)
            shoulder_scale = float(np.linalg.norm(rs - ls)) or 1.0
        except IndexError:
            pass

    # ── Interaction distances (2) ─────────────────────────────────────
    interact_vec = _interaction_features(
        result.left_hand_landmarks,
        result.right_hand_landmarks,
        result.face_landmarks,
        result.pose_landmarks,
        shoulder_scale,
    )

    # ── Concatenate all groups ────────────────────────────────────────
    vec = np.concatenate([
        left_hand,    # 63
        right_hand,   # 63
        pose_vec,     # 24
        face_vec,     # 27
        velocity,     #  3
        interact_vec, #  2
    ])  # total: 182

    assert len(vec) == LANDMARK_VECTOR_SIZE, \
        f"Feature vector length {len(vec)} != expected {LANDMARK_VECTOR_SIZE}"

    return vec.astype(np.float32), dominant_wrist


# ------------------------------------------------------------------
# Video-level extraction
# ------------------------------------------------------------------
def extract_sequence_from_video(
    video_path: str,
    sequence_length: int = 30,
    hands_solution=None,
) -> np.ndarray:
    """
    Extract a fixed-length multi-modal landmark sequence from a video.

    Returns
    -------
    np.ndarray shape (sequence_length, LANDMARK_VECTOR_SIZE=182), float32
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return np.zeros((sequence_length, LANDMARK_VECTOR_SIZE), dtype=np.float32)

    total_frames = max(int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), 1)
    sample_indices = np.linspace(0, total_frames - 1, sequence_length, dtype=int)

    own_solution = hands_solution is None
    if own_solution:
        hands_solution = build_hands_solution(static_image_mode=True)

    sequence   = np.zeros((sequence_length, LANDMARK_VECTOR_SIZE), dtype=np.float32)
    last_valid = np.zeros(LANDMARK_VECTOR_SIZE, dtype=np.float32)
    prev_wrist = None    # for velocity computation

    try:
        for out_idx, frame_idx in enumerate(sample_indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, float(frame_idx))
            ret, frame = cap.read()
            if not ret or frame is None:
                sequence[out_idx] = last_valid
                continue

            vec, prev_wrist = extract_landmarks_from_frame(
                frame, hands_solution, prev_wrist
            )

            if np.any(vec != 0):
                last_valid = vec

            sequence[out_idx] = vec if np.any(vec != 0) else last_valid
    finally:
        cap.release()
        if own_solution:
            hands_solution.close()

    return sequence   # (sequence_length, 182)


# ------------------------------------------------------------------
# Legacy compat — old callers used extract_landmarks_from_result
# ------------------------------------------------------------------
def extract_landmarks_from_result(result) -> np.ndarray:
    """
    Legacy wrapper kept so old code that calls this directly doesn't break.
    Returns zeros — callers should migrate to extract_landmarks_from_frame().
    """
    return np.zeros(LANDMARK_VECTOR_SIZE, dtype=np.float32)
