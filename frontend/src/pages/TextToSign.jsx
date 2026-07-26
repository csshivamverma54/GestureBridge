/**
 * TextToSign Page
 * ───────────────
 * Sends typed text to POST /text-to-sign, receives an ordered list of
 * WLASL video entries, then plays them sequentially — auto-starting
 * immediately after "Show Signs" is clicked.
 *
 * Key behaviours
 * --------------
 * • "Show Signs" button fetches and auto-plays from word 1 with no extra click.
 * • Videos advance with zero artificial delay — onEnded fires the next load.
 * • autoAdvance is ON by default; each video starts the moment canplay fires.
 * • Video URL is built via videoUrl() helper to work on any deployment origin.
 * • Fully responsive down to 320 px.
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useSettings } from '../context/SettingsContext';
import api, { getErrorMessage, bestVideoUrl, getLearningTip } from '../services/api';

/* ── Quick-phrase chips ─────────────────────────────────────────────── */
const QUICK_PHRASES = [
  'hello', 'thank you', 'yes no', 'help please',
  'good morning', 'my name', 'I love you', 'how are you',
];

export default function TextToSign() {
  const { language } = useSettings();

  /* ── Form ──────────────────────────────────────────────────────────── */
  const [text,       setText]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  /* ── Result ────────────────────────────────────────────────────────── */
  const [words,      setWords]      = useState([]);
  const [coverage,   setCoverage]   = useState(null);
  const [vocabHints, setVocabHints] = useState([]);

  /* ── Playback ──────────────────────────────────────────────────────── */
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [playing,     setPlaying]     = useState(false);
  const [speed,       setSpeed]       = useState(1);
  const [loop,        setLoop]        = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [videoError,  setVideoError]  = useState(false);   // true when current src fails

  /* ── AI Learning Tip ───────────────────────────────────────────────── */
  const [tip,        setTip]        = useState(null);   // { tip, fun_fact }
  const [tipLoading, setTipLoading] = useState(false);
  const [tipWord,    setTipWord]    = useState('');     // which word the tip is for

  const videoRef        = useRef(null);
  const autoRef         = useRef(true);
  const loopRef         = useRef(false);
  const currentIdxRef   = useRef(0);
  const playingRef      = useRef(false);
  const playableRef     = useRef([]);
  // Set true while handleVideoEnded is advancing to the next index.
  // Suppresses the browser's synthetic "pause" event that fires when the old
  // <video> element unmounts — prevents playingRef from being set to false
  // before the new video's onCanPlay has a chance to auto-start it.
  const advancingRef    = useRef(false);

  useEffect(() => { autoRef.current    = autoAdvance; }, [autoAdvance]);
  useEffect(() => { loopRef.current    = loop;         }, [loop]);
  useEffect(() => { currentIdxRef.current = currentIdx; setVideoError(false); }, [currentIdx]);
  useEffect(() => { playingRef.current = playing;      }, [playing]);

  /* ── Vocabulary hints ──────────────────────────────────────────────── */
  useEffect(() => {
    api.get('/text-to-sign/vocabulary')
      .then(({ data }) => setVocabHints(data.words || []))
      .catch(() => {});
  }, []);

  /* ── Derived ───────────────────────────────────────────────────────── */
  const playableWords = words.filter((w) => w.found && w.video_url);
  const currentWord   = playableWords[currentIdx] ?? null;
  playableRef.current = playableWords;

  /* ── Keep playbackRate in sync ─────────────────────────────────────── */
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  /* ── Video ended → advance or loop ────────────────────────────────── */
  const handleVideoEnded = useCallback(() => {
    if (!autoRef.current) {
      setPlaying(false); playingRef.current = false; return;
    }
    const nextIdx = currentIdxRef.current + 1;
    if (nextIdx < playableRef.current.length) {
      advancingRef.current  = true;   // block onPause from clearing playingRef
      currentIdxRef.current = nextIdx;
      setCurrentIdx(nextIdx);
      // key={currentIdx} change → <video> remounts → onCanPlay fires → play()
    } else if (loopRef.current) {
      advancingRef.current  = true;
      currentIdxRef.current = 0;
      setCurrentIdx(0);
    } else {
      setPlaying(false); playingRef.current = false;
    }
  }, []);

  /* ── Submit — fetch then immediately start playing ─────────────────── */
  const handleGenerate = async () => {
    const trimmed = text.trim();
    if (!trimmed) { setError('Please enter some text.'); return; }
    setError('');
    setWords([]);
    setCoverage(null);
    setCurrentIdx(0);
    currentIdxRef.current = 0;
    // Mark as playing NOW so onCanPlay auto-starts the first video
    setPlaying(true);
    playingRef.current = true;
    setLoading(true);
    try {
      const { data } = await api.post('/text-to-sign', { text: trimmed, language });
      setWords(data.words || []);
      setCoverage(data.coverage ?? null);
    } catch (err) {
      setError(getErrorMessage(err));
      setPlaying(false);
      playingRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  /* ── Controls ──────────────────────────────────────────────────────── */
  const play = () => {
    if (!currentWord) return;
    playingRef.current = true; setPlaying(true);
    videoRef.current?.play().catch(() => {});
  };
  const pause = () => {
    videoRef.current?.pause();
    playingRef.current = false; setPlaying(false);
  };
  const stop = () => {
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    currentIdxRef.current = 0; setCurrentIdx(0);
    playingRef.current = false; setPlaying(false);
  };
  const prev = () => {
    const idx = Math.max(0, currentIdx - 1);
    currentIdxRef.current = idx; setCurrentIdx(idx);
    // Don't reset playingRef — onCanPlay on the remounted video will resume if playing
  };
  const next = () => {
    const idx = Math.min(playableWords.length - 1, currentIdx + 1);
    currentIdxRef.current = idx; setCurrentIdx(idx);
    // Don't reset playingRef — onCanPlay on the remounted video will resume if playing
  };
  const jumpTo = (idx) => {
    currentIdxRef.current = idx; setCurrentIdx(idx);
    // onCanPlay on remounted video resumes automatically when playingRef is true
  };
  const changeSpeed = (s) => {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  };
  const fullscreen = () => videoRef.current?.requestFullscreen?.();

  /* ── AI learning tip ──────────────────────────────────────────────── */
  const fetchTip = useCallback(async (word) => {
    if (!word || word === tipWord) return;
    setTipLoading(true); setTip(null); setTipWord(word);
    try {
      const { data } = await getLearningTip(word);
      setTip(data);
    } catch {
      setTip(null);
    } finally {
      setTipLoading(false);
    }
  }, [tipWord]);

  /* ── Derived display ───────────────────────────────────────────────── */
  const hasResults    = words.length > 0;
  const notFoundWords = words.filter((w) => !w.found).map((w) => w.word);

  return (
    <AppShell>
      <div className="page-header">
        <h1>Text to Sign</h1>
        <p>Type a sentence — GestureBridge plays the WLASL sign video for each word in order.</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {/* ── Input card ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Enter Your Text</h3>

        <div className="tts-input-row">
          <textarea
            className="form-input form-textarea"
            placeholder="Type words from the supported vocabulary…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ flex: 1, minWidth: 0, fontSize: '1rem', resize: 'vertical' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
          />
          <button
            className="btn btn-primary btn-lg"
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            style={{ flexShrink: 0, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
          >
            {loading ? <><Spinner size="sm" /> Converting…</> : '▶ Show Signs'}
          </button>
        </div>

        {/* Quick phrase chips */}
        <div style={{ marginTop: '.85rem', display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center' }}>
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginRight: '.2rem' }}>Quick:</span>
          {QUICK_PHRASES.map((p) => (
            <button
              key={p}
              onClick={() => setText(p)}
              className="quick-chip"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────── */}
      {hasResults && (
        <div className="tts-grid">

          {/* ── Left: video player ──────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>

            {notFoundWords.length > 0 && (
              <Alert
                type="warning"
                message={`${notFoundWords.length} word${notFoundWords.length > 1 ? 's' : ''} not in vocabulary and will be skipped: ${notFoundWords.join(', ')}`}
              />
            )}

            {playableWords.length > 0 ? (
              <div className="card" style={{ padding: '1rem' }}>

                {/* Word label + counter */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
                  <div>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Now Signing</span>
                    <h2 style={{ color: 'var(--color-primary)', fontSize: 'clamp(1.3rem,4vw,1.8rem)', fontWeight: 800, lineHeight: 1, marginTop: '.1rem' }}>
                      {currentWord?.word}
                    </h2>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Word</span>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                      {currentIdx + 1} / {playableWords.length}
                    </div>
                  </div>
                </div>

                {/* Video element — local first, CDN fallback on error */}
                <div style={{ position: 'relative', background: '#0F172A', borderRadius: 'var(--radius-md)', overflow: 'hidden', aspectRatio: '16/9' }}>
                  {currentWord && !videoError && (
                    <video
                      key={currentIdx}
                      ref={videoRef}
                      src={bestVideoUrl(currentWord)}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onEnded={handleVideoEnded}
                      onPlay={() => {
                        advancingRef.current = false;  // clear once real play starts
                        setPlaying(true); playingRef.current = true;
                      }}
                      onPause={() => {
                        // Ignore synthetic pause fired when old video unmounts during advance
                        if (advancingRef.current) return;
                        setPlaying(false); playingRef.current = false;
                      }}
                      onError={() => setVideoError(true)}
                      onCanPlay={(e) => {
                        advancingRef.current = false;  // safe to clear here too
                        e.target.playbackRate = speed;
                        if (playingRef.current) {
                          e.target.play().catch(() => {});
                        }
                      }}
                      playsInline
                      autoPlay={false}
                    />
                  )}

                  {/* Video unavailable — shown when both local and CDN fail */}
                  {currentWord && videoError && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.75rem', color: '#94A3B8', padding: '1rem', textAlign: 'center' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      <p style={{ fontSize: '.85rem', margin: 0 }}>Video not available locally.</p>
                      {currentWord.external_url && (
                        <a href={currentWord.external_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '.8rem', color: '#60A5FA', textDecoration: 'underline' }}>
                          Watch on source site ↗
                        </a>
                      )}
                      <button className="btn btn-ghost btn-sm" style={{ color: '#94A3B8', borderColor: '#334155' }}
                        onClick={() => { setVideoError(false); handleVideoEnded(); }}>
                        Skip to next
                      </button>
                    </div>
                  )}

                  {/* Translucent play button */}
                  {!playing && !videoError && (
                    <button
                      onClick={play}
                      aria-label="Play"
                      style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,.3)', border: 'none', cursor: 'pointer',
                        color: '#fff', fontSize: '3rem',
                        transition: 'background var(--transition)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,.5)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,.3)'}
                    >
                      ▶
                    </button>
                  )}
                </div>

                {/* Progress dots */}
                <div style={{ margin: '.85rem 0 .5rem', display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                  {playableWords.map((w, i) => (
                    <button
                      key={i}
                      onClick={() => jumpTo(i)}
                      title={w.word}
                      style={{
                        flex: '1 1 0', minWidth: 8, maxWidth: 40, height: 5, borderRadius: 999,
                        border: 'none', cursor: 'pointer', padding: 0,
                        background: i <= currentIdx ? 'var(--color-primary)' : 'var(--border)',
                        transition: 'background var(--transition)',
                      }}
                    />
                  ))}
                </div>

                {/* AI tip button — appears next to the word label */}
                <div style={{ marginTop: '.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '.75rem', gap: '.3rem', display: 'flex', alignItems: 'center' }}
                    onClick={() => fetchTip(currentWord?.word)}
                    disabled={tipLoading || !currentWord}
                    title="Get an AI learning tip for this sign"
                  >
                    {tipLoading ? <Spinner size="sm" /> : '✨'} AI Tip
                  </button>
                </div>

                {/* AI Learning Tip card */}
                {tip && tipWord === currentWord?.word && (
                  <div style={{ marginTop: '.5rem', padding: '.75rem 1rem', background: 'color-mix(in srgb, var(--color-secondary,#7c5cd8) 7%, var(--bg-surface))', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-secondary,#7c5cd8)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--color-secondary,#7c5cd8)', textTransform: 'uppercase', letterSpacing: '.05em' }}>✨ AI Learning Tip — {tip.word || tipWord}</span>
                      <button onClick={() => setTip(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1 }}>✕</button>
                    </div>
                    <p style={{ fontSize: '.855rem', color: 'var(--text-main)', margin: '0 0 .4rem', lineHeight: 1.55 }}>{tip.tip}</p>
                    {tip.fun_fact && (
                      <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>💡 {tip.fun_fact}</p>
                    )}
                  </div>
                )}

                {/* Controls row */}
                <div className="tts-controls">
                  <button className="btn btn-ghost btn-sm" onClick={prev} disabled={currentIdx === 0}>Prev</button>

                  {playing
                    ? <button className="btn btn-subtle" onClick={pause}>⏸ Pause</button>
                    : <button className="btn btn-primary" onClick={play} disabled={!currentWord}>▶ Play</button>
                  }

                  <button className="btn btn-ghost" onClick={stop}>■ Stop</button>
                  <button className="btn btn-ghost btn-sm" onClick={next} disabled={currentIdx >= playableWords.length - 1}>Next</button>
                  <button className="btn btn-ghost btn-sm" onClick={fullscreen} title="Fullscreen">⛶</button>

                  <button
                    className={`btn btn-sm ${loop ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setLoop((l) => !l)}
                    title="Loop sequence"
                  >
                    ↺ Loop
                  </button>

                  <button
                    className={`btn btn-sm ${autoAdvance ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setAutoAdvance((a) => !a)}
                    title="Auto-advance to next word"
                  >
                    ⏩ Auto
                  </button>

                  <div className="tts-speed">
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Speed:</span>
                    {[0.5, 0.75, 1, 1.5].map((s) => (
                      <button
                        key={s}
                        className={`btn btn-sm ${speed === s ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => changeSpeed(s)}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>🤷</div>
                <h3>No Signs Found</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '.5rem' }}>
                  None of the words you entered are in the WLASL vocabulary.
                  Try the word list on the right.
                </p>
              </div>
            )}

            {/* Word sequence strip */}
            <div className="card" style={{ padding: '.85rem 1rem' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '.6rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Sequence — {words.length} word{words.length !== 1 ? 's' : ''}
                {coverage !== null && (
                  <span style={{ marginLeft: '.75rem', color: coverage === 1 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    ({Math.round(coverage * 100)}% covered)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {words.map((w, i) => {
                  const pidx = playableWords.indexOf(w);
                  const isActive = w.found && pidx === currentIdx;
                  return (
                    <button
                      key={i}
                      onClick={() => w.found ? jumpTo(pidx) : null}
                      style={{
                        padding: '.3rem .75rem', borderRadius: 999,
                        border: `2px solid ${isActive ? 'var(--color-primary)' : w.found ? 'var(--border)' : 'var(--color-error)'}`,
                        background: isActive ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                        color: isActive ? 'var(--color-primary)' : w.found ? 'var(--text-main)' : 'var(--color-error)',
                        fontWeight: isActive ? 700 : 400,
                        fontSize: '.875rem', cursor: w.found ? 'pointer' : 'default',
                        transition: 'all var(--transition)', opacity: w.found ? 1 : .55,
                      }}
                      title={w.found ? `Click to jump to "${w.word}"` : `"${w.word}" not in vocabulary`}
                    >
                      {w.found ? '' : '✕ '}{w.word}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right: stats + vocabulary ────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-primary)' }}>{playableWords.length}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Signs Found</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: notFoundWords.length ? 'var(--color-warning)' : 'var(--color-success)' }}>
                    {notFoundWords.length}
                  </div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Skipped</div>
                </div>
              </div>
              {coverage !== null && (
                <div style={{ marginTop: '.85rem' }}>
                  <div className="confidence-bar">
                    <div className="confidence-bar-fill" style={{ width: `${coverage * 100}%` }} />
                  </div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>
                    {Math.round(coverage * 100)}% vocabulary coverage
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '.75rem' }}>How It Works</h4>
              <ol style={{ paddingLeft: '1.1rem', fontSize: '.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                <li>Type words from the WLASL vocabulary.</li>
                <li>Click <strong>▶ Show Signs</strong> — videos play automatically word-by-word.</li>
                <li>Use <strong>⏩ Auto</strong> to toggle auto-advance.</li>
                <li>Click any word chip below the video to jump to it.</li>
                <li>Use <strong>↺ Loop</strong> to repeat the full sentence.</li>
              </ol>
            </div>

            {vocabHints.length > 0 && (
              <div className="card">
                <h4 style={{ marginBottom: '.6rem' }}>
                  Supported Words
                  <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '.5rem' }}>
                    ({vocabHints.length} words)
                  </span>
                </h4>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                    {vocabHints.map((w) => (
                      <button
                        key={w}
                        onClick={() => setText((prev) => prev ? `${prev} ${w}` : w)}
                        className="quick-chip"
                        title={`Add "${w}" to input`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        /* Input row */
        .tts-input-row {
          display: flex;
          gap: .75rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .tts-input-row textarea { min-width: 0; flex: 1 1 220px; }
        .tts-input-row .btn-lg  { flex-shrink: 0; }

        /* Results grid */
        .tts-grid {
          display: grid;
          grid-template-columns: minmax(0,1fr) 280px;
          gap: 1.5rem;
          align-items: start;
        }

        /* Controls row */
        .tts-controls {
          display: flex;
          gap: .4rem;
          align-items: center;
          flex-wrap: wrap;
          margin-top: .25rem;
        }
        .tts-speed {
          display: flex;
          gap: .3rem;
          align-items: center;
          margin-left: auto;
          flex-wrap: wrap;
        }

        /* Quick phrase chip */
        .quick-chip {
          font-size: .78rem;
          padding: .2rem .65rem;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--bg-surface);
          cursor: pointer;
          color: var(--text-muted);
          transition: all var(--transition);
          font-family: inherit;
        }
        .quick-chip:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        /* Mobile */
        @media (max-width: 860px) {
          .tts-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .tts-controls { gap: .3rem; }
          .tts-speed { margin-left: 0; width: 100%; }
        }
      `}</style>
    </AppShell>
  );
}
