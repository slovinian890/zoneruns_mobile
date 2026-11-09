import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { AuroraColors, BorderRadius, Shadows, Spacing } from '@/constants/theme';

// Reanimated 4.1.6's CSS transitions reject a custom cubicBezier() marker here —
// it round-trips through an internal 'cubic-bezier(...)' string that its own
// validator then refuses (only the named keywords below are accepted). Use the
// closest predefined keyword instead of fighting that bug.
const EASE_IN_OUT = 'ease-in-out' as const;

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Called with the trimmed query, debounced while typing and immediately on submit/clear. */
  onSearch: (query: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  debounceMs?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared glass pill search field (Friends / Groups / Messages): frosted
 * blur + translucent surface like every other glass panel in the app, live
 * debounced search instead of a separate button, a focus glow + ring, and a
 * clear button that only appears once there's something to clear.
 */
export function SearchBar({ value, onChangeText, onSearch, placeholder, autoFocus, debounceMs = 300, style }: SearchBarProps) {
  const reducedMotion = useReducedMotion();

  const [focused, setFocused] = useState(false);
  const [clearPressed, setClearPressed] = useState(false);

  // Debounce reads the latest onSearch via a ref so a parent re-render
  // (new inline function identity) can't restart or desync the timer.
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      onSearchRef.current('');
      return;
    }
    const id = setTimeout(() => onSearchRef.current(trimmed), debounceMs);
    return () => clearTimeout(id);
  }, [value, debounceMs]);

  const handleClear = () => {
    onChangeText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: BorderRadius.full,
          ...Shadows.glowPrimary,
          opacity: focused ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: '220ms',
          transitionTimingFunction: EASE_IN_OUT,
        }}
      />
      <Animated.View
        style={{
          borderRadius: BorderRadius.full,
          overflow: 'hidden',
          borderWidth: 1.5,
          borderColor: focused ? AuroraColors.primary : AuroraColors.border,
          borderTopColor: focused ? AuroraColors.primary : AuroraColors.highlight,
          transform: [{ scale: !reducedMotion && focused ? 1.015 : 1 }],
          transitionProperty: reducedMotion ? ['borderColor', 'borderTopColor'] : ['borderColor', 'borderTopColor', 'transform'],
          transitionDuration: '200ms',
          transitionTimingFunction: EASE_IN_OUT,
        }}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.tint]} />
        <View style={styles.row}>
          <IconSymbol name="magnifyingglass" size={16} color={focused ? AuroraColors.primary : AuroraColors.textMuted} />
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={AuroraColors.textFaint}
            returnKeyType="search"
            onSubmitEditing={() => onSearchRef.current(value.trim())}
            autoFocus={autoFocus}
          />
          {value.length > 0 && (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
              <Pressable
                onPress={handleClear}
                onPressIn={() => setClearPressed(true)}
                onPressOut={() => setClearPressed(false)}
                hitSlop={10}
                pressRetentionOffset={12}>
                <Animated.View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: AuroraColors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: AuroraColors.border,
                    transform: [{ scale: clearPressed ? 0.88 : 1 }],
                    transitionProperty: 'transform',
                    transitionDuration: '120ms',
                    transitionTimingFunction: EASE_IN_OUT,
                  }}>
                  <IconSymbol name="xmark" size={11} color={AuroraColors.textMuted} />
                </Animated.View>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  tint: {
    backgroundColor: AuroraColors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    fontSize: 16,
    color: AuroraColors.text,
  },
});
