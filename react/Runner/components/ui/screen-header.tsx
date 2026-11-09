import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { AuroraColors, Spacing } from '@/constants/theme';

export interface ScreenHeaderAction {
  icon: IconSymbolName;
  onPress: () => void;
  badge?: number;
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ScreenHeaderAction[];
  /** Extra content rendered below the title row (e.g. a SegmentedControl). */
  children?: ReactNode;
}

function HeaderIconButton({ icon, onPress, badge }: ScreenHeaderAction) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={8}>
      <Animated.View
        style={{
          transform: [{ scale: pressed ? 0.92 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: '120ms',
          transitionTimingFunction: 'ease-out',
        }}>
        <View style={styles.iconBtn}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.iconBtnTint]} />
          <IconSymbol name={icon} size={18} color={AuroraColors.text} />
          {!!badge && (
            <View style={styles.badge}>
              <ThemedText type="caption" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
                {badge > 9 ? '9+' : badge}
              </ThemedText>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The app's one screen-top treatment: big semibold title, optional muted
 * subtitle, round glass icon buttons for actions, and a hairline that fades
 * out instead of a hard divider line.
 */
export function ScreenHeader({ title, subtitle, onBack, actions, children }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={styles.row}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={22} color={AuroraColors.text} />
          </Pressable>
        )}
        <View style={styles.titleBlock}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle && (
            <ThemedText style={styles.subtitle} variant="muted">
              {subtitle}
            </ThemedText>
          )}
        </View>
        {actions?.map((action, i) => <HeaderIconButton key={i} {...action} />)}
      </View>
      {children}
      <LinearGradient
        colors={[AuroraColors.border, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backBtn: {
    padding: 4,
    marginLeft: -4,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: AuroraColors.text,
  },
  subtitle: {
    fontVariant: ['tabular-nums'],
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AuroraColors.border,
    borderTopColor: AuroraColors.highlight,
  },
  iconBtnTint: {
    backgroundColor: AuroraColors.surface,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: AuroraColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  fade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
  },
});
