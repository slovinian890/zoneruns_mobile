// Icon component using FontAwesome icons from @expo/vector-icons

import FontAwesome from '@expo/vector-icons/FontAwesome';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

// Icon library type
type IconLibrary = 'fa' | 'fa5' | 'fa6' | 'ion' | 'material';

// Mapping from SF Symbol names to icon library + icon name
type IconConfig = {
  library: IconLibrary;
  name: string;
};

const ICON_MAPPING: Record<string, IconConfig> = {
  // Navigation & UI
  'house.fill': { library: 'fa', name: 'home' },
  'person.fill': { library: 'fa', name: 'user' },
  'person.2.fill': { library: 'fa', name: 'users' },
  'gearshape.fill': { library: 'fa', name: 'cog' },
  'chevron.left': { library: 'fa', name: 'chevron-left' },
  'chevron.right': { library: 'fa', name: 'chevron-right' },
  'xmark': { library: 'fa', name: 'times' },
  'plus': { library: 'fa', name: 'plus' },
  'magnifyingglass': { library: 'fa', name: 'search' },
  'checkmark': { library: 'fa', name: 'check' },
  'checkmark.circle.fill': { library: 'fa', name: 'check-circle' },
  'exclamationmark.triangle.fill': { library: 'fa', name: 'exclamation-triangle' },
  
  // Running & Fitness
  'figure.run': { library: 'fa5', name: 'running' },
  'flame.fill': { library: 'fa5', name: 'fire' },
  'arrow.up.right': { library: 'fa', name: 'arrow-up' },
  'stopwatch': { library: 'fa5', name: 'stopwatch' },
  'chart.line.uptrend.xyaxis': { library: 'fa', name: 'line-chart' },
  
  // Social & Feed
  'heart': { library: 'fa', name: 'heart-o' },
  'heart.fill': { library: 'fa', name: 'heart' },
  'bubble.left': { library: 'fa', name: 'comment-o' },
  'bubble.left.fill': { library: 'fa', name: 'comment' },
  'newspaper.fill': { library: 'fa', name: 'newspaper-o' },
  'square.and.arrow.up': { library: 'fa', name: 'share' },
  
  // Media & Actions
  'play.fill': { library: 'fa', name: 'play' },
  'stop.fill': { library: 'fa', name: 'stop' },
  'play.circle.fill': { library: 'fa', name: 'play-circle' },
  'camera.fill': { library: 'fa', name: 'camera' },
  'photo.fill': { library: 'fa', name: 'image' },
  'trash.fill': { library: 'fa', name: 'trash' },
  
  // Auth & Security
  'envelope.fill': { library: 'fa', name: 'envelope' },
  'lock.fill': { library: 'fa', name: 'lock' },
  'lock.shield.fill': { library: 'fa5', name: 'shield-alt' },
  'key.fill': { library: 'fa', name: 'key' },
  'eye.fill': { library: 'fa', name: 'eye' },
  'eye.slash.fill': { library: 'fa', name: 'eye-slash' },
  'arrow.right.square.fill': { library: 'fa', name: 'sign-out' },
  
  // Achievements & Badges
  'trophy.fill': { library: 'fa', name: 'trophy' },
  'star.fill': { library: 'fa', name: 'star' },
  'medal.fill': { library: 'fa5', name: 'medal' },
  'bolt.fill': { library: 'fa', name: 'bolt' },
  'mountain.2.fill': { library: 'fa5', name: 'mountain' },
  'clock.fill': { library: 'fa', name: 'clock-o' },
  
  // Map & Location
  'location.fill': { library: 'fa', name: 'map-marker' },
  'map.fill': { library: 'fa', name: 'map' },
  
  // Lists & Navigation
  'list.bullet': { library: 'fa', name: 'list' },
  'list.bullet.rectangle': { library: 'fa', name: 'list-alt' },
  
  // Misc
  'paperplane.fill': { library: 'fa', name: 'paper-plane' },
  'chevron.left.forwardslash.chevron.right': { library: 'fa', name: 'code' },
  'info.circle.fill': { library: 'fa', name: 'info-circle' },
  'questionmark.circle.fill': { library: 'fa', name: 'question-circle' },
};

// Default fallback icon
const DEFAULT_ICON: IconConfig = { library: 'fa', name: 'circle' };

export type IconSymbolName = keyof typeof ICON_MAPPING | string;

interface IconSymbolProps {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}

/**
 * A cross-platform icon component that maps SF Symbol names to FontAwesome icons.
 * Falls back to a circle if the icon is not found in the mapping.
 */
export function IconSymbol({ name, size = 24, color, style }: IconSymbolProps) {
  const iconConfig = ICON_MAPPING[name] || DEFAULT_ICON;
  
  switch (iconConfig.library) {
    case 'fa':
      return (
        <FontAwesome
          name={iconConfig.name as ComponentProps<typeof FontAwesome>['name']}
          size={size}
          color={color as string}
          style={style}
        />
      );
    case 'fa5':
      return (
        <FontAwesome5
          name={iconConfig.name as ComponentProps<typeof FontAwesome5>['name']}
          size={size}
          color={color as string}
          style={style}
        />
      );
    case 'fa6':
      return (
        <FontAwesome6
          name={iconConfig.name as ComponentProps<typeof FontAwesome6>['name']}
          size={size}
          color={color as string}
          style={style}
        />
      );
    case 'ion':
      return (
        <Ionicons
          name={iconConfig.name as ComponentProps<typeof Ionicons>['name']}
          size={size}
          color={color as string}
          style={style}
        />
      );
    case 'material':
      return (
        <MaterialIcons
          name={iconConfig.name as ComponentProps<typeof MaterialIcons>['name']}
          size={size}
          color={color as string}
          style={style}
        />
      );
    default:
      return (
        <FontAwesome
          name="circle"
          size={size}
          color={color as string}
          style={style}
        />
      );
  }
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
