/**
 * History Page — view, search, filter, export translation history.
 */

import React, { useState, useEffect, useCallback } from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { CardLoader } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { getHistory, getErrorMessage } from '../services/api';

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const CONFIDENCE_BANDS = [
  { label: 'All',      min: 0,    max: 1    },
  { label: 'High',     min: 0.75, max: 1    },
  { label: 'Medium',   min: 0.5,  max: 0.75 },
  { label: 'Low',      min: 0,    max: 0.5  },
];

export default function History() {
  const { user } = useAuth();
  const [records,    setRecords]    = useState([]);
  const [filtered,   setFiltered]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [band,       setBand]       = useState(0); // index into CONFIDENCE_BANDS

  const loadHistory = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await getHistory(user?.email || '');
      const sorted = [...data].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setRecords(sorted);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    const { min, max } = CONFIDENCE_BANDS[band];
    const lower = searchTerm.toLowerCase();
    setFiltered(records.filter((r) => {
      const textMatch = !lower || r.predicted_text?.toLowerCase().includes(lower);
      const conf = r.confidence ?? 0;
      const confMatch = conf >= min && conf <= max;
      return textMatch && confMatch;
    }));
  }, [searchTerm, records, band]);

  const exportCSV = () => {
    const header = 'Predicted Text,Confidence,Timestamp\n';
    const rows = filtered.map(r =>
      `"${r.predicted_text}",${(r.confidence * 100).toFixed(1)}%,"${new Date(r.timestamp).toLocaleString()}"`
    ).join('\n');
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

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
          <div>
            <h1>Translation History</h1>
            <p>View and manage your past sign-to-text translations.</p>
          </div>
          <div style={{ display:'flex', gap:'.5rem', flexShrink:0 }}>
            <button className="btn btn-ghost btn-sm" onClick={loadHistory} style={{ gap:'.4rem' }}>
              <Icon d="M1 4v6h6M23 20v-6h-6" size={13} /> Refresh
            </button>
            <button className="btn btn-outline btn-sm" onClick={exportCSV} disabled={filtered.length === 0} style={{ gap:'.4rem' }}>
              <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} /> CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={exportJSON} disabled={filtered.length === 0} style={{ gap:'.4rem' }}>
              <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} /> JSON
            </button>
          </div>
        </div>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {/* Toolbar */}
      <div className="card" style={{ marginBottom: '1.25rem', display:'flex', gap:'.75rem', alignItems:'center', flexWrap:'wrap', padding:'1rem 1.25rem' }}>
        <div style={{ position:'relative', flex:'1', minWidth:220 }}>
          <div style={{ position:'absolute', left:'.75rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-light)', pointerEvents:'none' }}>
            <Icon d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" size={15} />
          </div>
          <input
            type="text"
            className="form-input"
            placeholder="Search predictions…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft:'2.25rem' }}
          />
        </div>
        {/* Confidence filter pills */}
        <div style={{ display:'flex', gap:'.35rem' }}>
          {CONFIDENCE_BANDS.map((b, i) => (
            <button key={b.label} onClick={() => setBand(i)} style={{
              padding: '.3rem .65rem',
              borderRadius: 999, border:'none', cursor:'pointer',
              fontSize:'.75rem', fontWeight:600,
              background: band === i ? 'var(--color-primary)' : 'var(--bg-surface)',
              color: band === i ? '#fff' : 'var(--text-muted)',
              transition: 'all var(--transition)',
            }}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count line */}
      <div style={{ marginBottom:'.875rem', fontSize:'.8375rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'.5rem' }}>
        <Icon d={['M12 8v4l3 3','M3.05 11a9 9 0 110 2']} size={14} />
        Showing <strong style={{ color:'var(--text-main)' }}>{filtered.length}</strong> of {records.length} records
      </div>

      {loading ? <CardLoader /> : filtered.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'4rem 2rem' }}>
          <div style={{ width:64, height:64, borderRadius:16, background:'var(--color-primary-light)', color:'var(--color-primary)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.25rem' }}>
            <Icon d={['M12 8v4l3 3','M3.05 11a9 9 0 110 2']} size={28} />
          </div>
          <h3 style={{ marginBottom:'.5rem' }}>No Records Found</h3>
          <p style={{ color:'var(--text-muted)', maxWidth:320, margin:'0 auto' }}>
            {searchTerm || band > 0
              ? 'No records match your filters. Try clearing the search or changing the confidence filter.'
              : 'Start translating signs to build your history.'}
          </p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
          {filtered.map((rec, idx) => <HistoryCard key={idx} record={rec} />)}
        </div>
      )}
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

  return (
    <div className="card" style={{ padding:'1.125rem 1.375rem' }}>
      <div style={{ display:'flex', gap:'.875rem', alignItems:'flex-start' }}>
        {/* Icon */}
        <div style={{ width:40, height:40, borderRadius:10, background:'var(--color-primary-light)', color:'var(--color-primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3M3.05 11a9 9 0 110 2"/>
          </svg>
        </div>

        {/* Content */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.4rem', gap:'.5rem', flexWrap:'wrap' }}>
            <h4 style={{ fontSize:'1.05rem', fontWeight:700 }}>{predicted_text}</h4>
            <span className={`badge ${confClass}`}>{confPct}%</span>
          </div>

          {/* Confidence bar */}
          <div style={{ marginBottom:'.5rem' }}>
            <div className="confidence-bar">
              <div className="confidence-bar-fill" style={{ width:`${confPct}%`, background: confColor }} />
            </div>
          </div>

          <div style={{ fontSize:'.78rem', color:'var(--text-muted)' }}>
            {date.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Top-5 accordion */}
      {top5 && top5.length > 0 && (
        <details style={{ marginTop:'.875rem', fontSize:'.85rem' }}>
          <summary style={{ cursor:'pointer', color:'var(--color-primary)', fontWeight:600, fontSize:'.8125rem', userSelect:'none' }}>
            View Top-5 Alternatives
          </summary>
          <div style={{ marginTop:'.6rem', display:'flex', flexDirection:'column', gap:'.35rem' }}>
            {top5.map((t, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.3rem .6rem', background:'var(--bg-surface)', borderRadius:'var(--radius-sm)' }}>
                <span style={{ color:'var(--text-main)', fontWeight: i===0 ? 600 : 400 }}>{t.word}</span>
                <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                  <div style={{ width:60, height:4, borderRadius:999, background:'var(--border)', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.round(t.confidence*100)}%`, background:'var(--color-primary)', borderRadius:999 }} />
                  </div>
                  <span style={{ fontSize:'.75rem', color:'var(--text-muted)', minWidth:34, textAlign:'right' }}>
                    {(t.confidence*100).toFixed(1)}%
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
