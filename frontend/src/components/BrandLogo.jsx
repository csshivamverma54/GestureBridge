import React from 'react';
import { useSettings } from '../context/SettingsContext';

/**
 * BrandLogo — GestureBridge Recreated Kinetic Bridge Mark
 *
 * Renders the recreated logo featuring the 7-pulse acoustic & visual bridge
 * with synchronization nodes, adaptive light/dark theme support, and responsive scaling.
 */
export default function BrandLogo({
  size = 32,
  className = '',
  style = {},
  variant = 'auto', // 'auto' | 'light' | 'dark'
  useVector = false,
}) {
  let theme = 'light';
  try {
    const settings = useSettings();
    theme = settings?.theme || 'light';
  } catch {
    // fallback if outside SettingsContext
  }

  const isDark = variant === 'dark' || (variant === 'auto' && theme === 'dark');

  if (useVector) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`brand-logo-svg ${className}`}
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
        aria-label="GestureBridge Logo"
      >
        <rect width="512" height="512" rx="118" fill={isDark ? '#121826' : '#FFFFFF'} />
        <rect x="2" y="2" width="508" height="508" rx="116" stroke={isDark ? '#2D3748' : '#E5E7EB'} strokeWidth="4" />
        {/* Bar 1: Outer Left Acoustic Wave */}
        <rect x="116" y="220" width="24" height="72" rx="12" fill={isDark ? '#F1F5F9' : '#1E293B'} />
        {/* Bar 2: Mid Left Acoustic Wave with Sync Dot */}
        <rect x="156" y="180" width="24" height="152" rx="12" fill={isDark ? '#F1F5F9' : '#1E293B'} />
        <circle cx="168" cy="256" r="6" fill={isDark ? '#121826' : '#FFFFFF'} />
        {/* Bar 3: Tall Left Acoustic Wave */}
        <rect x="196" y="144" width="24" height="224" rx="12" fill={isDark ? '#F1F5F9' : '#1E293B'} />
        {/* Bar 4: Center Neural Bridge (Royal Blue) with Core Sync Dot */}
        <rect x="244" y="120" width="24" height="272" rx="12" fill="#2563EB" />
        <circle cx="256" cy="256" r="6" fill="#FFFFFF" />
        {/* Bar 5: Right Transition Wave (Azure Blue) */}
        <rect x="292" y="144" width="24" height="224" rx="12" fill="#4F83F5" />
        {/* Bar 6: Mid Right Visual Gesture Wave (Amber) with Sync Dot */}
        <rect x="332" y="180" width="24" height="152" rx="12" fill="#F59E0B" />
        <circle cx="344" cy="256" r="6" fill="#FFFFFF" />
        {/* Bar 7: Outer Right Visual Gesture Wave (Amber) */}
        <rect x="372" y="220" width="24" height="72" rx="12" fill="#F59E0B" />
      </svg>
    );
  }

  const imgSrc = isDark ? '/logo-dark.png' : '/logo-light.png';

  return (
    <img
      src={imgSrc}
      alt="GestureBridge Logo"
      width={size}
      height={size}
      className={`brand-logo-img ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: Math.round(size * 0.22),
        flexShrink: 0,
        objectFit: 'contain',
        ...style,
      }}
      onError={(e) => {
        if (e.target.src !== `${window.location.origin}/logo.png`) {
          e.target.src = '/logo.png';
        }
      }}
    />
  );
}
