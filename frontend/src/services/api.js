/**
 * GestureBridge API Service Layer
 * ─────────────────────────────────
 * In development (npm run dev, port 3000):
 *   All requests go to /api/*, Vite proxies them → Flask :5000,
 *   stripping the /api prefix before forwarding.
 *
 * In production (npm run build):
 *   Requests go directly to https://gesturebridge.onrender.com
 *   (the deployed Render backend).
 *
 * Solution: detect the mode via import.meta.env.DEV and set the base URL
 * accordingly so the same codebase works in both environments.
 *
 * Flask API endpoints (from backend/routes/):
 *   POST   /register          – create account
 *   POST   /login             – returns JWT token
 *   GET    /profile           – authenticated user profile
 *   POST   /predict           – landmark sequence → predicted text
 *   GET    /model/status      – ML model readiness
 *   POST   /model/reload      – hot-reload ML model
 *   GET    /history/:user_id  – translation history
 */

import axios from 'axios';

// Dev:  /api prefix → Vite proxy → Flask :5000 (strips the prefix).
// Prod: direct to the Render-hosted backend.
const PROD_API  = 'https://gesturebridge.onrender.com';
const BASE_URL  = import.meta.env.VITE_API_URL;

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
 *   gesture: number[][]  — (T × 126) array of MediaPipe landmarks
 *   Each row: [left_hand×63_floats | right_hand×63_floats] — zeros if hand absent.
 * → { predicted_text, confidence, top5[], warning? }
 */
export const predictGesture = (userId, gesture, nmm = {}) =>
  api.post('/predict', { user_id: userId, gesture, nmm });

/**
 * POST /generate-sentence  { glosses, nmm }
 *   glosses : string[]  — ordered ASL gloss tokens
 *   nmm     : object    — NMM scalar averages from the signing window
 * → { sentence, glosses, nmm }
 */
export const generateSentence = (glosses, nmm = {}) =>
  api.post('/generate-sentence', { glosses, nmm });

/** GET /model/status */
export const getModelStatus = () => api.get('/model/status');

/** POST /model/reload */
export const reloadModel = () => api.post('/model/reload');

// ═══════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════

/** GET /history/:userId */
export const getHistory = (userId) => api.get(`/history/${userId}`);

export default api;
