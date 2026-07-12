/**
 * SignToText Page — Real-time sign language translation using the webcam.
 *
 * Architecture
 * ─────────────
 * 1. MediaPipe Hands (loaded from CDN via <script> tags) runs in the browser.
 *    It tracks 21 hand landmarks (x, y, z) for BOTH hands per frame → 126 floats.
 *    Layout: [left_hand × 63 floats | right_hand × 63 floats].
 *    A missing hand slot is filled with zeros.
 * 2. Every CAPTURE_MS ms, the latest landmark vector is pushed into a
 *    rolling buffer (max SEQUENCE_LENGTH frames).
 * 3. Once the buffer is full, a POST /predict request is sent to Flask with
 *    the (T×126) 2-D array.
 * 4. If the same word is predicted STABLE_FRAMES times consecutively AND its
 *    confidence ≥ confidenceThreshold, it is committed to the sentence.
 *
 * Backend contract  (backend/routes/gesture.py → POST /predict):
 *   Request : { user_id: string, gesture: number[][] }   ← shape (T × 126)
 *   Response: { predicted_text, confidence, top5[], warning? }
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { predictGesture } from '../services/api';

/* ── Tuneable constants ───────────────────────────────────────────────── */
const SEQUENCE_LENGTH = 30;   // frames sent to the model per prediction
const STABLE_FRAMES   = 5;    // how many consecutive identical predictions to commit
const CAPTURE_MS      = 150;  // ms between landmark captures (≈ 6–7 fps to backend)

/* ── CDN URLs for MediaPipe Hands + Camera utils ─────────────────────── */
const MP_HANDS_CDN  = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js';
const MP_CAMERA_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';

/* ── Hand skeleton connections (MediaPipe landmark indices) ──────────── */
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

/** Flatten 21 MediaPipe landmarks into a 63-float vector [x,y,z, …]. */
function flattenLandmarks(landmarks) {
  return landmarks.flatMap(({ x, y, z }) => [x, y, z]);
}

const EMPTY_HAND = new Array(63).fill(0);

/**
 * Build a 126-float frame vector from a MediaPipe multi-hand result.
 * Layout: [left_hand(63) | right_hand(63)] — zero-padded if a hand is absent.
 * Uses multiHandedness labels to assign left vs right regardless of detection order.
 */
function buildDualHandVector(multiHandLandmarks, multiHandedness) {
  let left  = EMPTY_HAND;
  let right = EMPTY_HAND;

  if (multiHandLandmarks && multiHandedness) {
    for (let i = 0; i < multiHandLandmarks.length; i++) {
      // MediaPipe reports handedness mirrored (webcam view) — treat "Right" label
      // as the user's right hand (which appears on the left of the mirrored frame).
      const label = (multiHandedness[i]?.label ?? '').toLowerCase();
      const vec   = flattenLandmarks(multiHandLandmarks[i]);
      if (label === 'left') {
        left = vec;
      } else {
        right = vec;
      }
    }
  }

  return [...left, ...right];   // 126 floats
}

/** Dynamically inject a <script> tag and return a Promise that resolves on load. */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

export default function SignToText() {
  const { user }  = useAuth();
  const { confidenceThreshold, privacyMode } = useSettings();

  /* ── UI state ──────────────────────────────────────────────────────── */
  const [mpReady,      setMpReady]      = useState(false);
  const [camActive,    setCamActive]    = useState(false);
  const [starting,     setStarting]     = useState(false);
  const [handVisible,  setHandVisible]  = useState(false);
  const [error,        setError]        = useState('');

  const [prediction,   setPrediction]   = useState('');
  const [confidence,   setConfidence]   = useState(0);
  const [top5,         setTop5]         = useState([]);
  const [stableDots,   setStableDots]   = useState(0);   // 0–STABLE_FRAMES
  const [sentence,     setSentence]     = useState([]);  // committed words

  /* ── Mutable refs (never trigger re-renders) ──────────────────────── */
  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const handsRef        = useRef(null);
  const cameraRef       = useRef(null);
  const captureTimerRef = useRef(null);
  const frameBuffer     = useRef([]);          // rolling (T × 126) buffer
  const stableCount     = useRef(0);
  const lastWord        = useRef('');
  const isSending       = useRef(false);
  // Keep latest threshold accessible inside the setInterval closure
  const thresholdRef    = useRef(confidenceThreshold);
  useEffect(() => { thresholdRef.current = confidenceThreshold; }, [confidenceThreshold]);

  /* ── Load MediaPipe CDN scripts once on mount ─────────────────────── */
  useEffect(() => {
    loadScript(MP_HANDS_CDN)
      .then(() => loadScript(MP_CAMERA_CDN))
      .then(() => setMpReady(true))
      .catch((e) => setError(e.message));
  }, []);

  /* ── Cleanup on unmount ───────────────────────────────────────────── */
  useEffect(() => () => teardown(), []);

  /* ── Draw landmarks on the overlay canvas ─────────────────────────── */
  const drawLandmarks = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const lmSets = results.multiHandLandmarks;
    if (!lmSets?.length) return;

    for (const lms of lmSets) {
      // Bones
      ctx.strokeStyle = '#14B8A6';
      ctx.lineWidth   = 2.5;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(lms[a].x * canvas.width, lms[a].y * canvas.height);
        ctx.lineTo(lms[b].x * canvas.width, lms[b].y * canvas.height);
        ctx.stroke();
      }
      // Joints
      for (const lm of lms) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fillStyle   = '#2563EB';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }
    }
  }, []);

  /* ── Start the camera + MediaPipe pipeline ───────────────────────── */
  const startCamera = useCallback(async () => {
    setError('');
    setStarting(true);
    try {
      // Verify camera access up front so we get a clear error if denied
      await navigator.mediaDevices.getUserMedia({ video: true });

      if (!window.Hands || !window.Camera) {
        throw new Error('MediaPipe libraries not loaded yet. Please wait and try again.');
      }

      /* 1 — MediaPipe Hands instance */
      handsRef.current = new window.Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
      });
      handsRef.current.setOptions({
        maxNumHands:            2,   // detect both hands for full sign language coverage
        modelComplexity:        1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence:  0.5,
      });
      handsRef.current.onResults((results) => {
        drawLandmarks(results);
        const lmSets   = results.multiHandLandmarks;
        const handness = results.multiHandedness;
        if (lmSets?.length) {
          setHandVisible(true);
          // Build 126-float vector: [left_hand(63) | right_hand(63)]
          const vec = buildDualHandVector(lmSets, handness);
          frameBuffer.current.push(vec);
          if (frameBuffer.current.length > SEQUENCE_LENGTH) {
            frameBuffer.current.shift();
          }
        } else {
          setHandVisible(false);
        }
      });
      await handsRef.current.initialize();

      /* 2 — Camera wrapper */
      cameraRef.current = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (handsRef.current) {
            await handsRef.current.send({ image: videoRef.current });
          }
        },
        width: 640, height: 480,
      });
      await cameraRef.current.start();

      /* 3 — Prediction loop */
      captureTimerRef.current = setInterval(async () => {
        if (frameBuffer.current.length < SEQUENCE_LENGTH || isSending.current) return;
        isSending.current = true;
        try {
          const snapshot = frameBuffer.current.slice(-SEQUENCE_LENGTH);
          const { data }  = await predictGesture(user?.email ?? 'anonymous', snapshot);

          const word = data.predicted_text;
          const conf = data.confidence ?? 0;

          setPrediction(word);
          setConfidence(conf);
          setTop5(data.top5 ?? []);

          if (word === lastWord.current && conf >= thresholdRef.current) {
            stableCount.current += 1;
            setStableDots(stableCount.current);
            if (stableCount.current >= STABLE_FRAMES) {
              setSentence((prev) => [...prev, word]);
              stableCount.current = 0;
              lastWord.current    = '';
              setStableDots(0);
              frameBuffer.current = [];
            }
          } else {
            lastWord.current    = word;
            stableCount.current = 1;
            setStableDots(1);
          }
        } catch {
          // Transient network/server errors during prediction are silently ignored
        } finally {
          isSending.current = false;
        }
      }, CAPTURE_MS * STABLE_FRAMES);

      setCamActive(true);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permissions and try again.');
      } else {
        setError(err.message || 'Failed to start camera.');
      }
    } finally {
      setStarting(false);
    }
  }, [user, drawLandmarks]);

  /* ── Stop / teardown ─────────────────────────────────────────────── */
  function teardown() {
    clearInterval(captureTimerRef.current);
    captureTimerRef.current = null;
    try { cameraRef.current?.stop(); } catch {}
    try { handsRef.current?.close(); } catch {}
    cameraRef.current   = null;
    handsRef.current    = null;
    frameBuffer.current = [];
    isSending.current   = false;
    stableCount.current = 0;
    lastWord.current    = '';
  }

  const stopCamera = useCallback(() => {
    teardown();
    setCamActive(false);
    setHandVisible(false);
    setPrediction('');
    setConfidence(0);
    setTop5([]);
    setStableDots(0);
  }, []);

  /* ── Sentence helpers ────────────────────────────────────────────── */
  const handleUndo  = () => setSentence((p) => p.slice(0, -1));
  const handleClear = () => { setSentence([]); setPrediction(''); setConfidence(0); setTop5([]); };
  const handleCopy  = () => navigator.clipboard?.writeText(sentence.join(' '));

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <AppShell>
      <div className="page-header">
        <h1>Sign to Text</h1>
        <p>Show a sign in front of your webcam — GestureBridge reads it in real time.</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {!mpReady && !error && (
        <Alert type="info" message="Loading MediaPipe AI libraries from CDN…" />
      )}
      {privacyMode && (
        <Alert type="info" message="Privacy Mode is ON — translations will not be saved to history." />
      )}

      {/* ── Two-column layout ─────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 320px',
        gap: '1.5rem',
        alignItems: 'start',
      }}
        className="stt-grid"
      >
        {/* ── Left: video feed + sentence output ─────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Video card */}
          <div className="card" style={{ padding: '1rem' }}>
            {/* Webcam + canvas overlay */}
            <div style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              background: '#0F172A',
              aspectRatio: '4/3',
            }}>
              <video
                ref={videoRef}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',   // mirror for natural feel
                  display: 'block',
                }}
                muted
                playsInline
              />
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  transform: 'scaleX(-1)',
                  pointerEvents: 'none',
                }}
              />

              {/* Idle placeholder */}
              {!camActive && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '.75rem',
                }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 7l-7 5 7 5V7z"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                  <p style={{ color: '#94A3B8', fontSize: '.9rem' }}>
                    {mpReady ? 'Camera not started' : 'Loading MediaPipe…'}
                  </p>
                </div>
              )}

              {/* Hand detection status badge */}
              {camActive && (
                <div style={{
                  position: 'absolute', top: '.75rem', left: '.75rem',
                  display: 'flex', alignItems: 'center', gap: '.4rem',
                  background: 'rgba(0,0,0,.65)', padding: '.3rem .75rem',
                  borderRadius: 999, fontSize: '.75rem', color: '#fff',
                  backdropFilter: 'blur(4px)',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: handVisible ? '#10B981' : '#EF4444',
                  }} className={handVisible ? '' : 'pulse'} />
                  {handVisible ? 'Hand(s) Detected' : 'No Hands Visible'}
                </div>
              )}

              {/* Live word overlay */}
              {camActive && prediction && (
                <div style={{
                  position: 'absolute', bottom: '.75rem',
                  left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(37,99,235,.88)', padding: '.45rem 1.25rem',
                  borderRadius: 999, color: '#fff',
                  fontSize: '1.05rem', fontWeight: 700,
                  backdropFilter: 'blur(4px)',
                  whiteSpace: 'nowrap',
                }}>
                  {prediction}
                </div>
              )}
            </div>

            {/* Camera start / stop */}
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', justifyContent: 'center' }}>
              {!camActive ? (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={startCamera}
                  disabled={starting || !mpReady}
                >
                  {starting
                    ? <><Spinner size="sm" /> Starting…</>
                    : mpReady ? 'Start Camera' : 'Loading…'}
                </button>
              ) : (
                <button className="btn btn-danger btn-lg" onClick={stopCamera}>
                  Stop Camera
                </button>
              )}
            </div>
          </div>

          {/* Sentence output card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
              <h3 style={{ margin: 0 }}>Sentence</h3>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={handleUndo}  disabled={!sentence.length}>Undo</button>
                <button className="btn btn-ghost btn-sm" onClick={handleClear} disabled={!sentence.length}>Clear</button>
                <button className="btn btn-subtle btn-sm" onClick={handleCopy}  disabled={!sentence.length}>Copy</button>
              </div>
            </div>
            <div style={{
              minHeight: 64,
              padding: '1rem',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '1.1rem',
              color: sentence.length ? 'var(--text-main)' : 'var(--text-light)',
              lineHeight: 1.7,
            }}>
              {sentence.length ? sentence.join(' ') : 'Detected words will appear here…'}
            </div>

            {/* Word chips */}
            {sentence.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginTop: '.75rem' }}>
                {sentence.map((w, i) => (
                  <span key={i} className="badge badge-primary">{w}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: prediction panel ─────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Current prediction */}
          <div className="card" style={{ textAlign: 'center' }}>
            <h4 style={{ color: 'var(--text-muted)', marginBottom: '.75rem' }}>Live Prediction</h4>

            <div style={{
              fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-.02em',
              color: prediction ? 'var(--color-primary)' : 'var(--text-light)',
              minHeight: '2.6rem',
            }}>
              {prediction || '—'}
            </div>

            {/* Confidence bar */}
            {confidence > 0 && (
              <div style={{ marginTop: '.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.3rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Confidence</span>
                  <span style={{
                    fontWeight: 700,
                    color: confidence >= confidenceThreshold ? 'var(--color-success)' : 'var(--color-warning)',
                  }}>
                    {(confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="confidence-bar">
                  <div className="confidence-bar-fill" style={{ width: `${confidence * 100}%` }} />
                </div>
              </div>
            )}

            {/* Stability dots */}
            {camActive && (
              <div style={{ marginTop: '.9rem' }}>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.4rem' }}>
                  Stability ({stableDots}/{STABLE_FRAMES})
                </div>
                <div style={{ display: 'flex', gap: '.3rem', justifyContent: 'center' }}>
                  {Array.from({ length: STABLE_FRAMES }).map((_, i) => (
                    <div key={i} style={{
                      width: 11, height: 11, borderRadius: '50%',
                      background: i < stableDots
                        ? 'var(--color-primary)'
                        : 'var(--border)',
                      transition: 'background var(--transition)',
                    }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top-5 predictions */}
          {top5.length > 0 && (
            <div className="card">
              <h4 style={{ marginBottom: '.75rem' }}>Top 5 Predictions</h4>
              {top5.map((t, i) => (
                <div key={i} style={{ marginBottom: i < top5.length - 1 ? '.65rem' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', marginBottom: '.2rem' }}>
                    <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--color-primary)' : 'var(--text-main)' }}>
                      {i + 1}. {t.word}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                      {(t.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="confidence-bar" style={{ height: 5 }}>
                    <div className="confidence-bar-fill" style={{ width: `${t.confidence * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div className="card">
            <h4 style={{ marginBottom: '.75rem' }}>How to Use</h4>
            <ol style={{ paddingLeft: '1.1rem', fontSize: '.855rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
              <li>Click <strong>Start Camera</strong> and grant access.</li>
              <li>Hold both hands clearly in the frame for best accuracy.</li>
              <li>Sign a word — hold it steady ~1–2 seconds.</li>
              <li>Watch the stability dots fill up as the model locks on.</li>
              <li>The word is added to your sentence automatically.</li>
              <li>Use <strong>Undo</strong> or <strong>Clear</strong> to correct errors.</li>
              <li>Click <strong>Copy</strong> to use the sentence elsewhere.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Responsive: collapse to 1-column on narrow screens */}
      <style>{`
        @media (max-width: 860px) {
          .stt-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}
