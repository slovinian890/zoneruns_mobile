import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AuroraColors } from '@/constants/theme';

// Larger & sparser than the run-card hex art (HEX_R 17) so it reads as a
// faint backdrop texture rather than a second, competing pattern.
const HEX_R = 30;

// Fixed seed: the field should look the same every time the app opens,
// like a printed backdrop, not reshuffle on every mount.
const GRID_SEED = 7823;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (-90 + 60 * i);
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

interface Hex {
  key: string;
  points: string;
  fill: string;
  opacity: number;
}

/**
 * Faint hex-territory texture for filling otherwise-blank screen space
 * behind sparse lists and empty states — echoes the claimed-territory hex
 * art on run cards instead of a generic decorative glow. Static (no
 * animation) so it reads as a calm backdrop rather than competing for
 * attention. Sits absolutely behind content — mount it as the first child
 * of a themed container.
 */
export function AmbientGlow() {
  const { width, height } = useWindowDimensions();

  const hexes = useMemo<Hex[]>(() => {
    const rng = mulberry32(GRID_SEED);
    const hexW = Math.sqrt(3) * HEX_R;
    const rowH = 1.5 * HEX_R;
    const cols = Math.ceil(width / hexW) + 2;
    const rows = Math.ceil(height / rowH) + 2;

    // Two soft "claimed territory" focal points, placed deterministically —
    // hexes near them pick up a faint brand tint, everything else stays a
    // near-invisible outline.
    const focalA = { x: width * 0.15, y: height * 0.12 };
    const focalB = { x: width * 0.82, y: height * 0.58 };
    const reach = Math.max(width, height) * 0.42;

    const list: Hex[] = [];
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const cx = col * hexW + (row % 2 !== 0 ? hexW / 2 : 0);
        const cy = row * rowH;
        if (cx < -hexW || cx > width + hexW || cy < -HEX_R || cy > height + HEX_R) continue;

        const dA = Math.hypot(cx - focalA.x, cy - focalA.y);
        const dB = Math.hypot(cx - focalB.x, cy - focalB.y);
        const near = Math.max(0, 1 - Math.min(dA, dB) / reach);
        const jitter = rng();

        list.push({
          key: `${row}-${col}`,
          points: hexPoints(cx, cy, HEX_R - 2),
          fill: jitter > 0.5 ? AuroraColors.leafGreen : AuroraColors.accent,
          opacity: 0.02 + near * 0.05 + jitter * 0.01,
        });
      }
    }
    return list;
  }, [width, height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="hexWash" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={AuroraColors.surface} stopOpacity={0.9} />
            <Stop offset="55%" stopColor={AuroraColors.background} stopOpacity={1} />
            <Stop offset="100%" stopColor={AuroraColors.background} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id="hexVignette" cx="50%" cy="34%" r="75%">
            <Stop offset="0%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="70%" stopColor="#000000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" stopOpacity={0.4} />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill="url(#hexWash)" />

        {hexes.map((h) => (
          <Polygon
            key={h.key}
            points={h.points}
            fill={h.fill}
            opacity={h.opacity}
            stroke={AuroraColors.border}
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        ))}

        <Rect x={0} y={0} width={width} height={height} fill="url(#hexVignette)" />
      </Svg>
    </View>
  );
}
