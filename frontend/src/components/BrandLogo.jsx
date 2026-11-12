import React from 'react';
import { useSettings } from '../context/SettingsContext';

/**
 * BrandLogo — GestureBridge Glossy 3D Violet Hand Mark
 *
 * Recreates the playful, glossy 3D violet hand emblem from the design language
 * with soft specular highlights, adaptive light/dark theme support, and crisp vector scaling.
 */
export default function BrandLogo({
  size = 32,
  className = '',
  style = {},
  variant = 'auto', // 'auto' | 'light' | 'dark'
  useVector = true,
}) {
  let theme = 'light';
  try {
    const settings = useSettings();
    theme = settings?.theme || 'light';
  } catch {
    // fallback if outside SettingsContext
  }

  const isDark = variant === 'dark' || (variant === 'auto' && theme === 'dark');
  const gradId = React.useId().replace(/:/g, '');

  if (useVector !== false) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`brand-logo-svg ${className}`}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          filter: isDark
            ? 'drop-shadow(0 6px 14px rgba(124, 92, 255, 0.40))'
            : 'drop-shadow(0 6px 12px rgba(107, 76, 255, 0.28))',
          ...style,
        }}
        aria-label="GestureBridge Logo"
      >
        <defs>
          <linearGradient id={`gbHand-${gradId}`} x1="12" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9D85FF" />
            <stop offset="48%" stopColor="#6B4CFF" />
            <stop offset="100%" stopColor="#4A2CE0" />
          </linearGradient>
          <radialGradient id={`gbSpec-${gradId}`} cx="35%" cy="28%" r="55%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sculpted 3D-inspired open waving hand */}
        <g transform="rotate(-8 32 34)">
          {/* Palm + wrist base */}
          <path
            d="M21 30C21 26.5 23.8 24 27 24H39C43.5 24 47 27.6 47 32.2V39.5C47 47.6 40.5 54 32.5 54H31C23.5 54 18.2 48.2 18.2 40.8V35.5C18.2 33 19.3 31 21 30Z"
            fill={`url(#gbHand-${gradId})`}
          />
          {/* Thumb */}
          <rect x="11.5" y="29.5" width="7.5" height="17" rx="3.75" transform="rotate(-38 15.2 38)" fill={`url(#gbHand-${gradId})`} />
          {/* Index finger */}
          <rect x="20.5" y="12.5" width="6.2" height="19" rx="3.1" transform="rotate(-6 23.6 22)" fill={`url(#gbHand-${gradId})`} />
          {/* Middle finger */}
          <rect x="28.3" y="8" width="6.4" height="22.5" rx="3.2" fill={`url(#gbHand-${gradId})`} />
          {/* Ring finger */}
          <rect x="36.2" y="10.8" width="6.2" height="20" rx="3.1" transform="rotate(6 39.3 20.8)" fill={`url(#gbHand-${gradId})`} />
          {/* Pinky finger */}
          <rect x="43.5" y="17.5" width="5.6" height="15.5" rx="2.8" transform="rotate(14 46.3 25.2)" fill={`url(#gbHand-${gradId})`} />

          {/* Soft glossy specular highlight on palm */}
          <ellipse cx="31" cy="36" rx="9" ry="7" fill={`url(#gbSpec-${gradId})`} />
          {/* Specular pills on fingertips */}
          <ellipse cx="31.5" cy="12" rx="1.6" ry="2.6" fill="#FFFFFF" fillOpacity="0.35" />
          <ellipse cx="23.2" cy="16" rx="1.4" ry="2.2" fill="#FFFFFF" fillOpacity="0.3" />
        </g>
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
        borderRadius: Math.round(size * 0.24),
        flexShrink: 0,
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}
