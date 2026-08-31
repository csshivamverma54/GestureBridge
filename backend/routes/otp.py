"""
otp.py  (backend/routes/otp.py)
--------------------------------
Real OTP email verification via Gmail SMTP.

Routes
------
POST /otp/send
    Generate a 6-digit OTP, store it in MongoDB with a 10-minute TTL,
    and send it to the given address using Gmail App Password SMTP.

    Body:  { "email": "user@example.com" }
    Returns 200 on success, 500 on SMTP failure.

POST /otp/verify
    Check the submitted code against the stored OTP.

    Body:  { "email": "user@example.com", "code": "123456" }
    Returns 200 {"valid": true} or 400 {"valid": false, "error": "..."}
"""

import os
import random
import smtplib
import string
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import Blueprint, jsonify, request

otp_bp = Blueprint("otp", __name__)

mongo = None


def init_otp_db(db):
    global mongo
    mongo = db


# ── Helpers ────────────────────────────────────────────────────────────────

def _gen_code() -> str:
    return "".join(random.choices(string.digits, k=6))


def _send_email(to_addr: str, code: str) -> None:
    """Send OTP email via Gmail SMTP using env-configured App Password."""
    gmail_user = os.getenv("GMAIL_USER", "")
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD", "")
    if not gmail_user or not gmail_pass:
        raise RuntimeError("GMAIL_USER or GMAIL_APP_PASSWORD not configured.")

    subject = "Your GestureBridge verification code"
    html_body = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#3b82d4;margin:0 0 8px">GestureBridge</h2>
      <p style="color:#57606a;margin:0 0 24px;font-size:14px">Bridging communication one sign at a time.</p>
      <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:10px;padding:28px;text-align:center">
        <p style="margin:0 0 8px;color:#57606a;font-size:14px">Your verification code is</p>
        <div style="font-size:42px;font-weight:800;letter-spacing:10px;color:#1f2328;font-variant-numeric:tabular-nums">
          {code}
        </div>
        <p style="margin:16px 0 0;color:#57606a;font-size:13px">
          This code expires in <strong>10 minutes</strong>.<br>
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <p style="color:#57606a;font-size:12px;margin:20px 0 0;text-align:center">
        &copy; 2025 GestureBridge &mdash; Do not reply to this email.
      </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"GestureBridge <{gmail_user}>"
    msg["To"]      = to_addr
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
        server.starttls()
        server.login(gmail_user, gmail_pass)
        server.sendmail(gmail_user, to_addr, msg.as_string())


# ── POST /otp/send ─────────────────────────────────────────────────────────

@otp_bp.route("/otp/send", methods=["POST"])
def send_otp():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "email is required"}), 400

    code    = _gen_code()
    expires = datetime.utcnow() + timedelta(minutes=10)

    # Upsert: one active OTP per email at a time
    mongo.db.otp_codes.update_one(
        {"email": email},
        {"$set": {"code": code, "expires_at": expires, "verified": False}},
        upsert=True,
    )

    try:
        _send_email(email, code)
    except Exception as exc:
        # Remove the stored code so the user can retry cleanly
        mongo.db.otp_codes.delete_one({"email": email})
        return jsonify({"error": f"Failed to send email: {str(exc)}"}), 500

    return jsonify({"message": "OTP sent"}), 200


# ── POST /otp/verify ───────────────────────────────────────────────────────

@otp_bp.route("/otp/verify", methods=["POST"])
def verify_otp():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code  = (data.get("code")  or "").strip()

    if not email or not code:
        return jsonify({"valid": False, "error": "email and code are required"}), 400

    record = mongo.db.otp_codes.find_one({"email": email})
    if not record:
        return jsonify({"valid": False, "error": "No OTP found. Please request a new code."}), 400

    if record.get("verified"):
        return jsonify({"valid": False, "error": "Code already used. Please request a new one."}), 400

    if datetime.utcnow() > record["expires_at"]:
        mongo.db.otp_codes.delete_one({"email": email})
        return jsonify({"valid": False, "error": "Code expired. Please request a new one."}), 400

    if record["code"] != code:
        return jsonify({"valid": False, "error": "Incorrect code. Please try again."}), 400

    # Mark as verified (prevents replay)
    mongo.db.otp_codes.update_one({"email": email}, {"$set": {"verified": True}})
    return jsonify({"valid": True}), 200
