/**
 * Auth Page — Login & Register in a single component with tab switching.
 *
 * POST /login    → { token, message }
 * POST /register → { message }
 *
 * On success, stores JWT via AuthContext.login() and redirects to dashboard.
 */

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, registerUser, getProfile, getErrorMessage } from '../services/api';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useSettings } from '../context/SettingsContext';

export default function Auth({ defaultTab = 'login' }) {
  const [tab,      setTab]      = useState(defaultTab); // 'login' | 'register'
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  // Login form fields
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form fields
  const [regName,     setRegName]     = useState('');
  const [regEmail,    setRegEmail]    = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm,  setRegConfirm]  = useState('');

  const { login } = useAuth();
  const { toggleTheme, theme } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  // ── Login handler ────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!loginEmail || !loginPassword) {
      setError('Please fill in all fields.'); return;
    }
    setLoading(true);
    try {
      const { data } = await loginUser({ email: loginEmail, password: loginPassword });
      // Fetch profile to get name
      const token = data.token;
      // Temporarily set the token so the profile request is authorised
      localStorage.setItem('gb_token', token);
      let user = { email: loginEmail, name: loginEmail.split('@')[0] };
      try {
        const profileRes = await getProfile();
        user = profileRes.data;
      } catch {
        // Profile fetch failed — use email fallback
      }
      login(token, user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Register handler ─────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!regName || !regEmail || !regPassword || !regConfirm) {
      setError('Please fill in all fields.'); return;
    }
    if (regPassword !== regConfirm) {
      setError('Passwords do not match.'); return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }
    setLoading(true);
    try {
      await registerUser({ name: regName, email: regEmail, password: regPassword });
      setSuccess('Account created! You can now sign in.');
      setTab('login');
      setLoginEmail(regEmail);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-page)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Mini nav */}
      <nav style={{
        padding: '.9rem 2rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '.55rem', textDecoration: 'none', flex: 1 }}>
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
          <span style={{ fontWeight: 700, fontSize: '.9rem', letterSpacing: '-.01em', color: 'var(--text-main)' }}>GestureBridge</span>
        </Link>
        <button
          onClick={toggleTheme}
          className="btn-icon"
          aria-label="Toggle theme"
        >
          {theme === 'light'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/><circle cx="12" cy="12" r="5"/></svg>
          }
        </button>
      </nav>

      {/* Auth card */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem 1rem',
      }}>
        <div style={{
          width: '100%', maxWidth: 420,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '2.25rem 2rem',
          boxShadow: 'var(--shadow-lg)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--color-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto .875rem',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
                <path d="M12 12h4v3a5 5 0 01-8.54 3.54" />
              </svg>
            </div>
            <h2 style={{ marginBottom: '.3rem' }}>
              {tab === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>
              {tab === 'login'
                ? 'Sign in to your GestureBridge account'
                : 'Join GestureBridge for free'}
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{
            display: 'flex', gap: '.3rem',
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
            padding: '.25rem', marginBottom: '1.5rem',
          }}>
            {['login', 'register'].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); setSuccess(''); }}
                style={{
                  flex: 1, padding: '.55rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: '.875rem',
                  background: tab === t ? 'var(--bg-card)' : 'transparent',
                  color: tab === t ? 'var(--color-primary)' : 'var(--text-muted)',
                  boxShadow: tab === t ? 'var(--shadow-sm)' : 'none',
                  transition: 'all var(--transition)',
                }}
              >
                {t === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Alerts */}
          {error   && <Alert type="error"   message={error}   onClose={() => setError('')}   />}
          {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

          {/* Login form */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-email">Email Address</label>
                <input
                  id="login-email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '.25rem' }}>
                {loading ? <><Spinner size="sm" /> Signing In…</> : '→ Sign In'}
              </button>
            </form>
          )}

          {/* Register form */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-name">Full Name</label>
                <input
                  id="reg-name"
                  type="text"
                  className="form-input"
                  placeholder="Your Name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-email">Email Address</label>
                <input
                  id="reg-email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  className="form-input"
                  placeholder="At least 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  className="form-input"
                  placeholder="Repeat password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '.25rem' }}>
                {loading ? <><Spinner size="sm" /> Creating Account…</> : 'Create Account'}
              </button>
            </form>
          )}

          {/* Footer link */}
          <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '.85rem', color: 'var(--text-muted)' }}>
            {tab === 'login'
              ? <>Don't have an account? <button onClick={() => setTab('register')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}>Register</button></>
              : <>Already have an account? <button onClick={() => setTab('login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}>Sign In</button></>
            }
          </p>
        </div>
      </div>
    </div>
  );
}
