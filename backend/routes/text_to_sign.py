"""
text_to_sign.py  (backend/routes/text_to_sign.py)
--------------------------------------------------
Converts typed text into an ordered sequence of sign-language videos
drawn from the local WLASL dataset.

Routes
------
POST /text-to-sign
    Tokenise the input sentence into words, look each word up in the
    curated WLASL vocabulary, and return an ordered list of playable
    video entries.

    Request (JSON):
        { "text": "hello thank you", "language": "ASL" }

    Response (JSON):
        {
          "words": [
            {
              "word":     "hello",
              "found":    true,
              "video_id": "69364",
              "video_url": "/video/69364"
            },
            {
              "word":  "unknown_word",
              "found": false,
              "video_id": null,
              "video_url": null
            }
          ],
          "coverage": 0.85,        // fraction of words that were found
          "total_words": 2,
          "found_words": 1
        }

GET /video/<video_id>
    Stream a local WLASL mp4 file with proper range-request support so
    HTML <video> elements can seek freely.

    Returns 404 if the file is not present in the local dataset.
"""

import json
import os
import re
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file, abort

# ── Paths ──────────────────────────────────────────────────────────────────
_ROUTES_DIR  = Path(__file__).parent                        # backend/routes/
_BACKEND_DIR = _ROUTES_DIR.parent                           # backend/
_VIDEOS_DIR  = _BACKEND_DIR / "data" / "WLASL" / "videos"  # local mp4 files
_JSON_PATH   = _BACKEND_DIR / "data" / "WLASL" / "curated_WLASL.json"

text_to_sign = Blueprint("text_to_sign", __name__)

# ── Build lookup tables once at import time ────────────────────────────────
# word → list of video_ids that exist locally, sorted by preference
# (val split first, then train, then test — val is typically cleaner demo clips)
_SPLIT_ORDER = {"val": 0, "train": 1, "test": 2}

def _build_lookup() -> dict:
    """Return {word_lowercase: [video_id, ...]} for every word that has
    at least one local .mp4 file."""
    if not _JSON_PATH.exists():
        return {}
    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    lookup: dict[str, list[str]] = {}
    for entry in data:
        word = entry["gloss"].lower().strip()
        candidates = []
        for inst in entry.get("instances", []):
            vid = str(inst["video_id"])
            mp4 = _VIDEOS_DIR / f"{vid}.mp4"
            if mp4.exists():
                split_rank = _SPLIT_ORDER.get(inst.get("split", "train"), 1)
                candidates.append((split_rank, vid))
        if candidates:
            # Sort by split preference, keep all (UI can cycle through them)
            candidates.sort(key=lambda x: x[0])
            lookup[word] = [vid for _, vid in candidates]
    return lookup

_WORD_LOOKUP: dict[str, list[str]] = _build_lookup()


# ── Helpers ────────────────────────────────────────────────────────────────

def _tokenise(text: str) -> list[str]:
    """
    Lower-case the input, replace punctuation with spaces, then split on
    whitespace.  Multi-word glosses (e.g. "thank you") are attempted by
    trying bigrams before falling back to individual tokens.
    """
    text = text.lower().strip()
    text = re.sub(r"[^a-z\s']", " ", text)   # keep apostrophes for contractions
    tokens = text.split()
    return tokens


def _resolve_tokens(tokens: list[str]) -> list[dict]:
    """
    Try bigrams first (e.g. ["thank", "you"] → "thank you"), then
    fall back to single tokens.

    Returns a list of result dicts (one per logical word/sign).
    """
    results = []
    i = 0
    while i < len(tokens):
        # Try two-word gloss
        if i + 1 < len(tokens):
            bigram = f"{tokens[i]} {tokens[i+1]}"
            if bigram in _WORD_LOOKUP:
                vids = _WORD_LOOKUP[bigram]
                results.append({
                    "word":      bigram,
                    "found":     True,
                    "video_id":  vids[0],
                    "video_url": f"/video/{vids[0]}",
                    "all_video_ids": vids,
                })
                i += 2
                continue
        # Single token
        word = tokens[i]
        if word in _WORD_LOOKUP:
            vids = _WORD_LOOKUP[word]
            results.append({
                "word":      word,
                "found":     True,
                "video_id":  vids[0],
                "video_url": f"/video/{vids[0]}",
                "all_video_ids": vids,
            })
        else:
            results.append({
                "word":          word,
                "found":         False,
                "video_id":      None,
                "video_url":     None,
                "all_video_ids": [],
            })
        i += 1
    return results


# ── POST /text-to-sign ─────────────────────────────────────────────────────
@text_to_sign.route("/text-to-sign", methods=["POST"])
def convert_text():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "Field 'text' is required and cannot be empty"}), 400

    tokens  = _tokenise(text)
    if not tokens:
        return jsonify({"error": "No valid words found in input"}), 400

    words   = _resolve_tokens(tokens)
    found   = sum(1 for w in words if w["found"])
    total   = len(words)
    coverage = round(found / total, 3) if total else 0.0

    return jsonify({
        "words":       words,
        "coverage":    coverage,
        "total_words": total,
        "found_words": found,
        "input_text":  text,
    }), 200


# ── GET /text-to-sign/vocabulary ──────────────────────────────────────────
@text_to_sign.route("/text-to-sign/vocabulary", methods=["GET"])
def vocabulary():
    """Return the full list of supported words (for autocomplete / UI hints)."""
    return jsonify({
        "words": sorted(_WORD_LOOKUP.keys()),
        "count": len(_WORD_LOOKUP),
    }), 200


# ── GET /video/<video_id> ──────────────────────────────────────────────────
@text_to_sign.route("/video/<video_id>", methods=["GET"])
def serve_video(video_id: str):
    """
    Stream a local WLASL mp4.
    Flask's send_file handles Range requests automatically (Flask ≥ 2.0),
    which is required for HTML <video> seek/scrub to work.
    """
    # Sanitise: only digits allowed in video_id
    if not re.match(r"^\d{1,6}$", video_id):
        abort(400, description="Invalid video_id format")

    # Zero-pad to 5 digits to match filenames like "00639"
    padded = video_id.zfill(5)
    mp4_path = _VIDEOS_DIR / f"{padded}.mp4"

    if not mp4_path.exists():
        abort(404, description=f"Video {padded}.mp4 not found in local dataset")

    return send_file(
        str(mp4_path),
        mimetype="video/mp4",
        conditional=True,   # enables Range / 206 Partial Content
    )
