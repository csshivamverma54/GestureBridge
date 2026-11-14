import os
from pathlib import Path
from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parent
load_dotenv(_BASE_DIR / '.env')
load_dotenv()  # Also load from current working directory if present

class Config:
    MONGO_URI   = os.getenv('MONGO_URI', 'mongodb://localhost:27017/gesturebridge')
    SECRET_KEY  = os.getenv('SECRET_KEY', 'dev-secret-key-gesturebridge-2026')
    IBM_API_KEY          = os.getenv('IBM_API_KEY', '')
    WATSONX_PROJECT_ID   = os.getenv('WATSONX_PROJECT_ID', '')
    WATSONX_URL          = os.getenv('WATSONX_URL', 'https://us-south.ml.cloud.ibm.com')
    GOOGLE_CLIENT_ID     = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REDIRECT_URI  = os.getenv(
        'GOOGLE_REDIRECT_URI',
        'http://localhost:5000/auth/google/callback'
    )
    GMAIL_USER         = os.getenv('GMAIL_USER', '')
    GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD', '')
