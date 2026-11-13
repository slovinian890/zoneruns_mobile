import { StyleSheet, View, TouchableOpacity, FlatList, RefreshControl, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatBlock } from '@/components/ui/stat-block';
import { TAB_BAR_HEIGHT } from '@/components/ui/floating-tab-bar';
import { HexTerritoryPreview } from '@/components/hex-territory-preview';
import { AuroraColors, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { getUserRuns, intervalToSeconds, deleteRun } from '@/services/runsService';
import { Run } from '@/services/supabase';

export default function RunsScreen() {
  useAmbientVariant('focus');
  const insets = useSafeAreaInsets();
  const usmerjevalnik = useRouter();
  const [teki, setTeki] = useState<Run[]>([]);
  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);

  useFocusEffect(
    useCallback(() => {
      naloziTeke();
    }, [])
  );

  const naloziTeke = async () => {
    try {
      const rezultat = await getUserRuns();
      setTeki(rezultat.data);
    } catch (napaka) {
      console.error('Napaka pri nalaganju tekov:', napaka);
    } finally {
      setNalaganje(false);
      setOsvezevanje(false);
    }
  };

  const osveziPodatke = () => {
    setOsvezevanje(true);
    naloziTeke();
  };

  const izbrisiTek = async (tekId: string) => {
    const rezultat = await deleteRun(tekId);
    if (rezultat.success) {
      setTeki((prej) => prej.filter((t) => t.id !== tekId));
    }
  };

  const mesecOznaka = new Date().toLocaleDateString('sl-SI', { month: 'long' }).toUpperCase();
  const skupnaRazdalja = teki.reduce((vsota, t) => vsota + Number(t.distance_km || 0), 0).toFixed(1);
  const stevilkaTekov = `${teki.length} ${teki.length === 1 ? 'tek' : teki.length === 2 ? 'teka' : teki.length === 3 || teki.length === 4 ? 'teki' : 'tekov'}`;

  const oblikujTrajanje = (interval: string | null): string => {
    if (!interval) return '0:00';
    const sekunde = intervalToSeconds(interval);
    const ure = Math.floor(sekunde / 3600);
    const minute = Math.floor((sekunde % 3600) / 60);
    const sek = sekunde % 60;
    if (ure > 0) {
      return `${ure}:${minute.toString().padStart(2, '0')}:${sek.toString().padStart(2, '0')}`;
    }
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

  const izrisiTek = ({ item }: { item: Run }) => {
    const datumVrstica = new Date(item.run_date)
      .toLocaleDateString('sl-SI', { weekday: 'short', day: 'numeric', month: 'short' })
      .toUpperCase()
      .replace(/\.$/, '');
    const uraVrstica =
      item.run_time ??
      new Date(item.created_at).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });

    return (
      <GlassCard style={styles.runCard}>
        <View style={styles.runHeader}>
          <View style={{ flex: 1 }}>
            <ThemedText type="caption" variant="muted" style={styles.dateLine}>
              {datumVrstica} · {uraVrstica}
            </ThemedText>
            <ThemedText type="h3">{item.title || 'Tek'}</ThemedText>
          </View>
          {item.calories ? (
            <View style={styles.badge}>
              <IconSymbol name="flame.fill" size={12} color={AuroraColors.onPrimary} />
              <ThemedText type="caption" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary} style={styles.badgeText}>
                {item.calories} kal
              </ThemedText>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Izbriši tek', 'Ste prepričani?', [
                { text: 'Prekliči', style: 'cancel' },
                { text: 'Izbriši', style: 'destructive', onPress: () => izbrisiTek(item.id) },
              ])
            }
            hitSlop={8}
            style={styles.deleteButton}>
            <IconSymbol name="trash" size={16} color={AuroraColors.textFaint} />
          </TouchableOpacity>
        </View>

        {item.route_data && item.route_data.coordinates?.length > 1 && (
          <TouchableOpacity
            style={styles.mapPreviewWrap}
            activeOpacity={0.85}
            onPress={() => usmerjevalnik.push(`/replay?runId=${item.id}`)}>
            <HexTerritoryPreview route={item.route_data} trailColor={item.route_data.trailColor} seed={item.id} />
            <View style={styles.replayBadge}>
              <IconSymbol name="play.fill" size={12} color={AuroraColors.text} />
            </View>
          </TouchableOpacity>
        )}

        <StatBlock
          stats={[
            { value: Number(item.distance_km).toFixed(2), label: 'km' },
            { value: oblikujTrajanje(item.duration), label: 'čas' },
            { value: item.pace ?? '0:00', label: 'tempo/km' },
          ]}
        />

        {(item.elevation_m ?? 0) > 0 && (
          <View style={styles.extraStats}>
            <View style={styles.extraStatItem}>
              <IconSymbol name="arrow.up.right" size={14} color={AuroraColors.primary} />
              <ThemedText type="caption" variant="muted">
                {item.elevation_m}m višina
              </ThemedText>
            </View>
          </View>
        )}

        {item.notes && (
          <ThemedText type="bodySmall" variant="muted" style={styles.notes}>
            {item.notes}
          </ThemedText>
        )}
      </GlassCard>
    );
  };

  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">
            Nalaganje...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Moji teki"
        subtitle={`${mesecOznaka} · ${skupnaRazdalja} KM · ${stevilkaTekov}`}
        actions={[{ icon: 'chart.line.uptrend.xyaxis', onPress: () => usmerjevalnik.push('/analytics') }]}
      />

      {teki.length === 0 ? (
        <EmptyState icon="figure.run" title="Še ni tekov" subtitle="Pojdite na zavihek Tek in začnite slediti!" />
      ) : (
        <FlatList
          data={teki}
          renderItem={izrisiTek}
          keyExtractor={(element) => element.id}
          contentContainerStyle={[styles.runsList, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} tintColor={AuroraColors.primary} />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  runsList: {
    padding: Spacing.md,
  },
  runCard: {
    marginBottom: Spacing.sm,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  dateLine: {
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: AuroraColors.primary,
  },
  badgeText: {
    fontWeight: '700',
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  mapPreviewWrap: {
    marginBottom: Spacing.md,
    position: 'relative',
  },
  replayBadge: {
    position: 'absolute',
    right: Spacing.sm,
    bottom: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  extraStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notes: {
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
});
