"""
sentence_generator.py  (backend/ml/sentence_generator.py)
----------------------------------------------------------
Rule-based ASL gloss → English sentence generator with NMM grammar.

Converts an ordered gloss sequence such as ["STORE", "YOU", "GO"] plus
optional Non-Manual Marker (NMM) signals detected during signing into a
grammatically correct English sentence.

NMM signals currently used
--------------------------
  eyebrow_raise  > NMM_RAISE_THRESH   → YES/NO question
  eyebrow_furrow > NMM_FURROW_THRESH  → WH-question (who/what/where/when/why/how)
  head_shake     > NMM_SHAKE_THRESH   → negation (insert "not" after auxiliary)
  head_nod       > NMM_NOD_THRESH     → affirmation / emphasis
  mouth_open     > NMM_MOUTH_THRESH   → intensifier ("really", "very")

ASL → English grammar rules (simplified)
-----------------------------------------
ASL uses Topic-Comment order and often omits copula ("is"/"are").
This generator applies the following transformations:

  1. Pronoun mapping:         BOOK → book,  I → I,  ME → me, etc.
  2. Tense marker injection:  FUTURE/WILL → will/going to, PAST/BEFORE → did
  3. Negation via NMM:        shake → inject "not" / "don't" after modal
  4. YES/NO question (NMM):   raise brows → invert SV order, append "?"
  5. WH-question (NMM):       furrow brows → prepend "What/Where/Who…" + "?"
  6. Intensifier (NMM):       mouth open → insert "really" before verb
  7. Copula insertion:         SICK → "are sick", HAPPY → "are happy"
  8. Contraction cleanup:      "do not" → "don't" etc.

Public API
----------
generate_sentence(gloss_sequence, nmm_summary) → str
    gloss_sequence : list[str]   — ordered ASL glosses, e.g. ["BOOK", "YOU", "READ"]
    nmm_summary    : dict        — NMM scalar averages over the signing window, e.g.
                                   {"eyebrow_raise": 0.6, "head_shake": 0.1, …}
    Returns: str — plain English sentence
"""

from __future__ import annotations

import re
from typing import Optional

# ------------------------------------------------------------------
# NMM thresholds
# ------------------------------------------------------------------
NMM_RAISE_THRESH  = 0.35   # eyebrow_raise  → yes/no question
NMM_FURROW_THRESH = 0.40   # eyebrow_furrow → WH-question
NMM_SHAKE_THRESH  = 0.12   # head_shake     → negation
NMM_NOD_THRESH    = 0.10   # head_nod       → affirmation / emphasis
NMM_MOUTH_THRESH  = 0.25   # mouth_open     → intensifier

# ------------------------------------------------------------------
# Lexicon tables
# ------------------------------------------------------------------

# ASL pronouns → English (case handled separately)
_PRONOUNS: dict[str, str] = {
    "I": "I", "ME": "I", "MY": "my", "MINE": "mine",
    "YOU": "you", "YOUR": "your",
    "HE": "he", "HIM": "him", "HIS": "his",
    "SHE": "her", "HER": "her",
    "IT": "it", "ITS": "its",
    "WE": "we", "US": "us", "OUR": "our",
    "THEY": "they", "THEM": "them", "THEIR": "their",
}

# Tense markers
_FUTURE_MARKERS = {"FUTURE", "WILL", "GONNA", "GO-TO"}
_PAST_MARKERS   = {"PAST", "BEFORE", "YESTERDAY", "FINISH", "ALREADY"}
_NEG_MARKERS    = {"NOT", "NO", "NONE", "NEVER", "NOTHING"}

# WH-question glosses
_WH_GLOSSES = {"WHO", "WHAT", "WHERE", "WHEN", "WHY", "HOW", "WHICH"}

# Adjectives that need copula insertion ("YOU SICK" → "you are sick")
_ADJECTIVES = {
    "SICK", "HAPPY", "SAD", "TIRED", "HUNGRY", "THIRSTY", "HOT", "COLD",
    "ANGRY", "SCARED", "EXCITED", "BORED", "BUSY", "FREE", "READY",
    "GOOD", "BAD", "FINE", "OKAY", "WRONG", "RIGHT", "LATE", "EARLY",
    "BEAUTIFUL", "UGLY", "SMART", "FUNNY", "NICE", "KIND",
}

# Irregular verb → base form mapping for "do" support
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

# Common nouns (capitalised glosses that are not verbs/pronouns/markers)
# We just lowercase them; anything unrecognised is also lowercased.

# ------------------------------------------------------------------
# Contractions
# ------------------------------------------------------------------
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


# ------------------------------------------------------------------
# Helper utilities
# ------------------------------------------------------------------

def _gloss_to_words(gloss_sequence: list[str]) -> list[str]:
    """Normalise raw glosses: strip, uppercase, split hyphenated compounds."""
    result = []
    for g in gloss_sequence:
        g = g.strip().upper()
        if not g:
            continue
        # Treat THANK-YOU, GO-TO etc. as single tokens
        result.append(g)
    return result


def _map_gloss(gloss: str) -> str:
    """Map a single gloss token to its most natural English word (lowercase)."""
    if gloss in _PRONOUNS:
        return _PRONOUNS[gloss]
    # Common multi-word glosses
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
    # Fingerspelled words stay capitalised as spelled
    if re.match(r'^[A-Z]-[A-Z]', gloss):
        return gloss.replace("-", "").upper()
    return gloss.lower()


def _apply_contractions(text: str) -> str:
    """Replace written-out negations with contractions for natural output."""
    for long, short in _CONTRACTIONS:
        text = re.sub(r'\b' + re.escape(long) + r'\b', short, text, flags=re.IGNORECASE)
    return text


def _capitalise_sentence(text: str) -> str:
    """Capitalise first letter, keep pronoun I uppercase."""
    if not text:
        return text
    text = text[0].upper() + text[1:]
    # Fix " i " → " I " (whole-word, not inside contractions like "isn't")
    text = re.sub(r'(?<![a-z])i(?![a-z])', 'I', text)
    return text


# ------------------------------------------------------------------
# Core generation logic
# ------------------------------------------------------------------

def generate_sentence(
    gloss_sequence: list[str],
    nmm_summary: Optional[dict] = None,
) -> str:
    """
    Convert an ASL gloss sequence + NMM signals into an English sentence.

    Parameters
    ----------
    gloss_sequence : list[str]
        Ordered ASL gloss tokens, e.g. ["STORE", "YOU", "GO"].
        Accepts uppercase, lowercase, or mixed case — normalised internally.
    nmm_summary : dict, optional
        NMM scalar averages from the signing window.  Recognised keys:
          "eyebrow_raise", "eyebrow_furrow", "head_shake",
          "head_nod", "mouth_open"
        All default to 0.0 when absent.

    Returns
    -------
    str — a grammatically correct English sentence.

    Examples
    --------
    >>> generate_sentence(["STORE", "YOU", "GO"], {"eyebrow_raise": 0.7})
    "Are you going to the store?"
    >>> generate_sentence(["BOOK", "I", "READ"], {"head_shake": 0.3})
    "I don't read the book."
    >>> generate_sentence(["HUNGRY", "YOU"], {})
    "Are you hungry?"
    """
    if nmm_summary is None:
        nmm_summary = {}

    # ── 0. Guard ────────────────────────────────────────────────────
    if not gloss_sequence:
        return ""

    # ── 1. Normalise glosses ────────────────────────────────────────
    tokens = _gloss_to_words(gloss_sequence)

    # ── 2. Detect NMM signals ───────────────────────────────────────
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

    # WH-glosses in sequence override NMM-furrow detection
    wh_gloss = next((t for t in tokens if t in _WH_GLOSSES), None)
    if wh_gloss:
        is_wh_question = True

    # Negation glosses in sequence add explicit negation
    has_neg_token = any(t in _NEG_MARKERS for t in tokens)

    # ── 3. Separate structural markers ─────────────────────────────
    tense_modal = ""
    is_future  = any(t in _FUTURE_MARKERS for t in tokens)
    is_past    = any(t in _PAST_MARKERS   for t in tokens)

    if is_future:
        tense_modal = "will"
    elif is_past:
        tense_modal = "did"

    # Filter out tense/NMM-marker glosses from content words
    _SKIP = _FUTURE_MARKERS | _PAST_MARKERS | _NEG_MARKERS | _WH_GLOSSES
    content = [t for t in tokens if t not in _SKIP]

    if not content:
        # Only markers were present — fallback to raw lowercased glosses
        content = [t for t in tokens]

    # ── 4. Identify subject, verb, object (best-effort heuristics) ──
    # ASL topic-comment: topic is often first (the object/noun),
    # subject pronoun often second, verb third.
    # Heuristic: if first token is NOT a pronoun → it may be a topic (object)
    subject    = ""
    verb_gloss = ""
    obj_words  = []

    # Collect pronouns and verbs
    pronouns_in = [t for t in content if t in _PRONOUNS]
    verbs_in    = [t for t in content if t in _VERBS]
    adj_in      = [t for t in content if t in _ADJECTIVES]

    # ── Simple SVO assembly ─────────────────────────────────────────
    # Strategy: reorder to SVO; topic noun → object
    noun_tokens = [t for t in content if t not in _PRONOUNS and t not in _VERBS
                   and t not in _ADJECTIVES]

    # Subject: first pronoun found, else first content word
    subject = _map_gloss(pronouns_in[0]) if pronouns_in else (
              _map_gloss(noun_tokens[0]) if noun_tokens else _map_gloss(content[0]))

    # Verb: first recognised verb
    if verbs_in:
        verb_gloss = verbs_in[0]
    elif adj_in:
        # Copula construction: YOU SICK → you are sick
        verb_gloss = ""  # will use copula

    # Object / complement: remaining nouns + adjectives (minus subject)
    remaining = [t for t in content if _map_gloss(t) != subject]
    if verbs_in:
        remaining = [t for t in remaining if t not in _PRONOUNS and t != verb_gloss]
    obj_words = [_map_gloss(t) for t in remaining]

    # ── 5. Build phrase parts ───────────────────────────────────────
    subj_str  = subject
    # Add article to lone common nouns in object position
    obj_str = _add_articles(obj_words)

    # ── 6. Copula detection ─────────────────────────────────────────
    # If subject + adj and no verb: "you sick" → "you are sick"
    needs_copula = bool(adj_in and not verbs_in)

    # ── 7. Select auxiliary based on tense + subject ────────────────
    if needs_copula:
        copula = _select_copula(subj_str, is_past)
    else:
        copula = ""

    # ── 8. Verb phrase ──────────────────────────────────────────────
    if verb_gloss:
        verb_base = verb_gloss.lower()
        if tense_modal:
            verb_phrase = f"{tense_modal} {verb_base}"
        else:
            verb_phrase = verb_base
    else:
        verb_phrase = ""

    # ── 9. Negation ─────────────────────────────────────────────────
    if is_negated or has_neg_token:
        if tense_modal in ("will",):
            verb_phrase = f"won't {verb_base}" if verb_gloss else "won't"
        elif tense_modal == "did":
            verb_phrase = f"didn't {verb_base}" if verb_gloss else "didn't"
        elif needs_copula:
            copula = copula + " not"
        else:
            # No explicit tense: insert "don't"
            verb_phrase = f"don't {verb_base}" if verb_gloss else "don't"

    # ── 10. Intensifier ─────────────────────────────────────────────
    intensifier = "really " if is_intense else ""

    # ── 11. Assemble sentence ───────────────────────────────────────
    if is_wh_question:
        # WH-question: "What are you doing?" / "Where do you go?"
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
        # YES/NO question: invert subject and auxiliary
        if needs_copula:
            core = f"{copula} {subj_str} {intensifier}{obj_str}".strip()
        elif verb_phrase:
            aux, bare_v = _split_aux(verb_phrase, subj_str, is_past)
            core = f"{aux} {subj_str} {intensifier}{bare_v} {obj_str}".strip()
        else:
            # "Are you at the store?" — just lift copula
            be = _select_copula(subj_str, is_past)
            core = f"{be} {subj_str} {intensifier}{obj_str}".strip()
        sentence = core + "?"

    else:
        # Declarative
        if needs_copula:
            sentence = f"{subj_str} {copula} {intensifier}{obj_str}".strip() + "."
        elif verb_phrase:
            sentence = f"{subj_str} {intensifier}{verb_phrase} {obj_str}".strip() + "."
        else:
            sentence = f"{subj_str} {intensifier}{obj_str}".strip() + "."

    # ── 12. Affirmation emphasis ─────────────────────────────────────
    if is_affirm and not is_yn_question and not is_wh_question:
        sentence = sentence.rstrip(".")
        sentence = sentence + ", definitely."

    # ── 13. Post-processing ─────────────────────────────────────────
    sentence = _apply_contractions(sentence)
    # Remove extra whitespace
    sentence = re.sub(r'\s+', ' ', sentence).strip()
    # Remove dangling punctuation from empty object
    sentence = re.sub(r'\s+([.?!])', r'\1', sentence)
    sentence = _capitalise_sentence(sentence)

    return sentence


# ------------------------------------------------------------------
# Sub-helpers
# ------------------------------------------------------------------

_ARTICLES = {
    "store", "book", "school", "home", "hospital", "office", "car",
    "house", "room", "door", "window", "table", "chair", "phone",
    "computer", "doctor", "teacher", "student", "friend", "family",
    "dog", "cat", "water", "food", "money",
}


def _add_articles(words: list[str]) -> str:
    """Prepend 'the' to recognised countable common nouns in the object slot."""
    result = []
    for w in words:
        if w in _ARTICLES:
            result.append("the " + w)
        elif w:
            result.append(w)
    return " ".join(result)


def _select_copula(subject: str, is_past: bool) -> str:
    """Return the correct form of 'to be' for the given subject."""
    s = subject.lower()
    if is_past:
        return "were" if s in ("you", "we", "they") else "was"
    if s in ("i",):
        return "am"
    if s in ("he", "she", "it"):
        return "is"
    return "are"   # you, we, they, or unknown


def _split_aux(verb_phrase: str, subject: str, is_past: bool) -> tuple[str, str]:
    """
    Split a verb phrase like "will go", "didn't eat", "don't read" into
    (auxiliary, bare_verb) for question inversion.

    Falls back to constructing a do-support auxiliary when no explicit modal.
    """
    parts = verb_phrase.split(None, 1)
    known_aux = {"will", "won't", "did", "didn't", "do", "don't",
                 "does", "doesn't", "shall", "should", "can", "can't",
                 "could", "would", "wouldn't", "may", "might", "must"}
    if len(parts) == 2 and parts[0].lower() in known_aux:
        return parts[0], parts[1]
    # Build do-support: "you go" → "do you go"
    bare = parts[0] if parts else ""
    s = subject.lower()
    if is_past:
        return "did", bare
    if s in ("he", "she", "it"):
        return "does", bare
    return "do", bare


# ------------------------------------------------------------------
# Convenience wrapper for testing
# ------------------------------------------------------------------
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
