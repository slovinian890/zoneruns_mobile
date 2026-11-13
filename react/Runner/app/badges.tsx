import { StyleSheet, View, TouchableOpacity, Alert, ScrollView, RefreshControl } from 'react-native';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TAB_BAR_HEIGHT } from '@/components/ui/floating-tab-bar';
import { IconSymbol, getAchievementIconName } from '@/components/ui/icon-symbol';
import { BadgeIcon, tierForRunnerRank, type BadgeTier } from '@/components/badge-icon';
import { AuroraColors, Spacing } from '@/constants/theme';
import {
  getAllAchievements,
  getUserAchievements,
  getCurrentUserStats,
  getAchievementProgress,
} from '@/services/statsService';
import { getMyCoinHistory } from '@/services/coinsService';
import { Achievement, CoinTransaction, UserStats } from '@/services/supabase';

const FEATURED_CATEGORY = 'Runner Rank';

interface Row {
  achievement: Achievement;
  earnedAt: string | null;
  progressPct: number;
}

export default function BadgesScreen() {
  useAmbientVariant('default');
  const insets = useSafeAreaInsets();
  const usmerjevalnik = useRouter();

  const [vrstice, setVrstice] = useState<Row[]>([]);
  const [statistika, setStatistika] = useState<UserStats | null>(null);
  const [zgodovinaKovancev, setZgodovinaKovancev] = useState<CoinTransaction[]>([]);
  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);

  const naloziPodatke = useCallback(async () => {
    try {
      const [dosezkiRez, statsRez, mojiDosezki, kovanci] = await Promise.all([
        getAllAchievements(),
        getCurrentUserStats(),
        getUserAchievements(),
        getMyCoinHistory(5),
      ]);

      const stats = statsRez.success ? statsRez.stats ?? null : null;
      setStatistika(stats);
      setZgodovinaKovancev(kovanci);

      const earnedMap = new Map((mojiDosezki.achievements ?? []).map((d) => [d.achievement_id, d.earned_at]));
      const vse = dosezkiRez.achievements ?? [];

      const sestavljeneVrstice = await Promise.all(
        vse.map(async (a): Promise<Row> => {
          const earnedAt = earnedMap.get(a.id) ?? null;
          let progressPct = 0;
          if (!earnedAt && stats) {
            const p = await getAchievementProgress(a, stats);
            progressPct = p.percentage / 100;
          }
          return { achievement: a, earnedAt, progressPct };
        })
      );

      setVrstice(sestavljeneVrstice);
    } catch (napaka) {
      console.error('Napaka pri nalaganju dosežkov:', napaka);
    } finally {
      setNalaganje(false);
      setOsvezevanje(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      naloziPodatke();
    }, [naloziPodatke])
  );

  const osveziPodatke = () => {
    setOsvezevanje(true);
    naloziPodatke();
  };

  const stevilOdklenjenih = vrstice.filter((v) => v.earnedAt).length;

  const kategorijeVPrikazu = (() => {
    const zemljevid = new Map<string, Row[]>();
    for (const vrstica of vrstice) {
      const kljuc = vrstica.achievement.category;
      if (!zemljevid.has(kljuc)) zemljevid.set(kljuc, []);
      zemljevid.get(kljuc)!.push(vrstica);
    }
    const preostalo = [...zemljevid.keys()].filter((k) => k !== FEATURED_CATEGORY);
    const vrstniRed = zemljevid.has(FEATURED_CATEGORY) ? [FEATURED_CATEGORY, ...preostalo] : preostalo;
    return vrstniRed.map((kategorija) => ({
      kategorija,
      vrstice: (zemljevid.get(kategorija) ?? []).sort(
        (a, b) => (a.achievement.requirement_value ?? 0) - (b.achievement.requirement_value ?? 0)
      ),
    }));
  })();

  const prikaziPodrobnosti = (vrstica: Row) => {
    const { achievement, earnedAt, progressPct } = vrstica;
    if (earnedAt) {
      Alert.alert(achievement.title, `${achievement.description}\n\nOdklenjeno ${new Date(earnedAt).toLocaleDateString('sl-SI')}`);
    } else {
      const napredek = achievement.requirement_type && achievement.requirement_value
        ? `\n\nNapredek: ${Math.round(progressPct * 100)}%`
        : '';
      Alert.alert(`🔒 ${achievement.title}`, `${achievement.description}${napredek}`);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Dosežki"
        subtitle={vrstice.length > 0 ? `${stevilOdklenjenih}/${vrstice.length} odklenjenih` : undefined}
        onBack={() => usmerjevalnik.back()}
        actions={[{ icon: 'chart.line.uptrend.xyaxis', onPress: () => usmerjevalnik.push('/leaderboard') }]}
      />

      {nalaganje ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg }]}
          refreshControl={<RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} tintColor={AuroraColors.primary} />}
          showsVerticalScrollIndicator={false}>
          <GlassCard style={styles.coinCard}>
            <View style={styles.coinRow}>
              <IconSymbol name="coins.fill" size={26} color={AuroraColors.accentAmber} />
              <View style={{ flex: 1 }}>
                <ThemedText type="h2" variant="primary">{statistika?.coins ?? 0}</ThemedText>
                <ThemedText type="bodySmall" variant="muted">Kovanci</ThemedText>
              </View>
            </View>
            {zgodovinaKovancev.length > 0 && (
              <View style={styles.coinHistory}>
                {zgodovinaKovancev.slice(0, 3).map((tx) => (
                  <View key={tx.id} style={styles.coinHistoryRow}>
                    <ThemedText type="bodySmall" variant="muted">
                      {new Date(tx.created_at).toLocaleDateString('sl-SI')} · {tx.distance_km.toFixed(1)} km tek
                    </ThemedText>
                    <ThemedText type="bodySmall" lightColor={AuroraColors.accentAmber} darkColor={AuroraColors.accentAmber}>
                      +{tx.amount}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </GlassCard>

          {kategorijeVPrikazu.map(({ kategorija, vrstice: vrsticeKategorije }) => (
            <View key={kategorija} style={styles.section}>
              <ThemedText type="h3" style={styles.sectionTitle}>
                {kategorija}
                {kategorija === FEATURED_CATEGORY ? ' 🏅' : ''}
              </ThemedText>
              <View style={styles.grid}>
                {vrsticeKategorije.map((vrstica) => {
                  const { achievement, earnedAt, progressPct } = vrstica;
                  const locked = !earnedAt;
                  const tier: BadgeTier =
                    achievement.category === FEATURED_CATEGORY
                      ? tierForRunnerRank(achievement.requirement_value ?? 0)
                      : 'default';
                  return (
                    <TouchableOpacity
                      key={achievement.id}
                      style={styles.tile}
                      activeOpacity={0.7}
                      onPress={() => prikaziPodrobnosti(vrstica)}>
                      <BadgeIcon
                        icon={getAchievementIconName(achievement.icon)}
                        tier={tier}
                        locked={locked}
                        progress={progressPct}
                        size={kategorija === FEATURED_CATEGORY ? 76 : 60}
                      />
                      <ThemedText
                        type="caption"
                        numberOfLines={1}
                        variant={locked ? 'muted' : 'primary'}
                        style={styles.tileTitle}>
                        {achievement.title}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.md },
  coinCard: { marginBottom: Spacing.lg },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coinHistory: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AuroraColors.border,
    gap: 4,
  },
  coinHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { marginBottom: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile: { width: '30%', alignItems: 'center', gap: 6 },
  tileTitle: { textAlign: 'center' },
});
