"""
gesture.py  (backend/routes/gesture.py)
-----------------------------------------
Flask Blueprint for gesture prediction endpoints.

Routes
------
POST /predict
    Accepts a MediaPipe landmark sequence and returns the predicted sign
    word, confidence score, and top-5 predictions.

    Request body (JSON):
    {
        "user_id"  : "abc123",
        "gesture"  : [[x1,y1,z1,…, x21,y21,z21, …, x21r,y21r,z21r], …]   ← (T × 126) 2-D list
    }

    Response body (JSON):
    {
        "message"       : "Prediction successful",
        "predicted_text": "Hello",
        "confidence"    : 0.9231,
        "top5"          : [
            {"word": "Hello",    "confidence": 0.9231},
            {"word": "Thank You","confidence": 0.0512},
            …
        ]
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

    user_id = data.get("user_id")
    gesture_input = data.get("gesture")

    if not user_id or gesture_input is None:
        return jsonify({"error": "Missing required fields: user_id, gesture"}), 400

    # Run ML inference
    result = predict_gesture(gesture_input)

    # If model is not ready, still return 200 with the error field so the
    # client can display a meaningful message.
    predicted_text = result.get("predicted_word", "unknown")
    confidence = result.get("confidence", 0.0)
    top5 = result.get("top5", [])

    # Persist to MongoDB history (only when model is ready)
    if mongo and "error" not in result:
        record = {
            "user_id": user_id,
            "gesture_input": gesture_input,
            "predicted_text": predicted_text,
            "confidence": confidence,
            "top5": top5,
            "timestamp": datetime.utcnow(),
        }
        mongo.db.gesture_history.insert_one(record)

    response = {
        "message": "Prediction successful",
        "predicted_text": predicted_text,
        "confidence": confidence,
        "top5": top5,
    }
    if "error" in result:
        response["warning"] = result["error"]

    return jsonify(response), 200


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
