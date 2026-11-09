import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { AuroraColors, BorderRadius, Spacing } from '@/constants/theme';

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

interface Segment {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
}

/**
 * Glass pill tab switcher (Sledim/Sledilci/search, Moje/Odkrij/Lestvica, …)
 * — a sliding chartreuse pill under the active label instead of each segment
 * flipping its own background.
 */
export function SegmentedControl({ segments, value, onChange }: SegmentedControlProps) {
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);

  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    x.set(withTiming(l.x, { duration: 250, easing: EASE_IN_OUT }));
    w.set(withTiming(l.width, { duration: 250, easing: EASE_IN_OUT }));
  }, [value, layouts, x, w]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    width: w.get(),
  }));

  const handleLayout = (key: string) => (e: LayoutChangeEvent) => {
    const { x: lx, width } = e.nativeEvent.layout;
    setLayouts((prev) => ({ ...prev, [key]: { x: lx, width } }));
    if (key === value && w.get() === 0) {
      x.set(lx);
      w.set(width);
    }
  };

  return (
    <View style={styles.wrap}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.tint]} />
      {layouts[value] && <Animated.View style={[styles.pill, pillStyle]} />}
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            onLayout={handleLayout(seg.key)}
            onPress={() => {
              if (seg.key !== value) Haptics.selectionAsync();
              onChange(seg.key);
            }}
            style={styles.segment}
            hitSlop={4}>
            <ThemedText
              type="bodyBold"
              lightColor={active ? AuroraColors.onPrimary : AuroraColors.textMuted}
              darkColor={active ? AuroraColors.onPrimary : AuroraColors.textMuted}>
              {seg.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AuroraColors.border,
    borderTopColor: AuroraColors.highlight,
    padding: 4,
  },
  tint: {
    backgroundColor: AuroraColors.surface,
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: BorderRadius.full,
    backgroundColor: AuroraColors.primary,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
