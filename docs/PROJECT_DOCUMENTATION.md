# GestureBridge — Complete Project Documentation

> A full-stack ASL (American Sign Language) translation web application.  
> **Stack:** React + Vite (frontend) · Flask + MongoDB (backend) · PyTorch + MediaPipe (ML) · IBM Watsonx.ai (LLM)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Frontend](#4-frontend)
   - 4.1 Entry Points
   - 4.2 Routing (App.jsx)
   - 4.3 Context Providers
   - 4.4 Pages
   - 4.5 Components
   - 4.6 API Service Layer (api.js)
5. [Backend](#5-backend)
   - 5.1 Entry Point (app.py)
   - 5.2 Configuration (config.py)
   - 5.3 Routes
   - 5.4 Services
6. [Machine Learning](#6-machine-learning)
   - 6.1 Feature Vector (landmarks.py)
   - 6.2 Word Gesture Model (predictor.py / model.py)
   - 6.3 Letter Classifier (letter_predictor.py)
   - 6.4 Sentence Generator (sentence_generator.py)
   - 6.5 Preprocessing (preprocess.py)
7. [Data & Storage](#7-data--storage)
8. [Authentication & Security](#8-authentication--security)
9. [OTP Email Verification](#9-otp-email-verification)
10. [Text-to-Sign Pipeline](#10-text-to-sign-pipeline)
11. [Sign-to-Text Pipeline](#11-sign-to-text-pipeline)
12. [IBM Watsonx.ai Integration](#12-ibm-watsonxai-integration)
13. [Speech Features (STT / TTS)](#13-speech-features-stt--tts)
14. [Deployment](#14-deployment)
15. [Environment Variables](#15-environment-variables)
16. [Key Data Flows (Step-by-Step)](#16-key-data-flows-step-by-step)

---

## 1. Project Overview

GestureBridge bridges communication between hearing and deaf communities by providing:

| Feature | Description |
|---|---|
| **Sign → Text** | Live webcam captures hand landmarks via MediaPipe; a BiLSTM model predicts ASL words in real time |
| **Text → Sign** | Types text is matched to the WLASL video dataset and played as a sequence of sign videos |
| **Fingerspelling** | Per-frame ASL alphabet classifier (A–Z) with J/Z motion-detection override |
| **AI Polish** | IBM Watsonx Llama-3-70B improves raw sign translations into fluent English |
| **Speech I/O** | Browser Web Speech API: mic input fills text boxes; TTS reads translations aloud |
| **Multilingual** | English (ASL/ISL), Hindi (hi-IN), Marathi (mr-IN) for STT/TTS locale |
| **Auth** | Email+password with OTP email verification, or Google OAuth 2.0 |
| **History** | Every prediction is persisted to MongoDB and shown in a history view |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  React SPA (Vite)                                │
│  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│  │ SignToText│  │ TextToSign │  │ Auth / OTP  │  │
│  └─────┬────┘  └─────┬──────┘  └──────┬──────┘  │
│        │  REST/JSON  │                 │          │
└────────┼─────────────┼─────────────────┼──────────┘
         │             │                 │
         ▼             ▼                 ▼
┌────────────────────────────────────────────────────┐
│               Flask (Gunicorn)                      │
│  app.py  ──  CORS  ──  Blueprints                  │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ gesture  │ │ text_to_sign │ │ auth / otp     │  │
│  │ .py      │ │ .py          │ │ .py            │  │
│  └────┬─────┘ └──────┬───────┘ └───────┬────────┘  │
│       │              │                  │            │
│  ┌────▼─────┐  ┌─────▼──────┐  ┌───────▼──────┐    │
│  │ML Layer  │  │WLASL Dataset│  │  MongoDB     │    │
│  │predictor │  │(videos/json)│  │  (Atlas)     │    │
│  │model.pt  │  └────────────┘  └──────────────┘    │
│  └──────────┘                                       │
│       │                                             │
│  ┌────▼─────────────┐                               │
│  │ IBM Watsonx.ai   │  (optional LLM polish)        │
│  │ Llama-3-70B      │                               │
│  └──────────────────┘                               │
└────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
GestureBridge-master/
│
├── frontend/                        # React + Vite SPA
│   ├── src/
│   │   ├── main.jsx                 # React DOM entry point
│   │   ├── App.jsx                  # Router + provider tree
│   │   ├── index.css                # Global styles
│   │   ├── context/
│   │   │   ├── AuthContext.jsx      # JWT session state
│   │   │   └── SettingsContext.jsx  # Theme / language / TTS prefs
│   │   ├── pages/
│   │   │   ├── Landing.jsx          # Public home page
│   │   │   ├── Auth.jsx             # Login + Register + OTP
│   │   │   ├── AuthCallback.jsx     # Google OAuth redirect handler
│   │   │   ├── Dashboard.jsx        # Post-login home
│   │   │   ├── SignToText.jsx       # Webcam → ASL prediction
│   │   │   ├── TextToSign.jsx       # Text input → sign videos
│   │   │   ├── History.jsx          # Past translations list
│   │   │   └── AccountSettings.jsx  # Profile + preferences
│   │   ├── components/
│   │   │   ├── AppShell.jsx         # Layout wrapper (Sidebar + Topbar)
│   │   │   ├── Sidebar.jsx          # Navigation sidebar
│   │   │   ├── Topbar.jsx           # Top bar (theme toggle etc.)
│   │   │   ├── Alert.jsx            # Reusable alert banner
│   │   │   ├── LoadingSpinner.jsx   # Spinner component
│   │   │   └── ProtectedRoute.jsx   # Auth guard wrapper
│   │   └── services/
│   │       └── api.js               # Axios client + all API calls
│   ├── vite.config.js               # Dev proxy → Flask :5000
│   └── package.json
│
├── backend/                         # Flask application
│   ├── app.py                       # Flask factory + CORS + blueprints
│   ├── config.py                    # Env-var config class
│   ├── requirements.txt             # Python dependencies
│   ├── Procfile / render.yaml       # Deployment config
│   │
│   ├── routes/
│   │   ├── auth.py                  # /register /login /profile /auth/google
│   │   ├── gesture.py               # /predict /predict-letter /generate-sentence
│   │   ├── text_to_sign.py          # /text-to-sign /video/<id>
│   │   ├── history.py               # /history/<user_id>
│   │   ├── ai.py                    # /ai/* (Watsonx endpoints)
│   │   └── otp.py                   # /otp/send /otp/verify
│   │
│   ├── services/
│   │   └── watsonx.py               # IAM token + Watsonx generate()
│   │
│   ├── ml/
│   │   ├── predictor.py             # Singleton inference: predict_gesture()
│   │   ├── model.py                 # GestureBridgeLSTM PyTorch class
│   │   ├── letter_predictor.py      # ASL letter sklearn classifier
│   │   ├── sentence_generator.py    # Rule-based gloss → English
│   │   ├── gesture_model.pt         # Trained LSTM weights (gitignored)
│   │   ├── labels.json              # idx → word mapping
│   │   ├── normalizer.npz           # Per-feature mean/std for z-score
│   │   └── utils/
│   │       ├── landmarks.py         # MediaPipe 218-dim feature extractor
│   │       └── preprocess.py        # pad_or_truncate, z-score helpers
│   │
│   ├── models/
│   │   ├── asl_letter_model.joblib  # Letter sklearn model (split path)
│   │   ├── asl_letter_scaler.joblib # StandardScaler for letter model
│   │   └── asl_letter_bundle.joblib # Bundle path (model + label_encoder)
│   │
│   └── data/
│       └── WLASL/
│           ├── curated_WLASL.json   # Word → video metadata index
│           └── videos/              # 2600 WLASL mp4 files (gitignored)
```

---

## 4. Frontend

### 4.1 Entry Points

**`frontend/src/main.jsx`**
- React 18 entry: renders `<App />` into `#root`.
- No logic here; just `ReactDOM.createRoot`.

### 4.2 Routing — `App.jsx`

Wraps the whole tree in two context providers (settings first, then auth) so every page has access to both.

```
SettingsProvider
  └── AuthProvider
        └── BrowserRouter
              ├── /                → Landing
              ├── /login           → Auth (tab=login)
              ├── /register        → Auth (tab=register)
              ├── /auth/callback   → AuthCallback
              ├── /dashboard  [🔒] → Dashboard
              ├── /sign-to-text[🔒]→ SignToText
              ├── /text-to-sign[🔒]→ TextToSign
              ├── /history    [🔒] → History
              └── /account    [🔒] → AccountSettings
```

`[🔒]` = wrapped in `<ProtectedRoute>` which redirects unauthenticated users to `/login`.

### 4.3 Context Providers

#### `AuthContext.jsx`
Manages JWT session. Persists `gb_token` and `gb_user` to `localStorage`.

| Export | Purpose |
|---|---|
| `user` | `{name, email}` or `null` |
| `token` | JWT string or `null` |
| `loading` | `true` while hydrating from storage |
| `login(token, user)` | Store credentials after successful login |
| `loginAsGuest()` | Set ephemeral guest session (no persistence) |
| `logout()` | Clear state + localStorage |
| `updateUser(partial)` | Patch profile fields in state + storage |

#### `SettingsContext.jsx`
Manages display/UX preferences persisted to `localStorage`.

| Export | Purpose |
|---|---|
| `theme` | `'light'` \| `'dark'` |
| `language` | `'ASL'` \| `'ISL'` \| `'Hindi'` \| `'Marathi'` |
| `ttsLanguage` | BCP-47 locale for Web Speech API (`en-US`, `hi-IN`, `mr-IN`) |
| `recognitionMode` | `'word'` \| `'letter'` |
| `captureInterval` | Webcam frame rate in ms (default 200) |
| `confidenceThreshold` | Minimum ML confidence to accept (default 0.60) |
| `SUPPORTED_LANGUAGES` | Array of `{value, label, ttsLocale, nativeName}` |
| `getTTSLocale(lang)` | Map language value → BCP-47 locale |
| `toggleTheme()` | Flip light/dark |
| `updateSettings(partial)` | Merge partial settings object |

### 4.4 Pages

#### `Landing.jsx`
Public marketing page. "Get Started" → `/register`. "Learn More" → scroll.

#### `Auth.jsx`
Three-tab form: **Login**, **Register**, **Guest**.

- **Login flow:** `loginUser({email, password})` → store JWT → redirect `/dashboard`
- **Register flow (with OTP):**
  1. User fills name/email/password → click Register
  2. `POST /otp/send` — backend emails a 6-digit code
  3. OTP input screen appears
  4. `POST /otp/verify` — if valid, `registerUser(data)` creates account
  5. Auto-login → redirect `/dashboard`
- **Guest:** `loginAsGuest()` → ephemeral session, limited backend access
- **Google OAuth:** redirect to `/auth/google` (backend initiates OAuth dance)

#### `AuthCallback.jsx`
Reads `?token=&name=&email=` from URL (set by Flask after Google OAuth), calls `login()`, redirects to `/dashboard`.

#### `Dashboard.jsx`
Post-login home. Shows quick-action cards (Sign→Text, Text→Sign), model status badge, AI status badge.

#### `SignToText.jsx`
The primary gesture recognition page. Two modes selectable via `recognitionMode`:

**Word Mode:**
1. `getUserMedia` opens webcam
2. Every `captureInterval` ms, a frame is captured and sent to MediaPipe Holistic running client-side (via `@mediapipe/holistic`)
3. Landmarks are accumulated into a 45-frame sliding window
4. When confidence is stable, the 45×218 array is `POST /predict`
5. Response `predicted_text` is added to the sentence buffer
6. `/generate-sentence` converts accumulated glosses + NMM data into English
7. 🔊 TTS button reads the sentence aloud in the selected language

**Letter Mode (Fingerspelling):**
1. Same webcam capture
2. Every frame, the 63 dominant-hand landmarks are `POST /predict-letter`
3. `LetterSession` debounce logic (server mirrors) accumulates letters into words
4. `/generate-letter-sentence` resolves the spelled word via Watsonx or difflib
5. 🔊 TTS reads the result

**NMM (Non-Manual Markers):** eyebrow raise/furrow, head nod/shake, mouth open are extracted client-side from face landmarks and sent as the `nmm` payload with each `/predict` call.

#### `TextToSign.jsx`
Converts typed/spoken text to ASL sign videos.

1. User types text (or 🎤 speech-to-text fills the box)
2. Click "Show Signs" → `POST /text-to-sign`
3. Response is an array of `{word, video_url, external_url, found, fuzzy}` objects
4. Videos play sequentially; each finishes and triggers the next
5. Language selector drives both STT locale and TTS voice
6. 🔊 buttons on input text, each word, and the whole sentence

#### `History.jsx`
Calls `GET /history/<user_id>`. Lists `{gesture, predicted_text, timestamp}` entries in a table.

#### `AccountSettings.jsx`
Three sections:
- **Profile** — update name/email (optimistic update via `updateUser`)
- **Preferences** — theme, language (ASL/ISL/Hindi/Marathi), recognition mode, capture interval, confidence threshold
- **Notifications / Privacy** toggles

### 4.5 Components

| Component | Purpose |
|---|---|
| `AppShell.jsx` | Layout: wraps every protected page with `<Sidebar>` + `<Topbar>` + content area |
| `Sidebar.jsx` | Left navigation: links to Dashboard, Sign→Text, Text→Sign, History, Account |
| `Topbar.jsx` | Top bar: page title, theme toggle, user avatar/logout |
| `ProtectedRoute.jsx` | Reads `AuthContext.loading` + `token`; renders children or redirects to `/login` |
| `Alert.jsx` | Dismissable alert banner (`type`: info/success/warning/error) |
| `LoadingSpinner.jsx` | Full-page or inline spinner; exports `<Spinner>` |

### 4.6 API Service Layer — `api.js`

Single Axios instance. Base URL from `VITE_API_URL` env var (empty = same origin).

**Interceptors:**
- **Request:** Attach `Authorization: Bearer <token>` from `localStorage.gb_token`
- **Response:** On 401 → clear storage, redirect to `/login`

**Exported functions:**

| Function | Endpoint | Purpose |
|---|---|---|
| `registerUser(data)` | POST /register | Create account |
| `loginUser(data)` | POST /login | Get JWT |
| `getProfile()` | GET /profile | Fetch user info |
| `predictGesture(userId, gesture, nmm)` | POST /predict | Landmark → word |
| `predictLetter(landmarks, tipXY)` | POST /predict-letter | Frame → ASL letter |
| `generateSentence(glosses, nmm)` | POST /generate-sentence | Glosses → English |
| `generateLetterSentence(letters)` | POST /generate-letter-sentence | Spelled letters → word |
| `getModelStatus()` | GET /model/status | ML readiness |
| `reloadModel()` | POST /model/reload | Hot-reload weights |
| `getHistory(userId)` | GET /history/:id | Translation log |
| `textToSign(text, lang)` | POST /text-to-sign | Text → video list |
| `getVocabulary()` | GET /text-to-sign/vocabulary | Supported words |
| `videoUrl(path)` | — | Build playable URL for a video path |
| `bestVideoUrl(entry)` | — | Pick local URL or CDN fallback |
| `improveText(text)` | POST /ai/improve-text | LLM polish translation |
| `getLearningTip(word)` | POST /ai/learning-tip | AI tip for a sign |
| `getSentenceInsights(translations)` | POST /ai/sentence-insights | AI history analysis |
| `getAiStatus()` | GET /ai/status | Watsonx configured? |

---

## 5. Backend

### 5.1 Entry Point — `app.py`

Creates and configures the Flask application.

**Startup sequence:**
1. Read `FLASK_DEBUG` and `PORT` from env
2. Build CORS allowed origins list (`localhost:3000`, `localhost:5000`, `FRONTEND_ORIGIN`)
3. Create Flask app; point `static_folder` at `backend/static/dist` (React build)
4. Apply `flask_cors.CORS` with `supports_credentials=True`
5. Create `PyMongo` instance; call `init_*` on every blueprint to share the db handle
6. Register all six blueprints
7. Define `/health`, `/test_db` utility routes
8. Define SPA catch-all `serve_react()` that serves `index.html` for any non-API path

**`serve_react(path)`**  
- If path starts with any of `_API_PREFIXES` → 404  
- If the path is a real static file in `dist/` → serve it  
- Otherwise → serve `index.html` (React Router handles navigation)

### 5.2 Configuration — `config.py`

`Config` class reads all secrets from environment variables via `python-dotenv`.

| Attribute | Env Var | Purpose |
|---|---|---|
| `MONGO_URI` | `MONGO_URI` | MongoDB Atlas connection string |
| `SECRET_KEY` | `SECRET_KEY` | JWT signing key |
| `IBM_API_KEY` | `IBM_API_KEY` | Watsonx IAM API key |
| `WATSONX_PROJECT_ID` | `WATSONX_PROJECT_ID` | Watsonx project |
| `WATSONX_URL` | `WATSONX_URL` | Watsonx endpoint region |
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | OAuth client |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_REDIRECT_URI` | `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `GMAIL_USER` | `GMAIL_USER` | Sender email for OTP |
| `GMAIL_APP_PASSWORD` | `GMAIL_APP_PASSWORD` | Gmail App Password |

### 5.3 Routes

#### `auth.py` — Blueprint prefix: (none)

| Route | Method | Function | Description |
|---|---|---|---|
| `/register` | POST | `register()` | Hash password with bcrypt, insert user into `users` collection |
| `/login` | POST | `login()` | Verify bcrypt hash, return 24-hour JWT |
| `/profile` | GET | `profile()` | `@token_required` — return `{name, email}` |
| `/auth/google` | GET | `google_login()` | Build Google consent URL, store PKCE state in session, redirect |
| `/auth/google/callback` | GET | `google_callback()` | Exchange code, verify ID token, upsert user, return JWT via redirect |

`token_required(f)` — decorator that decodes JWT from `Authorization: Bearer` header before calling the wrapped route function.

`_client_config()` — builds the `{"web": {...}}` dict that `google_auth_oauthlib.Flow` needs from env vars.

`_redirect_uri()` — returns the configured OAuth callback URL.

#### `otp.py` — Blueprint prefix: (none)

| Route | Method | Function | Description |
|---|---|---|---|
| `/otp/send` | POST | `send_otp()` | Generate 6-digit code, upsert into `otp_codes`, send HTML email |
| `/otp/verify` | POST | `verify_otp()` | Check code, expiry, replay; mark `verified=True` on success |

`_gen_code()` — `random.choices(string.digits, k=6)`  
`_send_email(addr, code)` — builds HTML email with inline styles; connects via `smtplib.SMTP_SSL` port 465

#### `gesture.py` — Blueprint prefix: (none)

| Route | Method | Function | Description |
|---|---|---|---|
| `/predict` | POST | `predict()` | Run `predict_gesture()`, save to `gesture_history`, return top-1 + top-5 |
| `/generate-sentence` | POST | `generate_sentence_route()` | Watsonx first, rule-based fallback |
| `/predict-letter` | POST | `predict_letter_route()` | Single-frame letter classification |
| `/generate-letter-sentence` | POST | `generate_letter_sentence_route()` | Watsonx JSON decode or difflib suggestions |
| `/model/status` | GET | `model_status()` | Report loaded/classes/accuracy for both models |
| `/model/reload` | POST | `model_reload()` | Call `reload_model()` + `reload_letter_model()` |

#### `text_to_sign.py` — Blueprint prefix: (none)

| Route | Method | Function | Description |
|---|---|---|---|
| `/text-to-sign/status` | GET | `dataset_status()` | Check if local video files exist |
| `/text-to-sign` | POST | `convert_text()` | Tokenise → resolve → return video list |
| `/text-to-sign/vocabulary` | GET | `vocabulary()` | Return all supported words |
| `/video/<video_id>` | GET | `serve_video()` | Stream local mp4 with range-request support |

**Startup:** `_build_lookup()` runs at import time, scanning `curated_WLASL.json` and checking which mp4 files exist locally. Result stored in `_WORD_LOOKUP` dict.

**Resolution pipeline:** `_tokenise()` → `_resolve_tokens()` which tries bigram, exact, `_fuzzy_match()` (stemming → difflib) in order.

#### `history.py` — Blueprint prefix: (none)

| Route | Method | Function | Description |
|---|---|---|---|
| `/history/<user_id>` | GET | `get_history()` | Find all records in `gesture_history` for `user_id`, return `[{gesture, predicted_text, timestamp}]` |

#### `ai.py` — Blueprint prefix: `/ai`

| Route | Method | Function | Description |
|---|---|---|---|
| `/ai/improve-text` | POST | `improve_text()` | Prompt Watsonx to rewrite a raw translation as fluent English |
| `/ai/learning-tip` | POST | `learning_tip()` | Ask Watsonx for an ASL learning tip + fun fact for a word |
| `/ai/sentence-insights` | POST | `sentence_insights()` | Summarise translation history trends via Watsonx |
| `/ai/gloss-to-english` | POST | `gloss_to_english()` | LLM alternative to rule-based sentence generation |
| `/ai/status` | GET | `ai_status()` | Return `{configured: bool, model: str}` |

All routes return 503 via `_unavailable()` if `is_configured()` is `False`.

### 5.4 Services

#### `services/watsonx.py`

Thin REST wrapper for IBM Watsonx.ai text generation.

| Function | Purpose |
|---|---|
| `_get_iam_token()` | Exchange `IBM_API_KEY` for a Bearer token; cached with 60-second refresh buffer using `threading.Lock` |
| `generate(prompt, max_new_tokens, temperature, stop_sequences)` | POST to `/ml/v1/text/generation`, return `results[0].generated_text` stripped |
| `is_configured()` | Return `True` if both `IBM_API_KEY` and `PROJECT_ID` are non-empty |

**Model:** `meta-llama/llama-3-3-70b-instruct`  
**Decoding:** greedy when `temperature=0`, sampled otherwise  
**Token TTL:** IAM tokens expire in 3600 s; refreshed when < 60 s remain

---

## 6. Machine Learning

### 6.1 Feature Vector — `ml/utils/landmarks.py`

Every webcam frame is converted to a **218-dimensional float32 vector**:

| Slice | Dims | Description |
|---|---|---|
| Left hand | 63 | 21 landmarks × (x,y,z), wrist-normalised and scale-normalised |
| Right hand | 63 | Same for right hand |
| Pose | 24 | 8 upper-body joints × (x,y,z), shoulder-midpoint origin, shoulder-width scale |
| Face spatial | 27 | 9 lip/chin/nose landmarks, nose-anchored |
| Velocity | 3 | Δ(x,y,z) of dominant wrist per frame |
| Interaction | 2 | Fingertips→lips distance; fingertips→palm distance |
| Acceleration | 3 | Δvelocity of dominant wrist |
| NMM | 10 | eyebrow_raise, eyebrow_furrow, head_nod, head_shake, head_tilt, mouth_open, mouth_wide, lip_protrude, cheek_puff, brow_asymmetry |
| Finger angles | 15 | MCP+PIP+DIP angle per finger on dominant hand (law-of-cosines) |
| Wrist orientation | 4 | Approximate quaternion (w,x,y,z) derived from palm plane |
| Body distances | 4 | Dominant fingertips → chin/chest/abdomen; wrist → base palm |
| **Total** | **218** | |

**Key functions:**

`build_hands_solution(...)` — create a MediaPipe `Holistic` instance configured for the chosen mode (static image vs streaming).

`_normalize_hand(coords)` — subtract wrist (lm[0]), divide by max absolute value → normalised to [-1, 1].

`_extract_pose(pose_landmarks)` — extract 8 specific joints, centre on shoulder midpoint, scale by shoulder width.

`_extract_face(face_landmarks)` — extract 9 face points, anchor to nose tip, scale by face height.

`_extract_nmm(face_landmarks, prev_yaw, prev_pitch, prev_roll, face_scale)` — compute all 10 NMM scalars; returns `(vec, new_yaw, new_pitch, new_roll)` for frame-to-frame delta computation.

`_extract_finger_angles(hand_landmarks)` — compute joint angles at MCP, PIP, DIP for each finger using `_joint_angle(a, b, c)` (law-of-cosines).

`_extract_wrist_orientation(hand_landmarks)` — build rotation matrix from palm plane vectors; convert to quaternion via closed-form formula.

`_body_distance_features(...)` — compute 4 Euclidean distances normalised by shoulder width.

`extract_landmarks_from_frame(frame_bgr, solution, ...)` — run Holistic on a BGR frame; assemble the full 218-dim vector; return `(vec, dominant_wrist, velocity, head_state)`.

`extract_sequence_from_video(video_path, sequence_length, ...)` — sample `sequence_length` frames uniformly from a video file; return `(T, 218)` array.

### 6.2 Word Gesture Model — `ml/predictor.py` + `ml/model.py`

**Architecture (`GestureBridgeLSTM`):**
```
Input (batch, 45, 218)
    → BiLSTM (128 units, bidirectional) → 256 per step, Dropout 0.4
    → BiLSTM (64 units, bidirectional)  → 128 per step, Dropout 0.3
    → TemporalAttention                 → (batch, 128) weighted sum
    → Linear(128 → 256) + BatchNorm + ReLU + Dropout 0.4
    → Linear(256 → num_classes)         — raw logits
```

`TemporalAttention` — learns a scalar weight per time step; peaks at gesture "hold" frames where motion is minimal.

**Singleton loading (`predictor.py`):**  
On import, `_initialize()` runs:
1. `_load_labels(labels.json)` — build `{int: word}` mapping
2. `_load_model(gesture_model.pt, model_meta.json, num_classes)` — load PyTorch state dict
3. Load `normalizer.npz` for per-feature z-score statistics

**`predict_gesture(landmark_sequence)`:**
1. Coerce input to `numpy.ndarray`
2. `pad_or_truncate(seq, 45)` — ensure exactly 45 frames
3. z-score normalise using loaded mean/std
4. Expand dims → `(1, 45, 218)`
5. `torch.no_grad()` forward pass
6. `F.softmax` → return `{predicted_word, confidence, top5}`

**`reload_model()`** — hot-reload from disk without server restart.

### 6.3 Letter Classifier — `ml/letter_predictor.py`

Classifies a single frame of 63 raw hand landmarks (A–Z).

**Two load strategies (tried in order):**
1. **Split files** — `asl_letter_model.joblib` (sklearn MLP) + `asl_letter_scaler.joblib` (StandardScaler)
2. **Bundle file** — `asl_letter_bundle.joblib` containing `{model, label_encoder}`

**`predict_letter(raw_landmarks_63)`:**  
Scale → `predict_proba` → return `{letter, confidence, top5, is_dynamic}`.

**J/Z motion override:**  
`LetterSession` maintains a 15-frame rolling trajectory of the index fingertip.  
- Path length > 0.18 AND aspect < 0.8 → override as "J" (tall narrow arc)  
- Path length > 0.20 AND aspect > 1.2 → override as "Z" (wide zigzag)

**`LetterSession` debounce logic:**
- Accumulate frames where the same letter has `confidence ≥ 0.70`
- After 4 consecutive matching frames → commit the letter, start 10-frame cooldown
- `suggest(partial)` — prefix-first + difflib fuzzy dictionary lookup
- `flush_word()` — move current word to committed list

### 6.4 Sentence Generator — `ml/sentence_generator.py`

Rule-based ASL gloss → English. Used as fallback when Watsonx is not configured.

**Input:** `gloss_sequence` (e.g. `["STORE", "YOU", "GO"]`) + `nmm_summary` (scalar averages)

**Pipeline:**
1. Detect NMM signals (raise → Y/N question, furrow → WH-question, shake → negation, nod → affirmation, mouth → intensifier)
2. Separate structural markers (tense, negation, WH-glosses) from content words
3. Identify subject (first pronoun or noun), verb, object via simple heuristics
4. Build verb phrase (with tense modal if present)
5. Apply negation, intensifier
6. Assemble sentence based on question type (WH / Y-N / declarative)
7. Apply contractions (`"do not"` → `"don't"`)
8. Capitalise + regex cleanup

### 6.5 Preprocessing — `ml/utils/preprocess.py`

| Function | Purpose |
|---|---|
| `pad_or_truncate(seq, length=45)` | Enforce exactly 45 frames: truncate if longer, zero-pad if shorter |
| `normalize_sequence(seq)` | No-op; wrist normalisation is done in `landmarks.py` per frame |
| `preprocess_landmark_sequence(seq, mean, std)` | Full pipeline: pad → z-score → expand_dims → `(1, 45, 218)` |
| `preprocess_frame(frame)` | **DEPRECATED** pixel-based preprocessor; kept for import compatibility |

---

## 7. Data & Storage

### MongoDB Collections

| Collection | Schema | Purpose |
|---|---|---|
| `users` | `{name, email, password (bcrypt hash or null), created_at}` | User accounts |
| `gesture_history` | `{user_id, gesture_input, predicted_text, confidence, top5, nmm, timestamp}` | Translation log |
| `otp_codes` | `{email, code, expires_at, verified}` | One active OTP per email |

### WLASL Dataset

- **`curated_WLASL.json`** — array of `{gloss, instances: [{video_id, split, url}]}` entries. Parsed once at startup into `_WORD_LOOKUP`.
- **`data/WLASL/videos/*.mp4`** — local video files named by zero-padded `video_id`. Gitignored; must be downloaded separately from the WLASL GitHub repo.
- If a local file exists → `video_url = /video/<id>` (Flask streams it).
- If only remote URL exists → `external_url` (browser fetches directly).

### ML Model Files

| File | Purpose | Gitignored? |
|---|---|---|
| `ml/gesture_model.pt` | Trained BiLSTM weights | Yes |
| `ml/labels.json` | Index → word mapping | No |
| `ml/model_meta.json` | `{num_classes, sequence_length, landmark_vector_size}` | No |
| `ml/normalizer.npz` | `{mean, std}` arrays shape `(218,)` | Yes |
| `models/asl_letter_*.joblib` | Letter classifier artefacts | Yes |

---

## 8. Authentication & Security

**Password auth flow:**
1. `POST /register` → bcrypt hash (12 rounds) → insert into `users`
2. `POST /login` → `bcrypt.checkpw` → sign JWT (HS256, 24h expiry)
3. Every protected route uses `@token_required` → decode JWT → load user from DB

**Google OAuth flow:**
1. `/auth/google` → build Google consent URL; store `state` + PKCE `code_verifier` in Flask session
2. Google redirects to `/auth/google/callback?code=&state=`
3. Reconstruct `Flow` with saved state; set `code_verifier`; call `fetch_token`
4. Verify ID token with `google.oauth2.id_token`; upsert user; issue JWT
5. Redirect to `FRONTEND_ORIGIN/auth/callback?token=...`

**JWT storage:** `localStorage.gb_token`. Sent as `Authorization: Bearer` header on every API call.

**CORS:** Allowed origins are `localhost:3000`, `localhost:5000`, and `FRONTEND_ORIGIN`.

---

## 9. OTP Email Verification

1. **Register** tab submits name/email/password → `handleRegister()` in `Auth.jsx`
2. `POST /otp/send` → `_gen_code()` generates 6 random digits
3. Code upserted into `otp_codes` collection with 10-minute TTL
4. `_send_email()` connects via `SMTP_SSL` port 465, sends HTML email
5. Frontend shows OTP input screen
6. `POST /otp/verify` checks: exists? not verified? not expired? correct code? → mark verified
7. On success, `registerUser()` creates the account and auto-login follows

---

## 10. Text-to-Sign Pipeline

```
User types text  ─(or mic STT)─►  TextToSign.jsx
        │
        ▼  POST /text-to-sign  {text}
  text_to_sign.py
        │
        ├─ _tokenise(text)              lowercase, remove punctuation, split words
        │
        ├─ _resolve_tokens(tokens)      for each token:
        │       ├─ try bigram match     e.g. "thank you" → single entry
        │       ├─ try exact match      "hello" → found
        │       ├─ try _fuzzy_match()   strip suffixes → stem check → difflib
        │       └─ else: not found
        │
        └─ return [{word, video_url, external_url, found, fuzzy}, ...]
              │
              ▼
        TextToSign.jsx plays videos sequentially
        8-second timeout per video (fallback to next if stalled)
        🔊 TTS button speaks the word in selected language
```

---

## 11. Sign-to-Text Pipeline

```
Webcam stream  ──►  MediaPipe Holistic (browser WASM)
                              │
                              ▼
              extract 218-dim feature vector per frame
                              │
                      45-frame sliding window
                              │
                    POST /predict  {user_id, gesture: (45×218), nmm}
                              │
                         predictor.py
                              │
                    pad_or_truncate → z-score → LSTM → softmax
                              │
                    {predicted_word, confidence, top5}
                              │
               saved to MongoDB gesture_history
                              │
               accumulated in gloss buffer (SignToText.jsx)
                              │
               POST /generate-sentence  {glosses, nmm}
                              │
              gesture.py  ──  Watsonx? ──Yes──► LLM sentence
                              │
                              No
                              │
                    generate_sentence(glosses, nmm)  ← rule-based
                              │
                    Display English sentence
                    🔊 TTS reads result
```

---

## 12. IBM Watsonx.ai Integration

Used in three places:

| Use case | Endpoint | Prompt style |
|---|---|---|
| Polish translation | `/ai/improve-text` | "Rewrite as fluent English: ..." |
| Learning tip | `/ai/learning-tip` | "Give an ASL learning tip for the sign: [word]" |
| Sentence insights | `/ai/sentence-insights` | "Analyze these ASL translations: ..." |
| Gloss → English | `/generate-sentence` (primary) | Llama chat template with NMM context |
| Fingerspelling match | `/generate-letter-sentence` | JSON-mode: `{"word":"...", "suggestions":[...]}` |

**All prompts use Llama-3 chat template:**
```
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
[system instruction]
<|eot_id|><|start_header_id|>user<|end_header_id|>
[user input]
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
```

**Fallback:** if `is_configured()` is False (no API key), all AI routes return 503; rule-based alternatives are used for sentence generation.

---

## 13. Speech Features (STT / TTS)

Both use the browser-native **Web Speech API** — no backend involved.

### Speech-to-Text (STT)

Used in `TextToSign.jsx` to fill the text input by voice.

```javascript
const recognition = new window.SpeechRecognition();
recognition.lang = getTTSLocale(settings.language);  // e.g. 'hi-IN'
recognition.onresult = (e) => setText(e.results[0][0].transcript);
recognition.start();
```

- 🎤 button toggles listening
- Result appended to current text box value
- Works in Chrome, Edge, Safari; **Firefox has no STT support**

### Text-to-Speech (TTS)

Used in `TextToSign.jsx` (speak input, speak word, speak sentence) and `SignToText.jsx` (speak translation).

```javascript
const utter = new SpeechSynthesisUtterance(text);
utter.lang = getTTSLocale(settings.language);
window.speechSynthesis.speak(utter);
```

**Language → locale mapping (`getTTSLocale`):**
| Language | BCP-47 locale |
|---|---|
| ASL | en-US |
| ISL | en-IN |
| Hindi | hi-IN |
| Marathi | mr-IN |

---

## 14. Deployment

### Development
```bash
# Terminal 1 — Flask
cd backend && python app.py          # port 5000

# Terminal 2 — Vite dev server
cd frontend && npm run dev           # port 3000, proxies /api → :5000
```

### Production (Render / any PaaS)
```bash
# Build React
cd frontend && npm run build         # outputs to frontend/dist

# Copy build to Flask static folder
cp -r frontend/dist backend/static/

# Start gunicorn
cd backend && gunicorn app:app
```

`Procfile`:
```
web: cd backend && gunicorn app:app
```

`render.yaml` defines environment variables and the build command (`build.sh`).

---

## 15. Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/gesturebridge
SECRET_KEY=<random 32-char string>

IBM_API_KEY=<ibm cloud api key>
WATSONX_PROJECT_ID=<project id>
WATSONX_URL=https://us-south.ml.cloud.ibm.com

GOOGLE_CLIENT_ID=<oauth client id>
GOOGLE_CLIENT_SECRET=<oauth client secret>
GOOGLE_REDIRECT_URI=https://yourapp.com/auth/google/callback

GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=<16-char app password>

FRONTEND_ORIGIN=https://yourapp.com
FLASK_DEBUG=0
PORT=5000
```

Frontend `.env.development`:
```env
VITE_API_URL=
```

Frontend `.env.production` (if Flask and React on different domains):
```env
VITE_API_URL=https://api.yourapp.com
```

---

## 16. Key Data Flows (Step-by-Step)

### User Registration with OTP

```
Browser                     Flask                      Gmail SMTP         MongoDB
  │                            │                            │                 │
  │── POST /otp/send ─────────►│                            │                 │
  │   {email}                  │── _gen_code() ────────────►│                 │
  │                            │── upsert otp_codes ───────────────────────►│
  │                            │── SMTP_SSL connect ────────►│                │
  │                            │── sendmail(HTML code) ─────►│                │
  │◄── 200 {message:"sent"} ───│                            │                 │
  │                            │                            │                 │
  │── POST /otp/verify ────────►│                            │                 │
  │   {email, code}            │── find otp_codes ─────────────────────────►│
  │                            │── check expiry / match                       │
  │◄── 200 {valid:true} ───────│                            │                 │
  │                            │                            │                 │
  │── POST /register ──────────►│                            │                 │
  │   {name, email, password}  │── bcrypt.hashpw ──────────►│                 │
  │                            │── insert users ────────────────────────────►│
  │◄── 201 {message:"ok"} ─────│                                              │
```

### Live Sign Recognition

```
Browser (SignToText)                 Flask                    MongoDB
  │                                    │                         │
  │ [webcam frame every 200ms]         │                         │
  │ → MediaPipe Holistic               │                         │
  │ → extract 218-dim vector           │                         │
  │ → push to 45-frame buffer          │                         │
  │                                    │                         │
  │── POST /predict ───────────────────►│                        │
  │   {user_id, gesture:(45×218), nmm} │                         │
  │                                    │── predict_gesture() ────│
  │                                    │   pad→zscore→LSTM→softmax
  │                                    │── insert gesture_history►│
  │◄── 200 {predicted_text, confidence,│confidence, top5}        │
  │                                    │                         │
  │ [accumulate gloss buffer]          │                         │
  │── POST /generate-sentence ─────────►│                        │
  │   {glosses, nmm}                   │── Watsonx? ─► LLM      │
  │                                    │   or rule-based engine  │
  │◄── 200 {sentence, source} ─────────│                         │
  │                                    │                         │
  │ [display + TTS speak]              │                         │
```

---

*Generated from the GestureBridge-master codebase. All function names, routes, and data shapes reflect the current source.*
