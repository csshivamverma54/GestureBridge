/**
 * Dashboard — authenticated home page.
 * Rich stats cards, quick actions with color accents, model status, activity feed.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { CardLoader } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getHistory, getModelStatus, getErrorMessage } from '../services/api';

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const QUICK_ACTIONS = [
  {
    to: '/sign-to-text',
    icon: ['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0'],
    title: 'Sign to Text',
    desc: 'Open webcam and translate ASL gestures into words in real time.',
    accent: '#2563EB', bg: '#EFF6FF', darkBg: '#0D2149',
  },
  {
    to: '/text-to-sign',
    icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    title: 'Text to Sign',
    desc: 'Type text and see the corresponding WLASL sign video instantly.',
    accent: '#7C3AED', bg: '#F5F3FF', darkBg: '#200D40',
  },
  {
    to: '/history',
    icon: ['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2'],
    title: 'History',
    desc: 'Review and export your past translation sessions.',
    accent: '#059669', bg: '#ECFDF5', darkBg: '#022C22',
  },
  {
    to: '/account',
    icon: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'],
    title: 'Account',
    desc: 'Update profile, password, appearance and privacy settings.',
    accent: '#D97706', bg: '#FFFBEB', darkBg: '#2D1B00',
  },
];

const STAT_CARDS = (historyCount, modelStatus, language) => [
  {
    label: 'Translations',
    value: historyCount ?? '—',
    icon: ['M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'],
    accent: '#2563EB', bg: '#EFF6FF', darkBg: '#0D2149',
  },
  {
    label: 'Model Status',
    value: modelStatus?.model_loaded ? 'Ready' : 'Not Loaded',
    icon: modelStatus?.model_loaded
      ? ['M9 12l2 2 4-4', 'M12 2a10 10 0 100 20 10 10 0 000-20z']
      : ['M12 9v4', 'M12 17h.01', 'M12 2a10 10 0 100 20 10 10 0 000-20z'],
    accent: modelStatus?.model_loaded ? '#059669' : '#D97706',
    bg: modelStatus?.model_loaded ? '#ECFDF5' : '#FFFBEB',
    darkBg: modelStatus?.model_loaded ? '#022C22' : '#2D1B00',
    valueColor: modelStatus?.model_loaded ? 'var(--color-success)' : 'var(--color-warning)',
  },
  {
    label: 'Sign Classes',
    value: modelStatus?.num_classes ?? '—',
    icon: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    accent: '#7C3AED', bg: '#F5F3FF', darkBg: '#200D40',
  },
  {
    label: 'Sign Language',
    value: language,
    icon: ['M3 5h12M3 10h12M3 15h6', 'M15 15l2 2 4-4'],
    accent: '#0891B2', bg: '#ECFEFF', darkBg: '#082030',
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { language, theme } = useSettings();
  const [historyCount, setHistoryCount] = useState(null);
  const [modelStatus,  setModelStatus]  = useState(null);
  const [recentItems,  setRecentItems]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const dark = theme === 'dark';

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const [histRes, modelRes] = await Promise.allSettled([
          getHistory(user?.email || ''),
          getModelStatus(),
        ]);
        if (histRes.status === 'fulfilled') {
          const data = histRes.value.data;
          setHistoryCount(data.length);
          setRecentItems(data.slice(0, 5));
        }
        if (modelRes.status === 'fulfilled') setModelStatus(modelRes.value.data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    if (!user?.isGuest) loadStats();
    else setLoading(false);
  }, [user]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const stats = STAT_CARDS(historyCount, modelStatus, language);

  return (
    <AppShell>
      {/* ── Welcome banner ── */}
      <div style={{
        background: dark ? 'linear-gradient(135deg, #0D1F42 0%, #1a1040 100%)' : 'linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)',
        border: `1px solid ${dark ? '#1E3A5F' : '#BFDBFE'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem 1.75rem',
        marginBottom: '1.75rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: '.3rem' }}>
            Dashboard
          </div>
          <h2 style={{ marginBottom: '.25rem', fontSize: 'clamp(1.1rem, 2vw, 1.45rem)' }}>
            {getGreeting()}, {user?.name?.split(' ')[0] || 'User'}{user?.isGuest ? ' (Guest)' : ''} 👋
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', margin: 0 }}>{today}</p>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <Link to="/sign-to-text" className="btn btn-primary btn-sm" style={{ gap: '.4rem' }}>
            <Icon d={['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0']} size={14} />
            Sign to Text
          </Link>
          <Link to="/text-to-sign" className="btn btn-ghost btn-sm" style={{ gap: '.4rem' }}>
            <Icon d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" size={14} />
            Text to Sign
          </Link>
        </div>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {modelStatus && !modelStatus.model_loaded && (
        <Alert type="warning"
          message={`ML model is not loaded — Sign-to-Text predictions won't work until the model is trained (${modelStatus.num_classes} classes registered).`}
        />
      )}

      {user?.isGuest && (
        <Alert type="info"
          message="You're signed in as a guest. Translation history won't be saved. Create a free account to unlock full features."
        />
      )}

      {/* ── Stat cards ── */}
      {loading ? <CardLoader /> : (
        <div className="grid-4" style={{ marginBottom: '1.75rem' }}>
          {stats.map((s) => (
            <div key={s.label} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
              {/* Accent strip */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background: s.accent, borderRadius: '10px 10px 0 0' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.75rem', paddingTop:'.25rem' }}>
                <span style={{ fontSize:'.73rem', fontWeight:600, color:'var(--text-muted)', letterSpacing:'.01em', textTransform:'uppercase' }}>{s.label}</span>
                <div style={{
                  width:32, height:32, borderRadius:8,
                  background: dark ? s.darkBg : s.bg, color: s.accent,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <Icon d={s.icon} size={15} />
                </div>
              </div>
              <div style={{ fontSize:'1.65rem', fontWeight:800, color: s.valueColor || 'var(--text-main)', letterSpacing:'-.03em', lineHeight:1 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Quick actions ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.875rem' }}>
          <h3>Quick Actions</h3>
        </div>
        <div className="grid-2">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} style={{ textDecoration:'none' }}>
              <div className="card" style={{
                display:'flex', alignItems:'flex-start', gap:'.875rem', cursor:'pointer',
                borderTop: `3px solid ${a.accent}`,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='var(--shadow-md)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
              >
                <div style={{
                  width:42, height:42, borderRadius:10, flexShrink:0,
                  background: dark ? a.darkBg : a.bg, color: a.accent,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <Icon d={a.icon} size={20} />
                </div>
                <div>
                  <h4 style={{ marginBottom:'.25rem', color:'var(--text-main)', fontSize:'.9375rem' }}>{a.title}</h4>
                  <p style={{ color:'var(--text-muted)', fontSize:'.8375rem', lineHeight:1.55, margin:0 }}>{a.desc}</p>
                </div>
                <div style={{ marginLeft:'auto', color:'var(--text-light)', flexShrink:0 }}>
                  <Icon d="M9 18l6-6-6-6" size={16} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Bottom row: model info + recent activity ── */}
      <div className="grid-2">
        {/* Model info card */}
        {modelStatus && (
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'1rem' }}>
              <div style={{
                width:32, height:32, borderRadius:8,
                background: modelStatus.model_loaded ? (dark ? '#022C22' : '#ECFDF5') : (dark ? '#2D1B00' : '#FFFBEB'),
                color: modelStatus.model_loaded ? 'var(--color-success)' : 'var(--color-warning)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <Icon d={modelStatus.model_loaded ? ['M9 12l2 2 4-4', 'M12 2a10 10 0 100 20 10 10 0 000-20z'] : ['M12 9v4','M12 17h.01','M12 2a10 10 0 100 20 10 10 0 000-20z']} size={15} />
              </div>
              <h4>ML Model</h4>
              <span className={`badge ${modelStatus.model_loaded ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft:'auto' }}>
                {modelStatus.model_loaded ? 'Loaded' : 'Not Loaded'}
              </span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'.6rem' }}>
              <InfoRow label="Classes" value={modelStatus.num_classes} />
              {modelStatus.sample_labels?.length > 0 && (
                <InfoRow label="Sample Signs" value={modelStatus.sample_labels.slice(0,3).join(', ') + '…'} />
              )}
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
            <h4>Recent Activity</h4>
            <Link to="/history" style={{ fontSize:'.78rem', color:'var(--color-primary)', fontWeight:600 }}>View all</Link>
          </div>
          {recentItems.length === 0 ? (
            <div style={{ textAlign:'center', padding:'1.5rem 0', color:'var(--text-muted)', fontSize:'.875rem' }}>
              <Icon d={['M12 8v4l3 3','M3.05 11a9 9 0 110 2']} size={28} />
              <p style={{ marginTop:'.5rem' }}>No translations yet. Start signing!</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
              {recentItems.map((r, i) => (
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:'.75rem',
                  padding:'.5rem .75rem', borderRadius:'var(--radius-sm)',
                  background:'var(--bg-surface)',
                }}>
                  <div style={{ flex:1, fontWeight:600, fontSize:'.875rem', color:'var(--text-main)' }}>
                    {r.predicted_text}
                  </div>
                  <span className="badge badge-primary" style={{ flexShrink:0 }}>
                    {r.confidence ? `${(r.confidence * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'.8375rem' }}>
      <span style={{ color:'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight:600, color:'var(--text-main)' }}>{value}</span>
    </div>
  );
}
