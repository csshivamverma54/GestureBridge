/**
 * Profile Page — view and update user profile info.
 *
 * GET  /profile           → { name, email }
 * POST /profile/update    → update name, password, etc. (mocked for now)
 */

import React, { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { getProfile, getErrorMessage } from '../services/api';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  const [name,      setName]      = useState(user?.name || '');
  const [email,     setEmail]     = useState(user?.email || '');
  const [oldPass,   setOldPass]   = useState('');
  const [newPass,   setNewPass]   = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  useEffect(() => {
    // Re-hydrate profile from backend
    async function loadProfile() {
      try {
        const { data } = await getProfile();
        setName(data.name);
        setEmail(data.email);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    }
    loadProfile();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!name.trim()) {
      setError('Name cannot be empty.'); return;
    }
    setLoading(true);
    try {
      // TODO: Add actual PATCH /profile endpoint in backend
      // For now, just update local state
      await new Promise((r) => setTimeout(r, 1000)); // Mock delay
      updateUser({ name });
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!oldPass || !newPass || !confirmPass) {
      setError('Please fill in all password fields.'); return;
    }
    if (newPass !== confirmPass) {
      setError('New passwords do not match.'); return;
    }
    if (newPass.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }
    setLoading(true);
    try {
      // TODO: Add actual POST /profile/change-password endpoint
      await new Promise((r) => setTimeout(r, 1000)); // Mock delay
      setSuccess('Password changed successfully.');
      setOldPass(''); setNewPass(''); setConfirmPass('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="page-header">
        <h1>Profile</h1>
        <p>Manage your account information and security.</p>
      </div>

      {error   && <Alert type="error"   message={error}   onClose={() => setError('')}   />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Profile info */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Profile Information</h3>
          <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="profile-name">Full Name</label>
              <input
                id="profile-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="profile-email">Email Address</label>
              <input
                id="profile-email"
                type="email"
                className="form-input"
                value={email}
                disabled
                style={{ opacity: .6 }}
              />
              <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '.2rem' }}>
                Email cannot be changed.
              </p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><Spinner size="sm" /> Updating...</> : 'Update Profile'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Change Password</h3>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="old-password">Current Password</label>
              <input
                id="old-password"
                type="password"
                className="form-input"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Confirm New Password</label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><Spinner size="sm" /> Changing...</> : '🔒 Change Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Profile picture placeholder (future feature) */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '.75rem' }}>Profile Picture</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{
            width: 100, height: 100, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #14B8A6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem', color: '#fff', fontWeight: 700,
          }}>
            {name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', marginBottom: '.5rem' }}>
              Upload a custom avatar (coming soon).
            </p>
            <button className="btn btn-ghost" disabled>
              📸 Upload Photo
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
