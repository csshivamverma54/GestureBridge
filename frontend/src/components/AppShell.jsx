/**
 * AppShell — wraps authenticated pages with Sidebar + Topbar.
 * Handles mobile sidebar open/close state and ambient warm-cream 3D studio backdrop.
 */

import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const PAGE_TITLES = {
  '/dashboard':    'Dashboard',
  '/sign-to-text': 'Sign to Text',
  '/text-to-sign': 'Text to Sign',
  '/history':      'Translation History',
  '/account':      'Account & Settings',
};

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'GestureBridge';

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-content">
        {/* Ambient pastel gradient blobs behind workspace */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: '-120px',
            right: '-80px',
            width: '440px',
            height: '440px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(107, 76, 255, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            bottom: '-140px',
            left: '180px',
            width: '380px',
            height: '380px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(45, 212, 191, 0.07) 0%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="page-wrapper fade-in">
          {children}
        </main>
      </div>

      <style>{`
        /* ── Desktop: sidebar always visible ── */
        .sidebar { transform: translateX(0); }

        /* ── Mobile: sidebar slides in/out ── */
        @media (max-width: 768px) {
          .sidebar          { transform: translateX(-100%); }
          .sidebar.sidebar-open { transform: translateX(0); }
          .main-content     { margin-left: 0 !important; }
          .topbar           { left: 0 !important; }
          .topbar-hamburger { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
