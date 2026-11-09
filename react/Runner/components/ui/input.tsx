import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { AuroraColors, BorderRadius, Shadows, Spacing } from '@/constants/theme';

interface InputProps extends TextInputProps {
  multiline?: boolean;
  /** Leading glyph (person/envelope/lock…) — tints with focus like the border does. */
  icon?: IconSymbolName;
  /** Trailing slot — password show/hide, a unit label, etc. */
  rightElement?: ReactNode;
}

/**
 * The app's one text field: glass background, hairline border, and a
 * chartreuse focus ring + glow — same focus language as SearchBar, without
 * the search-specific debounce/clear behavior.
 */
export function Input({ style, multiline, icon, rightElement, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: BorderRadius.card,
          ...Shadows.glowPrimary,
          opacity: focused ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: '220ms',
          transitionTimingFunction: 'ease-in-out',
        }}
      />
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: BorderRadius.card,
          borderWidth: 1.5,
          overflow: 'hidden',
          paddingHorizontal: icon ? Spacing.md : 0,
          backgroundColor: AuroraColors.surfaceSolid,
          borderColor: focused ? AuroraColors.primary : AuroraColors.border,
          transform: [{ scale: !reducedMotion && focused ? 1.01 : 1 }],
          transitionProperty: reducedMotion ? ['borderColor'] : ['borderColor', 'transform'],
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-in-out',
        }}>
        {icon && (
          <IconSymbol name={icon} size={18} color={focused ? AuroraColors.primary : AuroraColors.textMuted} style={styles.leadingIcon} />
        )}
        <TextInput
          style={[styles.input, !icon && styles.inputNoIconPadding, multiline && styles.multiline, style]}
          placeholderTextColor={AuroraColors.textFaint}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {rightElement}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  leadingIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    fontSize: 16,
    color: AuroraColors.text,
  },
  inputNoIconPadding: {
    paddingHorizontal: Spacing.md,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
