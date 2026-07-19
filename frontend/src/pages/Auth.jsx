/**
 * Auth Page — Login · Register · OTP Verification · Guest access.
 *
 * Flow:
 *   Login  → credentials → dashboard
 *   Register → credentials → OTP screen (6-digit code) → dashboard
 *   Guest  → instant dashboard (no persistence)
 *
 * Google OAuth: redirects to /api/auth/google (backend handles the OAuth dance).
 * OTP: a 6-digit code is shown in a simulated "email" (frontend-only demo);
 *      in production wire POST /verify-otp and POST /resend-otp endpoints.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser, getProfile, getErrorMessage } from '../services/api';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useSettings } from '../context/SettingsContext';

/* ── Icons ─────────────────────────────────────────────────────── */
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
const GoogleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const BrandLogo = ({ size = 36, white = false }) => (
  <div style={{
    width: size, height: size, borderRadius: Math.round(size * 0.25),
    background: white ? 'rgba(255,255,255,0.18)' : 'var(--color-primary)',
    border: white ? '1px solid rgba(255,255,255,0.25)' : 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }}>
    <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none"
      stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0" />
    </svg>
  </div>
);

const BRAND_BULLETS = [
  { icon: 'M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0', text: 'Real-time ASL recognition via webcam' },
  { icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',  text: 'Text to sign video from WLASL dataset' },
  { icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',                text: 'No video ever leaves your browser' },
  { icon: 'M12 8v4l3 3M3.05 11a9 9 0 110 2',                             text: 'Full translation history saved to account' },
];

/* ── OTP digit input ───────────────────────────────────────────── */
function OtpInput({ value, onChange, disabled }) {
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = (value + '      ').slice(0, 6).split('');

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next);
      if (i > 0) refs[i - 1].current?.focus();
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) { refs[i - 1].current?.focus(); return; }
    if (e.key === 'ArrowRight' && i < 5) { refs[i + 1].current?.focus(); return; }
    if (!/^\d$/.test(e.key)) return;
    const next = value.slice(0, i) + e.key + value.slice(i + 1);
    onChange(next.slice(0, 6));
    if (i < 5) refs[i + 1].current?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) { onChange(pasted); refs[Math.min(pasted.length, 5)].current?.focus(); }
    e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d.trim()}
          disabled={disabled}
          onChange={() => {}}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          style={{
            width: 44, height: 52,
            textAlign: 'center',
            fontSize: '1.35rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '.05em',
            borderRadius: 'var(--radius-sm)',
            border: `2px solid ${d.trim() ? 'var(--color-primary)' : 'var(--border)'}`,
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            outline: 'none',
            transition: 'border-color 0.15s',
            caretColor: 'transparent',
          }}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ── Countdown timer ───────────────────────────────────────────── */
function useCountdown(seconds, active) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (!active) return;
    setRemaining(seconds);
    const id = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [active, seconds]);
  return remaining;
}

/* ── Generate a random 6-digit demo OTP ───────────────────────── */
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));

/* ══════════════════════════════════════════════════════════════════
   Main Auth component
══════════════════════════════════════════════════════════════════ */
export default function Auth({ defaultTab = 'login' }) {
  // 'login' | 'register' | 'otp'
  const [screen,     setScreen]     = useState(defaultTab === 'register' ? 'register' : 'login');
  const [loading,    setLoading]    = useState(false);
  const [guestLoad,  setGuestLoad]  = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [showPwd,    setShowPwd]    = useState(false);

  // Login fields
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName,     setRegName]     = useState('');
  const [regEmail,    setRegEmail]    = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm,  setRegConfirm]  = useState('');

  // OTP state
  const [otpValue,     setOtpValue]     = useState('');
  const [demoOtp,      setDemoOtp]      = useState('');      // shown to user (demo only)
  const [otpActive,    setOtpActive]    = useState(false);   // drives countdown
  const [resendCount,  setResendCount]  = useState(0);
  const countdown = useCountdown(60, otpActive);

  const { login, loginAsGuest } = useAuth();
  const { toggleTheme, theme } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';
  const dark = theme === 'dark';

  const clearMessages = () => { setError(''); setSuccess(''); };
  const switchScreen = (s) => { setScreen(s); clearMessages(); setOtpValue(''); };

  /* ── Login ─────────────────────────────────────────────────── */
  const handleLogin = async (e) => {
    e.preventDefault(); clearMessages();
    if (!loginEmail || !loginPassword) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const { data } = await loginUser({ email: loginEmail, password: loginPassword });
      const token = data.token;
      localStorage.setItem('gb_token', token);
      let user = { email: loginEmail, name: loginEmail.split('@')[0] };
      try { const r = await getProfile(); user = r.data; } catch { /* fallback */ }
      login(token, user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* ── Register → trigger OTP ────────────────────────────────── */
  const handleRegister = async (e) => {
    e.preventDefault(); clearMessages();
    if (!regName || !regEmail || !regPassword || !regConfirm) { setError('Please fill in all fields.'); return; }
    if (regPassword !== regConfirm) { setError('Passwords do not match.'); return; }
    if (regPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await registerUser({ name: regName, email: regEmail, password: regPassword });
      // Generate demo OTP (in production, backend sends the email)
      const code = genOtp();
      setDemoOtp(code);
      setOtpValue('');
      setOtpActive(false);
      setTimeout(() => setOtpActive(true), 50); // start countdown after state settles
      setScreen('otp');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* ── OTP verify ─────────────────────────────────────────────── */
  const handleVerifyOtp = async (e) => {
    e?.preventDefault(); clearMessages();
    if (otpValue.length !== 6) { setError('Please enter the full 6-digit code.'); return; }
    setLoading(true);
    try {
      // Demo: accept demoOtp or the hardcoded bypass "000000"
      const valid = otpValue === demoOtp || otpValue === '000000';
      await new Promise(r => setTimeout(r, 800)); // simulate network
      if (!valid) { setError('Incorrect code. Please try again.'); setLoading(false); return; }
      // Auto-login after verification
      try {
        const { data } = await loginUser({ email: regEmail, password: regPassword });
        const token = data.token;
        localStorage.setItem('gb_token', token);
        let user = { email: regEmail, name: regName };
        try { const r = await getProfile(); user = r.data; } catch { /* fallback */ }
        login(token, user);
        navigate(from, { replace: true });
      } catch {
        setSuccess('Email verified! Please sign in.');
        switchScreen('login');
        setLoginEmail(regEmail);
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Resend OTP ─────────────────────────────────────────────── */
  const handleResend = () => {
    if (countdown > 0) return;
    const code = genOtp();
    setDemoOtp(code);
    setOtpValue('');
    setOtpActive(false);
    setTimeout(() => setOtpActive(true), 50);
    setResendCount(c => c + 1);
    setSuccess('A new code has been sent to your email.');
  };

  /* ── Guest ──────────────────────────────────────────────────── */
  const handleGuest = async () => {
    setGuestLoad(true);
    await new Promise(r => setTimeout(r, 500));
    loginAsGuest();
    navigate('/dashboard', { replace: true });
  };

  /* ── Google OAuth ───────────────────────────────────────────── */
  const handleGoogle = () => {
    // In production: window.location.href = '/api/auth/google';
    setError('Google sign-in is coming soon. Use email or continue as guest for now.');
  };

  /* ── Auto-submit OTP when all 6 digits entered ─────────────── */
  useEffect(() => {
    if (otpValue.length === 6 && screen === 'otp' && !loading) {
      handleVerifyOtp();
    }
  }, [otpValue]); // eslint-disable-line

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top nav ── */}
      <nav style={{
        padding: '.8rem clamp(1rem, 4vw, 2rem)',
        display: 'flex', alignItems: 'center', gap: '.75rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', textDecoration: 'none', flex: 1 }}>
          <BrandLogo size={26} />
          <span style={{ fontWeight: 800, fontSize: '.9rem', letterSpacing: '-.02em', color: 'var(--text-main)' }}>
            GestureBridge
          </span>
        </Link>
        <button onClick={toggleTheme} className="btn-icon" aria-label="Toggle theme">
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        {screen === 'otp'
          ? null
          : screen === 'login'
            ? <Link to="/register" className="btn btn-primary btn-sm" style={{ fontWeight: 600 }}>Create Account</Link>
            : <Link to="/login"    className="btn btn-ghost btn-sm">Sign In</Link>
        }
      </nav>

      {/* ── Split layout ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Brand panel (hidden on mobile) */}
        <div className="auth-brand-panel" style={{
          background: 'var(--color-primary)',
          padding: '3rem 2.5rem',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '1.5rem' }}>
              <BrandLogo size={38} white />
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-.02em' }}>GestureBridge</span>
            </div>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1.3rem, 2.5vw, 1.65rem)', marginBottom: '.75rem', lineHeight: 1.3 }}>
              Breaking barriers<br />one gesture at a time
            </h2>
            <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '.9rem', lineHeight: 1.75 }}>
              The AI-powered bridge between ASL and English — entirely in your browser.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            {BRAND_BULLETS.map((b) => (
              <div key={b.text} style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(255,255,255,.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(255,255,255,.9)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d={b.icon} />
                  </svg>
                </div>
                <span style={{ color: 'rgba(255,255,255,.85)', fontSize: '.85rem', lineHeight: 1.6 }}>{b.text}</span>
              </div>
            ))}
          </div>
          {/* Guest hint */}
          <div style={{ marginTop: '2.5rem', padding: '.9rem 1rem', borderRadius: 8, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)' }}>
            <div style={{ color: '#fff', fontSize: '.8rem', fontWeight: 600, marginBottom: '.25rem' }}>Just exploring?</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.78rem', lineHeight: 1.5 }}>
              Try Guest mode to use Sign to Text and Text to Sign without an account. History won't be saved.
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem 1rem', background: 'var(--bg-page)',
          overflowY: 'auto',
        }}>
          <div style={{
            width: '100%', maxWidth: 420,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '2.25rem 2rem',
            boxShadow: 'var(--shadow-lg)',
          }}>

            {/* ════════════════════════════════════
                OTP VERIFICATION SCREEN
            ════════════════════════════════════ */}
            {screen === 'otp' && (
              <>
                {/* Back arrow */}
                <button onClick={() => switchScreen('register')} style={{
                  display: 'flex', alignItems: 'center', gap: '.35rem',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '.8125rem', marginBottom: '1.25rem', padding: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                  Back
                </button>

                {/* Email icon */}
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: dark ? '#0D2149' : '#EFF6FF', color: 'var(--color-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '.4rem' }}>Verify your email</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', lineHeight: 1.6 }}>
                    We sent a 6-digit code to{' '}
                    <strong style={{ color: 'var(--text-main)' }}>{regEmail}</strong>.
                    <br />Enter it below to confirm your account.
                  </p>
                </div>

                {error   && <Alert type="error"   message={error}   onClose={clearMessages} />}
                {success && <Alert type="success" message={success} onClose={clearMessages} />}

                {/* Demo: show the code in a hint box */}
                {demoOtp && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '.6rem',
                    padding: '.65rem .9rem', borderRadius: 'var(--radius-sm)',
                    background: dark ? '#0D2149' : '#EFF6FF',
                    border: `1px solid ${dark ? '#1E3A5F' : '#BFDBFE'}`,
                    marginBottom: '1.25rem',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                      Demo code (email not sent):{' '}
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', letterSpacing: '.12em' }}>
                        {demoOtp}
                      </strong>
                    </span>
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} noValidate>
                  <OtpInput value={otpValue} onChange={setOtpValue} disabled={loading} />

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || otpValue.length < 6}
                    style={{ width: '100%', padding: '.65rem', fontSize: '.9375rem', fontWeight: 600, gap: '.4rem' }}
                  >
                    {loading
                      ? <><Spinner size="sm" /> Verifying…</>
                      : <>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Verify Email
                        </>
                    }
                  </button>
                </form>

                {/* Resend + countdown */}
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: '.4rem' }}>
                    Didn't receive the code?
                  </p>
                  {countdown > 0 ? (
                    <p style={{ fontSize: '.8125rem', color: 'var(--text-light)' }}>
                      Resend available in{' '}
                      <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                        {countdown}s
                      </span>
                    </p>
                  ) : (
                    <button
                      onClick={handleResend}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600, fontSize: '.8125rem' }}
                    >
                      {resendCount > 0 ? 'Resend again' : 'Resend code'}
                    </button>
                  )}
                </div>

                {/* Digits counter */}
                <div style={{ textAlign: 'center', marginTop: '.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '.25rem' }}>
                    {[0,1,2,3,4,5].map(i => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: i < otpValue.length ? 'var(--color-primary)' : 'var(--border)',
                        transition: 'background 0.15s',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '.72rem', color: 'var(--text-light)', marginTop: '.35rem', display: 'block' }}>
                    {otpValue.length}/6 digits entered
                  </span>
                </div>
              </>
            )}

            {/* ════════════════════════════════════
                LOGIN / REGISTER SCREENS
            ════════════════════════════════════ */}
            {screen !== 'otp' && (
              <>
                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ marginBottom: '.3rem', fontSize: '1.35rem' }}>
                    {screen === 'login' ? 'Welcome back' : 'Create your account'}
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>
                    {screen === 'login'
                      ? 'Sign in to continue to GestureBridge'
                      : 'Join GestureBridge — free, no card required'}
                  </p>
                </div>

                {/* Tab switcher */}
                <div style={{
                  display: 'flex', gap: '.25rem',
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                  padding: '.25rem', marginBottom: '1.25rem',
                }}>
                  {[{ key:'login', label:'Sign In' }, { key:'register', label:'Register' }].map((t) => (
                    <button key={t.key} onClick={() => switchScreen(t.key)} style={{
                      flex: 1, padding: '.5rem',
                      borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                      fontWeight: 600, fontSize: '.875rem',
                      background: screen === t.key ? 'var(--bg-card)' : 'transparent',
                      color: screen === t.key ? 'var(--color-primary)' : 'var(--text-muted)',
                      boxShadow: screen === t.key ? 'var(--shadow-sm)' : 'none',
                      transition: 'all var(--transition)',
                    }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {error   && <Alert type="error"   message={error}   onClose={clearMessages} />}
                {success && <Alert type="success" message={success} onClose={clearMessages} />}

                {/* Google OAuth */}
                <button type="button" onClick={handleGoogle} className="btn btn-ghost"
                  style={{ width: '100%', gap: '.6rem', marginBottom: '.75rem', justifyContent: 'center', fontWeight: 600 }}>
                  <GoogleIcon />
                  Continue with Google
                </button>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '.73rem', color: 'var(--text-light)', fontWeight: 500 }}>or use email</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                {/* ── LOGIN form ── */}
                {screen === 'login' && (
                  <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '.875rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="login-email">Email Address</label>
                      <input id="login-email" type="email" className="form-input" placeholder="you@example.com"
                        value={loginEmail} onChange={e => setLoginEmail(e.target.value)} autoComplete="email" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="login-password">Password</label>
                      <div style={{ position: 'relative' }}>
                        <input id="login-password" type={showPwd ? 'text' : 'password'} className="form-input"
                          placeholder="••••••••" value={loginPassword}
                          onChange={e => setLoginPassword(e.target.value)}
                          autoComplete="current-password" style={{ paddingRight: '2.5rem' }} required />
                        <button type="button" onClick={() => setShowPwd(v => !v)}
                          style={{ position:'absolute', right:'.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-light)', padding:0 }}
                          aria-label={showPwd ? 'Hide' : 'Show'}>
                          {showPwd
                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" /></svg>
                            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          }
                        </button>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={loading}
                      style={{ width:'100%', padding:'.65rem', fontSize:'.9375rem', fontWeight:600 }}>
                      {loading ? <><Spinner size="sm" /> Signing In…</> : 'Sign In →'}
                    </button>
                  </form>
                )}

                {/* ── REGISTER form ── */}
                {screen === 'register' && (
                  <form onSubmit={handleRegister} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '.875rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-name">Full Name</label>
                      <input id="reg-name" type="text" className="form-input" placeholder="Your Name"
                        value={regName} onChange={e => setRegName(e.target.value)} autoComplete="name" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-email">Email Address</label>
                      <input id="reg-email" type="email" className="form-input" placeholder="you@example.com"
                        value={regEmail} onChange={e => setRegEmail(e.target.value)} autoComplete="email" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-password">Password</label>
                      <input id="reg-password" type="password" className="form-input" placeholder="At least 6 characters"
                        value={regPassword} onChange={e => setRegPassword(e.target.value)} autoComplete="new-password" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
                      <input id="reg-confirm" type="password" className="form-input" placeholder="Repeat password"
                        value={regConfirm} onChange={e => setRegConfirm(e.target.value)} autoComplete="new-password" required />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={loading}
                      style={{ width:'100%', padding:'.65rem', fontSize:'.9375rem', fontWeight:600 }}>
                      {loading ? <><Spinner size="sm" /> Creating Account…</> : 'Create Account & Verify Email →'}
                    </button>
                    <p style={{ fontSize:'.73rem', color:'var(--text-light)', textAlign:'center', margin:0 }}>
                      A 6-digit code will be sent to your email to confirm your account.
                    </p>
                  </form>
                )}

                {/* Guest login */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <button type="button" onClick={handleGuest} disabled={guestLoad}
                    className="btn btn-subtle" style={{ width: '100%', gap: '.5rem', justifyContent: 'center' }}>
                    {guestLoad
                      ? <><Spinner size="sm" /> Loading Guest Session…</>
                      : <>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                          </svg>
                          Continue as Guest
                        </>
                    }
                  </button>
                  <p style={{ textAlign:'center', marginTop:'.5rem', fontSize:'.72rem', color:'var(--text-light)' }}>
                    Guest sessions are temporary — history won't be saved.
                  </p>
                </div>

                {/* Switch link */}
                <p style={{ textAlign:'center', marginTop:'1rem', fontSize:'.85rem', color:'var(--text-muted)' }}>
                  {screen === 'login'
                    ? <>Don't have an account?{' '}
                        <button onClick={() => switchScreen('register')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-primary)', fontWeight:600, fontSize:'inherit' }}>Register free</button>
                      </>
                    : <>Already have an account?{' '}
                        <button onClick={() => switchScreen('login')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-primary)', fontWeight:600, fontSize:'inherit' }}>Sign In</button>
                      </>
                  }
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .auth-brand-panel { width: 380px; flex-shrink: 0; }
        @media (max-width: 820px) { .auth-brand-panel { display: none; } }

        /* OTP digit focus */
        input[type="text"]:focus {
          border-color: var(--color-primary) !important;
          box-shadow: 0 0 0 3px rgb(37 99 235 / .15);
        }
      `}</style>
    </div>
  );
}
