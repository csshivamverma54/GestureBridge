"""
auth.py  (backend/routes/auth.py)
----------------------------------
Authentication routes: email/password + Google OAuth 2.0.

Routes
------
POST /register           — create account (name, email, password)
POST /login              — returns JWT
GET  /profile            — authenticated user info
GET  /auth/google        — redirect browser to Google consent screen
GET  /auth/google/callback — Google redirects here; exchange code for user
                             info, upsert user in MongoDB, return JWT to
                             the React SPA via a redirect to /auth/callback
                             with ?token=<jwt>&name=<name>&email=<email>

PKCE note
---------
google-auth-oauthlib ≥ 1.0 automatically generates a PKCE code_verifier when
authorization_url() is called. The verifier is stored on the Flow object but
that object is garbage-collected after the redirect response is sent. When the
callback creates a fresh Flow it has no verifier → Google returns
"invalid_grant: Missing code verifier".

Fix: store (state, code_verifier) in the Flask session between the two requests.
"""

import os
import urllib.parse
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
import jwt
from flask import Blueprint, jsonify, request, redirect, session
from flask_pymongo import PyMongo
from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

auth = Blueprint('auth', __name__)

mongo = None

# ── Scopes requested from Google ──────────────────────────────────────────
_SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
]

# Allow HTTP for local dev (Render terminates TLS before Flask sees the request)
os.environ.setdefault('OAUTHLIB_INSECURE_TRANSPORT', '1')


def _client_config():
    """Return the OAuth2 client config dict from env vars."""
    return {
        "web": {
            "client_id":     os.getenv('GOOGLE_CLIENT_ID', ''),
            "client_secret": os.getenv('GOOGLE_CLIENT_SECRET', ''),
            "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
            "token_uri":     "https://oauth2.googleapis.com/token",
            "redirect_uris": [os.getenv(
                'GOOGLE_REDIRECT_URI',
                'http://localhost:5000/auth/google/callback'
            )],
        }
    }


def _redirect_uri():
    return os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:5000/auth/google/callback')


def init_app(db):
    global mongo
    mongo = db


# ── Email / password ───────────────────────────────────────────────────────

@auth.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name     = data.get('name')
    email    = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400
    if mongo.db.users.find_one({'email': email}):
        return jsonify({'error': 'User already exists'}), 409

    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    mongo.db.users.insert_one({
        'name': name, 'email': email, 'password': hashed,
        'created_at': datetime.utcnow(),
    })
    return jsonify({'message': 'User registered successfully'}), 201


@auth.route('/login', methods=['POST'])
def login():
    data     = request.get_json()
    email    = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = mongo.db.users.find_one({'email': email})
    if not user:
        return jsonify({'error': 'User not found'}), 401
    if not bcrypt.checkpw(password.encode('utf-8'), user['password']):
        return jsonify({'error': 'Invalid password'}), 401

    token = jwt.encode(
        {"email": user['email'], "exp": datetime.utcnow() + timedelta(hours=24)},
        os.getenv('SECRET_KEY'), algorithm="HS256",
    )
    return jsonify({'message': 'Login successful', 'token': token}), 200


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        try:
            data = jwt.decode(token, os.getenv('SECRET_KEY'), algorithms=["HS256"])
            current_user = mongo.db.users.find_one({'email': data['email']})
        except Exception:
            return jsonify({'error': 'Token is invalid or expired'}), 401
        return f(current_user, *args, **kwargs)
    return decorated


@auth.route('/profile', methods=['GET'])
@token_required
def profile(current_user):
    return jsonify({'name': current_user['name'], 'email': current_user['email']}), 200


# ── Google OAuth ───────────────────────────────────────────────────────────

@auth.route('/auth/google')
def google_login():
    """
    Step 1 — Build the Google consent URL and redirect the browser to it.

    The Flow object generates a PKCE code_verifier automatically (google-auth-
    oauthlib ≥ 1.0). We must persist both `state` and `code_verifier` in the
    Flask session so the callback can reconstruct an equivalent Flow.
    """
    if not os.getenv('GOOGLE_CLIENT_ID'):
        return jsonify({'error': 'Google OAuth is not configured on this server.'}), 503

    flow = Flow.from_client_config(
        _client_config(),
        scopes=_SCOPES,
        redirect_uri=_redirect_uri(),
    )

    auth_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='select_account',
    )

    # Persist state + PKCE verifier across the redirect
    session['oauth_state']         = state
    session['oauth_code_verifier'] = getattr(flow, 'code_verifier', None)

    return redirect(auth_url)


@auth.route('/auth/google/callback')
def google_callback():
    """
    Step 2 — Google redirects here with ?code=&state=

    Reconstruct the Flow with the same state and code_verifier that were
    stored in the session during step 1, then exchange the code for tokens.
    """
    frontend_origin = os.getenv('FRONTEND_ORIGIN', 'http://localhost:3000')

    try:
        # Retrieve PKCE verifier saved in step 1
        saved_state         = session.pop('oauth_state', None)
        saved_code_verifier = session.pop('oauth_code_verifier', None)

        flow = Flow.from_client_config(
            _client_config(),
            scopes=_SCOPES,
            redirect_uri=_redirect_uri(),
            state=saved_state,
        )

        # Restore the code_verifier so fetch_token can include it
        if saved_code_verifier:
            flow.code_verifier = saved_code_verifier

        flow.fetch_token(authorization_response=request.url)
        credentials = flow.credentials

        # Verify the ID token and extract user info
        info = id_token.verify_oauth2_token(
            credentials.id_token,
            google_requests.Request(),
            os.getenv('GOOGLE_CLIENT_ID'),
        )
        email = info['email']
        name  = info.get('name') or email.split('@')[0]

        # Upsert user — Google-auth users have no password field
        mongo.db.users.update_one(
            {'email': email},
            {'$setOnInsert': {
                'name': name, 'email': email,
                'password': None, 'created_at': datetime.utcnow(),
            }},
            upsert=True,
        )
        # Always refresh display name from Google profile
        mongo.db.users.update_one({'email': email}, {'$set': {'name': name}})

        token = jwt.encode(
            {"email": email, "exp": datetime.utcnow() + timedelta(hours=24)},
            os.getenv('SECRET_KEY'), algorithm="HS256",
        )

        params = urllib.parse.urlencode({'token': token, 'name': name, 'email': email})
        return redirect(f'{frontend_origin}/auth/callback?{params}')

    except Exception as exc:
        return redirect(
            f'{frontend_origin}/login?error={urllib.parse.quote(str(exc))}'
        )
