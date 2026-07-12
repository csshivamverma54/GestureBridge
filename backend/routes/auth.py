
from flask import Flask, jsonify, request, Blueprint
from flask_pymongo import PyMongo
import bcrypt
from datetime import datetime , timedelta
import os
import jwt
from functools import wraps

auth = Blueprint('auth', __name__)

mongo = None

def init_app(db):
    global mongo
    mongo = db

@auth.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400
    existing_user = mongo.db.users.find_one({'email': email})
    if existing_user:
        return jsonify({'error': 'User already exists'}), 409
    
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    user = {
        'name': name,
        'email': email,
        'password': hashed_password,
        'created_at': datetime.utcnow()
    }
    mongo.db.users.insert_one(user)
    return jsonify({'message': 'User registered successfully'}), 201

@auth.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = mongo.db.users.find_one({'email': email})
    if not user :
        return jsonify({'error': 'User not found'}), 401
    if not bcrypt.checkpw(password.encode('utf-8'), user['password']):
        return jsonify({'error': 'Invalid password'}), 401

    token = jwt.encode({"email": user['email'], "exp": datetime.utcnow() + timedelta(hours=24)}, os.getenv('SECRET_KEY'), algorithm="HS256")

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
        except :
            return jsonify({'error': 'Token is invalid or expired'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

@auth.route('/profile', methods=['GET'])
@token_required
def profile(current_user):
    return jsonify({
        'name': current_user['name'],
        'email': current_user['email'],
    }), 200
