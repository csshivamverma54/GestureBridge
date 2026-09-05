import numpy as np


SEQUENCE_LENGTH = 45
LANDMARK_VECTOR_SIZE = 218


# Ensure a landmark sequence has exactly `length` frames by padding or truncating
def pad_or_truncate(sequence: np.ndarray, length: int = SEQUENCE_LENGTH) -> np.ndarray:
    sequence = np.array(sequence, dtype=np.float32)
    T = sequence.shape[0]
    if T >= length:
        return sequence[:length]
    pad = np.zeros((length - T, sequence.shape[1]), dtype=np.float32)
    return np.vstack([sequence, pad])


# Return the sequence unchanged; per-frame wrist normalisation is already applied
def normalize_sequence(sequence: np.ndarray) -> np.ndarray:
    return np.array(sequence, dtype=np.float32)


# Full inference-time preprocessing: pad/truncate, optional z-score, add batch dim
def preprocess_landmark_sequence(
    sequence: np.ndarray,
    mean: np.ndarray = None,
    std: np.ndarray = None,
) -> np.ndarray:
    seq = pad_or_truncate(sequence, SEQUENCE_LENGTH)
    if mean is not None and std is not None:
        seq = (seq - mean) / (std + 1e-8)
    return np.expand_dims(seq, axis=0).astype(np.float32)


# DEPRECATED: original pixel-based frame preprocessor kept for import compatibility
def preprocess_frame(frame: np.ndarray) -> np.ndarray:
    import cv2
    frame = cv2.resize(frame, (224, 224))
    frame = frame / 255.0
    frame = np.expand_dims(frame, axis=0)
    return frame
