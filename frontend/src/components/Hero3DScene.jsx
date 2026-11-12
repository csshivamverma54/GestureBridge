import React, { useState, useEffect, useRef } from 'react';

/**
 * Hero3DScene — Interactive 3D Claymorphism Hand & Floating Spatial UI
 *
 * Recreates the glossy, warm, creative 3D visual centerpiece from the design
 * language using layered CSS 3D perspective, pointer-responsive parallax,
 * multi-stop subsurface SVG shading, and GPU-friendly CSS float animations.
 * Respects prefers-reduced-motion and adapts cleanly to light/dark themes.
 */
export default function Hero3DScene({ dark = false, compact = false }) {
  const containerRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      setReducedMotion(mq.matches);
      const listener = (e) => setReducedMotion(e.matches);
      mq.addEventListener?.('change', listener);
      return () => mq.removeEventListener?.('change', listener);
    }
  }, []);

  const handleMouseMove = (e) => {
    if (reducedMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -ny * 10, y: nx * 12 });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-hidden="true"
      style={{
        position: 'relative',
        width: '100%',
        height: compact ? 340 : 'clamp(360px, 44vw, 500px)',
        perspective: '1200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {/* Ambient Soft Pastel Radial Halos */}
      <div
        style={{
          position: 'absolute',
          width: '82%',
          height: '82%',
          borderRadius: '50%',
          background: dark
            ? 'radial-gradient(circle at 60% 40%, rgba(124, 92, 255, 0.28), rgba(245, 158, 11, 0.10) 55%, transparent 75%)'
            : 'radial-gradient(circle at 62% 38%, rgba(167, 139, 250, 0.34), rgba(254, 215, 170, 0.42) 52%, transparent 76%)',
          filter: 'blur(26px)',
          pointerEvents: 'none',
        }}
      />

      {/* 3D Interactive Stage */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: reducedMotion
            ? 'none'
            : `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: 'transform 220ms cubic-bezier(.22, 1, .36, 1)',
        }}
      >
        {/* ── 3D Floating Donut Torus (Top Right) ── */}
        <div
          className="float-slow"
          style={{
            position: 'absolute',
            top: '5%',
            right: '4%',
            width: compact ? 52 : 66,
            height: compact ? 52 : 66,
            transform: 'translateZ(35px) rotate(-18deg)',
            zIndex: 3,
          }}
        >
          <svg viewBox="0 0 80 80" width="100%" height="100%">
            <defs>
              <radialGradient id="goldTorus" cx="34%" cy="28%" r="72%">
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="45%" stopColor="#FBBF24" />
                <stop offset="85%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#92400E" />
              </radialGradient>
            </defs>
            <ellipse cx="42" cy="46" rx="28" ry="24" fill="rgba(217, 119, 6, 0.2)" />
            <path
              d="M40 12C23.5 12 10 23.8 10 39C10 54.2 23.5 66 40 66C56.5 66 70 54.2 70 39C70 23.8 56.5 12 40 12ZM40 49C33.4 49 28 44.5 28 39C28 33.5 33.4 29 40 29C46.6 29 52 33.5 52 39C52 44.5 46.6 49 40 49Z"
              fill="url(#goldTorus)"
            />
            <path
              d="M20 26C25 18 35 15 46 17"
              stroke="#FFFBEB"
              strokeWidth="4"
              strokeLinecap="round"
              strokeOpacity="0.6"
              fill="none"
            />
          </svg>
        </div>

        {/* ── 3D Floating Purple Sphere (Mid Right) ── */}
        <div
          className="float-slow-reverse"
          style={{
            position: 'absolute',
            top: '39%',
            right: '6%',
            width: compact ? 38 : 48,
            height: compact ? 38 : 48,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 32% 28%, #C4B5FD 0%, #7C5CFF 46%, #4C1D95 100%)',
            boxShadow: '0 14px 26px -6px rgba(107, 76, 255, 0.45), inset -4px -6px 12px rgba(24, 16, 66, 0.35)',
            transform: 'translateZ(50px)',
            zIndex: 4,
          }}
        />

        {/* ── 3D Floating Coral Cross / Plus (Lower Right) ── */}
        <div
          className="float-slow"
          style={{
            position: 'absolute',
            bottom: '22%',
            right: '8%',
            width: compact ? 44 : 56,
            height: compact ? 44 : 56,
            transform: 'translateZ(65px) rotate(16deg)',
            zIndex: 6,
          }}
        >
          <svg viewBox="0 0 80 80" width="100%" height="100%">
            <defs>
              <linearGradient id="coralCross" x1="15" y1="12" x2="65" y2="68" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FDA4AF" />
                <stop offset="45%" stopColor="#FB7185" />
                <stop offset="100%" stopColor="#E11D48" />
              </linearGradient>
            </defs>
            <g filter="drop-shadow(0 10px 14px rgba(225, 29, 72, 0.28))">
              <rect x="30" y="10" width="20" height="60" rx="10" fill="url(#coralCross)" />
              <rect x="10" y="30" width="60" height="20" rx="10" fill="url(#coralCross)" />
              <rect x="34" y="14" width="6" height="16" rx="3" fill="#FFF1F2" fillOpacity="0.45" />
              <rect x="14" y="34" width="14" height="5" rx="2.5" fill="#FFF1F2" fillOpacity="0.4" />
            </g>
          </svg>
        </div>

        {/* ── 3D Floating Mint C-Torus (Bottom Left) ── */}
        <div
          className="float-slow-reverse"
          style={{
            position: 'absolute',
            bottom: '12%',
            left: '6%',
            width: compact ? 58 : 74,
            height: compact ? 58 : 74,
            transform: 'translateZ(60px) rotate(-14deg)',
            zIndex: 6,
          }}
        >
          <svg viewBox="0 0 90 90" width="100%" height="100%">
            <defs>
              <linearGradient id="mintArc" x1="15" y1="15" x2="75" y2="75" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#6EE7B7" />
                <stop offset="45%" stopColor="#2DD4BF" />
                <stop offset="100%" stopColor="#0D9488" />
              </linearGradient>
            </defs>
            <g filter="drop-shadow(0 12px 16px rgba(13, 148, 136, 0.28))">
              <path
                d="M64 25A26 26 0 1 0 64 65"
                stroke="url(#mintArc)"
                strokeWidth="17"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M52 20A22 22 0 0 0 24 34"
                stroke="#CCFBF1"
                strokeWidth="4"
                strokeLinecap="round"
                strokeOpacity="0.65"
                fill="none"
              />
            </g>
          </svg>
        </div>

        {/* ── Main Sculptural 3D Hand + Orbital Ring + Smartwatch ── */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translateZ(20px)',
            zIndex: 4,
          }}
        >
          <svg
            viewBox="0 0 460 440"
            width="100%"
            height="100%"
            style={{ maxWidth: 460, maxHeight: 440, overflow: 'visible' }}
          >
            <defs>
              {/* Soft clay skin gradients */}
              <radialGradient id="clayPalm" cx="42%" cy="34%" r="68%">
                <stop offset="0%" stopColor="#FFE1CE" />
                <stop offset="48%" stopColor="#F8C2A2" />
                <stop offset="85%" stopColor="#E59A78" />
                <stop offset="100%" stopColor="#C97B59" />
              </radialGradient>
              <linearGradient id="clayFinger" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFE6D5" />
                <stop offset="55%" stopColor="#F6BA98" />
                <stop offset="100%" stopColor="#D78A68" />
              </linearGradient>
              <linearGradient id="clayFingerShadow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F5B998" />
                <stop offset="65%" stopColor="#DC906D" />
                <stop offset="100%" stopColor="#B86B4B" />
              </linearGradient>
              <linearGradient id="watchStrap" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8B5CF6" />
                <stop offset="50%" stopColor="#6B4CFF" />
                <stop offset="100%" stopColor="#4325C7" />
              </linearGradient>
              <linearGradient id="watchBezel" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4B5563" />
                <stop offset="50%" stopColor="#1F2937" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>
              <linearGradient id="glassRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.82" />
                <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.92" />
                <stop offset="85%" stopColor="#93C5FD" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#6B4CFF" stopOpacity="0.80" />
              </linearGradient>
              <filter id="handShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#6B4CFF" floodOpacity="0.18" />
              </filter>
            </defs>

            {/* Back half of iridescent orbital torus ring (behind the hand) */}
            <path
              d="M95 256 C88 212 162 184 252 194 C342 204 402 246 392 288"
              fill="none"
              stroke="url(#glassRing)"
              strokeWidth="12"
              strokeLinecap="round"
              opacity="0.72"
            />

            {/* Glossy purple large background orb (bottom right corner) */}
            <circle cx="408" cy="378" r="68" fill="url(#watchStrap)" opacity="0.9" />
            <ellipse cx="388" cy="350" rx="22" ry="14" fill="#FFFFFF" fillOpacity="0.22" transform="rotate(-25 388 350)" />

            {/* 3D Sculpted Hand & Forearm */}
            <g filter="url(#handShadow)">
              {/* Back fingers (Ring & Pinky gracefully curved) */}
              <path
                d="M275 186 C252 160 226 154 205 166 C194 172 190 185 198 194 C206 202 220 198 232 192 C245 187 262 195 272 212 Z"
                fill="url(#clayFingerShadow)"
              />
              <path
                d="M294 218 C272 196 248 194 231 206 C221 213 219 225 227 232 C236 239 249 233 260 229 C272 225 282 235 288 248 Z"
                fill="url(#clayFingerShadow)"
              />

              {/* Middle finger curved */}
              <path
                d="M262 146 C238 112 206 105 182 119 C170 126 168 140 177 148 C186 155 201 148 216 144 C232 140 249 154 260 178 Z"
                fill="url(#clayFinger)"
              />

              {/* Forearm & Palm Base */}
              <path
                d="M260 145 C284 148 310 168 326 204 C338 232 344 264 358 294 L406 398 L330 416 L284 316 C270 296 248 280 236 254 C224 228 234 170 260 145 Z"
                fill="url(#clayPalm)"
              />

              {/* Index Finger reaching out toward scanner card */}
              <path
                d="M268 144 C252 100 226 76 196 76 C178 76 166 86 167 99 C168 112 183 116 199 114 C218 112 234 128 244 156 Z"
                fill="url(#clayFinger)"
              />
              {/* Specular highlight along index finger */}
              <path
                d="M182 91 C198 85 218 89 234 106"
                stroke="#FFF5EE"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeOpacity="0.65"
                fill="none"
              />

              {/* Thumb reaching gracefully forward */}
              <path
                d="M254 274 C226 270 198 258 176 238 C166 229 167 214 178 209 C190 203 206 214 224 228 C242 242 262 246 274 252 Z"
                fill="url(#clayFinger)"
              />
              <path
                d="M180 220 C192 216 206 224 220 235"
                stroke="#FFF5EE"
                strokeWidth="4"
                strokeLinecap="round"
                strokeOpacity="0.6"
                fill="none"
              />

              {/* Glossy Palm Highlight */}
              <ellipse
                cx="288"
                cy="232"
                rx="22"
                ry="34"
                transform="rotate(-18 288 232)"
                fill="#FFF5EE"
                fillOpacity="0.32"
              />

              {/* Purple Smartwatch Strap & Bezel on Wrist */}
              <g transform="rotate(-24 342 332)">
                <rect x="292" y="314" width="102" height="38" rx="18" fill="url(#watchStrap)" />
                <rect x="296" y="319" width="94" height="8" rx="4" fill="#FFFFFF" fillOpacity="0.2" />
                {/* Watch face */}
                <rect x="328" y="302" width="44" height="52" rx="13" fill="url(#watchBezel)" stroke="#6366F1" strokeWidth="1.5" strokeOpacity="0.4" />
                <rect x="333" y="307" width="34" height="42" rx="9" fill="#0B1120" />
                {/* Glass reflection on watch screen */}
                <path d="M337 312 L360 312 L338 334 Z" fill="#FFFFFF" fillOpacity="0.16" />
              </g>
            </g>

            {/* Front half of iridescent orbital torus ring (in front of hand) */}
            <path
              d="M95 256 C104 300 182 326 266 316 C348 306 398 274 392 288"
              fill="none"
              stroke="url(#glassRing)"
              strokeWidth="12.5"
              strokeLinecap="round"
            />
            <path
              d="M126 286 C168 312 232 322 296 310"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeOpacity="0.75"
            />
          </svg>
        </div>

        {/* ── Floating Glass Card 1: Hand Scanner Frame (Top Left) ── */}
        <div
          className="float-slow"
          style={{
            position: 'absolute',
            top: '8%',
            left: '6%',
            width: compact ? 104 : 128,
            height: compact ? 104 : 128,
            borderRadius: 28,
            background: dark
              ? 'linear-gradient(145deg, rgba(132,104,255,0.28), rgba(255,255,255,0.08))'
              : 'linear-gradient(145deg, rgba(255,255,255,0.88), rgba(237,233,254,0.68))',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: dark
              ? '1.5px solid rgba(255,255,255,0.18)'
              : '1.5px solid rgba(255,255,255,0.92)',
            boxShadow: dark
              ? '0 22px 44px -10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2)'
              : '0 22px 44px -10px rgba(107, 76, 255, 0.22), inset 0 2px 0 rgba(255,255,255,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translateZ(80px) rotate(-6deg)',
            zIndex: 7,
          }}
        >
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            {/* Viewfinder brackets */}
            <path d="M12 20V14C12 12.9 12.9 12 14 12H20" stroke="#7C5CFF" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M44 12H50C51.1 12 52 12.9 52 14V20" stroke="#7C5CFF" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M12 44V50C12 51.1 12.9 52 14 52H20" stroke="#7C5CFF" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M44 52H50C51.1 52 52 51.1 52 50V44" stroke="#7C5CFF" strokeWidth="3.2" strokeLinecap="round" />
            {/* Purple hand inside scanner */}
            <path
              d="M24 31C24 28.5 26 27 28 27H36C39 27 41 29.2 41 32V38C41 43 37 47 32 47H31C26.5 47 23 43.2 23 38.5V34.5C23 33 23.4 31.8 24 31Z"
              fill="#6B4CFF"
            />
            <rect x="17.5" y="31" width="4.8" height="11" rx="2.4" transform="rotate(-36 20 36)" fill="#6B4CFF" />
            <rect x="24" y="18" width="4.2" height="13" rx="2.1" fill="#6B4CFF" />
            <rect x="29.5" y="16" width="4.2" height="15" rx="2.1" fill="#6B4CFF" />
            <rect x="35" y="18.5" width="4.2" height="13" rx="2.1" fill="#6B4CFF" />
            <rect x="40" y="23.5" width="3.8" height="10" rx="1.9" transform="rotate(10 42 28)" fill="#6B4CFF" />
          </svg>
        </div>

        {/* ── Floating 3D Card 2: Play Action Tile (Mid Left) ── */}
        <div
          className="float-slow-reverse"
          style={{
            position: 'absolute',
            top: '46%',
            left: '3%',
            width: compact ? 88 : 108,
            height: compact ? 64 : 76,
            borderRadius: 22,
            background: dark ? '#1E1B33' : '#FFFFFF',
            border: dark
              ? '1px solid rgba(255,255,255,0.14)'
              : '1px solid rgba(255,255,255,0.95)',
            boxShadow: dark
              ? '0 20px 38px -8px rgba(0,0,0,0.55)'
              : '0 20px 38px -8px rgba(24, 24, 35, 0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translateZ(75px) rotate(-10deg)',
            zIndex: 7,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="playGrad" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#9D85FF" />
                <stop offset="100%" stopColor="#5B3DF5" />
              </linearGradient>
            </defs>
            <path
              d="M10 7.6C10 6.1 11.7 5.2 13 6L25.2 13.9C26.4 14.7 26.4 16.5 25.2 17.3L13 25.2C11.7 26 10 25.1 10 23.6V7.6Z"
              fill="url(#playGrad)"
            />
          </svg>
        </div>

        {/* ── Floating 3D Card 3: Gesture Sequence List (Top Right) ── */}
        <div
          className="float-slow-reverse"
          style={{
            position: 'absolute',
            top: '11%',
            right: '13%',
            width: compact ? 116 : 138,
            padding: compact ? '12px 14px' : '15px 17px',
            borderRadius: 22,
            background: dark ? '#1E1B33' : '#FFFFFF',
            border: dark
              ? '1px solid rgba(255,255,255,0.14)'
              : '1px solid rgba(255,255,255,0.95)',
            boxShadow: dark
              ? '0 22px 42px -10px rgba(0,0,0,0.55)'
              : '0 22px 42px -10px rgba(24, 24, 35, 0.14)',
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? 9 : 11,
            transform: 'translateZ(70px) rotate(12deg)',
            zIndex: 7,
          }}
        >
          {[
            { dot: '#6B4CFF', bar: 'linear-gradient(90deg, #93C5FD, #BFDBFE)', w: '82%' },
            { dot: '#F59E0B', bar: 'linear-gradient(90deg, #FDE68A, #FCD34D)', w: '92%' },
            { dot: '#2DD4BF', bar: 'linear-gradient(90deg, #6EE7B7, #99F6E4)', w: '72%' },
          ].map((row, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: row.dot,
                  flexShrink: 0,
                  boxShadow: `0 2px 6px ${row.dot}55`,
                }}
              />
              <span
                style={{
                  height: 8,
                  width: row.w,
                  borderRadius: 999,
                  background: row.bar,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Feature3DIcon — Glossy 3D icons matching the bottom Key Features cards
 * in the reference image ('hand' | 'bolt' | 'cubes').
 */
export function Feature3DIcon({ type = 'hand', size = 84 }) {
  const uid = React.useId().replace(/:/g, '');

  if (type === 'bolt') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 45%, rgba(254, 215, 170, 0.72), rgba(255, 237, 213, 0.2) 70%, transparent 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
        }}
      >
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 80 80" fill="none">
          <defs>
            <linearGradient id={`boltG-${uid}`} x1="20" y1="8" x2="60" y2="74" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="45%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#EA580C" />
            </linearGradient>
          </defs>
          <g filter="drop-shadow(0 10px 14px rgba(234, 88, 12, 0.25))">
            <path
              d="M46 8L18 44H36L31 72L62 34H43L46 8Z"
              fill={`url(#boltG-${uid})`}
              stroke="#FDE047"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M41 16L25 40H35" stroke="#FFFBEB" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.65" />
          </g>
        </svg>
      </div>
    );
  }

  if (type === 'cubes') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 45%, rgba(167, 243, 208, 0.65), rgba(209, 250, 229, 0.18) 70%, transparent 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
        }}
      >
        <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 84 84" fill="none">
          <defs>
            <linearGradient id={`cubeBlue-${uid}`} x1="26" y1="8" x2="58" y2="42" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93C5FD" />
              <stop offset="100%" stopColor="#4F46E5" />
            </linearGradient>
            <linearGradient id={`cubeGold-${uid}`} x1="12" y1="36" x2="42" y2="70" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
            <linearGradient id={`cubeCoral-${uid}`} x1="42" y1="36" x2="72" y2="70" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FDA4AF" />
              <stop offset="100%" stopColor="#F43F5E" />
            </linearGradient>
          </defs>
          {/* Yellow Left Cube */}
          <g filter="drop-shadow(0 8px 10px rgba(245, 158, 11, 0.22))">
            <rect x="13" y="40" width="27" height="27" rx="7" fill={`url(#cubeGold-${uid})`} />
            <rect x="16" y="43" width="21" height="6" rx="3" fill="#FFFBEB" fillOpacity="0.4" />
          </g>
          {/* Coral Right Cube */}
          <g filter="drop-shadow(0 8px 10px rgba(244, 63, 94, 0.22))">
            <rect x="44" y="42" width="27" height="27" rx="7" fill={`url(#cubeCoral-${uid})`} />
            <rect x="47" y="45" width="21" height="6" rx="3" fill="#FFF1F2" fillOpacity="0.38" />
          </g>
          {/* Blue Top Cube */}
          <g filter="drop-shadow(0 10px 14px rgba(79, 70, 229, 0.28))">
            <rect x="29" y="13" width="28" height="28" rx="8" fill={`url(#cubeBlue-${uid})`} />
            <rect x="33" y="16" width="20" height="6" rx="3" fill="#EFF6FF" fillOpacity="0.45" />
          </g>
        </svg>
      </div>
    );
  }

  // Default: 'hand' — 3D Victory / Peace Hand
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 45%, rgba(191, 219, 254, 0.72), rgba(224, 231, 255, 0.22) 70%, transparent 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
      }}
    >
      <svg width={size * 0.74} height={size * 0.74} viewBox="0 0 80 80" fill="none">
        <defs>
          <radialGradient id={`vHand-${uid}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFE5D4" />
            <stop offset="55%" stopColor="#F6BA98" />
            <stop offset="100%" stopColor="#D98B68" />
          </radialGradient>
        </defs>
        <g filter="drop-shadow(0 10px 14px rgba(107, 76, 255, 0.16))">
          {/* Index finger (V left) */}
          <rect x="25" y="10" width="11" height="32" rx="5.5" transform="rotate(-14 30 26)" fill={`url(#vHand-${uid})`} />
          {/* Middle finger (V right) */}
          <rect x="42" y="9" width="11" height="33" rx="5.5" transform="rotate(11 47 25)" fill={`url(#vHand-${uid})`} />
          {/* Palm */}
          <rect x="24" y="34" width="32" height="30" rx="14" fill={`url(#vHand-${uid})`} />
          {/* Wrist */}
          <rect x="30" y="56" width="20" height="14" rx="7" fill={`url(#vHand-${uid})`} />
          {/* Curled fingers */}
          <rect x="41" y="39" width="11" height="13" rx="5.5" fill="#EA9F7E" />
          <rect x="49" y="42" width="9.5" height="11" rx="4.75" fill="#DE9170" />
          {/* Thumb across */}
          <rect x="23" y="40" width="21" height="10" rx="5" transform="rotate(14 33 45)" fill={`url(#vHand-${uid})`} />
          {/* Highlight */}
          <ellipse cx="32" cy="48" rx="6" ry="4" fill="#FFF5EE" fillOpacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
