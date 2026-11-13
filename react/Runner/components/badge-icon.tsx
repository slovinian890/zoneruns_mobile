import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { AuroraColors } from '@/constants/theme';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'emerald' | 'legendary' | 'default';

interface TierSpec {
  from: string;
  to: string;
  rim: string;
  glow: string;
}

// Escalating rarity ladder for the Runner Rank badges (100/200/300/365/500/
// 1000 runs) — legendary deliberately reuses the app's one brand color so
// the 1000-run badge reads as the single rarest thing in the app, not just
// another palette swatch. 'default' covers every other achievement category,
// which doesn't have an inherent tier of its own. Every other shade below
// (bevel, shadow, dial) is derived from these two stops at render time.
const TIERS: Record<BadgeTier, TierSpec> = {
  bronze: { from: '#E3A368', to: '#8C4A1F', rim: '#F0C994', glow: '#D98C4A' },
  silver: { from: '#F1F4F8', to: '#9AA3AF', rim: '#FFFFFF', glow: '#C7CDD6' },
  gold: { from: '#F6DD8B', to: '#B8860B', rim: '#FFEFC2', glow: AuroraColors.accentAmber },
  platinum: { from: '#E3FBF4', to: '#5FB8A0', rim: '#FFFFFF', glow: '#8FE0CB' },
  emerald: { from: '#92EFB7', to: '#1F8A4D', rim: '#D6FFE6', glow: AuroraColors.success },
  legendary: { from: '#F3F8B8', to: AuroraColors.primary, rim: '#FFFFFF', glow: AuroraColors.primary },
  default: { from: '#F0CE7A', to: AuroraColors.accentTerracotta, rim: '#FFE4B8', glow: AuroraColors.accentAmber },
};

const LOCKED: TierSpec = { from: '#2B3320', to: '#1B2112', rim: '#3A4430', glow: 'transparent' };

/** Runner Rank requirement_value (100/200/.../1000) → tier, in ladder order. */
export function tierForRunnerRank(requirementValue: number): BadgeTier {
  const ladder: [number, BadgeTier][] = [
    [1000, 'legendary'],
    [500, 'emerald'],
    [365, 'platinum'],
    [300, 'gold'],
    [200, 'silver'],
    [100, 'bronze'],
  ];
  return ladder.find(([v]) => requirementValue >= v)?.[1] ?? 'bronze';
}

type Pt = [number, number];

function hexPoints(cx: number, cy: number, r: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (-90 + 60 * i);
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts;
}

const pointsAttr = (pts: Pt[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');
const pathAttr = (pts: Pt[]) => `M ${pts.map(([x, y]) => `${x},${y}`).join(' L ')}`;

function clamp255(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * Mixes two #rrggbb colors (t=0 → a, t=1 → b). Lets every tier's bevel,
 * shadow, and icon-dial tones fall out of its two existing stops instead of
 * hand-authoring a full highlight/mid/shadow/rim ramp per tier.
 */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = clamp255(ar + (br - ar) * t);
  const g = clamp255(ag + (bg - ag) * t);
  const bch = clamp255(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bch})`;
}
const lighten = (hex: string, amt: number) => mix(hex, '#FFFFFF', amt);
const darken = (hex: string, amt: number) => mix(hex, '#000000', amt);

interface BadgeIconProps {
  icon: IconSymbolName;
  tier?: BadgeTier;
  /** Dims the badge to a muted locked medal, ignoring tier colors. */
  locked?: boolean;
  /** 0-1 — draws a thin progress ring around a locked badge's rim. */
  progress?: number;
  size?: number;
}

/**
 * A hexagonal medallion (ties into the app's existing hexagon/territory
 * iconography) built like stamped metal rather than a flat glossy sticker:
 * a darker outer bezel ring, a beveled inner face with a crisp top-edge
 * light catch and a soft counter-shadow along the bottom, and a sunken dial
 * behind the glyph. The one "cool badge" visual every achievement in the
 * Badges screen renders through, locked or not.
 */
export function BadgeIcon({ icon, tier = 'default', locked, progress, size = 72 }: BadgeIconProps) {
  const spec = locked ? LOCKED : TIERS[tier];
  const uid = useMemo(() => `${tier}-${locked ? 'l' : 'u'}`, [tier, locked]);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.47;
  const faceR = outerR * 0.84;
  const plateR = size * 0.27;
  const ringR = size * 0.495;
  const circumference = 2 * Math.PI * ringR;
  const dash = Math.max(0, Math.min(1, progress ?? 0)) * circumference;
  const showRing = locked && !!progress && progress > 0;
  const bodyOpacity = locked ? 0.6 : 1;

  const outerHex = useMemo(() => hexPoints(cx, cy, outerR), [cx, cy, outerR]);
  const faceHex = useMemo(() => hexPoints(cx, cy, faceR), [cx, cy, faceR]);

  // Bevel/shadow/dial tones derived from each tier's two stops — keeps the
  // metal ramp tied to one source of truth instead of drifting out of sync.
  const bezelHi = lighten(spec.from, 0.1);
  const bezelLo = darken(spec.to, 0.4);
  const faceHi = lighten(spec.from, 0.2);
  const faceMid = mix(spec.from, spec.to, 0.5);
  const faceLo = darken(spec.to, 0.2);
  const plateHi = darken(spec.to, 0.25);
  const plateLo = darken(spec.to, 0.55);

  // A short, crisp line catching the light along the face's two upper edges
  // — tinted by the tier's own rim color — reads as a stamped bevel. This
  // replaces a soft centered "glossy sphere" ellipse, the single biggest
  // tell that an icon was rendered rather than designed.
  const topHighlight = pathAttr([faceHex[5], faceHex[0], faceHex[1]]);
  const bottomShadowEdge = pathAttr([faceHex[2], faceHex[3], faceHex[4]]);
  const highlightColor = locked ? '#FFFFFF' : spec.rim;
  const highlightPeak = locked ? 0.15 : 0.75;

  return (
    <View style={[styles.wrap, { width: size, height: size }, !locked && styles.lifted]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={`bezel-${uid}`} x1="15%" y1="5%" x2="85%" y2="95%">
            <Stop offset="0%" stopColor={bezelHi} stopOpacity={1} />
            <Stop offset="100%" stopColor={bezelLo} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id={`face-${uid}`} x1="20%" y1="0%" x2="80%" y2="100%">
            <Stop offset="0%" stopColor={faceHi} stopOpacity={1} />
            <Stop offset="55%" stopColor={faceMid} stopOpacity={1} />
            <Stop offset="100%" stopColor={faceLo} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id={`plate-${uid}`} cx="40%" cy="35%" r="70%">
            <Stop offset="0%" stopColor={plateHi} stopOpacity={0.92} />
            <Stop offset="100%" stopColor={plateLo} stopOpacity={0.96} />
          </RadialGradient>
          <LinearGradient
            id={`hi-${uid}`}
            x1={faceHex[5][0]} y1={faceHex[5][1]}
            x2={faceHex[1][0]} y2={faceHex[1][1]}
            gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={highlightColor} stopOpacity={0} />
            <Stop offset="50%" stopColor={highlightColor} stopOpacity={highlightPeak} />
            <Stop offset="100%" stopColor={highlightColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {!locked && (
          <>
            <Circle cx={cx} cy={cy} r={size * 0.6} fill={spec.glow} opacity={0.07} />
            <Circle cx={cx} cy={cy} r={size * 0.52} fill={spec.glow} opacity={0.12} />
          </>
        )}

        {showRing && (
          <>
            <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke={AuroraColors.border} strokeWidth={2.5} opacity={0.6} />
            <Circle
              cx={cx}
              cy={cy}
              r={ringR}
              fill="none"
              stroke={TIERS[tier].glow}
              strokeWidth={2.5}
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={0.9}
            />
          </>
        )}

        <G opacity={bodyOpacity}>
          <Polygon points={pointsAttr(outerHex)} fill={`url(#bezel-${uid})`} />
          <Polygon
            points={pointsAttr(faceHex)}
            fill={`url(#face-${uid})`}
            stroke="rgba(0, 0, 0, 0.35)"
            strokeWidth={1}
          />
          <Path d={bottomShadowEdge} stroke="rgba(0, 0, 0, 0.3)" strokeWidth={size * 0.022} strokeLinecap="round" fill="none" opacity={0.6} />
          <Path d={topHighlight} stroke={`url(#hi-${uid})`} strokeWidth={size * 0.028} strokeLinecap="round" fill="none" />
          <Circle cx={cx} cy={cy} r={plateR} fill={`url(#plate-${uid})`} stroke="rgba(0, 0, 0, 0.3)" strokeWidth={1} />
        </G>
      </Svg>

      <View style={[styles.iconOverlay, { opacity: bodyOpacity }]} pointerEvents="none">
        <IconSymbol
          name={icon}
          size={size * 0.33}
          color={locked ? AuroraColors.textFaint : AuroraColors.text}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifted: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  iconOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
