/**
 * SettingsContext â€” theme, sign-language preference, and misc settings.
 *
 * Settings are persisted to localStorage so they survive page reloads.
 *
 * Exposes:
 *   theme               â€” 'light' | 'dark'
 *   language            â€” 'ASL' | 'ISL' | 'Hindi' | 'Marathi'
 *   ttsLanguage         â€” BCP-47 locale used for Web Speech API TTS/STT
 *                          e.g. 'en-US', 'hi-IN', 'mr-IN'
 *   recognitionMode     â€” 'word' | 'letter'
 *   notifications       â€” boolean
 *   privacyMode         â€” boolean
 *   captureInterval     â€” number (ms between webcam frame captures)
 *   confidenceThreshold â€” 0â€“1 minimum confidence to accept a prediction
 *   toggleTheme()
 *   updateSettings(partial)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext(null);

const DEFAULTS = {
  theme:               'light',
  language:            'ASL',
  ttsLanguage:         'en-US',   // BCP-47 for Web Speech API
  recognitionMode:     'letter',  // 'word' | 'letter'  â€” letter-to-sentence is default
  notifications:       true,
  privacyMode:         false,
  captureInterval:     200,   // ms
  confidenceThreshold: 0.60,  // 60 %
};

/**
 * Supported display languages.
 * Each entry includes:
 *   value      â€” stored in settings.language
 *   label      â€” shown in UI dropdowns
 *   ttsLocale  â€” BCP-47 passed to SpeechSynthesis / SpeechRecognition
 *   sttLangs   â€” alternative BCP-47 codes that browsers accept for STT
 */
export const SUPPORTED_LANGUAGES = [
  { value: 'ASL',     label: 'ASL (American)',   ttsLocale: 'en-US',  nativeName: 'English' },
  { value: 'ISL',     label: 'ISL (Indian)',      ttsLocale: 'en-IN',  nativeName: 'English (IN)' },
  { value: 'Hindi',   label: 'Hindi (à¤¹à¤¿à¤¨à¥à¤¦à¥€)',     ttsLocale: 'hi-IN',  nativeName: 'à¤¹à¤¿à¤¨à¥à¤¦à¥€' },
  { value: 'Marathi', label: 'Marathi (à¤®à¤°à¤¾à¤ à¥€)',   ttsLocale: 'mr-IN',  nativeName: 'à¤®à¤°à¤¾à¤ à¥€' },
];

/** Return the BCP-47 locale for a given language value. */
export const getTTSLocale = (language) =>
  SUPPORTED_LANGUAGES.find((l) => l.value === language)?.ttsLocale ?? 'en-US';

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
