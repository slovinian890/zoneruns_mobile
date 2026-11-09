import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Canvas,
  Fill,
  Rect,
  Circle,
  RadialGradient,
  LinearGradient,
  FractalNoise,
  vec,
} from '@shopify/react-native-skia';
import { Easing, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AuroraColors } from '@/constants/theme';

export type AmbientVariant = 'default' | 'focus' | 'active';

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Target glow opacity per variant — the drift/positions stay identical, only
// how strong each glow reads changes, so switching screens never jumps.
const VARIANT_TARGETS: Record<AmbientVariant, { chartreuse: number; forest: number; amber: number }> = {
  default: { chartreuse: 0.22, forest: 0.45, amber: 0.1 },
  // Data-heavy screens (Runs, run detail): one dim glow behind the header, calm everywhere else.
  focus: { chartreuse: 0.1, forest: 0, amber: 0 },
  // Live recording screen: the brand glow runs hotter.
  active: { chartreuse: 0.32, forest: 0.45, amber: 0.1 },
};

const DRIFT_DURATION = 18000;
const DRIFT_EASE = Easing.inOut(Easing.sin);

/** One glow's base position, in fractions of screen width/height, and drift amplitude in the same units. */
function useDrift(baseXFrac: number, baseYFrac: number, ampFrac: number, width: number, height: number, reducedMotion: boolean) {
  const x = useSharedValue(baseXFrac * width);
  const y = useSharedValue(baseYFrac * height);

  useEffect(() => {
    const bx = baseXFrac * width;
    const by = baseYFrac * height;
    if (reducedMotion) {
      x.set(bx);
      y.set(by);
      return;
    }
    x.set(withRepeat(withTiming(bx + ampFrac * width, { duration: DRIFT_DURATION, easing: DRIFT_EASE }), -1, true));
    y.set(withRepeat(withTiming(by - ampFrac * height, { duration: DRIFT_DURATION * 1.15, easing: DRIFT_EASE }), -1, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, reducedMotion]);

  return { x, y };
}

interface AmbientBackgroundProps {
  variant: AmbientVariant;
}

function AmbientBackground({ variant }: AmbientBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const r1 = width * 0.75;
  const r2 = width * 0.7;
  const r3 = width * 0.8;

  const glow1 = useDrift(0.1, -0.05, 0.04, width, height, reducedMotion);
  const glow2 = useDrift(1.05, 0.55, 0.03, width, height, reducedMotion);
  const glow3 = useDrift(0.4, 1.05, 0.03, width, height, reducedMotion);

  const chartreuseOpacity = useSharedValue(VARIANT_TARGETS.default.chartreuse);
  const forestOpacity = useSharedValue(VARIANT_TARGETS.default.forest);
  const amberOpacity = useSharedValue(VARIANT_TARGETS.default.amber);

  useEffect(() => {
    const target = VARIANT_TARGETS[variant];
    chartreuseOpacity.set(withTiming(target.chartreuse, { duration: 600 }));
    forestOpacity.set(withTiming(target.forest, { duration: 600 }));
    amberOpacity.set(withTiming(target.amber, { duration: 600 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // Static colour stops — opacity itself is animated via the gradient's own
  // start-stop alpha, so these are plain strings recomputed only when the
  // underlying brand colours would change (never, in practice).
  const chartreuse = useMemo(() => [rgba(AuroraColors.primary, 1), rgba(AuroraColors.primary, 0)], []);
  const forest = useMemo(() => [rgba(AuroraColors.accentForest, 1), rgba(AuroraColors.accentForest, 0)], []);
  const amber = useMemo(() => [rgba(AuroraColors.accentAmber, 1), rgba(AuroraColors.accentAmber, 0)], []);

  if (width === 0 || height === 0) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill color={AuroraColors.bg} />

      <Circle cx={glow1.x} cy={glow1.y} r={r1} opacity={chartreuseOpacity}>
        <RadialGradient c={vec(width * 0.1, height * -0.05)} r={r1} colors={chartreuse} />
      </Circle>

      <Circle cx={glow2.x} cy={glow2.y} r={r2} opacity={forestOpacity}>
        <RadialGradient c={vec(width * 1.05, height * 0.55)} r={r2} colors={forest} />
      </Circle>

      <Circle cx={glow3.x} cy={glow3.y} r={r3} opacity={amberOpacity}>
        <RadialGradient c={vec(width * 0.4, height * 1.05)} r={r3} colors={amber} />
      </Circle>

      {/* Film grain — kills gradient banding on OLED, monochrome-ish at this opacity regardless of the noise shader's own colour. */}
      <Rect x={0} y={0} width={width} height={height} opacity={0.07}>
        <FractalNoise freqX={0.9} freqY={0.9} octaves={2} seed={7} tileWidth={width} tileHeight={height} />
      </Rect>

      {/* Vignette — keeps the floating tab bar area calm regardless of variant. */}
      <Rect x={0} y={height * 0.72} width={width} height={height * 0.28}>
        <LinearGradient
          start={vec(0, height * 0.72)}
          end={vec(0, height)}
          colors={['transparent', rgba(AuroraColors.bg, 0.65)]}
        />
      </Rect>
    </Canvas>
  );
}

interface AmbientContextValue {
  setVariant: (variant: AmbientVariant) => void;
}

const AmbientContext = createContext<AmbientContextValue | null>(null);

/** Mount once at the app root — one Canvas for the whole app, never per-screen. */
export function AmbientBackgroundProvider({ children }: PropsWithChildren) {
  const [variant, setVariant] = useState<AmbientVariant>('default');
  const value = useMemo(() => ({ setVariant }), []);

  return (
    <AmbientContext.Provider value={value}>
      <AmbientBackground variant={variant} />
      {children}
    </AmbientContext.Provider>
  );
}

/**
 * Call once per screen: sets the shared ambient background's mood whenever
 * this screen gains focus, and again if `variant` itself changes while this
 * screen is already focused (e.g. Run's background going 'active' the
 * instant recording starts, not just on next navigation focus) — `variant`
 * is a useCallback dep specifically so useFocusEffect re-fires on that
 * change too, not only on focus/blur.
 */
export function useAmbientVariant(variant: AmbientVariant) {
  const ctx = useContext(AmbientContext);

  useFocusEffect(
    useCallback(() => {
      ctx?.setVariant(variant);
    }, [ctx, variant]),
  );
}
