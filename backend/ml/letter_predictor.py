from __future__ import annotations

import json
import logging
import math
from collections import deque
from difflib import get_close_matches
from pathlib import Path
from typing import Optional

import joblib
import numpy as np

log = logging.getLogger(__name__)

_BASE_DIR    = Path(__file__).parent.parent
_MODEL_DIR   = _BASE_DIR / "models"
_MODEL_PATH  = _MODEL_DIR / "asl_letter_model.joblib"
_SCALER_PATH = _MODEL_DIR / "asl_letter_scaler.joblib"
_BUNDLE_PATH = _MODEL_DIR / "asl_letter_bundle.joblib"
_META_PATH   = _MODEL_DIR / "asl_letter_meta.json"

LETTER_CONF_THRESH     = 0.70
STABLE_FRAMES_REQUIRED = 4
COOLDOWN_FRAMES        = 10

TRAJ_BUFFER_SIZE = 15
J_PATH_THRESH    = 0.18
Z_PATH_THRESH    = 0.20

_WORD_LIST: list[str] = sorted({
    "hello", "help", "hey", "hi",
    "good", "great", "cool", "okay",
    "please", "thank", "thanks", "welcome",
    "yes", "no",
    "love", "like", "hate",
    "happy", "sad", "tired", "sick", "fine", "busy", "ready",
    "name", "what", "where", "when", "why", "how",
    "home", "house", "school", "work", "park",
    "friend", "family", "girl", "boy", "king", "queen",
    "apple", "food", "water", "milk",
    "ball", "book", "car", "cat", "dog", "door", "hand", "lamp", "moon",
    "you", "me", "they", "them", "we", "us",
    "stop", "go", "wait", "come", "walk", "jump", "play", "work",
    "start", "open", "close", "done", "see", "hear", "feel", "know",
    "think", "want", "need", "have",
    "big", "small", "fast", "slow", "hot", "cold",
    "more", "less", "again",
    "here", "there", "today", "tomorrow",
    "once", "under", "very",
    "world", "sign", "language", "nice", "bad",
    "face", "nose", "inch", "rain", "sun", "tree",
    "xray", "year", "zero",
})

_model  = None
_scaler = None
_meta: dict = {}
_classes: list[str] = []


# Load inference artefacts using split files first, then bundle fallback
def _load() -> None:
    global _model, _scaler, _meta, _classes

    if _MODEL_PATH.exists() and _SCALER_PATH.exists():
        try:
            _model  = joblib.load(str(_MODEL_PATH))
            _scaler = joblib.load(str(_SCALER_PATH))
            if _META_PATH.exists():
                with open(_META_PATH, "r", encoding="utf-8") as f:
                    _meta = json.load(f)
                _classes = _meta.get("classes", [])
            log.info(
                "ASL letter model loaded (split) — %d classes, accuracy=%.2f%%",
                len(_classes), _meta.get("accuracy", 0) * 100,
            )
            return
        except Exception as exc:  # noqa: BLE001
            log.warning("Split model load failed (%s) — trying bundle …", exc)
            _model = None

    if _BUNDLE_PATH.exists():
        try:
            bundle   = joblib.load(str(_BUNDLE_PATH))
            _model   = bundle["model"]
            le       = bundle["label_encoder"]
            _scaler  = None
            _classes = [str(c) for c in le.classes_]
            if _META_PATH.exists():
                with open(_META_PATH, "r", encoding="utf-8") as f:
                    _meta = json.load(f)
            else:
                _meta = {"classes": _classes, "accuracy": 0}
            log.info(
                "ASL letter model loaded (bundle) — %d classes",
                len(_classes),
            )
            return
        except Exception as exc:  # noqa: BLE001
            log.error("Bundle model load failed: %s", exc)
            _model = None

    log.warning(
        "ASL letter model not found — run: python -m ml.train_asl_letter\n"
        "  or copy asl_model.joblib → models/asl_letter_bundle.joblib"
    )


_load()


# Predict the ASL letter for a single frame of raw 63-dim hand landmarks
def predict_letter(raw_landmarks_63) -> dict:
    if _model is None:
        return {
            "letter": "—",
            "confidence": 0.0,
            "top5": [],
            "is_dynamic": False,
            "error": "ASL letter model not loaded. Run: python -m ml.train_asl_letter",
        }

    raw = np.asarray(raw_landmarks_63, dtype=np.float32).flatten()
    if raw.shape[0] != 63:
        return {
            "letter": "—",
            "confidence": 0.0,
            "top5": [],
            "is_dynamic": False,
            "error": f"Expected 63 features, got {raw.shape[0]}",
        }

    feat = raw.reshape(1, -1)
    if _scaler is not None:
        feat = _scaler.transform(feat)

    probs = _model.predict_proba(feat)[0]

    top1_idx  = int(np.argmax(probs))
    top1_conf = float(probs[top1_idx])
    top1_let  = _classes[top1_idx] if _classes else str(top1_idx)

    k     = min(5, len(probs))
    top_k = np.argsort(probs)[-k:][::-1]
    top5  = [
        {
            "letter":     _classes[int(i)] if _classes else str(i),
            "confidence": round(float(probs[i]), 4),
        }
        for i in top_k
    ]

    return {
        "letter":     top1_let,
        "confidence": round(top1_conf, 4),
        "top5":       top5,
        "is_dynamic": False,
    }


# Total 2-D Euclidean path length over a list of (x, y) points
def _path_length(pts: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(1, len(pts)):
        dx = pts[i][0] - pts[i - 1][0]
        dy = pts[i][1] - pts[i - 1][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


# Width / Height of the bounding box of the trajectory
def _bbox_aspect(pts: list[tuple[float, float]]) -> float:
    if len(pts) < 2:
        return 1.0
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w  = max(xs) - min(xs)
    h  = max(ys) - min(ys) + 1e-8
    return w / h


# Per-stream stateful wrapper for the ASL letter classifier with debounce and J/Z detection
class LetterSession:
    def __init__(self) -> None:
        self._stable_letter = ""
        self._stable_count  = 0
        self._cooldown      = 0
        self._word          = ""
        self._words: list[str] = []
        self._traj: deque[tuple[float, float]] = deque(maxlen=TRAJ_BUFFER_SIZE)

    @property
    def current_word(self) -> str:
        return self._word

    @property
    def committed_words(self) -> list[str]:
        return list(self._words)

    def reset(self) -> None:
        self._stable_letter = ""
        self._stable_count  = 0
        self._cooldown      = 0
        self._word          = ""
        self._traj.clear()

    # Commit the current letter buffer as a completed word
    def flush_word(self) -> str:
        word = self._word
        if word:
            self._words.append(word)
        self._word = ""
        self._traj.clear()
        return word

    # Return up to n dictionary words for `partial` using prefix then fuzzy matching
    @staticmethod
    def suggest(partial: str, n: int = 3) -> list[str]:
        if not partial:
            return []
        lower = partial.lower()
        prefix = sorted(
            [w for w in _WORD_LIST if w.startswith(lower)],
            key=lambda w: (len(w), w),
        )
        fuzzy = get_close_matches(lower, _WORD_LIST, n=n, cutoff=0.4)
        seen:   set[str]  = set()
        result: list[str] = []
        for w in prefix + fuzzy:
            if w not in seen:
                seen.add(w)
                result.append(w)
            if len(result) >= n:
                break
        return result

    # Feed one frame; returns a commit dict when a letter is confirmed, else None
    def push(
        self,
        raw_landmarks_63,
        index_tip_xy: Optional[tuple[float, float]] = None,
    ) -> Optional[dict]:
        if self._cooldown > 0:
            self._cooldown -= 1
            return None

        if index_tip_xy is not None:
            self._traj.append(index_tip_xy)

        result = predict_letter(raw_landmarks_63)
        if "error" in result:
            return None

        letter = result["letter"]
        conf   = result["confidence"]
        is_dyn = False

        traj = list(self._traj)
        if len(traj) >= TRAJ_BUFFER_SIZE:
            path_len = _path_length(traj)
            aspect   = _bbox_aspect(traj)

            if path_len > J_PATH_THRESH and aspect < 0.8:
                letter = "J"
                conf   = 1.0
                is_dyn = True
            elif path_len > Z_PATH_THRESH and aspect > 1.2:
                letter = "Z"
                conf   = 1.0
                is_dyn = True

        if letter == self._stable_letter and conf >= LETTER_CONF_THRESH:
            self._stable_count += 1
        else:
            self._stable_letter = letter
            self._stable_count  = 1

        if self._stable_count >= STABLE_FRAMES_REQUIRED:
            self._word         += letter
            self._stable_count  = 0
            self._stable_letter = ""
            self._cooldown      = COOLDOWN_FRAMES
            self._traj.clear()

            suggestions = self.suggest(self._word)
            return {
                "letter":      letter,
                "word":        self._word,
                "suggestions": suggestions,
                "is_dynamic":  is_dyn,
                "confidence":  round(conf, 4),
            }

        return None


# Hot-reload model artefacts from disk after retraining
def reload_letter_model() -> None:
    log.info("Reloading ASL letter model …")
    _load()
