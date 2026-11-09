import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { AuroraColors, Spacing } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconSymbolName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * General-purpose action button (follow/join/save/confirm — anywhere that
 * isn't the one big recording-screen CTA, which stays a GradientButton).
 * primary: chartreuse fill. secondary: glass panel. ghost: text only.
 */
export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, style }: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';

  const textColor = isPrimary ? AuroraColors.onPrimary : AuroraColors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => {
        setPressed(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => setPressed(false)}
      style={style}>
      <Animated.View
        style={{
          transform: [{ scale: pressed ? 0.96 : 1 }],
          opacity: disabled || loading ? 0.5 : 1,
          transitionProperty: 'transform',
          transitionDuration: '120ms',
          transitionTimingFunction: 'ease-out',
        }}>
        <View
          style={[
            styles.base,
            isPrimary && { backgroundColor: AuroraColors.primary },
            isSecondary && styles.secondaryBorder,
          ]}>
          {isSecondary && (
            <>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
              <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: AuroraColors.surface }]} />
            </>
          )}
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator size="small" color={textColor} />
            ) : (
              <>
                {icon && <IconSymbol name={icon} size={18} color={textColor} />}
                <ThemedText type="bodyBold" lightColor={textColor} darkColor={textColor}>
                  {label}
                </ThemedText>
              </>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: Spacing.lg,
  },
  secondaryBorder: {
    borderWidth: 1,
    borderColor: AuroraColors.border,
    borderTopColor: AuroraColors.highlight,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
