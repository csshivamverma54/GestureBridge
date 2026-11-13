import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { createAnatomicalHandRig, setFlatOpenHandshape, disposeHandRig } from './handGeometry';

/**
 * AslWelcomeStage — Interactive Three.js 3D ASL "WELCOME" (Greeting) Stage
 *
 * Verified Reference:
 *   StrongASL (strongasl.com/american-sign-language-dictionary/words/welcome) &
 *   SignASL (signasl.org/sign/welcome) — Greeting / reception meaning:
 *   1. Initial position: Flat open right hand in front of body, fingers sideways, palm up.
 *   2. Main movement: Smooth inward sweep toward the signer until pinkie side contacts midsection.
 *   3. Final hold: Dignified hold at midsection with clean replay/pause/scrub control.
 */

const DURATION_MS = 3600;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Compute exact anatomical basis quaternion for ASL:
// Local +Y (fingers) -> sideways to left (-X) and slightly up (+Y)
// Local +Z (palm)    -> facing upward (+Y) and tilted toward camera (+Z)
// Local +X (pinkie)  -> toward torso midsection (-Z)
function createAslBasisQuat() {
  const fingers = new THREE.Vector3(-0.92, 0.22, 0.32).normalize();
  const palm = new THREE.Vector3(0.30, 0.92, 0.24).normalize();
  const xVec = new THREE.Vector3().crossVectors(fingers, palm).normalize();
  const zVec = new THREE.Vector3().crossVectors(xVec, fingers).normalize();
  const m = new THREE.Matrix4().makeBasis(xVec, fingers, zVec);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

const BASE_HAND_QUAT = createAslBasisQuat();

function applyAslWelcomeFrame(rig, torsoHalo, t) {
  // Phase 1: 0.00 - 0.18 (initial position hold)
  // Phase 2: 0.18 - 0.72 (smooth inward sweep toward torso midsection)
  // Phase 3: 0.72 - 1.00 (final pose hold at midsection)
  let moveP = 0;
  if (t > 0.18 && t <= 0.72) {
    moveP = easeInOutCubic((t - 0.18) / 0.54);
  } else if (t > 0.72) {
    moveP = 1;
  }

  // Gentle inward arc from front (+Z) toward torso midsection (-Z)
  const arcLift = Math.sin(moveP * Math.PI) * 0.08;
  const posX = THREE.MathUtils.lerp(0.58, 0.12, moveP);
  const posY = THREE.MathUtils.lerp(0.04, 0.00, moveP) - arcLift * 0.25;
  const posZ = THREE.MathUtils.lerp(0.75, -0.36, moveP);

  rig.root.position.set(posX, posY, posZ);

  // Natural wrist orientation during the inviting sweep
  const rollAngle = THREE.MathUtils.lerp(-0.12, 0.05, moveP);
  const yawAngle = THREE.MathUtils.lerp(0.18, -0.06, moveP);
  const pitchAngle = THREE.MathUtils.lerp(0.10, 0.04, moveP);

  const deltaQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitchAngle, yawAngle, rollAngle, 'YXZ')
  );
  rig.root.quaternion.copy(BASE_HAND_QUAT).multiply(deltaQuat);

  // Gentle finger relaxation settling upon contact
  const curl = THREE.MathUtils.lerp(0.06, 0.04, moveP);
  setFlatOpenHandshape(rig, curl);

  // Subtle midsection highlight pulse when pinkie edge meets torso
  if (torsoHalo) {
    const contactGlow = moveP > 0.85 ? (moveP - 0.85) / 0.15 : 0;
    torsoHalo.material.opacity = 0.12 + contactGlow * 0.14;
  }
}

export default function AslWelcomeStage({ mode }) {
  const mountRef = useRef(null);
  const progressRef = useRef(0);
  const playingRef = useRef(true);
  const lastTimeRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('Initial Position (Palm Up)');
  const [webglError, setWebglError] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const applyRM = (matches) => {
      setReducedMotion(matches);
      if (matches) {
        playingRef.current = false;
        setIsPlaying(false);
        progressRef.current = 0.82;
        setProgress(0.82);
        setPhaseLabel('Final Hold at Torso (Reduced Motion)');
      }
    };
    applyRM(mq.matches);
    const listener = (e) => applyRM(e.matches);
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);

  const handleReplay = useCallback(() => {
    progressRef.current = 0;
    lastTimeRef.current = null;
    playingRef.current = true;
    setProgress(0);
    setIsPlaying(true);
    setPhaseLabel('Initial Position (Palm Up)');
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      playingRef.current = next;
      if (next) {
        if (progressRef.current >= 0.99) progressRef.current = 0;
        lastTimeRef.current = null;
      }
      return next;
    });
  }, []);

  const handleScrub = useCallback((e) => {
    const val = parseFloat(e.target.value);
    progressRef.current = val;
    setProgress(val);
    lastTimeRef.current = null;
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer;
    let scene;
    let camera;
    let rig;
    let torsoMesh;
    let torsoHalo;
    let orbViolet;
    let orbBlue;
    let rafId = null;
    let resizeObs = null;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 440;
    const height = container.clientHeight || 360;
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);
    camera.position.set(1.15, 1.45, 2.75);
    camera.lookAt(-0.05, 0.04, 0.0);

    // Studio 3-point lighting tailored for dark mode + natural skin satin finish
    const ambient = new THREE.AmbientLight('#c7d2fe', 0.75);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight('#f5f3ff', '#1e1b4b', 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fff5eb', 2.2);
    keyLight.position.set(2.4, 3.8, 2.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#e0e7ff', 1.0);
    fillLight.position.set(-2.0, 2.0, 2.2);
    scene.add(fillLight);

    const violetRim = new THREE.DirectionalLight('#8b5cf6', 1.25);
    violetRim.position.set(-2.6, 1.6, -1.8);
    scene.add(violetRim);

    const blueRim = new THREE.DirectionalLight('#3b82f6', 0.95);
    blueRim.position.set(2.8, -0.4, -2.2);
    scene.add(blueRim);

    // Frosted torso/midsection spatial reference plane
    const torsoGeom = new THREE.CylinderGeometry(0.95, 1.05, 1.7, 32, 1, true, -Math.PI * 0.38, Math.PI * 0.76);
    const torsoMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#312e81'),
      transparent: true,
      opacity: 0.14,
      roughness: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    torsoMesh = new THREE.Mesh(torsoGeom, torsoMat);
    torsoMesh.position.set(-0.12, -0.15, -1.52);
    scene.add(torsoMesh);

    // Midsection contact halo ring
    const haloGeom = new THREE.RingGeometry(0.18, 0.34, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#818cf8'),
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    torsoHalo = new THREE.Mesh(haloGeom, haloMat);
    torsoHalo.position.set(0.05, -0.02, -0.58);
    scene.add(torsoHalo);

    // Minimal supporting accents
    const orbVioletMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#7c5cff'),
      roughness: 0.22,
      metalness: 0.05,
      clearcoat: 0.80,
      clearcoatRoughness: 0.15,
    });
    orbViolet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 20), orbVioletMat);
    orbViolet.position.set(-1.18, 0.78, -0.35);
    scene.add(orbViolet);

    const orbBlueMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#3b82f6'),
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.75,
    });
    orbBlue = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16), orbBlueMat);
    orbBlue.position.set(1.18, -0.55, 0.22);
    scene.add(orbBlue);

    // Articulated 3D hand rig (dominant right hand)
    rig = createAnatomicalHandRig({
      isLeft: false,
      skinColor: '#dfb29d',
      sheenColor: '#ffe1d4',
    });
    scene.add(rig.root);

    applyAslWelcomeFrame(rig, torsoHalo, progressRef.current);

    let lastPhase = '';
    const animate = (ts) => {
      rafId = requestAnimationFrame(animate);

      if (playingRef.current) {
        if (lastTimeRef.current == null) lastTimeRef.current = ts;
        const dt = Math.min(ts - lastTimeRef.current, 60);
        lastTimeRef.current = ts;

        progressRef.current += dt / DURATION_MS;
        if (progressRef.current >= 1) {
          progressRef.current = 0;
        }

        const p = progressRef.current;
        setProgress(p);

        const nextPhase =
          p < 0.18
            ? 'Initial Position (Palm Up)'
            : p <= 0.72
            ? 'Sweeping Toward Midsection'
            : 'Final Hold at Torso';
        if (nextPhase !== lastPhase) {
          lastPhase = nextPhase;
          setPhaseLabel(nextPhase);
        }
      } else {
        lastTimeRef.current = null;
      }

      applyAslWelcomeFrame(rig, torsoHalo, progressRef.current);

      if (!reducedMotion) {
        orbViolet.position.y = 0.78 + Math.sin(ts * 0.0014) * 0.04;
        orbBlue.position.y = -0.55 + Math.cos(ts * 0.0016) * 0.035;
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObs.observe(container);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObs?.disconnect();
      disposeHandRig(rig);
      torsoGeom.dispose();
      torsoMat.dispose();
      haloGeom.dispose();
      haloMat.dispose();
      orbViolet.geometry.dispose();
      orbVioletMat.dispose();
      orbBlue.geometry.dispose();
      orbBlueMat.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: '28px',
        background:
          'radial-gradient(ellipse at 55% 42%, rgba(124, 92, 255, 0.16) 0%, rgba(30, 27, 75, 0.28) 45%, rgba(21, 20, 33, 0.88) 100%)',
        border: '1px solid rgba(167, 139, 250, 0.22)',
        boxShadow: '0 24px 54px -12px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        padding: '1rem 1.15rem 1.1rem',
      }}
    >
      {/* Top Language Identification Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.6rem',
          flexWrap: 'wrap',
          marginBottom: '0.4rem',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <span
            className="badge badge-primary"
            style={{ fontSize: '0.68rem', padding: '0.24rem 0.65rem' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60A5FA' }} />
            {mode.code} — {mode.languageName}
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            One-Handed Sweep
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '0.82rem',
              letterSpacing: '0.14em',
              color: '#DDD6FE',
            }}
          >
            {mode.word}
          </span>
        </div>
      </div>

      {/* 3D WebGL Canvas Stage */}
      <div
        ref={mountRef}
        className="asl-canvas-mount"
        role="img"
        aria-label="3D animation of American Sign Language WELCOME: flat palm-up hand sweeping inward to contact midsection"
        style={{
          width: '100%',
          height: 'clamp(260px, 32vw, 360px)',
          position: 'relative',
          borderRadius: '20px',
          overflow: 'hidden',
        }}
      >
        {webglError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '1.5rem',
              color: '#C4B5FD',
              gap: '0.5rem',
            }}
          >
            <strong style={{ fontSize: '1rem', color: '#F5F3FF' }}>ASL — WELCOME</strong>
            <p style={{ fontSize: '0.84rem', maxWidth: 320, margin: 0, color: 'var(--text-muted)' }}>
              {mode.movementSummary}
            </p>
          </div>
        )}

        {/* Floating 3D Dimensional Wordmark Accent */}
        <div
          style={{
            position: 'absolute',
            top: '0.65rem',
            right: '0.85rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            background: 'rgba(30, 27, 75, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(167, 139, 250, 0.35)',
            boxShadow: '0 4px 14px -2px rgba(0, 0, 0, 0.45)',
            fontSize: '0.65rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: '#DDD6FE',
            pointerEvents: 'none',
          }}
        >
          STRONGASL VERIFIED
        </div>
      </div>

      {/* Interactive Animation Timeline & Controls */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: '0.65rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
        }}
      >
        {/* Progress Bar & Scrubbing Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={progress}
            onChange={handleScrub}
            aria-label="ASL WELCOME sign animation progress"
            style={{
              flex: 1,
              accentColor: '#8B5CF6',
              cursor: 'pointer',
              height: 4,
            }}
          />
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.70rem',
              color: 'var(--text-muted)',
              minWidth: '2.5rem',
              textAlign: 'right',
            }}
          >
            {Math.round(progress * 100)}%
          </span>
        </div>

        {/* Phase Indicator & Primary Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isPlaying ? '#10B981' : '#F59E0B',
              }}
            />
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#E0E7FF',
              }}
            >
              {phaseLabel}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              onClick={handleTogglePlay}
              className="btn btn-outline"
              style={{
                padding: '0.22rem 0.55rem',
                fontSize: '0.68rem',
                borderRadius: '8px',
                borderColor: 'rgba(255, 255, 255, 0.20)',
                color: '#E0E7FF',
              }}
              aria-label={isPlaying ? 'Pause ASL sign animation' : 'Play ASL sign animation'}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={handleReplay}
              className="btn btn-primary"
              style={{
                padding: '0.22rem 0.55rem',
                fontSize: '0.68rem',
                borderRadius: '8px',
              }}
              aria-label="Replay ASL sign animation from start"
            >
              Replay
            </button>
          </div>
        </div>

        {/* Linguistic Reference Acknowledgment */}
        <div
          style={{
            marginTop: '0.25rem',
            paddingTop: '0.45rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.4rem',
            fontSize: '0.66rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Ref:{' '}
            <a
              href={mode.referenceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#A78BFA', textDecoration: 'underline' }}
            >
              {mode.referenceLabel}
            </a>
          </span>
          <span style={{ fontStyle: 'italic', color: '#C4B5FD' }}>
            Dark theme demonstrates American Sign Language
          </span>
        </div>
      </div>
    </div>
  );
}
