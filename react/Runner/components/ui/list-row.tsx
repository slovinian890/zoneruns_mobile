import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { AuroraColors, Spacing } from '@/constants/theme';

interface ListRowProps {
  avatarUri?: string | null;
  avatarActive?: boolean;
  /** Overrides the default Avatar — for a color dot (groups) or rank number instead. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  unread?: boolean;
  trailing?: ReactNode;
  onPress?: () => void;
}

/**
 * One row shape for every list in the app — people, conversations, groups,
 * leaderboard entries — so avatar sizing, spacing and the hairline all match
 * regardless of which screen it's in.
 */
export function ListRow({ avatarUri, avatarActive, leading, title, subtitle, unread, trailing, onPress }: ListRowProps) {
  const [pressed, setPressed] = useState(false);

  const row = (
    <Animated.View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
        opacity: onPress && pressed ? 0.6 : 1,
        transitionProperty: 'opacity',
        transitionDuration: '100ms',
        transitionTimingFunction: 'ease-out',
      }}>
      {leading ?? <Avatar uri={avatarUri} active={avatarActive} />}
      <View style={styles.textBlock}>
        <ThemedText type={unread ? 'bodyBold' : 'body'} numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText type="bodySmall" variant="muted" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {trailing}
    </Animated.View>
  );

  if (!onPress) return row;

  return (
    <Pressable onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}>
      {row}
    </Pressable>
  );
}

export const listRowDividerStyle = {
  height: StyleSheet.hairlineWidth,
  backgroundColor: AuroraColors.border,
};

const styles = StyleSheet.create({
  textBlock: {
    flex: 1,
    gap: 2,
  },
});
