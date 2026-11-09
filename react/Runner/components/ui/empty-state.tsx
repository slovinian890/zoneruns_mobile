import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { AuroraColors, Shadows, Spacing } from '@/constants/theme';

interface EmptyStateProps {
  icon: IconSymbolName;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

/**
 * The app's one empty-list treatment — a glowing icon badge over a title +
 * muted subtitle, with an optional primary CTA. Used by every empty list
 * (no runs yet, no followers, no messages, no groups…).
 */
export function EmptyState({ icon, title, subtitle, ctaLabel, onPressCta }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.badge, Shadows.glowPrimary]}>
        <IconSymbol name={icon} size={36} color={AuroraColors.primary} />
      </View>
      <ThemedText type="h3" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle && (
        <ThemedText style={styles.subtitle} variant="muted">
          {subtitle}
        </ThemedText>
      )}
      {ctaLabel && onPressCta && (
        <Button label={ctaLabel} onPress={onPressCta} variant="primary" style={styles.cta} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AuroraColors.primarySoft,
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  cta: {
    marginTop: Spacing.lg,
    minWidth: 180,
  },
});
