import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { Typography, FontSizes, LineHeights } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'h1' | 'h2' | 'h3' | 'body' | 'bodyBold' | 'bodySmall' | 'caption' | 'link';
  variant?: 'primary' | 'secondary' | 'muted';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'body',
  variant = 'primary',
  ...rest
}: ThemedTextProps) {
  // Determine color based on variant
  const colorType = variant === 'secondary' ? 'textSecondary' : variant === 'muted' ? 'textMuted' : 'text';
  const color = useThemeColor({ light: lightColor, dark: darkColor }, colorType);

  // Determine font family based on type
  const fontFamily = ['h1', 'h2', 'h3'].includes(type) ? Typography.headline : Typography.body;

  return (
    <Text
      style={[
        { color, fontFamily },
        type === 'h1' ? styles.h1 : undefined,
        type === 'h2' ? styles.h2 : undefined,
        type === 'h3' ? styles.h3 : undefined,
        type === 'body' ? styles.body : undefined,
        type === 'bodyBold' ? styles.bodyBold : undefined,
        type === 'bodySmall' ? styles.bodySmall : undefined,
        type === 'caption' ? styles.caption : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  h1: {
    fontSize: FontSizes.h1,
    lineHeight: FontSizes.h1 * LineHeights.headline,
    fontWeight: '600', // Use weight differences, not color, for hierarchy
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: FontSizes.h2,
    lineHeight: FontSizes.h2 * LineHeights.headline,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: FontSizes.h3,
    lineHeight: FontSizes.h3 * LineHeights.headline,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * LineHeights.body,
    fontWeight: '400',
  },
  bodyBold: {
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * LineHeights.body,
    fontWeight: '600',
  },
  bodySmall: {
    fontSize: FontSizes.bodySmall,
    lineHeight: FontSizes.bodySmall * LineHeights.body,
    fontWeight: '400',
  },
  caption: {
    fontSize: FontSizes.caption,
    lineHeight: FontSizes.caption * LineHeights.body,
    fontWeight: '400',
  },
  link: {
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * LineHeights.body,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
