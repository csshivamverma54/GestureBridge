/**
 * GestureBridge API Service Layer
 * ─────────────────────────────────
 * Development (npm run dev, port 3000):
 *   VITE_API_URL is set to "" in .env.development, so all requests go to
 *   relative paths like /predict, which Vite proxies to Flask :5000.
 *
 * Production (Flask serves the React build from backend/static/dist):
 *   React and Flask share the SAME origin, so all API calls use relative
 *   paths (baseURL = ""). No cross-origin issues, no hardcoded URL needed.
 *
 * External deployment (React on CDN, Flask on Render):
 *   Set VITE_API_URL=https://gesturebridge.onrender.com in your build env.
 *
 * Flask API endpoints (from backend/routes/):
 *   POST   /register               – create account
 *   POST   /login                  – returns JWT token
 *   GET    /profile                – authenticated user profile
 *   POST   /predict                – landmark sequence → predicted text
 *   POST   /predict-letter         – single-frame hand → ASL letter
 *   POST   /generate-sentence      – gloss list → English sentence (AI-powered)
 *   POST   /generate-letter-sentence – fingerspelled letters → suggestion (AI)
 *   GET    /model/status           – ML model readiness
 *   POST   /model/reload           – hot-reload ML model
 *   GET    /history/:user_id       – translation history
 *   POST   /text-to-sign           – text → sign video list (local + CDN fallback)
 *   GET    /text-to-sign/vocabulary – supported word list
 *   GET    /video/<id>             – stream WLASL mp4
 *
 * IBM Watsonx.ai endpoints (backend/routes/ai.py):
 *   POST   /ai/improve-text        – polish a sign-to-text translation
 *   POST   /ai/learning-tip        – ASL learning tip for a word
 *   POST   /ai/sentence-insights   – AI insights from translation history
 *   POST   /ai/gloss-to-english    – LLM-powered gloss → English (alt route)
 *   GET    /ai/status              – check if Watsonx is configured
 */

import axios from 'axios';

// Use VITE_API_URL if explicitly set (e.g. React on CDN pointing at Render backend).
// In dev, Vite's proxy handles all /api, /video, /text-to-sign paths → no base URL needed.
// In production, Flask serves React on the same origin → relative paths work directly.
// Default is '' (empty) so video URLs like /video/00639 resolve to the current origin,
// not to a hardcoded localhost address that breaks in every deployed environment.
const BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach JWT from localStorage before every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — clear session and redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('gb_token');
      localStorage.removeItem('gb_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/** Extract a human-readable message from an Axios error. */
export const getErrorMessage = (error) => {
  if (error.response?.data?.error)   return error.response.data.error;
  if (error.response?.data?.message) return error.response.data.message;
  if (error.message)                 return error.message;
  return 'An unexpected error occurred.';
};

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════

/** POST /register  { name, email, password } */
export const registerUser = (data) => api.post('/register', data);

/** POST /login  { email, password }  → { token, message } */
export const loginUser = (data) => api.post('/login', data);

/** GET /profile  (requires Authorization header) */
export const getProfile = () => api.get('/profile');

// ═══════════════════════════════════════════════════════════════
// GESTURE PREDICTION
// ═══════════════════════════════════════════════════════════════

/**
 * POST /predict  { user_id, gesture }
 *   gesture: number[][]  — (T × 218) array of MediaPipe landmarks
 * → { predicted_text, confidence, top5[], warning? }
 */
export const predictGesture = (userId, gesture, nmm = {}) =>
  api.post('/predict', { user_id: userId, gesture, nmm });

/**
 * POST /predict-letter  { landmarks, index_tip_xy? }
 *   landmarks    : number[63] — raw dominant-hand MediaPipe landmarks (flattened)
 *   index_tip_xy : [x, y]    — optional index fingertip position for J/Z detection
 * → { letter, confidence, top5[], is_dynamic }
 */
export const predictLetter = (landmarks, indexTipXY = null) =>
  api.post('/predict-letter', {
    landmarks,
    ...(indexTipXY ? { index_tip_xy: indexTipXY } : {}),
  });

/**
 * POST /generate-sentence  { glosses, nmm }
 * → { sentence, glosses, nmm }
 */
export const generateSentence = (glosses, nmm = {}) =>
  api.post('/generate-sentence', { glosses, nmm });

/**
 * POST /generate-letter-sentence  { letters }
 * → { sentence, suggestions[] }
 */
export const generateLetterSentence = (letters) =>
  api.post('/generate-letter-sentence', { letters });

/** GET /model/status */
export const getModelStatus = () => api.get('/model/status');

/** POST /model/reload */
export const reloadModel = () => api.post('/model/reload');

// ═══════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════

/** GET /history/:userId */
export const getHistory = (userId) => api.get(`/history/${userId}`);

// ═══════════════════════════════════════════════════════════════
// TEXT TO SIGN
// ═══════════════════════════════════════════════════════════════

/**
 * POST /text-to-sign  { text, language? }
 * → { words, coverage, total_words, found_words }
 */
export const textToSign = (text, language = 'ASL') =>
  api.post('/text-to-sign', { text, language });

/** GET /text-to-sign/vocabulary → { words[], count } */
export const getVocabulary = () => api.get('/text-to-sign/vocabulary');

/**
 * Build a video URL that works in both dev (Vite proxy) and prod (same origin).
 * videoPath is the relative path returned by the backend, e.g. "/video/69364".
 * Returns null (not '') when videoPath is falsy so callers can test easily.
 */
export const videoUrl = (videoPath) => {
  if (!videoPath) return null;
  // If VITE_API_URL is set (external deploy), prepend it; otherwise same-origin.
  return BASE_URL ? `${BASE_URL}${videoPath}` : videoPath;
};

/**
 * Pick the best playable URL for a word entry returned by /text-to-sign.
 * Prefers the local Flask stream; falls back to the external CDN URL.
 * Returns null if neither is available.
 */
export const bestVideoUrl = (wordEntry) => {
  if (!wordEntry) return null;
  if (wordEntry.video_url) return videoUrl(wordEntry.video_url);
  if (wordEntry.external_url) return wordEntry.external_url;
  return null;
};

// ═══════════════════════════════════════════════════════════════
// IBM WATSONX.AI  —  AI features
// ═══════════════════════════════════════════════════════════════

/**
 * POST /ai/improve-text  { text }
 * → { improved }
 * Polish a raw sign-to-text translation into fluent English.
 */
export const improveText = (text) =>
  api.post('/ai/improve-text', { text });

/**
 * POST /ai/learning-tip  { word }
 * → { word, tip, fun_fact }
 * Get an AI-generated ASL learning tip for a sign.
 */
export const getLearningTip = (word) =>
  api.post('/ai/learning-tip', { word });

/**
 * POST /ai/sentence-insights  { translations: string[] }
 * → { insights }
 * Get AI-generated insights from a list of translation history items.
 */
export const getSentenceInsights = (translations) =>
  api.post('/ai/sentence-insights', { translations });

/** GET /ai/status → { configured, model } */
export const getAiStatus = () => api.get('/ai/status');

export default api;
