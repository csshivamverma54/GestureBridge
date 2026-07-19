/**
 * Sidebar — main navigation panel.
 * Uses inline SVG icons for a professional look.
 * Collapses to a hamburger on mobile.
 */

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

/* ── SVG icon components ─────────────────────────────────── */
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    {Array.isArray(d)
      ? d.map((path, i) => <path key={i} d={path} />)
      : <path d={d} />}
  </svg>
);

const Icons = {
  dashboard: ['M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z', 'M9 21V12h6v9'],
  signToText: 'M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0M9.5 14.5l-2 3h9l-2-3',
  textToSign: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  history: ['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2'],
  profile: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'],
  settings: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'],
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  sun: ['M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42', 'M12 17a5 5 0 100-10 5 5 0 000 10z'],
  logout: ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4', 'M16 17l5-5-5-5M21 12H9'],
};

const NAV_ITEMS = [
  { path: '/dashboard',    icon: 'dashboard',    label: 'Dashboard'    },
  { path: '/sign-to-text', icon: 'signToText',   label: 'Sign to Text' },
  { path: '/text-to-sign', icon: 'textToSign',   label: 'Text to Sign' },
  { path: '/history',      icon: 'history',      label: 'History'      },
  { path: '/account',      icon: 'settings',     label: 'Account'      },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useSettings();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 40 }}
          onClick={onClose}
        />
      )}

      <aside
        className="sidebar"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 'var(--sidebar-width)',
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          zIndex: 50,
          transform: open ? 'translateX(0)' : undefined,
          transition: 'transform var(--transition)',
          overflowY: 'auto',
        }}
      >
        {/* Logo / brand */}
        <div style={{
          padding: '0 1.25rem',
          height: 'var(--topbar-height)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '.625rem',
          flexShrink: 0,
        }}>
          {/* Wordmark icon — geometric G */}
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '.9rem', letterSpacing: '-.01em', color: 'var(--text-main)' }}>
            GestureBridge
          </span>
        </div>

        {/* User block */}
        <div style={{
          padding: '.875rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '.625rem',
          flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 600, fontSize: '.8rem', flexShrink: 0,
          }}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '.8375rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: '.725rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email || ''}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '.75rem .75rem 0' }}>
          <div className="section-label">Menu</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon d={Icons[item.icon]} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '.125rem' }}>
          <button
            onClick={toggleTheme}
            className="nav-link"
            style={{ width: '100%', textAlign: 'left' }}
          >
            <Icon d={theme === 'light' ? Icons.moon : Icons.sun} />
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
          <button
            onClick={handleLogout}
            className="nav-link"
            style={{ width: '100%', textAlign: 'left', color: 'var(--color-error)' }}
          >
            <Icon d={Icons.logout} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
