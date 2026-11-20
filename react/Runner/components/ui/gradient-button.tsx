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
 * Primary action button for the running flow. Primary and danger are both
 * full-pill, filled with a diagonal gradient + colored glow (Start/Pause and
 * Stop & save read as equally weighted CTAs); outline keeps a flat surface
 * with just a border so the glow stays reserved for filled actions.
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
  // A neon spark on the rim, press-in only — the one warm accent against an
  // otherwise all-cool palette, kept rare so it still reads as a spark.
  const neonEdgeStyle = useAnimatedStyle(() => ({
    opacity: pressed.value,
    transform: [{ scale: 0.97 + pressed.value * 0.035 }],
  }));

  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isFilled = isPrimary || isDanger;
  // A light catch at the top-left corner so the fill reads as a dimensional,
  // brushed surface rather than a flat glowing LED.
  const gradientHighlight = isDanger ? '#FF9690' : '#8FE1EC';
  const gradientFrom = isDanger ? AuroraColors.danger : AuroraColors.primary;
  const gradientTo = isDanger ? AuroraColors.accentTerracotta : AuroraColors.primaryPressed;
  const foregroundColor = isDanger ? AuroraColors.text : isPrimary ? AuroraColors.onPrimary : AuroraColors.primary;
  const glow = isDanger ? Shadows.glowDanger : isPrimary ? Shadows.glowPrimary : Shadows.card;

  return (
    <Animated.View style={[animatedStyle, glow, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onLayout={onLayout}
        onPressIn={() => { pressed.value = withTiming(1, { duration: 100 }); }}
        onPressOut={() => { pressed.value = withTiming(0, { duration: 150 }); }}
        style={[
          styles.base,
          !isFilled && { borderWidth: 1.5, borderColor: AuroraColors.primary, backgroundColor: AuroraColors.surface },
          disabled && styles.disabled,
        ]}>
        {isFilled && size.width > 0 && (
          <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id="btnFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={gradientHighlight} />
                <Stop offset="45%" stopColor={gradientFrom} />
                <Stop offset="100%" stopColor={gradientTo} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#btnFill)" />
          </Svg>
        )}
        <View style={styles.content}>
          <IconSymbol name={icon} size={20} color={foregroundColor} />
          <ThemedText type="bodyBold" lightColor={foregroundColor} darkColor={foregroundColor}>
            {label}
          </ThemedText>
        </View>
        <Animated.View pointerEvents="none" style={[styles.neonEdge, neonEdgeStyle]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
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
  neonEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: AuroraColors.neon,
    shadowColor: AuroraColors.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },
});
