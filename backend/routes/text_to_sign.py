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


# Lowercase and tokenise input text into a list of words, preserving Devanagari & Latin
def _tokenise(text: str) -> list[str]:
    text = text.lower().strip()
    # Keep standard letters a-z, Devanagari \u0900-\u097f, apostrophes and spaces
    text = re.sub(r"[^a-z\u0900-\u097f\s']", " ", text)
    return text.split()


# Multilingual dictionary: Hindi (Devanagari & Hinglish) and Marathi (Devanagari & Romanized) -> WLASL English sign glosses
_MULTILINGUAL_MAP: dict[str, str] = {
    # Greetings & Common Expressions
    "नमस्ते": "hello", "namaste": "hello", "नमस्कार": "hello", "namaskar": "hello", "प्रणाम": "hello", "pranam": "hello", "हाय": "hello", "hi": "hello",
    "धन्यवाद": "thank you", "dhanyavaad": "thank you", "dhanyavad": "thank you", "शुक्रिया": "thank you", "shukriya": "thank you", "आभार": "thank you", "aabhar": "thank you",
    "मदद": "help", "madad": "help", "मदत": "help", "madat": "help", "सहायता": "help", "sahayata": "help",
    "कृपया": "please", "kripya": "please", "krupaya": "please", "krpya": "please",
    "हाँ": "yes", "haan": "yes", "ha": "yes", "हो": "yes", "ho": "yes", "जी": "yes",
    "नहीं": "no", "nahi": "no", "nahin": "no", "नाही": "no", "ना": "no",
    "अलविदा": "bye", "alvida": "bye", "बाय": "bye",
    "सुप्रभात": "good morning", "suprabhat": "good morning", "शुभ प्रभात": "good morning", "shubh prabhat": "good morning",
    "शुभ रात्रि": "good night", "shubh ratri": "good night",
    "आप कैसे हैं": "how are you", "कसे आहात": "how are you", "tum kaise ho": "how are you", "aap kaise ho": "how are you",
    "माफ़ करना": "sorry", "maaf karna": "sorry", "माफ करा": "sorry", "माफी": "sorry",

    # Pronouns & People
    "नाम": "name", "naam": "name", "नाव": "name", "naav": "name",
    "मैं": "me", "main": "me", "मी": "me", "mee": "me", "mujhe": "me", "मला": "me",
    "आप": "you", "aap": "you", "तुम": "you", "tum": "you", "तुम्ही": "you", "tumhi": "you", "तू": "you", "tu": "you",
    "हम": "we", "hum": "we", "आम्ही": "we", "aamhi": "we",
    "दोस्त": "friend", "dost": "friend", "मित्र": "friend", "mitra": "friend", "यार": "friend",
    "परिवार": "family", "parivaar": "family", "parivar": "family", "कुटुंब": "family", "kutumb": "family",
    "माँ": "mother", "माता": "mother", "maa": "mother", "mata": "mother", "आई": "mother", "aai": "mother",
    "पिता": "father", "पिताजी": "father", "pita": "father", "बाबा": "father", "baba": "father",
    "भाई": "brother", "bhai": "brother", "भाऊ": "brother", "bhau": "brother", "bhaiya": "brother",
    "बहन": "sister", "behan": "sister", "बहीण": "sister", "bahin": "sister", "didi": "sister",
    "बच्चा": "child", "baccha": "child", "मुलगा": "boy", "mulga": "boy", "लड़का": "boy", "ladka": "boy",
    "लड़की": "girl", "ladki": "girl", "मुलगी": "girl", "mulgi": "girl",
    "आदमी": "man", "aadmi": "man", "माणूस": "man", "manus": "man",
    "महिला": "woman", "mahila": "woman", "औरत": "woman", "aurat": "woman", "स्त्री": "woman",
    "डॉक्टर": "doctor", "doctor": "doctor", "वैद्य": "doctor",
    "शिक्षक": "teacher", "shikshak": "teacher", "गुरु": "teacher", "गुरुजी": "teacher",
    "छात्र": "student", "chhatra": "student", "विद्यार्थी": "student", "vidyarthi": "student",

    # Everyday Needs, Places & Objects
    "पानी": "water", "paani": "water", "pani": "water", "जल": "water",
    "खाना": "food", "khana": "food", "भोजन": "food", "bhojan": "food", "जेवण": "food", "jevan": "food",
    "दूध": "milk", "doodh": "milk", "dudh": "milk",
    "चाय": "tea", "chai": "tea",
    "घर": "home", "ghar": "home", "सदन": "home",
    "स्कूल": "school", "विद्यालय": "school", "vidyalaya": "school", "शाळा": "school", "shala": "school",
    "अस्पताल": "hospital", "aspatal": "hospital", "दवाखाना": "hospital", "davakhana": "hospital",
    "किताब": "book", "kitab": "book", "पुस्तक": "book", "pustak": "book",
    "काम": "work", "kaam": "work", "कामकाज": "work",
    "गाड़ी": "car", "gaadi": "car", "gadi": "car", "कार": "car",
    "बिल्ली": "cat", "billi": "cat", "मांजर": "cat", "manjar": "cat",
    "कुत्ता": "dog", "kutta": "dog", "कुत्रा": "dog", "kultra": "dog",
    "दिन": "day", "din": "day", "दिवस": "day", "divas": "day",
    "रात": "night", "raat": "night", "रात्र": "night",
    "आज": "today", "aaj": "today",
    "कल": "tomorrow", "kal": "tomorrow", "उद्या": "tomorrow", "udya": "tomorrow",
    "समय": "time", "samay": "time", "वेळ": "time", "vel": "time",

    # Emotions, Actions & States
    "प्यार": "love", "pyaar": "love", "प्रेम": "love", "prem": "love",
    "अच्छा": "good", "accha": "good", "achha": "good", "छान": "good", "chhan": "good", "चांगला": "good",
    "बुरा": "bad", "bura": "bad", "वाईट": "bad", "vait": "bad", "खराब": "bad",
    "खुश": "happy", "khush": "happy", "आनंदी": "happy", "anandi": "happy",
    "उदास": "sad", "udaas": "sad", "दुखी": "sad", "dukhi": "sad",
    "बीमार": "sick", "bimar": "sick", "आजारी": "sick", "aajari": "sick",
    "थका": "tired", "thaka": "tired", "दमलेला": "tired", "damlela": "tired",
    "बड़ा": "big", "bada": "big", "मोठा": "big", "motha": "big",
    "छोटा": "small", "chhota": "small", "लहान": "small", "lahan": "small",
    "गरम": "hot", "garam": "hot",
    "ठंडा": "cold", "thanda": "cold", "गार": "cold",
    "तेज़": "fast", "tez": "fast",
    "धीमा": "slow", "dheema": "slow", "हळू": "slow",
    "सुंदर": "beautiful", "sundar": "beautiful",
    "जाना": "go", "jaana": "go", "jaa": "go", "जा": "go",
    "आना": "come", "aana": "come", "aa": "come", "ये": "come",
    "पीना": "drink", "peena": "drink",
    "सोना": "sleep", "sona": "sleep", "झोप": "sleep",
    "देखना": "see", "dekhna": "see", "पहा": "see",
    "सुनना": "hear", "sunna": "hear", "ऐका": "hear",
    "बोलना": "speak", "bolna": "speak", "बोला": "speak",
    "पढ़ना": "read", "padhna": "read", "वाचा": "read",
    "लिखना": "write", "likhna": "write", "लिहा": "write",
    "खेलना": "play", "khelna": "play", "खेळा": "play",
    "सीखना": "learn", "seekhna": "learn", "शिका": "learn",
    "समझना": "understand", "samajhna": "understand", "समजले": "understand",
    "रुकना": "stop", "rukna": "stop", "थांबा": "stop",
    "शुरू": "start", "shuru": "start",
    "खत्म": "finish", "khatam": "finish", "पूर्ण": "finish",
    "चाहना": "want", "chahna": "want", "हवे": "want",
    "ज़रूरत": "need", "zaroorat": "need", "गरज": "need",
    "सोचना": "think", "sochna": "think", "विचार": "think",
    "जानना": "know", "jaanna": "know", "माहित": "know",
    "पसंद": "like", "pasand": "like", "आवड": "like",
    "क्या": "what", "kya": "what", "काय": "what", "kaay": "what",
    "कहाँ": "where", "kahan": "where", "कुठे": "where", "kuthe": "where",
    "कब": "when", "kab": "when", "केव्हा": "when", "keva": "when",
    "क्यों": "why", "kyun": "why", "का": "why",
    "कैसे": "how", "kaise": "how", "कसे": "how", "kase": "how",
    "कौन": "who", "kaun": "who", "कोण": "who", "kon": "who",
}


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


# Resolve a list of tokens to WLASL vocabulary entries using multilingual, bigram, exact, then fuzzy match
def _resolve_tokens(tokens: list[str]) -> list[dict]:
    results = []
    i = 0
    while i < len(tokens):
        # 1. Check trigrams in multilingual map and WLASL lookup
        if i + 2 < len(tokens):
            trigram = f"{tokens[i]} {tokens[i+1]} {tokens[i+2]}"
            if trigram in _MULTILINGUAL_MAP and _MULTILINGUAL_MAP[trigram] in _WORD_LOOKUP:
                matched = _MULTILINGUAL_MAP[trigram]
                results.append(_make_entry(matched, trigram, fuzzy=False))
                i += 3
                continue
            if trigram in _WORD_LOOKUP:
                results.append(_make_entry(trigram, trigram, fuzzy=False))
                i += 3
                continue

        # 2. Check bigrams in multilingual map and WLASL lookup
        if i + 1 < len(tokens):
            bigram = f"{tokens[i]} {tokens[i+1]}"
            if bigram in _MULTILINGUAL_MAP and _MULTILINGUAL_MAP[bigram] in _WORD_LOOKUP:
                matched = _MULTILINGUAL_MAP[bigram]
                results.append(_make_entry(matched, bigram, fuzzy=False))
                i += 2
                continue
            if bigram in _WORD_LOOKUP:
                results.append(_make_entry(bigram, bigram, fuzzy=False))
                i += 2
                continue

        word = tokens[i]

        # 3. Check single token in multilingual map (Hindi / Marathi -> English sign gloss)
        if word in _MULTILINGUAL_MAP and _MULTILINGUAL_MAP[word] in _WORD_LOOKUP:
            matched = _MULTILINGUAL_MAP[word]
            results.append(_make_entry(matched, word, fuzzy=False))
            i += 1
            continue

        # 4. Check exact English WLASL sign gloss
        if word in _WORD_LOOKUP:
            results.append(_make_entry(word, word, fuzzy=False))
            i += 1
            continue

        # 5. English Stemming & Fuzzy matching
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
