/**
 * Topbar — fixed glassmorphic header with breadcrumb title, hamburger (mobile), theme toggle.
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
      className="topbar glass-surface"
      style={{
        position: 'fixed', top: 0,
        left: 'var(--sidebar-width)', right: 0,
        height: 'var(--topbar-height)',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 1.75rem',
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '.55rem' }}>
        <span style={{
          fontSize: '.74rem',
          fontWeight: 700,
          color: 'var(--color-primary)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}>
          Workspace
        </span>
        <span style={{ color: 'var(--border-strong)', fontSize: '.8rem' }}>/</span>
        <span style={{
          fontSize: '.92rem',
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: 'var(--text-main)',
          letterSpacing: '-.015em',
        }}>
          {title}
        </span>
      </div>

      {/* Top telemetry tag */}
      <div style={{
        display: 'none',
        alignItems: 'center',
        gap: '.45rem',
        padding: '.32rem .85rem',
        borderRadius: 'var(--radius-full)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xs)',
        fontSize: '.75rem',
        color: 'var(--text-muted)',
      }} className="topbar-telemetry">
        <span className="status-dot online" />
        <span style={{ fontWeight: 600 }}>Zero Server Relay</span>
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
