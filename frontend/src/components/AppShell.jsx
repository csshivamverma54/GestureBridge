/**
 * AppShell — wraps authenticated pages with Sidebar + Topbar.
 * Handles mobile sidebar open/close state.
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
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="page-wrapper fade-in">
          {children}
        </main>
      </div>

      {/* Mobile sidebar CSS override */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
          }
          .topbar { left: 0 !important; }
          .topbar-hamburger { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
