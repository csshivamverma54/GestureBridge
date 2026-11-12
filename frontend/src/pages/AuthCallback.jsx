/**
 * AuthCallback — handles the redirect from Flask after Google OAuth.
 *
 * Preserves 100% of OAuth token parsing and navigation while styling the
 * transition view with the GestureBridge 3D studio aesthetic.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/LoadingSpinner';
import BrandLogo from '../components/BrandLogo';

export default function AuthCallback() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    const name   = params.get('name');
    const email  = params.get('email');
    const err    = params.get('error');

    if (err) {
      setError(decodeURIComponent(err));
      setTimeout(() => navigate('/login', { replace: true }), 3000);
      return;
    }

    if (token && email) {
      login(token, { name: name || email.split('@')[0], email });
      requestAnimationFrame(() => navigate('/dashboard', { replace: true }));
    } else {
      navigate('/login', { replace: true });
    }
  }, []); // eslint-disable-line

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)', padding: '1.5rem',
    }}>
      <div className="card" style={{
        maxWidth: 380, width: '100%', textAlign: 'center',
        padding: '2.25rem 1.75rem', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '1rem',
      }}>
        <BrandLogo size={42} />
        {error ? (
          <>
            <p style={{ color: 'var(--color-error)', fontWeight: 700, margin: 0 }}>
              Google sign-in failed
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', margin: 0 }}>
              {error}
            </p>
            <p style={{ color: 'var(--text-light)', fontSize: '.8rem', margin: 0 }}>
              Redirecting to login…
            </p>
          </>
        ) : (
          <>
            <Spinner size="lg" />
            <p style={{ color: 'var(--text-main)', fontSize: '.95rem', fontWeight: 600, margin: 0 }}>
              Signing you in with Google…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
