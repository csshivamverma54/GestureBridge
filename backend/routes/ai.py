from flask import Blueprint, jsonify, request

from services.watsonx import generate, is_configured, MODEL_ID

ai_bp = Blueprint("ai", __name__, url_prefix="/ai")


# Return a 503 response when Watsonx credentials are not configured
def _unavailable():
    return jsonify({
        "error": "IBM Watsonx.ai is not configured. "
                 "Set IBM_API_KEY and WATSONX_PROJECT_ID in your .env file."
    }), 503


# Rewrite a raw sign-to-text translation as fluent English
@ai_bp.route("/improve-text", methods=["POST"])
def improve_text():
    if not is_configured():
        return _unavailable()

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Field 'text' is required"}), 400

    prompt = (
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
        "You are an expert ASL (American Sign Language) interpreter and English editor. "
        "You receive raw sign-to-text translations — these may have awkward word order "
        "(topic-comment structure), missing articles, or missing punctuation. "
        "Your task is to rewrite the input as a single, fluent, natural English sentence. "
        "Output ONLY the improved sentence. No explanations, no extra lines.\n"
        "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
        f"Raw translation: {text}\n"
        "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
    )

    try:
        improved = generate(prompt, max_new_tokens=120, temperature=0.2,
                            stop_sequences=["<|eot_id|>", "\n\n"])
        improved = improved.replace("<|eot_id|>", "").strip()
        return jsonify({"improved": improved or text}), 200
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc), "improved": text}), 500


# Return a concise learning tip and fun fact for an ASL sign word
@ai_bp.route("/learning-tip", methods=["POST"])
def learning_tip():
    if not is_configured():
        return _unavailable()

    data = request.get_json(silent=True) or {}
    word = (data.get("word") or "").strip().upper()
    if not word:
        return jsonify({"error": "Field 'word' is required"}), 400

    prompt = (
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
        "You are a knowledgeable and encouraging ASL teacher. "
        "When given a sign word, provide: "
        "1) A one-sentence description of how to perform the sign. "
        "2) One short fun fact or memory tip. "
        "Format your answer as JSON with keys 'tip' and 'fun_fact'. "
        "Keep each value under 60 words. Output ONLY the JSON object.\n"
        "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
        f"ASL sign: {word}\n"
        "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
    )

    try:
        raw = generate(prompt, max_new_tokens=160, temperature=0.4,
                       stop_sequences=["<|eot_id|>"])
        raw = raw.replace("<|eot_id|>", "").strip()

        import json as _json
        try:
            payload = _json.loads(raw)
            tip      = payload.get("tip",      raw)
            fun_fact = payload.get("fun_fact", "")
        except _json.JSONDecodeError:
            tip      = raw
            fun_fact = ""

        return jsonify({"word": word, "tip": tip, "fun_fact": fun_fact}), 200
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


# Analyse a list of recent translations and return AI-generated learning insights
@ai_bp.route("/sentence-insights", methods=["POST"])
def sentence_insights():
    if not is_configured():
        return _unavailable()

    data = request.get_json(silent=True) or {}
    translations = data.get("translations", [])
    if not translations or not isinstance(translations, list):
        return jsonify({"error": "Field 'translations' must be a non-empty list"}), 400

    sample = translations[:30]
    joined = ", ".join(f'"{t}"' for t in sample)

    prompt = (
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
        "You are an encouraging ASL learning coach analysing a student's "
        "recent sign-to-text translation history. "
        "Given a list of recognised signs, identify: "
        "1) The most-used vocabulary themes. "
        "2) Any signs that appear multiple times (frequency note). "
        "3) One specific, actionable improvement suggestion. "
        "4) One motivational observation. "
        "Be concise — aim for 4–6 short sentences total. "
        "Output plain text, no bullet points, no headings.\n"
        "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
        f"Recent translations: {joined}\n"
        "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
    )

    try:
        insights = generate(prompt, max_new_tokens=220, temperature=0.5,
                            stop_sequences=["<|eot_id|>"])
        insights = insights.replace("<|eot_id|>", "").strip()
        return jsonify({"insights": insights}), 200
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


# Convert an ASL gloss sequence into natural English using Watsonx, with rule-based fallback
@ai_bp.route("/gloss-to-english", methods=["POST"])
def gloss_to_english():
    data = request.get_json(silent=True) or {}
    glosses     = data.get("glosses", [])
    nmm_payload = data.get("nmm", {})

    if not isinstance(glosses, list) or not glosses:
        return jsonify({"error": "Field 'glosses' must be a non-empty list"}), 400

    nmm_ctx = ""
    raise_v  = float(nmm_payload.get("eyebrow_raise",  0))
    furrow_v = float(nmm_payload.get("eyebrow_furrow", 0))
    shake_v  = float(nmm_payload.get("head_shake",     0))
    nod_v    = float(nmm_payload.get("head_nod",       0))
    mouth_v  = float(nmm_payload.get("mouth_open",     0))
    cues = []
    if raise_v  > 0.35: cues.append("yes/no question (raised eyebrows)")
    if furrow_v > 0.40: cues.append("WH-question (furrowed brows)")
    if shake_v  > 0.12: cues.append("negation (head shake)")
    if nod_v    > 0.10: cues.append("affirmation (head nod)")
    if mouth_v  > 0.25: cues.append("intensifier (mouth open)")
    if cues:
        nmm_ctx = " NMM signals detected: " + "; ".join(cues) + "."

    gloss_str = " ".join(g.upper() for g in glosses)

    if not is_configured():
        from ml.sentence_generator import generate_sentence
        sentence = generate_sentence(glosses, nmm_payload)
        return jsonify({"sentence": sentence, "glosses": glosses, "nmm": nmm_payload,
                        "source": "rule-based"}), 200

    prompt = (
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
        "You are an expert ASL-to-English interpreter. "
        "Convert the ASL gloss sequence into a single fluent English sentence. "
        "ASL uses topic-comment word order; reorder to natural English SVO. "
        "Apply any NMM (non-manual marker) cues provided. "
        "Output ONLY the English sentence — no explanations.\n"
        "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
        f"ASL glosses: {gloss_str}.{nmm_ctx}\n"
        "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
    )

    try:
        sentence = generate(prompt, max_new_tokens=100, temperature=0.2,
                            stop_sequences=["<|eot_id|>", "\n\n"])
        sentence = sentence.replace("<|eot_id|>", "").strip()
        if not sentence:
            raise ValueError("Empty response from Watsonx")
        return jsonify({"sentence": sentence, "glosses": glosses,
                        "nmm": nmm_payload, "source": "watsonx"}), 200
    except Exception as exc:  # noqa: BLE001
        from ml.sentence_generator import generate_sentence
        sentence = generate_sentence(glosses, nmm_payload)
        return jsonify({"sentence": sentence, "glosses": glosses,
                        "nmm": nmm_payload, "source": "rule-based",
                        "warning": str(exc)}), 200


# Match fingerspelled letters to the best English word using Watsonx or dictionary fallback
@ai_bp.route("/letter-to-sentence", methods=["POST"])
def letter_to_sentence():
    data = request.get_json(silent=True) or {}
    letters = (data.get("letters") or "").strip().lower()
    if not letters:
        return jsonify({"error": "Field 'letters' is required"}), 400

    if not is_configured():
        from ml.letter_predictor import LetterSession
        suggestions = LetterSession.suggest(letters, n=3)
        return jsonify({"sentence": letters, "suggestions": suggestions,
                        "source": "rule-based"}), 200

    prompt = (
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
        "You are an ASL fingerspelling assistant. "
        "Given a sequence of letters that a user has spelled out, "
        "return the best matching English word AND up to 3 alternative suggestions. "
        "Format as JSON: {\"word\": \"best_word\", \"suggestions\": [\"alt1\", \"alt2\", \"alt3\"]}. "
        "Output ONLY the JSON. No extra text.\n"
        "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
        f"Fingerspelled letters: {letters.upper()}\n"
        "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
    )

    try:
        import json as _json
        raw = generate(prompt, max_new_tokens=80, temperature=0.2,
                       stop_sequences=["<|eot_id|>"])
        raw = raw.replace("<|eot_id|>", "").strip()
        payload     = _json.loads(raw)
        word        = payload.get("word", letters)
        suggestions = payload.get("suggestions", [])
        return jsonify({"sentence": word, "suggestions": suggestions,
                        "source": "watsonx"}), 200
    except Exception as exc:  # noqa: BLE001
        from ml.letter_predictor import LetterSession
        suggestions = LetterSession.suggest(letters, n=3)
        return jsonify({"sentence": letters, "suggestions": suggestions,
                        "source": "rule-based", "warning": str(exc)}), 200


# Return whether the Watsonx service is configured and which model is in use
@ai_bp.route("/status", methods=["GET"])
def ai_status():
    return jsonify({
        "configured": is_configured(),
        "model":      MODEL_ID if is_configured() else None,
    }), 200
