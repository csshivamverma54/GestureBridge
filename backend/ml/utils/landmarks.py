import numpy as np
import cv2
from pathlib import Path

NUM_HAND_LANDMARKS = 21
COORDS             = 3
SINGLE_HAND_SIZE   = NUM_HAND_LANDMARKS * COORDS   # 63
NUM_HANDS          = 2
HANDS_SIZE         = SINGLE_HAND_SIZE * NUM_HANDS  # 126

_POSE_INDICES = [11, 12, 13, 14, 15, 16, 23, 24]
POSE_JOINTS   = len(_POSE_INDICES)                  # 8
POSE_SIZE     = POSE_JOINTS * COORDS                # 24

_FACE_INDICES = [0, 13, 14, 17, 61, 291, 199, 10, 152]
_seen = set(); _FACE_UNIQUE = []
for _i in _FACE_INDICES:
    if _i not in _seen: _FACE_UNIQUE.append(_i); _seen.add(_i)
FACE_POINTS   = len(_FACE_UNIQUE)                   # 9
FACE_SIZE     = FACE_POINTS * COORDS                # 27

VELOCITY_SIZE    = 3
INTERACTION_SIZE = 2

ACCEL_SIZE            = 3
NMM_SIZE              = 10
FINGER_ANGLE_SIZE     = 15
WRIST_ORIENT_SIZE     = 4
BODY_DIST_SIZE        = 4

V2_EXTRA_SIZE = ACCEL_SIZE + NMM_SIZE + FINGER_ANGLE_SIZE + WRIST_ORIENT_SIZE + BODY_DIST_SIZE  # 36

LANDMARK_VECTOR_SIZE = (
    HANDS_SIZE + POSE_SIZE + FACE_SIZE +
    VELOCITY_SIZE + INTERACTION_SIZE + V2_EXTRA_SIZE
)  # 126+24+27+3+2+36 = 218

OFF_LEFT_HAND    = 0
OFF_RIGHT_HAND   = SINGLE_HAND_SIZE
OFF_POSE         = HANDS_SIZE
OFF_FACE         = HANDS_SIZE + POSE_SIZE
OFF_VELOCITY     = HANDS_SIZE + POSE_SIZE + FACE_SIZE
OFF_INTERACT     = OFF_VELOCITY + VELOCITY_SIZE
OFF_ACCEL        = OFF_INTERACT + INTERACTION_SIZE
OFF_NMM          = OFF_ACCEL + ACCEL_SIZE
OFF_FINGER_ANG   = OFF_NMM + NMM_SIZE
OFF_WRIST_ORIENT = OFF_FINGER_ANG + FINGER_ANGLE_SIZE
OFF_BODY_DIST    = OFF_WRIST_ORIENT + WRIST_ORIENT_SIZE

__all__ = [
    "LANDMARK_VECTOR_SIZE",
    "SINGLE_HAND_SIZE",
    "HANDS_SIZE",
    "NMM_SIZE",
    "FINGER_ANGLE_SIZE",
    "V2_EXTRA_SIZE",
    "OFF_NMM",
    "build_hands_solution",
    "extract_landmarks_from_frame",
    "extract_sequence_from_video",
]


# Build a MediaPipe Holistic solution instance
def build_hands_solution(
    static_image_mode: bool = False,
    max_num_hands: int = 2,
    min_detection_confidence: float = 0.5,
    min_tracking_confidence: float = 0.5,
):
    import mediapipe as mp
    return mp.solutions.holistic.Holistic(
        static_image_mode=static_image_mode,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=min_detection_confidence,
        min_tracking_confidence=min_tracking_confidence,
    )


# Wrist-centre and scale-normalise a hand landmark array
def _normalize_hand(coords: np.ndarray) -> np.ndarray:
    coords = coords - coords[0]
    scale = np.max(np.abs(coords))
    if scale > 1e-8:
        coords /= scale
    return coords.flatten().astype(np.float32)


# Extract shoulder-normalised upper-body pose landmarks (8 joints x 3)
def _extract_pose(pose_landmarks) -> np.ndarray:
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
    scale  = float(np.linalg.norm(rs - ls)) or 1.0
    coords = []
    for idx in _POSE_INDICES:
        try:
            lm = lms[idx]
            coords.append([(lm.x - origin[0]) / scale,
                            (lm.y - origin[1]) / scale,
                            (lm.z - origin[2]) / scale])
        except IndexError:
            coords.append([0.0, 0.0, 0.0])
    return np.array(coords, dtype=np.float32).flatten()


# Extract nose-anchored face spatial landmarks (9 points x 3)
def _extract_face(face_landmarks) -> np.ndarray:
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
    scale  = float(np.linalg.norm(bottom - top)) or 1.0
    coords = []
    for idx in _FACE_UNIQUE:
        try:
            lm = lms[idx]
            coords.append([(lm.x - origin[0]) / scale,
                            (lm.y - origin[1]) / scale,
                            (lm.z - origin[2]) / scale])
        except IndexError:
            coords.append([0.0, 0.0, 0.0])
    return np.array(coords, dtype=np.float32).flatten()


# Compute fingertips-to-lips and fingertips-to-palm distances (2 values)
def _interaction_features(
    left_lms, right_lms, face_lms, pose_lms, shoulder_scale: float,
) -> np.ndarray:
    if shoulder_scale < 1e-8:
        shoulder_scale = 1.0
    dominant_lms    = right_lms
    nondominant_lms = left_lms
    FINGERTIP_IDX   = [4, 8, 12, 16, 20]

    dom_tips = np.zeros((5, 3), dtype=np.float32)
    if dominant_lms is not None:
        lms = dominant_lms.landmark
        for i, idx in enumerate(FINGERTIP_IDX):
            try:
                dom_tips[i] = [lms[idx].x, lms[idx].y, lms[idx].z]
            except IndexError:
                pass
    dom_center = dom_tips.mean(axis=0)

    lips_center = np.zeros(3, dtype=np.float32)
    if face_lms is not None:
        try:
            lm = face_lms.landmark[13]
            lips_center = np.array([lm.x, lm.y, lm.z], dtype=np.float32)
        except IndexError:
            pass
    dist_to_lips = float(np.linalg.norm(dom_center - lips_center)) / shoulder_scale

    palm_center = np.zeros(3, dtype=np.float32)
    if nondominant_lms is not None:
        try:
            lm = nondominant_lms.landmark[9]
            palm_center = np.array([lm.x, lm.y, lm.z], dtype=np.float32)
        except IndexError:
            pass
    dist_to_palm = float(np.linalg.norm(dom_center - palm_center)) / shoulder_scale

    return np.array([dist_to_lips, dist_to_palm], dtype=np.float32)


# Extract 10 non-manual marker scalars from face mesh; returns (vec, yaw, pitch, roll)
def _extract_nmm(face_landmarks, prev_head_yaw: float = 0.0,
                  prev_head_pitch: float = 0.0, prev_head_roll: float = 0.0,
                  face_scale: float = 1.0) -> tuple[np.ndarray, float, float, float]:
    out = np.zeros(NMM_SIZE, dtype=np.float32)
    if face_landmarks is None:
        return out, prev_head_yaw, prev_head_pitch, prev_head_roll

    lms = face_landmarks.landmark
    n   = len(lms)
    sc  = face_scale if face_scale > 1e-8 else 1.0

    def lm(i, default=(0, 0, 0)):
        if i < n:
            return lms[i].x, lms[i].y, lms[i].z
        return default

    brow_l_y = np.mean([lm(i)[1] for i in [70, 63, 105, 66, 107]])
    brow_r_y = np.mean([lm(i)[1] for i in [336, 296, 334, 293, 300]])
    eye_l_y  = lm(159)[1]
    eye_r_y  = lm(386)[1]
    raise_l = max(0.0, (eye_l_y - brow_l_y) / sc)
    raise_r = max(0.0, (eye_r_y - brow_r_y) / sc)
    out[0] = (raise_l + raise_r) * 0.5

    inner_l = np.array(lm(107)[:2])
    inner_r = np.array(lm(336)[:2])
    baseline_dist = np.linalg.norm(np.array(lm(33)[:2]) - np.array(lm(263)[:2]))
    brow_dist = np.linalg.norm(inner_l - inner_r)
    out[1] = float(np.clip(1.0 - brow_dist / (baseline_dist + 1e-8), 0, 1))

    nose_tip = np.array(lm(1))
    chin     = np.array(lm(152))
    forehead = np.array(lm(10))
    pitch = float(chin[1] - nose_tip[1]) / sc
    yaw   = float((chin[0] - forehead[0])) / sc
    eye_l_outer = np.array(lm(33)[:2])
    eye_r_outer = np.array(lm(263)[:2])
    roll  = float(eye_r_outer[1] - eye_l_outer[1]) / sc

    out[2] = float(pitch - prev_head_pitch)
    out[3] = float(yaw   - prev_head_yaw)
    out[4] = float(roll  - prev_head_roll)

    upper_lip = np.array(lm(13))
    lower_lip = np.array(lm(14))
    out[5] = float(abs(lower_lip[1] - upper_lip[1]) / sc)

    left_corner  = np.array(lm(61)[:2])
    right_corner = np.array(lm(291)[:2])
    face_w = np.linalg.norm(np.array(lm(234)[:2]) - np.array(lm(454)[:2]))
    out[6] = float(np.linalg.norm(left_corner - right_corner) / (face_w + 1e-8))

    lip_z = (lm(61)[2] + lm(291)[2] + lm(13)[2] + lm(14)[2]) * 0.25
    nose_z = lm(1)[2]
    out[7] = float(lip_z - nose_z)

    if n > 454:
        cheek_l = np.array(lm(234)[:2])
        cheek_r = np.array(lm(454)[:2])
        out[8] = float(np.linalg.norm(cheek_l - cheek_r) / sc)

    out[9] = float(raise_l - raise_r)

    return out, yaw, pitch, roll


_FINGER_TRIPLETS = [
    (0, 1, 2),   (1, 2, 3),   (2, 3, 4),
    (0, 5, 6),   (5, 6, 7),   (6, 7, 8),
    (0, 9, 10),  (9, 10, 11), (10, 11, 12),
    (0, 13, 14), (13, 14, 15),(14, 15, 16),
    (0, 17, 18), (17, 18, 19),(18, 19, 20),
]


# Angle at vertex b in the a-b-c triplet, in [0,  -]
def _joint_angle(a, b, c) -> float:
    ba = a - b
    bc = c - b
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-8 or norm_bc < 1e-8:
        return 0.0
    cos_angle = np.dot(ba, bc) / (norm_ba * norm_bc)
    return float(np.arccos(np.clip(cos_angle, -1.0, 1.0)))


# Return 15 joint angles (in radians) for the given hand
def _extract_finger_angles(hand_landmarks) -> np.ndarray:
    out = np.zeros(FINGER_ANGLE_SIZE, dtype=np.float32)
    if hand_landmarks is None:
        return out
    lms = hand_landmarks.landmark
    pts = np.array([[lm.x, lm.y, lm.z] for lm in lms], dtype=np.float32)
    for i, (a_idx, b_idx, c_idx) in enumerate(_FINGER_TRIPLETS):
        out[i] = _joint_angle(pts[a_idx], pts[b_idx], pts[c_idx])
    return out


# Derive an approximate (w,x,y,z) orientation quaternion from the hand plane
def _extract_wrist_orientation(hand_landmarks) -> np.ndarray:
    out = np.array([1., 0., 0., 0.], dtype=np.float32)
    if hand_landmarks is None:
        return out
    lms = hand_landmarks.landmark
    wrist  = np.array([lms[0].x,  lms[0].y,  lms[0].z],  dtype=np.float32)
    mid    = np.array([lms[9].x,  lms[9].y,  lms[9].z],  dtype=np.float32)
    pinky  = np.array([lms[17].x, lms[17].y, lms[17].z], dtype=np.float32)
    index  = np.array([lms[5].x,  lms[5].y,  lms[5].z],  dtype=np.float32)

    fwd = mid   - wrist; fwd /= (np.linalg.norm(fwd)   + 1e-8)
    rgt = index - pinky; rgt /= (np.linalg.norm(rgt)   + 1e-8)
    up  = np.cross(fwd, rgt); up /= (np.linalg.norm(up) + 1e-8)
    rgt = np.cross(up, fwd)

    R = np.array([rgt, up, fwd], dtype=np.float32).T
    trace = R[0, 0] + R[1, 1] + R[2, 2]
    if trace > 0:
        s = 0.5 / np.sqrt(trace + 1.0)
        w = 0.25 / s
        x = (R[2, 1] - R[1, 2]) * s
        y = (R[0, 2] - R[2, 0]) * s
        z = (R[1, 0] - R[0, 1]) * s
    else:
        if R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
            s = 2.0 * np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2])
            w = (R[2, 1] - R[1, 2]) / s; x = 0.25 * s
            y = (R[0, 1] + R[1, 0]) / s; z = (R[0, 2] + R[2, 0]) / s
        elif R[1, 1] > R[2, 2]:
            s = 2.0 * np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2])
            w = (R[0, 2] - R[2, 0]) / s; x = (R[0, 1] + R[1, 0]) / s
            y = 0.25 * s; z = (R[1, 2] + R[2, 1]) / s
        else:
            s = 2.0 * np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1])
            w = (R[1, 0] - R[0, 1]) / s; x = (R[0, 2] + R[2, 0]) / s
            y = (R[1, 2] + R[2, 1]) / s; z = 0.25 * s
    q = np.array([w, x, y, z], dtype=np.float32)
    norm = np.linalg.norm(q)
    return q / norm if norm > 1e-8 else out


# Compute 4 body-distance scalars from dominant fingertips to chin/chest/abdomen/palm
def _body_distance_features(
    dominant_lms, base_lms, face_lms, pose_lms, shoulder_scale: float
) -> np.ndarray:
    out = np.zeros(BODY_DIST_SIZE, dtype=np.float32)
    sc  = shoulder_scale if shoulder_scale > 1e-8 else 1.0
    FINGERTIP_IDX = [4, 8, 12, 16, 20]

    dom_ft = np.zeros(3, dtype=np.float32)
    dom_wr = np.zeros(3, dtype=np.float32)
    if dominant_lms is not None:
        lms = dominant_lms.landmark
        tips = np.array([[lms[i].x, lms[i].y, lms[i].z] for i in FINGERTIP_IDX], dtype=np.float32)
        dom_ft = tips.mean(axis=0)
        dom_wr = np.array([lms[0].x, lms[0].y, lms[0].z], dtype=np.float32)

    if face_lms is not None and len(face_lms.landmark) > 152:
        chin = np.array([face_lms.landmark[152].x,
                          face_lms.landmark[152].y,
                          face_lms.landmark[152].z], dtype=np.float32)
        out[0] = float(np.linalg.norm(dom_ft - chin)) / sc

    if pose_lms is not None:
        lms = pose_lms.landmark
        try:
            chest = np.array([(lms[11].x + lms[12].x) * 0.5,
                               (lms[11].y + lms[12].y) * 0.5,
                               (lms[11].z + lms[12].z) * 0.5], dtype=np.float32)
            out[1] = float(np.linalg.norm(dom_ft - chest)) / sc
        except IndexError:
            pass
        try:
            abdomen = np.array([(lms[23].x + lms[24].x) * 0.5,
                                  (lms[23].y + lms[24].y) * 0.5,
                                  (lms[23].z + lms[24].z) * 0.5], dtype=np.float32)
            out[2] = float(np.linalg.norm(dom_ft - abdomen)) / sc
        except IndexError:
            pass

    if base_lms is not None:
        try:
            palm = np.array([base_lms.landmark[9].x,
                              base_lms.landmark[9].y,
                              base_lms.landmark[9].z], dtype=np.float32)
            out[3] = float(np.linalg.norm(dom_wr - palm)) / sc
        except IndexError:
            pass

    return out


# Run the Holistic model on a single BGR frame; returns (vec218, wrist, velocity, head_state)
def extract_landmarks_from_frame(
    frame_bgr: np.ndarray,
    hands_solution,
    prev_dominant_wrist: np.ndarray = None,
    prev_velocity: np.ndarray = None,
    prev_head_state: tuple = (0.0, 0.0, 0.0),
    dominant_is_right: bool = True,
) -> tuple:
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    frame_rgb.flags.writeable = False
    result = hands_solution.process(frame_rgb)

    if dominant_is_right:
        dom_lms  = result.right_hand_landmarks
        base_lms = result.left_hand_landmarks
    else:
        dom_lms  = result.left_hand_landmarks
        base_lms = result.right_hand_landmarks

    left_hand  = np.zeros(SINGLE_HAND_SIZE, dtype=np.float32)
    right_hand = np.zeros(SINGLE_HAND_SIZE, dtype=np.float32)

    if result.left_hand_landmarks:
        coords = np.array([[lm.x, lm.y, lm.z]
                            for lm in result.left_hand_landmarks.landmark], dtype=np.float32)
        left_hand = _normalize_hand(coords)

    if result.right_hand_landmarks:
        coords = np.array([[lm.x, lm.y, lm.z]
                            for lm in result.right_hand_landmarks.landmark], dtype=np.float32)
        right_hand = _normalize_hand(coords)

    shoulder_scale = 1.0
    dominant_wrist = np.zeros(3, dtype=np.float32)
    if result.pose_landmarks:
        try:
            lms = result.pose_landmarks.landmark
            ls = np.array([lms[11].x, lms[11].y, lms[11].z], dtype=np.float32)
            rs = np.array([lms[12].x, lms[12].y, lms[12].z], dtype=np.float32)
            shoulder_scale = float(np.linalg.norm(rs - ls)) or 1.0
            wrist_idx = 16 if dominant_is_right else 15
            pw = lms[wrist_idx]
            dominant_wrist = np.array([pw.x, pw.y, pw.z], dtype=np.float32)
        except IndexError:
            pass

    if prev_dominant_wrist is not None:
        velocity = dominant_wrist - prev_dominant_wrist
    else:
        velocity = np.zeros(VELOCITY_SIZE, dtype=np.float32)

    if prev_velocity is not None:
        acceleration = velocity - prev_velocity
    else:
        acceleration = np.zeros(ACCEL_SIZE, dtype=np.float32)

    pose_vec = _extract_pose(result.pose_landmarks)
    face_vec = _extract_face(result.face_landmarks)
    interact_vec = _interaction_features(
        result.left_hand_landmarks, result.right_hand_landmarks,
        result.face_landmarks, result.pose_landmarks, shoulder_scale,
    )

    face_h = 1.0
    if result.face_landmarks and len(result.face_landmarks.landmark) > 152:
        lms = result.face_landmarks.landmark
        face_h = abs(lms[152].y - lms[10].y) or 1.0
    nmm_vec, new_yaw, new_pitch, new_roll = _extract_nmm(
        result.face_landmarks,
        prev_head_yaw=prev_head_state[0],
        prev_head_pitch=prev_head_state[1],
        prev_head_roll=prev_head_state[2],
        face_scale=face_h,
    )

    finger_ang_vec   = _extract_finger_angles(dom_lms)
    wrist_orient_vec = _extract_wrist_orientation(dom_lms)
    body_dist_vec    = _body_distance_features(
        dom_lms, base_lms, result.face_landmarks, result.pose_landmarks, shoulder_scale
    )

    vec = np.concatenate([
        left_hand,
        right_hand,
        pose_vec,
        face_vec,
        velocity,
        interact_vec,
        acceleration,
        nmm_vec,
        finger_ang_vec,
        wrist_orient_vec,
        body_dist_vec,
    ], dtype=np.float32)

    assert len(vec) == LANDMARK_VECTOR_SIZE, \
        f"Feature vector length {len(vec)} != expected {LANDMARK_VECTOR_SIZE}"

    return (
        vec,
        dominant_wrist,
        velocity,
        (new_yaw, new_pitch, new_roll),
    )


# Extract a fixed-length multi-modal landmark sequence from a video file
def extract_sequence_from_video(
    video_path: str,
    sequence_length: int = 45,
    hands_solution=None,
    dominant_is_right: bool = True,
) -> np.ndarray:
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
    prev_wrist = None
    prev_vel   = None
    head_state = (0.0, 0.0, 0.0)

    try:
        for out_idx, frame_idx in enumerate(sample_indices):
            cap.set(cv2.CAP_PROP_POS_FRAMES, float(frame_idx))
            ret, frame = cap.read()
            if not ret or frame is None:
                sequence[out_idx] = last_valid
                continue

            vec, prev_wrist, prev_vel, head_state = extract_landmarks_from_frame(
                frame, hands_solution, prev_wrist, prev_vel, head_state, dominant_is_right
            )

            if np.any(vec != 0):
                last_valid = vec

            sequence[out_idx] = vec if np.any(vec != 0) else last_valid
    finally:
        cap.release()
        if own_solution:
            hands_solution.close()

    return sequence


# Legacy stub  - returns zeros for backward compatibility
def extract_landmarks_from_result(result) -> np.ndarray:
    return np.zeros(LANDMARK_VECTOR_SIZE, dtype=np.float32)
