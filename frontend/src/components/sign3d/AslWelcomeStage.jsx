/**
 * AslWelcomeStage — Native MP4 Video Player for ASL "WELCOME" Gesture
 *
 * Integrated into the GestureBridge Hero preview panel.
 * Uses the verified ASL WELCOME demonstration video (16:9).
 *
 * Performance & Visual Cropping:
 *  - Native <video> element with preload="metadata"
 *  - Muted autoplay with playsInline (reduced-motion compliant)
 *  - Replay seeks currentTime = 0 without re-fetching or re-downloading
 *  - Framing calibrated to keep avatar head & signing hands centered while
 *    cropping any bottom text/watermark outside the viewport
 *  - Component memoized to prevent re-mounting or re-rendering on parent state changes
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SIGN_MODES } from './signDefinitions';

const VIDEO_SRC = '/assets/asl-welcome-demo.mp4';
const DEFAULT_MODE = SIGN_MODES.dark;

function AslWelcomeStage({ mode = DEFAULT_MODE }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('Initial Presentation (Palm Up)');
  const [hasError, setHasError] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Check user preference for reduced motion
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const updateRM = (matches) => {
      setReducedMotion(matches);
      if (matches && videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        setIsPlaying(false);
        setPhaseLabel('Final Hold at Torso (Reduced Motion)');
      }
    };
    updateRM(mq.matches);
    const listener = (e) => updateRM(e.matches);
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);

  // Graceful autoplay handling on mount
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!reducedMotion) {
      v.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [reducedMotion]);

  // Video timeupdate handler: sync progress slider and phase label
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const p = v.currentTime / v.duration;
    setProgress(p);

    if (p < 0.22) {
      setPhaseLabel('Initial Presentation (Palm Up)');
    } else if (p <= 0.80) {
      setPhaseLabel('Inward Welcoming Sweep to Midsection');
    } else {
      setPhaseLabel('Final Hold at Torso');
    }
  }, []);

  // Video ended handler: ensure it holds on the final frame without continuous looping
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setProgress(1);
    setPhaseLabel('Final Hold at Torso');
  }, []);

  // Controls: Replay seeks to beginning without re-downloading the media asset
  const handleReplay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  // Controls: Toggle Play / Pause
  const handleTogglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime >= v.duration - 0.1) {
        v.currentTime = 0;
      }
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  // Controls: Scrub timeline smoothly
  const handleScrub = useCallback((e) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const val = parseFloat(e.target.value);
    v.currentTime = val * v.duration;
    setProgress(val);
  }, []);

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
        padding: '1rem 1.15rem 1.15rem',
      }}
    >
      {/* Top Language & Gesture Identification Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.6rem',
          flexWrap: 'wrap',
          marginBottom: '0.5rem',
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
            Language: ASL — American Sign Language
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
              fontSize: '0.70rem',
              color: 'var(--text-light)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
            }}
          >
            Gesture:
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '0.85rem',
              letterSpacing: '0.14em',
              color: '#DDD6FE',
            }}
          >
            {mode.word || 'WELCOME'}
          </span>
        </div>
      </div>

      {/* Video Viewport: 16:9 Aspect Ratio Container with bottom-overflow clipping */}
      <div
        className="asl-video-viewport"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: '20px',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 50%, #151421 0%, #0D0C14 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          preload="metadata"
          muted
          playsInline
          autoPlay={!reducedMotion}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={() => setHasError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 12%',
            transform: 'scale(1.12)',
            transformOrigin: 'center 22%',
            display: 'block',
            borderRadius: '20px',
          }}
          aria-label="Demonstration video of ASL sign WELCOME: avatar performing one-handed inward sweep toward midsection"
        />

        {/* Floating Verification Pill Badge */}
        <div
          style={{
            position: 'absolute',
            top: '0.65rem',
            right: '0.85rem',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            background: 'rgba(30, 27, 75, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
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

        {/* Fallback Display if video load fails */}
        {hasError && (
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
              background: 'rgba(21, 20, 33, 0.94)',
            }}
          >
            <strong style={{ fontSize: '1rem', color: '#F5F3FF' }}>ASL — WELCOME</strong>
            <p style={{ fontSize: '0.84rem', maxWidth: 320, margin: 0, color: 'var(--text-muted)' }}>
              {mode.movementSummary || 'Flat open hand sweeps smoothly inward to meet midsection.'}
            </p>
          </div>
        )}
      </div>

      {/* Interactive Animation Timeline & Playback Controls */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: '0.75rem',
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
            aria-label="ASL WELCOME sign video progress"
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
              aria-label={isPlaying ? 'Pause ASL sign demonstration' : 'Play ASL sign demonstration'}
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
              aria-label="Replay ASL sign demonstration from beginning"
            >
              Replay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(AslWelcomeStage);
