/**
 * SettingsContext  - theme, sign-language preference, and misc settings.
 *
 * Settings are persisted to localStorage so they survive page reloads.
 *
 * Exposes:
 *   theme                - 'light' | 'dark'
 *   language             - 'ASL' | 'ISL' | 'Hindi' | 'Marathi'
 *   ttsLanguage          - BCP-47 locale used for Web Speech API TTS/STT
 *                          e.g. 'en-US', 'hi-IN', 'mr-IN'
 *   recognitionMode      - 'word' | 'letter'
 *   notifications        - boolean
 *   privacyMode          - boolean
 *   captureInterval      - number (ms between webcam frame captures)
 *   confidenceThreshold  - 0-1 minimum confidence to accept a prediction
 *   toggleTheme()
 *   updateSettings(partial)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext(null);

const DEFAULTS = {
  theme:               'light',
  signLanguage:        'ASL',     // 'ASL' | 'ISL' - Visual Sign Language
  spokenLanguage:      'English', // 'English' | 'Hindi' | 'Marathi' - Spoken & Written Natural Language
  language:            'English', // Legacy alias for backwards compatibility
  ttsLanguage:         'en-US',   // BCP-47 for Web Speech API TTS/STT
  recognitionMode:     'letter',  // 'word' | 'letter'
  notifications:       true,
  privacyMode:         false,
  captureInterval:     200,       // ms
  confidenceThreshold: 0.60,      // 60%
};

/**
 * Supported Visual Sign Languages (gesture models & video synthesis).
 */
export const SUPPORTED_SIGN_LANGUAGES = [
  { value: 'ASL', label: 'American Sign Language (ASL)', region: 'North America / Global', code: 'ASL' },
  { value: 'ISL', label: 'Indian Sign Language (ISL)',     region: 'India / South Asia',    code: 'ISL' },
];

/**
 * Supported Spoken / Written Natural Languages (text input, UI translation, STT & TTS audio).
 */
export const SUPPORTED_SPOKEN_LANGUAGES = [
  { value: 'English', label: 'English (US)',         ttsLocale: 'en-US', nativeName: 'English', script: 'Latin',      flag: '🇺🇸' },
  { value: 'Hindi',   label: 'Hindi (भारत)',          ttsLocale: 'hi-IN', nativeName: 'हिन्दी',   script: 'Devanagari', flag: '🇮🇳' },
  { value: 'Marathi', label: 'Marathi (महाराष्ट्र)', ttsLocale: 'mr-IN', nativeName: 'मराठी',   script: 'Devanagari', flag: '🇮🇳' },
];

// Backwards-compatible legacy export
export const SUPPORTED_LANGUAGES = SUPPORTED_SPOKEN_LANGUAGES;

/** Return the BCP-47 locale for a given spoken language value. */
export const getTTSLocale = (lang) => {
  if (!lang) return 'en-US';
  const match = SUPPORTED_SPOKEN_LANGUAGES.find(
    (l) => l.value.toLowerCase() === lang.toLowerCase() || l.ttsLocale.toLowerCase() === lang.toLowerCase()
  );
  if (match) return match.ttsLocale;
  // Legacy fallback
  if (lang === 'ASL') return 'en-US';
  if (lang === 'ISL') return 'en-IN';
  return 'en-US';
};

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
      // Keep spoken language and ttsLanguage in sync
      if (partial.spokenLanguage) {
        next.ttsLanguage = getTTSLocale(partial.spokenLanguage);
        next.language = partial.spokenLanguage;
      } else if (partial.language) {
        if (partial.language === 'ASL' || partial.language === 'ISL') {
          next.signLanguage = partial.language;
        } else {
          next.spokenLanguage = partial.language;
          next.ttsLanguage = getTTSLocale(partial.language);
        }
      }
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
