/**
 * AuthContext — manages authentication state globally.
 *
 * Persists JWT token + user info in localStorage so the session
 * survives page reloads.
 *
 * Exposes:
 *   user        — { name, email } | null
 *   token       — JWT string | null
 *   loading     — true while re-hydrating from storage
 *   login(token, user)  — store credentials
 *   logout()            — clear session
 *   updateUser(partial) — update profile fields in state
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const GUEST_USER = { name: 'Guest', email: 'guest@gesturebridge.local', isGuest: true };
const GUEST_TOKEN = 'guest-session';

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Re-hydrate from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('gb_token');
    const storedUser  = localStorage.getItem('gb_user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        // Corrupted storage — clear it
        localStorage.removeItem('gb_token');
        localStorage.removeItem('gb_user');
      }
    }
    setLoading(false);
  }, []);

  /** Call after a successful /login response. */
  const login = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('gb_token', newToken);
    localStorage.setItem('gb_user', JSON.stringify(newUser));
  };

  /** Guest login — no backend call, limited functionality. */
  const loginAsGuest = () => {
    setToken(GUEST_TOKEN);
    setUser(GUEST_USER);
    // Guest session is intentionally NOT persisted to localStorage
    // so it resets on page refresh.
  };

  /** Clear session and redirect to login. */
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('gb_token');
    localStorage.removeItem('gb_user');
  };

  /** Patch individual profile fields (e.g. after profile update). */
  const updateUser = (partial) => {
    setUser((prev) => {
      const updated = { ...prev, ...partial };
      localStorage.setItem('gb_user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginAsGuest, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Convenience hook. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
