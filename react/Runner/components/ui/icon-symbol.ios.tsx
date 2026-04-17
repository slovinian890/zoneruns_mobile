import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export type IconSymbolName = SymbolViewProps['name'];

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}

// Export commonly used achievement icons mapping (for displaying achievement icons from database)
export const ACHIEVEMENT_ICONS: Record<string, IconSymbolName> = {
  'faPersonRunning': 'figure.run',
  'faMedal': 'medal.fill',
  'faTrophy': 'trophy.fill',
  'faChartLine': 'chart.line.uptrend.xyaxis',
  'faStar': 'star.fill',
  'faBolt': 'bolt.fill',
  'faStopwatch': 'stopwatch',
  'faFire': 'flame.fill',
  'faClock': 'clock.fill',
  'faMountain': 'mountain.2.fill',
  'faHeart': 'heart.fill',
};

/**
 * Get the IconSymbol name from an achievement icon string (stored in database)
 */
export function getAchievementIconName(dbIcon: string): IconSymbolName {
  return ACHIEVEMENT_ICONS[dbIcon] || 'star.fill';
}
