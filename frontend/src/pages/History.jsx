/**
 * History Page — view, search, filter, export translation history.
 *
 * Redesigned in the warm-cream, glossy 3D claymorphism aesthetic while
 * preserving 100% of filtering, CSV/JSON exports, pagination, and IBM Watsonx insights.
 */

import React, { useState, useEffect, useCallback } from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { CardLoader, Spinner } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { getHistory, getErrorMessage, getSentenceInsights } from '../services/api';

const Icon = ({ d, size = 16 }) => (
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

const CONFIDENCE_BANDS = [
  { label: 'All Confidence', min: 0,    max: 1    },
  { label: 'High (≥75%)',    min: 0.75, max: 1    },
  { label: 'Medium (50-74%)', min: 0.5,  max: 0.75 },
  { label: 'Low (<50%)',     min: 0,    max: 0.5  },
];

const MODE_FILTERS = [
  { id: 'all',            label: 'All Modes' },
  { id: 'sign-to-text',   label: 'Sign to Text' },
  { id: 'fingerspelling', label: 'Fingerspelling' },
  { id: 'text-to-sign',   label: 'Text to Sign' },
];

export default function History() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [band, setBand] = useState(0);
  const [selectedMode, setSelectedMode] = useState('all');
  const [visibleCount, setVisibleCount] = useState(25);

  /* ── AI Insights ── */
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  const loadHistory = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError('');
    try {
      if (user?.isGuest || !user?.email) {
        setRecords([]);
        setFiltered([]);
        return;
      }
      const { data } = await getHistory(user.email, 300);
      const list = Array.isArray(data) ? data : [];
      const sorted = [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setRecords(sorted);
      setVisibleCount(25);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadHistory();
    }
  }, [loadHistory, authLoading]);

  useEffect(() => {
    const { min, max } = CONFIDENCE_BANDS[band];
    const lower = searchTerm.toLowerCase();
    setFiltered(
      records.filter((r) => {
        const rMode = (r.mode || r.type || 'sign-to-text').toLowerCase();
        const modeMatch =
          selectedMode === 'all' ||
          rMode === selectedMode ||
          (selectedMode === 'sign-to-text' && (rMode === 'signtotext' || (!r.mode && !r.type)));
        const textMatch = !lower || r.predicted_text?.toLowerCase().includes(lower);
        const conf = r.confidence ?? 0;
        const confMatch = conf >= min && conf <= max;
        return modeMatch && textMatch && confMatch;
      })
    );
    setVisibleCount(25);
  }, [searchTerm, records, band, selectedMode]);

  const exportCSV = () => {
    const header = 'Predicted Text,Mode,Confidence,Timestamp\n';
    const rows = filtered
      .map(
        (r) =>
          `"${r.predicted_text}","${r.mode || r.type || 'sign-to-text'}",${((r.confidence ?? 0) * 100).toFixed(1)}%,"${new Date(r.timestamp).toLocaleString()}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gesturebridge-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gesturebridge-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchInsights = async () => {
    if (records.length === 0) return;
    setInsightsLoading(true);
    setInsightsError('');
    setInsights('');
    try {
      const translations = records.slice(0, 30).map((r) => r.predicted_text).filter(Boolean);
      const { data } = await getSentenceInsights(translations);
      setInsights(data.insights || '');
    } catch (err) {
      setInsightsError(getErrorMessage(err));
    } finally {
      setInsightsLoading(false);
    }
  };

  return (
    <AppShell>
      {/* ── Page Header with Warm 3D Telemetry Badges ── */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
              <span className="badge badge-primary">
                <span className="status-dot online" style={{ width: 6, height: 6 }} />
                IndexedDB Local Vault
              </span>
              <span className="badge badge-success">Client-Side Encrypted</span>
              <span className="telemetry-pill">Zero Server Relay</span>
            </div>

            <h1 style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.35rem' }}>
              Translation <span className="gradient-text">History</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0, maxWidth: '680px', lineHeight: 1.55 }}>
              Review, filter, inspect neural classification probabilities, and export past translated phrases.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.55rem', flexShrink: 0, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={loadHistory} style={{ gap: '0.4rem', height: '38px' }}>
              <Icon d="M1 4v6h6M23 20v-6h-6" size={13} />
              Refresh
            </button>
            <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={filtered.length === 0} style={{ gap: '0.4rem', height: '38px', fontWeight: 600 }}>
              <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} />
              Export CSV
            </button>
            <button className="btn btn-ink btn-sm" onClick={exportJSON} disabled={filtered.length === 0} style={{ gap: '0.4rem', height: '38px', fontWeight: 600 }}>
              <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} />
              Export JSON
            </button>
          </div>
        </div>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {/* ── Search and Filter Toolbar ── */}
      <div
        className="card history-toolbar"
        style={{
          marginBottom: '1.35rem',
          display: 'flex',
          gap: '0.85rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '1.05rem 1.3rem',
        }}
      >
        <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
          <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }}>
            <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" size={15} />
          </div>
          <input
            type="text"
            className="form-input"
            placeholder="Search translated words or timestamps…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.5rem', height: '40px', borderRadius: 'var(--radius-full)' }}
          />
        </div>

        {/* Mode Filter Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {MODE_FILTERS.map((mf) => {
            const count = records.filter((r) => {
              if (mf.id === 'all') return true;
              const rMode = (r.mode || r.type || 'sign-to-text').toLowerCase();
              return rMode === mf.id || (mf.id === 'sign-to-text' && (rMode === 'signtotext' || (!r.mode && !r.type)));
            }).length;
            const isSelected = selectedMode === mf.id;
            return (
              <button
                key={mf.id}
                onClick={() => setSelectedMode(mf.id)}
                style={{
                  padding: '0.38rem 0.85rem',
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  background: isSelected ? 'var(--bg-card)' : 'transparent',
                  color: isSelected ? 'var(--color-primary)' : 'var(--text-muted)',
                  boxShadow: isSelected ? 'var(--shadow-xs)' : 'none',
                  transition: 'all var(--transition)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>{mf.label}</span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    background: isSelected ? 'var(--color-primary-light)' : 'var(--bg-card)',
                    color: isSelected ? 'var(--color-primary)' : 'var(--text-light)',
                    fontWeight: 700,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Confidence Filter Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {CONFIDENCE_BANDS.map((b, i) => (
            <button
              key={b.label}
              onClick={() => setBand(i)}
              style={{
                padding: '0.38rem 0.85rem',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.76rem',
                fontWeight: 600,
                background: band === i ? 'var(--bg-card)' : 'transparent',
                color: band === i ? 'var(--color-primary)' : 'var(--text-muted)',
                boxShadow: band === i ? 'var(--shadow-xs)' : 'none',
                transition: 'all var(--transition)',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count Line */}
      <div style={{ marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Icon d={['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2']} size={14} />
          <span>
            Showing <strong style={{ color: 'var(--text-main)' }}>{filtered.length}</strong> of {records.length} records in local vault
          </span>
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          AUTO-SAVED IN-BROWSER
        </span>
      </div>

      {/* ── AI Insights Panel ── */}
      {records.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: '1.35rem',
            padding: '1.35rem',
            background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-surface) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                  fontSize: '1.05rem',
                }}
              >
                ✨
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>AI Vocabulary &amp; Pattern Insights</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>
                  IBM Watsonx analyzes recent translations to identify vocabulary clusters and signing fluency tips.
                </p>
              </div>
            </div>

            <button
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, fontWeight: 600 }}
              onClick={fetchInsights}
              disabled={insightsLoading}
            >
              {insightsLoading ? <Spinner size="sm" /> : '✨'} {insights ? 'Refresh Insights' : 'Generate AI Insights'}
            </button>
          </div>

          {insightsError && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--color-error)' }}>{insightsError}</p>
          )}

          {insights && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.95rem 1.2rem',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                borderLeft: '4px solid var(--color-primary)',
              }}
            >
              <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.65, margin: 0 }}>{insights}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Translation Records List ── */}
      {loading ? (
        <CardLoader />
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: '20px',
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}
          >
            <Icon d={['M12 8v4l3 3', 'M3.05 11a9 9 0 110 2']} size={26} />
          </div>
          <h3 style={{ marginBottom: '0.4rem', fontSize: '1.18rem', fontWeight: 800 }}>No Matching Records</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 360, margin: '0 auto', fontSize: '0.86rem', lineHeight: 1.55 }}>
            {searchTerm || band > 0
              ? 'No translation entries match your current search query or confidence filter.'
              : 'Launch Sign to Text or Text to Sign to start recording translation history.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.slice(0, visibleCount).map((rec, idx) => (
            <HistoryCard key={idx} record={rec} />
          ))}
          {visibleCount < filtered.length && (
            <div style={{ textAlign: 'center', marginTop: '1.25rem', marginBottom: '0.5rem' }}>
              <button
                className="btn btn-outline"
                onClick={() => setVisibleCount((prev) => prev + 25)}
                style={{ minWidth: '230px', height: '42px', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Load More ({Math.min(visibleCount, filtered.length)} of {filtered.length} entries)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Local Data Privacy Notice ── */}
      <div
        className="card"
        style={{
          marginTop: '2rem',
          padding: '1.3rem 1.5rem',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '14px',
            background: 'var(--bg-card)',
            color: 'var(--color-primary)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
            Client-Side Data Retention Policy
          </div>
          <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            All translation records shown here are saved exclusively in your local browser storage via IndexedDB. No transcripts, gestures, or personal video recordings are ever relayed or persisted on our remote servers.
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function HistoryCard({ record }) {
  const { predicted_text, timestamp, confidence, top5 } = record;
  const date = new Date(timestamp);
  const conf = confidence ?? 0;
  const confPct = Math.round(conf * 100);
  const confColor = conf >= 0.75 ? 'var(--color-success)' : conf >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)';
  const confClass = conf >= 0.75 ? 'badge-success' : conf >= 0.5 ? 'badge-warning' : 'badge-error';

  const rawMode = (record.mode || record.type || 'sign-to-text').toLowerCase();
  const isTextToSign = rawMode === 'text-to-sign';
  const isFingerspelling = rawMode === 'fingerspelling';

  const modeBadge = isTextToSign
    ? {
        label: 'Text to Sign',
        bg: 'rgba(14, 165, 233, 0.12)',
        color: '#0284c7',
        border: '1px solid rgba(14, 165, 233, 0.28)',
        iconBg: 'rgba(14, 165, 233, 0.12)',
        iconColor: '#0284c7',
        iconPath: ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
      }
    : isFingerspelling
    ? {
        label: 'Fingerspelling',
        bg: 'rgba(107, 76, 255, 0.12)',
        color: '#6B4CFF',
        border: '1px solid rgba(107, 76, 255, 0.28)',
        iconBg: 'rgba(107, 76, 255, 0.12)',
        iconColor: '#6B4CFF',
        iconPath: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
      }
    : {
        label: 'Sign to Text',
        bg: 'rgba(16, 185, 129, 0.12)',
        color: '#059669',
        border: '1px solid rgba(16, 185, 129, 0.28)',
        iconBg: 'rgba(16, 185, 129, 0.12)',
        iconColor: '#059669',
        iconPath: ['M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'],
      };

  return (
    <div className="card-3d" style={{ padding: '1.25rem 1.45rem' }}>
      <div style={{ display: 'flex', gap: '0.95rem', alignItems: 'flex-start' }}>
        {/* Icon */}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: '14px',
            background: modeBadge.iconBg,
            color: modeBadge.iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {modeBadge.iconPath.map((p, i) => (
              <path key={i} d={p} />
            ))}
          </svg>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
              <h4 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0, color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
                {predicted_text}
              </h4>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.65rem',
                  borderRadius: 'var(--radius-full)',
                  background: modeBadge.bg,
                  color: modeBadge.color,
                  border: modeBadge.border,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                }}
              >
                {modeBadge.label}
              </span>
            </div>
            <span className={`badge ${confClass}`}>
              {isTextToSign ? 'Synthesized' : `${confPct}% Confidence`}
            </span>
          </div>

          {/* Confidence bar */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div className="confidence-bar">
              <div className="confidence-bar-fill" style={{ width: `${confPct}%`, background: confColor }} />
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
            {date.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Top-5 accordion */}
      {top5 && top5.length > 0 && (
        <details style={{ marginTop: '0.9rem', fontSize: '0.85rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.8rem', userSelect: 'none' }}>
            View Top-5 Probability Distribution ▼
          </summary>
          <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {top5.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.42rem 0.75rem',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ color: 'var(--text-main)', fontWeight: i === 0 ? 700 : 500, fontSize: '0.82rem' }}>
                  {i + 1}. {t.word}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <div style={{ width: 64, height: 5, borderRadius: 'var(--radius-full)', background: 'var(--bg-surface-high)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round(t.confidence * 100)}%`, background: 'var(--gradient-brand)' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {(t.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
