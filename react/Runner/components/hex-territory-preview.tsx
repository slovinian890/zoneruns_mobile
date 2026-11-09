import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { AuroraColors } from '@/constants/theme';
import { RouteData } from '@/services/supabase';

interface HexTerritoryPreviewProps {
  route: RouteData;
  trailColor?: string;
  height?: number;
  /** Deterministic seed so the same run always renders the same hex pattern. */
  seed?: string;
}

// Small deterministic PRNG (mulberry32) so a given run's hex art is stable
// across re-renders instead of reshuffling every time the list redraws.
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

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HEX_R = 17; // circumradius, px

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (-90 + 60 * i);
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

const ZONE_COLORS = {
  mine: [AuroraColors.primary, AuroraColors.accentAmber],
  rival: [AuroraColors.accentForest, AuroraColors.accentTerracotta],
} as const;

export function HexTerritoryPreview({ route, trailColor, height = 160, seed }: HexTerritoryPreviewProps) {
  const coords = route.coordinates ?? [];
  const lineColor = trailColor || route.trailColor || AuroraColors.primary;
  const rngSeed = hashString(seed ?? JSON.stringify(coords.slice(0, 3)));

  const content = useMemo(() => {
    const W = 400; // viewBox width — the SVG scales to fill the container
    const H = (height / 160) * 160;
    const rng = mulberry32(rngSeed);

    const hexW = Math.sqrt(3) * HEX_R;
    const rowH = 1.5 * HEX_R;
    const cols = Math.ceil(W / hexW) + 2;
    const rows = Math.ceil(H / rowH) + 2;

    // Two soft "claimed territory" cluster centers, placed deterministically.
    const clusterA = { x: W * (0.25 + rng() * 0.25), y: H * (0.3 + rng() * 0.3) };
    const clusterB = { x: W * (0.6 + rng() * 0.3), y: H * (0.4 + rng() * 0.4) };
    const clusterRadius = Math.min(W, H) * 0.32;

    const hexes: { key: string; points: string; fill: string; opacity: number }[] = [];
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const cx = col * hexW + (row % 2 !== 0 ? hexW / 2 : 0);
        const cy = row * rowH;
        if (cx < -hexW || cx > W + hexW || cy < -HEX_R || cy > H + HEX_R) continue;

        const dA = Math.hypot(cx - clusterA.x, cy - clusterA.y);
        const dB = Math.hypot(cx - clusterB.x, cy - clusterB.y);
        const jitter = rng();

        let fill = AuroraColors.surface;
        let opacity = 0.35;

        if (dA < clusterRadius && jitter > 0.22) {
          fill = ZONE_COLORS.mine[jitter > 0.6 ? 0 : 1];
          opacity = 0.55 + (1 - dA / clusterRadius) * 0.3;
        } else if (dB < clusterRadius * 0.8 && jitter > 0.3) {
          fill = ZONE_COLORS.rival[jitter > 0.65 ? 0 : 1];
          opacity = 0.4 + (1 - dB / (clusterRadius * 0.8)) * 0.3;
        }

        hexes.push({ key: `${row}-${col}`, points: hexPoints(cx, cy, HEX_R - 1.5), fill, opacity });
      }
    }

    // Project the real route into the same viewBox so it reads as "this hex
    // territory, with your run drawn through it" rather than a fake map.
    let polyline = '';
    let endPoint: { x: number; y: number } | null = null;
    if (coords.length > 1) {
      const lats = coords.map((c) => c.latitude);
      const lngs = coords.map((c) => c.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const padding = 28;
      const spanLat = maxLat - minLat || 1;
      const spanLng = maxLng - minLng || 1;
      const scale = Math.min((W - padding * 2) / spanLng, (H - padding * 2) / spanLat);
      const offX = (W - spanLng * scale) / 2;
      const offY = (H - spanLat * scale) / 2;

      const projected = coords.map((c) => ({
        x: offX + (c.longitude - minLng) * scale,
        y: H - (offY + (c.latitude - minLat) * scale), // flip: lat up = y down
      }));
      polyline = projected.map((p) => `${p.x},${p.y}`).join(' ');
      endPoint = projected[projected.length - 1];
    }

    return { W, H, hexes, polyline, endPoint };
  }, [coords, height, rngSeed]);

  return (
    <View style={[styles.container, { height }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${content.W} ${content.H}`} preserveAspectRatio="xMidYMid slice">
        <Polygon points={`0,0 ${content.W},0 ${content.W},${content.H} 0,${content.H}`} fill={AuroraColors.mapBase} />
        {content.hexes.map((h) => (
          <Polygon key={h.key} points={h.points} fill={h.fill} opacity={h.opacity} stroke={AuroraColors.background} strokeWidth={1.5} />
        ))}
        {content.polyline && (
          <>
            <Polyline points={content.polyline} fill="none" stroke={lineColor} strokeWidth={7} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={content.polyline} fill="none" stroke={lineColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {content.endPoint && (
          <Circle cx={content.endPoint.x} cy={content.endPoint.y} r={6} fill={AuroraColors.text} stroke={lineColor} strokeWidth={3} />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
});
