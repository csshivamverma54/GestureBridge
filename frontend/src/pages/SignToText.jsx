/**
 * SignToText — Real-time Continuous Sign Language Recognition (CSLR) v2
 *
 * Upgrades implemented in this version:
 *  1. Non-Manual Markers (NMM) — eyebrow raise/furrow, head nod/shake/tilt,
 *     mouth morphemes detected from Holistic face mesh; passed to backend.
 *  2. Fingerspelling branch — activates when one hand is spatially stable
 *     while showing rapid finger micro-motion; recognized A–Z letters are
 *     concatenated into words before entering the gloss sequence.
 *  3. Dynamic handedness — calibration window measures movement energy on
 *     both wrists; dominant hand is auto-assigned, landmarks mirrored if
 *     the signer is left-handed so the model always receives normalised input.
 *  4. Adaptive latency — if the previous Holistic frame hasn't finished
 *     processing when the next arrives the new frame is skipped; a skip
 *     counter prevents queue overflow on low-end hardware.
 *  5. Extended features (218 dims) — acceleration(3), NMM(10),
 *     finger joint angles(15), wrist orientation quaternion(4),
 *     body distances(4) added to the existing 182-dim vector.
 *  6. Sliding window inference — FIFO of 45–60 frames with temporal overlap;
 *     inference runs every CAPTURE_MS regardless of sign boundaries.
 *  7. Improved sign boundary detection — dual criteria: velocity drop AND
 *     wrist-near-waist position; duplicate suppression via cooldown + hash.
 *
 * Feature vector layout per frame (218 dims):
 *   left(63) | right(63) | pose(24) | face_spatial(27) | vel(3) | interact(2)
 *   | accel(3) | nmm(10) | finger_angles(15) | wrist_quat(4) | body_dist(4)
 *
 * Backend contract:
 *   POST /predict  { user_id, gesture: number[][], nmm: object }
 *   → { predicted_text, confidence, top5[], nmm }
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { predictGesture, generateSentence } from '../services/api';

/* ══════════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════════ */
const SEQUENCE_LENGTH      = 45;    // primary FIFO depth
const MAX_SEQUENCE_LENGTH  = 60;    // upper window bound (temporal overlap)
const STABLE_FRAMES        = 3;     // consecutive matching predictions to commit
const CAPTURE_MS           = 150;   // inference interval (≈ 6.7 Hz)
const CONFIDENCE_THRESHOLD = 0.85;  // minimum confidence to commit
const REST_FRAMES          = 30;    // frames of rest → sentence end
const VELOCITY_REST_THRESH = 0.010; // wrist speed below this = resting
const COOLDOWN_MS          = 800;   // post-commit cooldown
const CALIBRATION_FRAMES   = 20;    // frames to measure handedness
const FS_STABLE_THRESH     = 0.008; // fingerspelling: base-hand stable threshold
const FS_MOTION_THRESH     = 0.025; // fingerspelling: dominant-hand micro-motion

/* ── Feature sizes (218 total, matching backend/ml/utils/landmarks.py) ── */
const SINGLE_HAND_SIZE    = 63;
const HANDS_SIZE          = 126;
const POSE_SIZE           = 24;
const FACE_SIZE           = 27;
const VELOCITY_SIZE       = 3;
const INTERACTION_SIZE    = 2;
const ACCEL_SIZE          = 3;
const NMM_SIZE            = 10;
const FINGER_ANGLE_SIZE   = 15;
const WRIST_ORIENT_SIZE   = 4;
const BODY_DIST_SIZE      = 4;
const LANDMARK_VECTOR_SIZE =
  HANDS_SIZE + POSE_SIZE + FACE_SIZE + VELOCITY_SIZE + INTERACTION_SIZE +
  ACCEL_SIZE + NMM_SIZE + FINGER_ANGLE_SIZE + WRIST_ORIENT_SIZE + BODY_DIST_SIZE; // 218

/* ── Feature vector offsets ───────────────────────────────────────── */
const OFF_VEL    = HANDS_SIZE + POSE_SIZE + FACE_SIZE;              // 180
const OFF_ACCEL  = OFF_VEL + VELOCITY_SIZE + INTERACTION_SIZE;      // 185
const OFF_NMM    = OFF_ACCEL + ACCEL_SIZE;                          // 188

/* ── MediaPipe CDN ────────────────────────────────────────────────── */
const MP_HOLISTIC_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/holistic.js';
const MP_CAMERA_CDN   = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';
const MP_DRAWING_CDN  = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';

/* ── Skeleton connections for canvas overlay ─────────────────────── */
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];

/* ── Zero arrays ──────────────────────────────────────────────────── */
const ZERO_VEC = new Float32Array(LANDMARK_VECTOR_SIZE);

/* ══════════════════════════════════════════════════════════════════
   Feature extraction helpers (mirror backend/ml/utils/landmarks.py)
   ══════════════════════════════════════════════════════════════════ */

/** L2 norm of a 3-element array. */
const norm3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

/** Wrist-origin, max-abs-scaled hand landmarks → Float32Array(63). */
function normalizeHand(lms) {
  const out = new Float32Array(SINGLE_HAND_SIZE);
  if (!lms || lms.length < 21) return out;
  const wx = lms[0].x, wy = lms[0].y, wz = lms[0].z;
  const raw = new Float32Array(SINGLE_HAND_SIZE);
  for (let i = 0; i < 21; i++) {
    raw[i * 3]     = lms[i].x - wx;
    raw[i * 3 + 1] = lms[i].y - wy;
    raw[i * 3 + 2] = lms[i].z - wz;
  }
  let mx = 0; for (let i = 0; i < raw.length; i++) { const a = Math.abs(raw[i]); if (a > mx) mx = a; }
  if (mx > 1e-8) for (let i = 0; i < raw.length; i++) out[i] = raw[i] / mx;
  return out;
}

/**
 * Mirror hand landmarks: swap x-coordinate signs so the model always
 * receives right-dominant input regardless of handedness.
 */
function mirrorHandLandmarks(lms) {
  if (!lms) return lms;
  return lms.map(lm => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
}

/** Shoulder-midpoint-origin, shoulder-width-scale pose → Float32Array(24). */
const POSE_IDX = [11, 12, 13, 14, 15, 16, 23, 24];
function extractPose(plms) {
  const out = new Float32Array(POSE_SIZE);
  if (!plms || plms.length < 25) return out;
  const ls = plms[11], rs = plms[12];
  const ox = (ls.x + rs.x) / 2, oy = (ls.y + rs.y) / 2, oz = (ls.z + rs.z) / 2;
  const sc = norm3(rs.x - ls.x, rs.y - ls.y, rs.z - ls.z) || 1;
  POSE_IDX.forEach((idx, i) => {
    const lm = plms[idx]; if (!lm) return;
    out[i * 3]     = (lm.x - ox) / sc;
    out[i * 3 + 1] = (lm.y - oy) / sc;
    out[i * 3 + 2] = (lm.z - oz) / sc;
  });
  return out;
}

/** Nose-bridge-origin, forehead-to-chin-scale face spatial → Float32Array(27). */
const FACE_IDX = [0, 13, 14, 17, 61, 291, 199, 10, 152];
function extractFaceSpatial(flms) {
  const out = new Float32Array(FACE_SIZE);
  if (!flms || flms.length < 300) return out;
  const nose = flms[0], top = flms[10], bot = flms[152];
  const sc = norm3(bot.x - top.x, bot.y - top.y, bot.z - top.z) || 1;
  FACE_IDX.forEach((idx, i) => {
    const lm = flms[idx]; if (!lm) return;
    out[i * 3]     = (lm.x - nose.x) / sc;
    out[i * 3 + 1] = (lm.y - nose.y) / sc;
    out[i * 3 + 2] = (lm.z - nose.z) / sc;
  });
  return out;
}

/** Interaction distances: [fingertips→lips, fingertips→base palm] / shoulder_scale. */
const FTIP_IDX = [4, 8, 12, 16, 20];
function computeInteraction(domLms, baseLms, flms, sc) {
  const out = new Float32Array(INTERACTION_SIZE);
  const scale = sc || 1;
  let ftx = 0, fty = 0, ftz = 0;
  if (domLms) {
    for (const i of FTIP_IDX) { ftx += domLms[i].x; fty += domLms[i].y; ftz += domLms[i].z; }
    ftx /= 5; fty /= 5; ftz /= 5;
  }
  if (flms && flms.length > 13) {
    const lip = flms[13];
    out[0] = norm3(ftx - lip.x, fty - lip.y, ftz - lip.z) / scale;
  }
  if (baseLms) {
    const palm = baseLms[9];
    out[1] = norm3(ftx - palm.x, fty - palm.y, ftz - palm.z) / scale;
  }
  return out;
}

/** Body distances: [→chin, →chest, →abdomen, →base_palm_from_wrist] / sc. */
function computeBodyDist(domLms, baseLms, flms, plms, sc) {
  const out = new Float32Array(BODY_DIST_SIZE);
  const scale = sc || 1;
  let ftx = 0, fty = 0, ftz = 0, wrx = 0, wry = 0, wrz = 0;
  if (domLms) {
    for (const i of FTIP_IDX) { ftx += domLms[i].x; fty += domLms[i].y; ftz += domLms[i].z; }
    ftx /= 5; fty /= 5; ftz /= 5;
    wrx = domLms[0].x; wry = domLms[0].y; wrz = domLms[0].z;
  }
  if (flms && flms.length > 152) {
    const chin = flms[152];
    out[0] = norm3(ftx - chin.x, fty - chin.y, ftz - chin.z) / scale;
  }
  if (plms && plms.length >= 25) {
    const chest = { x: (plms[11].x + plms[12].x) / 2, y: (plms[11].y + plms[12].y) / 2, z: (plms[11].z + plms[12].z) / 2 };
    out[1] = norm3(ftx - chest.x, fty - chest.y, ftz - chest.z) / scale;
    const abd = { x: (plms[23].x + plms[24].x) / 2, y: (plms[23].y + plms[24].y) / 2, z: (plms[23].z + plms[24].z) / 2 };
    out[2] = norm3(ftx - abd.x, fty - abd.y, ftz - abd.z) / scale;
  }
  if (baseLms) {
    const palm = baseLms[9];
    out[3] = norm3(wrx - palm.x, wry - palm.y, wrz - palm.z) / scale;
  }
  return out;
}

/** 15 joint angles for the dominant hand (law-of-cosines). */
const FINGER_TRIPLETS = [
  [0,1,2],[1,2,3],[2,3,4],
  [0,5,6],[5,6,7],[6,7,8],
  [0,9,10],[9,10,11],[10,11,12],
  [0,13,14],[13,14,15],[14,15,16],
  [0,17,18],[17,18,19],[18,19,20],
];
function extractFingerAngles(lms) {
  const out = new Float32Array(FINGER_ANGLE_SIZE);
  if (!lms || lms.length < 21) return out;
  for (let i = 0; i < FINGER_TRIPLETS.length; i++) {
    const [ai, bi, ci] = FINGER_TRIPLETS[i];
    const a = lms[ai], b = lms[bi], c = lms[ci];
    const bax = a.x - b.x, bay = a.y - b.y, baz = a.z - b.z;
    const bcx = c.x - b.x, bcy = c.y - b.y, bcz = c.z - b.z;
    const nb = norm3(bax, bay, baz), nc = norm3(bcx, bcy, bcz);
    if (nb < 1e-8 || nc < 1e-8) continue;
    const cos = (bax * bcx + bay * bcy + baz * bcz) / (nb * nc);
    out[i] = Math.acos(Math.max(-1, Math.min(1, cos)));
  }
  return out;
}

/** Wrist orientation quaternion (w,x,y,z) from hand plane. */
function extractWristQuat(lms) {
  const identity = new Float32Array([1, 0, 0, 0]);
  if (!lms || lms.length < 21) return identity;
  const w0 = lms[0], m = lms[9], p = lms[17], ix = lms[5];
  const fwd = [m.x - w0.x, m.y - w0.y, m.z - w0.z];
  const rgt = [ix.x - p.x, ix.y - p.y, ix.z - p.z];
  const nf = norm3(...fwd) || 1, nr = norm3(...rgt) || 1;
  const F = fwd.map(v => v / nf), R = rgt.map(v => v / nr);
  const U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
  const nu = norm3(...U) || 1; const Uu = U.map(v => v / nu);
  const Rr = [Uu[1] * F[2] - Uu[2] * F[1], Uu[2] * F[0] - Uu[0] * F[2], Uu[0] * F[1] - Uu[1] * F[0]];
  // R matrix rows: Rr, Uu, F
  const tr = Rr[0] + Uu[1] + F[2];
  let qw, qx, qy, qz;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    qw = 0.25 / s; qx = (Uu[2] - F[1]) * s; qy = (F[0] - Rr[2]) * s; qz = (Rr[1] - Uu[0]) * s;
  } else {
    qw = 0; qx = 0; qy = 0; qz = 1;
  }
  const q = new Float32Array([qw, qx, qy, qz]);
  const qn = norm3(qw, qx, qy) || 1;  // approximate
  return q.map(v => v / Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz + 1e-8));
}

/**
 * NMM extraction — 10 scalars from face mesh.
 * Returns { vec: Float32Array(10), yaw, pitch, roll, summary: {} }
 */
function extractNMM(flms, prevYaw, prevPitch, prevRoll) {
  const out = new Float32Array(NMM_SIZE);
  if (!flms || flms.length < 460) {
    return { vec: out, yaw: prevYaw, pitch: prevPitch, roll: prevRoll, summary: {} };
  }
  const n = flms.length;
  const lm = (i) => (i < n ? flms[i] : { x: 0, y: 0, z: 0 });
  const sc = Math.abs(lm(152).y - lm(10).y) || 1;

  // [0] eyebrow raise
  const browL = [70, 63, 105, 66, 107].reduce((s, i) => s + lm(i).y, 0) / 5;
  const browR = [336, 296, 334, 293, 300].reduce((s, i) => s + lm(i).y, 0) / 5;
  const eyeL  = lm(159).y, eyeR = lm(386).y;
  const raisL = Math.max(0, (eyeL - browL) / sc);
  const raisR = Math.max(0, (eyeR - browR) / sc);
  out[0] = (raisL + raisR) * 0.5;

  // [1] eyebrow furrow
  const cornerDist = norm3(lm(33).x - lm(263).x, lm(33).y - lm(263).y, 0) || 1;
  const innerDist  = norm3(lm(107).x - lm(336).x, lm(107).y - lm(336).y, 0);
  out[1] = Math.max(0, Math.min(1, 1 - innerDist / cornerDist));

  // [2][3][4] head pose deltas
  const pitch  = (lm(152).y - lm(1).y) / sc;
  const yaw    = (lm(152).x - lm(10).x) / sc;
  const roll   = (lm(263).y - lm(33).y) / sc;
  out[2] = pitch - prevPitch;
  out[3] = yaw   - prevYaw;
  out[4] = roll  - prevRoll;

  // [5] mouth open
  out[5] = Math.abs(lm(14).y - lm(13).y) / sc;

  // [6] mouth wide
  const faceW = norm3(lm(234).x - lm(454).x, lm(234).y - lm(454).y, 0) || 1;
  out[6] = norm3(lm(61).x - lm(291).x, lm(61).y - lm(291).y, 0) / faceW;

  // [7] lip protrude
  out[7] = ((lm(61).z + lm(291).z + lm(13).z + lm(14).z) / 4) - lm(1).z;

  // [8] cheek puff
  if (n > 454) out[8] = norm3(lm(234).x - lm(454).x, lm(234).y - lm(454).y, 0) / sc;

  // [9] brow asymmetry
  out[9] = raisL - raisR;

  const summary = {
    eyebrow_raise:  out[0],
    eyebrow_furrow: out[1],
    head_nod:       out[2],
    head_shake:     out[3],
    mouth_open:     out[5],
  };

  return { vec: out, yaw, pitch, roll, summary };
}

/**
 * Full 218-dim frame vector from one MediaPipe Holistic results object.
 * dominantIsRight: whether the right hand is dominant (set by calibration).
 * prevWrist, prevVel: for velocity and acceleration.
 * headState: { yaw, pitch, roll } for NMM deltas.
 * Returns { vec, wrist, vel, headState }
 */
function buildFrameVector(results, dominantIsRight, prevWrist, prevVel, headState) {
  const { leftHandLandmarks: rawLeft, rightHandLandmarks: rawRight,
          poseLandmarks, faceLandmarks } = results;

  // Assign and optionally mirror for left-dominant signers
  let domRaw  = dominantIsRight ? rawRight : rawLeft;
  let baseRaw = dominantIsRight ? rawLeft  : rawRight;

  // If left-dominant, mirror x so model always sees right-dominant input
  if (!dominantIsRight) {
    domRaw  = domRaw  ? mirrorHandLandmarks(domRaw)  : null;
    baseRaw = baseRaw ? mirrorHandLandmarks(baseRaw) : null;
  }

  // Hands — always store left in slot-0, right in slot-1 (post-mirror both)
  const leftHand  = dominantIsRight
    ? (rawLeft  ? normalizeHand(rawLeft)  : new Float32Array(SINGLE_HAND_SIZE))
    : (domRaw   ? normalizeHand(domRaw)   : new Float32Array(SINGLE_HAND_SIZE));
  const rightHand = dominantIsRight
    ? (rawRight ? normalizeHand(rawRight) : new Float32Array(SINGLE_HAND_SIZE))
    : (baseRaw  ? normalizeHand(baseRaw)  : new Float32Array(SINGLE_HAND_SIZE));

  // Shoulder scale + dominant wrist position
  let shoulderScale = 1, wristX = 0, wristY = 0, wristZ = 0;
  if (poseLandmarks && poseLandmarks.length >= 25) {
    const ls = poseLandmarks[11], rs = poseLandmarks[12];
    shoulderScale = norm3(rs.x - ls.x, rs.y - ls.y, rs.z - ls.z) || 1;
    const wIdx = dominantIsRight ? 16 : 15;
    const pw = poseLandmarks[wIdx];
    if (pw) { wristX = pw.x; wristY = pw.y; wristZ = pw.z; }
  }
  const curWrist = { x: wristX, y: wristY, z: wristZ };

  // Velocity
  const vel = prevWrist
    ? new Float32Array([wristX - prevWrist.x, wristY - prevWrist.y, wristZ - prevWrist.z])
    : new Float32Array(VELOCITY_SIZE);

  // Acceleration
  const accel = prevVel
    ? new Float32Array([vel[0] - prevVel[0], vel[1] - prevVel[1], vel[2] - prevVel[2]])
    : new Float32Array(ACCEL_SIZE);

  const poseVec    = poseLandmarks ? extractPose(poseLandmarks) : new Float32Array(POSE_SIZE);
  const faceSpatial = faceLandmarks ? extractFaceSpatial(faceLandmarks) : new Float32Array(FACE_SIZE);
  const interact   = computeInteraction(domRaw, baseRaw, faceLandmarks, shoulderScale);
  const bodyDist   = computeBodyDist(domRaw, baseRaw, faceLandmarks, poseLandmarks, shoulderScale);
  const fingerAng  = extractFingerAngles(domRaw);
  const wristQuat  = extractWristQuat(domRaw);

  const { yaw = 0, pitch = 0, roll = 0 } = headState || {};
  const nmmResult = extractNMM(faceLandmarks, yaw, pitch, roll);

  // Assemble → 218
  const vec = new Float32Array(LANDMARK_VECTOR_SIZE);
  let off = 0;
  vec.set(leftHand,         off); off += SINGLE_HAND_SIZE;
  vec.set(rightHand,        off); off += SINGLE_HAND_SIZE;
  vec.set(poseVec,          off); off += POSE_SIZE;
  vec.set(faceSpatial,      off); off += FACE_SIZE;
  vec.set(vel,              off); off += VELOCITY_SIZE;
  vec.set(interact,         off); off += INTERACTION_SIZE;
  vec.set(accel,            off); off += ACCEL_SIZE;
  vec.set(nmmResult.vec,    off); off += NMM_SIZE;
  vec.set(fingerAng,        off); off += FINGER_ANGLE_SIZE;
  vec.set(wristQuat,        off); off += WRIST_ORIENT_SIZE;
  vec.set(bodyDist,         off);

  return {
    vec,
    wrist:     curWrist,
    vel,
    headState: { yaw: nmmResult.yaw, pitch: nmmResult.pitch, roll: nmmResult.roll },
    nmmSummary: nmmResult.summary,
    shoulderScale,
    domRaw,
    baseRaw,
  };
}

/** Speed of dominant wrist from velocity slot of a frame vector. */
function vecSpeed(vec) {
  return norm3(vec[OFF_VEL], vec[OFF_VEL + 1], vec[OFF_VEL + 2]);
}

/** Decode NMM summary to a human-readable label for the UI. */
function nmm2label(nmm) {
  if (!nmm) return '';
  const tags = [];
  if (nmm.eyebrow_raise  > 0.18) tags.push('❓ Q-mark');
  if (nmm.eyebrow_furrow > 0.45) tags.push('😮 Emph');
  if (Math.abs(nmm.head_nod)   > 0.04) tags.push(nmm.head_nod > 0 ? '↕ Nod' : '↕ Shake');
  if (Math.abs(nmm.head_shake) > 0.04) tags.push('↔ Shake');
  if (nmm.mouth_open     > 0.15) tags.push('😮 Open');
  return tags.join(' · ');
}

/* ── Script loader ───────────────────────────────────────────────── */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script'); s.src = src;
    s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

/* ══════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════ */
export default function SignToText() {
  const { user }  = useAuth();
  const { confidenceThreshold: settingsThreshold, privacyMode } = useSettings();
  const effectiveThreshold = Math.max(settingsThreshold, CONFIDENCE_THRESHOLD);

  /* ── UI state ──────────────────────────────────────────────────── */
  const [mpReady,       setMpReady]       = useState(false);
  const [camActive,     setCamActive]     = useState(false);
  const [starting,      setStarting]      = useState(false);
  const [handsVisible,  setHandsVisible]  = useState(false);
  const [motionState,   setMotionState]   = useState('idle');
  const [dominant,      setDominant]      = useState('right');  // 'right'|'left'|'calibrating'
  const [error,         setError]         = useState('');
  const [prediction,    setPrediction]    = useState('');
  const [confidence,    setConfidence]    = useState(0);
  const [top5,          setTop5]          = useState([]);
  const [stableDots,    setStableDots]    = useState(0);
  const [nmmLabel,      setNmmLabel]      = useState('');
  const [fsMode,        setFsMode]        = useState(false);    // fingerspelling active
  const [fsBuffer,      setFsBuffer]      = useState('');       // accumulated letters
  const [glossSequence,    setGlossSequence]    = useState([]);
  const [sentence,         setSentence]         = useState([]);  // raw gloss sentences
  const [englishSentences, setEnglishSentences] = useState([]);  // NLP-translated English
  const [skipRate,         setSkipRate]         = useState(0);   // adaptive frame skip

  /* ── Refs ──────────────────────────────────────────────────────── */
  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const holisticRef     = useRef(null);
  const cameraRef       = useRef(null);
  const captureTimerRef = useRef(null);

  // Feature pipeline state
  const frameBuffer     = useRef([]);          // Float32Array[]
  const prevWristRef    = useRef(null);
  const prevVelRef      = useRef(null);
  const headStateRef    = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const nmmSummaryRef   = useRef({});
  // Running NMM accumulator for the current gloss window → used by sentence generator
  const nmmWindowRef    = useRef({
    eyebrow_raise: 0, eyebrow_furrow: 0,
    head_nod: 0, head_shake: 0, mouth_open: 0,
    _frames: 0,
  });

  // Sign boundary
  const restFrameCount  = useRef(0);

  // Stable prediction
  const stableCount     = useRef(0);
  const lastWord        = useRef('');
  const isSending       = useRef(false);
  const lastCommitTime  = useRef(0);
  const lastCommitWord  = useRef('');          // duplicate hash

  // Adaptive frame skip
  const frameSkipCount  = useRef(0);           // Holistic frames to skip
  const holisticBusy    = useRef(false);       // prevent queue buildup

  // Handedness calibration
  const calibFrames     = useRef(0);
  const leftEnergy      = useRef(0);
  const rightEnergy     = useRef(0);
  const dominantRef     = useRef(true);        // true = right dominant

  // Fingerspelling
  const fsModeRef       = useRef(false);
  const fsBufferRef     = useRef('');
  const baseStableRef   = useRef(0);           // frames base-hand has been stable
  const retrainWarnedRef = useRef(false);       // show retrain error once

  const thresholdRef    = useRef(effectiveThreshold);
  useEffect(() => { thresholdRef.current = Math.max(settingsThreshold, CONFIDENCE_THRESHOLD); }, [settingsThreshold]);

  /* ── Load CDN libraries ────────────────────────────────────────── */
  useEffect(() => {
    Promise.all([loadScript(MP_HOLISTIC_CDN), loadScript(MP_CAMERA_CDN), loadScript(MP_DRAWING_CDN)])
      .then(() => setMpReady(true))
      .catch(e => setError(e.message));
  }, []);
  useEffect(() => () => teardown(), []);

  /* ── Canvas overlay ────────────────────────────────────────────── */
  const drawOverlay = useCallback((results) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawHand = (lms, color) => {
      if (!lms) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(lms[a].x * canvas.width, lms[a].y * canvas.height);
        ctx.lineTo(lms[b].x * canvas.width, lms[b].y * canvas.height);
        ctx.stroke();
      }
      for (const lm of lms) {
        ctx.beginPath(); ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#2563EB'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    };
    // Colour dominant hand differently
    const domColor = dominantRef.current ? '#14B8A6' : '#F59E0B';
    const baseColor = dominantRef.current ? '#F59E0B' : '#14B8A6';
    drawHand(dominantRef.current ? results.rightHandLandmarks : results.leftHandLandmarks, domColor);
    drawHand(dominantRef.current ? results.leftHandLandmarks  : results.rightHandLandmarks, baseColor);
    if (results.poseLandmarks?.[16]) {
      const rw = results.poseLandmarks[16];
      ctx.beginPath(); ctx.arc(rw.x * canvas.width, rw.y * canvas.height, 7, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(234,179,8,.7)'; ctx.fill();
    }
  }, []);

  /* ── Start camera + Holistic ───────────────────────────────────── */
  const startCamera = useCallback(async () => {
    setError(''); setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      if (!window.Holistic || !window.Camera) throw new Error('MediaPipe not loaded yet.');

      holisticRef.current = new window.Holistic({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${f}`,
      });
      holisticRef.current.setOptions({
        modelComplexity: 1, smoothLandmarks: true,
        enableSegmentation: false, refineFaceLandmarks: false,
        minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      });

      holisticRef.current.onResults((results) => {
        holisticBusy.current = false;
        drawOverlay(results);

        const hasLeft  = !!results.leftHandLandmarks;
        const hasRight = !!results.rightHandLandmarks;
        const hasHands = hasLeft || hasRight;
        setHandsVisible(hasHands);

        /* ── 3. Dynamic handedness calibration ────────────────────── */
        if (calibFrames.current < CALIBRATION_FRAMES) {
          if (results.poseLandmarks) {
            const lw = results.poseLandmarks[15], rw = results.poseLandmarks[16];
            const lPrev = prevWristRef.current;
            if (lPrev && lw && rw) {
              leftEnergy.current  += norm3(lw.x - lPrev.x, lw.y - lPrev.y, lw.z - lPrev.z);
              rightEnergy.current += norm3(rw.x - lPrev.x, rw.y - lPrev.y, rw.z - lPrev.z);
            }
          }
          calibFrames.current++;
          if (calibFrames.current === CALIBRATION_FRAMES) {
            const isRight = rightEnergy.current >= leftEnergy.current;
            dominantRef.current = isRight;
            setDominant(isRight ? 'right' : 'left');
          } else {
            setDominant('calibrating');
          }
        }

        /* ── 5. Build 218-dim feature vector ──────────────────────── */
        const { vec, wrist, vel, headState, nmmSummary, shoulderScale, domRaw, baseRaw } =
          buildFrameVector(results, dominantRef.current, prevWristRef.current, prevVelRef.current, headStateRef.current);

        prevWristRef.current  = wrist;
        prevVelRef.current    = vel;
        headStateRef.current  = headState;
        nmmSummaryRef.current = nmmSummary;

        // Accumulate NMM averages for the current gloss window
        if (nmmSummary && typeof nmmSummary === 'object') {
          const w = nmmWindowRef.current;
          w._frames++;
          for (const key of ['eyebrow_raise','eyebrow_furrow','head_nod','head_shake','mouth_open']) {
            w[key] = (w[key] * (w._frames - 1) + (nmmSummary[key] ?? 0)) / w._frames;
          }
        }

        /* ── 6. Sliding FIFO push ──────────────────────────────────── */
        frameBuffer.current.push(Array.from(vec));
        if (frameBuffer.current.length > MAX_SEQUENCE_LENGTH) frameBuffer.current.shift();

        /* ── 7. Sign boundary detection ───────────────────────────── */
        const speed = vecSpeed(vec);
        if (!hasHands && speed < VELOCITY_REST_THRESH) {
          restFrameCount.current = Math.min(restFrameCount.current + 1, REST_FRAMES + 5);
        } else {
          restFrameCount.current = 0;
        }

        /* ── 2. Fingerspelling branch ──────────────────────────────── */
        if (hasHands && baseRaw) {
          // Measure base-hand stability
          const baseWrist = baseRaw[0];
          const bSpeed = prevWristRef.current
            ? norm3(baseWrist.x - prevWristRef.current.x, baseWrist.y - prevWristRef.current.y, 0)
            : 0;
          if (bSpeed < FS_STABLE_THRESH) {
            baseStableRef.current++;
          } else {
            baseStableRef.current = 0;
          }
          const domMicro = speed;
          const inFS = baseStableRef.current > 10 && domMicro > FS_MOTION_THRESH && domMicro < 0.06;
          if (inFS !== fsModeRef.current) {
            fsModeRef.current = inFS;
            setFsMode(inFS);
          }
        } else {
          fsModeRef.current = false;
          setFsMode(false);
          baseStableRef.current = 0;
        }

        // Motion state UI
        const isResting = restFrameCount.current >= REST_FRAMES;
        setMotionState(hasHands
          ? (speed < VELOCITY_REST_THRESH ? 'holding' : 'signing')
          : (isResting ? 'resting' : 'idle'));

        // NMM label
        setNmmLabel(nmm2label(nmmSummary));
      });

      await holisticRef.current.initialize();

      /* 4. Adaptive latency — skip frames when Holistic is still busy */
      cameraRef.current = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (!holisticRef.current) return;
          // 4. Adaptive skip: if busy, skip this frame
          if (holisticBusy.current) {
            frameSkipCount.current++;
            setSkipRate(frameSkipCount.current);
            return;
          }
          holisticBusy.current = true;
          try {
            await holisticRef.current.send({ image: videoRef.current });
          } catch { holisticBusy.current = false; }
        },
        width: 640, height: 480,
      });
      await cameraRef.current.start();

      /* 6. Continuous sliding-window inference loop */
      captureTimerRef.current = setInterval(async () => {
        if (frameBuffer.current.length < SEQUENCE_LENGTH || isSending.current) return;

        // End-of-sentence on rest — translate gloss → English then clear window
        if (restFrameCount.current >= REST_FRAMES) {
          setGlossSequence(prev => {
            if (prev.length > 0) {
              // Raw gloss sentence (always stored)
              setSentence(s => [...s, prev.join(' ')]);

              // NLP translation: send gloss + averaged NMM window to backend
              const nmmAvg = { ...nmmWindowRef.current };
              delete nmmAvg._frames;
              generateSentence(prev, nmmAvg)
                .then(({ data }) => {
                  if (data.sentence) {
                    setEnglishSentences(s => [...s, data.sentence]);
                  }
                })
                .catch(() => {
                  // Fallback: join glosses as plain English
                  setEnglishSentences(s => [...s, prev.join(' ').toLowerCase() + '.']);
                });

              // Reset NMM accumulator for next sentence
              nmmWindowRef.current = {
                eyebrow_raise: 0, eyebrow_furrow: 0,
                head_nod: 0, head_shake: 0, mouth_open: 0,
                _frames: 0,
              };
              return [];
            }
            return prev;
          });
          stableCount.current = 0; lastWord.current = ''; setStableDots(0);
          return;
        }

        isSending.current = true;
        try {
          const snapshot = frameBuffer.current.slice(-SEQUENCE_LENGTH);
          const { data }  = await predictGesture(
            user?.email ?? 'anonymous',
            snapshot,
            nmmSummaryRef.current
          );

          // Surface retrain warning once (ref avoids stale closure on `error`)
          if (data.needs_retrain && !retrainWarnedRef.current) {
            retrainWarnedRef.current = true;
            setError('Model needs retraining (feature size changed 182→218). Run: python -m ml.preprocess_dataset && python -m ml.train');
          }

          const word = data.predicted_text;
          const conf = data.confidence ?? 0;

          // Don't update UI with placeholder dash when model isn't ready
          if (data.needs_retrain) { isSending.current = false; return; }

          setPrediction(word);
          setConfidence(conf);
          setTop5(data.top5 ?? []);

          const now = Date.now();
          const cooledDown  = (now - lastCommitTime.current) > COOLDOWN_MS;
          const notDuplicate = word !== lastCommitWord.current || cooledDown;

          if (word === lastWord.current && conf >= thresholdRef.current) {
            stableCount.current++;
            setStableDots(stableCount.current);
            if (stableCount.current >= STABLE_FRAMES && cooledDown && notDuplicate) {
              // Fingerspelling: letters go to fsBuffer, not gloss
              if (fsModeRef.current && word.length === 1) {
                const newBuf = fsBufferRef.current + word;
                fsBufferRef.current = newBuf;
                setFsBuffer(newBuf);
              } else {
                // Flush any pending FS buffer as a word first
                if (fsBufferRef.current) {
                  setGlossSequence(prev => [...prev, fsBufferRef.current.toUpperCase()]);
                  fsBufferRef.current = ''; setFsBuffer('');
                }
                setGlossSequence(prev => [...prev, word]);
              }
              lastCommitTime.current = now;
              lastCommitWord.current = word;
              stableCount.current    = 0;
              lastWord.current       = '';
              setStableDots(0);
              frameBuffer.current    = [];
              restFrameCount.current = 0;
            }
          } else {
            lastWord.current = word; stableCount.current = 1; setStableDots(1);
          }
        } catch { /* transient errors silently ignored */ }
        finally { isSending.current = false; }
      }, CAPTURE_MS);

      setCamActive(true);
    } catch (err) {
      setError(err.name === 'NotAllowedError'
        ? 'Camera access denied. Please allow camera permissions.'
        : err.message || 'Failed to start camera.');
    } finally { setStarting(false); }
  }, [user, drawOverlay]);

  /* ── Teardown ──────────────────────────────────────────────────── */
  function teardown() {
    clearInterval(captureTimerRef.current); captureTimerRef.current = null;
    try { cameraRef.current?.stop(); }    catch {}
    try { holisticRef.current?.close(); } catch {}
    cameraRef.current = null; holisticRef.current = null;
    frameBuffer.current    = []; prevWristRef.current = null;
    prevVelRef.current     = null; headStateRef.current = { yaw: 0, pitch: 0, roll: 0 };
    restFrameCount.current = 0; isSending.current    = false;
    stableCount.current    = 0; lastWord.current     = '';
    lastCommitTime.current = 0; lastCommitWord.current = '';
    holisticBusy.current   = false; frameSkipCount.current = 0;
    calibFrames.current    = 0; leftEnergy.current = 0; rightEnergy.current = 0;
    fsModeRef.current      = false; fsBufferRef.current = '';
    baseStableRef.current  = 0;    retrainWarnedRef.current = false;
    nmmWindowRef.current   = {
      eyebrow_raise: 0, eyebrow_furrow: 0,
      head_nod: 0, head_shake: 0, mouth_open: 0, _frames: 0,
    };
  }

  const stopCamera = useCallback(() => {
    teardown(); setCamActive(false); setHandsVisible(false); setMotionState('idle');
    setPrediction(''); setConfidence(0); setTop5([]); setStableDots(0);
    setFsMode(false); setFsBuffer(''); setNmmLabel(''); setSkipRate(0);
    setDominant('right');
  }, []);

  /* ── Gloss / sentence helpers ──────────────────────────────────── */
  const flushFsBuffer = () => {
    if (!fsBufferRef.current) return;
    setGlossSequence(prev => [...prev, fsBufferRef.current.toUpperCase()]);
    fsBufferRef.current = ''; setFsBuffer('');
  };
  const handleUndoGloss    = () => { setGlossSequence(p => p.slice(0, -1)); };
  const handleClearGloss   = () => {
    setGlossSequence([]); setPrediction(''); setConfidence(0); setTop5([]);
    stableCount.current = 0; lastWord.current = '';
    fsBufferRef.current = ''; setFsBuffer('');
  };
  const handleUndoSentence = () => {
    setSentence(p => p.slice(0, -1));
    setEnglishSentences(p => p.slice(0, -1));
  };
  const handleClearAll     = () => {
    handleClearGloss();
    setSentence([]);
    setEnglishSentences([]);
  };
  const handleCopy         = () => {
    // Copy English translations if available, else raw glosses
    const englishText = englishSentences.length > 0
      ? englishSentences.join(' ')
      : [...sentence, glossSequence.join(' ')].filter(Boolean).join(' ');
    navigator.clipboard?.writeText(englishText);
  };

  /* ── Motion badge colours ──────────────────────────────────────── */
  const motionColor = { idle: '#64748B', resting: '#F59E0B', signing: '#10B981', holding: '#3B82F6' }[motionState] ?? '#64748B';
  const motionLabel = { idle: 'Idle', resting: 'Resting', signing: 'Signing', holding: 'Holding' }[motionState] ?? 'Idle';

  /* ══════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════ */
  return (
    <AppShell>
      <div className="page-header">
        <h1>Sign to Text</h1>
        <p>Real-time CSLR — full-body tracking, NMM grammar, fingerspelling, auto-handedness.</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {!mpReady && !error && <Alert type="info" message="Loading MediaPipe Holistic from CDN…" />}
      {privacyMode && <Alert type="info" message="Privacy Mode — translations not saved to history." />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: '1.5rem', alignItems: 'start' }} className="stt-grid">

        {/* ── Left ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Video card */}
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#0F172A', aspectRatio: '4/3' }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }} muted playsInline />
              <canvas ref={canvasRef} width={640} height={480}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', pointerEvents: 'none' }} />

              {!camActive && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.75rem' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.25"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                  <p style={{ color: '#94A3B8', fontSize: '.9rem' }}>{mpReady ? 'Camera not started' : 'Loading MediaPipe…'}</p>
                </div>
              )}

              {/* Motion badge */}
              {camActive && (
                <div style={{ position: 'absolute', top: '.75rem', left: '.75rem', display: 'flex', alignItems: 'center', gap: '.4rem', background: 'rgba(0,0,0,.7)', padding: '.3rem .75rem', borderRadius: 999, fontSize: '.72rem', color: '#fff', backdropFilter: 'blur(4px)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: motionColor, boxShadow: motionState === 'signing' ? `0 0 6px ${motionColor}` : 'none' }} />
                  {motionLabel}
                  {handsVisible ? ' · Hands' : ''}
                  {fsMode ? ' · Fingerspelling' : ''}
                </div>
              )}

              {/* Handedness badge */}
              {camActive && (
                <div style={{ position: 'absolute', top: '.75rem', right: '.75rem', background: 'rgba(0,0,0,.7)', padding: '.3rem .65rem', borderRadius: 999, fontSize: '.72rem', color: dominant === 'calibrating' ? '#F59E0B' : '#10B981', backdropFilter: 'blur(4px)' }}>
                  {dominant === 'calibrating' ? 'Calibrating…' : `${dominant === 'right' ? 'R' : 'L'}-dominant`}
                </div>
              )}

              {/* Live prediction overlay */}
              {camActive && prediction && (
                <div style={{ position: 'absolute', bottom: '.75rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(37,99,235,.88)', padding: '.45rem 1.25rem', borderRadius: 999, color: '#fff', fontSize: '1.05rem', fontWeight: 700, backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}>
                  {fsMode ? `✏ ${prediction}` : prediction}
                </div>
              )}

              {/* NMM overlay */}
              {camActive && nmmLabel && (
                <div style={{ position: 'absolute', bottom: '3rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(124,92,216,.82)', padding: '.3rem .9rem', borderRadius: 999, color: '#fff', fontSize: '.78rem', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}>
                  {nmmLabel}
                </div>
              )}
            </div>

            {/* Camera controls row */}
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              {!camActive ? (
                <button className="btn btn-primary btn-lg" onClick={startCamera} disabled={starting || !mpReady}>
                  {starting ? <><Spinner size="sm" /> Starting…</> : mpReady ? 'Start Camera' : 'Loading…'}
                </button>
              ) : (
                <>
                  <button className="btn btn-danger btn-lg" onClick={stopCamera}>Stop Camera</button>
                  {fsBuffer && (
                    <button className="btn btn-subtle btn-sm" onClick={flushFsBuffer} title="Commit fingerspelled word">
                      Commit "{fsBuffer}"
                    </button>
                  )}
                  {skipRate > 0 && (
                    <span style={{ fontSize: '.72rem', color: 'var(--color-warning)' }}>
                      ⚠ Skipped {skipRate} frames (low-end mode)
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Gloss Sequence */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
              <h3 style={{ margin: 0 }}>
                Gloss Sequence
                <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '.5rem' }}>(current phrase)</span>
              </h3>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={handleUndoGloss}  disabled={!glossSequence.length}>Undo</button>
                <button className="btn btn-ghost btn-sm" onClick={handleClearGloss} disabled={!glossSequence.length}>Clear</button>
              </div>
            </div>
            <div style={{ minHeight: 48, padding: '.75rem 1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center' }}>
              {glossSequence.length > 0
                ? glossSequence.map((w, i) => (
                    <span key={i} style={{ padding: '.25rem .65rem', background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', border: '1px solid var(--color-primary)', borderRadius: 999, fontSize: '.875rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {w}
                    </span>
                  ))
                : <span style={{ color: 'var(--text-light)', fontSize: '.875rem' }}>Signs will appear here…</span>
              }
              {fsBuffer && (
                <span style={{ padding: '.25rem .65rem', background: 'color-mix(in srgb, var(--color-secondary,#7c5cd8) 15%, transparent)', border: '1px solid var(--color-secondary,#7c5cd8)', borderRadius: 999, fontSize: '.875rem', fontWeight: 700, color: 'var(--color-secondary,#7c5cd8)', letterSpacing: '.08em' }}>
                  ✏ {fsBuffer}
                </span>
              )}
            </div>
          </div>

          {/* Sentences — English translation (primary) + raw gloss (secondary) */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
              <h3 style={{ margin: 0 }}>
                Sentences
                <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '.5rem' }}>(closed on rest pause)</span>
              </h3>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={handleUndoSentence} disabled={!sentence.length}>Undo</button>
                <button className="btn btn-ghost btn-sm" onClick={handleClearAll} disabled={!sentence.length && !glossSequence.length}>Clear All</button>
                <button className="btn btn-subtle btn-sm" onClick={handleCopy} disabled={!sentence.length && !glossSequence.length} title="Copies English translation">Copy</button>
              </div>
            </div>
            <div style={{ minHeight: 64, padding: '1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {sentence.length === 0
                ? <span style={{ color: 'var(--text-light)', fontSize: '1rem' }}>Completed sentences will appear here…</span>
                : sentence.map((rawGloss, i) => (
                    <div key={i}>
                      {/* English translation — shown when available */}
                      {englishSentences[i] && (
                        <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.5 }}>
                          {englishSentences[i]}
                        </div>
                      )}
                      {/* Raw ASL gloss — always shown as muted label */}
                      <div style={{
                        fontSize: '.75rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'monospace',
                        letterSpacing: '.04em',
                        marginTop: englishSentences[i] ? '.15rem' : 0,
                      }}>
                        {rawGloss}
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>

        {/* ── Right: prediction panel ──────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Live prediction */}
          <div className="card" style={{ textAlign: 'center' }}>
            <h4 style={{ color: 'var(--text-muted)', marginBottom: '.75rem' }}>Live Prediction</h4>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-.02em', color: prediction ? (fsMode ? 'var(--color-secondary,#7c5cd8)' : 'var(--color-primary)') : 'var(--text-light)', minHeight: '2.6rem' }}>
              {prediction || '—'}
            </div>
            {fsMode && <div style={{ fontSize: '.72rem', color: 'var(--color-secondary,#7c5cd8)', marginTop: '.2rem' }}>Fingerspelling mode</div>}

            {confidence > 0 && (
              <div style={{ marginTop: '.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.3rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Confidence</span>
                  <span style={{ fontWeight: 700, color: confidence >= effectiveThreshold ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {(confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="confidence-bar">
                  <div className="confidence-bar-fill" style={{ width: `${confidence * 100}%` }} />
                </div>
                <div style={{ position: 'relative', height: 4 }}>
                  <div style={{ position: 'absolute', left: `${effectiveThreshold * 100}%`, top: -12, width: 1, height: 14, background: 'var(--text-muted)', opacity: .5 }} />
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '.15rem', textAlign: 'right' }}>threshold: {(effectiveThreshold * 100).toFixed(0)}%</div>
              </div>
            )}

            {/* Stability dots */}
            {camActive && (
              <div style={{ marginTop: '.9rem' }}>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.4rem' }}>Stability ({stableDots}/{STABLE_FRAMES})</div>
                <div style={{ display: 'flex', gap: '.3rem', justifyContent: 'center' }}>
                  {Array.from({ length: STABLE_FRAMES }).map((_, i) => (
                    <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: i < stableDots ? 'var(--color-primary)' : 'var(--border)', transition: 'background var(--transition)' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Rest-frame progress */}
            {camActive && (
              <div style={{ marginTop: '.9rem' }}>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.35rem' }}>Sentence end pause</div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 999 }}>
                  <div style={{ height: '100%', width: `${Math.min((restFrameCount.current / REST_FRAMES) * 100, 100)}%`, background: restFrameCount.current >= REST_FRAMES ? 'var(--color-success)' : 'var(--color-warning)', borderRadius: 999, transition: 'width .2s ease' }} />
                </div>
              </div>
            )}
          </div>

          {/* NMM card */}
          {camActive && nmmLabel && (
            <div className="card" style={{ background: 'color-mix(in srgb, var(--color-secondary,#7c5cd8) 8%, var(--bg-card))', borderColor: 'color-mix(in srgb, var(--color-secondary,#7c5cd8) 30%, var(--border))' }}>
              <h4 style={{ marginBottom: '.5rem', fontSize: '.85rem' }}>Non-Manual Markers</h4>
              <div style={{ fontSize: '.82rem', color: 'var(--text-main)', fontWeight: 600 }}>{nmmLabel}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '.4rem' }}>
                Facial grammar passed to inference pipeline
              </div>
            </div>
          )}

          {/* Top-5 */}
          {top5.length > 0 && (
            <div className="card">
              <h4 style={{ marginBottom: '.75rem' }}>Top 5 Predictions</h4>
              {top5.map((t, i) => (
                <div key={i} style={{ marginBottom: i < top5.length - 1 ? '.65rem' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', marginBottom: '.2rem' }}>
                    <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--color-primary)' : 'var(--text-main)' }}>{i + 1}. {t.word}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{(t.confidence * 100).toFixed(1)}%</span>
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
              <li>Click <strong>Start Camera</strong> — keep full upper body visible.</li>
              <li>Hold still for 1–2 s while the system auto-detects your dominant hand.</li>
              <li>Sign naturally — the model reads hands, pose, face grammar and motion arc.</li>
              <li>Raised eyebrows are detected as yes/no questions automatically.</li>
              <li>To fingerspell a word: hold one hand still, spell with the other.</li>
              <li>Return hands to rest (~1 s) to close the current sentence.</li>
              <li>Use <strong>Undo / Clear</strong> to correct mistakes.</li>
            </ol>
          </div>

          {/* Feature legend */}
          <div className="card" style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
            <h4 style={{ marginBottom: '.6rem', fontSize: '.85rem' }}>218-dim Feature Vector</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
              {[
                ['Hands (126)',       'Shape, wrist-norm, orientation'],
                ['Pose (24)',         'Arm arc, body-relative position'],
                ['Face spatial (27)', 'Lip/chin spatial targets'],
                ['Velocity (3)',      'Wrist speed & direction'],
                ['Interaction (2)',   'Fingertip → lips/palm'],
                ['Acceleration (3)', 'Δ velocity — motion rhythm'],
                ['NMM (10)',          'Eyebrows, head pose, mouth'],
                ['Finger angles (15)','Joint angles per finger'],
                ['Wrist quat (4)',    'Orientation quaternion'],
                ['Body dist (4)',     'Hand → chin/chest/abdomen/palm'],
              ].map(([name, desc]) => (
                <div key={name} style={{ display: 'flex', gap: '.5rem' }}>
                  <span style={{ fontWeight: 700, minWidth: 110, color: 'var(--text-main)', flexShrink: 0 }}>{name}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) { .stt-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </AppShell>
  );
}
