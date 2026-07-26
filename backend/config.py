import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    MONGO_URI   = os.getenv('MONGO_URI')
    SECRET_KEY  = os.getenv('SECRET_KEY')
    # IBM Watsonx.ai
    IBM_API_KEY          = os.getenv('IBM_API_KEY', '')
    WATSONX_PROJECT_ID   = os.getenv('WATSONX_PROJECT_ID', '')
    WATSONX_URL          = os.getenv('WATSONX_URL', 'https://us-south.ml.cloud.ibm.com')
