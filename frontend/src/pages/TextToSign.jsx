/**
 * TextToSign Page
 * ───────────────
 * Sends typed text to POST /text-to-sign, receives an ordered list of
 * WLASL video entries (one per word), then plays them sequentially so the
 * viewer sees each sign word-by-word.
 *
 * Backend endpoints used:
 *   POST /text-to-sign
 *     Body : { text: string }
 *     Reply: { words: [{word, found, video_url, all_video_ids}], coverage, ... }
 *
 *   GET  /video/<video_id>
 *     Streams the local WLASL mp4 file with Range support.
 *
 *   GET  /text-to-sign/vocabulary
 *     Returns the full list of supported words (for the hints panel).
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useSettings } from '../context/SettingsContext';
import api, { getErrorMessage } from '../services/api';

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Build the full video src URL — works in both dev (proxied) and prod. */
function videoSrc(videoUrl) {
  if (!videoUrl) return '';
  // In dev, Vite proxies /api/* → Flask; videos are at /video/<id> (no /api prefix).
  // In prod, same origin as Flask — use as-is.
  return videoUrl; // e.g. "/video/69364"
}

const QUICK_PHRASES = [
  'hello',
  'thank you',
  'yes no',
  'help please',
  'good morning',
  'my name',
  'I love you',
  'how are you',
];

export default function TextToSign() {
  const { language } = useSettings();

  /* ── Form state ───────────────────────────────────────────────────── */
  const [text,      setText]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  /* ── Result state ─────────────────────────────────────────────────── */
  const [words,     setWords]     = useState([]);   // [{word, found, video_url, ...}]
  const [coverage,  setCoverage]  = useState(null);
  const [vocabHints, setVocabHints] = useState([]);  // supported words for hints

  /* ── Playback state ───────────────────────────────────────────────── */
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [playing,     setPlaying]     = useState(false);
  const [speed,       setSpeed]       = useState(1);
  const [loop,        setLoop]        = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const videoRef      = useRef(null);
  const autoRef       = useRef(autoAdvance);
  const loopRef       = useRef(loop);
  const currentIdxRef = useRef(currentIdx);       // always-current idx for callbacks
  const playingRef    = useRef(playing);
  const playableRef   = useRef([]);               // always-current playable list
  useEffect(() => { autoRef.current    = autoAdvance; }, [autoAdvance]);
  useEffect(() => { loopRef.current    = loop; }, [loop]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  /* ── Load vocabulary hints on mount ──────────────────────────────── */
  useEffect(() => {
    api.get('/text-to-sign/vocabulary')
      .then(({ data }) => setVocabHints(data.words || []))
      .catch(() => {}); // silently ignore
  }, []);

  /* ── Playable words only (skip "not found") ───────────────────────── */
  const playableWords = words.filter((w) => w.found && w.video_url);
  const currentWord   = playableWords[currentIdx] ?? null;
  // Keep playableRef in sync so the onEnded callback reads the latest list
  playableRef.current = playableWords;

  /* ── Submit ───────────────────────────────────────────────────────── */
  const handleGenerate = async () => {
    const trimmed = text.trim();
    if (!trimmed) { setError('Please enter some text.'); return; }
    setError('');
    setWords([]);
    setCoverage(null);
    setCurrentIdx(0);
    currentIdxRef.current = 0;
    setPlaying(false);
    playingRef.current = false;
    setLoading(true);
    try {
      const { data } = await api.post('/text-to-sign', { text: trimmed, language });
      setWords(data.words || []);
      setCoverage(data.coverage ?? null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  /* ── Video event handlers ─────────────────────────────────────────── */
  // Use refs so this callback never goes stale and always sees the latest idx/list
  const handleVideoEnded = useCallback(() => {
    if (!autoRef.current) { setPlaying(false); playingRef.current = false; return; }
    const nextIdx = currentIdxRef.current + 1;
    if (nextIdx < playableRef.current.length) {
      currentIdxRef.current = nextIdx;
      setCurrentIdx(nextIdx);
      // key prop changes → video remounts → onCanPlay fires → play() called
    } else if (loopRef.current) {
      currentIdxRef.current = 0;
      setCurrentIdx(0);
    } else {
      setPlaying(false);
      playingRef.current = false;
    }
  }, []); // no deps — reads everything from refs

  /* Auto-play: handled by onCanPlay on the video element (see JSX below).
     Keep a speed-sync effect so playbackRate updates while a video is playing. */
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  /* ── Controls ─────────────────────────────────────────────────────── */
  const play = () => {
    if (!currentWord) return;
    playingRef.current = true;
    setPlaying(true);
    videoRef.current?.play();
  };
  const pause = () => {
    videoRef.current?.pause();
    playingRef.current = false;
    setPlaying(false);
  };
  const stop = () => {
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    currentIdxRef.current = 0;
    setCurrentIdx(0);
    playingRef.current = false;
    setPlaying(false);
  };
  const prev = () => {
    const idx = Math.max(0, currentIdx - 1);
    currentIdxRef.current = idx;
    setCurrentIdx(idx);
    playingRef.current = false;
    setPlaying(false);
  };
  const next = () => {
    const idx = Math.min(playableWords.length - 1, currentIdx + 1);
    currentIdxRef.current = idx;
    setCurrentIdx(idx);
    playingRef.current = false;
    setPlaying(false);
  };
  const jumpTo = (idx) => {
    currentIdxRef.current = idx;
    setCurrentIdx(idx);
    playingRef.current = false;
    setPlaying(false);
  };
  const changeSpeed = (s) => {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  };
  const fullscreen = () => videoRef.current?.requestFullscreen?.();

  /* ── Render ───────────────────────────────────────────────────────── */
  const hasResults   = words.length > 0;
  const notFoundWords = words.filter((w) => !w.found).map((w) => w.word);

  return (
    <AppShell>
      <div className="page-header">
        <h1>Text to Sign</h1>
        <p>
          Type a sentence — GestureBridge plays the WLASL sign video for
          each word in order.
        </p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {/* ── Input card ────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Enter Your Text</h3>

        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <textarea
            className="form-input form-textarea"
            placeholder="Type words from the supported vocabulary…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ flex: 1, minWidth: 260, fontSize: '1rem', resize: 'vertical' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleGenerate();
            }}
          />
          <button
            className="btn btn-teal btn-lg"
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            style={{ alignSelf: 'flex-end' }}
          >
            {loading ? <><Spinner size="sm" /> Converting…</> : '✨ Show Signs'}
          </button>
        </div>

        {/* Quick phrase chips */}
        <div style={{ marginTop: '.85rem', display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center' }}>
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginRight: '.2rem' }}>Quick:</span>
          {QUICK_PHRASES.map((p) => (
            <button
              key={p}
              onClick={() => { setText(p); }}
              style={{
                fontSize: '.78rem', padding: '.2rem .65rem',
                border: '1px solid var(--border)',
                borderRadius: 999, background: 'var(--bg-surface)',
                cursor: 'pointer', color: 'var(--text-muted)',
                transition: 'all var(--transition)',
              }}
              onMouseEnter={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.color = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-muted)'; }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────── */}
      {hasResults && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '1.5rem', alignItems: 'start' }}
          className="tts-grid"
        >
          {/* ── Left: video player ──────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Coverage warning */}
            {notFoundWords.length > 0 && (
              <Alert
                type="warning"
                message={`${notFoundWords.length} word${notFoundWords.length > 1 ? 's' : ''} not in vocabulary and will be skipped: ${notFoundWords.join(', ')}`}
              />
            )}

            {/* Video player */}
            {playableWords.length > 0 ? (
              <div className="card" style={{ padding: '1rem' }}>
                {/* Current word label */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: '.75rem',
                }}>
                  <div>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Now Signing
                    </span>
                    <h2 style={{
                      color: 'var(--color-primary)', fontSize: '1.8rem',
                      fontWeight: 800, lineHeight: 1, marginTop: '.1rem',
                    }}>
                      {currentWord?.word}
                    </h2>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Word</span>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                      {currentIdx + 1} / {playableWords.length}
                    </div>
                  </div>
                </div>

                {/* Video */}
                <div style={{
                  position: 'relative', background: '#0F172A',
                  borderRadius: 'var(--radius-md)', overflow: 'hidden',
                  aspectRatio: '16/9',
                }}>
                  {currentWord && (
                    <video
                      key={currentWord.video_id}      /* forces remount on word change */
                      ref={videoRef}
                      src={videoSrc(currentWord.video_url)}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onEnded={handleVideoEnded}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onCanPlay={(e) => {
                        /* Fire as soon as the browser can play — no RAF delay.
                           Only auto-start if we're in the middle of a sequence. */
                        if (playingRef.current) {
                          e.target.playbackRate = speed;
                          e.target.play().catch(() => {});
                        }
                      }}
                      playsInline
                    />
                  )}

                  {/* Overlay when paused */}
                  {!playing && (
                    <button
                      onClick={play}
                      style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,.35)', border: 'none', cursor: 'pointer',
                        fontSize: '3rem', color: '#fff',
                        transition: 'background var(--transition)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,.5)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,.35)'}
                      aria-label="Play"
                    >
                      ▶
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                <div style={{ margin: '.85rem 0 .5rem', display: 'flex', gap: '.3rem' }}>
                  {playableWords.map((w, i) => (
                    <button
                      key={i}
                      onClick={() => jumpTo(i)}
                      title={w.word}
                      style={{
                        flex: 1, height: 5, borderRadius: 999,
                        border: 'none', cursor: 'pointer', padding: 0,
                        background: i === currentIdx
                          ? 'var(--color-primary)'
                          : i < currentIdx
                            ? 'var(--color-primary)'
                            : 'var(--border)',
                        transition: 'background var(--transition)',
                      }}
                    />
                  ))}
                </div>

                {/* Controls row */}
                <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={prev} disabled={currentIdx === 0}>Prev</button>

                  {playing
                    ? <button className="btn btn-subtle" onClick={pause}>Pause</button>
                    : <button className="btn btn-primary" onClick={play} disabled={!currentWord}>Play</button>
                  }

                  <button className="btn btn-ghost" onClick={stop}>Stop</button>
                  <button className="btn btn-ghost btn-sm" onClick={next} disabled={currentIdx >= playableWords.length - 1}>Next</button>
                  <button className="btn btn-ghost btn-sm" onClick={fullscreen} title="Fullscreen">[ ]</button>

                  {/* Loop toggle */}
                  <button
                    className={loop ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    onClick={() => setLoop((l) => !l)}
                    title="Loop sequence"
                  >
                    Loop
                  </button>

                  {/* Auto-advance toggle */}
                  <button
                    className={autoAdvance ? 'btn btn-teal btn-sm' : 'btn btn-ghost btn-sm'}
                    onClick={() => setAutoAdvance((a) => !a)}
                    title="Auto-advance to next word"
                  >
                    ⏩ Auto
                  </button>

                  {/* Speed */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Speed:</span>
                    {[0.5, 0.75, 1, 1.5].map((s) => (
                      <button
                        key={s}
                        className={speed === s ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
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
                  Try the word list in the panel on the right.
                </p>
              </div>
            )}

            {/* Word sequence strip */}
            <div className="card" style={{ padding: '.85rem 1rem' }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '.6rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
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
                        padding: '.3rem .75rem',
                        borderRadius: 999,
                        border: `2px solid ${isActive ? 'var(--color-primary)' : w.found ? 'var(--border)' : 'var(--color-error)'}`,
                        background: isActive ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                        color: isActive ? 'var(--color-primary)' : w.found ? 'var(--text-main)' : 'var(--color-error)',
                        fontWeight: isActive ? 700 : 400,
                        fontSize: '.875rem',
                        cursor: w.found ? 'pointer' : 'default',
                        transition: 'all var(--transition)',
                        opacity: w.found ? 1 : .55,
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

          {/* ── Right: info + vocabulary ─────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Stats */}
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                    {playableWords.length}
                  </div>
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

            {/* Instructions */}
            <div className="card">
              <h4 style={{ marginBottom: '.75rem' }}>How It Works</h4>
              <ol style={{ paddingLeft: '1.1rem', fontSize: '.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                <li>Type words from the WLASL vocabulary.</li>
                <li>Click <strong>Show Signs</strong> — the backend looks up each word and returns the matching video.</li>
                <li>Press <strong>▶ Play</strong> to start the sequence.</li>
                <li>Videos auto-advance word-by-word when <strong>Auto</strong> is on.</li>
                <li>Click any word chip to jump directly to it.</li>
                <li>Use <strong>Loop</strong> to repeat the whole sentence.</li>
              </ol>
            </div>

            {/* Supported vocabulary */}
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
                        style={{
                          padding: '.2rem .55rem', fontSize: '.75rem',
                          border: '1px solid var(--border)', borderRadius: 999,
                          background: 'var(--bg-surface)', cursor: 'pointer',
                          color: 'var(--text-muted)', transition: 'all var(--transition)',
                        }}
                        onMouseEnter={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.color = 'var(--color-primary)'; }}
                        onMouseLeave={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-muted)'; }}
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

      {/* Responsive */}
      <style>{`
        @media (max-width: 860px) {
          .tts-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}
