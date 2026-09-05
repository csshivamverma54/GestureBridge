import os
from pathlib import Path

from flask import Flask, send_from_directory, jsonify
from flask_pymongo import PyMongo
from flask_cors import CORS

from config import Config
from routes.auth import auth, init_app
from routes.gesture import gesture, init_db as init_gesture_app
from routes.history import history, init_db as init_history_app
from routes.text_to_sign import text_to_sign
from routes.ai import ai_bp
from routes.otp import otp_bp, init_otp_db

_DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
_PORT  = int(os.getenv("PORT", 5000))

_FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")
_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5000",
    _FRONTEND_ORIGIN,
]

_BASE_DIR = Path(__file__).parent
_DIST_DIR = _BASE_DIR / "static" / "dist"

app = Flask(
    __name__,
    static_folder=str(_DIST_DIR),
    static_url_path="/",
)
app.config.from_object(Config)

CORS(
    app,
    resources={r"/*": {"origins": _CORS_ORIGINS}},
    supports_credentials=True,
)

mongo = PyMongo(app)

init_app(mongo)
init_gesture_app(mongo)
init_history_app(mongo)
init_otp_db(mongo)

app.register_blueprint(auth)
app.register_blueprint(gesture)
app.register_blueprint(history)
app.register_blueprint(text_to_sign)
app.register_blueprint(ai_bp)
app.register_blueprint(otp_bp)


# Return 200 OK for health checks
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200


# Verify MongoDB is reachable by inserting a test document
@app.route("/test_db")
def test_db():
    try:
        mongo.db.test.insert_one({"ping": "pong"})
        return jsonify({"status": "MongoDB connection successful"})
    except Exception as exc:
        return jsonify({"status": "error", "detail": str(exc)}), 500


_API_PREFIXES = (
    "predict", "generate", "model", "history", "register", "login",
    "profile", "health", "test_db", "text-to-sign", "video", "ai",
    "auth/google", "otp",
)

# Serve the React SPA for all non-API paths
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path and any(path.startswith(p) for p in _API_PREFIXES):
        return jsonify({"error": "Not found"}), 404
    asset = _DIST_DIR / path
    if path and asset.exists():
        return send_from_directory(str(_DIST_DIR), path)
    index = _DIST_DIR / "index.html"
    if index.exists():
        return send_from_directory(str(_DIST_DIR), "index.html")
    return (
        "<h2>GestureBridge API is running.</h2>"
        "<p>Run <code>npm run build</code> inside <code>frontend/</code> to serve the React app here.</p>"
        "<p>During development, visit <a href='http://localhost:3000'>http://localhost:3000</a> instead.</p>"
    ), 200


if __name__ == "__main__":
    app.run(debug=_DEBUG, host="0.0.0.0", port=_PORT)
