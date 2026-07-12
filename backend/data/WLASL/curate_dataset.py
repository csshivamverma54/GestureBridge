"""
curate_dataset.py  (backend/data/WLASL/curate_dataset.py)
----------------------------------------------------------
Produce a high-quality, communication-focused ~800-word WLASL subset.

Selection criteria
------------------
  - Useful for daily communication (deaf ↔ hearing)
  - Sentence-building words (articles, pronouns, prepositions, conjunctions,
    auxiliaries, determiners) for natural sentence construction.
  - Greetings, family, food, medical, emergency, school, workplace,
    transport, home, shopping, actions, emotions, time, numbers, colors,
    questions, directions, polite expressions, adjectives, verbs, nouns.
  - Minimum MIN_SAMPLES usable videos per class (configurable, default 5).
  - Scientific terms, slang, proper nouns, extremely-niche words excluded.

Outputs (written to <dataset_dir>/)
---------------------------------------
  curated_vocabulary.txt       – tab-separated: idx<TAB>word<TAB>category<TAB>usable_count
  curated_WLASL.json           – WLASL-format JSON with only curated instances
  curated_labels.json          – {int_idx: word} for ML pipeline
  curated_class_list.txt       – idx<TAB>word (drop-in for wlasl_class_list.txt)
  curation_report.txt          – detailed report: accepted & rejected classes
"""

import json
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).parent
MIN_SAMPLES = 5          # minimum usable videos required to include a class

# ───────────────────────────────────────────────────────────────────────────
# CURATED VOCABULARY (~800 words)
# Organised into communication-focused categories.
# Each entry: word_exactly_as_in_WLASL_v0.3.json
# ───────────────────────────────────────────────────────────────────────────
CURATED_VOCAB = {
    # ── SENTENCE BUILDING (pronouns, articles, conjunctions, prepositions,
    #    auxiliaries, determiners) ─────────────────────────────────────────
    "Pronouns": [
        "i", "you", "we", "he", "she", "they", "it",
        "me", "my", "your", "his", "her", "our", "their",
        "myself", "yourself", "himself", "herself", "themselves",
        "this", "that", "these", "those",
    ],
    "Conjunctions & Connectors": [
        "and", "but", "because", "if", "or", "so", "then",
        "also", "about", "against", "another", "any", "anyway",
        "around", "between", "during", "every", "for", "from",
        "in", "instead", "into", "not", "of", "on", "out",
        "some", "than", "through", "to", "until", "with",
        "without", "yet",
    ],
    "Auxiliary & Modal Verbs": [
        "can", "must", "need", "want", "have", "use",
        "done", "let", "get", "keep", "allow", "agree",
        "become", "begin", "continue", "finish", "happen",
        "require", "seem", "stay",
    ],
    "Quantifiers & Determiners": [
        "all", "many", "more", "most", "much", "none",
        "only", "other", "few", "less", "almost", "enough",
        "several", "together", "both", "each", "every",
    ],
    "Adverbs & Degree Words": [
        "very", "really", "always", "never", "often", "now",
        "soon", "already", "again", "here", "there", "still",
        "just", "also", "even", "maybe", "almost", "later",
        "today", "tomorrow", "yesterday", "before", "after",
    ],

    # ── GREETINGS & POLITENESS ────────────────────────────────────────────
    "Greetings": [
        "goodbye", "bye", "sorry", "please", "thank you",
        "welcome", "good", "sign",
    ],
    "Polite Expressions": [
        "yes", "no", "ok", "right", "wrong", "fine",
        "help", "again", "true", "honest",
    ],

    # ── QUESTIONS ─────────────────────────────────────────────────────────
    "Questions": [
        "what", "who", "where", "why", "how", "which",
        "question", "when",
    ],

    # ── PEOPLE & FAMILY ───────────────────────────────────────────────────
    "People": [
        "man", "woman", "boy", "girl", "person", "people",
        "baby", "child", "children", "adult", "friend",
        "neighbor", "visitor", "member",
    ],
    "Family": [
        "mother", "father", "brother", "sister", "son",
        "daughter", "husband", "wife", "family", "cousin",
        "aunt", "uncle", "grandmother", "grandfather",
        "nephew", "niece", "mom", "dad",
    ],

    # ── EMOTIONS ──────────────────────────────────────────────────────────
    "Emotions": [
        "happy", "sad", "angry", "afraid", "love", "cry",
        "laugh", "smile", "excited", "bored", "nervous", "tired",
        "jealous", "lonely", "surprised", "proud", "embarrass",
        "shame", "worry", "joy", "pity", "confused", "curious",
        "guilty", "hope", "calm", "depressed",
    ],

    # ── COMMON VERBS ──────────────────────────────────────────────────────
    "Common Verbs": [
        "go", "come", "eat", "drink", "sleep", "walk", "run",
        "sit", "stand", "give", "take", "bring", "call", "talk",
        "listen", "see", "hear", "know", "think", "like", "find",
        "make", "work", "learn", "leave", "tell", "say", "show",
        "ask", "answer", "look", "open", "close", "move", "carry",
        "pull", "push", "put", "drop", "catch", "throw", "hit",
        "cut", "fix", "build", "draw", "paint", "sing", "dance",
        "fly", "drive", "ride", "jump", "climb", "fall", "rise",
        "pass", "follow", "meet", "visit", "order", "decide",
        "plan", "prepare", "start", "stop", "wait", "hurry",
        "lose", "win", "save", "spend", "share", "pay", "buy",
        "sell", "send", "receive", "check", "search", "practice",
        "discuss", "explain", "describe", "introduce", "invite",
        "copy", "break", "steal", "fight", "argue", "trust",
        "warn", "suggest", "approve", "refuse", "forget",
        "remember", "improve", "develop", "organize",
    ],

    # ── COMMON ADJECTIVES ─────────────────────────────────────────────────
    "Common Adjectives": [
        "big", "small", "tall", "short", "hot", "cold",
        "fast", "slow", "bad", "beautiful", "clean", "dirty",
        "full", "empty", "old", "new", "good", "dark", "bright",
        "heavy", "light", "hard", "soft", "thin", "fat", "cool",
        "strong", "weak", "sick", "healthy", "safe", "dangerous",
        "easy", "difficult", "possible", "important", "special",
        "cheap", "expensive", "quiet", "loud", "smart", "stupid",
        "funny", "strange", "perfect", "terrible", "great",
        "amazing", "wonderful", "awful", "nice", "pretty",
        "ugly", "smooth", "rough", "wet", "dry", "same",
        "different", "ready", "busy", "free", "open",
        "specific", "general", "final", "last", "first",
        "next", "recent", "early", "late",
    ],

    # ── COMMON NOUNS ──────────────────────────────────────────────────────
    "Common Nouns": [
        "computer", "phone", "language", "problem", "idea",
        "name", "word", "thing", "place", "time", "day",
        "number", "information", "story", "reason", "way",
        "fact", "point", "result", "example", "question",
        "answer", "topic", "sentence", "message", "letter",
        "list", "form", "document", "image", "picture",
        "music", "song", "art", "game", "team", "event",
        "holiday", "birthday", "party", "wedding", "trip",
        "vacation", "experience", "life", "world", "country",
        "city", "town", "community", "government", "law",
        "history", "science", "math", "technology", "internet",
        "camera", "radio", "television", "clock", "mirror",
        "key", "money", "card", "ticket", "bag",
    ],

    # ── FOOD & DRINKS ─────────────────────────────────────────────────────
    "Food": [
        "food", "bread", "chicken", "fish", "egg", "meat",
        "fruit", "vegetable", "apple", "banana", "potato",
        "tomato", "salt", "cake", "sandwich", "pizza",
        "cookie", "candy", "corn", "carrot", "onion",
        "lemon", "pepper", "sugar", "butter", "cheese",
        "soup", "salad", "cereal", "bacon", "breakfast",
        "lunch", "dinner", "dessert", "toast", "mushroom",
        "strawberry", "grapes", "peach", "lettuce",
        "french fries", "ice cream", "hot dog",
        "peanut butter", "shrimp",
    ],
    "Drinks": [
        "water", "milk", "coffee", "tea", "beer", "wine", "soda",
    ],

    # ── HOME ──────────────────────────────────────────────────────────────
    "Home": [
        "home", "house", "room", "door", "table", "chair",
        "bed", "kitchen", "bathroom", "key", "window",
        "wall", "floor", "ceiling", "closet", "shelf",
        "drawer", "couch", "pillow", "blanket", "lamp",
        "stairs", "basement", "bedroom", "dining room",
        "cabinet", "towel", "soap", "toilet", "shower",
    ],

    # ── CLOTHING ──────────────────────────────────────────────────────────
    "Clothing": [
        "clothes", "shirt", "pants", "dress", "shoes",
        "hat", "jacket", "coat", "skirt", "sweater",
        "belt", "socks", "underwear", "swimsuit",
        "tie", "ring", "bracelet", "necklace", "earring",
        "jewelry", "glasses", "helmet", "backpack",
        "gloves", "scarf",
    ],

    # ── SCHOOL & EDUCATION ────────────────────────────────────────────────
    "School": [
        "school", "student", "teacher", "class", "book",
        "paper", "study", "homework", "test", "lesson",
        "lecture", "grammar", "math", "science", "history",
        "geography", "biology", "chemistry", "physics",
        "algebra", "calculus", "linguistics", "library",
        "university", "college", "professor", "principal",
        "graduate", "diploma", "scholarship", "curriculum",
        "assignment", "project", "research", "score",
        "pencil", "eraser", "calculator", "keyboard",
        "notebook",
    ],

    # ── WORKPLACE ─────────────────────────────────────────────────────────
    "Workplace": [
        "work", "office", "boss", "money", "meeting",
        "business", "job", "salary", "manager", "worker",
        "team", "project", "deadline", "email", "report",
        "interview", "hire", "retire", "resign",
        "client", "contract", "budget", "profit",
        "presentation", "schedule",
    ],

    # ── MEDICAL & HEALTH ──────────────────────────────────────────────────
    "Medical": [
        "doctor", "nurse", "hospital", "medicine", "sick",
        "pain", "hurt", "surgery", "headache", "allergy",
        "health", "blood", "infection", "temperature",
        "thermometer", "dentist", "pharmacy", "patient",
        "appointment", "diagnosis", "therapy", "injury",
        "recover", "vomit", "cough", "fever", "sore throat",
        "diabetes", "blind", "deaf", "hearing", "hearing aid",
        "heart", "stomach", "arm", "ear", "eye", "nose",
        "neck", "mouth", "tongue", "tooth", "skin", "muscle",
    ],

    # ── EMERGENCY ─────────────────────────────────────────────────────────
    "Emergency": [
        "help", "police", "accident", "stop", "call",
        "danger", "siren", "shock", "fire", "escape",
        "arrest", "crash", "steal", "rob", "attack",
        "war", "disaster",
    ],

    # ── TRANSPORTATION ────────────────────────────────────────────────────
    "Transportation": [
        "car", "bus", "train", "airplane", "bicycle",
        "motorcycle", "drive", "street", "boat", "truck",
        "subway", "highway", "traffic", "road", "bridge",
        "station", "airport", "travel", "arrive", "depart",
        "taxi", "parking",
    ],

    # ── SHOPPING & MONEY ──────────────────────────────────────────────────
    "Shopping": [
        "shop", "buy", "sell", "pay", "price", "store",
        "dollar", "cent", "discount", "receipt", "order",
        "deliver", "auction", "trade", "market",
    ],

    # ── NUMBERS ───────────────────────────────────────────────────────────
    "Numbers": [
        "one", "two", "three", "four", "five",
        "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen",
        "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
        "hundred", "thousand", "million",
        "half", "quarter", "double",
    ],

    # ── COLORS ────────────────────────────────────────────────────────────
    "Colors": [
        "black", "white", "red", "blue", "green",
        "yellow", "orange", "brown", "pink", "purple",
        "gray", "silver", "gold", "tan",
    ],

    # ── TIME & DATES ──────────────────────────────────────────────────────
    "Time": [
        "time", "today", "tomorrow", "yesterday", "now",
        "later", "morning", "afternoon", "night", "week",
        "month", "year", "hour", "minute", "second",
        "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday",
        "january", "february", "march", "april", "may",
        "june", "july", "august", "september", "october",
        "november", "december",
        "spring", "summer", "autumn", "winter",
        "birthday", "holiday", "anniversary",
        "date", "schedule", "soon", "last", "next",
        "ago", "during", "since",
    ],

    # ── DIRECTIONS & POSITIONS ────────────────────────────────────────────
    "Directions": [
        "left", "right", "up", "down", "north", "south",
        "here", "front", "back", "east", "west", "center",
        "near", "far", "inside", "outside", "above",
        "below", "behind", "between", "across", "around",
        "top", "bottom", "side", "middle",
    ],

    # ── PLACES ────────────────────────────────────────────────────────────
    "Places": [
        "hospital", "restaurant", "library", "church",
        "city", "office", "school", "park", "museum",
        "market", "store", "hotel", "airport", "station",
        "stadium", "university", "college", "prison",
        "apartment", "farm", "forest", "mountain",
        "ocean", "river", "island", "earth",
    ],

    # ── DAILY ACTIVITIES ─────────────────────────────────────────────────
    "Daily Activities": [
        "cook", "wash", "play", "read", "write",
        "exercise", "swim", "run", "wake up", "get up",
        "go to bed", "brush", "comb", "shower", "eat",
        "drink", "dress", "work", "rest", "travel",
        "watch", "listen", "talk", "learn", "teach",
    ],

    # ── ANIMALS ───────────────────────────────────────────────────────────
    "Animals": [
        "dog", "cat", "bird", "fish", "horse",
        "cow", "pig", "chicken", "duck", "rabbit",
        "bear", "elephant", "lion", "tiger", "monkey",
        "snake", "frog", "butterfly", "bee", "spider",
        "wolf", "deer", "eagle", "whale", "shark",
        "turtle", "giraffe", "dinosaur",
    ],

    # ── NATURE & WEATHER ─────────────────────────────────────────────────
    "Nature & Weather": [
        "sun", "moon", "star", "cloud", "rain",
        "snow", "wind", "storm", "thunder", "lightning",
        "hot", "cold", "warm", "wet", "dry",
        "tree", "flower", "grass", "leaf", "mountain",
        "river", "ocean", "fire", "water", "earth",
        "day", "night", "sky",
    ],

    # ── SPORTS & RECREATION ───────────────────────────────────────────────
    "Sports": [
        "sport", "game", "play", "team", "win", "lose",
        "score", "practice", "basketball", "football",
        "baseball", "soccer", "tennis", "golf", "swimming",
        "volleyball", "race", "champion", "tournament",
        "medal", "trophy",
    ],

    # ── TECHNOLOGY ────────────────────────────────────────────────────────
    "Technology": [
        "computer", "phone", "internet", "email",
        "television", "radio", "camera", "keyboard",
        "printer", "calculator", "microphone", "laptop",
        "technology", "network", "social media",
        "video", "digital", "screen",
    ],

    # ── RELIGION & CULTURE ────────────────────────────────────────────────
    "Religion & Culture": [
        "church", "god", "pray", "christmas", "thanksgiving",
        "easter", "birthday", "wedding", "funeral",
        "tradition", "culture", "religion", "spirit",
        "celebrate", "parade",
    ],

    # ── SENTENCE VERBS (higher-level communication verbs) ─────────────────
    "Communication Verbs": [
        "talk", "tell", "say", "ask", "answer", "explain",
        "describe", "discuss", "argue", "agree", "disagree",
        "announce", "introduce", "invite", "promise",
        "warn", "suggest", "approve", "refuse", "convince",
        "inform", "communicate", "translate", "interpret",
        "sign language", "sign",
    ],
}


# ───────────────────────────────────────────────────────────────────────────
# Build a canonical flat vocab: word → primary_category (first cat found)
# Deduplicate — a word may appear in multiple category lists above but is
# counted only once in the final set.
# ───────────────────────────────────────────────────────────────────────────
def build_flat_vocab(curated_vocab: dict) -> dict:
    """Return {word: primary_category}, preserving first-seen category."""
    word_to_cat: dict[str, str] = {}
    for cat, words in curated_vocab.items():
        for w in words:
            if w not in word_to_cat:
                word_to_cat[w] = cat
    return word_to_cat


# ───────────────────────────────────────────────────────────────────────────
# Load audit data
# ───────────────────────────────────────────────────────────────────────────
def load_audit() -> dict:
    """Load per_class_stats.json → {gloss: {usable, total, missing, absent}}"""
    path = BASE / "per_class_stats.json"
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    return {r["gloss"]: r for r in rows}


def load_wlasl_json() -> list:
    with open(BASE / "WLASL_v0.3.json", encoding="utf-8") as f:
        return json.load(f)


def load_missing_ids() -> set:
    path = BASE / "missing.txt"
    with open(path, encoding="utf-8") as f:
        return {l.strip() for l in f if l.strip()}


# ───────────────────────────────────────────────────────────────────────────
# Core curation logic
# ───────────────────────────────────────────────────────────────────────────
def curate(
    flat_vocab: dict[str, str],
    audit: dict,
    min_samples: int,
) -> tuple[list[dict], list[dict]]:
    """
    Returns (accepted, rejected) where each entry is:
      {word, category, usable, total, missing_flagged, absent, reason}
    """
    accepted = []
    rejected = []

    for word, category in sorted(flat_vocab.items()):
        if word not in audit:
            rejected.append(
                {
                    "word": word,
                    "category": category,
                    "usable": 0,
                    "total": 0,
                    "reason": "NOT IN WLASL — word not found in WLASL_v0.3.json",
                }
            )
            continue

        info = audit[word]
        usable = info["usable"]
        total = info["total"]
        absent = info["absent"]
        missing_flagged = info["missing"]

        if usable == 0:
            reason = f"NO USABLE VIDEOS — {total} total, all missing/absent"
            rejected.append(
                {
                    "word": word,
                    "category": category,
                    "usable": usable,
                    "total": total,
                    "reason": reason,
                }
            )
        elif usable < min_samples:
            reason = (
                f"TOO FEW SAMPLES — only {usable} usable video(s), "
                f"minimum required is {min_samples}"
            )
            rejected.append(
                {
                    "word": word,
                    "category": category,
                    "usable": usable,
                    "total": total,
                    "reason": reason,
                }
            )
        else:
            accepted.append(
                {
                    "word": word,
                    "category": category,
                    "usable": usable,
                    "total": total,
                }
            )

    # Sort accepted: alphabetical within category
    accepted.sort(key=lambda x: (x["category"], x["word"]))
    rejected.sort(key=lambda x: x["word"])
    return accepted, rejected


# ───────────────────────────────────────────────────────────────────────────
# Build curated WLASL JSON  (only usable instances)
# ───────────────────────────────────────────────────────────────────────────
def build_curated_json(
    accepted: list[dict],
    raw_data: list,
    missing_ids: set,
    videos_dir: Path,
) -> list:
    """Return a WLASL-format list with only accepted glosses & only
    instances whose video file actually exists on disk."""
    accepted_words = {e["word"] for e in accepted}
    curated = []
    for item in raw_data:
        gloss = item["gloss"]
        if gloss not in accepted_words:
            continue
        good_instances = []
        for inst in item.get("instances", []):
            vid_id = str(inst.get("video_id", ""))
            if vid_id in missing_ids:
                continue
            vp = videos_dir / f"{vid_id}.mp4"
            if not vp.exists() or vp.stat().st_size < 1000:
                continue
            good_instances.append(inst)
        if good_instances:
            curated.append({"gloss": gloss, "instances": good_instances})
    # Sort alphabetically
    curated.sort(key=lambda x: x["gloss"])
    return curated


# ───────────────────────────────────────────────────────────────────────────
# Write outputs
# ───────────────────────────────────────────────────────────────────────────
def write_outputs(
    accepted: list[dict],
    rejected: list[dict],
    curated_json: list,
    flat_vocab: dict[str, str],
):
    videos_dir = BASE / "videos"

    # 1 ── curated_vocabulary.txt
    vocab_lines = ["idx\tword\tcategory\tusable_count"]
    for idx, e in enumerate(accepted):
        vocab_lines.append(f"{idx}\t{e['word']}\t{e['category']}\t{e['usable']}")
    (BASE / "curated_vocabulary.txt").write_text(
        "\n".join(vocab_lines) + "\n", encoding="utf-8"
    )

    # 2 ── curated_labels.json  (int_idx → word for ML pipeline)
    labels = {idx: e["word"] for idx, e in enumerate(accepted)}
    (BASE / "curated_labels.json").write_text(
        json.dumps(labels, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # 3 ── curated_class_list.txt
    class_lines = [f"{idx}\t{e['word']}" for idx, e in enumerate(accepted)]
    (BASE / "curated_class_list.txt").write_text(
        "\n".join(class_lines) + "\n", encoding="utf-8"
    )

    # 4 ── curated_WLASL.json
    (BASE / "curated_WLASL.json").write_text(
        json.dumps(curated_json, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # 5 ── curation_report.txt
    _write_report(accepted, rejected, flat_vocab)

    print(f"\n{'='*60}")
    print(f"  Curated vocabulary  : {len(accepted)} words accepted")
    print(f"  Rejected            : {len(rejected)} words rejected")
    print(f"  Curated WLASL JSON  : {len(curated_json)} gloss entries")
    total_usable = sum(e["usable"] for e in accepted)
    print(f"  Total usable videos : {total_usable}")
    print(f"  Outputs written to  : {BASE}")
    print(f"{'='*60}\n")


def _write_report(accepted: list[dict], rejected: list[dict], flat_vocab: dict):
    lines = []
    lines.append("=" * 70)
    lines.append("GestureBridge — Dataset Curation Report")
    lines.append(f"MIN_SAMPLES threshold  : {MIN_SAMPLES}")
    lines.append(f"Target vocabulary size : ~800 words")
    lines.append(f"Words requested        : {len(flat_vocab)}")
    lines.append(f"Words accepted         : {len(accepted)}")
    lines.append(f"Words rejected         : {len(rejected)}")
    lines.append("=" * 70)

    # ── By category ──
    lines.append("\nACCEPTED WORDS BY CATEGORY")
    lines.append("-" * 70)
    cat_counts: dict[str, list] = defaultdict(list)
    for e in accepted:
        cat_counts[e["category"]].append(e)
    for cat, entries in sorted(cat_counts.items()):
        lines.append(f"\n[{cat}]  ({len(entries)} words)")
        for e in entries:
            lines.append(
                f"  {e['word']:<30} usable={e['usable']:>3}  total={e['total']:>3}"
            )

    # ── Rejected ──
    lines.append("\n\nREJECTED WORDS")
    lines.append("-" * 70)
    for e in rejected:
        lines.append(
            f"  {e['word']:<30} usable={e.get('usable','?'):>3}  REASON: {e['reason']}"
        )

    lines.append("\n" + "=" * 70)
    (BASE / "curation_report.txt").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


# ───────────────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────────────
def main():
    print("Loading data …")
    flat_vocab = build_flat_vocab(CURATED_VOCAB)
    audit = load_audit()
    raw_data = load_wlasl_json()
    missing_ids = load_missing_ids()
    videos_dir = BASE / "videos"

    print(f"Requested vocabulary  : {len(flat_vocab)} unique words")
    print(f"WLASL classes on disk : {len(audit)}")
    print(f"MIN_SAMPLES           : {MIN_SAMPLES}")

    print("\nRunning curation …")
    accepted, rejected = curate(flat_vocab, audit, MIN_SAMPLES)

    print(f"Accepted: {len(accepted)}  |  Rejected: {len(rejected)}")

    print("\nBuilding curated WLASL JSON …")
    curated_json = build_curated_json(accepted, raw_data, missing_ids, videos_dir)

    print("Writing outputs …")
    write_outputs(accepted, rejected, curated_json, flat_vocab)

    # Print category summary
    cats: dict = defaultdict(int)
    for e in accepted:
        cats[e["category"]] += 1
    print("\nCategory breakdown:")
    for cat, cnt in sorted(cats.items()):
        print(f"  {cat:<40} {cnt:>3} words")


if __name__ == "__main__":
    main()
