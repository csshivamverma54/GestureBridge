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
from difflib import get_close_matches
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file, abort

# ── Paths ──────────────────────────────────────────────────────────────────
_ROUTES_DIR  = Path(__file__).parent                        # backend/routes/
_BACKEND_DIR = _ROUTES_DIR.parent                           # backend/
_VIDEOS_DIR  = _BACKEND_DIR / "data" / "WLASL" / "videos"  # local mp4 files
_JSON_PATH   = _BACKEND_DIR / "data" / "WLASL" / "curated_WLASL.json"

text_to_sign = Blueprint("text_to_sign", __name__)

# ── Build lookup tables once at import time ────────────────────────────────
# word → list of { video_id, external_url } dicts, local files preferred
_SPLIT_ORDER = {"val": 0, "train": 1, "test": 2}

def _build_lookup() -> dict:
    """Return {word_lowercase: [{"video_id": str, "external_url": str|None}, ...]}
    for every word that has at least one local .mp4 OR an external URL."""
    if not _JSON_PATH.exists():
        return {}
    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    lookup: dict[str, list[dict]] = {}
    for entry in data:
        word = entry["gloss"].lower().strip()
        local_candidates = []   # (rank, video_id, ext_url) — local file exists
        remote_candidates = []  # (rank, video_id, ext_url) — no local file

        for inst in entry.get("instances", []):
            vid = str(inst["video_id"]).zfill(5)
            ext_url = inst.get("url") or None
            mp4 = _VIDEOS_DIR / f"{vid}.mp4"
            rank = _SPLIT_ORDER.get(inst.get("split", "train"), 1)
            entry_dict = {"video_id": vid, "external_url": ext_url}
            if mp4.exists():
                local_candidates.append((rank, entry_dict))
            elif ext_url:
                remote_candidates.append((rank, entry_dict))

        # Sort by split preference
        local_candidates.sort(key=lambda x: x[0])
        remote_candidates.sort(key=lambda x: x[0])

        all_candidates = [d for _, d in local_candidates] + [d for _, d in remote_candidates]
        if all_candidates:
            lookup[word] = all_candidates
    return lookup

_WORD_LOOKUP: dict[str, list[dict]] = _build_lookup()
_VOCAB_LIST: list[str] = sorted(_WORD_LOOKUP.keys())   # used for fuzzy matching


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


# Common suffix → candidate stems to try against the vocabulary.
# Order matters: more specific rules listed first.
_SUFFIX_RULES: list[tuple[str, str]] = [
    ("tions", "te"),
    ("tions", ""),
    ("tion",  "te"),
    ("tion",  ""),
    ("ings",  "e"),
    ("ings",  ""),
    ("ing",   "e"),    # driving → drive
    ("ing",   ""),     # running → runn  (second pass below doubles: runn→run)
    ("ers",   "e"),
    ("ers",   ""),
    ("er",    "e"),    # driver → drive
    ("er",    ""),     # player → play
    ("ness",  "y"),    # happiness → happy
    ("ness",  ""),     # sadness → sad
    ("ied",   "y"),    # tried → try
    ("ied",   "ie"),
    ("ves",   "f"),    # leaves → leaf
    ("ves",   "fe"),
    ("oes",   "o"),    # goes → go
    ("oes",   ""),
    ("ies",   "y"),    # countries → country
    ("ies",   ""),
    ("ed",    "e"),    # hoped → hope
    ("ed",    ""),     # jumped → jump
    ("ly",    ""),     # slowly → slow
    ("s",     ""),     # dogs → dog
    ("'s",    ""),     # dog's → dog
    ("'t",    ""),     # don't → don
]

# Extra two-step rules for doubled final consonants (running→runn→run)
_DOUBLE_CONS_RE = re.compile(r"([bcdfghjklmnpqrstvwxyz])\1$")


def _stem_candidates(word: str) -> list[str]:
    """
    Return a deduplicated list of candidate stems derived from suffix rules.
    Includes an extra pass to collapse doubled final consonants (runn→run).
    Each candidate has at least 3 characters.
    """
    seen: set[str] = set()
    candidates: list[str] = []

    def _add(s: str) -> None:
        if len(s) >= 3 and s not in seen:
            seen.add(s)
            candidates.append(s)
            # doubled-consonant collapse: runn → run, stopp → stop
            collapsed = _DOUBLE_CONS_RE.sub(r"\1", s)
            if collapsed != s:
                _add(collapsed)

    for suffix, replacement in _SUFFIX_RULES:
        if word.endswith(suffix) and len(word) > len(suffix):
            _add(word[: len(word) - len(suffix)] + replacement)
    return candidates


def _fuzzy_match(word: str) -> str | None:
    """
    Try to resolve *word* to a vocabulary entry via:
      1. Stemming rules applied to the word itself, then each stem
         checked directly against _WORD_LOOKUP.
      2. difflib close-match on the full vocab list.
         Minimum word length 5 for difflib to avoid false positives on
         short words ("hi"→"hit", "hey"→"they").

    Returns the matched vocabulary key or None.
    """
    # 1. Stem-based exact lookup (already includes doubled-consonant collapse)
    for stem in _stem_candidates(word):
        if stem in _WORD_LOOKUP:
            return stem

    # 2. difflib fuzzy match — only for words of 5+ chars to avoid short-word noise
    if len(word) >= 5:
        matches = get_close_matches(word, _VOCAB_LIST, n=1, cutoff=0.80)
        return matches[0] if matches else None

    return None


def _make_entry(matched_word: str, original_word: str, fuzzy: bool) -> dict:
    """Build a result dict for a successfully matched vocabulary word."""
    entries = _WORD_LOOKUP[matched_word]
    best    = entries[0]
    vid     = best["video_id"]
    local   = _VIDEOS_DIR / f"{vid}.mp4"
    return {
        "word":         original_word,     # what the user typed
        "matched_word": matched_word,      # the vocabulary entry used
        "found":        True,
        "fuzzy":        fuzzy,             # True when resolved via stem/fuzzy
        "video_id":     vid,
        "video_url":    f"/video/{vid}" if local.exists() else None,
        "external_url": best["external_url"],
        "all_entries":  entries,
    }


def _resolve_tokens(tokens: list[str]) -> list[dict]:
    """
    Resolve tokens to WLASL vocabulary entries.

    Priority order for each position:
      1. Two-word bigram exact match  (e.g. "thank you")
      2. Single-token exact match
      3. Stemming + difflib fuzzy match

    Each result dict includes:
      word          — the word the user typed
      matched_word  — the vocabulary entry actually used (may differ for fuzzy)
      fuzzy         — True when resolved via stemming/fuzzy
      found         — True when any match succeeded
      video_url     — local /video/<id> path when the mp4 exists
      external_url  — CDN fallback from WLASL dataset
    """
    results = []
    i = 0
    while i < len(tokens):
        # 1. Bigram exact match
        if i + 1 < len(tokens):
            bigram = f"{tokens[i]} {tokens[i+1]}"
            if bigram in _WORD_LOOKUP:
                results.append(_make_entry(bigram, bigram, fuzzy=False))
                i += 2
                continue

        word = tokens[i]

        # 2. Exact single-token match
        if word in _WORD_LOOKUP:
            results.append(_make_entry(word, word, fuzzy=False))
            i += 1
            continue

        # 3. Fuzzy / stem match
        match = _fuzzy_match(word)
        if match:
            results.append(_make_entry(match, word, fuzzy=True))
        else:
            results.append({
                "word":         word,
                "matched_word": None,
                "found":        False,
                "fuzzy":        False,
                "video_id":     None,
                "video_url":    None,
                "external_url": None,
                "all_entries":  [],
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
