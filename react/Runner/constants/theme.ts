/**
 * Clean Pace Minimal Design System
 * Ultra-minimal Scandinavian-inspired design for runners tracking progress mindfully.
 */

import { Platform } from 'react-native';

/**
 * Clean Pace Color Palette
 * #FDFDFC – Off White: calm, bright, uncluttered
 * #DCEAF2 – Frost Blue: reduces stress and UI noise
 * #AAC4D6 – Misty Slate: supportive neutrals
 * #5B7EA4 – Cool Steel: strong but muted
 * #2A2E36 – Charcoal: stable dark contrast
 */
export const CleanPaceColors = {
  offWhite: '#FDFDFC',
  frostBlue: '#DCEAF2',
  mistySlate: '#AAC4D6',
  coolSteel: '#5B7EA4',
  charcoal: '#2A2E36',
  border: '#ECECEC',
  transparent: 'transparent',
};

export const Colors = {
  light: {
    text: CleanPaceColors.charcoal,
    textSecondary: CleanPaceColors.coolSteel,
    textMuted: CleanPaceColors.mistySlate,
    background: CleanPaceColors.offWhite,
    backgroundSecondary: CleanPaceColors.frostBlue,
    tint: CleanPaceColors.coolSteel,
    icon: CleanPaceColors.mistySlate,
    tabIconDefault: CleanPaceColors.mistySlate,
    tabIconSelected: CleanPaceColors.coolSteel,
    border: CleanPaceColors.border,
    card: CleanPaceColors.offWhite,
    // Accent colors
    primary: CleanPaceColors.coolSteel,
    secondary: CleanPaceColors.mistySlate,
    accent: CleanPaceColors.frostBlue,
    // Running-specific
    running: CleanPaceColors.coolSteel,
    runningSecondary: CleanPaceColors.mistySlate,
    runningAccent: CleanPaceColors.frostBlue,
  },
  dark: {
    text: CleanPaceColors.offWhite,
    textSecondary: CleanPaceColors.mistySlate,
    textMuted: CleanPaceColors.coolSteel,
    background: CleanPaceColors.charcoal,
    backgroundSecondary: '#1F2227',
    tint: CleanPaceColors.mistySlate,
    icon: CleanPaceColors.coolSteel,
    tabIconDefault: CleanPaceColors.coolSteel,
    tabIconSelected: CleanPaceColors.mistySlate,
    border: '#3A3E46',
    card: '#32363E',
    // Accent colors
    primary: CleanPaceColors.mistySlate,
    secondary: CleanPaceColors.coolSteel,
    accent: '#364A5E',
    // Running-specific
    running: CleanPaceColors.mistySlate,
    runningSecondary: CleanPaceColors.coolSteel,
    runningAccent: '#364A5E',
  },
};

/**
 * Typography System
 * Headline: Neue Haas Grotesk Display (fallback to SF Pro Display)
 * Body: SF Pro Text
 */
export const Typography = {
  // Headline family (for H1, H2, titles)
  headline: Platform.select({
    ios: 'SF Pro Display',
    android: 'sans-serif',
    web: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif",
    default: 'sans-serif',
  }),
  // Body family (for paragraphs, labels, UI text)
  body: Platform.select({
    ios: 'SF Pro Text',
    android: 'sans-serif',
    web: "'SF Pro Text', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    default: 'sans-serif',
  }),
};

/**
 * Font Sizes - H1 never exceeds 36px to stay calm
 */
export const FontSizes = {
  h1: 32,
  h2: 24,
  h3: 20,
  body: 16,
  bodySmall: 14,
  caption: 12,
};

/**
 * Line Heights - Consistent vertical rhythm (1.2 for headlines, 1.4 for body)
 */
export const LineHeights = {
  headline: 1.2,
  body: 1.4,
};

/**
 * Spacing System - 10pt modular grid (European design influence)
 */
export const Spacing = {
  xs: 5,
  sm: 10,
  md: 20,
  lg: 30,
  xl: 40,
  xxl: 60,
  xxxl: 80,
};

/**
 * Border Radius - Strict cards with 12px corner radius
 */
export const BorderRadius = {
  card: 12,
  small: 8,
  large: 16,
  full: 9999,
};

/**
 * Animation Timings - Slow, smooth fades (200–300ms)
 */
export const Animation = {
  duration: {
    fast: 200,
    normal: 250,
    slow: 300,
  },
  easing: 'ease-in-out',
};

/**
 * Soft Gradient Rings - Signature visual element
 * For profile photos and stats, referencing breath and controlled pacing
 */
export const GradientRings = {
  colors: [
    CleanPaceColors.frostBlue,
    CleanPaceColors.mistySlate + '80', // 50% opacity
    CleanPaceColors.coolSteel + '40', // 25% opacity
  ],
  breathing: {
    duration: 3000,
    scaleFrom: 1,
    scaleTo: 1.15,
  },
};

// Legacy font export for compatibility
export const Fonts = Platform.select({
  ios: {
    sans: Typography.body,
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: Typography.body,
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
