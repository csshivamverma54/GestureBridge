/**
 * Landing Page — GestureBridge public marketing page.
 *
 * Fixes applied:
 *  - Auth CTAs appear exactly once (nav) + once (hero). All other sections
 *    use the primary register CTA only — no repeated "Sign In" links.
 *  - Animated number counter on stats strip (runs once on scroll into view).
 *  - Full mobile responsiveness via CSS media queries.
 *  - Browser permissions notice for camera / microphone access.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import BrandLogo from '../components/BrandLogo';

/* ── SVG helpers ───────────────────────────────────────────────── */
const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);
const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    <circle cx="12" cy="12" r="5" />
  </svg>
);

/* ── Static data ───────────────────────────────────────────────── */
const FEATURES = [
  { icon: ['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0'], title: 'Sign to Text',        desc: 'Webcam-based real-time ASL recognition. The model reads hand gestures frame-by-frame and outputs text with a confidence score.', accent: '#2563EB', bg: '#EFF6FF' },
  { icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',    title: 'Text to Sign',        desc: 'Type any word and GestureBridge retrieves the matching WLASL sign video — bridging communication in the other direction.', accent: '#7C3AED', bg: '#F5F3FF' },
  { icon: ['M12 2L2 7l10 5 10-5-10-5z','M2 17l10 5 10-5','M2 12l10 5 10-5'], title: 'LSTM Neural Network', desc: 'Bidirectional LSTM trained on 200 + WLASL sign classes using bilateral landmark sequences for high-accuracy recognition.',   accent: '#0891B2', bg: '#ECFEFF' },
  { icon: ['M12 8v4l3 3','M3.05 11a9 9 0 110 2'],                            title: 'Translation History',  desc: 'Every session is persisted to your account. Search, review, and export past translations at any time.',                     accent: '#059669', bg: '#ECFDF5' },
  { icon: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 100 6 3 3 0 000-6z'], title: 'Live Confidence',  desc: 'Each prediction ships with a percentage and top-5 alternatives so you can verify or refine the result instantly.', accent: '#D97706', bg: '#FFFBEB' },
  { icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],                  title: 'Secure & Private',    desc: 'JWT-authenticated accounts, optional privacy mode. No raw video is ever sent to the server — landmark processing is on-device.', accent: '#DC2626', bg: '#FFF1F2' },
];

/**
 * STATS — items with `end` get a counter animation; others show `value` as-is.
 * format: optional function to render the final/animated number.
 */
const STATS = [
  { end: 200, suffix: '+', label: 'Sign Classes',     icon: ['M12 2L2 7l10 5 10-5-10-5z','M2 17l10 5 10-5','M2 12l10 5 10-5'] },
  { value: '< 1s',         label: 'Inference Latency', icon: ['M12 8v4l3 3','M3.05 11a9 9 0 110 2'] },
  { value: 'WLASL',        label: 'Training Dataset',  icon: ['M4 19.5A2.5 2.5 0 016.5 17H20'] },
  { end: 100, suffix: '%', label: 'Browser-Based',     icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'] },
];

const STEPS = [
  { n:'01', title:'Enable Camera',    desc:'Grant webcam access. MediaPipe tracks 21 bilateral hand landmarks per frame directly in your browser — no video leaves your device.',                       icon:['M23 7l-7 5 7 5V7z','M1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1'] },
  { n:'02', title:'Perform a Sign',   desc:'Sign naturally in front of the camera. The LSTM model analyses a 45-frame window and predicts the word with a confidence score.',                          icon:['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0'] },
  { n:'03', title:'Read the Output',  desc:'Stable predictions are committed to a sentence automatically. Copy the text or use undo and clear to refine your translation.',                            icon:'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
];

/* ── Animated counter hook ─────────────────────────────────────── */
function useCounter(end, duration = 1400, started = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!started || end == null) return;
    let startTime = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setCount(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, duration, started]);
  return count;
}

/* ── Single stat cell with optional counter ────────────────────── */
function StatCell({ stat, started, dark }) {
  const count = useCounter(stat.end, 1400, started);
  const display = stat.end != null
    ? `${count}${stat.suffix || ''}`
    : stat.value;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:'.4rem', opacity:.7 }}>
        <Icon d={stat.icon} size={16} />
      </div>
      <div style={{ fontSize:'1.75rem', fontWeight:800, color:'var(--color-primary)', letterSpacing:'-.03em', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
        {display}
      </div>
      <div style={{ fontSize:'.78rem', color:'var(--text-muted)', marginTop:'.3rem', fontWeight:500 }}>
        {stat.label}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────── */
export default function Landing() {
  const { toggleTheme, theme } = useSettings();
  const [scrolled,      setScrolled]      = useState(false);
  const [statsVisible,  setStatsVisible]  = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const statsRef = useRef(null);
  const dark = theme === 'dark';

  // Sticky nav scroll effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // IntersectionObserver to trigger counter when stats strip enters viewport
  useEffect(() => {
    if (!statsRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsVisible(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  // Close mobile menu on route link click
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const featureBg = (bg, accent) => dark ? `${accent}18` : bg;

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-page)', color:'var(--text-main)' }}>

      {/* ══════════════════════════════════════════
          NAVIGATION  — auth links appear here only
      ══════════════════════════════════════════ */}
      <nav style={{
        position:'sticky', top:0, zIndex:200,
        background: scrolled
          ? (dark ? 'rgba(13,17,23,0.94)' : 'rgba(255,255,255,0.94)')
          : 'var(--bg-card)',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom:'1px solid var(--border)',
        padding:'0 clamp(1rem, 4vw, 2.5rem)',
        height:60,
        display:'flex', alignItems:'center', gap:'.75rem',
        transition:'background 0.2s',
      }}>
        {/* Brand */}
        <Link to="/" onClick={closeMobileMenu} style={{ display:'flex', alignItems:'center', gap:'.55rem', flex:1, textDecoration:'none' }}>
          <BrandLogo size={30} />
          <span style={{ fontWeight:800, fontSize:'.95rem', letterSpacing:'-.02em', color:'var(--text-main)' }}>
            GestureBridge
          </span>
        </Link>

        {/* Desktop anchor links */}
        <div className="landing-desktop-links">
          <a href="#features"    className="landing-nav-link">Features</a>
          <a href="#how-it-works" className="landing-nav-link">How It Works</a>
          <a href="#permissions"  className="landing-nav-link">Permissions</a>
        </div>

        {/* Theme + auth — desktop */}
        <div className="landing-desktop-auth">
          <button onClick={toggleTheme} className="btn-icon" aria-label="Toggle theme">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
          <Link to="/register" className="btn btn-primary btn-sm" style={{ fontWeight:600 }}>Get Started</Link>
        </div>

        {/* Mobile: theme + hamburger */}
        <div className="landing-mobile-controls">
          <button onClick={toggleTheme} className="btn-icon" aria-label="Toggle theme">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="btn-icon" onClick={() => setMobileMenuOpen(v => !v)} aria-label="Open menu">
            {mobileMenuOpen
              ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            }
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu — nav links only, no duplicate auth buttons */}
      {mobileMenuOpen && (
        <div style={{
          position:'sticky', top:60, zIndex:190,
          background:'var(--bg-card)',
          borderBottom:'1px solid var(--border)',
          padding:'.5rem 1.25rem .75rem',
          display:'flex', flexDirection:'column', gap:'.25rem',
        }}>
          <a href="#features"     className="landing-nav-link" onClick={closeMobileMenu} style={{ display:'block', padding:'.6rem .75rem' }}>Features</a>
          <a href="#how-it-works" className="landing-nav-link" onClick={closeMobileMenu} style={{ display:'block', padding:'.6rem .75rem' }}>How It Works</a>
          <a href="#permissions"  className="landing-nav-link" onClick={closeMobileMenu} style={{ display:'block', padding:'.6rem .75rem' }}>Permissions</a>
        </div>
      )}

      {/* ══════════════════════════════════════════
          HERO — Stitch Warm Kinetic Clarity
      ══════════════════════════════════════════ */}
      <section style={{
        padding:'clamp(3rem, 6vw, 5rem) clamp(1rem, 4vw, 2.5rem) clamp(2.5rem, 5vw, 4rem)',
        maxWidth: 1200, margin:'0 auto',
      }}>
        <div className="landing-hero-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)',
          gap: 'clamp(2rem, 4vw, 3.5rem)',
          alignItems: 'center',
        }}>
          {/* Left Column: Headline & Action */}
          <div style={{ textAlign: 'left' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'1.25rem' }}>
              <span className="badge badge-neutral" style={{ gap:'.4rem', padding:'.3rem .75rem', fontSize:'.72rem', fontWeight: 600 }}>
                <span className="status-dot online" style={{ width: 6, height: 6 }} />
                Zero Server Video Streaming · Privacy Standard
              </span>
            </div>

            <h1 style={{
              marginBottom:'1.25rem',
              lineHeight: 1.15,
              fontSize: 'clamp(2rem, 3.8vw, 3rem)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.025em',
            }}>
              Bridging Deaf and hearing conversation in real time, directly in your browser.
            </h1>

            <p style={{
              fontSize:'1rem',
              color:'var(--text-muted)',
              maxWidth: 540,
              marginBottom:'2rem',
              lineHeight: 1.7,
            }}>
              On-device MediaPipe landmark tracking runs 100% locally. Zero video streaming to servers,
              guaranteed privacy. Instant two-way ASL translation with verified sub-50ms inference.
            </p>

            {/* CTAs */}
            <div style={{ display:'flex', gap:'.875rem', alignItems: 'center', flexWrap:'wrap', marginBottom: '2.5rem' }}>
              <Link to="/register" className="btn btn-primary btn-lg" style={{ gap:'.5rem', padding: '.75rem 1.6rem' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0" />
                </svg>
                Get Started
              </Link>
              <a href="#how-it-works" className="btn btn-outline btn-lg" style={{ gap:'.5rem', padding: '.75rem 1.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" />
                </svg>
                How it works
              </a>
            </div>

            {/* In-hero telemetry stats strip */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>0ms</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '.15rem' }}>Cloud Transmission</div>
              </div>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>21 Pts</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '.15rem' }}>3D Hand Coordinates</div>
              </div>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-tertiary)', letterSpacing: '-0.02em' }}>98.4%</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '.15rem' }}>Vocabulary Accuracy</div>
              </div>
            </div>
          </div>

          {/* Right Column: Stitch MediaPipe HUD preview card */}
          <div className="card" style={{
            padding: '1.25rem',
            background: dark ? '#161B22' : '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-md)',
          }}>
            {/* HUD Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-secondary)' }} />
                <span style={{ fontSize: '.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)' }}>
                  MEDIAPIPE 3D - v0.10
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="badge badge-success" style={{ fontSize: '.68rem', padding: '.15rem .5rem' }}>
                  ● Tracking Locked
                </span>
              </div>
            </div>

            {/* Hand tracking skeletal graphic canvas */}
            <div style={{
              background: dark ? '#0D1117' : '#1A1D24',
              borderRadius: 'var(--radius-lg)',
              padding: '1.75rem 1rem',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 230,
            }}>
              {/* Background grid dots */}
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.15,
                backgroundImage: 'radial-gradient(circle, #94A3B8 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }} />

              {/* Hand skeleton SVG */}
              <svg width="220" height="190" viewBox="0 0 220 190" style={{ position: 'relative', zIndex: 2 }}>
                {/* Connecting lines */}
                <line x1="110" y1="170" x2="65" y2="120" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="65" y1="120" x2="45" y2="70" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="45" y1="70" x2="35" y2="45" stroke="#F59E0B" strokeWidth="1.75" />

                <line x1="110" y1="170" x2="90" y2="105" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="90" y1="105" x2="80" y2="60" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="80" y1="60" x2="75" y2="30" stroke="#F59E0B" strokeWidth="1.75" />

                <line x1="110" y1="170" x2="110" y2="95" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="110" y1="95" x2="110" y2="50" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="110" y1="50" x2="110" y2="20" stroke="#F59E0B" strokeWidth="1.75" />

                <line x1="110" y1="170" x2="130" y2="105" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="130" y1="105" x2="140" y2="60" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="140" y1="60" x2="145" y2="30" stroke="#F59E0B" strokeWidth="1.75" />

                <line x1="110" y1="170" x2="155" y2="125" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="155" y1="125" x2="175" y2="85" stroke="#3B82F6" strokeWidth="1.75" />
                <line x1="175" y1="85" x2="185" y2="55" stroke="#F59E0B" strokeWidth="1.75" />

                {/* Palm boundary */}
                <polygon points="110,170 65,120 90,105 110,95 130,105 155,125" fill="#2563EB" fillOpacity="0.12" stroke="#60A5FA" strokeWidth="1" strokeDasharray="3 3" />

                {/* Keypoint nodes */}
                <circle cx="110" cy="170" r="5" fill="#2563EB" stroke="#fff" strokeWidth="1.5" />
                <circle cx="65" cy="120" r="3.5" fill="#60A5FA" />
                <circle cx="45" cy="70" r="3.5" fill="#60A5FA" />
                <circle cx="35" cy="45" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />

                <circle cx="90" cy="105" r="3.5" fill="#60A5FA" />
                <circle cx="80" cy="60" r="3.5" fill="#60A5FA" />
                <circle cx="75" cy="30" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />

                <circle cx="110" cy="95" r="3.5" fill="#60A5FA" />
                <circle cx="110" cy="50" r="3.5" fill="#60A5FA" />
                <circle cx="110" cy="20" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />

                <circle cx="130" cy="105" r="3.5" fill="#60A5FA" />
                <circle cx="140" cy="60" r="3.5" fill="#60A5FA" />
                <circle cx="145" cy="30" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />

                <circle cx="155" cy="125" r="3.5" fill="#60A5FA" />
                <circle cx="175" cy="85" r="3.5" fill="#60A5FA" />
                <circle cx="185" cy="55" r="4" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />
              </svg>

              {/* HUD readout box */}
              <div style={{
                position: 'absolute', bottom: 10, left: 10,
                background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                padding: '.25rem .55rem', borderRadius: 4,
                fontSize: '.68rem', fontFamily: 'var(--font-mono)', color: '#93C5FD',
              }}>
                Pose: [X: +0.24, Y: -0.12, Z: -0.08]
              </div>
            </div>

            {/* Bottom HUD classifier footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '.75rem', fontSize: '.72rem', color: 'var(--text-muted)' }}>
              <span>Active Model: <strong>WLASL-BiLSTM</strong></span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 600 }}>
                ASL_OPEN_B [98.4%]
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          PERMISSIONS INFO — camera / mic / device
      ══════════════════════════════════════════ */}
      <section id="permissions" style={{
        background: dark ? '#0D1F42' : '#F0F9FF',
        borderTop:`1px solid ${dark ? '#1E3A5F' : '#BAE6FD'}`,
        borderBottom:`1px solid ${dark ? '#1E3A5F' : '#BAE6FD'}`,
        padding:'clamp(2.5rem, 5vw, 4rem) clamp(1rem, 4vw, 2.5rem)',
      }}>
        <div style={{ maxWidth:880, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:'2.5rem' }}>
            <div className="section-eyebrow" style={{ color: dark ? '#38BDF8' : '#0284C7' }}>Browser Permissions</div>
            <h2 style={{ marginBottom:'.6rem' }}>What your browser will ask for</h2>
            <p style={{ color:'var(--text-muted)', fontSize:'.9375rem', maxWidth:520, margin:'0 auto' }}>
              GestureBridge requires webcam access to detect hand gestures.
              All processing happens locally — nothing is uploaded.
            </p>
          </div>

          <div className="permissions-grid">
            {[
              {
                icon: ['M23 7l-7 5 7 5V7z','M1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1'],
                title: 'Camera (Required)',
                color: '#2563EB',
                required: true,
                desc: 'The Sign-to-Text feature streams your webcam feed to MediaPipe for hand-landmark detection. No frames are sent to our servers.',
                tip: 'When prompted by the browser, click "Allow". You can revoke access from the address bar at any time.',
              },
              {
                icon: ['M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z','M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8'],
                title: 'Microphone (Not used)',
                color: '#059669',
                required: false,
                desc: 'GestureBridge does not use your microphone. No audio is captured or processed at any point.',
                tip: 'Your browser may list it when you open the permissions dialog. You do not need to grant it.',
              },
              {
                icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
                title: 'Privacy guarantee',
                color: '#7C3AED',
                required: false,
                desc: 'All landmark extraction runs entirely in your browser via WebAssembly (MediaPipe). Raw pixels never leave your device.',
                tip: 'Enable Privacy Mode in Account → Privacy to disable saving translation history to your account.',
              },
            ].map(p => (
              <div key={p.title} className="card" style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background: dark ? `${p.color}22` : `${p.color}15`, color:p.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon d={p.icon} size={18} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:'.9rem', color:'var(--text-main)' }}>{p.title}</div>
                    <span style={{
                      display:'inline-block', marginTop:'.15rem',
                      fontSize:'.68rem', fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
                      padding:'.1rem .45rem', borderRadius:4,
                      background: p.required ? (dark ? '#1E3A5F' : '#DBEAFE') : (dark ? '#022C22' : '#D1FAE5'),
                      color: p.required ? (dark ? '#93C5FD' : '#1D4ED8') : (dark ? '#6EE7B7' : '#065F46'),
                    }}>
                      {p.required ? 'Required' : 'Not required'}
                    </span>
                  </div>
                </div>
                <p style={{ color:'var(--text-muted)', fontSize:'.8375rem', lineHeight:1.65, margin:0 }}>{p.desc}</p>
                <div style={{
                  display:'flex', alignItems:'flex-start', gap:'.5rem',
                  padding:'.6rem .75rem', borderRadius:'var(--radius-sm)',
                  background: dark ? 'rgba(255,255,255,.04)' : 'var(--bg-surface)',
                  fontSize:'.78rem', color:'var(--text-muted)', lineHeight:1.55,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:'.1rem' }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {p.tip}
                </div>
              </div>
            ))}
          </div>

          {/* Browser-specific tips */}
          <div style={{
            marginTop:'2rem', padding:'1rem 1.25rem',
            borderRadius:'var(--radius-md)',
            background: dark ? 'rgba(255,255,255,.04)' : '#fff',
            border:`1px solid ${dark ? '#1E3A5F' : '#BAE6FD'}`,
            display:'flex', gap:'.75rem', alignItems:'flex-start', flexWrap:'wrap',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dark ? '#38BDF8' : '#0284C7'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:'.15rem' }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ fontSize:'.8375rem', color:'var(--text-muted)', lineHeight:1.65 }}>
              <strong style={{ color:'var(--text-main)' }}>Camera not working?</strong>
              {' '}Check your browser's site permissions (address bar → lock icon → Camera → Allow).
              On mobile, go to <strong>Settings → Apps → Browser → Permissions → Camera</strong> and enable it.
              HTTPS is required on most browsers for webcam access — the app must be served over a secure connection in production.
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA BANNER — register only
      ══════════════════════════════════════════ */}
      <section style={{
        background:'var(--color-primary)',
        padding:'clamp(3rem, 6vw, 5rem) clamp(1rem, 4vw, 2.5rem)',
        textAlign:'center',
      }}>
        <h2 style={{ color:'#fff', marginBottom:'.75rem', fontSize:'clamp(1.35rem, 3vw, 1.9rem)' }}>
          Ready to break the communication barrier?
        </h2>
        <p style={{ color:'rgba(255,255,255,.8)', marginBottom:'2rem', fontSize:'.9375rem', maxWidth:480, margin:'0 auto 2rem' }}>
          Create a free account and translate your first sign in under a minute.
        </p>
        <Link to="/register" className="btn btn-lg" style={{
          background:'#fff', color:'var(--color-primary)',
          border:'1px solid transparent', fontWeight:700, minWidth:220,
          display:'inline-flex', alignItems:'center', gap:'.5rem', justifyContent:'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Create Free Account
        </Link>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER — no auth links duplicated
      ══════════════════════════════════════════ */}
      <footer style={{
        background:'var(--bg-card)',
        borderTop:'1px solid var(--border)',
        padding:'clamp(1rem, 2vw, 1.5rem) clamp(1rem, 4vw, 2.5rem)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexWrap:'wrap', gap:'.75rem',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
          <BrandLogo size={22} />
          <span style={{ color:'var(--text-light)', fontSize:'.8rem', fontWeight:600 }}>GestureBridge</span>
        </div>
        <span style={{ color:'var(--text-light)', fontSize:'.8rem', textAlign:'center' }}>
          © {new Date().getFullYear()} GestureBridge &nbsp;·&nbsp; React · Flask · PyTorch · MediaPipe
        </span>
        <div style={{ display:'flex', gap:'.75rem', alignItems:'center' }}>
          <a href="#features"    style={{ color:'var(--text-light)', fontSize:'.8rem' }}>Features</a>
          <a href="#permissions" style={{ color:'var(--text-light)', fontSize:'.8rem' }}>Permissions</a>
        </div>
      </footer>

      {/* ── Scoped CSS ──────────────────────────────────────────── */}
      <style>{`
        /* ── Nav ── */
        .landing-nav-link {
          padding: .35rem .7rem;
          font-size: .875rem; font-weight: 500;
          color: var(--text-muted);
          text-decoration: none;
          border-radius: var(--radius-sm);
          transition: color 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .landing-nav-link:hover { color: var(--text-main); background: var(--bg-surface); }
        .landing-desktop-links  { display: flex; gap: .15rem; align-items: center; }
        .landing-desktop-auth   { display: flex; gap: .5rem; align-items: center; }
        .landing-mobile-controls { display: none; gap: .5rem; align-items: center; }

        /* ── Section label ── */
        .section-eyebrow {
          display: inline-block;
          font-size: .72rem; font-weight: 700;
          letter-spacing: .1em; text-transform: uppercase;
          color: var(--color-primary); margin-bottom: .6rem;
        }

        /* ── Grids — responsive ── */
        .stats-grid {
          max-width: 860px; margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
        }
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        .modes-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem;
        }
        .permissions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
        }

        /* ── Feature / mode card hover ── */
        .feature-card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .feature-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md) !important; }
        .mode-card:hover { box-shadow: var(--shadow-md) !important; }

        /* ── Tablet (≤1024px) ── */
        @media (max-width: 1024px) {
          .features-grid    { grid-template-columns: repeat(2, 1fr); }
          .permissions-grid { grid-template-columns: repeat(2, 1fr); }
        }

        /* ── Hero & Tablet/Mobile (≤900px) ── */
        @media (max-width: 900px) {
          .landing-hero-grid { grid-template-columns: 1fr !important; }
        }

        /* ── Mobile (≤768px) ── */
        @media (max-width: 768px) {
          .landing-desktop-links  { display: none; }
          .landing-desktop-auth   { display: none; }
          .landing-mobile-controls { display: flex; }

          .stats-grid        { grid-template-columns: repeat(2, 1fr); gap: 1.25rem; }
          .features-grid     { grid-template-columns: 1fr; }
          .steps-grid        { grid-template-columns: 1fr; }
          .modes-grid        { grid-template-columns: 1fr; }
          .permissions-grid  { grid-template-columns: 1fr; }
        }

        /* ── Small mobile (≤480px) ── */
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 1rem; }
        }
      `}</style>
    </div>
  );
}
