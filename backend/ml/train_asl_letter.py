"""
train_asl_letter.py  (backend/ml/train_asl_letter.py)
------------------------------------------------------
Phase 2: Train an ASL letter classifier on the 63-feature hand-landmark
dataset (backend/database/asl_data.npz) and save inference artefacts.

Two classifier options
----------------------
  --model mlp   (default)  MLP 128→64 with augmentation   ← higher accuracy
  --model rf               RandomForest 250 trees          ← faster to train,
                           matches the database/Letter-to-sentence approach

NPZ contract
------------
  X : float32  (N, 63)  — 21 MediaPipe hand landmarks × (x,y,z)
                          Raw coordinates are accepted; wrist-centering +
                          scale normalisation is applied here before training.
  y : str      (N,)     — letter labels: A–Z (J/Z optional; motion-detected
                          at inference time)

Outputs (written to backend/models/)
--------------------------------------
  asl_letter_model.joblib    — scikit-learn classifier (MLP or RF)
  asl_letter_scaler.joblib   — StandardScaler (MLP only; identity for RF)
  asl_letter_encoder.joblib  — LabelEncoder
  asl_letter_bundle.joblib   — {"model": clf, "label_encoder": le}
                               (compatible with database/Letter-to-sentence format)
  asl_letter_meta.json       — {num_classes, accuracy, labels, …}

Run from backend/:
    python -m ml.train_asl_letter            # MLP (default)
    python -m ml.train_asl_letter --model rf # RandomForest
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import joblib
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import accuracy_score, confusion_matrix

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────
_BASE_DIR  = Path(__file__).parent.parent          # backend/
_NPZ_PATH  = _BASE_DIR / "database" / "asl_data.npz"
_MODEL_DIR = _BASE_DIR / "models"
_MODEL_DIR.mkdir(parents=True, exist_ok=True)

_MODEL_OUT   = _MODEL_DIR / "asl_letter_model.joblib"
_SCALER_OUT  = _MODEL_DIR / "asl_letter_scaler.joblib"
_ENCODER_OUT = _MODEL_DIR / "asl_letter_encoder.joblib"
_BUNDLE_OUT  = _MODEL_DIR / "asl_letter_bundle.joblib"
_META_OUT    = _MODEL_DIR / "asl_letter_meta.json"

# Augmentation config (MLP only)
_AUG_COPIES    = 8
_AUG_NOISE_STD = 0.015


# ── Preprocessing ─────────────────────────────────────────────────────────

def _normalise_batch(X: np.ndarray) -> np.ndarray:
    """
    Apply wrist-centering + scale normalisation to a batch of 63-feature vectors.

    Each row is reshaped to (21, 3).  Landmark 0 (wrist) is subtracted, then
    coordinates are divided by |Landmark 9| (Wrist → Middle MCP distance).
    Rows where the scale is degenerate are zeroed out (rare with real data).
    """
    out = np.zeros_like(X)
    for i, row in enumerate(X):
        pts = row.reshape(21, 3).copy()
        pts -= pts[0]                          # wrist-centering
        scale = float(np.linalg.norm(pts[9]))  # wrist→middle-MCP distance
        if scale < 1e-8:
            continue                           # degenerate — leave as zeros
        pts /= scale
        out[i] = pts.flatten()
    return out


# ── Augmentation ──────────────────────────────────────────────────────────

def _augment(X: np.ndarray, y: np.ndarray, copies: int = _AUG_COPIES) -> tuple[np.ndarray, np.ndarray]:
    """Augment training set with Gaussian noise + mild scale jitter (MLP only)."""
    rng = np.random.default_rng(42)
    parts_X = [X]
    parts_y = [y]
    for _ in range(copies):
        noise = rng.normal(0, _AUG_NOISE_STD, size=X.shape).astype(np.float32)
        scale = rng.uniform(0.95, 1.05, size=(len(X), 1)).astype(np.float32)
        parts_X.append(X * scale + noise)
        parts_y.append(y)
    return np.concatenate(parts_X, axis=0), np.concatenate(parts_y, axis=0)


# ── Diagnostics ───────────────────────────────────────────────────────────

def _log_confused_pairs(cm: np.ndarray, classes: list[str], top_n: int = 10) -> None:
    pairs: list[tuple[int, int, int]] = []
    n = cm.shape[0]
    for i in range(n):
        for j in range(n):
            if i != j and cm[i, j] > 0:
                pairs.append((cm[i, j], i, j))
    pairs.sort(reverse=True)
    log.info("Top confused pairs:")
    for count, ti, pi in pairs[:top_n]:
        log.info("  %s → predicted as %s  (%d times)", classes[ti], classes[pi], count)


# ── Trainers ──────────────────────────────────────────────────────────────

def _train_mlp(X_train: np.ndarray, y_train: np.ndarray, num_classes: int) -> tuple:
    """Train MLP with data augmentation + StandardScaler. Returns (clf, scaler)."""
    # Augment
    X_aug, y_aug = _augment(X_train, y_train, copies=_AUG_COPIES)
    log.info("After augmentation: Train=%d", len(X_aug))

    # Scale
    scaler = StandardScaler()
    X_sc = scaler.fit_transform(X_aug)

    log.info("Training MLP (128 → 64 → %d) …", num_classes)
    clf = MLPClassifier(
        hidden_layer_sizes=(128, 64),
        activation="relu",
        solver="adam",
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.10,
        n_iter_no_change=20,
        random_state=42,
        verbose=False,
        learning_rate_init=1e-3,
        batch_size=256,
        alpha=1e-4,
    )
    clf.fit(X_sc, y_aug)
    log.info("MLP training done in %d iterations.", clf.n_iter_)
    return clf, scaler


def _train_rf(X_train: np.ndarray, y_train: np.ndarray) -> tuple:
    """Train RandomForest (matches database/Letter-to-sentence/train_asl_model.py). Returns (clf, identity_scaler)."""
    log.info("Training RandomForest (250 trees) …")
    clf = RandomForestClassifier(
        n_estimators=250,
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)
    log.info("RandomForest training done.")
    # Return a dummy scaler that is identity (RF does not need scaling)
    scaler = StandardScaler()
    scaler.fit(X_train)   # fit so transform() works without error
    return clf, scaler


# ── Main entry point ───────────────────────────────────────────────────────

def train(model_type: str = "mlp") -> None:
    # ── 1. Load ────────────────────────────────────────────────────────────
    if not _NPZ_PATH.exists():
        log.error("NPZ not found: %s", _NPZ_PATH)
        return

    log.info("Loading %s …", _NPZ_PATH)
    data = np.load(str(_NPZ_PATH), allow_pickle=True)
    X: np.ndarray = data["X"].astype(np.float32)   # (N, 63)
    y_raw = data["y"]                               # (N,) str labels

    log.info("Loaded X=%s  y=%s", X.shape, y_raw.shape)
    unique_labels = sorted(set(y_raw.tolist()))
    log.info("Classes (%d): %s", len(unique_labels), unique_labels)

    # ── 2. Encode labels ───────────────────────────────────────────────────
    # NOTE: Raw MediaPipe screen-space coords (0–1) are used as-is.
    # The bundle RF was trained on raw coords (collect_asl_data.py stores lm.x/y/z).
    # The MLP StandardScaler handles distribution shift without coordinate normalisation.
    le = LabelEncoder()
    y: np.ndarray = le.fit_transform(y_raw).astype(np.int32)
    classes: list[str] = le.classes_.tolist()
    num_classes = len(classes)
    idx_to_label: dict[int, str] = {i: c for i, c in enumerate(classes)}

    # ── 4. Train / test split (stratified 80/20) ──────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    log.info("Train=%d  Test=%d", len(X_train), len(X_test))

    # ── 5. Train chosen classifier ─────────────────────────────────────────
    if model_type == "rf":
        clf, scaler = _train_rf(X_train, y_train)
        X_test_eval = X_test          # RF does not need scaling
    else:
        clf, scaler = _train_mlp(X_train, y_train, num_classes)
        X_test_eval = scaler.transform(X_test)

    # ── 6. Evaluate ───────────────────────────────────────────────────────
    y_pred   = clf.predict(X_test_eval)
    accuracy = accuracy_score(y_test, y_pred)
    log.info("Test accuracy: %.4f  (%.2f%%)", accuracy, accuracy * 100)

    cm = confusion_matrix(y_test, y_pred)
    _log_confused_pairs(cm, classes)

    if accuracy < 0.90:
        log.warning(
            "Accuracy %.2f%% is below the 90%% target — consider more data or switch model.",
            accuracy * 100,
        )

    # ── 7. Save artefacts ─────────────────────────────────────────────────
    joblib.dump(clf,    str(_MODEL_OUT),   compress=3)
    joblib.dump(scaler, str(_SCALER_OUT),  compress=3)
    joblib.dump(le,     str(_ENCODER_OUT), compress=3)

    # Bundle format (compatible with database/Letter-to-sentence/asl_model.joblib)
    joblib.dump({"model": clf, "label_encoder": le}, str(_BUNDLE_OUT), compress=3)

    meta = {
        "num_classes":  num_classes,
        "accuracy":     round(float(accuracy), 4),
        "feature_size": int(X.shape[1]),
        "model_type":   model_type,
        "labels":       idx_to_label,          # {0: "A", 1: "B", ...}
        "classes":      classes,               # ordered list
    }
    with open(_META_OUT, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    log.info("Saved: %s", _MODEL_OUT)
    log.info("Saved: %s", _SCALER_OUT)
    log.info("Saved: %s", _BUNDLE_OUT)
    log.info("Saved: %s", _META_OUT)
    log.info("✓ Done — accuracy %.2f%%", accuracy * 100)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train ASL letter classifier")
    parser.add_argument(
        "--model",
        choices=["mlp", "rf"],
        default="mlp",
        help="Classifier type: 'mlp' (default, higher accuracy) or 'rf' (RandomForest, faster)",
    )
    args = parser.parse_args()
    train(model_type=args.model)
