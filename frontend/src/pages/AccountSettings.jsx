/**
 * AccountSettings — merged Profile + Settings page.
 * Tabbed layout: Profile | Security | Appearance | Privacy
 */

import React, { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getProfile, getErrorMessage } from '../services/api';

const TABS = [
  { key: 'profile',    label: 'Profile',    icon: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'] },
  { key: 'security',   label: 'Security',   icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'] },
  { key: 'appearance', label: 'Appearance', icon: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'] },
  { key: 'privacy',    label: 'Privacy',    icon: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'] },
];

const LANGUAGES = [
  { value: 'ASL', label: 'American Sign Language (ASL)' },
  { value: 'ISL', label: 'Indian Sign Language (ISL)' },
];

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

function SectionHeader({ title, desc }) {
  return (
    <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ marginBottom: '.3rem' }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', margin: 0 }}>{desc}</p>
    </div>
  );
}

function SettingRow({ label, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '.875rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.15rem' }}>{label}</div>
        {desc && <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function AccountSettings() {
  const { user, updateUser } = useAuth();
  const {
    theme, language, notifications, privacyMode,
    captureInterval, confidenceThreshold,
    updateSettings, toggleTheme,
  } = useSettings();

  const [activeTab, setActiveTab]     = useState('profile');
  const [loading,   setLoading]       = useState(false);
  const [error,     setError]         = useState('');
  const [success,   setSuccess]       = useState('');
  const dark = theme === 'dark';

  // Profile fields
  const [name,      setName]      = useState(user?.name || '');
  const [email,     setEmail]     = useState(user?.email || '');

  // Security fields
  const [oldPass,     setOldPass]     = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  useEffect(() => {
    if (user?.isGuest) return;
    getProfile().then(r => { setName(r.data.name); setEmail(r.data.email); }).catch(() => {});
  }, [user]);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleUpdateProfile = async (e) => {
    e.preventDefault(); clearMessages();
    if (!name.trim()) { setError('Name cannot be empty.'); return; }
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      updateUser({ name });
      setSuccess('Profile updated successfully.');
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault(); clearMessages();
    if (!oldPass || !newPass || !confirmPass) { setError('Please fill in all fields.'); return; }
    if (newPass !== confirmPass) { setError('New passwords do not match.'); return; }
    if (newPass.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      setSuccess('Password changed successfully.');
      setOldPass(''); setNewPass(''); setConfirmPass('');
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  // Avatar initials
  const initials = (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const guestBanner = user?.isGuest && (
    <Alert type="info" message="You're in guest mode — profile changes are not persisted." />
  );

  return (
    <AppShell>
      {/* Page header */}
      <div className="page-header">
        <h1>Account</h1>
        <p>Manage your profile, security, appearance, and privacy preferences.</p>
      </div>

      {error   && <Alert type="error"   message={error}   onClose={() => setError('')}   />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}
      {guestBanner}

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* ── Left tab nav ── */}
        <div style={{
          width: 200, flexShrink: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {/* Avatar block */}
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: `linear-gradient(135deg, ${dark ? '#1E3A8A' : '#2563EB'}, #7C3AED)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '1.25rem',
              margin: '0 auto .75rem',
            }}>
              {initials}
            </div>
            <div style={{ fontWeight: 600, fontSize: '.875rem', color: 'var(--text-main)', marginBottom: '.15rem', wordBreak: 'break-word' }}>
              {name || 'User'}
            </div>
            <div style={{ fontSize: '.73rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {email}
            </div>
            {user?.isGuest && (
              <span className="badge badge-warning" style={{ marginTop: '.5rem' }}>Guest</span>
            )}
          </div>

          {/* Tab links */}
          <nav style={{ padding: '.5rem' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setActiveTab(t.key); clearMessages(); }} style={{
                display: 'flex', alignItems: 'center', gap: '.55rem',
                width: '100%', padding: '.55rem .75rem',
                borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                fontWeight: activeTab === t.key ? 600 : 400,
                fontSize: '.875rem', textAlign: 'left',
                background: activeTab === t.key ? 'var(--color-primary-light)' : 'transparent',
                color: activeTab === t.key ? 'var(--color-primary)' : 'var(--text-muted)',
                transition: 'all var(--transition)',
                marginBottom: '.125rem',
              }}>
                <Icon d={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Right content panel ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* PROFILE tab */}
          {activeTab === 'profile' && (
            <div className="card">
              <SectionHeader title="Profile Information" desc="Update your display name and view your account email." />
              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="acc-name">Full Name</label>
                  <input id="acc-name" type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="acc-email">Email Address</label>
                  <input id="acc-email" type="email" className="form-input" value={email} disabled style={{ opacity: .6 }} />
                  <p style={{ fontSize: '.73rem', color: 'var(--text-muted)', marginTop: '.25rem' }}>Email address cannot be changed.</p>
                </div>
                <div>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ gap: '.4rem' }}>
                    {loading ? <><Spinner size="sm" /> Saving…</> : <>
                      <Icon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" size={14} />
                      Save Changes
                    </>}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SECURITY tab */}
          {activeTab === 'security' && (
            <div className="card">
              <SectionHeader title="Change Password" desc="Choose a strong password with at least 6 characters." />
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="old-pass">Current Password</label>
                  <input id="old-pass" type="password" className="form-input" value={oldPass} onChange={e => setOldPass(e.target.value)} autoComplete="current-password" required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-pass">New Password</label>
                  <input id="new-pass" type="password" className="form-input" value={newPass} onChange={e => setNewPass(e.target.value)} autoComplete="new-password" required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="conf-pass">Confirm New Password</label>
                  <input id="conf-pass" type="password" className="form-input" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} autoComplete="new-password" required />
                </div>
                <div>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ gap: '.4rem' }}>
                    {loading ? <><Spinner size="sm" /> Updating…</> : <>
                      <Icon d={['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']} size={14} />
                      Change Password
                    </>}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* APPEARANCE tab */}
          {activeTab === 'appearance' && (
            <div className="card">
              <SectionHeader title="Appearance & Language" desc="Customize how GestureBridge looks and the sign language dataset." />

              <SettingRow label="Dark Mode" desc="Toggle between light and dark colour schemes.">
                <label className="toggle-switch">
                  <input type="checkbox" checked={dark} onChange={toggleTheme} />
                  <span className="toggle-track" />
                </label>
              </SettingRow>

              <div style={{ padding: '.875rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.5rem' }}>Sign Language</div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>Select the sign language dataset to use for recognition.</p>
                <select className="form-select" value={language} onChange={e => updateSettings({ language: e.target.value })} style={{ maxWidth: 340 }}>
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>

              <div style={{ padding: '.875rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.3rem' }}>
                  Frame Capture Interval — <span style={{ color: 'var(--color-primary)' }}>{captureInterval} ms</span>
                </div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>Lower = faster but more CPU intensive. Higher = slower but more stable.</p>
                <input type="range" min="100" max="500" step="50" value={captureInterval}
                  onChange={e => updateSettings({ captureInterval: Number(e.target.value) })}
                  className="range-input" />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--text-light)', marginTop: '.3rem' }}>
                  <span>100 ms (fast)</span><span>500 ms (stable)</span>
                </div>
              </div>

              <div style={{ padding: '.875rem 0' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.3rem' }}>
                  Confidence Threshold — <span style={{ color: 'var(--color-primary)' }}>{(confidenceThreshold * 100).toFixed(0)}%</span>
                </div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>Only auto-commit predictions above this confidence level.</p>
                <input type="range" min="0.3" max="0.95" step="0.05" value={confidenceThreshold}
                  onChange={e => updateSettings({ confidenceThreshold: Number(e.target.value) })}
                  className="range-input" />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--text-light)', marginTop: '.3rem' }}>
                  <span>30% (lenient)</span><span>95% (strict)</span>
                </div>
              </div>
            </div>
          )}

          {/* PRIVACY tab */}
          {activeTab === 'privacy' && (
            <div className="card">
              <SectionHeader title="Privacy & Notifications" desc="Control how your data is stored and when you are notified." />

              <SettingRow label="Privacy Mode" desc="Prevent saving translations to history. Useful for sensitive sessions.">
                <label className="toggle-switch">
                  <input type="checkbox" checked={privacyMode} onChange={e => updateSettings({ privacyMode: e.target.checked })} />
                  <span className="toggle-track" />
                </label>
              </SettingRow>

              <SettingRow label="Notifications" desc="Receive in-app alerts for predictions and system events.">
                <label className="toggle-switch">
                  <input type="checkbox" checked={notifications} onChange={e => updateSettings({ notifications: e.target.checked })} />
                  <span className="toggle-track" />
                </label>
              </SettingRow>

              {/* Danger zone */}
              <div style={{ marginTop: '1.5rem', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: `1px solid var(--color-error)`, background: dark ? '#2D0A0A20' : '#FEF2F2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                  <Icon d={['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4M12 17h.01']} size={16} />
                  <span style={{ fontWeight: 700, fontSize: '.875rem', color: 'var(--color-error)' }}>Danger Zone</span>
                </div>
                <p style={{ fontSize: '.8375rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Reset all settings to their default values. This cannot be undone.
                </p>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => { if (window.confirm('Reset all settings to defaults?')) { localStorage.removeItem('gb_settings'); window.location.reload(); } }}
                  style={{ gap: '.4rem' }}
                >
                  <Icon d="M1 4v6h6M23 20v-6h-6" size={13} />
                  Reset All Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 640px) {
          .account-layout { flex-direction: column; }
        }
      `}</style>
    </AppShell>
  );
}
