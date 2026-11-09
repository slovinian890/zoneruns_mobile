import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AuroraColors, Spacing } from '@/constants/theme';

interface Stat {
  value: string;
  label: string;
}

interface StatBlockProps {
  stats: Stat[];
}

/**
 * A row of big numbers with hairline dividers between them — the app's one
 * way to show 2-4 stats side by side (distance/time/pace, territory area,
 * follower counts…), replacing grey boxed stat tiles.
 */
export function StatBlock({ stats }: StatBlockProps) {
  return (
    <View style={styles.row}>
      {stats.map((stat, i) => (
        <Fragment key={stat.label}>
          {i > 0 && <View style={styles.divider} />}
          <View style={styles.item}>
            <ThemedText type="h2" style={styles.value}>
              {stat.value}
            </ThemedText>
            <ThemedText style={styles.label}>{stat.label}</ThemedText>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: AuroraColors.border,
  },
  value: {
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: AuroraColors.textFaint,
    marginTop: Spacing.xs / 2,
  },
});
