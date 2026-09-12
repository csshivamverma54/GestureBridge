import os
from datetime import datetime
import jwt
from flask import Blueprint, jsonify, request

history = Blueprint('history', __name__)

mongo = None


# Inject MongoDB instance shared from app.py
def init_db(db):
    global mongo
    mongo = db
    if mongo and mongo.db is not None:
        try:
            mongo.db.gesture_history.create_index([('user_id', 1), ('timestamp', -1)], background=True)
        except Exception:
            pass


def _extract_user_id(path_user_id=None):
    """Resolve the effective user_id from path, query params, or JWT Bearer header."""
    uid = (path_user_id or '').strip()
    if uid:
        return uid

    param_uid = (request.args.get('user_id') or request.args.get('email') or '').strip()
    if param_uid:
        return param_uid

    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        try:
            payload = jwt.decode(token, os.getenv('SECRET_KEY', ''), algorithms=['HS256'])
            return payload.get('email') or payload.get('user_id') or ''
        except Exception:
            pass

    return ''


# Return gesture prediction records for the given user (or authenticated user)
@history.route('/history', methods=['GET'])
@history.route('/history/', methods=['GET'])
@history.route('/history/<path:user_id>', methods=['GET'])
def get_history(user_id=None):
    target_user_id = _extract_user_id(user_id)

    if not target_user_id:
        return jsonify([]), 200

    if mongo is None or mongo.db is None:
        return jsonify([]), 200

    try:
        limit_param = request.args.get('limit', '500').strip().lower()
        limit_val = None if limit_param in ('0', 'all', 'none') else int(limit_param)
        page_param = request.args.get('page', '1').strip()
        page_val = max(1, int(page_param)) if page_param.isdigit() else 1
    except ValueError:
        limit_val = 500
        page_val = 1

    try:
        mode_param = request.args.get('mode', '').strip().lower()
        query = {'user_id': target_user_id}
        if mode_param and mode_param != 'all':
            if mode_param in ('sign-to-text', 'signtotext'):
                query['$or'] = [{'mode': {'$in': ['sign-to-text', 'signtotext']}}, {'mode': {'$exists': False}}]
            else:
                query['$or'] = [{'mode': mode_param}, {'type': mode_param}]

        cursor = (
            mongo.db.gesture_history
            .find(query, {'gesture_input': 0, '_id': 0})
            .sort('timestamp', -1)
        )
        if limit_val:
            skip_val = (page_val - 1) * limit_val
            if skip_val > 0:
                cursor = cursor.skip(skip_val)
            cursor = cursor.limit(limit_val)

        records = list(cursor)
        output = []
        for record in records:
            ts = record.get('timestamp')
            if hasattr(ts, 'isoformat'):
                ts_val = ts.isoformat()
            elif ts:
                ts_val = str(ts)
            else:
                ts_val = None

            r_mode = record.get('mode') or record.get('type') or 'sign-to-text'

            output.append({
                'predicted_text': record.get('predicted_text', 'unknown'),
                'confidence': float(record.get('confidence', 0.0)),
                'mode': r_mode,
                'type': r_mode,
                'top5': record.get('top5', []),
                'nmm': record.get('nmm', {}),
                'timestamp': ts_val,
                'user_id': record.get('user_id', target_user_id),
            })

        resp = jsonify(output)
        total_count = len(output)
        if limit_val and len(output) == limit_val:
            try:
                total_count = mongo.db.gesture_history.count_documents(query)
            except Exception:
                pass
        resp.headers['X-Total-Count'] = str(total_count)
        resp.headers['Access-Control-Expose-Headers'] = 'X-Total-Count'
        return resp, 200
    except Exception as exc:
        return jsonify({'error': f'Failed to retrieve history: {str(exc)}'}), 500


# Record a new gesture prediction or translated phrase
@history.route('/history', methods=['POST'])
@history.route('/history/', methods=['POST'])
def save_history():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    target_user_id = _extract_user_id(data.get('user_id'))
    predicted_text = data.get('predicted_text')
    mode = (data.get('mode') or data.get('type') or 'sign-to-text').strip().lower()

    if not target_user_id or not predicted_text:
        return jsonify({'error': 'Fields "user_id" and "predicted_text" are required'}), 400

    record = {
        'user_id': target_user_id,
        'predicted_text': str(predicted_text).strip(),
        'confidence': float(data.get('confidence', 1.0)),
        'mode': mode,
        'type': mode,
        'top5': data.get('top5', []),
        'nmm': data.get('nmm', {}),
        'timestamp': datetime.utcnow(),
    }

    if mongo and mongo.db is not None:
        try:
            mongo.db.gesture_history.insert_one(record)
            return jsonify({
                'message': 'History saved successfully',
                'predicted_text': record['predicted_text'],
                'confidence': record['confidence'],
                'mode': record['mode'],
                'type': record['type'],
                'timestamp': record['timestamp'].isoformat(),
            }), 201
        except Exception as exc:
            return jsonify({'error': f'Failed to save history: {str(exc)}'}), 500

    return jsonify({'message': 'History acknowledged (storage offline)'}), 200
