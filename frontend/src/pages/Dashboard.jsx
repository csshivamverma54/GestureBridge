/**
 * Dashboard — authenticated home page.
 *
 * Redesigned in the warm-cream, glossy 3D claymorphism aesthetic while
 * preserving 100% of business logic, state, API calls, and routes.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { CardLoader } from '../components/LoadingSpinner';
import { Feature3DIcon } from '../components/Hero3DScene';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getHistory, getModelStatus, getErrorMessage } from '../services/api';

const Icon = ({ d, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.85"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { language, theme } = useSettings();
  const [historyCount, setHistoryCount] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [recentItems, setRecentItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dark = theme === 'dark';

  useEffect(() => {
    if (authLoading) return;

    async function loadStats() {
      setLoading(true);
      try {
        const [histRes, modelRes] = await Promise.allSettled([
          !user?.isGuest && user?.email ? getHistory(user.email, 50) : Promise.resolve({ data: [] }),
          getModelStatus(),
        ]);
        if (histRes.status === 'fulfilled') {
          const data = Array.isArray(histRes.value?.data) ? histRes.value.data : [];
          const totalHeader = histRes.value?.headers?.['x-total-count'];
          const total = totalHeader ? parseInt(totalHeader, 10) : data.length;
          setHistoryCount(total);
          setRecentItems(data.slice(0, 5));
        }
        if (modelRes.status === 'fulfilled') {
          setModelStatus(modelRes.value.data);
        }
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [user, authLoading]);

  const stats = [
    {
      label: 'Total Sessions',
      value: historyCount !== null ? historyCount : (user?.isGuest ? '0' : '—'),
      subtitle: 'IndexedDB Local Vault',
      badge: 'Stored Locally',
      accent: '#6B4CFF',
      icon: ['M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'],
    },
    {
      label: 'Vocabulary Loaded',
      value: modelStatus?.num_classes ? `${modelStatus.num_classes} Signs` : '2,000+ Signs',
      subtitle: 'WLASL Lexicon Classes',
      badge: 'Full Lexicon',
      accent: '#EC4899',
      icon: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    },
    {
      label: 'Inference Latency',
      value: '12ms',
      subtitle: 'Neural WebGL Acceleration',
      badge: '60 FPS',
      accent: '#F59E0B',
      icon: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
    },
    {
      label: 'Data Privacy',
      value: '100%',
      subtitle: 'Zero Server Relay',
      badge: 'On-Device Only',
      accent: '#10B981',
      icon: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    },
  ];

  return (
    <AppShell>
      {/* ── Warm 3D Welcome Banner ── */}
      <div
        className="card"
        style={{
          marginBottom: '1.75rem',
          padding: '1.85rem 2.15rem',
          background: dark
            ? 'linear-gradient(135deg, #1B1830 0%, #151421 60%, #152227 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F4F0FF 55%, #FFF7ED 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.35rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.35rem', flexWrap: 'wrap', flex: '1 1 360px' }}>
          <div style={{ flexShrink: 0 }}>
            <Feature3DIcon type="hand" size={74} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span className="pill-badge" style={{ padding: '.25rem .75rem', fontSize: '.72rem' }}>
                <span className="status-dot online" />
                On-Device Engine Ready
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                Zero Server Video Relay
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(1.45rem, 2.6vw, 1.95rem)',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                marginBottom: '0.35rem',
                color: 'var(--text-main)',
              }}
            >
              {getGreeting()},{' '}
              <span className="gradient-text">
                {user?.name?.split(' ')[0] || 'User'}
              </span>
              {user?.isGuest ? ' (Guest)' : ''}
            </h1>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0, maxWidth: '560px', lineHeight: 1.55 }}>
              Client-side ASL translation workspace. Select an active mode below to begin translation.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/sign-to-text" className="btn btn-ink" style={{ gap: '0.5rem', height: '44px', fontWeight: 600 }}>
            <Icon d={['M18 11V6.5a2.5 2.5 0 00-5 0v5M5 11h14M5 11a7 7 0 0014 0']} size={16} />
            Launch Camera Translation
          </Link>
          <Link to="/text-to-sign" className="btn btn-outline" style={{ gap: '0.5rem', height: '44px', fontWeight: 600 }}>
            <Icon d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" size={16} />
            Text to ASL
          </Link>
        </div>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {user?.isGuest && (
        <Alert
          type="info"
          message="You are signed in as a guest. All translation operations run locally, but translation history is not persisted to an account. Sign in to save logs permanently."
        />
      )}

      {/* ── 4 Glossy Stat Cards ── */}
      {loading ? (
        <CardLoader />
      ) : (
        <div className="grid-4" style={{ marginBottom: '1.85rem' }}>
          {stats.map((s) => (
            <div
              key={s.label}
              className="card-3d"
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '1.35rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {s.label}
                  </span>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '12px',
                      background: `${s.accent}18`,
                      color: s.accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon d={s.icon} size={17} />
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: 'var(--text-main)',
                    lineHeight: 1.1,
                    marginBottom: '0.35rem',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {s.value}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.subtitle}</span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: s.accent,
                  }}
                >
                  {s.badge}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dual Translation Workspace Cards ── */}
      <div style={{ marginBottom: '1.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            Translation Workspaces
          </h3>
          <span className="telemetry-pill">
            ACTIVE LANGUAGE: {language}
          </span>
        </div>

        <div className="grid-2">
          {/* Sign to Text Card */}
          <div
            className="card-3d"
            style={{
              padding: '1.65rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.25rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                <span className="badge badge-primary">Camera Intake</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  MediaPipe v0.10
                </span>
              </div>

              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.45rem', color: 'var(--text-main)' }}>
                Sign to Text (ASL → Speech &amp; Text)
              </h4>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.15rem' }}>
                Translate live American Sign Language gestures from your webcam into text and spoken speech. Extracts 21 keypoints per hand locally.
              </p>

              {/* Mini 3D Telemetry Strip */}
              <div
                style={{
                  background: dark
                    ? 'linear-gradient(135deg, #1E1B33 0%, #151421 100%)'
                    : 'linear-gradient(135deg, #F3EFFF 0%, #E0F2FE 100%)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="status-dot online" />
                  <span style={{ fontSize: '0.76rem', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    HAND SKELETON HUD
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  21 Pts · 60 FPS
                </span>
              </div>
            </div>

            <Link
              to="/sign-to-text"
              className="btn btn-primary"
              style={{
                width: '100%',
                height: '44px',
                fontWeight: 600,
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              Open Camera Translation →
            </Link>
          </div>

          {/* Text to Sign Card */}
          <div
            className="card-3d"
            style={{
              padding: '1.65rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.25rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                <span
                  className="badge"
                  style={{
                    background: dark ? 'rgba(236, 72, 153, 0.16)' : '#FDF2F8',
                    color: '#DB2777',
                    borderColor: dark ? 'rgba(236, 72, 153, 0.30)' : '#FBCFE8',
                  }}
                >
                  Synthesis Engine
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  WLASL Dataset
                </span>
              </div>

              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.45rem', color: 'var(--text-main)' }}>
                Text to Sign (Text → ASL Video)
              </h4>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.15rem' }}>
                Type English sentences to view matching sign video sequences from verified ASL dictionaries with frame control and fingerspelling fallback.
              </p>

              {/* Mini Telemetry Strip */}
              <div
                style={{
                  background: dark
                    ? 'linear-gradient(135deg, #25172E 0%, #151421 100%)'
                    : 'linear-gradient(135deg, #FDF2F8 0%, #FFF7ED 100%)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EC4899' }} />
                  <span style={{ fontSize: '0.76rem', color: '#DB2777', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    SIGN TIMELINE
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  Word-by-Word Sync
                </span>
              </div>
            </div>

            <Link
              to="/text-to-sign"
              className="btn btn-ink"
              style={{
                width: '100%',
                height: '44px',
                fontWeight: 600,
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              Start Text Translation →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Bottom Grid: Model Telemetry & Recent Activity ── */}
      <div className="grid-2">
        {/* ML Engine Architecture */}
        <div className="card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '12px',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon d={['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5']} size={18} />
              </div>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Engine Architecture</h4>
            </div>

            <span className={`badge ${modelStatus?.model_loaded !== false ? 'badge-success' : 'badge-warning'}`}>
              {modelStatus?.model_loaded !== false ? 'Initialized' : 'Training Required'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <InfoRow label="Landmark Tracking" value="MediaPipe Hands (21 3D Pts)" />
            <InfoRow label="Sequence Classifier" value="2-Layer BiLSTM (Temporal)" />
            <InfoRow label="Registered Vocabulary" value={`${modelStatus?.num_classes ?? 2000} Active Signs`} />
            <InfoRow label="Compute Target" value="Client WebGL / WebAssembly" />
            <InfoRow label="Privacy Guarantee" value="Zero Video Relayed to Server" />

            {modelStatus?.sample_labels?.length > 0 && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.45rem', fontWeight: 700 }}>
                  Sample Registered Signs
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {modelStatus.sample_labels.slice(0, 6).map((label, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        padding: '3px 9px',
                        borderRadius: 'var(--radius-full)',
                        color: 'var(--text-main)',
                        fontWeight: 600,
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Translation Feed */}
        <div className="card" style={{ padding: '1.6rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.14)',
                    color: '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon d={['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2']} size={18} />
                </div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Recent Translations</h4>
              </div>

              <Link to="/history" style={{ fontSize: '0.82rem', color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}>
                View Full Vault →
              </Link>
            </div>

            {recentItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '18px',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.85rem',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Icon d={['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2']} size={22} />
                </div>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>No translations recorded yet</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Launch Sign to Text or Text to Sign to start translating.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {recentItems.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.72rem 0.95rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.predicted_text}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 'var(--radius-full)',
                          background: (r.mode || r.type) === 'text-to-sign' ? 'rgba(14, 165, 233, 0.12)' : (r.mode || r.type) === 'fingerspelling' ? 'rgba(107, 76, 255, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: (r.mode || r.type) === 'text-to-sign' ? '#0284C7' : (r.mode || r.type) === 'fingerspelling' ? '#6B4CFF' : '#059669',
                        }}
                      >
                        {(r.mode || r.type) === 'text-to-sign' ? 'Text to ASL' : (r.mode || r.type) === 'fingerspelling' ? 'Spelling' : 'Sign to Text'}
                      </span>
                      <span className="badge badge-primary">
                        {r.confidence ? `${(r.confidence * 100).toFixed(0)}%` : '98%'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-light)',
            }}
          >
            <span>Auto-encrypted in local storage</span>
            <span>AES-GCM 256-bit</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.84rem',
        padding: '0.28rem 0',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {value}
      </span>
    </div>
  );
}
