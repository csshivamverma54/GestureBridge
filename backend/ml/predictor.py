import json
import logging
from pathlib import Path
from typing import Union

import numpy as np

from ml.utils.preprocess import preprocess_landmark_sequence

log = logging.getLogger(__name__)

_ML_DIR         = Path(__file__).parent
_MODEL_PATH      = _ML_DIR / "gesture_model.pt"
_LABELS_PATH     = _ML_DIR / "labels.json"
_META_PATH       = _ML_DIR / "model_meta.json"
_NORMALIZER_PATH = _ML_DIR / "normalizer.npz"

_SEQUENCE_LENGTH:      int = 45
_LANDMARK_VECTOR_SIZE: int = 218

_model = None
_labels: dict = {}
_num_classes: int = 0
_feat_mean: np.ndarray = None
_feat_std:  np.ndarray = None


# Load idx_to_label mapping from labels.json
def _load_labels(labels_path: Path) -> dict:
    if not labels_path.exists():
        log.warning("labels.json not found at %s — predictions will return raw indices.", labels_path)
        return {}
    with open(labels_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


# Load the PyTorch model state dict; returns None if file does not exist
def _load_model(model_path: Path, meta_path: Path, num_classes: int):
    global _SEQUENCE_LENGTH, _LANDMARK_VECTOR_SIZE
    if not model_path.exists():
        log.warning(
            "Model file not found at %s. "
            "Run ml/train.py to train the model before starting the server.",
            model_path,
        )
        return None

    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        if num_classes == 0:
            num_classes = meta.get("num_classes", 0)
        _SEQUENCE_LENGTH      = meta.get("sequence_length",      _SEQUENCE_LENGTH)
        _LANDMARK_VECTOR_SIZE = meta.get("landmark_vector_size", _LANDMARK_VECTOR_SIZE)
        log.info("model_meta.json: num_classes=%d  seq_len=%d  feat_size=%d",
                 num_classes, _SEQUENCE_LENGTH, _LANDMARK_VECTOR_SIZE)

    if num_classes == 0:
        log.error(
            "Cannot load model: num_classes is 0. "
            "Ensure labels.json and model_meta.json are present in %s.",
            model_path.parent,
        )
        return None

    try:
        import torch
        from ml.model import GestureBridgeLSTM
        model = GestureBridgeLSTM(num_classes=num_classes)
        state = torch.load(str(model_path), map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        model.eval()
        log.info("GestureBridge model loaded from %s (classes=%d)", model_path, num_classes)
        return model
    except RuntimeError as exc:
        log.error(
            "Model state_dict mismatch — the saved model was probably trained on a "
            "different feature size. Retrain with ml/train.py.  Detail: %s", exc
        )
        return None
    except Exception as exc:  # noqa: BLE001
        log.error("Failed to load model: %s", exc)
        return None


# Load model and labels into module-level singletons
def _initialize():
    global _model, _labels, _num_classes, _feat_mean, _feat_std
    _labels      = _load_labels(_LABELS_PATH)
    _num_classes = len(_labels)
    _model       = _load_model(_MODEL_PATH, _META_PATH, _num_classes)

    if _NORMALIZER_PATH.exists():
        npz = np.load(str(_NORMALIZER_PATH))
        _feat_mean = npz["mean"]
        _feat_std  = npz["std"]
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


_initialize()


# Run inference on a MediaPipe landmark sequence and return top-1 + top-5 predictions
def predict_gesture(landmark_sequence: Union[np.ndarray, list]) -> dict:
    if _model is None:
        return {
            "predicted_word": "—",
            "confidence": 0.0,
            "top5": [],
            "error": (
                "Model not loaded — the saved weights are likely from a previous "
                "feature version (182-dim). Retrain: "
                "python -m ml.preprocess_dataset && python -m ml.train"
            ),
            "needs_retrain": True,
        }

    if not isinstance(landmark_sequence, np.ndarray):
        landmark_sequence = np.array(landmark_sequence, dtype=np.float32)
    if landmark_sequence.ndim == 1:
        landmark_sequence = landmark_sequence.reshape(1, -1)

    from ml.utils.preprocess import pad_or_truncate
    seq = pad_or_truncate(landmark_sequence, _SEQUENCE_LENGTH)
    if _feat_mean is not None and _feat_std is not None:
        seq = (seq - _feat_mean) / (_feat_std + 1e-8)
    X = np.expand_dims(seq, axis=0).astype(np.float32)

    import torch
    import torch.nn.functional as F
    tensor = torch.from_numpy(X)
    with torch.no_grad():
        logits = _model(tensor)
        probs  = F.softmax(logits, dim=-1)[0].numpy()

    top1_idx  = int(np.argmax(probs))
    top1_conf = float(probs[top1_idx])
    top1_word = _labels.get(top1_idx, f"class_{top1_idx}")

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


# Hot-reload the model and labels from disk without restarting the server
def reload_model():
    log.info("Reloading model and labels …")
    _initialize()
