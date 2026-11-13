import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { AuroraColors } from '@/constants/theme';
import { RouteData } from '@/services/supabase';
import { isLoopReady, projectRoute } from '@/services/territoryService';

interface HexTerritoryPreviewProps {
  route: RouteData;
  trailColor?: string;
  height?: number;
  /** Deterministic seed so the same run always renders the same hex texture. */
  seed?: string;
  /**
   * Whether this run actually closed a loop and claimed territory. When
   * known (e.g. the post-run screen has the real claim result), pass it
   * explicitly. When omitted (e.g. the run history list, which has no claim
   * result handy), it falls back to the same closed-loop geometry check the
   * server uses (`isLoopReady`) so the shown shape still matches reality.
   */
  claimed?: boolean;
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

export function HexTerritoryPreview({ route, trailColor, height = 160, seed, claimed }: HexTerritoryPreviewProps) {
  const coords = route.coordinates ?? [];
  const lineColor = trailColor || route.trailColor || AuroraColors.primary;
  const rngSeed = hashString(seed ?? JSON.stringify(coords.slice(0, 3)));
  // Same closed-loop rule the server applies when claiming territory (see
  // claim_territory_from_run in supabase/migrations/002_territory_system.sql)
  // so a run with no claim result handy still only shows a fill when it
  // would actually have been claimed, not for every path drawn.
  const isClaimed = claimed ?? isLoopReady(coords);

  const content = useMemo(() => {
    const W = 400; // viewBox width — the SVG scales to fill the container
    const H = (height / 160) * 160;
    const rng = mulberry32(rngSeed);

    const hexW = Math.sqrt(3) * HEX_R;
    const rowH = 1.5 * HEX_R;
    const cols = Math.ceil(W / hexW) + 2;
    const rows = Math.ceil(H / rowH) + 2;

    // Plain background texture (graph-paper style) — every hex gets the same
    // neutral fill with a slight opacity jitter for texture only. It no
    // longer stands in for "claimed territory": that's drawn below as the
    // real captured polygon, not a randomly placed cluster.
    const hexes: { key: string; points: string; opacity: number }[] = [];
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const cx = col * hexW + (row % 2 !== 0 ? hexW / 2 : 0);
        const cy = row * rowH;
        if (cx < -hexW || cx > W + hexW || cy < -HEX_R || cy > H + HEX_R) continue;

        hexes.push({ key: `${row}-${col}`, points: hexPoints(cx, cy, HEX_R - 1.5), opacity: 0.12 + rng() * 0.08 });
      }
    }

    // Project the real route into the same viewBox so both the line and the
    // claimed-area fill below are the actual run shape, not a fake map.
    let polyline = '';
    let polygon = '';
    let endPoint: { x: number; y: number } | null = null;
    const projected = projectRoute(coords, W, H);
    if (projected.length > 1) {
      const pointsStr = projected.map((p) => `${p.x},${p.y}`).join(' ');
      polyline = pointsStr;
      // Same ring the server builds in claim_territory_from_run (the path,
      // closed back to its own start) — <Polygon> closes it automatically.
      polygon = pointsStr;
      endPoint = projected[projected.length - 1];
    }

    return { W, H, hexes, polyline, polygon, endPoint };
  }, [coords, height, rngSeed]);

  return (
    <View style={[styles.container, { height }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${content.W} ${content.H}`} preserveAspectRatio="xMidYMid slice">
        <Polygon points={`0,0 ${content.W},0 ${content.W},${content.H} 0,${content.H}`} fill={AuroraColors.mapBase} />
        {content.hexes.map((h) => (
          <Polygon key={h.key} points={h.points} fill={AuroraColors.surface} opacity={h.opacity} stroke={AuroraColors.background} strokeWidth={1.5} />
        ))}
        {isClaimed && content.polygon && (
          <Polygon points={content.polygon} fill={lineColor} fillOpacity={0.32} stroke={lineColor} strokeWidth={2} strokeOpacity={0.7} />
        )}
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
