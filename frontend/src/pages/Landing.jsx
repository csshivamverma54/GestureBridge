/**
 * Landing Page — GestureBridge public marketing page.
 *
 * Redesigned in the warm-cream, glossy 3D claymorphism aesthetic inspired by
 * the primary visual reference while preserving all existing routes, anchor
 * sections, theme toggle, mobile menu, and animated counter stats.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import BrandLogo from '../components/BrandLogo';
import Hero3DScene, { Feature3DIcon } from '../components/Hero3DScene';

/* ── SVG helpers ───────────────────────────────────────────────── */
const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);
const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    <circle cx="12" cy="12" r="5" />
  </svg>
);

/* ── Static data ───────────────────────────────────────────────── */
const KEY_HIGHLIGHTS = [
  {
    type: 'hand',
    title: 'Natural Interaction',
    desc: 'Use simple hand gestures for effortless, two-way communication.',
  },
  {
    type: 'bolt',
    title: 'Real-Time Response',
    desc: 'Get instant feedback with low-latency on-device inference.',
  },
  {
    type: 'cubes',
    title: 'Wide Compatibility',
    desc: 'Works smoothly in your browser across devices and platforms.',
  },
];

const FEATURES = [
  { icon: ['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0'], title: 'Sign to Text',        desc: 'Webcam-based real-time ASL recognition. The model reads hand gestures frame-by-frame and outputs text with a confidence score.', accent: '#6B4CFF', bg: '#F2EEFF' },
  { icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',    title: 'Text to Sign',        desc: 'Type any word and GestureBridge retrieves the matching WLASL sign video — bridging communication in the other direction.', accent: '#EC4899', bg: '#FDF2F8' },
  { icon: ['M12 2L2 7l10 5 10-5-10-5z','M2 17l10 5 10-5','M2 12l10 5 10-5'], title: 'LSTM Neural Network', desc: 'Bidirectional LSTM trained on 200+ WLASL sign classes using bilateral landmark sequences for high-accuracy recognition.',   accent: '#0EA5E9', bg: '#F0F9FF' },
  { icon: ['M12 8v4l3 3','M3.05 11a9 9 0 110 2'],                            title: 'Translation History',  desc: 'Every session is persisted to your account. Search, review, and export past translations at any time.',                     accent: '#10B981', bg: '#ECFDF5' },
  { icon: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 100 6 3 3 0 000-6z'], title: 'Live Confidence',  desc: 'Each prediction ships with a percentage and top-5 alternatives so you can verify or refine the result instantly.', accent: '#F59E0B', bg: '#FFFBEB' },
  { icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],                  title: 'Secure & Private',    desc: 'JWT-authenticated accounts, optional privacy mode. No raw video is ever sent to the server — landmark processing is on-device.', accent: '#FB7185', bg: '#FFF1F2' },
];

const STATS = [
  { end: 200, suffix: '+', label: 'Sign Classes',     icon: ['M12 2L2 7l10 5 10-5-10-5z','M2 17l10 5 10-5','M2 12l10 5 10-5'], color: '#6B4CFF' },
  { value: '< 1s',         label: 'Inference Latency', icon: ['M12 8v4l3 3','M3.05 11a9 9 0 110 2'], color: '#F59E0B' },
  { value: 'WLASL',        label: 'Training Dataset',  icon: ['M4 19.5A2.5 2.5 0 016.5 17H20'], color: '#0EA5E9' },
  { end: 100, suffix: '%', label: 'Browser-Based',     icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'], color: '#10B981' },
];

const STEPS = [
  { n:'01', title:'Enable Camera',    desc:'Grant webcam access. MediaPipe tracks 21 bilateral hand landmarks per frame directly in your browser — no video leaves your device.',                       icon:['M23 7l-7 5 7 5V7z','M1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1'], accent:'#6B4CFF' },
  { n:'02', title:'Perform a Sign',   desc:'Sign naturally in front of the camera. The LSTM model analyses a 45-frame window and predicts the word with a confidence score.',                          icon:['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0'], accent:'#F59E0B' },
  { n:'03', title:'Read the Output',  desc:'Stable predictions are committed to a sentence automatically. Copy the text or use undo and clear to refine your translation.',                            icon:'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', accent:'#10B981' },
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
      const eased = 1 - (1 - progress) * (1 - progress);
      setCount(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, duration, started]);
  return count;
}

/* ── Single stat cell with optional counter ────────────────────── */
function StatCell({ stat, started }) {
  const count = useCounter(stat.end, 1400, started);
  const display = stat.end != null
    ? `${count}${stat.suffix || ''}`
    : stat.value;

  return (
    <div style={{ textAlign: 'center', padding: '.75rem .5rem' }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12,
        background: `${stat.color}18`,
        color: stat.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto .65rem',
      }}>
        <Icon d={stat.icon} size={18} />
      </div>
      <div style={{
        fontSize: '1.9rem', fontWeight: 800,
        fontFamily: 'var(--font-display)',
        color: 'var(--text-main)',
        letterSpacing: '-.03em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {display}
      </div>
      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '.4rem', fontWeight: 600 }}>
        {stat.label}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────── */
export default function Landing() {
  const { toggleTheme, theme } = useSettings();
  const [scrolled,       setScrolled]       = useState(false);
  const [statsVisible,   setStatsVisible]   = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const statsRef = useRef(null);
  const dark = theme === 'dark';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!statsRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsVisible(true); obs.disconnect(); } },
      { threshold: 0.25 }
    );
    obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const featureBg = (bg, accent) => dark ? `${accent}1F` : bg;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-page)',
      color: 'var(--text-main)',
      position: 'relative',
      overflowX: 'hidden',
    }}>
      {/* ══════════════════════════════════════════
          AMBIENT BACKGROUND CURVES & GLOWS
      ══════════════════════════════════════════ */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 680,
          background: dark
            ? 'radial-gradient(ellipse 75% 65% at 75% 22%, rgba(124, 92, 255, 0.22), transparent 70%), radial-gradient(ellipse 55% 50% at 15% 18%, rgba(45, 212, 191, 0.08), transparent 65%)'
            : 'radial-gradient(ellipse 72% 68% at 78% 24%, rgba(167, 139, 250, 0.24), transparent 70%), radial-gradient(ellipse 55% 55% at 52% 48%, rgba(254, 215, 170, 0.30), transparent 68%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Decorative subtle curved arc line across hero */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 420"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          top: 140,
          left: 0,
          width: '100%',
          height: 360,
          pointerEvents: 'none',
          zIndex: 0,
          opacity: dark ? 0.14 : 0.45,
        }}
      >
        <path
          d="M-60 360 C 260 360, 420 260, 720 190 C 1020 120, 1220 40, 1500 20"
          fill="none"
          stroke={dark ? '#8468FF' : '#DDD6FE'}
          strokeWidth="2"
        />
      </svg>

      {/* ══════════════════════════════════════════
          NAVIGATION
      ══════════════════════════════════════════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: scrolled
          ? (dark ? 'rgba(13, 12, 20, 0.88)' : 'rgba(250, 248, 245, 0.88)')
          : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
        padding: '0 clamp(1rem, 4vw, 3rem)',
        height: 72,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        transition: 'background 0.25s, border-color 0.25s',
      }}>
        {/* Brand */}
        <Link to="/" onClick={closeMobileMenu} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', textDecoration: 'none' }}>
          <BrandLogo size={36} />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.18rem',
            letterSpacing: '-.03em',
            color: 'var(--text-main)',
          }}>
            GestureBridge
          </span>
        </Link>

        {/* Centered Desktop Navigation Links */}
        <div className="landing-desktop-links">
          <a href="#top"          className="landing-nav-link active-nav">Home</a>
          <a href="#key-features" className="landing-nav-link">Features</a>
          <a href="#how-it-works" className="landing-nav-link">How It Works</a>
          <a href="#permissions"  className="landing-nav-link">Permissions</a>
        </div>

        {/* Theme + auth — desktop */}
        <div className="landing-desktop-auth">
          <button onClick={toggleTheme} className="btn-icon" aria-label="Toggle theme" title="Toggle theme">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link to="/login" className="btn btn-ghost btn-sm" style={{ borderColor: 'transparent', fontWeight: 600 }}>
            Sign In
          </Link>
          <Link to="/register" className="btn btn-ink btn-sm" style={{ padding: '.58rem 1.25rem' }}>
            Get Started <span aria-hidden="true">→</span>
          </Link>
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

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="glass-surface" style={{
          position: 'sticky', top: 72, zIndex: 190,
          borderBottom: '1px solid var(--border)',
          padding: '.75rem 1.25rem 1rem',
          display: 'flex', flexDirection: 'column', gap: '.35rem',
        }}>
          <a href="#top"          className="landing-nav-link" onClick={closeMobileMenu} style={{ display: 'block', padding: '.6rem .75rem' }}>Home</a>
          <a href="#key-features" className="landing-nav-link" onClick={closeMobileMenu} style={{ display: 'block', padding: '.6rem .75rem' }}>Features</a>
          <a href="#how-it-works" className="landing-nav-link" onClick={closeMobileMenu} style={{ display: 'block', padding: '.6rem .75rem' }}>How It Works</a>
          <a href="#permissions"  className="landing-nav-link" onClick={closeMobileMenu} style={{ display: 'block', padding: '.6rem .75rem' }}>Permissions</a>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', paddingTop: '.5rem', borderTop: '1px solid var(--border)' }}>
            <Link to="/login" onClick={closeMobileMenu} className="btn btn-outline btn-sm" style={{ flex: 1 }}>Sign In</Link>
            <Link to="/register" onClick={closeMobileMenu} className="btn btn-ink btn-sm" style={{ flex: 1 }}>Get Started →</Link>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          HERO SECTION
      ══════════════════════════════════════════ */}
      <section
        id="top"
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'clamp(1.75rem, 4vw, 3.25rem) clamp(1rem, 4vw, 3rem) clamp(2rem, 4vw, 3.5rem)',
          maxWidth: 1240,
          margin: '0 auto',
        }}
      >
        {/* Subtle decorative 3D golden capsule peeking bottom-left */}
        <div
          aria-hidden="true"
          className="hide-on-mobile float-slow"
          style={{
            position: 'absolute',
            left: '-56px',
            bottom: '32px',
            width: 84,
            height: 44,
            borderRadius: 999,
            background: 'linear-gradient(135deg, #FDE68A 0%, #F59E0B 60%, #D97706 100%)',
            boxShadow: '0 16px 32px rgba(245, 158, 11, 0.28)',
            transform: 'rotate(24deg)',
            pointerEvents: 'none',
            opacity: dark ? 0.65 : 0.9,
          }}
        />

        <div className="landing-hero-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
          gap: 'clamp(1.5rem, 4vw, 3rem)',
          alignItems: 'center',
        }}>
          {/* Left Column: Expressive Headline & Pill CTAs */}
          <div style={{ textAlign: 'left', position: 'relative', zIndex: 2 }}>
            <div style={{ marginBottom: '1.35rem' }}>
              <span className="pill-badge">
                <span className="status-dot online" />
                <span>AI-Powered Gesture Recognition</span>
              </span>
            </div>

            <h1 style={{
              marginBottom: '1.2rem',
              lineHeight: 1.08,
              fontSize: 'clamp(2.35rem, 4.8vw, 3.85rem)',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              letterSpacing: '-0.035em',
            }}>
              Control. Interact.
              <br />
              With a <span className="gradient-text">Gesture.</span>
            </h1>

            <p style={{
              fontSize: '1.05rem',
              color: 'var(--text-muted)',
              maxWidth: 500,
              marginBottom: '2rem',
              lineHeight: 1.65,
            }}>
              GestureBridge brings your hands to life — turning simple ASL &amp; ISL gestures into
              real-time text and speech directly in your browser with zero video leaving your device.
            </p>

            {/* Primary & Secondary Pill CTAs */}
            <div style={{ display: 'flex', gap: '.9rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
              <Link to="/register" className="btn btn-ink btn-lg" style={{ gap: '.65rem', padding: '.85rem 1.7rem' }}>
                <span>Try It Now</span>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.22)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem',
                }}>
                  ▶
                </span>
              </Link>
              <a href="#key-features" className="btn btn-outline btn-lg" style={{ padding: '.85rem 1.6rem' }}>
                Learn More <span aria-hidden="true">↓</span>
              </a>
            </div>

            {/* Clean Telemetry Strip */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1.25rem',
              paddingTop: '1.4rem',
              borderTop: '1px solid var(--border)',
              maxWidth: 480,
            }}>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-main)', letterSpacing: '-0.025em' }}>0ms</div>
                <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '.15rem' }}>Cloud Transmission</div>
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--color-primary)', letterSpacing: '-0.025em' }}>21 Pts</div>
                <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '.15rem' }}>3D Hand Coordinates</div>
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--color-tertiary)', letterSpacing: '-0.025em' }}>98.4%</div>
                <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '.15rem' }}>Vocabulary Accuracy</div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive 3D Hand & Spatial Elements */}
          <div>
            <Hero3DScene dark={dark} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          KEY FEATURES ASYMMETRIC SHOWCASE (Ref Image Bottom)
      ══════════════════════════════════════════ */}
      <section
        id="key-features"
        style={{
          position: 'relative',
          zIndex: 2,
          background: dark ? 'rgba(21, 20, 33, 0.72)' : 'rgba(255, 255, 255, 0.72)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          borderRadius: '36px 36px 0 0',
          padding: 'clamp(3rem, 5vw, 4.5rem) clamp(1rem, 4vw, 3rem)',
          marginTop: '1rem',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div className="key-features-split" style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 2fr)',
            gap: 'clamp(1.75rem, 4vw, 3rem)',
            alignItems: 'center',
          }}>
            {/* Left Copy */}
            <div>
              <span className="badge badge-primary" style={{ marginBottom: '1rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />
                Key Features
              </span>
              <h2 style={{
                fontSize: 'clamp(1.75rem, 3.2vw, 2.35rem)',
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: '-0.03em',
                marginBottom: '.9rem',
              }}>
                Smart Gestures.
                <br />
                Endless <span className="gradient-text-warm">Possibilities.</span>
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '.94rem', marginBottom: '1.25rem', lineHeight: 1.65 }}>
                Experience seamless interaction with our cutting-edge sign recognition and synthesis technology.
              </p>
              <a
                href="#features"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.4rem',
                  color: 'var(--color-primary)',
                  fontWeight: 700,
                  fontSize: '.9rem',
                }}
              >
                Explore Features <span aria-hidden="true">→</span>
              </a>
            </div>

            {/* Right 3 Glossy 3D Cards */}
            <div className="highlights-grid">
              {KEY_HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="card-3d"
                  style={{
                    padding: '1.85rem 1.4rem',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '.9rem',
                  }}
                >
                  <Feature3DIcon type={item.type} size={88} />
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '.35rem' }}>
                      {item.title}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '.84rem', lineHeight: 1.55, margin: 0 }}>
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          STATS STRIP (Animated Counter)
      ══════════════════════════════════════════ */}
      <section
        ref={statsRef}
        style={{
          padding: 'clamp(2.25rem, 4vw, 3.25rem) clamp(1rem, 4vw, 3rem)',
          maxWidth: 1240,
          margin: '0 auto',
        }}
      >
        <div
          className="card"
          style={{
            padding: '1.75rem 1.5rem',
            background: dark ? 'var(--bg-card)' : 'linear-gradient(135deg, #FFFFFF 0%, #F7F4FF 100%)',
          }}
        >
          <div className="stats-grid">
            {STATS.map((s) => (
              <StatCell key={s.label} stat={s} started={statsVisible} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FULL FEATURES BENTO GRID
      ══════════════════════════════════════════ */}
      <section
        id="features"
        style={{
          padding: 'clamp(2.5rem, 5vw, 4.5rem) clamp(1rem, 4vw, 3rem)',
          maxWidth: 1240,
          margin: '0 auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.75rem' }}>
          <span className="badge badge-primary" style={{ marginBottom: '.75rem' }}>Capabilities</span>
          <h2 style={{ marginBottom: '.65rem' }}>Everything you need for bi-directional sign translation</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 580, margin: '0 auto' }}>
            Built with MediaPipe Holistic, a custom bidirectional LSTM neural network, and WLASL video synthesis.
          </p>
        </div>

        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-3d" style={{ padding: '1.65rem', display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 16,
                background: featureBg(f.bg, f.accent),
                color: f.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 8px 18px -6px ${f.accent}40`,
              }}>
                <Icon d={f.icon} size={22} />
              </div>
              <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>{f.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════ */}
      <section
        id="how-it-works"
        style={{
          padding: 'clamp(2.5rem, 5vw, 4.5rem) clamp(1rem, 4vw, 3rem)',
          maxWidth: 1240,
          margin: '0 auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.75rem' }}>
          <span className="badge badge-primary" style={{ marginBottom: '.75rem' }}>Workflow</span>
          <h2 style={{ marginBottom: '.65rem' }}>From webcam gesture to spoken word in three steps</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 540, margin: '0 auto' }}>
            No special hardware or downloads required — everything runs right inside your modern web browser.
          </p>
        </div>

        <div className="steps-grid">
          {STEPS.map((st) => (
            <div key={st.n} className="card-3d" style={{ padding: '1.75rem', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 15,
                  background: `${st.accent}1A`,
                  color: st.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon d={st.icon} size={21} />
                </div>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: '1.5rem',
                  color: st.accent,
                  opacity: 0.45,
                }}>
                  {st.n}
                </span>
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>{st.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', lineHeight: 1.65, margin: 0 }}>{st.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          PERMISSIONS INFO — camera / mic / privacy
      ══════════════════════════════════════════ */}
      <section id="permissions" style={{
        background: dark ? 'rgba(29, 27, 46, 0.55)' : 'linear-gradient(180deg, #F5F2FF 0%, #FAF8F5 100%)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: 'clamp(3rem, 5vw, 4.5rem) clamp(1rem, 4vw, 3rem)',
      }}>
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span className="badge badge-primary" style={{ marginBottom: '.75rem' }}>Browser Permissions</span>
            <h2 style={{ marginBottom: '.6rem' }}>What your browser will ask for</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.95rem', maxWidth: 540, margin: '0 auto' }}>
              GestureBridge requires webcam access to detect hand gestures.
              All processing happens locally — nothing is uploaded.
            </p>
          </div>

          <div className="permissions-grid">
            {[
              {
                icon: ['M23 7l-7 5 7 5V7z','M1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1'],
                title: 'Camera (Required)',
                color: '#6B4CFF',
                required: true,
                desc: 'The Sign-to-Text feature streams your webcam feed to MediaPipe for hand-landmark detection. No frames are sent to our servers.',
                tip: 'When prompted by the browser, click "Allow". You can revoke access from the address bar at any time.',
              },
              {
                icon: ['M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z','M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8'],
                title: 'Microphone (Optional)',
                color: '#10B981',
                required: false,
                desc: 'Sign-to-Text does not capture audio. Microphone is only requested if you choose to dictate text in Text-to-Sign voice mode.',
                tip: 'Your browser only asks when you press the Voice Input button. You can decline it and type normally.',
              },
              {
                icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
                title: 'Privacy guarantee',
                color: '#F59E0B',
                required: false,
                desc: 'All landmark extraction runs entirely in your browser via WebAssembly (MediaPipe). Raw pixels never leave your device.',
                tip: 'Enable Privacy Mode in Account → Privacy to disable saving translation history to your account.',
              },
            ].map(p => (
              <div key={p.title} className="card-3d" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: `${p.color}18`, color: p.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon d={p.icon} size={19} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text-main)' }}>{p.title}</div>
                    <span className={`badge ${p.required ? 'badge-primary' : 'badge-success'}`} style={{ marginTop: '.25rem', fontSize: '.65rem', padding: '.15rem .5rem' }}>
                      {p.required ? 'Required' : 'Not required'}
                    </span>
                  </div>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', lineHeight: 1.65, margin: 0 }}>{p.desc}</p>
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '.5rem',
                  padding: '.7rem .85rem', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.55,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '.15rem', color: p.color }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {p.tip}
                </div>
              </div>
            ))}
          </div>

          {/* Browser-specific tips */}
          <div className="card" style={{
            marginTop: '1.75rem',
            padding: '1.1rem 1.4rem',
            display: 'flex', gap: '.85rem', alignItems: 'flex-start', flexWrap: 'wrap',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '.15rem' }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.65, flex: 1 }}>
              <strong style={{ color: 'var(--text-main)' }}>Camera not working?</strong>
              {' '}Check your browser&apos;s site permissions (address bar → lock icon → Camera → Allow).
              On mobile, go to <strong>Settings → Apps → Browser → Permissions → Camera</strong> and enable it.
              HTTPS is required on most browsers for webcam access in production.
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA BANNER
      ══════════════════════════════════════════ */}
      <section style={{ padding: 'clamp(2.5rem, 5vw, 4rem) clamp(1rem, 4vw, 3rem)' }}>
        <div style={{
          maxWidth: 1120,
          margin: '0 auto',
          background: 'linear-gradient(135deg, #6B4CFF 0%, #8B5CF6 52%, #EC4899 100%)',
          borderRadius: '32px',
          padding: 'clamp(2.5rem, 5vw, 4rem) clamp(1.5rem, 4vw, 3rem)',
          textAlign: 'center',
          boxShadow: '0 24px 54px -14px rgba(107, 76, 255, 0.42)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Soft decorative gloss orbs inside banner */}
          <div aria-hidden="true" style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', pointerEvents: 'none' }} />
          <div aria-hidden="true" style={{ position: 'absolute', bottom: -80, left: -40, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

          <h2 style={{ color: '#fff', marginBottom: '.75rem', fontSize: 'clamp(1.5rem, 3.2vw, 2.25rem)', position: 'relative' }}>
            Ready to break the communication barrier?
          </h2>
          <p style={{ color: 'rgba(255,255,255,.88)', fontSize: '.98rem', maxWidth: 500, margin: '0 auto 2rem', position: 'relative' }}>
            Create a free account and translate your first sign in under a minute.
          </p>
          <Link to="/register" className="btn btn-lg" style={{
            background: '#FFFFFF', color: '#181823',
            border: '1px solid transparent', fontWeight: 700, minWidth: 230,
            boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
            position: 'relative',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            Create Free Account
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer style={{
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        padding: '1.35rem clamp(1rem, 4vw, 3rem)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem' }}>
          <BrandLogo size={24} />
          <span style={{ color: 'var(--text-main)', fontSize: '.86rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>GestureBridge</span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '.8rem', textAlign: 'center' }}>
          © {new Date().getFullYear()} GestureBridge &nbsp;·&nbsp; React · Flask · PyTorch · MediaPipe
        </span>
        <div style={{ display: 'flex', gap: '1.1rem', alignItems: 'center' }}>
          <a href="#features"    style={{ color: 'var(--text-muted)', fontSize: '.82rem', fontWeight: 500 }}>Features</a>
          <a href="#how-it-works" style={{ color: 'var(--text-muted)', fontSize: '.82rem', fontWeight: 500 }}>How It Works</a>
          <a href="#permissions" style={{ color: 'var(--text-muted)', fontSize: '.82rem', fontWeight: 500 }}>Permissions</a>
        </div>
      </footer>

      {/* ── Scoped CSS ──────────────────────────────────────────── */}
      <style>{`
        .landing-nav-link {
          padding: .45rem .85rem;
          font-size: .88rem;
          font-weight: 500;
          color: var(--text-muted);
          text-decoration: none;
          border-radius: var(--radius-full);
          transition: color 0.15s, background 0.15s;
          white-space: nowrap;
          position: relative;
        }
        .landing-nav-link:hover { color: var(--text-main); background: var(--bg-surface); }
        .landing-nav-link.active-nav { color: var(--color-primary); font-weight: 700; }
        .landing-nav-link.active-nav::after {
          content: '';
          position: absolute;
          left: .9rem;
          right: .9rem;
          bottom: 2px;
          height: 2px;
          border-radius: 2px;
          background: var(--color-primary);
        }

        .landing-desktop-links   { display: flex; gap: .35rem; align-items: center; }
        .landing-desktop-auth    { display: flex; gap: .6rem; align-items: center; }
        .landing-mobile-controls { display: none; gap: .5rem; align-items: center; }

        .highlights-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.15rem;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.25rem;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.35rem;
        }
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.35rem;
        }
        .permissions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.35rem;
        }

        @media (max-width: 1024px) {
          .key-features-split { grid-template-columns: 1fr !important; }
          .features-grid      { grid-template-columns: repeat(2, 1fr); }
          .permissions-grid   { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 900px) {
          .landing-hero-grid { grid-template-columns: 1fr !important; }
        }

        @media (max-width: 768px) {
          .landing-desktop-links   { display: none; }
          .landing-desktop-auth    { display: none; }
          .landing-mobile-controls { display: flex; }
          .hide-on-mobile          { display: none !important; }

          .highlights-grid   { grid-template-columns: 1fr; }
          .stats-grid        { grid-template-columns: repeat(2, 1fr); gap: 1rem; }
          .features-grid     { grid-template-columns: 1fr; }
          .steps-grid        { grid-template-columns: 1fr; }
          .permissions-grid  { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
