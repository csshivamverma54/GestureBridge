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
import { useAuth } from '../context/AuthContext';
import {
  useSettings,
  SUPPORTED_SIGN_LANGUAGES,
  SUPPORTED_SPOKEN_LANGUAGES,
  getTTSLocale,
} from '../context/SettingsContext';
import api, { getErrorMessage, videoUrl, getLearningTip, saveHistory } from '../services/api';

/* -- Quick-phrase chips by spoken language -- */
const QUICK_PHRASES_BY_LANG = {
  English: ['hello', 'thank you', 'yes', 'no', 'help please', 'good morning', 'I love you', 'how are you'],
  Hindi: ['नमस्ते', 'धन्यवाद', 'हाँ', 'नहीं', 'कृपया मदद करें', 'शुभ प्रभात', 'मैं तुमसे प्यार करता हूँ', 'आप कैसे हैं'],
  Marathi: ['नमस्कार', 'धन्यवाद', 'हो', 'नाही', 'कृपया मदत करा', 'शुभ सकाळ', 'माझे तुझ्यावर प्रेम आहे', 'तुम्ही कसे आहात'],
};

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
  const { user } = useAuth();
  const { signLanguage, spokenLanguage, language, updateSettings } = useSettings();
  const activeSpoken = spokenLanguage || (language !== 'ASL' && language !== 'ISL' ? language : 'English');
  const activeSign   = signLanguage || (language === 'ISL' ? 'ISL' : 'ASL');
  const locale = getTTSLocale(activeSpoken);

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
  }, [activeSpoken, activeSign]);

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
      const { data } = await api.post('/text-to-sign', {
        text: trimmed,
        language: activeSpoken,
        spoken_language: activeSpoken,
        sign_language: activeSign,
      });
      setWords(data.words || []);
      setCoverage(data.coverage ?? null);

      // Record Text to Sign operation in history
      const uid = user?.email || 'guest';
      saveHistory({
        user_id: uid,
        predicted_text: trimmed,
        mode: 'text-to-sign',
        type: 'text-to-sign',
        confidence: typeof data.coverage === 'number' ? data.coverage : 1.0,
      }).catch(() => {});
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
      {/* ── Page Header with Stitch Telemetry Badges ── */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <span className="badge badge-primary">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />
            WLASL Video Synthesis
          </span>
          <span className="badge badge-neutral">Frame-by-Frame Sync</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
            2,000+ Sign Dictionaries
          </span>
        </div>

        <h1 style={{ fontSize: 'clamp(1.4rem, 2.5vw, 1.85rem)', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.35rem' }}>
          Text to Sign Translation
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0, maxWidth: '680px', lineHeight: 1.5 }}>
          Type or speak an English phrase. GestureBridge plays verified WLASL sign language video demonstrations for each word in sequence.
        </p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {sttError && <Alert type="error" message={sttError} onClose={() => setSttError('')} />}

      {/* ── Dataset notice banner ── */}
      {localVideosAvailable === false && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '1rem 1.25rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--color-warning)', marginBottom: '0.25rem' }}>
            <span>⚠</span>
            <span>External Video CDN Mode</span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Local video dataset is not mounted. The system will stream from external WLASL CDN archives with an 8-second auto-skip fallback.
          </p>
        </div>
      )}

      {/* ── Dual Language Selector Bar (Sign Dialect + Spoken Voice) ── */}
      <div
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
          background: 'var(--bg-card)',
          padding: '0.85rem 1.15rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Spoken / Written Natural Language */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            🗣️ Spoken Voice & Text:
          </label>
          <select
            value={activeSpoken}
            onChange={(e) => updateSettings({ spokenLanguage: e.target.value })}
            className="form-select"
            style={{ fontSize: '0.85rem', padding: '0.35rem 2rem 0.35rem 0.75rem', width: 'auto', minWidth: 170 }}
          >
            {SUPPORTED_SPOKEN_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.flag} {l.nativeName} ({l.value})
              </option>
            ))}
          </select>
        </div>

        {/* Visual Sign Language Dialect */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            🤟 Sign Language Dialect:
          </label>
          <select
            value={activeSign}
            onChange={(e) => updateSettings({ signLanguage: e.target.value })}
            className="form-select"
            style={{ fontSize: '0.85rem', padding: '0.35rem 2rem 0.35rem 0.75rem', width: 'auto', minWidth: 180 }}
          >
            {SUPPORTED_SIGN_LANGUAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
          AUDIO LOCALE: {locale}
        </span>
      </div>

      {/* ── Input Card ── */}
      <div className="card" style={{ marginBottom: '1.75rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Enter Text or Speak</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Press Ctrl+Enter to Translate</span>
        </div>

        <div className="tts-input-row">
          <textarea
            className="form-input form-textarea"
            placeholder={
              activeSpoken === 'Hindi'   ? 'Type in Hindi or Hinglish (e.g. "नमस्ते", "dhanyavaad", "madad")' :
              activeSpoken === 'Marathi' ? 'Type in Marathi (e.g. "नमस्कार", "dhanyavaad", "madat")' :
              'Type words from supported vocabulary (e.g. "hello world welcome family")'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ flex: 1, minWidth: 0, fontSize: '0.95rem', resize: 'vertical' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
          />

          {/* Action buttons column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerate}
              disabled={loading || !text.trim()}
              style={{ whiteSpace: 'nowrap', height: '42px', fontWeight: 600 }}
            >
              {loading ? <><Spinner size="sm" /> Translating…</> : '▶ Show Signs'}
            </button>

            {/* Mic / STT button */}
            {sttSupported && (
              <button
                className={`btn btn-sm ${listening ? 'btn-danger' : 'btn-subtle'}`}
                onClick={listening ? stopListening : startListening}
                title={listening ? 'Stop recording' : `Speak in ${activeSpoken}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center', height: '36px' }}
              >
                {listening ? (
                  <>
                    <span style={{ animation: 'pulse 1s infinite' }}>🎙</span> Listening…
                  </>
                ) : (
                  <>🎤 Voice Input</>
                )}
              </button>
            )}

            {/* TTS / speak-back button */}
            {ttsSupported && (
              <button
                className={`btn btn-sm ${speaking ? 'btn-subtle' : 'btn-outline'}`}
                onClick={() => handleSpeak()}
                disabled={!text.trim()}
                title={speaking ? 'Stop speaking' : `Read text aloud in ${activeSpoken}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center', height: '36px' }}
              >
                {speaking ? '🔇 Stop Voice' : '🔊 Hear Audio'}
              </button>
            )}
          </div>
        </div>

        {/* Live mic indicator */}
        {listening && (
          <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--color-error)' }}>
            <span style={{ animation: 'pulse 1s infinite', fontSize: '1rem' }}>●</span>
            Listening in <strong>{SUPPORTED_SPOKEN_LANGUAGES.find((l) => l.value === activeSpoken)?.nativeName || activeSpoken}</strong> — speak clearly into microphone
          </div>
        )}

        {/* Quick phrase chips (Non-pill 6px radius) */}
        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '0.25rem' }}>
            Quick Phrases ({activeSpoken}):
          </span>
          {(QUICK_PHRASES_BY_LANG[activeSpoken] || QUICK_PHRASES_BY_LANG.English).map((p) => (
            <button
              key={p}
              onClick={() => setText(p)}
              className="quick-chip"
              style={{
                fontSize: '0.78rem',
                padding: '0.25rem 0.65rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontFamily: 'inherit',
                fontWeight: 500,
                transition: 'all var(--transition)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results Viewport ── */}
      {hasResults && (
        <div className="tts-grid">

          {/* ── Left: Video Player & Controls ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>

            {fuzzyWords.length > 0 && (
              <Alert
                type="info"
                message={`Approximate vocabulary match used for: ${fuzzyWords.map((w) => `"${w.word}" → ${w.matched_word}`).join(', ')}`}
              />
            )}
            {notFoundWords.length > 0 && (
              <Alert
                type="warning"
                message={`${notFoundWords.length} word${notFoundWords.length > 1 ? 's' : ''} not in WLASL lexicon: ${notFoundWords.join(', ')}`}
              />
            )}

            {playableWords.length > 0 ? (
              <div className="card" style={{ padding: '1.25rem' }}>

                {/* Word header + counter + speak-word button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                      Active Sign Demonstration
                    </span>
                    <h2 style={{ color: 'var(--color-primary)', fontSize: 'clamp(1.35rem, 4vw, 1.85rem)', fontWeight: 800, lineHeight: 1.1, marginTop: '0.15rem', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                      {currentWord.word}
                      {currentWord.fuzzy && currentWord.matched_word !== currentWord.word && (
                        <span style={{ fontSize: '0.6em', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                          (~{currentWord.matched_word})
                        </span>
                      )}
                    </h2>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {ttsSupported && currentWord && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleSpeak(currentWord.word)}
                        title={`Pronounce "${currentWord.word}"`}
                        style={{ fontSize: '0.8rem', gap: '0.3rem' }}
                      >
                        🔊 Pronounce
                      </button>
                    )}

                    <div style={{ textAlign: 'right', background: 'var(--bg-surface)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-light)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Sequence</span>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                        {currentIdx + 1} / {playableWords.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Video element viewport */}
                <div style={{ position: 'relative', background: '#0B1120', borderRadius: 'var(--radius-lg)', overflow: 'hidden', aspectRatio: '16/9', border: '1px solid var(--border)' }}>
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
                          clearVideoTimeout();
                          videoTimeoutRef.current = setTimeout(() => {
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
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#94A3B8', padding: '1.25rem', textAlign: 'center' }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M23 7l-7 5 7 5V7z" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                      <p style={{ fontSize: '0.875rem', margin: 0 }}>
                        Video stream unavailable for <strong style={{ color: '#E2E8F0' }}>"{currentWord.word}"</strong>.
                      </p>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: '#E2E8F0', borderColor: '#475569' }}
                        onClick={() => { clearVideoTimeout(); setVideoError(false); setUseFallback(false); handleVideoEnded(); }}
                      >
                        Skip to next sign →
                      </button>
                    </div>
                  )}

                  {!playing && !videoError && (
                    <button
                      onClick={play}
                      aria-label="Play Video"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.35)',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#fff',
                        fontSize: '2.5rem',
                        transition: 'background var(--transition)',
                      }}
                    >
                      ▶
                    </button>
                  )}
                </div>

                {/* Progress segmented track */}
                <div style={{ margin: '0.85rem 0 0.65rem', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {playableWords.map((w, i) => (
                    <button
                      key={i}
                      onClick={() => jumpTo(i)}
                      title={w.word}
                      style={{
                        flex: '1 1 0',
                        minWidth: 8,
                        height: 5,
                        borderRadius: 'var(--radius-xs)',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        background: i === currentIdx ? 'var(--color-primary)' : i < currentIdx ? '#93C5FD' : 'var(--border)',
                        transition: 'background var(--transition)',
                      }}
                    />
                  ))}
                </div>

                {/* Playback Controls Row */}
                <div className="tts-controls" style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={prev} disabled={currentIdx === 0}>
                    ◀ Prev
                  </button>

                  {playing ? (
                    <button className="btn btn-subtle btn-sm" onClick={pause} style={{ fontWeight: 600 }}>
                      ⏸ Pause
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={play} disabled={!currentWord} style={{ fontWeight: 600 }}>
                      ▶ Play
                    </button>
                  )}

                  <button className="btn btn-ghost btn-sm" onClick={stop}>
                    ■ Reset
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={next} disabled={currentIdx >= playableWords.length - 1}>
                    Next ▶
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={fullscreen} title="Fullscreen">
                    ⛶ Fullscreen
                  </button>

                  <button
                    className={`btn btn-sm ${loop ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setLoop((l) => !l)}
                    title="Loop entire sequence"
                  >
                    🔁 Loop
                  </button>

                  <button
                    className={`btn btn-sm ${autoAdvance ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setAutoAdvance((a) => !a)}
                    title="Auto-advance to next word"
                  >
                    ↪ Auto-Advance
                  </button>

                  {/* Playback Speed selector */}
                  <div className="tts-speed" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>SPEED:</span>
                    {[0.5, 0.75, 1, 1.5].map((s) => (
                      <button
                        key={s}
                        className={`btn btn-sm ${speed === s ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => changeSpeed(s)}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Tip Action & Full Sentence TTS */}
                <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.8rem', gap: '0.35rem', display: 'flex', alignItems: 'center' }}
                    onClick={() => fetchTip(currentWord.word)}
                    disabled={tipLoading || !currentWord}
                    title="Get spatial landmark learning tip"
                  >
                    {tipLoading ? <Spinner size="sm" /> : '💡'} ASL Learning Tip
                  </button>

                  {ttsSupported && text.trim() && (
                    <button
                      className={`btn btn-ghost btn-sm ${speaking ? 'btn-subtle' : ''}`}
                      style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      onClick={() => handleSpeak(text)}
                      title="Speak full sentence aloud"
                    >
                      {speaking ? '🔇 Stop Speech' : '🔊 Speak Full Sentence'}
                    </button>
                  )}
                </div>

                {/* AI Tip result display */}
                {tip && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: '0.83rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.2rem' }}>
                      Sign Tip for "{tipWord}":
                    </div>
                    <div style={{ color: 'var(--text-main)', lineHeight: 1.5 }}>
                      {tip.tip || tip.explanation || JSON.stringify(tip)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
                <h3>No Matching Signs</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  None of the typed words were matched in the WLASL dataset. Select words from the lexicon on the right.
                </p>
              </div>
            )}

            {/* Word sequence strip */}
            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sign Sequence — {words.length} Word{words.length !== 1 ? 's' : ''}
                </div>
                {coverage !== null && (
                  <span className={`badge ${coverage >= 0.8 ? 'badge-success' : 'badge-warning'}`}>
                    {Math.round(coverage * 100)}% Coverage
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                {words.map((w, i) => {
                  const pidx = playableWords.indexOf(w);
                  const isActive = w.found && pidx === currentIdx;
                  return (
                    <button
                      key={i}
                      onClick={() => w.found ? jumpTo(pidx) : null}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        border: `1.5px solid ${isActive ? 'var(--color-primary)' : w.found ? (w.fuzzy ? 'var(--color-warning)' : 'var(--border)') : 'var(--color-error)'}`,
                        background: isActive ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                        color: isActive ? 'var(--color-primary)' : w.found ? 'var(--text-main)' : 'var(--color-error)',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '0.85rem',
                        cursor: w.found ? 'pointer' : 'default',
                        transition: 'all var(--transition)',
                        opacity: w.found ? 1 : 0.6,
                      }}
                      title={w.found ? `Jump to "${w.word}"` : `"${w.word}" not in dictionary`}
                    >
                      {w.found ? '' : '⚠ '}{w.word}{w.fuzzy && w.matched_word !== w.word ? ` (~${w.matched_word})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right: Stats & Vocabulary Dictionary ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>

            {/* Translation Coverage Card */}
            <div className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                    {playableWords.length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                    Signs Synthesized
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '1.85rem', fontWeight: 800, color: notFoundWords.length ? 'var(--color-warning)' : 'var(--color-success)', fontFamily: 'var(--font-display)' }}>
                    {notFoundWords.length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                    Skipped Words
                  </div>
                </div>
              </div>

              {coverage !== null && (
                <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border)' }}>
                  <div className="confidence-bar">
                    <div className="confidence-bar-fill" style={{ width: `${coverage * 100}%` }} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                    {Math.round(coverage * 100)}% WLASL Lexicon Coverage
                  </div>
                </div>
              )}
            </div>

            {/* Supported Vocabulary Card */}
            {vocabHints.length > 0 && (
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                    Supported Vocabulary
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
                    {vocabHints.length} words
                  </span>
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto', paddingRight: '0.25rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {vocabHints.map((w) => (
                      <button
                        key={w}
                        onClick={() => setText((prev) => prev ? `${prev} ${w}` : w)}
                        className="quick-chip"
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.55rem',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-surface)',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontFamily: 'inherit',
                        }}
                        title={`Add "${w}" to text`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* How It Works Card */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                Synthesis Guidance
              </h4>
              <ol style={{ paddingLeft: '1.1rem', fontSize: '0.83rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.45rem', margin: 0 }}>
                <li>Select your language, then type or <strong>voice-dictate</strong>.</li>
                <li>Click <strong>Show Signs</strong> — video demonstration auto-plays.</li>
                <li>Toggle <strong>Auto-Advance</strong> to sequence words smoothly.</li>
                <li>Use <strong>Speed Controls</strong> (0.5x to 1.5x) for learning.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .tts-input-row {
          display: flex;
          gap: 0.85rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .tts-input-row textarea { min-width: 0; flex: 1 1 240px; }

        .tts-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 1.5rem;
          align-items: start;
        }

        @media (max-width: 900px) {
          .tts-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 520px) {
          .tts-speed { margin-left: 0 !important; width: 100%; margin-top: 0.5rem; }
        }
      `}</style>
    </AppShell>
  );
}
