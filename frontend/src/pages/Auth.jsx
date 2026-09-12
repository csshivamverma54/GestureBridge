/**
 * Auth Page - Login - Register - OTP Verification - Guest access.
 *
 * Visual Reskin matching Stitch "Warm Kinetic Clarity" specification:
 * - Clean split-card layout with 16px radius and 1px border
 * - MediaPipe 21-keypoint hand tracking HUD preview on left panel
 * - Privacy guarantee & zero server video streaming badge
 * - 8px radius form controls, primary blue CTA, Google OAuth & Guest buttons
 * - OTP 6-digit verification card
 *
 * ALL functionality, state, API calls, routes, and error handling preserved 100%.
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



/* -- Hand Tracking Skeleton Graphic -- */
const HandTrackingGraphic = () => (
  <div style={{
    position: 'relative',
    width: '100%',
    height: '210px',
    background: 'radial-gradient(ellipse at center, #1E293B 0%, #0B1120 100%)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.25rem',
  }}>
    {/* Grid backdrop */}
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      backgroundSize: '20px 20px',
      pointerEvents: 'none',
    }} />

    {/* Top telemetry badges */}
    <div style={{
      position: 'absolute',
      top: '10px',
      left: '12px',
      right: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 2,
    }}>
      <span style={{
        background: 'rgba(37, 99, 235, 0.2)',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        color: '#93C5FD',
        padding: '2px 8px',
        borderRadius: '6px',
        fontSize: '0.68rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        letterSpacing: '0.04em',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B82F6', display: 'inline-block' }} />
        21-KEYPOINTS ACTIVE
      </span>
      <span style={{
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#94A3B8',
        padding: '2px 8px',
        borderRadius: '6px',
        fontSize: '0.68rem',
        fontFamily: 'var(--font-mono)',
      }}>
        60 FPS · WEBGPU
      </span>
    </div>

    {/* Hand Landmark Skeleton SVG */}
    <svg width="200" height="155" viewBox="0 0 220 180" fill="none" style={{ position: 'relative', zIndex: 1 }}>
      {/* Palm connections */}
      <line x1="110" y1="165" x2="70" y2="135" stroke="#3B82F6" strokeWidth="2" strokeDasharray="3 3" />
      <line x1="110" y1="165" x2="95" y2="110" stroke="#3B82F6" strokeWidth="2" />
      <line x1="110" y1="165" x2="115" y2="105" stroke="#3B82F6" strokeWidth="2" />
      <line x1="110" y1="165" x2="135" y2="115" stroke="#3B82F6" strokeWidth="2" />
      <line x1="110" y1="165" x2="155" y2="130" stroke="#3B82F6" strokeWidth="2" />

      {/* Palm bridge */}
      <line x1="70" y1="135" x2="95" y2="110" stroke="#3B82F6" strokeWidth="2" />
      <line x1="95" y1="110" x2="115" y2="105" stroke="#3B82F6" strokeWidth="2" />
      <line x1="115" y1="105" x2="135" y2="115" stroke="#3B82F6" strokeWidth="2" />
      <line x1="135" y1="115" x2="155" y2="130" stroke="#3B82F6" strokeWidth="2" />

      {/* Thumb */}
      <line x1="70" y1="135" x2="55" y2="115" stroke="#F59E0B" strokeWidth="2" />
      <line x1="55" y1="115" x2="48" y2="95" stroke="#F59E0B" strokeWidth="2" />
      <line x1="48" y1="95" x2="42" y2="75" stroke="#F59E0B" strokeWidth="2" />

      {/* Index */}
      <line x1="95" y1="110" x2="90" y2="80" stroke="#3B82F6" strokeWidth="2" />
      <line x1="90" y1="80" x2="88" y2="55" stroke="#3B82F6" strokeWidth="2" />
      <line x1="88" y1="55" x2="86" y2="30" stroke="#3B82F6" strokeWidth="2" />

      {/* Middle */}
      <line x1="115" y1="105" x2="115" y2="72" stroke="#3B82F6" strokeWidth="2" />
      <line x1="115" y1="72" x2="115" y2="45" stroke="#3B82F6" strokeWidth="2" />
      <line x1="115" y1="45" x2="115" y2="20" stroke="#3B82F6" strokeWidth="2" />

      {/* Ring */}
      <line x1="135" y1="115" x2="138" y2="82" stroke="#3B82F6" strokeWidth="2" />
      <line x1="138" y1="82" x2="140" y2="58" stroke="#3B82F6" strokeWidth="2" />
      <line x1="140" y1="58" x2="142" y2="35" stroke="#3B82F6" strokeWidth="2" />

      {/* Pinky */}
      <line x1="155" y1="130" x2="162" y2="105" stroke="#3B82F6" strokeWidth="2" />
      <line x1="162" y1="105" x2="166" y2="85" stroke="#3B82F6" strokeWidth="2" />
      <line x1="166" y1="85" x2="170" y2="65" stroke="#3B82F6" strokeWidth="2" />

      {/* Wrist */}
      <circle cx="110" cy="165" r="5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Thumb points */}
      <circle cx="70" cy="135" r="3.5" fill="#3B82F6" />
      <circle cx="55" cy="115" r="3.5" fill="#F59E0B" />
      <circle cx="48" cy="95" r="3.5" fill="#F59E0B" />
      <circle cx="42" cy="75" r="4.5" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Index points */}
      <circle cx="95" cy="110" r="3.5" fill="#3B82F6" />
      <circle cx="90" cy="80" r="3.5" fill="#3B82F6" />
      <circle cx="88" cy="55" r="3.5" fill="#3B82F6" />
      <circle cx="86" cy="30" r="4.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Middle points */}
      <circle cx="115" cy="105" r="3.5" fill="#3B82F6" />
      <circle cx="115" cy="72" r="3.5" fill="#3B82F6" />
      <circle cx="115" cy="45" r="3.5" fill="#3B82F6" />
      <circle cx="115" cy="20" r="4.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Ring points */}
      <circle cx="135" cy="115" r="3.5" fill="#3B82F6" />
      <circle cx="138" cy="82" r="3.5" fill="#3B82F6" />
      <circle cx="140" cy="58" r="3.5" fill="#3B82F6" />
      <circle cx="142" cy="35" r="4.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Pinky points */}
      <circle cx="155" cy="130" r="3.5" fill="#3B82F6" />
      <circle cx="162" cy="105" r="3.5" fill="#3B82F6" />
      <circle cx="166" cy="85" r="3.5" fill="#3B82F6" />
      <circle cx="170" cy="65" r="4.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
    </svg>

    {/* Bottom coordinate tracker */}
    <div style={{
      position: 'absolute',
      bottom: '8px',
      left: '12px',
      right: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '0.65rem',
      fontFamily: 'var(--font-mono)',
      color: '#94A3B8',
      background: 'rgba(15, 23, 42, 0.75)',
      padding: '3px 8px',
      borderRadius: '4px',
    }}>
      <span>COORD: (0.482, 0.712, -0.041)</span>
      <span style={{ color: '#10B981', fontWeight: 600 }}>CONF: 99.4%</span>
    </div>
  </div>
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
            width: '44px',
            height: '52px',
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

/* -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
   Main Auth component
-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*- */
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
    e.preventDefault();
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
      }}
    >
      {/* -- Top navigation bar -- */}
      <header
        style={{
          padding: '0.85rem clamp(1.25rem, 5vw, 2.5rem)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
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
          <BrandLogo size={30} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.05rem',
              letterSpacing: '-0.025em',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }} className="hide-sm">Don't have an account?</span>
              <button
                onClick={() => switchScreen('register')}
                className="btn btn-outline btn-sm"
                style={{ fontWeight: 600 }}
              >
                Sign Up
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }} className="hide-sm">Already have an account?</span>
              <button
                onClick={() => switchScreen('login')}
                className="btn btn-ghost btn-sm"
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
          padding: 'clamp(1.5rem, 4vw, 3rem) 1.25rem',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="auth-container-card"
          style={{
            width: '100%',
            maxWidth: screen === 'otp' ? '460px' : '980px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
            display: 'grid',
            gridTemplateColumns: screen === 'otp' ? '1fr' : '1.05fr 1fr',
            overflow: 'hidden',
            transition: 'all 0.3s ease',
          }}
        >
          {/* =================================================================
              LEFT PANEL: Visual Tracking HUD & Zero Server Streaming Guarantee
             ================================================================= */}
          {screen !== 'otp' && (
            <div
              className="auth-preview-panel"
              style={{
                background: 'var(--bg-surface)',
                borderRight: '1px solid var(--border)',
                padding: '2.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Visual Eyebrow */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  <span className="badge badge-primary">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)' }} />
                    On-Device Neural Engine
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
                    v1.0.4 WebAssembly
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    marginBottom: '0.5rem',
                    color: 'var(--text-main)',
                  }}
                >
                  Real-time ASL spatial recognition
                </h3>

                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    marginBottom: '1.5rem',
                  }}
                >
                  MediaPipe extracts 21 skeletal landmarks per hand directly in-browser. Zero video frames leave your device.
                </p>

                {/* Hand Tracking Graphic */}
                <HandTrackingGraphic />

                {/* Trust Guarantee Box */}
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '6px',
                      background: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
                      Zero Server Streaming
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      Camera feed is computed strictly in your browser using client-side WebGL acceleration. No recordings or video streams are ever transmitted or saved.
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Micro Bullets */}
              <div
                style={{
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--text-light)',
                }}
              >
                <span>✓ 2,000+ WLASL Words</span>
                <span>✓ Client-Side Encrypted</span>
                <span>✓ 0ms Server Relay</span>
              </div>
            </div>
          )}

          {/* =================================================================
              RIGHT PANEL: Authentication Forms (Login / Register / OTP)
             ================================================================= */}
          <div
            style={{
              padding: screen === 'otp' ? '2.5rem 2rem' : '2.5rem clamp(1.5rem, 3vw, 2.5rem)',
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
                    fontSize: '.8125rem',
                    marginBottom: '1.25rem',
                    padding: 0,
                    fontWeight: 500,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                  Back to Registration
                </button>

                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '12px',
                    background: dark ? '#0D2149' : '#EFF6FF',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.25rem',
                    border: '1px solid #BFDBFE',
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.35rem', marginBottom: '.35rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
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
                      height: '44px',
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
                    Didn't receive the verification code?
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
                        fontWeight: 600,
                        fontSize: '.8125rem',
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
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--color-primary)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {screen === 'login' ? 'WORKSPACE AUTHENTICATION' : 'CREATE ACCOUNT'}
                  </div>

                  <h2
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 700,
                      letterSpacing: '-0.025em',
                      color: 'var(--text-main)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {screen === 'login' ? 'Log in to your account' : 'Start translating now'}
                  </h2>

                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
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
                    borderRadius: 'var(--radius-md)',
                    padding: '3px',
                    marginBottom: '1.25rem',
                    border: '1px solid var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => switchScreen('login')}
                    style={{
                      flex: 1,
                      padding: '0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      background: screen === 'login' ? 'var(--bg-card)' : 'transparent',
                      color: screen === 'login' ? 'var(--color-primary)' : 'var(--text-muted)',
                      boxShadow: screen === 'login' ? 'var(--shadow-sm)' : 'none',
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
                      padding: '0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      background: screen === 'register' ? 'var(--bg-card)' : 'transparent',
                      color: screen === 'register' ? 'var(--color-primary)' : 'var(--text-muted)',
                      boxShadow: screen === 'register' ? 'var(--shadow-sm)' : 'none',
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
                    height: '42px',
                    gap: '0.65rem',
                    marginBottom: '0.85rem',
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
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                            right: '0.75rem',
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
                        height: '42px',
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
                        height: '42px',
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
                      height: '38px',
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
                      marginTop: '.5rem',
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
            max-width: 460px !important;
          }
          .hide-sm {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
