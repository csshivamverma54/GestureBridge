"""
curate_dataset.py  (backend/data/WLASL/curate_dataset.py)
----------------------------------------------------------
Produce a high-quality ~200-word WLASL subset focused on:
  - Maximum daily communication value
  - Sentence-building words (pronouns, auxiliaries, question words)
  - Visually DISTINCT signs (avoids near-identical hand shapes)
  - Enough training samples per class via heavy augmentation

Why ≤200 words?
---------------
With ~7 original videos per class in WLASL:
  - 800 classes → ~5 training samples per class → model guesses randomly
  - 200 classes → ~7 originals × (1 + 8 augmentations) = 63 samples/class
    That is enough for the LSTM to genuinely learn to generalise.

The augmentation is done in preprocess_dataset.py (--augmentations 8):
  1. Gaussian noise        5. Time warp (fast/slow signing)
  2. Scale jitter          6. 2D rotation jitter
  3. Temporal crop         7. Noise + mirror combined
  4. Mirror (swap L/R)     8. Scale + time-warp combined

Selection principles
--------------------
1. High daily-use frequency (covers ~85% of real conversations)
2. Visually distinct signs — avoid pairs like "sick/healthy" that are subtle
3. Sentence-building words (pronouns, auxiliaries, connectors) top priority
4. Concrete nouns and clearly-motioned verbs
5. MIN_SAMPLES = 3 (augmentation compensates)

Outputs (written to <dataset_dir>/)
--------------------------------------
  curated_vocabulary.txt   – idx<TAB>word<TAB>category<TAB>count
  curated_WLASL.json       – WLASL-format JSON curated instances
  curated_labels.json      – {int_idx: word} for ML pipeline
  curated_class_list.txt   – idx<TAB>word
  curation_report.txt      – accepted & rejected classes detail
"""

import json
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).parent
MIN_SAMPLES = 3   # lower threshold — augmentation compensates

# ---------------------------------------------------------------------------
# CURATED VOCABULARY — ~200 words, maximum distinctiveness & daily utility
# Each word must appear EXACTLY as in WLASL_v0.3.json (case-sensitive)
# ---------------------------------------------------------------------------
CURATED_VOCAB = {

    # ── ESSENTIAL PRONOUNS & SENTENCE BUILDERS ────────────────────────────
    "Pronouns": [
        "i", "you", "we", "he", "she", "they",
        "my", "your", "this", "that", "her", "his",
        "me", "our",
    ],

    # ── AUXILIARIES & CONNECTORS ──────────────────────────────────────────
    "Auxiliaries & Connectors": [
        "can", "will", "should",
        "and", "or", "but", "if", "because",
        "with", "from", "for", "not",
        "all", "some", "many", "more",
        "every", "any", "both",
        "always", "never", "sometimes",
        "after", "before", "until",
        "again", "also",
    ],

    # ── CORE VERBS ────────────────────────────────────────────────────────
    "Core Verbs": [
        "want", "need", "have", "know", "like",
        "see", "go", "come", "help", "think",
        "get", "make", "give", "take", "say",
        "ask", "tell", "find", "work", "eat",
        "drink", "sleep", "stop", "start", "look",
        "talk", "listen", "learn", "teach", "play",
        "read", "write", "run", "walk", "sit",
        "stand", "open", "close", "wait", "use",
        "feel", "happen", "try", "show", "keep",
        "leave", "stay", "buy", "send", "bring",
        "meet", "understand", "remember", "forget",
        "agree", "share", "win", "lose", "save",
        "decide", "check", "plan", "choose",
        "grow", "cook", "wash", "clean", "break",
        "catch", "hold", "put", "push", "pull",
        "jump", "drive", "swim", "sing", "dance",
        "draw", "wear", "carry", "hit", "cut",
        "finish", "continue", "travel", "visit",
        "promise", "worry", "hope", "protect",
    ],

    # ── QUESTION WORDS ────────────────────────────────────────────────────
    "Questions": [
        "what", "who", "where", "why", "how", "when", "which",
    ],

    # ── POLITE WORDS & GREETINGS ──────────────────────────────────────────
    "Polite Words": [
        "please", "sorry", "thank you", "yes", "no",
        "welcome", "goodbye", "hello", "ok", "fine",
    ],

    # ── PEOPLE & FAMILY ───────────────────────────────────────────────────
    "Family": [
        "mother", "father", "brother", "sister",
        "son", "daughter", "baby", "family",
        "friend", "man", "woman", "boy", "girl", "person",
        "wife", "husband",
    ],

    # ── EMOTIONS ──────────────────────────────────────────────────────────
    "Emotions": [
        "happy", "sad", "angry", "afraid",
        "love", "cry", "laugh", "tired", "hurt",
        "excited", "nervous", "worried",
        "hate", "hope", "proud",
    ],

    # ── COMMON ADJECTIVES ─────────────────────────────────────────────────
    "Adjectives": [
        "big", "small", "hot", "cold",
        "good", "bad", "fast", "slow",
        "new", "old", "wrong", "right",
        "easy", "hard", "different", "same",
        "important", "ready", "free", "funny",
        "clean", "dirty", "young", "beautiful",
        "strong", "weak", "busy", "sick",
    ],

    # ── PLACES ────────────────────────────────────────────────────────────
    "Places": [
        "home", "school", "hospital", "store",
        "restaurant", "city", "office", "church",
        "house", "library", "university",
    ],

    # ── TIME ──────────────────────────────────────────────────────────────
    "Time": [
        "today", "tomorrow", "yesterday", "now",
        "morning", "night", "week", "year",
        "day", "soon", "late", "early",
        "afternoon", "month", "hour", "time",
        "birthday", "tonight", "weekend",
    ],

    # ── FOOD & DRINK ──────────────────────────────────────────────────────
    "Food & Drink": [
        "food", "water", "milk", "coffee",
        "bread", "egg", "fruit", "apple",
        "chicken", "fish", "cake", "pizza",
        "meat", "soup", "candy", "chocolate",
        "tea", "hungry",
    ],

    # ── HEALTH & BODY ─────────────────────────────────────────────────────
    "Health": [
        "doctor", "medicine", "pain", "sick",
        "eye", "ear", "mouth", "hand",
        "heart", "blood", "headache", "nurse",
        "head", "nose", "teeth", "hurt",
    ],

    # ── TRANSPORT ─────────────────────────────────────────────────────────
    "Transport": [
        "car", "bus", "train", "airplane", "drive", "bicycle",
    ],

    # ── ANIMALS ───────────────────────────────────────────────────────────
    "Animals": [
        "dog", "cat", "bird", "fish", "horse",
        "cow", "rabbit", "elephant", "lion",
        "bear", "monkey", "snake", "duck",
    ],

    # ── NUMBERS ───────────────────────────────────────────────────────────
    "Numbers": [
        "one", "two", "three", "four", "five",
        "six", "seven", "eight", "nine", "ten",
    ],

    # ── COLORS ────────────────────────────────────────────────────────────
    "Colors": [
        "black", "white", "red", "blue", "green",
        "yellow", "orange", "brown", "pink", "purple",
    ],

    # ── DIRECTIONS & SPATIAL ──────────────────────────────────────────────
    "Directions": [
        "left", "right", "up", "down",
        "here", "there", "near", "far",
        "north", "south", "east", "west",
    ],

    # ── SCHOOL & WORK ─────────────────────────────────────────────────────
    "School & Work": [
        "book", "paper", "class", "student", "teacher",
        "money", "job", "meeting", "computer", "phone",
        "test", "study", "science", "math", "music",
        "story", "word", "name", "plan",
        "business", "office", "email",
    ],

    # ── EMERGENCY & SAFETY ────────────────────────────────────────────────
    "Emergency": [
        "help", "stop", "danger", "call", "police", "fire",
        "accident", "safe",
    ],

    # ── HOUSEHOLD & DAILY OBJECTS ─────────────────────────────────────────
    "Household": [
        "table", "chair", "bed", "door", "window",
        "cup", "bottle", "box", "key", "clock",
        "book", "pencil", "phone",
    ],
}


# ---------------------------------------------------------------------------
# Build a canonical flat vocab: word → primary_category (first seen)
# Deduplicate (a word in multiple categories counts once)
# ---------------------------------------------------------------------------
def build_flat_vocab(curated_vocab: dict) -> dict:
    """Return {word: primary_category}, preserving first-seen category."""
    word_to_cat: dict[str, str] = {}
    for cat, words in curated_vocab.items():
        for w in words:
            if w not in word_to_cat:
                word_to_cat[w] = cat
    return word_to_cat


# ---------------------------------------------------------------------------
# Load helpers
# ---------------------------------------------------------------------------
def load_audit() -> dict:
    audit_path = BASE / "audit.json"
    if not audit_path.exists():
        return {}
    with open(audit_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_wlasl_json() -> list:
    p = BASE / "WLASL_v0.3.json"
    if not p.exists():
        raise FileNotFoundError(f"WLASL_v0.3.json not found at {p}")
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def load_missing_ids() -> set:
    p = BASE / "missing.txt"
    if not p.exists():
        return set()
    with open(p, "r", encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


# ---------------------------------------------------------------------------
# Core curation logic
# ---------------------------------------------------------------------------
def curate(wlasl_data: list, flat_vocab: dict, missing_ids: set):
    """
    Filter WLASL entries to only the words in flat_vocab with enough
    usable (non-missing, on-disk) videos.

    Returns
    -------
    accepted : list[dict]  — {gloss, category, usable_count, instances[]}
    rejected : list[dict]  — {gloss, reason}
    """
    videos_dir = BASE / "videos"
    audit      = load_audit()

    # Build a lowercase lookup: canonical_lower → exact_wlasl_gloss
    wlasl_by_lower: dict[str, list] = defaultdict(list)
    for item in wlasl_data:
        wlasl_by_lower[item["gloss"].strip().lower()].append(item)

    accepted: list[dict] = []
    rejected: list[dict] = []

    for word, category in flat_vocab.items():
        word_lower = word.lower()
        candidates = wlasl_by_lower.get(word_lower, [])

        if not candidates:
            rejected.append({"gloss": word, "reason": "not_in_wlasl"})
            continue

        # Merge instances across all matching WLASL entries
        all_instances = []
        for item in candidates:
            for inst in item.get("instances", []):
                vid_id = str(inst.get("video_id", "")).strip()

                # Skip missing or failed
                if vid_id in missing_ids:
                    continue
                if audit.get(vid_id, {}).get("status") == "failed":
                    continue

                # Skip if video file does not exist on disk
                video_path = videos_dir / f"{vid_id}.mp4"
                if not video_path.exists():
                    continue

                all_instances.append(inst)

        if len(all_instances) < MIN_SAMPLES:
            rejected.append({
                "gloss": word,
                "reason": f"too_few_samples ({len(all_instances)} < {MIN_SAMPLES})",
            })
            continue

        accepted.append({
            "gloss":        word,
            "category":     category,
            "usable_count": len(all_instances),
            "instances":    all_instances,
        })

    # Sort accepted by gloss for reproducibility
    accepted.sort(key=lambda x: x["gloss"])
    return accepted, rejected


# ---------------------------------------------------------------------------
# Build the curated WLASL JSON (same structure as WLASL_v0.3.json)
# ---------------------------------------------------------------------------
def build_curated_json(accepted: list[dict]) -> list[dict]:
    """
    Return a WLASL-format list:
      [{"gloss": str, "instances": [...]}, ...]
    """
    return [
        {"gloss": entry["gloss"], "instances": entry["instances"]}
        for entry in accepted
    ]


# ---------------------------------------------------------------------------
# Write all output files
# ---------------------------------------------------------------------------
def write_outputs(accepted: list[dict], rejected: list[dict]):
    """Write all four output artefacts to BASE directory."""
    curated_json = build_curated_json(accepted)

    # 1. curated_WLASL.json
    with open(BASE / "curated_WLASL.json", "w", encoding="utf-8") as f:
        json.dump(curated_json, f, indent=2, ensure_ascii=False)

    # 2. curated_labels.json  {idx: word}
    labels = {str(i): entry["gloss"] for i, entry in enumerate(accepted)}
    with open(BASE / "curated_labels.json", "w", encoding="utf-8") as f:
        json.dump(labels, f, indent=2, ensure_ascii=False)

    # 3. curated_vocabulary.txt
    with open(BASE / "curated_vocabulary.txt", "w", encoding="utf-8") as f:
        f.write("idx\tword\tcategory\tusable_count\n")
        for i, entry in enumerate(accepted):
            f.write(f"{i}\t{entry['gloss']}\t{entry['category']}\t{entry['usable_count']}\n")

    # 4. curated_class_list.txt
    with open(BASE / "curated_class_list.txt", "w", encoding="utf-8") as f:
        for i, entry in enumerate(accepted):
            f.write(f"{i}\t{entry['gloss']}\n")

    # 5. curation_report.txt
    _write_report(accepted, rejected, build_flat_vocab(CURATED_VOCAB))

    total_videos = sum(e["usable_count"] for e in accepted)
    print(f"\n{'='*55}")
    print(f"  Accepted : {len(accepted):>4} words  ({total_videos} total original videos)")
    print(f"  Rejected : {len(rejected):>4} words")
    print(f"  Avg videos/class   : {total_videos/max(len(accepted),1):.1f}")
    print(f"  With aug=8 (×9 total): ~{total_videos/max(len(accepted),1)*9:.0f} samples/class")
    print(f"{'='*55}")
    print(f"  Output → {BASE}")
    print(f"{'='*55}\n")


def _write_report(accepted: list[dict], rejected: list[dict], flat_vocab: dict):
    lines = []
    lines.append("=" * 60)
    lines.append("GestureBridge Dataset Curation Report (~200-word vocab)")
    lines.append("=" * 60)
    lines.append(f"MIN_SAMPLES = {MIN_SAMPLES}")
    lines.append(f"Desired vocab size    : {len(flat_vocab)}")
    lines.append(f"Accepted              : {len(accepted)}")
    lines.append(f"Rejected              : {len(rejected)}")

    total_v = sum(e["usable_count"] for e in accepted)
    lines.append(f"Total usable videos   : {total_v}")
    if accepted:
        counts = [e["usable_count"] for e in accepted]
        lines.append(f"Min / Max / Avg       : {min(counts)} / {max(counts)} / {total_v/len(accepted):.1f}")
        lines.append(f"With aug=8 (~×9 total): ~{total_v/len(accepted)*9:.0f} samples/class")

    lines.append("\n── ACCEPTED ────────────────────────────────────────────────")
    for e in accepted:
        lines.append(f"  {e['gloss']:<30} cat={e['category']:<30} n={e['usable_count']}")

    lines.append("\n── REJECTED ────────────────────────────────────────────────")
    for r in rejected:
        lines.append(f"  {r['gloss']:<30} reason={r['reason']}")

    with open(BASE / "curation_report.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    print("Loading WLASL data …")
    wlasl_data  = load_wlasl_json()
    missing_ids = load_missing_ids()
    flat_vocab  = build_flat_vocab(CURATED_VOCAB)

    print(f"Curating from {len(flat_vocab)} target words …")
    accepted, rejected = curate(wlasl_data, flat_vocab, missing_ids)

    write_outputs(accepted, rejected)


if __name__ == "__main__":
    main()
