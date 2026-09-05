import json
import os
import re
from difflib import get_close_matches
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file, abort

_ROUTES_DIR  = Path(__file__).parent
_BACKEND_DIR = _ROUTES_DIR.parent
_VIDEOS_DIR  = _BACKEND_DIR / "data" / "WLASL" / "videos"
_JSON_PATH   = _BACKEND_DIR / "data" / "WLASL" / "curated_WLASL.json"

text_to_sign = Blueprint("text_to_sign", __name__)

_SPLIT_ORDER = {"val": 0, "train": 1, "test": 2}


# Build word -> video entry lookup from curated_WLASL.json at import time
def _build_lookup() -> dict:
    if not _JSON_PATH.exists():
        return {}
    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    lookup: dict[str, list[dict]] = {}
    for entry in data:
        word = entry["gloss"].lower().strip()
        local_candidates = []
        remote_candidates = []

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

        local_candidates.sort(key=lambda x: x[0])
        remote_candidates.sort(key=lambda x: x[0])

        all_candidates = [d for _, d in local_candidates] + [d for _, d in remote_candidates]
        if all_candidates:
            lookup[word] = all_candidates
    return lookup


_WORD_LOOKUP: dict[str, list[dict]] = _build_lookup()
_VOCAB_LIST: list[str] = sorted(_WORD_LOOKUP.keys())

_SUFFIX_RULES: list[tuple[str, str]] = [
    ("tions", "te"),
    ("tions", ""),
    ("tion",  "te"),
    ("tion",  ""),
    ("ings",  "e"),
    ("ings",  ""),
    ("ing",   "e"),
    ("ing",   ""),
    ("ers",   "e"),
    ("ers",   ""),
    ("er",    "e"),
    ("er",    ""),
    ("ness",  "y"),
    ("ness",  ""),
    ("ied",   "y"),
    ("ied",   "ie"),
    ("ves",   "f"),
    ("ves",   "fe"),
    ("oes",   "o"),
    ("oes",   ""),
    ("ies",   "y"),
    ("ies",   ""),
    ("ed",    "e"),
    ("ed",    ""),
    ("ly",    ""),
    ("s",     ""),
    ("'s",    ""),
    ("'t",    ""),
]

_DOUBLE_CONS_RE = re.compile(r"([bcdfghjklmnpqrstvwxyz])\1$")


# Lowercase and tokenise input text into a list of words
def _tokenise(text: str) -> list[str]:
    text = text.lower().strip()
    text = re.sub(r"[^a-z\s']", " ", text)
    return text.split()


# Return deduplicated stem candidates derived from suffix stripping rules
def _stem_candidates(word: str) -> list[str]:
    seen: set[str] = set()
    candidates: list[str] = []

    def _add(s: str) -> None:
        if len(s) >= 3 and s not in seen:
            seen.add(s)
            candidates.append(s)
            collapsed = _DOUBLE_CONS_RE.sub(r"\1", s)
            if collapsed != s:
                _add(collapsed)

    for suffix, replacement in _SUFFIX_RULES:
        if word.endswith(suffix) and len(word) > len(suffix):
            _add(word[: len(word) - len(suffix)] + replacement)
    return candidates


# Try to resolve a word to a vocabulary entry via stemming then difflib fuzzy match
def _fuzzy_match(word: str) -> str | None:
    for stem in _stem_candidates(word):
        if stem in _WORD_LOOKUP:
            return stem

    if len(word) >= 5:
        matches = get_close_matches(word, _VOCAB_LIST, n=1, cutoff=0.80)
        return matches[0] if matches else None

    return None


# Build the result dict for a successfully matched vocabulary word
def _make_entry(matched_word: str, original_word: str, fuzzy: bool) -> dict:
    entries = _WORD_LOOKUP[matched_word]
    best    = entries[0]
    vid     = best["video_id"]
    local   = _VIDEOS_DIR / f"{vid}.mp4"
    return {
        "word":         original_word,
        "matched_word": matched_word,
        "found":        True,
        "fuzzy":        fuzzy,
        "video_id":     vid,
        "video_url":    f"/video/{vid}" if local.exists() else None,
        "external_url": best["external_url"],
        "all_entries":  entries,
    }


# Resolve a list of tokens to WLASL vocabulary entries using bigram, exact, then fuzzy match
def _resolve_tokens(tokens: list[str]) -> list[dict]:
    results = []
    i = 0
    while i < len(tokens):
        if i + 1 < len(tokens):
            bigram = f"{tokens[i]} {tokens[i+1]}"
            if bigram in _WORD_LOOKUP:
                results.append(_make_entry(bigram, bigram, fuzzy=False))
                i += 2
                continue

        word = tokens[i]

        if word in _WORD_LOOKUP:
            results.append(_make_entry(word, word, fuzzy=False))
            i += 1
            continue

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


# Report whether the local WLASL video dataset is present on disk
@text_to_sign.route("/text-to-sign/status", methods=["GET"])
def dataset_status():
    has_local = _VIDEOS_DIR.exists() and any(_VIDEOS_DIR.glob("*.mp4"))
    sample_count = sum(1 for _ in _VIDEOS_DIR.glob("*.mp4")) if has_local else 0
    return jsonify({
        "local_videos_available": has_local,
        "local_video_count": sample_count,
        "videos_dir": str(_VIDEOS_DIR),
    }), 200


# Tokenise input text and return an ordered list of matching WLASL video entries
@text_to_sign.route("/text-to-sign", methods=["POST"])
def convert_text():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "Field 'text' is required and cannot be empty"}), 400

    tokens = _tokenise(text)
    if not tokens:
        return jsonify({"error": "No valid words found in input"}), 400

    words    = _resolve_tokens(tokens)
    found    = sum(1 for w in words if w["found"])
    total    = len(words)
    coverage = round(found / total, 3) if total else 0.0

    return jsonify({
        "words":       words,
        "coverage":    coverage,
        "total_words": total,
        "found_words": found,
        "input_text":  text,
    }), 200


# Return the full sorted list of supported vocabulary words
@text_to_sign.route("/text-to-sign/vocabulary", methods=["GET"])
def vocabulary():
    return jsonify({
        "words": sorted(_WORD_LOOKUP.keys()),
        "count": len(_WORD_LOOKUP),
    }), 200


# Stream a local WLASL mp4 file with range-request support for HTML video seek
@text_to_sign.route("/video/<video_id>", methods=["GET"])
def serve_video(video_id: str):
    if not re.match(r"^\d{1,6}$", video_id):
        abort(400, description="Invalid video_id format")

    padded = video_id.zfill(5)
    mp4_path = _VIDEOS_DIR / f"{padded}.mp4"

    if not mp4_path.exists():
        abort(404, description=f"Video {padded}.mp4 not found in local dataset")

    return send_file(
        str(mp4_path),
        mimetype="video/mp4",
        conditional=True,
    )
