"""
gesture.py  (backend/routes/gesture.py)
-----------------------------------------
Flask Blueprint for gesture prediction endpoints.

Routes
------
POST /predict
    Accepts a MediaPipe landmark sequence and returns the predicted sign
    word, confidence score, top-5 predictions, and detected NMM state.

    Request body (JSON):
    {
        "user_id"  : "abc123",
        "gesture"  : [[...], ...]   ← (T × 218) 2-D list
        "nmm"      : {              ← optional non-manual marker summary
            "eyebrow_raise"  : 0.0,
            "eyebrow_furrow" : 0.0,
            "head_nod"       : 0.0,
            "head_shake"     : 0.0,
            "mouth_open"     : 0.0
        }
    }

    Response body (JSON):
    {
        "message"       : "Prediction successful",
        "predicted_text": "Hello",
        "confidence"    : 0.9231,
        "top5"          : [...],
        "nmm"           : { ... }   ← echoed back for UI display
    }

POST /predict-letter
    Classifies a single frame of 63 hand-landmark features (dominant hand)
    into an ASL letter A–Z using the auxiliary MLP model.

    Request body (JSON):
    {
        "landmarks"     : [float × 63]   ← raw MediaPipe landmarks (flattened)
        "index_tip_xy"  : [x, y]         ← optional: index fingertip for J/Z detection
    }

    Response body (JSON):
    {
        "letter"     : "A",
        "confidence" : 0.97,
        "top5"       : [{"letter": "A", "confidence": 0.97}, …],
        "is_dynamic" : false
    }

POST /generate-sentence
    Converts an ordered ASL gloss sequence + NMM summary into a natural
    English sentence using the rule-based sentence_generator module.

    Request body (JSON):
    {
        "glosses" : ["STORE", "YOU", "GO"],
        "nmm"     : {
            "eyebrow_raise"  : 0.72,
            "eyebrow_furrow" : 0.0,
            "head_shake"     : 0.05,
            "head_nod"       : 0.02,
            "mouth_open"     : 0.1
        }
    }

    Response body (JSON):
    {
        "sentence" : "Are you going to the store?",
        "glosses"  : ["STORE", "YOU", "GO"],   ← echoed
        "nmm"      : { ... }                   ← echoed
    }

POST /generate-letter-sentence
    Converts a string of committed fingerspelled letters into a natural
    English sentence suggestion.

    Request body (JSON):
    {
        "letters" : "HELLO"
    }

    Response body (JSON):
    {
        "sentence"    : "hello",
        "suggestions" : ["hello", "help", "held"]
    }

GET /model/status
    Returns whether the ML model is loaded and ready.

POST /model/reload
    Hot-reloads the model and labels from disk without restarting the
    server. Useful after retraining in a long-running deployment.
"""

from datetime import datetime

from flask import Blueprint, jsonify, request

from ml.predictor import predict_gesture, reload_model
from ml.letter_predictor import predict_letter, reload_letter_model, LetterSession
from ml.sentence_generator import generate_sentence

gesture = Blueprint("gesture", __name__)

mongo = None


def init_db(db):
    global mongo
    mongo = db


# ------------------------------------------------------------------
# POST /predict
# ------------------------------------------------------------------
@gesture.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    user_id       = data.get("user_id")
    gesture_input = data.get("gesture")
    nmm_payload   = data.get("nmm", {})   # optional NMM summary from frontend

    if not user_id or gesture_input is None:
        return jsonify({"error": "Missing required fields: user_id, gesture"}), 400

    # Run ML inference
    result = predict_gesture(gesture_input)

    predicted_text = result.get("predicted_word", "unknown")
    confidence     = result.get("confidence", 0.0)
    top5           = result.get("top5", [])

    # Persist to MongoDB history (only when model is ready)
    if mongo and "error" not in result:
        record = {
            "user_id":        user_id,
            "gesture_input":  gesture_input,
            "predicted_text": predicted_text,
            "confidence":     confidence,
            "top5":           top5,
            "nmm":            nmm_payload,
            "timestamp":      datetime.utcnow(),
        }
        mongo.db.gesture_history.insert_one(record)

    response = {
        "message":        "Prediction successful",
        "predicted_text": predicted_text,
        "confidence":     confidence,
        "top5":           top5,
        "nmm":            nmm_payload,   # echoed for UI
    }
    if "error" in result:
        response["warning"]       = result["error"]
        response["needs_retrain"] = result.get("needs_retrain", False)

    return jsonify(response), 200


# ------------------------------------------------------------------
# POST /generate-sentence
# ------------------------------------------------------------------
@gesture.route("/generate-sentence", methods=["POST"])
def generate_sentence_route():
    """
    Convert an ASL gloss sequence + NMM summary into an English sentence.
    Attempts Watsonx AI first; falls back to the rule-based generator.

    Body: { "glosses": [...], "nmm": {...} }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    glosses     = data.get("glosses", [])
    nmm_payload = data.get("nmm", {})

    if not isinstance(glosses, list) or not glosses:
        return jsonify({"error": "Field 'glosses' must be a non-empty list"}), 400

    # Try Watsonx AI first
    try:
        from services.watsonx import generate as wx_generate, is_configured
        if is_configured():
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
            nmm_ctx = (" NMM signals: " + "; ".join(cues) + ".") if cues else ""
            gloss_str = " ".join(g.upper() for g in glosses)
            prompt = (
                "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
                "You are an expert ASL-to-English interpreter. "
                "Convert the ASL gloss sequence into a single fluent English sentence. "
                "ASL uses topic-comment word order; reorder to natural English SVO. "
                "Apply any NMM cues provided. Output ONLY the English sentence.\n"
                "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
                f"ASL glosses: {gloss_str}.{nmm_ctx}\n"
                "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
            )
            sentence = wx_generate(prompt, max_new_tokens=100, temperature=0.2,
                                   stop_sequences=["<|eot_id|>", "\n\n"])
            sentence = sentence.replace("<|eot_id|>", "").strip()
            if sentence:
                return jsonify({"sentence": sentence, "glosses": glosses,
                                "nmm": nmm_payload, "source": "watsonx"}), 200
    except Exception:  # noqa: BLE001
        pass  # fall through to rule-based

    # Rule-based fallback
    try:
        sentence = generate_sentence(glosses, nmm_payload)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Sentence generation failed: {str(exc)}"}), 500

    return jsonify({
        "sentence": sentence,
        "glosses":  glosses,
        "nmm":      nmm_payload,
        "source":   "rule-based",
    }), 200


# ------------------------------------------------------------------
# POST /predict-letter
# ------------------------------------------------------------------
@gesture.route("/predict-letter", methods=["POST"])
def predict_letter_route():
    """
    Classify a single frame of 63 raw hand-landmark features into an ASL
    letter using the auxiliary MLP model.

    Body: { "landmarks": [float×63], "index_tip_xy": [x, y]? }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    landmarks = data.get("landmarks")
    if landmarks is None or len(landmarks) != 63:
        return jsonify({
            "error": f"Field 'landmarks' must be a list of 63 floats, got {len(landmarks) if landmarks else 'null'}"
        }), 400

    result = predict_letter(landmarks)
    return jsonify(result), 200


# ------------------------------------------------------------------
# POST /generate-letter-sentence
# ------------------------------------------------------------------
@gesture.route("/generate-letter-sentence", methods=["POST"])
def generate_letter_sentence_route():
    """
    Convert a string of committed fingerspelled letters into a sentence
    suggestion. Tries Watsonx AI; falls back to dictionary auto-complete.

    Body: { "letters": "HELLO" }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    letters = data.get("letters", "")
    if not isinstance(letters, str):
        return jsonify({"error": "Field 'letters' must be a string"}), 400

    word = letters.strip().lower()

    # Try Watsonx for smarter word completion
    try:
        from services.watsonx import generate as wx_generate, is_configured
        import json as _json
        if is_configured():
            prompt = (
                "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
                "You are an ASL fingerspelling assistant. "
                "Given fingerspelled letters, return the best matching English word "
                "and up to 3 alternatives. "
                'Format: {"word":"best","suggestions":["a","b","c"]}. JSON only.\n'
                "<|eot_id|><|start_header_id|>user<|end_header_id|>\n"
                f"Letters: {word.upper()}\n"
                "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n"
            )
            raw = wx_generate(prompt, max_new_tokens=60, temperature=0.1,
                              stop_sequences=["<|eot_id|>"])
            raw = raw.replace("<|eot_id|>", "").strip()
            payload     = _json.loads(raw)
            best        = payload.get("word", word)
            suggestions = payload.get("suggestions", [])
            return jsonify({"sentence": best, "suggestions": suggestions,
                            "source": "watsonx"}), 200
    except Exception:  # noqa: BLE001
        pass  # fall through

    suggestions = LetterSession.suggest(word, n=3)
    # Use best suggestion as the primary sentence (prefix-first match is most likely)
    best = suggestions[0] if suggestions else word
    return jsonify({"sentence": best, "suggestions": suggestions,
                    "source": "rule-based"}), 200


# ------------------------------------------------------------------
# GET /model/status
# ------------------------------------------------------------------
@gesture.route("/model/status", methods=["GET"])
def model_status():
    """Return whether the ML model is currently loaded."""
    from ml.predictor import _model, _num_classes, _labels
    from ml.letter_predictor import _model as _lmodel, _classes as _lclasses, _meta as _lmeta
    return jsonify(
        {
            "model_loaded":        _model is not None,
            "num_classes":         _num_classes,
            "sample_labels":       list(_labels.values())[:5] if _labels else [],
            "letter_model_loaded": _lmodel is not None,
            "letter_classes":      _lclasses,
            "letter_accuracy":     _lmeta.get("accuracy", 0),
        }
    ), 200


# ------------------------------------------------------------------
# POST /model/reload
# ------------------------------------------------------------------
@gesture.route("/model/reload", methods=["POST"])
def model_reload():
    """Hot-reload both models from disk (after retraining)."""
    try:
        reload_model()
        reload_letter_model()
        from ml.predictor import _model, _num_classes
        from ml.letter_predictor import _model as _lmodel
        return jsonify(
            {
                "message":            "Models reloaded successfully",
                "model_loaded":       _model is not None,
                "num_classes":        _num_classes,
                "letter_model_loaded": _lmodel is not None,
            }
        ), 200
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Reload failed: {str(exc)}"}), 500
