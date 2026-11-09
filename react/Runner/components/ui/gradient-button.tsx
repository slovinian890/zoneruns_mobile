import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { AuroraColors, BorderRadius, Shadows, Spacing } from '@/constants/theme';

type GradientButtonVariant = 'primary' | 'outline' | 'danger';

interface GradientButtonProps {
  label: string;
  icon: IconSymbolName;
  onPress: () => void;
  variant?: GradientButtonVariant;
  style?: ViewStyle;
  disabled?: boolean;
}

/**
 * Primary action button for the running flow. Primary variant gets a
 * diagonal brand gradient + colored glow (the app's one signature CTA
 * treatment); outline/danger keep a flat surface with just a border so the
 * glow stays reserved for the single most important action on screen.
 */
export function GradientButton({ label, icon, onPress, variant = 'primary', style, disabled }: GradientButtonProps) {
  const pressed = useSharedValue(0);
  // react-native-svg's percentage width/height can't reliably resolve against
  // a parent whose own size comes from content (this Pressable has no
  // explicit height, just padding) — measure it and feed the gradient exact
  // pixels instead.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.04 }],
  }));

  const isPrimary = variant === 'primary';
  const borderColor = variant === 'danger' ? '#E53935' : AuroraColors.primary;
  const textColor = variant === 'danger' ? '#E53935' : AuroraColors.primary;

  return (
    <Animated.View style={[animatedStyle, isPrimary ? Shadows.glowPrimary : Shadows.card, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onLayout={onLayout}
        onPressIn={() => { pressed.value = withTiming(1, { duration: 100 }); }}
        onPressOut={() => { pressed.value = withTiming(0, { duration: 150 }); }}
        style={[
          styles.base,
          !isPrimary && { borderWidth: 1.5, borderColor, backgroundColor: AuroraColors.surface },
          disabled && styles.disabled,
        ]}>
        {isPrimary && size.width > 0 && (
          <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id="btnFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={AuroraColors.primary} />
                <Stop offset="100%" stopColor={AuroraColors.accent} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#btnFill)" />
          </Svg>
        )}
        <View style={styles.content}>
          <IconSymbol name={icon} size={20} color={isPrimary ? AuroraColors.onPrimary : textColor} />
          <ThemedText
            type="bodyBold"
            lightColor={isPrimary ? AuroraColors.onPrimary : textColor}
            darkColor={isPrimary ? AuroraColors.onPrimary : textColor}>
            {label}
          </ThemedText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  disabled: {
    opacity: 0.6,
  },
});
