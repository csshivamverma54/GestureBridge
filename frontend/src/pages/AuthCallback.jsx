/**
 * AuthCallback — handles the redirect from Flask after Google OAuth.
 *
 * Flask redirects to:
 *   /auth/callback?token=<jwt>&name=<name>&email=<email>
 *   /auth/callback?error=<message>   (on failure)
 *
 * This page reads the query params, stores the session in localStorage
 * via AuthContext.login(), then navigates to /dashboard.
 * It renders nothing visible — it's a pure transition screen.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/LoadingSpinner';

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
      // Redirect to login after a short delay so the user can read the message
      setTimeout(() => navigate('/login', { replace: true }), 3000);
      return;
    }

    if (token && email) {
      login(token, { name: name || email.split('@')[0], email });
      navigate('/dashboard', { replace: true });
    } else {
      // Nothing useful in the URL — send back to login
      navigate('/login', { replace: true });
    }
  }, []); // eslint-disable-line

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)', gap: '1rem',
    }}>
      {error ? (
        <>
          <p style={{ color: 'var(--color-error)', fontWeight: 600 }}>
            Google sign-in failed
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', maxWidth: 360, textAlign: 'center' }}>
            {error}
          </p>
          <p style={{ color: 'var(--text-light)', fontSize: '.8rem' }}>
            Redirecting to login…
          </p>
        </>
      ) : (
        <>
          <Spinner size="lg" />
          <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>
            Signing you in with Google…
          </p>
        </>
      )}
    </div>
  );
}
