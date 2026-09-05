/**
 * TextToSign Page
 * ---------------
 * Sends typed text to POST /text-to-sign, receives an ordered list of
 * WLASL video entries, then plays them sequentially - auto-starting
 * immediately after "Show Signs" is clicked.
 *
 * New features
 * ------------
 *  * Speech-to-Text - browser SpeechRecognition API fills the text box
 *   in whatever language is selected (English / Hindi / Marathi).
 *  * Text-to-Speech - a speak button reads back the typed text (or each
 *   word as it is signed) in the selected language using SpeechSynthesis.
 *  * Language selector - ASL / ISL / Hindi / Marathi; drives both STT locale
 *   and TTS voice selection.
 *
 * Key behaviours
 * --------------
 *  * "Show Signs" button fetches and auto-plays from word 1 with no extra click.
 *  * Videos advance with zero artificial delay - onEnded fires the next load.
 *  * autoAdvance is ON by default; each video starts the moment canplay fires.
 *  * Video URL is built via videoUrl() helper to work on any deployment origin.
 *  * Fully responsive down to 320 px.
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import AppShell from '../components/AppShell';
import Alert from '../components/Alert';
import { Spinner } from '../components/LoadingSpinner';
import { useSettings, SUPPORTED_LANGUAGES, getTTSLocale } from '../context/SettingsContext';
import api, { getErrorMessage, videoUrl, getLearningTip } from '../services/api';

/* -- Quick-phrase chips - */
const QUICK_PHRASES = [
  'hello', 'thank you', 'yes no', 'help please',
  'good morning', 'my name', 'I love you', 'how are you',
];

/* -- Web Speech API feature detection - */
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;
const synth = window.speechSynthesis || null;

/* -- TTS helper - */
function speak(text, locale, onEnd) {
  if (!synth || !text) return;
  synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = locale;
  // Prefer a voice that matches the locale; fall back to browser default
  const voices = synth.getVoices();
  const match = voices.find((v) => v.lang === locale)
    || voices.find((v) => v.lang.startsWith(locale.split('-')[0]))
    || null;
  if (match) utt.voice = match;
  if (onEnd) utt.onend = onEnd;
  synth.speak(utt);
}

export default function TextToSign() {
  const { language, updateSettings } = useSettings();
  const locale = getTTSLocale(language);

  /* -- Form - */
  const [text,       setText]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  /* -- Result - */
  const [words,      setWords]      = useState([]);
  const [coverage,   setCoverage]   = useState(null);
  const [vocabHints, setVocabHints] = useState([]);

  /* -- Dataset status (local videos present) - */
  const [localVideosAvailable, setLocalVideosAvailable] = useState(null); // null = loading

  /* -- Playback - */
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [playing,     setPlaying]     = useState(false);
  const [speed,       setSpeed]       = useState(1);
  const [loop,        setLoop]        = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [videoError,  setVideoError]  = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const videoTimeoutRef = useRef(null); // auto-skip timer for dead external URLs

  /* -- AI Learning Tip - */
  const [tip,        setTip]        = useState(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [tipWord,    setTipWord]    = useState('');

  /* -- Speech-to-Text - */
  const [listening,     setListening]     = useState(false);
  const [sttSupported,  setSttSupported]  = useState(!!SpeechRecognition);
  const [sttError,      setSttError]      = useState('');
  const recognitionRef = useRef(null);

  /* -- Text-to-Speech - */
  const [ttsSupported, setTtsSupported] = useState(!!synth);
  const [speaking,     setSpeaking]     = useState(false);

  const videoRef        = useRef(null);
  const autoRef         = useRef(true);
  const loopRef         = useRef(false);
  const currentIdxRef   = useRef(0);
  const playingRef      = useRef(false);
  const playableRef     = useRef([]);
  const advancingRef    = useRef(false);

  useEffect(() => { autoRef.current    = autoAdvance; }, [autoAdvance]);
  useEffect(() => { loopRef.current    = loop;         }, [loop]);
  useEffect(() => { currentIdxRef.current = currentIdx; setVideoError(false); setUseFallback(false); }, [currentIdx]);
  useEffect(() => { playingRef.current = playing;      }, [playing]);

  /* -- Voices load async in some browsers - */
  useEffect(() => {
    if (!synth) return;
    // Trigger voice list load on first render
    synth.getVoices();
    const handler = () => {};
    synth.addEventListener('voiceschanged', handler);
    return () => synth.removeEventListener('voiceschanged', handler);
  }, []);

  /* -- Stop STT / TTS when language changes - */
  useEffect(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (synth) synth.cancel();
    setListening(false);
    setSpeaking(false);
  }, [language]);

  /* -- Vocabulary hints + dataset status - */
  useEffect(() => {
    api.get('/text-to-sign/vocabulary')
      .then(({ data }) => setVocabHints(data.words || []))
      .catch(() => {});
    api.get('/text-to-sign/status')
      .then(({ data }) => setLocalVideosAvailable(data.local_videos_available ?? false))
      .catch(() => setLocalVideosAvailable(false));
  }, []);

  /* -- Clear any pending video-load timeout - */
  const clearVideoTimeout = useCallback(() => {
    if (videoTimeoutRef.current) {
      clearTimeout(videoTimeoutRef.current);
      videoTimeoutRef.current = null;
    }
  }, []);

  /* -- Derived - */
  const playableWords = words.filter((w) => w.found);
  const currentWord   = playableWords[currentIdx] ?? null;
  playableRef.current = playableWords;

  /* -- Keep playbackRate in sync - */
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  /* -- Video ended -> advance or loop - */
  const handleVideoEnded = useCallback(() => {
    clearVideoTimeout();
    if (!autoRef.current) {
      setPlaying(false); playingRef.current = false; return;
    }
    const nextIdx = currentIdxRef.current + 1;
    if (nextIdx < playableRef.current.length) {
      advancingRef.current  = true;
      currentIdxRef.current = nextIdx;
      setCurrentIdx(nextIdx);
    } else if (loopRef.current) {
      advancingRef.current  = true;
      currentIdxRef.current = 0;
      setCurrentIdx(0);
    } else {
      setPlaying(false); playingRef.current = false;
    }
  }, [clearVideoTimeout]);

  /* -- Submit  - fetch then immediately start playing - */
  const handleGenerate = async () => {
    const trimmed = text.trim();
    if (!trimmed) { setError('Please enter some text.'); return; }
    setError('');
    setWords([]);
    setCoverage(null);
    setCurrentIdx(0);
    currentIdxRef.current = 0;
    setUseFallback(false);
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

  /* -- Controls - */
  const play = () => {
    if (!currentWord) return;
    playingRef.current = true; setPlaying(true);
    videoRef.current.play().catch(() => {});
  };
  const pause = () => {
    videoRef.current.pause();
    playingRef.current = false; setPlaying(false);
  };
  const stop = () => {
    videoRef.current.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    currentIdxRef.current = 0; setCurrentIdx(0);
    playingRef.current = false; setPlaying(false);
  };
  const prev = () => {
    const idx = Math.max(0, currentIdx - 1);
    currentIdxRef.current = idx; setCurrentIdx(idx);
  };
  const next = () => {
    const idx = Math.min(playableWords.length - 1, currentIdx + 1);
    currentIdxRef.current = idx; setCurrentIdx(idx);
  };
  const jumpTo = (idx) => {
    currentIdxRef.current = idx; setCurrentIdx(idx);
  };
  const changeSpeed = (s) => {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  };
  const fullscreen = () => videoRef.current.requestFullscreen?.();

  /* -- AI learning tip - */
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

  /* -- Speech-to-Text (mic input) - */
  const startListening = useCallback(() => {
    if (!SpeechRecognition) { setSttError('Speech recognition not supported in this browser.'); return; }
    setSttError('');
    const rec = new SpeechRecognition();
    rec.lang        = locale;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous  = false;

    rec.onstart  = () => setListening(true);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript ?? '';
      if (transcript) setText((prev) => prev ? `${prev} ${transcript}` : transcript);
    };
    rec.onerror = (e) => {
      setSttError(e.error === 'not-allowed'
        ? 'Microphone access denied. Please allow microphone permissions.'
        : `Speech recognition error: ${e.error}`);
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
  }, [locale]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current.stop(); } catch {}
    setListening(false);
  }, []);

  /* -- Text-to-Speech (speak the typed text) - */
  const handleSpeak = useCallback((textToSpeak) => {
    if (!synth) return;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const t = (textToSpeak || text).trim();
    if (!t) return;
    setSpeaking(true);
    speak(t, locale, () => setSpeaking(false));
  }, [text, locale, speaking]);

  /* -- Speak current word label when it changes - */
  // (optional  - only speaks if "speak on sign" feature is toggled; disabled by default)

  /* -- Derived display - */
  const hasResults    = words.length > 0;
  const notFoundWords  = words.filter((w) => !w.found).map((w) => w.word);
  const fuzzyWords     = words.filter((w) => w.found && w.fuzzy);

  /* -- Language selector change - */
  const handleLanguageChange = (e) => {
    updateSettings({ language: e.target.value });
  };

  return (
    <AppShell>
      <div className="page-header">
        <h1>Text to Sign</h1>
        <p>Type or speak a sentence  - GestureBridge plays the WLASL sign video for each word in order.</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {sttError && <Alert type="error" message={sttError} onClose={() => setSttError('')} />}

      {/* -- No local videos banner - */}
      {localVideosAvailable === false && (
        <div style={{
          marginBottom: '1rem',
          padding: '1rem 1.25rem',
          background: 'color-mix(in srgb, var(--color-warning) 8%, var(--bg-card))',
          border: '1px solid color-mix(in srgb, var(--color-warning) 40%, var(--border))',
          borderRadius: 'var(--radius-md)',
          fontSize: '.875rem',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--color-warning)', marginBottom: '.4rem' }}>
            -- WLASL video dataset not found locally
          </div>
          <p style={{ margin: '0 0 .5rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            The app will try to stream sign videos from external CDN URLs, but many are no longer
            reachable. Videos that fail to load will be <strong>auto-skipped after 8 seconds</strong>.
          </p>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            To get all videos working locally, download the WLASL dataset mp4 files and place them
            in <code style={{ background: 'var(--bg-surface)', padding: '.1rem .35rem', borderRadius: 4, fontSize: '.82rem' }}>backend/data/WLASL/videos/</code>.
            See the{' '}
            <a href="https://github.com/dxli94/WLASL" target="_blank" rel="noopener noreferrer"
               style={{ color: 'var(--color-primary)' }}>
              WLASL GitHub repo
            </a>
            {' '}for download instructions.
          </p>
        </div>
      )}

      {/* -- Language selector - */}
      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.65rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Language / Voice:
        </label>
        <select
          value={language}
          onChange={handleLanguageChange}
          className="form-input"
          style={{ fontSize: '.85rem', padding: '.3rem .65rem', width: 'auto', minWidth: 160 }}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          Used for speech input &amp; audio output
        </span>
      </div>

      {/* -- Input card - */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Enter Your Text</h3>

        <div className="tts-input-row">
          <textarea
            className="form-input form-textarea"
            placeholder={
              language === 'Hindi'   ? 'Type Hindi words (e.g. namaste, dhanyavaad)' :
              language === 'Marathi' ? 'Type Marathi words (e.g. namaskar, dhanyavaad)' :
              'Type words from the supported vocabulary'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ flex: 1, minWidth: 0, fontSize: '1rem', resize: 'vertical' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
          />

          {/* Action buttons column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem', flexShrink: 0 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerate}
              disabled={loading || !text.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {loading ? <><Spinner size="sm" /> Converting…</> : '▶ Show Signs'}
            </button>

            {/* Mic / STT button */}
            {sttSupported && (
              <button
                className={`btn btn-sm ${listening ? 'btn-danger' : 'btn-subtle'}`}
                onClick={listening ? stopListening : startListening}
                title={listening ? 'Stop recording' : `Speak in ${SUPPORTED_LANGUAGES.find((l) => l.value === language).nativeName ?? 'English'}`}
                style={{ display: 'flex', alignItems: 'center', gap: '.35rem', justifyContent: 'center' }}
              >
                {listening
                  ? <><span style={{ animation: 'pulse 1s infinite' }}>🎙</span> Stop</>
                  : <>🎤 Speak</>
                }
              </button>
            )}

            {/* TTS / speak-back button */}
            {ttsSupported && (
              <button
                className={`btn btn-sm ${speaking ? 'btn-subtle' : 'btn-ghost'}`}
                onClick={() => handleSpeak()}
                disabled={!text.trim()}
                title={speaking ? 'Stop speaking' : 'Read text aloud'}
                style={{ display: 'flex', alignItems: 'center', gap: '.35rem', justifyContent: 'center' }}
              >
                {speaking ? '🔇 Stop' : '🔊 Listen'}
              </button>
            )}
          </div>
        </div>

        {/* Live mic indicator */}
        {listening && (
          <div style={{ marginTop: '.6rem', display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8rem', color: 'var(--color-error)' }}>
            <span style={{ animation: 'pulse 1s infinite', fontSize: '1rem' }}>-"-</span>
            Listening in <strong>{SUPPORTED_LANGUAGES.find((l) => l.value === language).nativeName}</strong> -- speak clearly
          </div>
        )}

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

      {/* -- Results - */}
      {hasResults && (
        <div className="tts-grid">

          {/* -- Left: video player - */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>

            {fuzzyWords.length > 0 && (
              <Alert
                type="info"
                message={`Approximate match used for: ${fuzzyWords.map((w) => `"${w.word}" -> ${w.matched_word}`).join(', ')}`}
              />
            )}
            {notFoundWords.length > 0 && (
              <Alert
                type="warning"
                message={`${notFoundWords.length} word${notFoundWords.length > 1 ? 's' : ''} not found and will be skipped: ${notFoundWords.join(', ')}`}
              />
            )}

            {playableWords.length > 0 ? (
              <div className="card" style={{ padding: '1rem' }}>

                {/* Word label + counter + speak-word button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
                  <div>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Now Signing</span>
                    <h2 style={{ color: 'var(--color-primary)', fontSize: 'clamp(1.3rem,4vw,1.8rem)', fontWeight: 800, lineHeight: 1, marginTop: '.1rem' }}>
                      {currentWord.word}
                      {currentWord.fuzzy && currentWord.matched_word !== currentWord.word && (
                        <span style={{ fontSize: '.6em', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '.4rem' }}>
                          (~{currentWord.matched_word})
                        </span>
                      )}
                    </h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    {/* Speak current word */}
                    {ttsSupported && currentWord && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleSpeak(currentWord.word)}
                        title={`Speak "${currentWord.word}"`}
                        style={{ fontSize: '.78rem' }}
                      >
                        -"
                      </button>
                    )}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Word</span>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        {currentIdx + 1} / {playableWords.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Video element */}
                <div style={{ position: 'relative', background: '#0F172A', borderRadius: 'var(--radius-md)', overflow: 'hidden', aspectRatio: '16/9' }}>
                  {currentWord && !videoError && (() => {
                    const localSrc = currentWord.video_url ? videoUrl(currentWord.video_url) : null;
                    const extSrc   = currentWord.external_url || null;
                    const src      = useFallback ? extSrc : (localSrc || extSrc);
                    if (!src) return null;
                    return (
                      <video
                        key={`${currentIdx}-${useFallback ? 'ext' : 'local'}`}
                        ref={videoRef}
                        src={src}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onEnded={handleVideoEnded}
                        onPlay={() => {
                          clearVideoTimeout();
                          advancingRef.current = false;
                          setPlaying(true); playingRef.current = true;
                        }}
                        onPause={() => {
                          if (advancingRef.current) return;
                          setPlaying(false); playingRef.current = false;
                        }}
                        onError={() => {
                          clearVideoTimeout();
                          if (!useFallback && extSrc && src !== extSrc) {
                            setUseFallback(true);
                          } else {
                            setVideoError(true);
                          }
                        }}
                        onCanPlay={(e) => {
                          clearVideoTimeout();
                          advancingRef.current = false;
                          e.target.playbackRate = speed;
                          if (playingRef.current) {
                            e.target.play().catch(() => {});
                          }
                        }}
                        onLoadStart={() => {
                          // Start an 8-second timeout  - if the video hasn't loaded
                          // by then the external URL is dead; auto-skip to next word.
                          clearVideoTimeout();
                          videoTimeoutRef.current = setTimeout(() => {
                            // Treat as error: try external fallback, then skip
                            if (!useFallback && extSrc && src !== extSrc) {
                              setUseFallback(true);
                            } else {
                              setVideoError(true);
                            }
                          }, 8000);
                        }}
                        playsInline
                        autoPlay={false}
                      />
                    );
                  })()}

                  {currentWord && videoError && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.75rem', color: '#94A3B8', padding: '1rem', textAlign: 'center' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      <p style={{ fontSize: '.85rem', margin: 0 }}>
                        Video unavailable for <strong style={{ color: '#cbd5e1' }}>{currentWord.word}</strong>.
                      </p>
                      <p style={{ fontSize: '.75rem', margin: 0, color: '#64748b' }}>
                        {localVideosAvailable === false
                          ? 'Local dataset not present — external source unreachable.'
                          : 'No video file found for this word.'}
                      </p>
                      <button className="btn btn-ghost btn-sm" style={{ color: '#94A3B8', borderColor: '#334155' }}
                        onClick={() => { clearVideoTimeout(); setVideoError(false); setUseFallback(false); handleVideoEnded(); }}>
                        - Skip to next
                      </button>
                    </div>
                  )}

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
                      ---
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

                {/* AI tip + speak-sentence buttons */}
                <div style={{ marginTop: '.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.4rem' }}>
                  <div style={{ display: 'flex', gap: '.4rem' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '.75rem', gap: '.3rem', display: 'flex', alignItems: 'center' }}
                      onClick={() => fetchTip(currentWord.word)}
                      disabled={tipLoading || !currentWord}
                      title="Get an AI learning tip for this sign"
                    >
                      {tipLoading ? <Spinner size="sm" /> : '💡'} AI Tip
                    </button>
                    {/* Speak entire typed sentence */}
                    {ttsSupported && text.trim() && (
                      <button
                        className={`btn btn-ghost btn-sm ${speaking ? 'btn-subtle' : ''}`}
                        style={{ fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}
                        onClick={() => handleSpeak(text)}
                        title={speaking ? 'Stop audio' : 'Speak full sentence aloud'}
                      >
                        {speaking ? '🔇 Stop Audio' : '🔊 Speak Sentence'}
                      </button>
                    )}
                  </div>
                </div>

               

                {/* Controls row */}
                <div className="tts-controls">
                  <button className="btn btn-ghost btn-sm" onClick={prev} disabled={currentIdx === 0}>Prev</button>

                  {playing
                    ? <button className="btn btn-subtle" onClick={pause}>⏸ Pause</button>
                    : <button className="btn btn-primary" onClick={play} disabled={!currentWord}>▶ Play</button>
                  }

                  <button className="btn btn-ghost" onClick={stop}>--- Stop</button>
                  <button className="btn btn-ghost btn-sm" onClick={next} disabled={currentIdx >= playableWords.length - 1}>Next</button>
                  <button className="btn btn-ghost btn-sm" onClick={fullscreen} title="Fullscreen">--</button>

                  <button
                    className={`btn btn-sm ${loop ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setLoop((l) => !l)}
                    title="Loop sequence"
                  >
                    🔁 Loop
                  </button>

                  <button
                    className={`btn btn-sm ${autoAdvance ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setAutoAdvance((a) => !a)}
                    title="Auto-advance to next word"
                  >
                    ↪ Auto
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
                <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>--</div>
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
                  const borderColor = isActive ? 'var(--color-primary)' : w.found ? (w.fuzzy ? 'var(--color-warning)' : 'var(--border)') : 'var(--color-error)';
                  const textColor   = isActive ? 'var(--color-primary)' : w.found ? 'var(--text-main)' : 'var(--color-error)';
                  const titleText   = w.found
                    ? (w.fuzzy ? `"${w.word}" → matched as "${w.matched_word}" — click to jump` : `Click to jump to "${w.word}"`)
                    : `"${w.word}" not in vocabulary`;
                  return (
                    <button
                      key={i}
                      onClick={() => w.found ? jumpTo(pidx) : null}
                      style={{
                        padding: '.3rem .75rem', borderRadius: 999,
                        border: `2px solid ${borderColor}`,
                        background: isActive ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                        color: textColor,
                        fontWeight: isActive ? 700 : 400,
                        fontSize: '.875rem', cursor: w.found ? 'pointer' : 'default',
                        transition: 'all var(--transition)', opacity: w.found ? 1 : .55,
                      }}
                      title={titleText}
                    >
                      {w.found ? '' : '⚠ '}{w.word}{w.fuzzy && w.matched_word !== w.word ? ` (~${w.matched_word})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* -- Right: stats + vocabulary - */}
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
                <li>Choose your language above, then type or <strong>-- speak</strong> your text.</li>
                <li>Click <strong>--- Show Signs</strong>  - videos play automatically word-by-word.</li>
                <li>Use <strong>-" Listen</strong> to hear the text read aloud in your language.</li>
                <li>Use <strong>- Auto</strong> to toggle auto-advance.</li>
                <li>Click any word chip below the video to jump to it.</li>
                <li>Use <strong>-- Loop</strong> to repeat the full sentence.</li>
              </ol>
            </div>

            {/* STT browser support notice */}
            {!sttSupported && (
              <div className="card" style={{ borderColor: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 6%, var(--bg-card))' }}>
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  -- Speech input requires Chrome, Edge, or Safari. Your browser doesn't support it.
                </p>
              </div>
            )}

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
        /* Mic pulse animation */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .3; }
        }

        /* Input row */
        .tts-input-row {
          display: flex;
          gap: .75rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .tts-input-row textarea { min-width: 0; flex: 1 1 220px; }

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
