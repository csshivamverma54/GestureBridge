/**
 * Dashboard — authenticated home page.
 * Shows quick stats, model status, and quick-access cards.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { CardLoader } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getHistory, getModelStatus, getErrorMessage } from '../services/api';

/* ── SVG icon helper ─────────────────────────────────────── */
const Icon = ({ d, size = 18, stroke = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const QUICK_ACTIONS = [
  {
    to: '/sign-to-text',
    icon: ['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0'],
    title: 'Sign to Text',
    desc: 'Open webcam and start translating signs into words in real time.',
  },
  {
    to: '/text-to-sign',
    icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    title: 'Text to Sign',
    desc: 'Type text and see the corresponding sign-language video instantly.',
  },
  {
    to: '/history',
    icon: ['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2'],
    title: 'History',
    desc: 'Review and export your past translation sessions.',
  },
  {
    to: '/profile',
    icon: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'],
    title: 'Profile',
    desc: 'Update your name, email, and account details.',
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { language } = useSettings();
  const [historyCount, setHistoryCount] = useState(null);
  const [modelStatus,  setModelStatus]  = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const userId = user?.email || '';
        const [histRes, modelRes] = await Promise.allSettled([
          getHistory(userId),
          getModelStatus(),
        ]);
        if (histRes.status === 'fulfilled')  setHistoryCount(histRes.value.data.length);
        if (modelRes.status === 'fulfilled') setModelStatus(modelRes.value.data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [user]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <AppShell>
      {/* Page header */}
      <div className="page-header">
        <h1>Good {getGreeting()}, {user?.name?.split(' ')[0] || 'User'}</h1>
        <p>{today}</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {modelStatus && !modelStatus.model_loaded && (
        <Alert
          type="warning"
          message={`ML model is not loaded — Sign-to-Text predictions will not work until the model is trained (${modelStatus.num_classes} classes registered).`}
        />
      )}

      {/* Stats row */}
      {loading ? (
        <CardLoader />
      ) : (
        <div className="grid-4" style={{ marginBottom: '1.75rem' }}>
          <StatCard
            iconPath={['M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z']}
            label="Total Translations"
            value={historyCount ?? '—'}
          />
          <StatCard
            iconPath={modelStatus?.model_loaded
              ? ['M9 12l2 2 4-4', 'M12 2a10 10 0 100 20 10 10 0 000-20z']
              : ['M12 9v4', 'M12 17h.01', 'M12 2a10 10 0 100 20 10 10 0 000-20z']}
            label="Model Status"
            value={modelStatus?.model_loaded ? 'Ready' : 'Not Loaded'}
            valueColor={modelStatus?.model_loaded ? 'var(--color-success)' : 'var(--color-warning)'}
          />
          <StatCard
            iconPath={['M3 5h12M3 10h12M3 15h6', 'M15 15l2 2 4-4']}
            label="Sign Language"
            value={language}
          />
          <StatCard
            iconPath={['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5']}
            label="Sign Classes"
            value={modelStatus?.num_classes ?? '—'}
          />
        </div>
      )}

      {/* Quick actions */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Quick Actions</h3>
        <div className="grid-2">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '.875rem', cursor: 'pointer' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon d={a.icon} size={18} />
                </div>
                <div>
                  <h4 style={{ marginBottom: '.25rem', color: 'var(--text-main)' }}>{a.title}</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '.8375rem', lineHeight: 1.55 }}>{a.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Model info */}
      {modelStatus && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Model Information</h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <InfoRow label="Status" value={modelStatus.model_loaded ? 'Loaded' : 'Not Loaded'} />
            <InfoRow label="Total Classes" value={modelStatus.num_classes} />
            {modelStatus.sample_labels?.length > 0 && (
              <InfoRow
                label="Sample Words"
                value={modelStatus.sample_labels.join(', ')}
              />
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function StatCard({ iconPath, label, value, valueColor }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: '.75rem', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.01em' }}>{label}</span>
        <div style={{ color: 'var(--text-light)' }}>
          <Icon d={iconPath} size={15} />
        </div>
      </div>
      <div style={{
        fontSize: '1.5rem', fontWeight: 700,
        color: valueColor || 'var(--text-main)',
        letterSpacing: '-.02em',
      }}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '.75rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '.2rem' }}>{label}</div>
      <div style={{ fontSize: '.875rem', color: 'var(--text-main)' }}>{value}</div>
    </div>
  );
}
