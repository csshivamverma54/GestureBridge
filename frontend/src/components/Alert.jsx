/** Reusable Alert / notification banner component. */

import React from 'react';

const AlertIcon = ({ type }) => {
  const paths = {
    success: 'M9 12l2 2 4-4M12 2a10 10 0 100 20 10 10 0 000-20z',
    error:   'M12 8v4M12 16h.01M12 2a10 10 0 100 20 10 10 0 000-20z',
    warning: 'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    info:    'M12 16v-4M12 8h.01M12 2a10 10 0 100 20 10 10 0 000-20z',
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: '1px' }}>
      <path d={paths[type] || paths.info} />
    </svg>
  );
};

const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} message
 * @param {() => void} [onClose]
 */
export default function Alert({ type = 'info', message, onClose }) {
  if (!message) return null;
  return (
    <div className={`alert alert-${type} fade-in`} role="alert">
      <AlertIcon type={type} />
      <span style={{ flex: 1 }}>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            opacity: .6, color: 'inherit', display: 'flex', alignItems: 'center',
            padding: '2px',
          }}
          aria-label="Dismiss"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
