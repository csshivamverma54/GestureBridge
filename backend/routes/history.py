from flask import Blueprint, jsonify, request

history = Blueprint('history', __name__)

mongo = None

<<<<<<< HEAD

# Inject MongoDB instance shared from app.py
=======
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
def init_db(db):
    global mongo
    mongo = db

<<<<<<< HEAD

# Return all gesture prediction records for the given user
=======
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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
<<<<<<< HEAD
    return jsonify(output), 200
=======
    return jsonify(output), 200
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
