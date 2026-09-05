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

_SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
]

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'


# Return the OAuth2 client config dict built from environment variables
def _client_config():
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


# Return the configured Google OAuth redirect URI
def _redirect_uri():
    return os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:5000/auth/google/callback')


# Inject MongoDB instance shared from app.py
def init_app(db):
    global mongo
    mongo = db


# Create a new user account with hashed password
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


# Verify credentials and return a 24-hour JWT
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


# Decorator that validates Bearer JWT before allowing access to a route
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


# Return name and email for the authenticated user
@auth.route('/profile', methods=['GET'])
@token_required
def profile(current_user):
    return jsonify({'name': current_user['name'], 'email': current_user['email']}), 200


# Redirect the browser to the Google OAuth consent screen
@auth.route('/auth/google')
def google_login():
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

    session['oauth_state']         = state
    session['oauth_code_verifier'] = getattr(flow, 'code_verifier', None)

    return redirect(auth_url)


# Handle the Google OAuth callback, upsert the user, and redirect with JWT
@auth.route('/auth/google/callback')
def google_callback():
    frontend_origin = os.getenv('FRONTEND_ORIGIN', 'http://localhost:3000')

    try:
        saved_state         = session.pop('oauth_state', None)
        saved_code_verifier = session.pop('oauth_code_verifier', None)

        flow = Flow.from_client_config(
            _client_config(),
            scopes=_SCOPES,
            redirect_uri=_redirect_uri(),
            state=saved_state,
        )

        if saved_code_verifier:
            flow.code_verifier = saved_code_verifier

        auth_response = request.url
        if auth_response.startswith('http://') and _redirect_uri().startswith('https://'):
            auth_response = 'https://' + auth_response[len('http://'):]

        flow.fetch_token(authorization_response=auth_response)
        credentials = flow.credentials

        info = id_token.verify_oauth2_token(
            credentials.id_token,
            google_requests.Request(),
            os.getenv('GOOGLE_CLIENT_ID'),
        )
        email = info['email']
        name  = info.get('name') or email.split('@')[0]

        mongo.db.users.update_one(
            {'email': email},
            {'$setOnInsert': {
                'name': name, 'email': email,
                'password': None, 'created_at': datetime.utcnow(),
            }},
            upsert=True,
        )
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
