from __future__ import annotations

import os
import time
import threading
import requests

IBM_API_KEY   = os.getenv("IBM_API_KEY", "")
PROJECT_ID    = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL   = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")
MODEL_ID      = "meta-llama/llama-3-3-70b-instruct"

IAM_TOKEN_URL = "https://iam.cloud.ibm.com/identity/token"
GENERATION_ENDPOINT = f"{WATSONX_URL}/ml/v1/text/generation?version=2023-05-29"

_token_lock   = threading.Lock()
_cached_token = ""
_token_expiry = 0.0


# Return a valid IAM Bearer token, refreshing when < 60 s remain
def _get_iam_token() -> str:
    global _cached_token, _token_expiry
    with _token_lock:
        if time.time() < _token_expiry - 60:
            return _cached_token
        resp = requests.post(
            IAM_TOKEN_URL,
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey":     IBM_API_KEY,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        resp.raise_for_status()
        payload = resp.json()
        _cached_token  = payload["access_token"]
        _token_expiry  = time.time() + int(payload.get("expires_in", 3600))
        return _cached_token


# Call the Watsonx text-generation endpoint and return the generated text
def generate(
    prompt: str,
    max_new_tokens: int = 200,
    temperature: float  = 0.3,
    stop_sequences: list[str] | None = None,
) -> str:
    if not IBM_API_KEY or not PROJECT_ID:
        raise RuntimeError(
            "IBM_API_KEY and WATSONX_PROJECT_ID must be set in environment variables."
        )

    token = _get_iam_token()

    body: dict = {
        "model_id":  MODEL_ID,
        "project_id": PROJECT_ID,
        "input":     prompt,
        "parameters": {
            "decoding_method": "greedy" if temperature == 0 else "sample",
            "max_new_tokens":  max_new_tokens,
            "temperature":     temperature,
            "repetition_penalty": 1.1,
        },
    }
    if stop_sequences:
        body["parameters"]["stop_sequences"] = stop_sequences

    resp = requests.post(
        GENERATION_ENDPOINT,
        json=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
        },
        timeout=30,
    )
    resp.raise_for_status()

    result = resp.json()
    try:
        text = result["results"][0]["generated_text"]
        return text.strip()
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"Unexpected Watsonx response shape: {result}") from exc


# Return True if the required env vars are set (doesn't validate the key)
def is_configured() -> bool:
    return bool(IBM_API_KEY and PROJECT_ID)
