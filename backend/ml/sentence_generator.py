from __future__ import annotations

import re
from typing import Optional

NMM_RAISE_THRESH  = 0.35
NMM_FURROW_THRESH = 0.40
NMM_SHAKE_THRESH  = 0.12
NMM_NOD_THRESH    = 0.10
NMM_MOUTH_THRESH  = 0.25

_PRONOUNS: dict[str, str] = {
    "I": "I", "ME": "I", "MY": "my", "MINE": "mine",
    "YOU": "you", "YOUR": "your",
    "HE": "he", "HIM": "him", "HIS": "his",
    "SHE": "her", "HER": "her",
    "IT": "it", "ITS": "its",
    "WE": "we", "US": "us", "OUR": "our",
    "THEY": "they", "THEM": "them", "THEIR": "their",
}

_FUTURE_MARKERS = {"FUTURE", "WILL", "GONNA", "GO-TO"}
_PAST_MARKERS   = {"PAST", "BEFORE", "YESTERDAY", "FINISH", "ALREADY"}
_NEG_MARKERS    = {"NOT", "NO", "NONE", "NEVER", "NOTHING"}

_WH_GLOSSES = {"WHO", "WHAT", "WHERE", "WHEN", "WHY", "HOW", "WHICH"}

_ADJECTIVES = {
    "SICK", "HAPPY", "SAD", "TIRED", "HUNGRY", "THIRSTY", "HOT", "COLD",
    "ANGRY", "SCARED", "EXCITED", "BORED", "BUSY", "FREE", "READY",
    "GOOD", "BAD", "FINE", "OKAY", "WRONG", "RIGHT", "LATE", "EARLY",
    "BEAUTIFUL", "UGLY", "SMART", "FUNNY", "NICE", "KIND",
}

_VERBS: set[str] = {
    "GO", "COME", "SEE", "LOOK", "EAT", "DRINK", "SLEEP", "WORK",
    "PLAY", "LEARN", "STUDY", "HELP", "WANT", "NEED", "LIKE", "LOVE",
    "HATE", "KNOW", "THINK", "FEEL", "WALK", "RUN", "DRIVE", "FLY",
    "READ", "WRITE", "SIGN", "SPEAK", "HEAR", "UNDERSTAND", "REMEMBER",
    "FORGET", "WAIT", "FINISH", "START", "STOP", "OPEN", "CLOSE",
    "GIVE", "TAKE", "BUY", "SELL", "COOK", "CLEAN", "TEACH", "TELL",
    "ASK", "ANSWER", "MEET", "VISIT", "CALL", "MOVE", "STAY", "LIVE",
    "GROW", "CHANGE", "HAPPEN", "SHOW", "TRY", "USE", "MAKE", "DO",
}

_CONTRACTIONS: list[tuple[str, str]] = [
    ("do not",  "don't"),
    ("does not", "doesn't"),
    ("did not", "didn't"),
    ("will not", "won't"),
    ("is not",  "isn't"),
    ("are not", "aren't"),
    ("was not", "wasn't"),
    ("were not", "weren't"),
    ("can not", "can't"),
    ("cannot",  "can't"),
    ("could not", "couldn't"),
    ("should not", "shouldn't"),
    ("would not", "wouldn't"),
    ("have not", "haven't"),
    ("has not",  "hasn't"),
    ("had not",  "hadn't"),
]


# Normalise raw glosses: strip, uppercase, preserve hyphenated compounds
def _gloss_to_words(gloss_sequence: list[str]) -> list[str]:
    result = []
    for g in gloss_sequence:
        g = g.strip().upper()
        if not g:
            continue
        result.append(g)
    return result


# Map a single gloss token to its most natural English word (lowercase)
def _map_gloss(gloss: str) -> str:
    if gloss in _PRONOUNS:
        return _PRONOUNS[gloss]
    _MULTI = {
        "THANK-YOU": "thank you", "THANK_YOU": "thank you",
        "GO-TO": "go to", "GOOD-MORNING": "good morning",
        "GOOD-NIGHT": "good night", "GOOD-AFTERNOON": "good afternoon",
        "I-LOVE-YOU": "I love you", "PLEASE": "please",
        "SORRY": "sorry", "EXCUSE-ME": "excuse me",
        "HOW-ARE-YOU": "how are you",
    }
    if gloss in _MULTI:
        return _MULTI[gloss]
    if re.match(r'^[A-Z]-[A-Z]', gloss):
        return gloss.replace("-", "").upper()
    return gloss.lower()


# Replace written-out negations with contractions for natural output
def _apply_contractions(text: str) -> str:
    for long, short in _CONTRACTIONS:
        text = re.sub(r'\b' + re.escape(long) + r'\b', short, text, flags=re.IGNORECASE)
    return text


# Capitalise first letter and keep standalone pronoun I uppercase
def _capitalise_sentence(text: str) -> str:
    if not text:
        return text
    text = text[0].upper() + text[1:]
    text = re.sub(r'(?<![a-z])i(?![a-z])', 'I', text)
    return text


# Convert an ASL gloss sequence + NMM signals into an English sentence
def generate_sentence(
    gloss_sequence: list[str],
    nmm_summary: Optional[dict] = None,
) -> str:
    if nmm_summary is None:
        nmm_summary = {}

    if not gloss_sequence:
        return ""

    tokens = _gloss_to_words(gloss_sequence)

    eyebrow_raise  = float(nmm_summary.get("eyebrow_raise",  0.0))
    eyebrow_furrow = float(nmm_summary.get("eyebrow_furrow", 0.0))
    head_shake     = float(nmm_summary.get("head_shake",     0.0))
    head_nod       = float(nmm_summary.get("head_nod",       0.0))
    mouth_open     = float(nmm_summary.get("mouth_open",     0.0))

    is_yn_question = eyebrow_raise  > NMM_RAISE_THRESH
    is_wh_question = eyebrow_furrow > NMM_FURROW_THRESH
    is_negated     = head_shake     > NMM_SHAKE_THRESH
    is_affirm      = head_nod       > NMM_NOD_THRESH
    is_intense     = mouth_open     > NMM_MOUTH_THRESH

    wh_gloss = next((t for t in tokens if t in _WH_GLOSSES), None)
    if wh_gloss:
        is_wh_question = True

    has_neg_token = any(t in _NEG_MARKERS for t in tokens)

    tense_modal = ""
    is_future  = any(t in _FUTURE_MARKERS for t in tokens)
    is_past    = any(t in _PAST_MARKERS   for t in tokens)

    if is_future:
        tense_modal = "will"
    elif is_past:
        tense_modal = "did"

    _SKIP = _FUTURE_MARKERS | _PAST_MARKERS | _NEG_MARKERS | _WH_GLOSSES
    content = [t for t in tokens if t not in _SKIP]

    if not content:
        content = [t for t in tokens]

    subject    = ""
    verb_gloss = ""
    obj_words  = []

    pronouns_in = [t for t in content if t in _PRONOUNS]
    verbs_in    = [t for t in content if t in _VERBS]
    adj_in      = [t for t in content if t in _ADJECTIVES]

    noun_tokens = [t for t in content if t not in _PRONOUNS and t not in _VERBS
                   and t not in _ADJECTIVES]

    subject = _map_gloss(pronouns_in[0]) if pronouns_in else (
              _map_gloss(noun_tokens[0]) if noun_tokens else _map_gloss(content[0]))

    if verbs_in:
        verb_gloss = verbs_in[0]
    elif adj_in:
        verb_gloss = ""

    remaining = [t for t in content if _map_gloss(t) != subject]
    if verbs_in:
        remaining = [t for t in remaining if t not in _PRONOUNS and t != verb_gloss]
    obj_words = [_map_gloss(t) for t in remaining]

    subj_str = subject
    obj_str  = _add_articles(obj_words)

    needs_copula = bool(adj_in and not verbs_in)

    if needs_copula:
        copula = _select_copula(subj_str, is_past)
    else:
        copula = ""

    if verb_gloss:
        verb_base = verb_gloss.lower()
        if tense_modal:
            verb_phrase = f"{tense_modal} {verb_base}"
        else:
            verb_phrase = verb_base
    else:
        verb_phrase = ""

    if is_negated or has_neg_token:
        if tense_modal in ("will",):
            verb_phrase = f"won't {verb_base}" if verb_gloss else "won't"
        elif tense_modal == "did":
            verb_phrase = f"didn't {verb_base}" if verb_gloss else "didn't"
        elif needs_copula:
            copula = copula + " not"
        else:
            verb_phrase = f"don't {verb_base}" if verb_gloss else "don't"

    intensifier = "really " if is_intense else ""

    if is_wh_question:
        wh_word = _map_gloss(wh_gloss).capitalize() if wh_gloss else "What"
        if needs_copula:
            core = f"{wh_word} {copula} {subj_str} {intensifier}{obj_str}".strip()
        elif verb_phrase:
            aux, bare_v = _split_aux(verb_phrase, subj_str, is_past)
            core = f"{wh_word} {aux} {subj_str} {intensifier}{bare_v} {obj_str}".strip()
        else:
            core = f"{wh_word} {subj_str} {obj_str}".strip()
        sentence = core + "?"

    elif is_yn_question:
        if needs_copula:
            core = f"{copula} {subj_str} {intensifier}{obj_str}".strip()
        elif verb_phrase:
            aux, bare_v = _split_aux(verb_phrase, subj_str, is_past)
            core = f"{aux} {subj_str} {intensifier}{bare_v} {obj_str}".strip()
        else:
            be = _select_copula(subj_str, is_past)
            core = f"{be} {subj_str} {intensifier}{obj_str}".strip()
        sentence = core + "?"

    else:
        if needs_copula:
            sentence = f"{subj_str} {copula} {intensifier}{obj_str}".strip() + "."
        elif verb_phrase:
            sentence = f"{subj_str} {intensifier}{verb_phrase} {obj_str}".strip() + "."
        else:
            sentence = f"{subj_str} {intensifier}{obj_str}".strip() + "."

    if is_affirm and not is_yn_question and not is_wh_question:
        sentence = sentence.rstrip(".")
        sentence = sentence + ", definitely."

    sentence = _apply_contractions(sentence)
    sentence = re.sub(r'\s+', ' ', sentence).strip()
    sentence = re.sub(r'\s+([.?!])', r'\1', sentence)
    sentence = _capitalise_sentence(sentence)

    return sentence


_ARTICLES = {
    "store", "book", "school", "home", "hospital", "office", "car",
    "house", "room", "door", "window", "table", "chair", "phone",
    "computer", "doctor", "teacher", "student", "friend", "family",
    "dog", "cat", "water", "food", "money",
}


# Prepend 'the' to recognised countable common nouns in the object slot
def _add_articles(words: list[str]) -> str:
    result = []
    for w in words:
        if w in _ARTICLES:
            result.append("the " + w)
        elif w:
            result.append(w)
    return " ".join(result)


# Return the correct form of 'to be' for the given subject
def _select_copula(subject: str, is_past: bool) -> str:
    s = subject.lower()
    if is_past:
        return "were" if s in ("you", "we", "they") else "was"
    if s in ("i",):
        return "am"
    if s in ("he", "she", "it"):
        return "is"
    return "are"


# Split a verb phrase into (auxiliary, bare_verb) for question inversion
def _split_aux(verb_phrase: str, subject: str, is_past: bool) -> tuple[str, str]:
    parts = verb_phrase.split(None, 1)
    known_aux = {"will", "won't", "did", "didn't", "do", "don't",
                 "does", "doesn't", "shall", "should", "can", "can't",
                 "could", "would", "wouldn't", "may", "might", "must"}
    if len(parts) == 2 and parts[0].lower() in known_aux:
        return parts[0], parts[1]
    bare = parts[0] if parts else ""
    s = subject.lower()
    if is_past:
        return "did", bare
    if s in ("he", "she", "it"):
        return "does", bare
    return "do", bare


if __name__ == "__main__":
    tests = [
        (["STORE", "YOU", "GO"],          {"eyebrow_raise": 0.7},  "Are you going to the store?"),
        (["BOOK", "I", "READ"],           {"head_shake": 0.3},      "I don't read the book."),
        (["HUNGRY", "YOU"],               {},                       "Are you hungry?"),
        (["SCHOOL", "WHERE", "YOU", "GO"],{"eyebrow_furrow": 0.5},  "Where do you go to school?"),
        (["TOMORROW", "GO"],              {"eyebrow_raise": 0.6},   "Will you go tomorrow?"),
        (["TIRED", "I"],                  {},                       "I am tired."),
        (["THANK-YOU"],                   {},                       "Thank you."),
        (["YOU", "EAT", "FINISH"],        {},                       "You eat."),
    ]
    for glosses, nmm, expected in tests:
        result = generate_sentence(glosses, nmm)
        status = "✓" if result.lower() == expected.lower() else "~"
        print(f"{status} {glosses} + {nmm}")
        print(f"  → {result!r}  (expected: {expected!r})\n")
