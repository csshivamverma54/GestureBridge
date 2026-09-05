/**
 * Settings Page — theme, language preference, notifications, privacy.
 * All settings are managed via SettingsContext → localStorage.
 */

import React from 'react';
import AppShell from '../components/AppShell';
import { useSettings } from '../context/SettingsContext';

const LANGUAGES = [
  { value: 'ASL', label: 'American Sign Language (ASL)' },
  { value: 'ISL', label: 'Indian Sign Language (ISL)' },
];

const RECOGNITION_MODES = [
  {
    value: 'word',
    label: '🤟 Sign Mode',
    desc:  'Read full ASL signs and convert them into complete sentences. Best for fluent signers.',
  },
  {
    value: 'letter',
    label: '🔤 Spell Mode',
    desc:  'Finger-spell words letter by letter (A–Z). Best for names, unusual words, or beginners.',
  },
];

export default function Settings() {
  const {
    theme, language, recognitionMode, notifications, privacyMode,
    captureInterval, confidenceThreshold,
    updateSettings, toggleTheme,
  } = useSettings();

  return (
    <AppShell>
      <div className="page-header">
        <h1>⚙️ Settings</h1>
        <p>Customize your GestureBridge experience.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 720 }}>
        {/* Appearance */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>🎨 Appearance</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.95rem', marginBottom: '.2rem' }}>Dark Mode</div>
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                Toggle between light and dark colour schemes.
              </p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={theme === 'dark'}
                onChange={toggleTheme}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>

        {/* Recognition Mode */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>🤟 Recognition Mode</h3>
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            You can also switch modes directly on the Sign-to-Text page using the tabs at the top.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {RECOGNITION_MODES.map((mode) => {
              const active = recognitionMode === mode.value;
              return (
                <label
                  key={mode.value}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '.75rem',
                    padding: '.75rem 1rem',
                    border: `2px solid ${active ? 'var(--color-primary)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    background: active ? 'color-mix(in srgb, var(--color-primary) 8%, var(--bg-card))' : 'var(--bg-card)',
                    cursor: 'pointer',
                    transition: 'border-color var(--transition)',
                  }}
                >
                  <input
                    type="radio"
                    name="recognitionMode"
                    value={mode.value}
                    checked={active}
                    onChange={() => updateSettings({ recognitionMode: mode.value })}
                    style={{ marginTop: '.2rem', accentColor: 'var(--color-primary)' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.95rem', marginBottom: '.2rem' }}>{mode.label}</div>
                    <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{mode.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Language */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>🌍 Sign Language Preference</h3>
          <div className="form-group">
            <label className="form-label" htmlFor="language-select">Preferred Sign Language</label>
            <select
              id="language-select"
              className="form-select"
              value={language}
              onChange={(e) => updateSettings({ language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Performance settings */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>⚡ Performance</h3>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" htmlFor="capture-interval">
              Response Speed: {captureInterval <= 150 ? 'Fast' : captureInterval <= 250 ? 'Balanced' : 'Smooth'} ({captureInterval} ms)
            </label>
            <input
              id="capture-interval"
              type="range"
              min="100"
              max="500"
              step="50"
              value={captureInterval}
              onChange={(e) => updateSettings({ captureInterval: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              Fast responds quicker but uses more CPU. Smooth is better for older devices.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confidence-threshold">
              Sign Accuracy Bar: {(confidenceThreshold * 100).toFixed(0)}%
            </label>
            <input
              id="confidence-threshold"
              type="range"
              min="0.3"
              max="0.95"
              step="0.05"
              value={confidenceThreshold}
              onChange={(e) => updateSettings({ confidenceThreshold: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              Lower this if signs are being missed. Raise it to reduce false positives.
            </p>
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>🔔 Notifications</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.95rem', marginBottom: '.2rem' }}>
                Enable Notifications
              </div>
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                Receive alerts for predictions and system events.
              </p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => updateSettings({ notifications: e.target.checked })}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>

        {/* Privacy */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>🔒 Privacy</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.95rem', marginBottom: '.2rem' }}>
                Privacy Mode
              </div>
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                  Don't save this conversation to history — useful in sensitive situations.
              </p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={privacyMode}
                onChange={(e) => updateSettings({ privacyMode: e.target.checked })}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>

        {/* Reset settings */}
        <div className="card" style={{ borderColor: 'var(--color-error)' }}>
          <h3 style={{ marginBottom: '.75rem', color: 'var(--color-error)' }}>Danger Zone</h3>
          <p style={{ fontSize: '.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Reset all settings to default values.
          </p>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('Are you sure? This will reset all your settings.')) {
                localStorage.removeItem('gb_settings');
                window.location.reload();
              }
            }}
          >
            🔄 Reset All Settings
          </button>
        </div>
      </div>
    </AppShell>
  );
}
