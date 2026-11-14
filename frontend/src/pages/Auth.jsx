/**
 * Auth Page - Login - Register - OTP Verification - Guest access.
 *
 * Redesigned in the warm-cream, glossy 3D claymorphism aesthetic while preserving
 * 100% of authentication flows, OTP verification, Google OAuth, Guest access,
 * validation, state, and API calls.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser, getProfile, getErrorMessage } from '../services/api';
import api from '../services/api';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useSettings } from '../context/SettingsContext';
import BrandLogo from '../components/BrandLogo';
import Hero3DScene from '../components/Hero3DScene';

/* -- Icons -- */
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l-1.42-1.42" />
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

/* -- OTP digit input -- */
function OtpInput({ value, onChange, disabled }) {
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = (value + '      ').slice(0, 6).split('');

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      const next = value.slice(0, i) + value.slice(i + 1);
      onChange(next);
      if (i > 0) refs[i - 1].current.focus();
      return;
    }

    if (e.key === 'ArrowLeft' && i > 0) {
      refs[i - 1].current.focus();
      return;
    }

    if (e.key === 'ArrowRight' && i < 5) {
      refs[i + 1].current.focus();
      return;
    }

    if (!/^\d$/.test(e.key)) return;

    const next = value.slice(0, i) + e.key + value.slice(i + 1);
    onChange(next.slice(0, 6));

    if (i < 5) refs[i + 1].current.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pasted) {
      onChange(pasted);
      refs[Math.min(pasted.length, 5)].current.focus();
    }

    e.preventDefault();
  };

  return (
    <div
      className="otp-input-row"
      style={{
        display: 'flex',
        gap: '.6rem',
        justifyContent: 'center',
        marginBottom: '1.25rem',
        width: '100%',
      }}
    >
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
            width: '46px',
            height: '54px',
            textAlign: 'center',
            fontSize: '1.35rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            borderRadius: 'var(--radius-md)',
            border: `2px solid ${d.trim() ? 'var(--color-primary)' : 'var(--border)'}`,
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            caretColor: 'transparent',
            boxSizing: 'border-box',
            boxShadow: d.trim() ? '0 0 0 3px rgba(107, 76, 255, 0.14)' : 'var(--shadow-xs)',
          }}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* -- Countdown timer -- */
function useCountdown(seconds, active) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!active) return;

    setRemaining(seconds);

    const id = setInterval(
      () => setRemaining(r => Math.max(0, r - 1)),
      1000
    );

    return () => clearInterval(id);
  }, [active, seconds]);

  return remaining;
}

/* -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
   Main Auth component
-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*- */
export default function Auth({ defaultTab = 'login' }) {
  const [screen, setScreen] = useState(
    defaultTab === 'register' ? 'register' : 'login'
  );

  const [loading, setLoading] = useState(false);
  const [guestLoad, setGuestLoad] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // OTP state
  const [otpValue, setOtpValue] = useState('');
  const [otpActive, setOtpActive] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const countdown = useCountdown(60, otpActive);

  const { login, loginAsGuest } = useAuth();
  const { toggleTheme, theme } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';
  const dark = theme === 'dark';

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const switchScreen = (s) => {
    setScreen(s);
    clearMessages();
    setOtpValue('');
  };

  /* -- Login -- */
  const handleLogin = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!loginEmail || !loginPassword) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);

    try {
      const { data } = await loginUser({
        email: loginEmail,
        password: loginPassword
      });

      const token = data.token;
      localStorage.setItem('gb_token', token);

      let user = {
        email: loginEmail,
        name: loginEmail.split('@')[0]
      };

      try {
        const r = await getProfile();
        user = r.data;
      } catch {
        /* fallback */
      }

      login(token, user);

      requestAnimationFrame(() =>
        navigate(from, { replace: true })
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* -- Register - only sends OTP; does NOT create the account yet -- */
  const handleRegister = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!regName || !regEmail || !regPassword || !regConfirm) {
      setError('Please fill in all fields.');
      return;
    }

    if (regPassword !== regConfirm) {
      setError('Passwords do not match.');
      return;
    }

    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/otp/send', { email: regEmail });

      setOtpValue('');
      setOtpActive(false);
      setTimeout(() => setOtpActive(true), 50);
      setScreen('otp');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* -- OTP verify -> create account only after code is confirmed -- */
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    clearMessages();

    if (otpValue.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post('/otp/verify', {
        email: regEmail,
        code: otpValue
      });

      if (!data.valid) {
        setError(data.error || 'Incorrect code. Please try again.');
        setLoading(false);
        return;
      }

      await registerUser({
        name: regName,
        email: regEmail,
        password: regPassword
      });

      try {
        const { data: loginData } = await loginUser({
          email: regEmail,
          password: regPassword
        });

        const token = loginData.token;
        localStorage.setItem('gb_token', token);

        let user = { email: regEmail, name: regName };
        try {
          const r = await getProfile();
          user = r.data;
        } catch {
          /* fallback */
        }

        login(token, user);
        requestAnimationFrame(() => navigate(from, { replace: true }));
      } catch {
        setSuccess('Account created! Please sign in.');
        switchScreen('login');
        setLoginEmail(regEmail);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* -- Resend OTP -- */
  const handleResend = async () => {
    if (countdown > 0) return;

    setLoading(true);

    try {
      await api.post('/otp/send', {
        email: regEmail
      });

      setOtpValue('');
      setOtpActive(false);
      setTimeout(() => setOtpActive(true), 50);

      setResendCount(c => c + 1);
      setSuccess('A new code has been sent to your email.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* -- Guest -- */
  const handleGuest = async () => {
    setGuestLoad(true);
    await new Promise(r => setTimeout(r, 450));
    loginAsGuest();
    navigate('/dashboard', { replace: true });
  };

  /* -- Google OAuth -- */
  const handleGoogle = () => {
    const backendOrigin = import.meta.env.VITE_BACKEND_URL || '';
    window.location.href = `${backendOrigin}/auth/google`;
  };

  /* -- Auto-submit OTP -- */
  useEffect(() => {
    if (otpValue.length === 6 && screen === 'otp' && !loading) {
      handleVerifyOtp();
    }
  }, [otpValue]); // eslint-disable-line

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-page)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient pastel background glows */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: dark
            ? 'radial-gradient(circle at 18% 20%, rgba(124, 92, 255, 0.16), transparent 50%), radial-gradient(circle at 82% 78%, rgba(45, 212, 191, 0.08), transparent 45%)'
            : 'radial-gradient(circle at 18% 22%, rgba(167, 139, 250, 0.22), transparent 52%), radial-gradient(circle at 85% 75%, rgba(254, 215, 170, 0.30), transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* -- Top navigation bar -- */}
      <header
        className="glass-surface"
        style={{
          position: 'relative',
          zIndex: 10,
          padding: '0.85rem clamp(1.25rem, 5vw, 3rem)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            textDecoration: 'none',
          }}
        >
          <BrandLogo size={32} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.12rem',
              letterSpacing: '-0.03em',
              color: 'var(--text-main)',
            }}
          >
            GestureBridge
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={toggleTheme}
            className="btn-icon"
            aria-label="Toggle theme"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>

          {screen === 'otp' ? null : screen === 'login' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }} className="hide-sm">Don&apos;t have an account?</span>
              <button
                onClick={() => switchScreen('register')}
                className="btn btn-ink btn-sm"
                style={{ fontWeight: 600 }}
              >
                Sign Up
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }} className="hide-sm">Already have an account?</span>
              <button
                onClick={() => switchScreen('login')}
                className="btn btn-outline btn-sm"
                style={{ fontWeight: 600 }}
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </header>

      {/* -- Centered Main Split Layout -- */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(1.5rem, 4vw, 2.75rem) 1.25rem',
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div
          className="auth-container-card"
          style={{
            width: '100%',
            maxWidth: screen === 'otp' ? '470px' : '1040px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '30px',
            boxShadow: 'var(--shadow-lg)',
            display: 'grid',
            gridTemplateColumns: screen === 'otp' ? '1fr' : '1.05fr 1fr',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
          }}
        >
          {/* =================================================================
              LEFT PANEL: 3D Visual Showcase & Zero Server Streaming Guarantee
             ================================================================= */}
          {screen !== 'otp' && (
            <div
              className="auth-preview-panel"
              style={{
                background: dark
                  ? 'linear-gradient(155deg, #1B1830 0%, #151324 55%, #121A26 100%)'
                  : 'linear-gradient(155deg, #F4F0FF 0%, #FFF7ED 55%, #ECFDF5 100%)',
                borderRight: '1px solid var(--border)',
                padding: '2.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div>
                {/* Visual Eyebrow */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span className="pill-badge" style={{ padding: '.32rem .8rem', fontSize: '.74rem' }}>
                    <span className="status-dot online" />
                    On-Device Neural Engine
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    MediaPipe 3D
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: '1.45rem',
                    fontWeight: 800,
                    letterSpacing: '-0.025em',
                    marginBottom: '0.45rem',
                    color: 'var(--text-main)',
                  }}
                >
                  Real-time ASL spatial <span className="gradient-text">recognition</span>
                </h3>

                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.86rem',
                    lineHeight: 1.55,
                    marginBottom: '0.5rem',
                  }}
                >
                  21 skeletal landmarks per hand computed locally in your browser. Zero video frames leave your device.
                </p>

                {/* Compact 3D Hand & Spatial Objects Showcase */}
                <div style={{ margin: '0.25rem 0' }}>
                  <Hero3DScene dark={dark} compact />
                </div>

                {/* Trust Guarantee Box */}
                <div
                  className="glass-surface"
                  style={{
                    padding: '0.95rem 1.05rem',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '11px',
                      background: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
                      Zero Server Streaming Guarantee
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      Camera feed is processed strictly client-side via WebGL &amp; WebAssembly. No video recordings are ever transmitted.
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Micro Bullets */}
              <div
                style={{
                  marginTop: '1.25rem',
                  paddingTop: '0.95rem',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                <span>✓ 2,000+ WLASL Words</span>
                <span>✓ Client-Side Private</span>
                <span>✓ 0ms Video Relay</span>
              </div>
            </div>
          )}

          {/* =================================================================
              RIGHT PANEL: Authentication Forms (Login / Register / OTP)
             ================================================================= */}
          <div
            style={{
              padding: screen === 'otp' ? '2.5rem 2.25rem' : '2.4rem clamp(1.5rem, 3vw, 2.6rem)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            {/* ---------------------------------------------------------------
                OTP SCREEN
               --------------------------------------------------------------- */}
            {screen === 'otp' && (
              <div>
                <button
                  onClick={() => switchScreen('register')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '.82rem',
                    marginBottom: '1.25rem',
                    padding: 0,
                    fontWeight: 600,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                  Back to Registration
                </button>

                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '18px',
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.25rem',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.45rem', marginBottom: '.35rem', fontWeight: 800, letterSpacing: '-0.025em' }}>
                    Verify your email
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', lineHeight: 1.5 }}>
                    We sent a 6-digit confirmation code to{' '}
                    <strong style={{ color: 'var(--text-main)' }}>{regEmail}</strong>.
                  </p>
                </div>

                {error && <Alert type="error" message={error} onClose={clearMessages} />}
                {success && <Alert type="success" message={success} onClose={clearMessages} />}

                <form onSubmit={handleVerifyOtp} noValidate>
                  <OtpInput
                    value={otpValue}
                    onChange={setOtpValue}
                    disabled={loading}
                  />

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || otpValue.length < 6}
                    style={{
                      width: '100%',
                      height: '46px',
                      fontSize: '.9375rem',
                      fontWeight: 600,
                    }}
                  >
                    {loading ? (
                      <>
                        <Spinner size="sm" />
                        Verifying Code…
                      </>
                    ) : (
                      'Verify & Activate Account →'
                    )}
                  </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: '.35rem' }}>
                    Didn&apos;t receive the verification code?
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
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-primary)',
                        fontWeight: 700,
                        fontSize: '.825rem',
                      }}
                    >
                      {resendCount > 0 ? 'Resend new code' : 'Resend code now'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------------
                LOGIN / REGISTER FORM
               --------------------------------------------------------------- */}
            {screen !== 'otp' && (
              <div>
                {/* Header & Eyebrow */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <span className="badge badge-primary" style={{ marginBottom: '0.55rem' }}>
                    {screen === 'login' ? 'Workspace Authentication' : 'Create Account'}
                  </span>

                  <h2
                    style={{
                      fontSize: '1.55rem',
                      fontWeight: 800,
                      letterSpacing: '-0.03em',
                      color: 'var(--text-main)',
                      marginBottom: '0.3rem',
                    }}
                  >
                    {screen === 'login' ? 'Welcome back' : 'Start translating now'}
                  </h2>

                  <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                    {screen === 'login'
                      ? 'Access on-device sign language translation & saved history.'
                      : 'Join GestureBridge — 100% free, private on-device recognition.'}
                  </p>
                </div>

                {/* Segmented Mode Switcher */}
                <div
                  style={{
                    display: 'flex',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-full)',
                    padding: '4px',
                    marginBottom: '1.25rem',
                    border: '1px solid var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => switchScreen('login')}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-full)',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      background: screen === 'login' ? 'var(--bg-card)' : 'transparent',
                      color: screen === 'login' ? 'var(--color-primary)' : 'var(--text-muted)',
                      boxShadow: screen === 'login' ? 'var(--shadow-xs)' : 'none',
                      transition: 'all var(--transition)',
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => switchScreen('register')}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-full)',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      background: screen === 'register' ? 'var(--bg-card)' : 'transparent',
                      color: screen === 'register' ? 'var(--color-primary)' : 'var(--text-muted)',
                      boxShadow: screen === 'register' ? 'var(--shadow-xs)' : 'none',
                      transition: 'all var(--transition)',
                    }}
                  >
                    Create Account
                  </button>
                </div>

                {error && <Alert type="error" message={error} onClose={clearMessages} />}
                {success && <Alert type="success" message={success} onClose={clearMessages} />}

                {/* Google OAuth Button */}
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="btn btn-outline"
                  style={{
                    width: '100%',
                    height: '44px',
                    gap: '0.65rem',
                    marginBottom: '0.9rem',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                  }}
                >
                  <GoogleIcon />
                  Continue with Google
                </button>

                {/* Or Divider */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    or email
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                {/* -- LOGIN FORM -- */}
                {screen === 'login' && (
                  <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="login-email">
                        Email Address
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        className="form-input"
                        placeholder="you@domain.com"
                        value={loginEmail}
                        onChange={e => setLoginEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                        <label className="form-label" htmlFor="login-password" style={{ margin: 0 }}>
                          Password
                        </label>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <input
                          id="login-password"
                          type={showPwd ? 'text' : 'password'}
                          className="form-input"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={e => setLoginPassword(e.target.value)}
                          autoComplete="current-password"
                          style={{ paddingRight: '2.5rem', width: '100%', boxSizing: 'border-box' }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(v => !v)}
                          style={{
                            position: 'absolute',
                            right: '0.85rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-light)',
                            padding: 0,
                          }}
                          aria-label={showPwd ? 'Hide' : 'Show'}
                        >
                          {showPwd ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                      style={{
                        width: '100%',
                        height: '46px',
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        marginTop: '0.25rem',
                      }}
                    >
                      {loading ? (
                        <>
                          <Spinner size="sm" />
                          Authenticating…
                        </>
                      ) : (
                        'Log In to Workspace →'
                      )}
                    </button>
                  </form>
                )}

                {/* -- REGISTER FORM -- */}
                {screen === 'register' && (
                  <form onSubmit={handleRegister} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="reg-name">
                        Full Name
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        className="form-input"
                        placeholder="Alex Morgan"
                        value={regName}
                        onChange={e => setRegName(e.target.value)}
                        autoComplete="name"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="reg-email">
                        Email Address
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        className="form-input"
                        placeholder="you@domain.com"
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="reg-password">
                        Password
                      </label>
                      <input
                        id="reg-password"
                        type="password"
                        className="form-input"
                        placeholder="Minimum 6 characters"
                        value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="reg-confirm">
                        Confirm Password
                      </label>
                      <input
                        id="reg-confirm"
                        type="password"
                        className="form-input"
                        placeholder="Repeat your password"
                        value={regConfirm}
                        onChange={e => setRegConfirm(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                      style={{
                        width: '100%',
                        height: '46px',
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        marginTop: '0.35rem',
                      }}
                    >
                      {loading ? (
                        <>
                          <Spinner size="sm" />
                          Sending Verification…
                        </>
                      ) : (
                        'Create Account & Verify Email →'
                      )}
                    </button>
                  </form>
                )}

                {/* Guest Mode Divider & Button */}
                <div
                  style={{
                    marginTop: '1.25rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleGuest}
                    disabled={guestLoad}
                    className="btn btn-subtle"
                    style={{
                      width: '100%',
                      height: '42px',
                      gap: '.5rem',
                      justifyContent: 'center',
                      fontWeight: 600,
                    }}
                  >
                    {guestLoad ? (
                      <>
                        <Spinner size="sm" />
                        Launching Guest Workspace…
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        Explore as Guest (Instant Access)
                      </>
                    )}
                  </button>

                  <p
                    style={{
                      textAlign: 'center',
                      marginTop: '.55rem',
                      fontSize: '.72rem',
                      color: 'var(--text-light)',
                    }}
                  >
                    Guest mode runs fully locally without an account. History is not saved.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Scoped responsive styles */}
      <style>{`
        @media (max-width: 860px) {
          .auth-preview-panel {
            display: none !important;
          }
          .auth-container-card {
            grid-template-columns: 1fr !important;
            max-width: 470px !important;
          }
          .hide-sm {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
