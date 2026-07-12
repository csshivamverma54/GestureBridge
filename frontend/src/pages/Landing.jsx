/**
 * Landing Page — public-facing hero page for GestureBridge.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

/* ── Inline SVG helpers ──────────────────────────────────── */
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);
const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    <circle cx="12" cy="12" r="5" />
  </svg>
);

const FEATURES = [
  {
    icon: ['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0'],
    title: 'Sign to Text',
    desc: 'Webcam-based real-time ASL recognition. Our model reads hand gestures frame-by-frame and produces text output with high confidence scoring.',
  },
  {
    icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    title: 'Text to Sign',
    desc: 'Type any word and watch GestureBridge retrieve and play the corresponding WLASL sign video — building a bridge in the other direction.',
  },
  {
    icon: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    title: 'LSTM Neural Network',
    desc: 'Custom three-layer LSTM trained on 800+ WLASL sign classes using bilateral hand landmark sequences for accurate recognition.',
  },
  {
    icon: ['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2'],
    title: 'Translation History',
    desc: 'Every session is persisted to your account. Search, review and export past translations at any time.',
  },
  {
    icon: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'],
    title: 'Live Confidence Scores',
    desc: 'Each prediction includes a confidence percentage and top-5 alternatives, so you can verify or adjust the result instantly.',
  },
  {
    icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    title: 'Secure & Private',
    desc: 'JWT-authenticated accounts, optional privacy mode that disables history saving, and no raw video is ever sent to the server.',
  },
];

const STATS = [
  { value: '800+', label: 'Sign Classes'       },
  { value: '< 1s', label: 'Inference Latency'  },
  { value: 'WLASL', label: 'Training Dataset'  },
  { value: 'ASL',  label: 'Language Support'   },
];

export default function Landing() {
  const { toggleTheme, theme } = useSettings();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-main)' }}>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        height: 56,
        display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        {/* Brand */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flex: 1, textDecoration: 'none' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
              <path d="M12 12h4v3a5 5 0 01-8.54 3.54" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '.9rem', letterSpacing: '-.01em', color: 'var(--text-main)' }}>
            GestureBridge
          </span>
        </Link>

        <button onClick={toggleTheme} className="btn-icon" aria-label="Toggle theme">
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
        <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
        <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section style={{
        padding: '5rem 2rem 4rem',
        maxWidth: 760, margin: '0 auto',
        textAlign: 'center',
      }}>
        <div className="badge badge-primary" style={{ marginBottom: '1.25rem', display: 'inline-flex' }}>
          AI-Powered Sign Language Recognition
        </div>

        <h1 style={{ marginBottom: '1.125rem', color: 'var(--text-main)' }}>
          Real-time Sign Language<br />Recognition &amp; Translation
        </h1>

        <p style={{ fontSize: '1rem', color: 'var(--text-muted)', maxWidth: 560, margin: '0 auto 2.25rem', lineHeight: 1.8 }}>
          GestureBridge uses computer vision and deep learning to enable
          bi-directional communication between sign-language users and
          the hearing world — in real time, in the browser.
        </p>

        <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" className="btn btn-primary btn-lg">
            Start Translating
          </Link>
          <Link to="/login" className="btn btn-ghost btn-lg">
            Sign In
          </Link>
        </div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        padding: '1.5rem 2rem',
      }}>
        <div style={{
          maxWidth: 800, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1.5rem', textAlign: 'center',
        }}>
          {STATS.map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '-.02em' }}>{s.value}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '.2rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ───────────────────────────────────────────── */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '4rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ marginBottom: '.5rem' }}>Platform Capabilities</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>
            Everything needed for inclusive, real-time sign language communication.
          </p>
        </div>
        <div className="grid-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon d={f.icon} />
              </div>
              <div>
                <h4 style={{ marginBottom: '.35rem' }}>{f.title}</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '.8375rem', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: '4rem 2rem',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ marginBottom: '.5rem' }}>How It Works</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>Three steps from gesture to text</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {[
              {
                n: '01', title: 'Enable Camera',
                desc: 'Grant webcam access. MediaPipe tracks 21 bilateral hand landmarks per frame directly in the browser — no video is uploaded.',
              },
              {
                n: '02', title: 'Perform a Sign',
                desc: 'Sign naturally in front of the camera. The LSTM model analyses a 30-frame window and predicts the word with a confidence score.',
              },
              {
                n: '03', title: 'Read the Output',
                desc: 'Stable predictions are committed to a sentence automatically. Copy the text, or use undo and clear to refine it.',
              },
            ].map((step) => (
              <div key={step.n} className="card">
                <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--color-primary)', marginBottom: '.75rem', fontFamily: 'var(--font-mono)' }}>
                  STEP {step.n}
                </div>
                <h4 style={{ marginBottom: '.4rem' }}>{step.title}</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '.8375rem', lineHeight: 1.65 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section style={{ textAlign: 'center', padding: '4.5rem 2rem' }}>
        <h2 style={{ marginBottom: '.75rem' }}>Ready to Get Started?</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '.9rem' }}>
          Create a free account and translate your first sign in under a minute.
        </p>
        <Link to="/register" className="btn btn-primary btn-lg">
          Create Free Account
        </Link>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '1.25rem 2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '.5rem',
      }}>
        <span style={{ color: 'var(--text-light)', fontSize: '.8rem' }}>
          © {new Date().getFullYear()} GestureBridge
        </span>
        <span style={{ color: 'var(--text-light)', fontSize: '.8rem' }}>
          Built with React · Flask · PyTorch · MediaPipe
        </span>
      </footer>
    </div>
  );
}
