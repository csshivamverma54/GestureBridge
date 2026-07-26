/**
 * ProtectedRoute — Wraps routes that require authentication.
 * Redirects unauthenticated users to /login, preserving the intended path.
 *
 * Fast-path: also checks localStorage directly so a just-completed OAuth
 * callback (where React context state hasn't flushed yet) doesn't get
 * incorrectly bounced back to /login.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // While AuthProvider is re-hydrating from storage, show a spinner.
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // React state hasn't flushed yet (e.g. right after OAuth callback sets user)
  // but localStorage was already written synchronously — treat that as authenticated.
  const hasStoredSession = !!(
    localStorage.getItem('gb_token') && localStorage.getItem('gb_user')
  );

  if (!user && !hasStoredSession) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
