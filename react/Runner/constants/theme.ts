/**
 * Absolute Zero Design System — Glacial
 * Deep ink-teal glass with a muted glacier-teal brand accent (not a raw
 * electric cyan — full-saturation cyan across large surfaces reads as glare,
 * not premium) and a softened signal-red rival/danger color. Strategy,
 * focus, precision, without fatiguing the eye on a screen you look at mid-run.
 * Every token below keeps its old name so nothing downstream has to change,
 * only what it resolves to.
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
  bg: '#0A1720',
  bgElevated: '#122733',
  mapBase: '#0B1B22',

  // ── Surfaces ──
  // surface: translucent glass (pair with expo-blur) for GlassCard.
  // surfaceSolid: an opaque fallback for places blur isn't worth the cost.
  surface: 'rgba(42, 74, 86, 0.48)',
  surfaceSolid: '#1B2E38',
  border: 'rgba(158, 196, 209, 0.12)',
  highlight: 'rgba(255, 255, 255, 0.08)', // 1px top edge on glass cards
  scrim: 'rgba(5, 10, 16, 0.82)', // full-screen modal backdrop

  // ── Brand ──
  // A glacier teal, not a raw electric cyan — desaturated and hue-shifted a
  // touch toward green so a full-bleed fill (a button, a selected pill)
  // reads as polished stone, not an LED.
  primary: '#4DB8C7',
  primaryPressed: '#276B7A',
  // Spent in exactly one place: a press-triggered spark, never a resting
  // fill. The one warm note against an otherwise all-cool palette.
  neon: '#F4FF3D',
  // Soft tinted-primary fill for icon badges/rings (EmptyState, achievements) —
  // primary at low opacity, named so it isn't re-derived as a one-off rgba() string.
  primarySoft: 'rgba(77, 184, 199, 0.14)',
  // Teal is light enough that text/icons on a primary- or accent-filled
  // surface still need a dark foreground to stay readable.
  onPrimary: '#0A1720',

  // ── Accents ──
  accentAmber: '#E8C23C',
  accentTerracotta: '#AE1F3C',
  accentForest: '#0F3240',

  // ── Text ──
  // A warm-neutral near-white, not a saturated ice blue — easier to read for
  // more than a glance, the way a matte display is easier than a glossy one.
  text: '#E7ECEA',
  textMuted: '#9BB0B8',
  textFaint: '#5E7480',

  // ── Status ──
  success: '#3DBE9B',
  warning: '#E8C23C',
  danger: '#F2554F',

  // ── Territory zone states (the Compete map) ──
  zoneMine: '#4DB8C7',
  zoneRival: '#F2554F',
  zoneContested: '#E8C23C',
  zoneNeutral: '#17262E',

  transparent: 'transparent',

  // ── Legacy aliases ──
  // Older screens were written against these names; repointed to the closest
  // new-palette equivalent so nothing breaks while the whole app reads from
  // the same tokens above. Prefer the names above in new code.
  background: '#0A1720', // == bg
  accent: '#E8C23C', // == accentAmber
  textSecondary: '#9BB0B8', // == textMuted
  forestGreen: '#0F3240', // == accentForest
  leafGreen: '#4DB8C7',
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
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  glowDanger: {
    shadowColor: AuroraColors.danger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
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
