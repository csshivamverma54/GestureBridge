from flask import Blueprint, jsonify, request

history = Blueprint('history', __name__)

mongo = None

def init_db(db):
    global mongo
    mongo = db

@history.route('/history/<user_id>', methods=['GET'])
def get_history(user_id):
    records = list(mongo.db.gesture_history.find({'user_id': user_id}, {'_id': 0}))
    output = []
    for record in records:
        output.append({
            'gesture': record['gesture_input'],
            'predicted_text': record['predicted_text'],
            'timestamp': record['timestamp']
        })
    return jsonify(output), 200