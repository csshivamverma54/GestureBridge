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

GET /model/status
    Returns whether the ML model is loaded and ready.

POST /model/reload
    Hot-reloads the model and labels from disk without restarting the
    server. Useful after retraining in a long-running deployment.
"""

from datetime import datetime

from flask import Blueprint, jsonify, request

from ml.predictor import predict_gesture, reload_model
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

    Body: { "glosses": [...], "nmm": {...} }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    glosses     = data.get("glosses", [])
    nmm_payload = data.get("nmm", {})

    if not isinstance(glosses, list) or not glosses:
        return jsonify({"error": "Field 'glosses' must be a non-empty list"}), 400

    try:
        sentence = generate_sentence(glosses, nmm_payload)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Sentence generation failed: {str(exc)}"}), 500

    return jsonify({
        "sentence": sentence,
        "glosses":  glosses,
        "nmm":      nmm_payload,
    }), 200


# ------------------------------------------------------------------
# GET /model/status
# ------------------------------------------------------------------
@gesture.route("/model/status", methods=["GET"])
def model_status():
    """Return whether the ML model is currently loaded."""
    from ml.predictor import _model, _num_classes, _labels
    return jsonify(
        {
            "model_loaded": _model is not None,
            "num_classes": _num_classes,
            "sample_labels": list(_labels.values())[:5] if _labels else [],
        }
    ), 200


# ------------------------------------------------------------------
# POST /model/reload
# ------------------------------------------------------------------
@gesture.route("/model/reload", methods=["POST"])
def model_reload():
    """Hot-reload the model from disk (after retraining)."""
    try:
        reload_model()
        from ml.predictor import _model, _num_classes
        return jsonify(
            {
                "message": "Model reloaded successfully",
                "model_loaded": _model is not None,
                "num_classes": _num_classes,
            }
        ), 200
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Reload failed: {str(exc)}"}), 500
