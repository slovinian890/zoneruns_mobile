/**
 * Grove Design System — Premium Dark
 * Deep, almost-black olive glass with a zesty chartreuse brand accent.
 * Built dark-first: the app always renders this palette regardless of the
 * device's system theme. Every color in the app should come from this file —
 * nothing outside it should hold a literal hex/rgb value.
 */

import { Platform } from 'react-native';

export const AuroraColors = {
  // ── Base layers ──
  // bg: the deepest layer, painted once by <AmbientBackground/> behind the
  // whole app. bgElevated: sheets, modals, anything that should read as
  // "above" the ambient background rather than part of it.
  bg: '#0D1108',
  bgElevated: '#141A0C',
  mapBase: '#10140B',

  // ── Surfaces ──
  // surface: translucent glass (pair with expo-blur) for GlassCard.
  // surfaceSolid: an opaque fallback for places blur isn't worth the cost.
  surface: 'rgba(28, 36, 18, 0.72)',
  surfaceSolid: '#1A2111',
  border: 'rgba(201, 213, 74, 0.10)',
  highlight: 'rgba(255, 255, 255, 0.06)', // 1px top edge on glass cards
  scrim: 'rgba(13, 17, 8, 0.78)', // full-screen modal backdrop

  // ── Brand ──
  primary: '#C9D54A',
  primaryPressed: '#B3BE3A',
  // Soft tinted-primary fill for icon badges/rings (EmptyState, achievements) —
  // primary at low opacity, named so it isn't re-derived as a one-off rgba() string.
  primarySoft: 'rgba(201, 213, 74, 0.12)',
  // Chartreuse/amber are both light — text/icons drawn on a primary- or
  // accent-filled surface need a dark foreground to stay readable.
  onPrimary: '#12160A',

  // ── Accents ──
  accentAmber: '#E8C23C',
  accentTerracotta: '#C8572D',
  accentForest: '#1F4D2E',

  // ── Text ──
  text: '#F1F3E6',
  textMuted: '#9BA28A',
  textFaint: '#626A55',

  // ── Status ──
  success: '#8FCB5A',
  warning: '#E8C23C',
  danger: '#D9603B',

  // ── Territory zone states (the Compete map) ──
  zoneMine: '#C9D54A',
  zoneRival: '#C8572D',
  zoneContested: '#E8C23C',
  zoneNeutral: '#4A5240',

  transparent: 'transparent',

  // ── Legacy aliases ──
  // Older screens were written against these names; repointed to the closest
  // new-palette equivalent so nothing breaks while the whole app reads from
  // the same tokens above. Prefer the names above in new code.
  background: '#0D1108', // == bg
  accent: '#E8C23C', // == accentAmber
  textSecondary: '#9BA28A', // == textMuted
  forestGreen: '#1F4D2E', // == accentForest
  leafGreen: '#8BC24A',
};

const auroraTheme = {
  text: AuroraColors.text,
  textSecondary: AuroraColors.textMuted,
  textMuted: AuroraColors.textFaint,
  textFaint: AuroraColors.textFaint,
  background: AuroraColors.bg,
  backgroundSecondary: AuroraColors.bgElevated,
  bg: AuroraColors.bg,
  bgElevated: AuroraColors.bgElevated,
  surface: AuroraColors.surface,
  surfaceSolid: AuroraColors.surfaceSolid,
  scrim: AuroraColors.scrim,
  highlight: AuroraColors.highlight,
  tint: AuroraColors.primary,
  icon: AuroraColors.textMuted,
  tabIconDefault: AuroraColors.textFaint,
  tabIconSelected: AuroraColors.primary,
  border: AuroraColors.border,
  card: AuroraColors.surfaceSolid,
  // Accent colors
  primary: AuroraColors.primary,
  primaryPressed: AuroraColors.primaryPressed,
  onPrimary: AuroraColors.onPrimary,
  secondary: AuroraColors.accentAmber,
  accent: AuroraColors.accentAmber,
  success: AuroraColors.success,
  warning: AuroraColors.warning,
  danger: AuroraColors.danger,
  // Running-specific
  running: AuroraColors.primary,
  runningSecondary: AuroraColors.textMuted,
  runningAccent: AuroraColors.accentAmber,
};

export const Colors = {
  light: auroraTheme,
  dark: auroraTheme,
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
 * Elevation - cross-platform shadow tokens (iOS shadow* + Android elevation).
 * `glowPrimary` is for the one or two primary-action surfaces per screen — a
 * colored glow, not a generic drop shadow, so it doesn't turn into visual
 * noise if overused.
 */
export const Shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  glowPrimary: {
    shadowColor: AuroraColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  glowDanger: {
    shadowColor: AuroraColors.danger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
};

/**
 * Soft Gradient Rings - Signature visual element
 * For profile photos and stats, referencing breath and controlled pacing
 */
export const GradientRings = {
  colors: [
    AuroraColors.primary,
    AuroraColors.accentAmber + '80', // 50% opacity
    AuroraColors.surfaceSolid + '40', // 25% opacity
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
