# GestureBridge — Complete UML & System Diagrams

All diagrams are written in **Mermaid** syntax and render natively in GitHub, GitLab, VS Code (with Markdown Preview Mermaid Support), and any Mermaid-aware viewer.

---

## 1. Use Case Diagram

```mermaid
flowchart LR
    subgraph Actors
        Guest([Guest User])
        Auth([Authenticated User])
        Admin([Admin / Dev])
        Watsonx([IBM Watsonx.ai])
        Google([Google OAuth])
        MP([MediaPipe CDN])
    end

    subgraph GestureBridge System
        UC1[Register / Login]
        UC2[Login with Google]
        UC3[OTP Verification]
        UC4[Sign-to-Text Translation]
        UC5[Text-to-Sign Playback]
        UC6[View Translation History]
        UC7[Edit Profile / Password]
        UC8[Manage App Settings]
        UC9[AI Improve Translation]
        UC10[AI Learning Tip]
        UC11[AI Sentence Insights]
        UC12[Finger-spell Letters]
        UC13[Hot-reload ML Model]
        UC14[Serve WLASL Video]
    end

    Guest --> UC1
    Guest --> UC2
    Auth  --> UC3
    Auth  --> UC4
    Auth  --> UC5
    Auth  --> UC6
    Auth  --> UC7
    Auth  --> UC8
    Auth  --> UC9
    Auth  --> UC10
    Auth  --> UC11
    Auth  --> UC12
    Admin --> UC13

    UC2  -->|OAuth Flow| Google
    UC9  -->|LLM Prompt| Watsonx
    UC10 -->|LLM Prompt| Watsonx
    UC11 -->|LLM Prompt| Watsonx
    UC4  -->|Loads JS SDK| MP
    UC14 -->|Streams MP4| Auth
```

---

## 2. Activity Diagram — Sign-to-Text Main Flow

```mermaid
flowchart TD
    A([User opens Sign-to-Text page]) --> B[Load MediaPipe Holistic via CDN]
    B --> C{CDN loaded?}
    C -- No --> D[Show error alert]
    C -- Yes --> E[Camera ready ← mpReady=true]
    E --> F[User clicks Start Camera]
    F --> G[Browser requests getUserMedia]
    G --> H{Permission granted?}
    H -- No --> I[Show camera error]
    H -- Yes --> J[Start MediaPipe Camera loop]
    J --> K[Holistic processes each frame]
    K --> L[buildFrameVector: extract 218-dim vector]
    L --> M[Push to FIFO buffer 45-60 frames]
    M --> N{Capture timer fires every 150ms?}
    N -- No --> K
    N -- Yes --> O[Compute wrist velocity & handedness]
    O --> P{Fingerspelling mode active?}
    P -- Yes --> Q[POST /predict-letter 63 landmarks]
    Q --> R[Update letter prediction UI]
    R --> S{Letter stable 4 frames AND conf ≥ 0.70?}
    S -- No --> K
    S -- Yes --> T[Commit letter to fsBuffer]
    T --> U{Word boundary / flush?}
    U -- Yes --> V[POST /generate-letter-sentence]
    V --> W[Show suggestions]
    P -- No --> X[POST /predict gesture sequence]
    X --> Y{Confidence ≥ threshold?}
    Y -- No --> K
    Y -- Yes --> Z[Append word to gloss sequence]
    Z --> AA{Rest frames ≥ 30?}
    AA -- No --> K
    AA -- Yes --> AB[POST /generate-sentence glosses+NMM]
    AB --> AC[Append English sentence to history]
    AC --> AD{TTS enabled?}
    AD -- Yes --> AE[speakText via Web Speech API]
    AD -- No --> K
    AE --> K
```

---

## 3. Activity Diagram — Text-to-Sign Flow

```mermaid
flowchart TD
    A([User types text]) --> B[Select language ASL/Hindi/Marathi]
    B --> C{Use Speech-to-Text?}
    C -- Yes --> D[SpeechRecognition API listens]
    D --> E[Transcript fills text box]
    C -- No --> E
    E --> F[User clicks Show Signs]
    F --> G[POST /text-to-sign with text]
    G --> H[Backend tokenises text]
    H --> I[Bigram check in _WORD_LOOKUP]
    I --> J{Bigram found?}
    J -- Yes --> K[Add bigram entry]
    J -- No --> L[Exact word match?]
    L -- Yes --> M[Add word entry]
    L -- No --> N[Fuzzy / stem match?]
    N -- Yes --> O[Add fuzzy entry]
    N -- No --> P[Mark word not found]
    K & M & O & P --> Q[Return words[] + coverage]
    Q --> R[Frontend receives playable words]
    R --> S{autoAdvance = true?}
    S -- Yes --> T[Auto-play first video immediately]
    S -- No --> U[User clicks Play]
    T & U --> V[Load video: local /video/id or external URL]
    V --> W[Video plays]
    W --> X{onEnded fires?}
    X -- Yes --> Y{More words?}
    Y -- Yes --> V
    Y -- No --> Z[Playback complete]
    X -- No --> AA{User clicks Next/Prev?}
    AA -- Yes --> V
```

---

## 4. Class Diagram

```mermaid
classDiagram
    class Flask_App {
        +config: Config
        +mongo: PyMongo
        +register_blueprint(bp)
        +route(path) decorator
    }

    class Config {
        +MONGO_URI: str
        +SECRET_KEY: str
        +IBM_API_KEY: str
        +WATSONX_PROJECT_ID: str
        +WATSONX_URL: str
        +GOOGLE_CLIENT_ID: str
        +GOOGLE_CLIENT_SECRET: str
        +GMAIL_USER: str
        +GMAIL_APP_PASSWORD: str
    }

    class AuthBlueprint {
        +register() POST /register
        +login() POST /login
        +profile() GET /profile
        +google_login() GET /auth/google
        +google_callback() GET /auth/google/callback
        +token_required(f) decorator
    }

    class GestureBlueprint {
        +predict() POST /predict
        +generate_sentence_route() POST /generate-sentence
        +predict_letter_route() POST /predict-letter
        +generate_letter_sentence_route() POST /generate-letter-sentence
        +model_status() GET /model/status
        +model_reload() POST /model/reload
    }

    class HistoryBlueprint {
        +get_history(user_id) GET /history/user_id
    }

    class TextToSignBlueprint {
        +dataset_status() GET /text-to-sign/status
        +convert_text() POST /text-to-sign
        +vocabulary() GET /text-to-sign/vocabulary
        +serve_video(video_id) GET /video/id
        -_build_lookup() dict
        -_tokenise(text) list
        -_stem_candidates(word) list
        -_fuzzy_match(word) str
        -_resolve_tokens(tokens) list
    }

    class AIBlueprint {
        +improve_text() POST /ai/improve-text
        +learning_tip() POST /ai/learning-tip
        +sentence_insights() POST /ai/sentence-insights
        +gloss_to_english() POST /ai/gloss-to-english
        +letter_to_sentence() POST /ai/letter-to-sentence
        +ai_status() GET /ai/status
    }

    class WatsonxService {
        +IBM_API_KEY: str
        +PROJECT_ID: str
        +MODEL_ID: str = llama-3-3-70b-instruct
        +generate(prompt, max_tokens, temp, stops) str
        +is_configured() bool
        -_get_iam_token() str
        -_cached_token: str
        -_token_expiry: float
    }

    class GestureBridgeLSTM {
        +lstm1: LSTM(218→128×2, bidirectional)
        +lstm2: LSTM(256→64×2, bidirectional)
        +attention: TemporalAttention(128)
        +fc1: Linear(128→256)
        +bn1: BatchNorm1D(256)
        +out: Linear(256→num_classes)
        +forward(x) Tensor
    }

    class TemporalAttention {
        +attn: Linear(hidden_size→1)
        +forward(x) Tensor
    }

    class GesturePredictor {
        +predict_gesture(sequence) dict
        +reload_model() void
        -_model: GestureBridgeLSTM
        -_labels: dict
        -_feat_mean: ndarray
        -_feat_std: ndarray
        -_initialize() void
    }

    class LetterPredictor {
        +predict_letter(landmarks_63) dict
        +reload_letter_model() void
        -_model: RandomForest
        -_scaler: StandardScaler
        -_classes: list
        -_load() void
    }

    class LetterSession {
        -_stable_letter: str
        -_stable_count: int
        -_cooldown: int
        -_word: str
        -_traj: deque
        +push(landmarks, tip_xy) dict
        +flush_word() str
        +suggest(partial, n) list
        +reset() void
    }

    class SentenceGenerator {
        +generate_sentence(glosses, nmm) str
    }

    class MongoDB {
        +users collection
        +gesture_history collection
    }

    Flask_App --> Config
    Flask_App --> AuthBlueprint
    Flask_App --> GestureBlueprint
    Flask_App --> HistoryBlueprint
    Flask_App --> TextToSignBlueprint
    Flask_App --> AIBlueprint
    Flask_App --> MongoDB
    GestureBlueprint --> GesturePredictor
    GestureBlueprint --> LetterPredictor
    GestureBlueprint --> SentenceGenerator
    GestureBlueprint --> WatsonxService
    AIBlueprint --> WatsonxService
    GesturePredictor --> GestureBridgeLSTM
    GestureBridgeLSTM --> TemporalAttention
    LetterPredictor --> LetterSession
```

---

## 5. Sequence Diagram — Sign-to-Text Recognition

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant MediaPipe
    participant React_SignToText
    participant Flask_API
    participant GesturePredictor
    participant WatsonxAI
    participant MongoDB

    User->>Browser: Opens /sign-to-text
    Browser->>MediaPipe: Load holistic.js CDN
    MediaPipe-->>Browser: SDK ready
    User->>Browser: Click Start Camera
    Browser->>Browser: getUserMedia() → webcam stream
    Browser->>MediaPipe: Start camera loop
    loop Every video frame
        MediaPipe->>React_SignToText: onResults(pose, hands, face)
        React_SignToText->>React_SignToText: buildFrameVector() → 218-dim
        React_SignToText->>React_SignToText: Push to FIFO buffer
    end
    loop Every 150ms
        React_SignToText->>React_SignToText: Compute velocity, handedness
        React_SignToText->>Flask_API: POST /predict {user_id, gesture[45×218], nmm}
        Flask_API->>GesturePredictor: predict_gesture(sequence)
        GesturePredictor->>GesturePredictor: pad_or_truncate(), normalize
        GesturePredictor->>GesturePredictor: LSTM forward pass → softmax
        GesturePredictor-->>Flask_API: {predicted_word, confidence, top5}
        Flask_API->>MongoDB: gesture_history.insert_one()
        Flask_API-->>React_SignToText: JSON response
        React_SignToText->>React_SignToText: Update prediction UI
    end
    Note over React_SignToText: Rest detected (30 frames idle)
    React_SignToText->>Flask_API: POST /generate-sentence {glosses, nmm}
    Flask_API->>WatsonxAI: LLM prompt (Llama-3-3-70B)
    WatsonxAI-->>Flask_API: English sentence
    Flask_API-->>React_SignToText: {sentence, source}
    React_SignToText->>Browser: Display translation + TTS
```

---

## 6. Sequence Diagram — User Authentication

```mermaid
sequenceDiagram
    participant User
    participant React
    participant Flask
    participant MongoDB
    participant Google_OAuth

    alt Email Registration
        User->>React: Fill name/email/password → Submit
        React->>Flask: POST /register {name, email, password}
        Flask->>MongoDB: users.find_one({email})
        MongoDB-->>Flask: null (not exists)
        Flask->>Flask: bcrypt.hashpw(password)
        Flask->>MongoDB: users.insert_one({name,email,hashed})
        Flask-->>React: 201 {message: registered}
    end

    alt Email Login
        User->>React: Enter email/password → Submit
        React->>Flask: POST /login {email, password}
        Flask->>MongoDB: users.find_one({email})
        MongoDB-->>Flask: user document
        Flask->>Flask: bcrypt.checkpw()
        Flask->>Flask: jwt.encode({email, exp:+24h})
        Flask-->>React: 200 {token, message}
        React->>React: localStorage.setItem(gb_token, token)
    end

    alt Google OAuth
        User->>React: Click "Continue with Google"
        React->>Flask: GET /auth/google
        Flask->>Google_OAuth: Authorization URL
        Google_OAuth-->>User: Consent screen
        User->>Google_OAuth: Allow
        Google_OAuth->>Flask: GET /auth/google/callback?code=...
        Flask->>Google_OAuth: Exchange code → credentials
        Flask->>Google_OAuth: Verify id_token
        Google_OAuth-->>Flask: {email, name}
        Flask->>MongoDB: users.update_one(upsert=true)
        Flask->>Flask: jwt.encode({email, exp:+24h})
        Flask-->>React: Redirect /auth/callback?token=...&name=...
        React->>React: Parse URL, store token, navigate /dashboard
    end
```

---

## 7. Component Diagram

```mermaid
graph TB
    subgraph Frontend ["Frontend — React + Vite (port 3000)"]
        direction TB
        App["App.jsx\nRouter + Providers"]
        AuthCtx["AuthContext\nJWT state, login/logout"]
        SettCtx["SettingsContext\ntheme, TTS, recognition mode"]
        APILayer["api.js\nAxios + interceptors"]

        subgraph Pages
            Landing["Landing.jsx"]
            Auth["Auth.jsx\nLogin / Register / OTP"]
            Dashboard["Dashboard.jsx"]
            STT["SignToText.jsx\nMediaPipe + LSTM inference"]
            TTS_P["TextToSign.jsx\nVideo playback + STT/TTS"]
            History["History.jsx"]
            AccSet["AccountSettings.jsx"]
        end

        subgraph Components
            AppShell["AppShell.jsx\nSidebar + Topbar"]
            Sidebar["Sidebar.jsx"]
            Alert["Alert.jsx"]
            ProtRoute["ProtectedRoute.jsx"]
            Spinner["LoadingSpinner.jsx"]
        end
    end

    subgraph Backend ["Backend — Flask (port 5000)"]
        direction TB
        AppPy["app.py\nFlask factory + CORS"]

        subgraph Routes
            AuthR["routes/auth.py\n/register /login /profile /auth/google"]
            GestR["routes/gesture.py\n/predict /predict-letter /generate-sentence"]
            HistR["routes/history.py\n/history/:user_id"]
            T2SR["routes/text_to_sign.py\n/text-to-sign /video/:id"]
            AIR["routes/ai.py\n/ai/improve-text /ai/learning-tip /ai/status"]
            OTPR["routes/otp.py\nOTP generation + email"]
        end

        subgraph ML
            Model["ml/model.py\nGestureBridgeLSTM\nBiLSTM + Attention"]
            Pred["ml/predictor.py\npredict_gesture()"]
            LPred["ml/letter_predictor.py\npredict_letter() + LetterSession"]
            SGen["ml/sentence_generator.py\nrule-based gloss→English"]
            LUtils["ml/utils/landmarks.py\nbuildFrameVector() 218-dim"]
        end

        subgraph Services
            WX["services/watsonx.py\nIBM Watsonx IAM + LLM"]
        end

        subgraph Storage
            Mongo["MongoDB Atlas\nusers + gesture_history"]
            ModelFiles["ml/*.pt + models/*.joblib\nSaved model weights"]
            Videos["data/WLASL/videos/*.mp4\nLocal sign videos"]
        end
    end

    subgraph External
        CDN_MP["MediaPipe CDN\n(holistic, camera, drawing)"]
        IBMCloud["IBM Cloud IAM\nAccess Token"]
        WXEndpoint["Watsonx.ai API\nLlama-3-3-70B-Instruct"]
        GoogleAuth["Google OAuth 2.0"]
    end

    App --> AuthCtx
    App --> SettCtx
    App --> Pages
    Pages --> Components
    Pages --> APILayer
    APILayer -->|JWT Bearer| AppPy
    AppPy --> Routes
    GestR --> Pred
    GestR --> LPred
    GestR --> SGen
    Pred --> Model
    LPred --> LUtils
    Pred --> LUtils
    GestR --> WX
    AIR --> WX
    Routes --> Mongo
    WX --> IBMCloud
    WX --> WXEndpoint
    AuthR --> GoogleAuth
    STT --> CDN_MP
    AppPy --> ModelFiles
    T2SR --> Videos
```

---

## 8. Package Diagram

```mermaid
graph TB
    subgraph root["GestureBridge (root)"]
        FE["📦 frontend/"]
        BE["📦 backend/"]
        DOCS["📂 docs/"]
        BUILD["🔧 build.sh / Procfile / render.yaml"]
    end

    subgraph frontend["frontend/"]
        FE_SRC["📦 src/"]
        FE_PUB["📂 public/"]
        FE_DIST["📂 dist/ (build output)"]
        FE_CFG["⚙️ vite.config.js / package.json"]
    end

    subgraph src["src/"]
        P_PAGES["📦 pages/"]
        P_COMP["📦 components/"]
        P_CTX["📦 context/"]
        P_SVC["📦 services/"]
        APP["App.jsx"]
        MAIN["main.jsx"]
        CSS["index.css"]
    end

    subgraph backend["backend/"]
        APP_PY["app.py"]
        CFG_PY["config.py"]
        B_ROUTES["📦 routes/"]
        B_ML["📦 ml/"]
        B_SVC["📦 services/"]
        B_MODELS["📂 models/ (joblib files)"]
        B_DATA["📂 data/WLASL/"]
        B_DB["📂 database/"]
    end

    subgraph routes["routes/"]
        R_AUTH["auth.py"]
        R_GEST["gesture.py"]
        R_HIST["history.py"]
        R_TTS["text_to_sign.py"]
        R_AI["ai.py"]
        R_OTP["otp.py"]
    end

    subgraph ml["ml/"]
        ML_MODEL["model.py (BiLSTM)"]
        ML_PRED["predictor.py"]
        ML_LPRED["letter_predictor.py"]
        ML_SGEN["sentence_generator.py"]
        ML_UTILS["📦 utils/ (landmarks.py, preprocess.py)"]
        ML_TRAIN["train.py / train_asl_letter.py"]
        ML_BUILD["build_asl_dataset.py"]
    end

    root --> FE & BE & DOCS & BUILD
    FE   --> FE_SRC & FE_PUB & FE_DIST & FE_CFG
    FE_SRC --> src
    src  --> P_PAGES & P_COMP & P_CTX & P_SVC & APP & MAIN & CSS
    BE   --> backend
    backend --> B_ROUTES & B_ML & B_SVC & B_MODELS & B_DATA & B_DB & APP_PY & CFG_PY
    B_ROUTES --> routes
    B_ML --> ml
```

---

## 9. Deployment Diagram

```mermaid
graph TB
    subgraph UserDevice["User's Browser / Device"]
        Browser["Chrome / Edge / Safari\nReact SPA (Vite bundle)\nMediaPipe runs client-side"]
        Webcam["Webcam\n(getUserMedia)"]
        WebSpeech["Web Speech API\n(STT + TTS built-in)"]
    end

    subgraph RenderCloud["Render.com (or localhost)"]
        subgraph Flask_Container["Flask Process (gunicorn)"]
            FlaskApp["Flask app.py\nPort 5000"]
            StaticFiles["backend/static/dist/\n(React build served by Flask)"]
        end
        FileSystem["Local Filesystem\nml/*.pt weights\nmodels/*.joblib\ndata/WLASL/videos/*.mp4"]
    end

    subgraph MongoAtlas["MongoDB Atlas (Cloud)"]
        MongoDB["Cluster\nusers collection\ngesture_history collection"]
    end

    subgraph IBMCloud["IBM Cloud"]
        IAM["IAM Token Service\niam.cloud.ibm.com"]
        WatsonxAPI["Watsonx.ai API\nus-south.ml.cloud.ibm.com\nLlama-3-3-70B-Instruct"]
    end

    subgraph CDNs["External CDNs"]
        MediaPipeCDN["jsdelivr.net\n@mediapipe/holistic\n@mediapipe/camera_utils"]
        WLASL_CDN["WLASL video CDN\n(external_url fallback)"]
    end

    subgraph GoogleServices["Google Services"]
        GoogleOAuth["accounts.google.com\nOAuth 2.0"]
    end

    Browser -->|HTTPS REST API| FlaskApp
    Browser -->|Load JS| MediaPipeCDN
    Browser -->|Webcam frames| MediaPipe_local["MediaPipe (in-browser WASM)"]
    Browser -->|Video fallback| WLASL_CDN
    FlaskApp --> FileSystem
    FlaskApp -->|pymongo TLS| MongoDB
    FlaskApp -->|HTTP POST| IAM
    IAM -->|Bearer token| WatsonxAPI
    FlaskApp -->|OAuth2| GoogleOAuth
    FlaskApp -->|serve| StaticFiles
    Webcam --> Browser
    WebSpeech --> Browser

    style Browser fill:#1e3a5f,color:#fff
    style FlaskApp fill:#2d5016,color:#fff
    style MongoDB fill:#0d4f3c,color:#fff
    style WatsonxAPI fill:#4a0e8f,color:#fff
```

---

## 10. Data Design Diagram

```mermaid
erDiagram
    USERS {
        ObjectId _id PK
        string name
        string email UK
        bytes password "bcrypt hash or null for OAuth"
        datetime created_at
    }

    GESTURE_HISTORY {
        ObjectId _id PK
        string user_id FK
        list gesture_input "T×218 landmark matrix"
        string predicted_text
        float confidence
        list top5 "top-5 predictions with scores"
        object nmm "NMM summary object"
        datetime timestamp
    }

    ASL_DATASET {
        ndarray X "N×45×218 landmark sequences"
        ndarray y "N integer class labels"
        source "database/asl_data.npz"
    }

    ASL_LETTER_MODEL {
        file model "asl_letter_model.joblib RandomForest"
        file scaler "asl_letter_scaler.joblib StandardScaler"
        file meta "asl_letter_meta.json classes+accuracy"
        file bundle "asl_letter_bundle.joblib fallback"
    }

    GESTURE_MODEL {
        file weights "ml/gesture_model.pt PyTorch state_dict"
        file labels "ml/labels.json idx to word"
        file meta "ml/model_meta.json seq_len+feat_size"
        file normalizer "ml/normalizer.npz mean+std"
    }

    WLASL_VOCAB {
        file json "data/WLASL/curated_WLASL.json"
        string gloss "sign word"
        list instances "video_id + split + url"
        file videos "data/WLASL/videos/*.mp4"
    }

    SETTINGS_LOCAL {
        string gb_token "JWT in localStorage"
        string gb_user "user JSON in localStorage"
        string gb_settings "theme+TTS+mode JSON"
    }

    USERS ||--o{ GESTURE_HISTORY : "has many"
    GESTURE_HISTORY }o--|| GESTURE_MODEL : "predicted by"
    ASL_DATASET ||--|| GESTURE_MODEL : "trained from"
    WLASL_VOCAB ||--o{ GESTURE_HISTORY : "word appears in"
```

---

## 11. Data Flow Diagram (DFD) — Level 0 (Context)

```mermaid
flowchart LR
    User([Signer / User])
    GBSystem(["GestureBridge\nSystem"])
    IBMWatsonx([IBM Watsonx.ai])
    MongoDB([MongoDB Atlas])
    GoogleOAuth([Google OAuth])

    User -->|webcam frames, text input, login| GBSystem
    GBSystem -->|predictions, translations, video| User
    GBSystem -->|LLM prompts| IBMWatsonx
    IBMWatsonx -->|generated text| GBSystem
    GBSystem -->|read/write users + history| MongoDB
    MongoDB -->|user records, history| GBSystem
    GBSystem -->|OAuth redirect| GoogleOAuth
    GoogleOAuth -->|id_token + user info| GBSystem
```

---

## 12. Data Flow Diagram (DFD) — Level 1 (System Processes)

```mermaid
flowchart TB
    User([User])
    MongoDB([MongoDB])
    Watsonx([Watsonx.ai])

    P1[1.0\nAuthentication\nProcess]
    P2[2.0\nSign-to-Text\nML Pipeline]
    P3[3.0\nText-to-Sign\nLookup]
    P4[4.0\nAI Enhancement\nProcess]
    P5[5.0\nHistory\nManagement]

    DS1[(D1: Users DB)]
    DS2[(D2: Gesture History DB)]
    DS3[(D3: WLASL Video Index)]
    DS4[(D4: ML Model Files)]
    DS5[(D5: localStorage)]

    User -->|name, email, password| P1
    P1 -->|JWT token| User
    P1 <-->|user records| DS1
    P1 <-->|user records| MongoDB

    User -->|landmark sequence 218-dim| P2
    P2 <-->|model weights| DS4
    P2 -->|predicted word, confidence| User
    P2 -->|gesture record| DS2
    DS2 <-->|history records| MongoDB

    User -->|English text| P3
    P3 <-->|word→video map| DS3
    P3 -->|video URLs + coverage| User

    User -->|gloss sequence| P4
    P4 <-->|LLM prompts/responses| Watsonx
    P4 -->|English sentence, tips, insights| User

    User -->|request history| P5
    P5 <-->|history records| DS2
    P5 -->|translation log| User

    User <-->|settings, token| DS5
```

---

## 13. Navigation Tree

```
GestureBridge Navigation Tree
├── / (Landing)
│   ├── → /login        (CTA: "Start Translating")
│   └── → /register     (CTA: "Get Started Free")
│
├── /login              (Auth.jsx — login tab)
│   ├── → /register     (link)
│   ├── → /auth/google  (Google OAuth button)
│   └── → /dashboard    (on successful login)
│
├── /register           (Auth.jsx — register tab)
│   ├── → /login        (link)
│   └── → OTP screen    (on register success)
│       └── → /dashboard (on OTP verified)
│
├── /auth/callback      (AuthCallback.jsx — handles Google redirect)
│   └── → /dashboard    (auto-redirect after storing token)
│
├── /dashboard          [PROTECTED]
│   ├── Sidebar → /sign-to-text
│   ├── Sidebar → /text-to-sign
│   ├── Sidebar → /history
│   ├── Sidebar → /account
│   └── Topbar  → logout
│
├── /sign-to-text       [PROTECTED]
│   ├── Mode tabs: Sign Mode | Spell Mode
│   ├── Start Camera → live webcam
│   ├── Gloss sequence panel
│   ├── Translation panel → AI Improve button
│   ├── Reading Now card (prediction + confidence)
│   ├── NMM card
│   ├── Top-5 predictions
│   ├── Letter-to-Sentence panel (Spell Mode)
│   └── Quick Tips
│
├── /text-to-sign       [PROTECTED]
│   ├── Language selector (ASL/Hindi/Marathi)
│   ├── Text input + Quick phrase chips
│   ├── 🎤 Speak button (STT)
│   ├── 🔊 Listen button (TTS)
│   ├── ▶ Show Signs → video player
│   │   ├── Progress bar
│   │   ├── Word chip strip (click to jump)
│   │   ├── AI Tip button
│   │   ├── Controls: Prev / Play / Pause / Next / Stop / Loop / Auto / Speed
│   │   └── Fullscreen
│   ├── Stats card (Signs Found / Skipped / Coverage)
│   ├── How It Works card
│   └── Supported Words vocab list
│
├── /history            [PROTECTED]
│   ├── Translation history list
│   ├── AI Insights button → /ai/sentence-insights
│   └── Per-entry detail
│
├── /account            [PROTECTED]  (alias: /profile, /settings)
│   ├── Tab: Profile → edit name
│   ├── Tab: Security → change password
│   ├── Tab: Appearance → theme / TTS settings
│   └── Danger Zone → reset settings
│
└── /* → redirect to /
```
