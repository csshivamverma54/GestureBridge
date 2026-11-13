import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { createAnatomicalHandRig, setFlatOpenHandshape, disposeHandRig } from './handGeometry';

/**
 * IslWelcomeStage — Interactive Three.js 3D ISL "WELCOME" (Invite / Greeting) Stage
 *
 * Official Reference:
 *   ISLRTC (Indian Sign Language Research and Training Centre)
 *   Dictionary Entry: "Invite, Welcome()" — Category: Everyday
 *   Reference Video: https://www.youtube.com/watch?v=P8c9TRiU7HI
 *   Dictionary Search: https://divyangjan.depwd.gov.in/islrtc/search.php
 *
 * Linguistic Movement:
 *   1. Initial Position: Both open flat hands extended forward at chest level,
 *      palms angled upward and tilted inward toward each other and the signer.
 *   2. Main Movement: Both hands sweep smoothly and simultaneously backward and inward
 *      toward the chest in an inviting, hospitable welcoming arc.
 *   3. Final Hold: Brief dignified hold near the chest before calm replay/pause.
 */

const DURATION_MS = 3800;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Compute exact anatomical basis quaternions for Right and Left hands:
// Fingers point forward (+Z) and slightly up/inward; palms face upward (+Y) and tilted inward.
function createIslBasisQuat(isLeft = false) {
  const sign = isLeft ? 1 : -1;
  const fingers = new THREE.Vector3(sign * 0.25, 0.35, 0.90).normalize();
  const palm = new THREE.Vector3(sign * 0.35, 0.88, -0.25).normalize();
  const xVec = new THREE.Vector3().crossVectors(fingers, palm).normalize();
  const zVec = new THREE.Vector3().crossVectors(xVec, fingers).normalize();
  const m = new THREE.Matrix4().makeBasis(xVec, fingers, zVec);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

const RIGHT_BASE_QUAT = createIslBasisQuat(false);
const LEFT_BASE_QUAT = createIslBasisQuat(true);

function applyIslWelcomeFrame(rightRig, leftRig, chestHalo, t) {
  // Phase 1: 0.00 - 0.18 (Initial welcoming presentation)
  // Phase 2: 0.18 - 0.72 (Symmetrical inward inviting sweep toward chest)
  // Phase 3: 0.72 - 1.00 (Final hold at chest level)
  let moveP = 0;
  if (t > 0.18 && t <= 0.72) {
    moveP = easeInOutCubic((t - 0.18) / 0.54);
  } else if (t > 0.72) {
    moveP = 1;
  }

  // Graceful arc trajectory: hands draw from forward (+Z) inward toward chest (-Z)
  const arcLift = Math.sin(moveP * Math.PI) * 0.07;
  const posZ = THREE.MathUtils.lerp(0.55, -0.38, moveP);
  const posY = THREE.MathUtils.lerp(-0.08, 0.06, moveP) + arcLift;

  // Lateral convergence: comfortable separation showcasing both sculpted hands
  const rightX = THREE.MathUtils.lerp(0.66, 0.36, moveP);
  const leftX = THREE.MathUtils.lerp(-0.66, -0.36, moveP);

  rightRig.root.position.set(rightX, posY, posZ);
  leftRig.root.position.set(leftX, posY, posZ);

  // Gentle wrist scoop as hands draw inward in hospitable welcome
  const wristPitch = THREE.MathUtils.lerp(0.00, 0.15, moveP);
  const rightWristRoll = THREE.MathUtils.lerp(0.00, -0.06, moveP);
  const leftWristRoll = THREE.MathUtils.lerp(0.00, 0.06, moveP);

  const rightDelta = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(wristPitch, 0.0, rightWristRoll)
  );
  const leftDelta = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(wristPitch, 0.0, leftWristRoll)
  );

  rightRig.root.quaternion.copy(RIGHT_BASE_QUAT).multiply(rightDelta);
  leftRig.root.quaternion.copy(LEFT_BASE_QUAT).multiply(leftDelta);

  // Natural micro-curl at fingertips during the inviting draw
  const curl = THREE.MathUtils.lerp(0.05, 0.09, moveP);
  setFlatOpenHandshape(rightRig, curl);
  setFlatOpenHandshape(leftRig, curl);

  // Subtle chest reception highlight pulse
  if (chestHalo) {
    const pulse = moveP > 0.8 ? (moveP - 0.8) / 0.2 : 0;
    chestHalo.material.opacity = 0.08 + pulse * 0.14;
  }
}

export default function IslWelcomeStage({ mode }) {
  const mountRef = useRef(null);
  const progressRef = useRef(0);
  const playingRef = useRef(true);
  const lastTimeRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('Initial Welcoming Position');
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
        setPhaseLabel('Final Reception Hold (Reduced Motion)');
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
    setPhaseLabel('Initial Welcoming Position');
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
    let rightRig;
    let leftRig;
    let chestHalo;
    let orbLavender;
    let orbMint;
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

    // Studio camera looking from elevated 3/4 angle down at both welcoming hands
    camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);
    camera.position.set(0.0, 1.45, 2.75);
    camera.lookAt(0.0, 0.04, 0.0);

    // Warm, luminous studio lighting tailored for Light Theme
    const ambient = new THREE.AmbientLight('#f5f3ff', 0.85);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight('#fff8f0', '#ede9fe', 0.90);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fffaf4', 2.1);
    keyLight.position.set(1.8, 3.8, 3.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#fdf2f8', 1.0);
    fillLight.position.set(-2.2, 2.0, 2.2);
    scene.add(fillLight);

    const rimLeft = new THREE.DirectionalLight('#c4b5fd', 0.95);
    rimLeft.position.set(-2.8, 1.8, -1.8);
    scene.add(rimLeft);

    const rimRight = new THREE.DirectionalLight('#fed7aa', 0.85);
    rimRight.position.set(2.8, 1.2, -1.8);
    scene.add(rimRight);

    // Chest Spatial Reference Plane (Frosted Glass Contour)
    const torsoGeom = new THREE.CylinderGeometry(1.05, 1.15, 1.8, 32, 1, true, -Math.PI * 0.40, Math.PI * 0.80);
    const torsoMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ddd6fe'),
      transparent: true,
      opacity: 0.12,
      roughness: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const torsoMesh = new THREE.Mesh(torsoGeom, torsoMat);
    torsoMesh.position.set(0.0, -0.18, -1.45);
    scene.add(torsoMesh);

    // Chest reception halo ring
    const haloGeom = new THREE.RingGeometry(0.25, 0.45, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#8b5cf6'),
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    chestHalo = new THREE.Mesh(haloGeom, haloMat);
    chestHalo.position.set(0.0, 0.05, -0.45);
    scene.add(chestHalo);

    // Minimal floating accents
    const orbLavenderMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#a78bfa'),
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });
    orbLavender = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 20), orbLavenderMat);
    orbLavender.position.set(-1.35, 0.75, -0.30);
    scene.add(orbLavender);

    const orbMintMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#34d399'),
      roughness: 0.24,
      metalness: 0.04,
      clearcoat: 0.80,
    });
    orbMint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16), orbMintMat);
    orbMint.position.set(1.35, -0.52, 0.15);
    scene.add(orbMint);

    // Dual Anatomical Hands (Left and Right)
    rightRig = createAnatomicalHandRig({
      isLeft: false,
      skinColor: '#dfb29d',
      sheenColor: '#ffe1d4',
    });
    leftRig = createAnatomicalHandRig({
      isLeft: true,
      skinColor: '#dfb29d',
      sheenColor: '#ffe1d4',
    });

    scene.add(rightRig.root);
    scene.add(leftRig.root);

    applyIslWelcomeFrame(rightRig, leftRig, chestHalo, progressRef.current);

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
            ? 'Initial Welcoming Position'
            : p <= 0.72
            ? 'Inviting Inward Sweep'
            : 'Final Reception Hold at Chest';
        if (nextPhase !== lastPhase) {
          lastPhase = nextPhase;
          setPhaseLabel(nextPhase);
        }
      } else {
        lastTimeRef.current = null;
      }

      applyIslWelcomeFrame(rightRig, leftRig, chestHalo, progressRef.current);

      if (!reducedMotion) {
        orbLavender.position.y = 0.75 + Math.sin(ts * 0.0014) * 0.035;
        orbMint.position.y = -0.52 + Math.cos(ts * 0.0016) * 0.030;
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
      disposeHandRig(rightRig);
      disposeHandRig(leftRig);
      torsoGeom.dispose();
      torsoMat.dispose();
      haloGeom.dispose();
      haloMat.dispose();
      orbLavender.geometry.dispose();
      orbLavenderMat.dispose();
      orbMint.geometry.dispose();
      orbMintMat.dispose();
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
        background: 'linear-gradient(145deg, #FFFFFF 0%, #F5F3FF 52%, #FFF8F1 100%)',
        border: '1px solid rgba(139, 92, 246, 0.22)',
        boxShadow: '0 24px 50px -12px rgba(107, 76, 255, 0.14), 0 8px 16px -6px rgba(0,0,0,0.04)',
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
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
            {mode.code} — {mode.languageName}
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            Two-Handed Greeting
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '0.82rem',
              letterSpacing: '0.14em',
              color: 'var(--color-primary)',
            }}
          >
            {mode.word}
          </span>
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div
        ref={mountRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 'clamp(260px, 32vw, 360px)',
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 50%, rgba(237, 233, 254, 0.45) 0%, rgba(255, 255, 255, 0) 70%)',
        }}
      >
        {webglError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            WebGL accelerated rendering is not available in your environment.
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
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            boxShadow: '0 4px 14px -2px rgba(107, 76, 255, 0.15)',
            fontSize: '0.65rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'var(--color-primary)',
            pointerEvents: 'none',
          }}
        >
          ISLRTC VERIFIED
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
            aria-label="ISL WELCOME sign animation progress"
            style={{
              flex: 1,
              accentColor: 'var(--color-primary)',
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
                color: 'var(--text-secondary)',
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
              }}
              aria-label={isPlaying ? 'Pause ISL sign animation' : 'Play ISL sign animation'}
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
              aria-label="Replay ISL sign animation from start"
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
            borderTop: '1px solid rgba(139, 92, 246, 0.12)',
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
              style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
            >
              {mode.referenceLabel}
            </a>
          </span>
          <span style={{ fontStyle: 'italic' }}>
            Light theme demonstrates official Indian Sign Language
          </span>
        </div>
      </div>
    </div>
  );
}
