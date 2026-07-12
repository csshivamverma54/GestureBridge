/**
 * SettingsContext — theme, sign-language preference, and misc settings.
 *
 * Settings are persisted to localStorage so they survive page reloads.
 *
 * Exposes:
 *   theme               — 'light' | 'dark'
 *   language            — 'ASL' | 'ISL'
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
  notifications:       true,
  privacyMode:         false,
  captureInterval:     200,   // ms
  confidenceThreshold: 0.60,  // 60 %
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
