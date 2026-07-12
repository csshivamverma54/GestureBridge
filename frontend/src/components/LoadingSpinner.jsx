/** Loading overlay and inline spinner components. */

import React from 'react';

/** Full-screen centered loading overlay. */
export function PageLoader({ message = 'Loading…' }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg-page)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1rem', zIndex: 100,
    }}>
      <div className="spinner spinner-lg" />
      <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>{message}</p>
    </div>
  );
}

/** Inline spinner */
export function Spinner({ size = 'sm' }) {
  return <div className={`spinner spinner-${size}`} />;
}

/** Card-level loading placeholder. */
export function CardLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  );
}
