import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { ThemedText } from '@/components/themed-text';
import { AuroraColors, Shadows, Spacing } from '@/constants/theme';

/** Height of the bar itself, not counting the safe-area inset below it — screens pad their scroll content by this + inset. */
export const TAB_BAR_HEIGHT = 64;

function TabButton({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  focused: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={styles.button}
      hitSlop={4}>
      <Animated.View
        style={{
          alignItems: 'center',
          gap: 2,
          transform: [{ scale: pressed ? 0.9 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: '120ms',
          transitionTimingFunction: 'ease-out',
        }}>
        {focused && <View style={styles.activeGlow} pointerEvents="none" />}
        {icon}
        <ThemedText
          type="caption"
          style={styles.label}
          lightColor={focused ? AuroraColors.primary : AuroraColors.textFaint}
          darkColor={focused ? AuroraColors.primary : AuroraColors.textFaint}>
          {label}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Floating glass tab bar — replaces React Navigation's stock bottom bar.
 * Screens scroll behind it (TAB_BAR_HEIGHT + bottom inset of clearance is
 * their job to add to contentContainerStyle).
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + Spacing.sm }]} pointerEvents="box-none">
      <View style={[styles.bar, Shadows.floating]}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.tint]} />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // Expo Router's `href: null` (hide-from-tab-bar) only takes effect
          // through its own default tab bar; a fully custom one like this has
          // to replicate the check. By the time it reaches here `href` itself
          // is already stripped, so check the side effect it leaves instead.
          if (options.tabBarItemStyle && (options.tabBarItemStyle as { display?: string }).display === 'none') {
            return null;
          }
          const focused = state.index === index;
          const label = (options.title ?? route.name) as string;
          const color = focused ? AuroraColors.primary : AuroraColors.textFaint;
          const icon = options.tabBarIcon?.({ focused, color, size: 24 });

          return (
            <TabButton
              key={route.key}
              label={label}
              icon={icon}
              focused={focused}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  bar: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AuroraColors.border,
    borderTopColor: AuroraColors.highlight,
  },
  tint: {
    backgroundColor: AuroraColors.surface,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeGlow: {
    position: 'absolute',
    top: -8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AuroraColors.primarySoft,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
  },
});
