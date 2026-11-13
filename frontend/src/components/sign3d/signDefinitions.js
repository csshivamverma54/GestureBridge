/**
 * signDefinitions.js — Theme-to-Sign-Language mapping & verified linguistic sign specs.
 *
 * Theme-to-Language Binding (driven by SettingsContext.theme):
 *   - 'light' -> ISL (Indian Sign Language) — WELCOME ("Invite, Welcome()", ISLRTC Official Dictionary)
 *   - 'dark'  -> ASL (American Sign Language) — WELCOME (StrongASL / SignASL Greeting/Reception Variant)
 */

export const SIGN_MODES = {
  light: {
    theme: 'light',
    code: 'ISL',
    languageName: 'Indian Sign Language',
    word: 'WELCOME',
    meaning: 'Greeting / Reception ("Invite, Welcome")',
    status: 'verified_reference',
    variant: 'Two-handed inviting sweep toward chest (ISLRTC Everyday category)',
    referenceLabel: 'ISLRTC Official Dictionary — "Invite, Welcome()"',
    referenceUrl: 'https://www.youtube.com/watch?v=P8c9TRiU7HI',
    dictionaryUrl: 'https://divyangjan.depwd.gov.in/islrtc/search.php',
    category: 'Everyday',
    durationMs: 3800,
    movementSummary:
      'Both hands begin forward at chest level with open palms facing upward and inward, then sweep gracefully backward and inward toward the chest in an inviting, welcoming gesture.',
    verificationNote:
      'Verified from the official ISLRTC dictionary entry "Invite, Welcome()" (ISLRTC ID P8c9TRiU7HI). Dual-hand symmetrical inviting articulation.',
  },
  dark: {
    theme: 'dark',
    code: 'ASL',
    languageName: 'American Sign Language',
    word: 'WELCOME',
    meaning: 'Greeting / Reception (not "You\'re welcome")',
    status: 'verified_reference',
    variant: 'One-handed flat palm-up sweep to midsection (StrongASL / SignASL)',
    referenceLabel: 'StrongASL — "welcome"',
    referenceUrl: 'https://www.strongasl.com/american-sign-language-dictionary/words/welcome',
    secondaryReferenceUrl: 'https://www.signasl.org/sign/welcome',
    durationMs: 3600,
    movementSummary:
      'Dominant flat open hand starts in front of the body with palm facing upward and fingers pointing sideways, sweeping smoothly inward until the pinkie edge meets the midsection.',
    verificationNote:
      'Verified from StrongASL & SignASL greeting/reception entry. Single dominant hand inward arc to torso midsection.',
  },
};

export function getSignModeForTheme(isDark) {
  return isDark ? SIGN_MODES.dark : SIGN_MODES.light;
}
