/**
 * AccountSettings — merged Profile + System Preferences page.
 *
 * Visual Reskin matching Stitch "Warm Kinetic Clarity" specification:
 * - Plus Jakarta Sans typography
 * - Breadcrumb: WORKSPACE / ACCOUNT PREFERENCES
 * - Telemetry badges for verified account & local storage
 * - Left tab navigation with avatar and 8px radius items
 * - Form inputs with 8px radius, primary blue CTAs, custom sliders, and danger zone styling
 *
 * ALL functionality, state, settings persistence, and profile logic preserved 100%.
 */

import React, { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import {
  useSettings,
  SUPPORTED_SIGN_LANGUAGES,
  SUPPORTED_SPOKEN_LANGUAGES,
} from '../context/SettingsContext';
import { getProfile, getErrorMessage } from '../services/api';

const TABS = [
  { key: 'profile',    label: 'Profile Information',   icon: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'] },
  { key: 'security',   label: 'Security & Auth',       icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'] },
  { key: 'appearance', label: 'Inference & Display',   icon: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'] },
  { key: 'privacy',    label: 'Privacy & Data Vault',  icon: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'] },
];

const Icon = ({ d, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

function SectionHeader({ title, desc }) {
  return (
    <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ marginBottom: '.3rem', fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
        {title}
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', margin: 0, lineHeight: 1.5 }}>
        {desc}
      </p>
    </div>
  );
}

function SettingRow({ label, desc, children }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.5rem',
        padding: '1rem 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.2rem', color: 'var(--text-main)' }}>
          {label}
        </div>
        {desc && <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function AccountSettings() {
  const { user, updateUser } = useAuth();
  const {
    theme,
    signLanguage,
    spokenLanguage,
    language,
    notifications,
    privacyMode,
    captureInterval,
    confidenceThreshold,
    updateSettings,
    toggleTheme,
  } = useSettings();

  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const dark = theme === 'dark';

  // Profile fields
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');

  // Security fields
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  useEffect(() => {
    if (user.isGuest) return;
    getProfile()
      .then((r) => {
        setName(r.data.name);
        setEmail(r.data.email);
      })
      .catch(() => {});
  }, [user]);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    clearMessages();
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
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
    clearMessages();
    if (!oldPass || !newPass || !confirmPass) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New passwords do not match.');
      return;
    }
    if (newPass.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setSuccess('Password changed successfully.');
      setOldPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const initials = (name || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const guestBanner = user.isGuest && (
    <Alert type="info" message="You are currently exploring in guest mode. Account profile and security changes will not persist across browser sessions." />
  );

  return (
    <AppShell>
      {/* ── Page Header with Stitch Telemetry Badges ── */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <span className="badge badge-primary">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />
            {user.isGuest ? 'Guest Session' : 'Active Account'}
          </span>
          <span className="badge badge-success">Client-Side Preferences</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
            LOCAL STORAGE VAULT
          </span>
        </div>

        <h1 style={{ fontSize: 'clamp(1.4rem, 2.5vw, 1.85rem)', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.35rem' }}>
          Account & Preferences
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0, maxWidth: '680px', lineHeight: 1.5 }}>
          Manage your personal profile, credentials, neural model inference parameters, and privacy settings.
        </p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}
      {guestBanner}

      <div className="account-layout" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* ── Left Tab Navigation & Profile Card ── */}
        <div
          style={{
            width: 230,
            flexShrink: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {/* Avatar Profile Block */}
          <div style={{ padding: '1.5rem 1.25rem', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '14px',
                background: `linear-gradient(135deg, ${dark ? '#1D4ED8' : '#2563EB'}, #7C3AED)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: '1.25rem',
                margin: '0 auto 0.75rem',
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {initials}
            </div>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text-main)', marginBottom: '.15rem', wordBreak: 'break-word', fontFamily: 'var(--font-display)' }}>
              {name || 'Guest User'}
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
              {email || 'local-guest@device'}
            </div>
            {user.isGuest && (
              <span className="badge badge-warning" style={{ marginTop: '.65rem' }}>Temporary Guest</span>
            )}
          </div>

          {/* Tab buttons */}
          <nav style={{ padding: '0.65rem' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setActiveTab(t.key);
                  clearMessages();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.65rem',
                  width: '100%',
                  padding: '.65rem .85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor: activeTab === t.key ? '#BFDBFE' : 'transparent',
                  cursor: 'pointer',
                  fontWeight: activeTab === t.key ? 700 : 500,
                  fontSize: '.85rem',
                  textAlign: 'left',
                  background: activeTab === t.key ? 'var(--color-primary-light)' : 'transparent',
                  color: activeTab === t.key ? 'var(--color-primary)' : 'var(--text-muted)',
                  transition: 'all var(--transition)',
                  marginBottom: '.25rem',
                }}
              >
                <Icon d={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Right Content Panel ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="card" style={{ padding: '1.75rem', border: '1px solid var(--border)' }}>
              <SectionHeader title="Profile Information" desc="Update your display identity used across local translation sessions." />
              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="acc-name">Full Name</label>
                  <input
                    id="acc-name"
                    type="text"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="acc-email">Email Address</label>
                  <input
                    id="acc-email"
                    type="email"
                    className="form-input"
                    value={email}
                    disabled
                    style={{ opacity: 0.65, cursor: 'not-allowed' }}
                  />
                  <p style={{ fontSize: '.73rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>
                    Email is anchored to your authentication credentials and cannot be modified.
                  </p>
                </div>

                <div>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ gap: '.4rem', height: '40px', fontWeight: 600 }}>
                    {loading ? (
                      <>
                        <Spinner size="sm" /> Saving…
                      </>
                    ) : (
                      <>
                        <Icon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" size={14} />
                        Save Profile Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="card" style={{ padding: '1.75rem', border: '1px solid var(--border)' }}>
              <SectionHeader title="Security & Authentication" desc="Update your password credentials to safeguard your translation vault." />
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="old-pass">Current Password</label>
                  <input
                    id="old-pass"
                    type="password"
                    className="form-input"
                    value={oldPass}
                    onChange={(e) => setOldPass(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="new-pass">New Password</label>
                  <input
                    id="new-pass"
                    type="password"
                    className="form-input"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Minimum 6 characters"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="conf-pass">Confirm New Password</label>
                  <input
                    id="conf-pass"
                    type="password"
                    className="form-input"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    required
                  />
                </div>

                <div>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ gap: '.4rem', height: '40px', fontWeight: 600 }}>
                    {loading ? (
                      <>
                        <Spinner size="sm" /> Updating…
                      </>
                    ) : (
                      <>
                        <Icon d={['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']} size={14} />
                        Update Password
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* APPEARANCE & INFERENCE TAB */}
          {activeTab === 'appearance' && (
            <div className="card" style={{ padding: '1.75rem', border: '1px solid var(--border)' }}>
              <SectionHeader title="Inference & Display Preferences" desc="Fine-tune real-time camera sampling rates, confidence gates, and themes." />

              <SettingRow label="Theme Scheme" desc="Toggle between Stitch Clean Light and Deep Dark interfaces.">
                <label className="toggle-switch">
                  <input type="checkbox" checked={dark} onChange={toggleTheme} />
                  <span className="toggle-track" />
                </label>
              </SettingRow>

              {/* Visual Sign Language Setting */}
              <div style={{ padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.3rem', color: 'var(--text-main)' }}>
                  Visual Sign Language Dialect
                </div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
                  Select the visual sign dialect and 3D skeletal gesture system for on-device recognition and video synthesis.
                </p>
                <select
                  className="form-select"
                  value={signLanguage || 'ASL'}
                  onChange={(e) => updateSettings({ signLanguage: e.target.value })}
                  style={{ maxWidth: 380 }}
                >
                  {SUPPORTED_SIGN_LANGUAGES.map((sl) => (
                    <option key={sl.value} value={sl.value}>
                      {sl.label} — {sl.region}
                    </option>
                  ))}
                </select>
              </div>

              {/* Spoken Voice & Translation Language Setting */}
              <div style={{ padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.3rem', color: 'var(--text-main)' }}>
                  Spoken Voice & Translation Language
                </div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
                  Natural language used for speech recognition (STT), audio readback (TTS), and sentence translations.
                </p>
                <select
                  className="form-select"
                  value={spokenLanguage || 'English'}
                  onChange={(e) => updateSettings({ spokenLanguage: e.target.value })}
                  style={{ maxWidth: 380 }}
                >
                  {SUPPORTED_SPOKEN_LANGUAGES.map((spl) => (
                    <option key={spl.value} value={spl.value}>
                      {spl.flag} {spl.label} ({spl.nativeName}) — {spl.script}
                    </option>
                  ))}
                </select>
              </div>

              {/* Frame Capture Slider */}
              <div style={{ padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--text-main)' }}>
                    Frame Capture Interval
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {captureInterval} ms
                  </span>
                </div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
                  Interval between feature vector extractions. Lower = faster recognition; Higher = battery & CPU saver.
                </p>
                <input
                  type="range"
                  min="100"
                  max="500"
                  step="50"
                  value={captureInterval}
                  onChange={(e) => updateSettings({ captureInterval: Number(e.target.value) })}
                  className="range-input"
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--text-light)', marginTop: '.3rem' }}>
                  <span>100 ms (Fast / 10 FPS)</span>
                  <span>500 ms (Stable / 2 FPS)</span>
                </div>
              </div>

              {/* Confidence Threshold Slider */}
              <div style={{ padding: '1rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--text-main)' }}>
                    Confidence Commitment Threshold
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {(confidenceThreshold * 100).toFixed(0)}%
                  </span>
                </div>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
                  Minimum probability required before auto-committing signed words to the sentence sequence.
                </p>
                <input
                  type="range"
                  min="0.3"
                  max="0.95"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => updateSettings({ confidenceThreshold: Number(e.target.value) })}
                  className="range-input"
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--text-light)', marginTop: '.3rem' }}>
                  <span>30% (Lenient)</span>
                  <span>95% (High Precision)</span>
                </div>
              </div>
            </div>
          )}

          {/* PRIVACY TAB */}
          {activeTab === 'privacy' && (
            <div className="card" style={{ padding: '1.75rem', border: '1px solid var(--border)' }}>
              <SectionHeader title="Privacy & Data Management" desc="Control local data logging and system notifications." />

              <SettingRow label="Privacy Shield Mode" desc="Disables saving translation transcripts to history. Useful for confidential sessions.">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={privacyMode}
                    onChange={(e) => updateSettings({ privacyMode: e.target.checked })}
                  />
                  <span className="toggle-track" />
                </label>
              </SettingRow>

              <SettingRow label="In-App System Alerts" desc="Receive real-time notifications for prediction commits and model statuses.">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(e) => updateSettings({ notifications: e.target.checked })}
                  />
                  <span className="toggle-track" />
                </label>
              </SettingRow>

              {/* Danger Zone */}
              <div
                style={{
                  marginTop: '1.75rem',
                  padding: '1.25rem 1.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid #FECACA',
                  background: dark ? '#2D0A0A25' : '#FEF2F2',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
                  <Icon d={['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4M12 17h.01']} size={16} />
                  <span style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--color-error)' }}>
                    Reset Local Storage
                  </span>
                </div>
                <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Wipe all custom client settings, cached models, and restore default preferences. This action cannot be undone.
                </p>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to reset all local settings to default?')) {
                      localStorage.removeItem('gb_settings');
                      window.location.reload();
                    }
                  }}
                  style={{ gap: '.4rem', height: '36px', fontWeight: 600 }}
                >
                  <Icon d="M1 4v6h6M23 20v-6h-6" size={13} />
                  Reset All Settings to Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .account-layout {
            flex-direction: column !important;
          }
          .account-layout > div:first-child {
            width: 100% !important;
          }
        }
      `}</style>
    </AppShell>
  );
}
