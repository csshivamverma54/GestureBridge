/**
 * SettingsContext — theme, sign-language preference, and misc settings.
 *
 * Settings are persisted to localStorage so they survive page reloads.
 *
 * Exposes:
 *   theme               — 'light' | 'dark'
<<<<<<< HEAD
 *   language            — 'ASL' | 'ISL' | 'Hindi' | 'Marathi'
 *   ttsLanguage         — BCP-47 locale used for Web Speech API TTS/STT
 *                          e.g. 'en-US', 'hi-IN', 'mr-IN'
=======
 *   language            — 'ASL' | 'ISL'
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
 *   recognitionMode     — 'word' | 'letter'
 *   notifications       — boolean
 *   privacyMode         — boolean
 *   captureInterval     — number (ms between webcam frame captures)
 *   confidenceThreshold — 0–1 minimum confidence to accept a prediction
 *   toggleTheme()
 *   updateSettings(partial)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext(null);

const DEFAULTS = {
  theme:               'light',
  language:            'ASL',
<<<<<<< HEAD
  ttsLanguage:         'en-US',   // BCP-47 for Web Speech API
=======
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
  recognitionMode:     'letter',  // 'word' | 'letter'  — letter-to-sentence is default
  notifications:       true,
  privacyMode:         false,
  captureInterval:     200,   // ms
  confidenceThreshold: 0.60,  // 60 %
};

<<<<<<< HEAD
/**
 * Supported display languages.
 * Each entry includes:
 *   value      — stored in settings.language
 *   label      — shown in UI dropdowns
 *   ttsLocale  — BCP-47 passed to SpeechSynthesis / SpeechRecognition
 *   sttLangs   — alternative BCP-47 codes that browsers accept for STT
 */
export const SUPPORTED_LANGUAGES = [
  { value: 'ASL',     label: 'ASL (American)',   ttsLocale: 'en-US',  nativeName: 'English' },
  { value: 'ISL',     label: 'ISL (Indian)',      ttsLocale: 'en-IN',  nativeName: 'English (IN)' },
  { value: 'Hindi',   label: 'Hindi (हिन्दी)',     ttsLocale: 'hi-IN',  nativeName: 'हिन्दी' },
  { value: 'Marathi', label: 'Marathi (मराठी)',   ttsLocale: 'mr-IN',  nativeName: 'मराठी' },
];

/** Return the BCP-47 locale for a given language value. */
export const getTTSLocale = (language) =>
  SUPPORTED_LANGUAGES.find((l) => l.value === language)?.ttsLocale ?? 'en-US';

=======
>>>>>>> 349992d6c8b355879cf13b88666ccafa4b163dac
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem('gb_settings');
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  // Apply theme to <html data-theme="..."> whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const updateSettings = (partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem('gb_settings', JSON.stringify(next));
      return next;
    });
  };

  const toggleTheme = () =>
    updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' });

  return (
    <SettingsContext.Provider value={{ ...settings, updateSettings, toggleTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
