<<<<<<< HEAD
=======
"""
letter_predictor.py  (backend/ml/letter_predictor.py)
------------------------------------------------------
Phase 3 — Dual-Model Coordination: auxiliary ASL fingerspelling engine.

This module loads the trained letter classifier and exposes a single
public function:

    predict_letter(hand_landmarks_63) → dict

Input contract
--------------
hand_landmarks_63 : list[float] or np.ndarray of shape (63,)
    The dominant hand's 21 MediaPipe normalised landmarks flattened
    as [x0,y0,z0, x1,y1,z1, …, x20,y20,z20].

    These are RAW MediaPipe screen-space coordinates (0–1 range) —
    NO wrist-centering or scale normalisation is applied here because
    both the split MLP and the bundle RF were trained on raw coords.
    The StandardScaler inside the split model already handles
    distribution normalisation.

Dynamic J / Z handler (Phase 3.1)
----------------------------------
A 15-frame rolling trajectory buffer tracks Landmark 8 (Index Fingertip).
If the total 2-D path length exceeds J_PATH_THRESH or Z_PATH_THRESH AND
the bounding-box aspect-ratio matches the expected stroke shape, the static
classifier result is overridden and 'J' or 'Z' is returned instead.

Debounce & word-building (Phase 4.3)
--------------------------------------
Public class LetterSession() wraps per-stream state:
  - Require confidence > LETTER_CONF_THRESH across STABLE_FRAMES_REQUIRED
    consecutive frames before committing a letter.
  - 10-frame cooldown after each commit.
  - Exposes current_word (str) and committed_words (list[str]).
  - Smart dictionary suggestions via difflib (top-3 closest matches).

Public API
----------
predict_letter(raw_landmarks_63)  → dict
    {
      "letter"      : str   — predicted letter ('A'–'Z', or '—')
      "confidence"  : float — top-1 softmax/RF probability
      "top5"        : list  — [{"letter": str, "confidence": float}, …]
      "is_dynamic"  : bool  — True when J/Z motion override fired
    }

LetterSession()                   — stateful per-stream helper
    .push(raw_landmarks_63, index_tip_xy) → dict | None
        Feeds one frame; returns commit dict when a letter is confirmed,
        else None.  commit dict: {"letter": str, "word": str}
    .current_word   → str
    .committed_words → list[str]
    .reset()
    .suggest(word)  → list[str]   top-3 dictionary suggestions

Singleton load
--------------
Model artefacts are loaded once at import time.  Two load strategies:

  1. Split files  — asl_letter_model.joblib + asl_letter_scaler.joblib
                    (produced by python -m ml.train_asl_letter)
  2. Bundle file  — asl_letter_bundle.joblib  {"model", "label_encoder"}
                    (produced by train_asl_letter.py OR copied directly
                     from database/Letter-to-sentence/asl_model.joblib)

If neither exists all predictions return a graceful "not ready" response.
"""

>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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

<<<<<<< HEAD
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
=======
# ── Paths ──────────────────────────────────────────────────────────────────
_BASE_DIR    = Path(__file__).parent.parent   # backend/
_MODEL_DIR   = _BASE_DIR / "models"
_MODEL_PATH  = _MODEL_DIR / "asl_letter_model.joblib"
_SCALER_PATH = _MODEL_DIR / "asl_letter_scaler.joblib"
_BUNDLE_PATH = _MODEL_DIR / "asl_letter_bundle.joblib"   # {"model", "label_encoder"}
_META_PATH   = _MODEL_DIR / "asl_letter_meta.json"

# ── Debounce hyper-parameters ─────────────────────────────────────────────
LETTER_CONF_THRESH     = 0.70   # min RF/MLP confidence to count a frame
                                # (RF soft probs top-out ~0.87 on training data;
                                #  0.70 filters noise while allowing real letters)
STABLE_FRAMES_REQUIRED = 4      # consecutive high-confidence frames → commit
COOLDOWN_FRAMES        = 10     # frames to ignore after each committed letter

# ── J / Z trajectory hyper-parameters ────────────────────────────────────
TRAJ_BUFFER_SIZE = 15           # rolling window of index-fingertip positions
J_PATH_THRESH    = 0.18         # minimum 2-D path length (normalised coords)
Z_PATH_THRESH    = 0.20

# ── English vocabulary for suggestions ───────────────────────────────────
# Merged: current project word list + database/Letter-to-sentence/asl_live_demo.py VOCAB
_WORD_LIST: list[str] = sorted({
    # Greetings / responses
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    "hello", "help", "hey", "hi",
    "good", "great", "cool", "okay",
    "please", "thank", "thanks", "welcome",
    "yes", "no",
<<<<<<< HEAD
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
=======
    # Emotions / states
    "love", "like", "hate",
    "happy", "sad", "tired", "sick", "fine", "busy", "ready",
    # Questions
    "name", "what", "where", "when", "why", "how",
    # Places / people
    "home", "house", "school", "work", "park",
    "friend", "family", "girl", "boy", "king", "queen",
    # Food / objects
    "apple", "food", "water", "milk",
    "ball", "book", "car", "cat", "dog", "door", "hand", "lamp", "moon",
    # Pronouns
    "you", "me", "they", "them", "we", "us",
    # Actions
    "stop", "go", "wait", "come", "walk", "jump", "play", "work",
    "start", "open", "close", "done", "see", "hear", "feel", "know",
    "think", "want", "need", "have",
    # Descriptors
    "big", "small", "fast", "slow", "hot", "cold",
    "more", "less", "again",
    # Time / place
    "here", "there", "today", "tomorrow",
    "once", "under", "very",
    # Misc
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    "world", "sign", "language", "nice", "bad",
    "face", "nose", "inch", "rain", "sun", "tree",
    "xray", "year", "zero",
})

<<<<<<< HEAD
_model  = None
_scaler = None
=======
# ── Singleton state ───────────────────────────────────────────────────────
_model  = None
_scaler = None   # StandardScaler for MLP path; None for RF/bundle path
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
_meta: dict = {}
_classes: list[str] = []


<<<<<<< HEAD
# Load inference artefacts using split files first, then bundle fallback
def _load() -> None:
    global _model, _scaler, _meta, _classes

=======
def _load() -> None:
    """
    Load inference artefacts.  Two strategies in priority order:

    1. Split files  — asl_letter_model.joblib + asl_letter_scaler.joblib
                      (produced by train_asl_letter.py; includes StandardScaler)
    2. Bundle file  — asl_letter_bundle.joblib  {"model", "label_encoder"}
                      (compatible with database/Letter-to-sentence/asl_model.joblib)

    IMPORTANT: Neither path applies wrist-centering/scale normalisation because
    both models were trained on raw MediaPipe screen-space coordinates (0–1).
    """
    global _model, _scaler, _meta, _classes

    # Strategy 1: split files (MLP + StandardScaler)
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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

<<<<<<< HEAD
=======
    # Strategy 2: bundle {"model": clf, "label_encoder": le}
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    if _BUNDLE_PATH.exists():
        try:
            bundle   = joblib.load(str(_BUNDLE_PATH))
            _model   = bundle["model"]
            le       = bundle["label_encoder"]
<<<<<<< HEAD
            _scaler  = None
=======
            _scaler  = None          # RF bundle — no scaler needed
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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


<<<<<<< HEAD
_load()


# Predict the ASL letter for a single frame of raw 63-dim hand landmarks
def predict_letter(raw_landmarks_63) -> dict:
=======
_load()   # load once at import


# ── Core single-frame predictor ───────────────────────────────────────────

def predict_letter(raw_landmarks_63) -> dict:
    """
    Predict the ASL letter for a single frame of hand landmarks.

    Parameters
    ----------
    raw_landmarks_63 : list or np.ndarray of shape (63,)
        Raw dominant-hand MediaPipe normalised landmarks (screen-space 0–1).
        Passed through as-is — models were trained on raw coords.

    Returns
    -------
    dict:
        letter      : str
        confidence  : float
        top5        : list[{"letter": str, "confidence": float}]
        is_dynamic  : bool  (always False here; set by LetterSession for J/Z)
        error       : str   (only present when model not ready)
    """
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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

<<<<<<< HEAD
=======
    # Apply StandardScaler when available (MLP split-file path)
    # Skip for bundle/RF path — RF was trained on raw, unscaled coords
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    feat = raw.reshape(1, -1)
    if _scaler is not None:
        feat = _scaler.transform(feat)

<<<<<<< HEAD
    probs = _model.predict_proba(feat)[0]
=======
    probs = _model.predict_proba(feat)[0]   # (num_classes,)
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac

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


<<<<<<< HEAD
# Total 2-D Euclidean path length over a list of (x, y) points
def _path_length(pts: list[tuple[float, float]]) -> float:
=======
# ── J / Z trajectory helpers ──────────────────────────────────────────────

def _path_length(pts: list[tuple[float, float]]) -> float:
    """Total 2-D Euclidean path length over a list of (x, y) points."""
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    total = 0.0
    for i in range(1, len(pts)):
        dx = pts[i][0] - pts[i - 1][0]
        dy = pts[i][1] - pts[i - 1][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


<<<<<<< HEAD
# Width / Height of the bounding box of the trajectory
def _bbox_aspect(pts: list[tuple[float, float]]) -> float:
=======
def _bbox_aspect(pts: list[tuple[float, float]]) -> float:
    """Width / Height of the bounding box of the trajectory."""
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    if len(pts) < 2:
        return 1.0
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w  = max(xs) - min(xs)
    h  = max(ys) - min(ys) + 1e-8
    return w / h


<<<<<<< HEAD
# Per-stream stateful wrapper for the ASL letter classifier with debounce and J/Z detection
class LetterSession:
=======
# ── Stateful session (per live-stream) ───────────────────────────────────

class LetterSession:
    """
    Per-stream stateful wrapper for the ASL letter classifier.

    Usage
    -----
    session = LetterSession()
    for frame in video_stream:
        result = session.push(hand_landmarks_63, index_tip_xy=(x, y))
        if result:
            print("Committed:", result["letter"], "→ word so far:", result["word"])
    """

>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    def __init__(self) -> None:
        self._stable_letter = ""
        self._stable_count  = 0
        self._cooldown      = 0
        self._word          = ""
        self._words: list[str] = []
        self._traj: deque[tuple[float, float]] = deque(maxlen=TRAJ_BUFFER_SIZE)

<<<<<<< HEAD
=======
    # ── Public properties ──────────────────────────────────────────────
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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

<<<<<<< HEAD
    # Commit the current letter buffer as a completed word
    def flush_word(self) -> str:
=======
    def flush_word(self) -> str:
        """Commit the current letter buffer as a completed word."""
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
        word = self._word
        if word:
            self._words.append(word)
        self._word = ""
        self._traj.clear()
        return word

<<<<<<< HEAD
    # Return up to n dictionary words for `partial` using prefix then fuzzy matching
    @staticmethod
    def suggest(partial: str, n: int = 3) -> list[str]:
        if not partial:
            return []
        lower = partial.lower()
=======
    # ── Suggestions ───────────────────────────────────────────────────
    @staticmethod
    def suggest(partial: str, n: int = 3) -> list[str]:
        """
        Return up to n dictionary words for `partial`.

        Priority order (matching asl_live_demo.py behaviour):
          1. Prefix matches sorted by (length, alphabetical) — shortest first
          2. Close fuzzy matches via difflib
        """
        if not partial:
            return []
        lower = partial.lower()
        # Prefix matches — shortest first, then alphabetical
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
        prefix = sorted(
            [w for w in _WORD_LIST if w.startswith(lower)],
            key=lambda w: (len(w), w),
        )
<<<<<<< HEAD
=======
        # Fuzzy fallback
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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

<<<<<<< HEAD
    # Feed one frame; returns a commit dict when a letter is confirmed, else None
=======
    # ── Main per-frame entry ───────────────────────────────────────────
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    def push(
        self,
        raw_landmarks_63,
        index_tip_xy: Optional[tuple[float, float]] = None,
    ) -> Optional[dict]:
<<<<<<< HEAD
=======
        """
        Feed one frame.  Returns a commit dict when a letter is confirmed,
        else None.

        commit dict keys:
            letter      : str
            word        : str   — running word so far (including new letter)
            suggestions : list[str]
            is_dynamic  : bool
        """
        # Cooldown tick
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
        if self._cooldown > 0:
            self._cooldown -= 1
            return None

<<<<<<< HEAD
        if index_tip_xy is not None:
            self._traj.append(index_tip_xy)

=======
        # Update trajectory buffer for J/Z detection
        if index_tip_xy is not None:
            self._traj.append(index_tip_xy)

        # Run static classifier
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
        result = predict_letter(raw_landmarks_63)
        if "error" in result:
            return None

        letter = result["letter"]
        conf   = result["confidence"]
        is_dyn = False

<<<<<<< HEAD
=======
        # ── J / Z motion override ──────────────────────────────────────
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
        traj = list(self._traj)
        if len(traj) >= TRAJ_BUFFER_SIZE:
            path_len = _path_length(traj)
            aspect   = _bbox_aspect(traj)

            if path_len > J_PATH_THRESH and aspect < 0.8:
<<<<<<< HEAD
=======
                # J: tall narrow arc (index loops down-left)
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
                letter = "J"
                conf   = 1.0
                is_dyn = True
            elif path_len > Z_PATH_THRESH and aspect > 1.2:
<<<<<<< HEAD
=======
                # Z: wide zigzag (index draws Z left-to-right)
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
                letter = "Z"
                conf   = 1.0
                is_dyn = True

<<<<<<< HEAD
=======
        # ── Debounce ───────────────────────────────────────────────────
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
        if letter == self._stable_letter and conf >= LETTER_CONF_THRESH:
            self._stable_count += 1
        else:
            self._stable_letter = letter
            self._stable_count  = 1

        if self._stable_count >= STABLE_FRAMES_REQUIRED:
<<<<<<< HEAD
=======
            # Commit this letter
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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


<<<<<<< HEAD
# Hot-reload model artefacts from disk after retraining
def reload_letter_model() -> None:
=======
# ── Module-level reload helper ────────────────────────────────────────────

def reload_letter_model() -> None:
    """Hot-reload model artefacts from disk (after retraining)."""
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    log.info("Reloading ASL letter model …")
    _load()
