<<<<<<< HEAD
=======
"""
GestureBridge — Flask Application Entry Point
==============================================
Development:
    React dev server runs on :3000 (npm run dev).
    Vite proxies /api/* → Flask :5000.
    CORS is allowed for localhost:3000 during dev.

Production:
    Run `npm run build` inside frontend/ once.
    Flask serves the compiled React app from static/dist/
    and handles the catch-all route to support React Router.
    Start with:  python app.py  (or gunicorn app:app)
"""

>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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

<<<<<<< HEAD
_DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
_PORT  = int(os.getenv("PORT", 5000))

=======
# Disable debug when FLASK_DEBUG env var is absent or "0".
_DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
_PORT  = int(os.getenv("PORT", 5000))

# Allowed CORS origins — always include localhost for dev.
# FRONTEND_ORIGIN covers the deployed React static site on a separate domain.
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
_FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")
_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5000",
    _FRONTEND_ORIGIN,
]

<<<<<<< HEAD
_BASE_DIR = Path(__file__).parent
_DIST_DIR = _BASE_DIR / "static" / "dist"

app = Flask(
    __name__,
    static_folder=str(_DIST_DIR),
=======
# ── Paths ─────────────────────────────────────────────────────────────────
_BASE_DIR  = Path(__file__).parent
_DIST_DIR  = _BASE_DIR / "static" / "dist"   # React production build output

# ── App factory ──────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=str(_DIST_DIR),   # serve built assets from here
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    static_url_path="/",
)
app.config.from_object(Config)

<<<<<<< HEAD
=======
# Explicit allowed origins — covers localhost dev + the deployed frontend.
# credentials=True is required so the browser sends the JWT Authorization header.
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
CORS(
    app,
    resources={r"/*": {"origins": _CORS_ORIGINS}},
    supports_credentials=True,
)

<<<<<<< HEAD
=======
# ── Database + blueprints ─────────────────────────────────────────────────
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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


<<<<<<< HEAD
# Return 200 OK for health checks
=======
# ── Health / test routes ──────────────────────────────────────────────────
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200


<<<<<<< HEAD
# Verify MongoDB is reachable by inserting a test document
=======
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
@app.route("/test_db")
def test_db():
    try:
        mongo.db.test.insert_one({"ping": "pong"})
        return jsonify({"status": "MongoDB connection successful"})
    except Exception as exc:
        return jsonify({"status": "error", "detail": str(exc)}), 500


<<<<<<< HEAD
=======
# ── Serve React SPA ───────────────────────────────────────────────────────
# In production, Flask serves index.html for every non-API route so that
# React Router can handle client-side navigation.
#
# IMPORTANT: this catch-all must NOT swallow actual API paths.
# Flask matches blueprint routes before catch-alls, but as a safety guard
# we explicitly return 404 for any path that starts with a known API prefix.
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
_API_PREFIXES = (
    "predict", "generate", "model", "history", "register", "login",
    "profile", "health", "test_db", "text-to-sign", "video", "ai",
    "auth/google", "otp",
)

<<<<<<< HEAD
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
=======
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    # Guard: never serve index.html for API routes
    if path and any(path.startswith(p) for p in _API_PREFIXES):
        return jsonify({"error": "Not found"}), 404

    # If the request looks like a static asset and the file exists, serve it.
    asset = _DIST_DIR / path
    if path and asset.exists():
        return send_from_directory(str(_DIST_DIR), path)
    # Otherwise return index.html so React Router takes over.
    index = _DIST_DIR / "index.html"
    if index.exists():
        return send_from_directory(str(_DIST_DIR), "index.html")
    # No build found — helpful dev message.
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    return (
        "<h2>GestureBridge API is running.</h2>"
        "<p>Run <code>npm run build</code> inside <code>frontend/</code> to serve the React app here.</p>"
        "<p>During development, visit <a href='http://localhost:3000'>http://localhost:3000</a> instead.</p>"
    ), 200


if __name__ == "__main__":
<<<<<<< HEAD
=======
    # Direct `python app.py` — only used locally.
    # Production uses gunicorn (see Procfile / render.yaml).
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    app.run(debug=_DEBUG, host="0.0.0.0", port=_PORT)
