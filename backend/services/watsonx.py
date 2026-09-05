<<<<<<< HEAD
=======
"""
services/watsonx.py
--------------------
Thin wrapper around the IBM Watsonx.ai text-generation REST API.

Uses the ibm-watsonx-ai SDK when available, falls back to a raw HTTPS
call so the service works without extra dependencies.

Public helpers
--------------
generate(prompt, max_new_tokens, temperature, stop_sequences) -> str
    Send a prompt to Llama-3-70b-Instruct and return the generated text.

All calls are synchronous (Flask is sync by default).  The API key is
exchanged for an IAM Bearer token automatically and cached until expiry.
"""

>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
from __future__ import annotations

import os
import time
import threading
import requests

<<<<<<< HEAD
IBM_API_KEY   = os.getenv("IBM_API_KEY", "")
PROJECT_ID    = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL   = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")
MODEL_ID      = "meta-llama/llama-3-3-70b-instruct"
=======
# ── Configuration ─────────────────────────────────────────────────────────
IBM_API_KEY   = os.getenv("IBM_API_KEY", "")
PROJECT_ID    = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL   = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")
MODEL_ID      = "meta-llama/llama-3-3-70b-instruct"   # Llama-3 70B on Watsonx
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac

IAM_TOKEN_URL = "https://iam.cloud.ibm.com/identity/token"
GENERATION_ENDPOINT = f"{WATSONX_URL}/ml/v1/text/generation?version=2023-05-29"

<<<<<<< HEAD
_token_lock   = threading.Lock()
_cached_token = ""
_token_expiry = 0.0


# Return a valid IAM Bearer token, refreshing when < 60 s remain
def _get_iam_token() -> str:
=======
# ── IAM token cache (thread-safe) ─────────────────────────────────────────
_token_lock      = threading.Lock()
_cached_token    = ""
_token_expiry    = 0.0   # epoch seconds


def _get_iam_token() -> str:
    """Return a valid IAM Bearer token, refreshing when < 60 s remain."""
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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


<<<<<<< HEAD
# Call the Watsonx text-generation endpoint and return the generated text
=======
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
def generate(
    prompt: str,
    max_new_tokens: int = 200,
    temperature: float  = 0.3,
    stop_sequences: list[str] | None = None,
) -> str:
<<<<<<< HEAD
=======
    """
    Call the Watsonx text-generation endpoint and return the generated text.

    Parameters
    ----------
    prompt          : Full prompt string (system + user combined for Llama).
    max_new_tokens  : Hard cap on output tokens.
    temperature     : 0 = deterministic, 1 = creative.
    stop_sequences  : Optional list of strings that halt generation early.

    Returns
    -------
    str — raw generated text (stripped), or "" on failure.

    Raises
    ------
    RuntimeError — if credentials are missing or the API returns an error.
    """
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
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


<<<<<<< HEAD
# Return True if the required env vars are set (doesn't validate the key)
def is_configured() -> bool:
=======
def is_configured() -> bool:
    """Return True if the required env vars are set (doesn't validate the key)."""
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
    return bool(IBM_API_KEY and PROJECT_ID)
