/**
 * Topbar — fixed header with breadcrumb title, hamburger (mobile), theme toggle.
 */

import React from 'react';
import { useSettings } from '../context/SettingsContext';

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    <circle cx="12" cy="12" r="5" />
  </svg>
);

const MenuIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6"  x2="21" y2="6"  />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export default function Topbar({ title, onMenuClick }) {
  const { toggleTheme, theme } = useSettings();

  return (
    <header
      className="topbar"
      style={{
        position: 'fixed', top: 0,
        left: 'var(--sidebar-width)', right: 0,
        height: 'var(--topbar-height)',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 1.5rem',
        zIndex: 30,
        gap: '.875rem',
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="btn-icon topbar-hamburger"
        style={{ display: 'none' }}
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>

      {/* Page title / breadcrumb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '.6rem' }}>
        <span style={{
          fontSize: '.75rem',
          fontWeight: 600,
          color: 'var(--text-light)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}>
          Workspace
        </span>
        <span style={{ color: 'var(--border-strong)', fontSize: '.75rem' }}>/</span>
        <span style={{
          fontSize: '.85rem',
          fontWeight: 600,
          fontFamily: 'var(--font-display)',
          color: 'var(--text-main)',
          letterSpacing: '-.01em',
        }}>
          {title}
        </span>
      </div>

      {/* Top telemetry tag */}
      <div style={{
        display: 'none',
        alignItems: 'center',
        gap: '.4rem',
        padding: '.25rem .6rem',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        fontSize: '.75rem',
        color: 'var(--text-muted)',
      }} className="topbar-telemetry">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <span style={{ fontWeight: 500 }}>Zero Server Relay</span>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="btn-icon"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? <MoonIcon /> : <SunIcon />}
      </button>
    </header>
  );
}
