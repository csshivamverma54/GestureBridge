/**
 * History Page — view, search, filter, delete, and export translation history.
 *
 * GET /history/:user_id → array of { gesture, predicted_text, timestamp }
 */

import React, { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { CardLoader } from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { getHistory, getErrorMessage } from '../services/api';

export default function History() {
  const { user } = useAuth();
  const [records,   setRecords]   = useState([]);
  const [filtered,  setFiltered]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    // Filter records by search term
    if (!searchTerm.trim()) {
      setFiltered(records);
    } else {
      const lower = searchTerm.toLowerCase();
      setFiltered(records.filter((r) => r.predicted_text?.toLowerCase().includes(lower)));
    }
  }, [searchTerm, records]);

  async function loadHistory() {
    setLoading(true);
    setError('');
    try {
      const { data } = await getHistory(user?.email || '');
      // Sort by timestamp desc
      const sorted = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setRecords(sorted);
      setFiltered(sorted);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const exportHistory = () => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gesturebridge-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="page-header">
        <h1>Translation History</h1>
        <p>View and manage your past sign-to-text translations.</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {/* Toolbar */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="form-input"
          placeholder="🔍 Search by predicted text..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="btn btn-outline" onClick={loadHistory}>
          Refresh
        </button>
        <button className="btn btn-primary" onClick={exportHistory} disabled={filtered.length === 0}>
          Export JSON
        </button>
      </div>

      {/* Results count */}
      <div style={{ marginBottom: '1rem', fontSize: '.9rem', color: 'var(--text-muted)' }}>
        Showing {filtered.length} of {records.length} records
      </div>

      {loading ? (
        <CardLoader />
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <h3 style={{ marginBottom: '.5rem' }}>No History Yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {searchTerm ? 'No records match your search.' : 'Start translating signs to build your history.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map((rec, idx) => (
            <HistoryCard key={idx} record={rec} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function HistoryCard({ record }) {
  const { predicted_text, timestamp, confidence, top5 } = record;
  const date = new Date(timestamp);

  return (
    <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8,
        background: 'var(--color-primary-light)',
        color: 'var(--color-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v4l3 3M3.05 11a9 9 0 110 2"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.4rem' }}>
          <h4 style={{ fontSize: '1.05rem' }}>{predicted_text}</h4>
          <span className="badge badge-primary">
            {confidence ? `${(confidence * 100).toFixed(1)}%` : '—'}
          </span>
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
          {date.toLocaleString()}
        </div>
        {top5 && top5.length > 0 && (
          <details style={{ marginTop: '.75rem', fontSize: '.85rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--color-primary)' }}>View Top-5 Predictions</summary>
            <div style={{ marginTop: '.5rem', paddingLeft: '1rem' }}>
              {top5.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.2rem' }}>
                  <span>{t.word}</span>
                  <span className="badge badge-teal">{(t.confidence * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
