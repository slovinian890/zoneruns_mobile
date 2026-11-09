import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

import { AuroraColors, BorderRadius, Shadows, Spacing } from '@/constants/theme';

interface GlassCardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  /** Inner content padding. Defaults to the standard card padding (16). */
  padding?: number;
  /** Makes the whole card a press target with the house press-scale feedback. */
  onPress?: () => void;
  disabled?: boolean;
}

/**
 * The app's one card surface: translucent glass over the ambient background,
 * a hairline border, and a brighter 1px top edge to catch a hint of light —
 * replaces every flat `backgroundColor: colors.card` panel.
 */
export function GlassCard({ children, style, padding = Spacing.md, onPress, disabled }: GlassCardProps) {
  const [pressed, setPressed] = useState(false);

  const panel = (
    <View style={[styles.wrap, Shadows.card, { padding }, !onPress && style]}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.tint]} />
      <View style={styles.content}>{children}</View>
    </View>
  );

  if (!onPress) return panel;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={style}>
      <Animated.View
        style={{
          transform: [{ scale: pressed ? 0.98 : 1 }],
          opacity: disabled ? 0.5 : 1,
          transitionProperty: 'transform',
          transitionDuration: '120ms',
          transitionTimingFunction: 'ease-out',
        }}>
        {panel}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: BorderRadius.large + 4, // 20
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AuroraColors.border,
    borderTopColor: AuroraColors.highlight,
  },
  tint: {
    backgroundColor: AuroraColors.surface,
  },
  content: {
    // BlurView/tint are absolute siblings behind this; content just needs to
    // sit above them in paint order, no extra positioning required.
  },
});
