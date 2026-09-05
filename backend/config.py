import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    MONGO_URI   = os.getenv('MONGO_URI')
    SECRET_KEY  = os.getenv('SECRET_KEY')
<<<<<<< HEAD
    IBM_API_KEY          = os.getenv('IBM_API_KEY', '')
    WATSONX_PROJECT_ID   = os.getenv('WATSONX_PROJECT_ID', '')
    WATSONX_URL          = os.getenv('WATSONX_URL', 'https://us-south.ml.cloud.ibm.com')
=======
    # IBM Watsonx.ai
    IBM_API_KEY          = os.getenv('IBM_API_KEY', '')
    WATSONX_PROJECT_ID   = os.getenv('WATSONX_PROJECT_ID', '')
    WATSONX_URL          = os.getenv('WATSONX_URL', 'https://us-south.ml.cloud.ibm.com')
    # Google OAuth
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    GOOGLE_CLIENT_ID     = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REDIRECT_URI  = os.getenv(
        'GOOGLE_REDIRECT_URI',
        'http://localhost:5000/auth/google/callback'
    )
<<<<<<< HEAD
=======
    # Gmail SMTP — OTP email delivery
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    GMAIL_USER         = os.getenv('GMAIL_USER', '')
    GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD', '')
