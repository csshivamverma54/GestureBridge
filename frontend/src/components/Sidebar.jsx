/**
 * Sidebar — main navigation panel.
 * Redesigned with warm-cream / violet claymorphism aesthetic while preserving
 * all navigation links, user info, theme toggle, and sign-out behavior.
 */

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import BrandLogo from './BrandLogo';

/* ── SVG icon components ─────────────────────────────────── */
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 14, 23, 0.45)', backdropFilter: 'blur(4px)', zIndex: 40 }}
          onClick={onClose}
        />
      )}

      <aside
        className={`sidebar${open ? ' sidebar-open' : ''}`}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 'var(--sidebar-width)',
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          zIndex: 50,
          transition: 'transform 220ms cubic-bezier(.22,1,.36,1)',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Logo / brand */}
        <div style={{
          padding: '0 1.25rem',
          height: 'var(--topbar-height)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '.65rem',
          flexShrink: 0,
        }}>
          <BrandLogo size={34} />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.08rem',
            letterSpacing: '-.03em',
            color: 'var(--text-main)',
          }}>
            GestureBridge
          </span>
        </div>

        {/* Engine status pill */}
        <div style={{ padding: '.85rem 1rem .4rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '.5rem',
            padding: '.45rem .8rem',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            fontSize: '.74rem',
            fontWeight: 600,
            color: 'var(--text-main)',
          }}>
            <span className="status-dot online" />
            <span>Engine Active · On-Device</span>
          </div>
        </div>

        {/* User card */}
        <div style={{
          margin: '.5rem 1rem .25rem',
          padding: '.75rem .85rem',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '.7rem',
          flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 'var(--radius-md)',
            background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: '.9rem', flexShrink: 0,
            boxShadow: '0 6px 14px -4px rgba(107, 76, 255, 0.45)',
            fontFamily: 'var(--font-display)',
          }}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '.86rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email || ''}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '.75rem .85rem 0' }}>
          <div className="section-label">Workspace</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon d={Icons[item.icon]} size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '.85rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
          <button
            onClick={toggleTheme}
            className="nav-link"
            style={{ width: '100%', textAlign: 'left', background: 'transparent' }}
          >
            <Icon d={theme === 'light' ? Icons.moon : Icons.sun} size={16} />
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
          <button
            onClick={handleLogout}
            className="nav-link"
            style={{ width: '100%', textAlign: 'left', color: 'var(--color-error)', background: 'transparent' }}
          >
            <Icon d={Icons.logout} size={16} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
