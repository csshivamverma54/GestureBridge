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

# Disable debug when FLASK_DEBUG env var is absent or "0".
# Gunicorn / Render override this via the startCommand — Flask's own dev
# reloader and debugger must never run in production.
_DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
_PORT  = int(os.getenv("PORT", 5000))

# ── Paths ─────────────────────────────────────────────────────────────────
_BASE_DIR  = Path(__file__).parent
_DIST_DIR  = _BASE_DIR / "static" / "dist"   # React production build output

# ── App factory ──────────────────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=str(_DIST_DIR),   # serve built assets from here
    static_url_path="/",
)
app.config.from_object(Config)

# Allow the React dev server (localhost:3000) to call Flask APIs.
# In production the React bundle is served by Flask itself, so no CORS needed.
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True,
)

# ── Database + blueprints ─────────────────────────────────────────────────
mongo = PyMongo(app)

init_app(mongo)
init_gesture_app(mongo)
init_history_app(mongo)

app.register_blueprint(auth)
app.register_blueprint(gesture)
app.register_blueprint(history)
app.register_blueprint(text_to_sign)
app.register_blueprint(ai_bp)


# ── Health / test routes ──────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/test_db")
def test_db():
    try:
        mongo.db.test.insert_one({"ping": "pong"})
        return jsonify({"status": "MongoDB connection successful"})
    except Exception as exc:
        return jsonify({"status": "error", "detail": str(exc)}), 500


# ── Serve React SPA ───────────────────────────────────────────────────────
# In production, Flask serves index.html for every non-API route so that
# React Router can handle client-side navigation.
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    # If the request looks like a static asset and the file exists, serve it.
    asset = _DIST_DIR / path
    if path and asset.exists():
        return send_from_directory(str(_DIST_DIR), path)
    # Otherwise return index.html so React Router takes over.
    index = _DIST_DIR / "index.html"
    if index.exists():
        return send_from_directory(str(_DIST_DIR), "index.html")
    # No build found — helpful dev message.
    return (
        "<h2>GestureBridge API is running.</h2>"
        "<p>Run <code>npm run build</code> inside <code>frontend/</code> to serve the React app here.</p>"
        "<p>During development, visit <a href='http://localhost:3000'>http://localhost:3000</a> instead.</p>"
    ), 200


if __name__ == "__main__":
    # Direct `python app.py` — only used locally.
    # Production uses gunicorn (see Procfile / render.yaml).
    app.run(debug=_DEBUG, host="0.0.0.0", port=_PORT)
