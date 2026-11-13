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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { HeroSprite } from '@/components/hero-sprite';
import { AuroraColors, Spacing, BorderRadius } from '@/constants/theme';
import { HERO_TIER_COUNT } from '@/constants/hero-sprites';
import {
  getMyHeroes,
  unlockHero,
  upgradeHero,
  setActiveHero,
  heroUpgradeCost,
  RARITY_COLORS,
} from '@/services/heroesService';
import { getCurrentUserStats } from '@/services/statsService';
import { MyHero } from '@/services/supabase';

const RARITY_LABELS: Record<string, string> = {
  common: 'Navaden',
  rare: 'Redek',
  epic: 'Epski',
  legendary: 'Legendaren',
};

export default function HeroesScreen() {
  useAmbientVariant('default');
  const insets = useSafeAreaInsets();
  const usmerjevalnik = useRouter();

  const [junaki, setJunaki] = useState<MyHero[]>([]);
  const [kovanci, setKovanci] = useState(0);
  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);
  const [obdelavaId, setObdelavaId] = useState<string | null>(null);

  const naloziPodatke = useCallback(async () => {
    try {
      const [seznam, statsRez] = await Promise.all([getMyHeroes(), getCurrentUserStats()]);
      setJunaki(seznam);
      setKovanci(statsRez.success ? statsRez.stats?.coins ?? 0 : 0);
    } catch (napaka) {
      console.error('Napaka pri nalaganju junakov:', napaka);
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

  const sporociloZaRazlog = (razlog: string | undefined, strosek?: number, trenutniKovanci?: number) => {
    switch (razlog) {
      case 'not_enough_coins':
        return `Nimate dovolj kovancev (potrebno ${strosek}, imate ${trenutniKovanci}).`;
      case 'max_tier':
        return 'Ta junak je že na najvišjem nivoju.';
      case 'already_owned':
        return 'Tega junaka že imate.';
      default:
        return 'Nekaj je šlo narobe.';
    }
  };

  const obdelajOdklepanje = (junak: MyHero) => {
    Alert.alert(
      junak.name,
      `Odkleni za ${junak.unlock_cost} kovancev?`,
      [
        { text: 'Prekliči', style: 'cancel' },
        {
          text: 'Odkleni',
          onPress: async () => {
            setObdelavaId(junak.hero_id);
            const rez = await unlockHero(junak.hero_id);
            setObdelavaId(null);
            if (rez.success) {
              naloziPodatke();
            } else {
              Alert.alert('Napaka', sporociloZaRazlog(rez.reason, rez.cost, rez.coins));
            }
          },
        },
      ]
    );
  };

  const obdelajAktivacijo = async (junak: MyHero) => {
    if (junak.is_active) return;
    setObdelavaId(junak.hero_id);
    const rez = await setActiveHero(junak.hero_id);
    setObdelavaId(null);
    if (rez.success) {
      setJunaki((prej) => prej.map((j) => ({ ...j, is_active: j.hero_id === junak.hero_id })));
    } else {
      Alert.alert('Napaka', 'Izbira junaka ni uspela.');
    }
  };

  const obdelajNadgradnjo = (junak: MyHero) => {
    const trenutniNivo = junak.tier ?? 1;
    const strosek = heroUpgradeCost(trenutniNivo);
    Alert.alert(
      junak.name,
      `Nadgradi na nivo ${trenutniNivo + 1} za ${strosek} kovancev?`,
      [
        { text: 'Prekliči', style: 'cancel' },
        {
          text: 'Nadgradi',
          onPress: async () => {
            setObdelavaId(junak.hero_id);
            const rez = await upgradeHero(junak.hero_id);
            setObdelavaId(null);
            if (rez.success && rez.new_tier) {
              setJunaki((prej) =>
                prej.map((j) => (j.hero_id === junak.hero_id ? { ...j, tier: rez.new_tier! } : j))
              );
              setKovanci((prej) => prej - strosek);
            } else {
              Alert.alert('Napaka', sporociloZaRazlog(rez.reason, rez.cost, rez.coins));
            }
          },
        },
      ]
    );
  };

  const steviloOdklenjenih = junaki.filter((j) => j.owned).length;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Junaki"
        subtitle={junaki.length > 0 ? `${steviloOdklenjenih}/${junaki.length} odklenjenih` : undefined}
        onBack={() => usmerjevalnik.back()}
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
                <ThemedText type="h2" variant="primary">{kovanci}</ThemedText>
                <ThemedText type="bodySmall" variant="muted">Kovanci na voljo</ThemedText>
              </View>
            </View>
          </GlassCard>

          <View style={styles.grid}>
            {junaki.map((junak) => {
              const rarityColor = RARITY_COLORS[junak.rarity] ?? AuroraColors.textMuted;
              const tier = junak.tier ?? 1;
              const naMaksimumu = tier >= HERO_TIER_COUNT;
              const zaseden = obdelavaId === junak.hero_id;

              return (
                <TouchableOpacity
                  key={junak.hero_id}
                  style={[styles.tile, { borderColor: junak.owned ? rarityColor : AuroraColors.border }]}
                  activeOpacity={0.75}
                  disabled={zaseden}
                  onPress={() => (junak.owned ? obdelajAktivacijo(junak) : obdelajOdklepanje(junak))}>
                  {junak.is_active && (
                    <View style={[styles.activeBadge, { backgroundColor: AuroraColors.primary }]}>
                      <IconSymbol name="star.fill" size={10} color={AuroraColors.onPrimary} />
                    </View>
                  )}

                  <View style={[styles.spriteWrap, !junak.owned && styles.spriteLocked]}>
                    <HeroSprite slug={junak.slug} tier={junak.owned ? tier : 1} size={64} animated={false} />
                    {!junak.owned && (
                      <View style={styles.lockOverlay}>
                        <IconSymbol name="lock.fill" size={16} color={AuroraColors.textMuted} />
                      </View>
                    )}
                  </View>

                  <ThemedText type="bodySmall" numberOfLines={1} style={styles.tileName}>
                    {junak.name}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: rarityColor }}>
                    {RARITY_LABELS[junak.rarity]}
                  </ThemedText>

                  {junak.owned ? (
                    <>
                      <ThemedText type="caption" variant="muted" style={styles.tierText}>
                        Nivo {tier}/{HERO_TIER_COUNT}
                      </ThemedText>
                      {naMaksimumu ? (
                        <View style={styles.maxChip}>
                          <ThemedText type="caption" variant="muted">MAKS.</ThemedText>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.upgradeChip}
                          disabled={zaseden}
                          onPress={() => obdelajNadgradnjo(junak)}>
                          <IconSymbol name="coins.fill" size={10} color={AuroraColors.onPrimary} />
                          <ThemedText type="caption" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
                            {heroUpgradeCost(tier)}
                          </ThemedText>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    <View style={styles.unlockChip}>
                      <IconSymbol name="coins.fill" size={10} color={AuroraColors.text} />
                      <ThemedText type="caption">{junak.unlock_cost}</ThemedText>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'space-between' },
  tile: {
    width: '31%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.large,
    borderWidth: 1.5,
    backgroundColor: AuroraColors.surfaceSolid,
    marginBottom: Spacing.sm,
  },
  activeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  spriteWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  spriteLocked: {
    opacity: 0.35,
  },
  lockOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  tileName: {
    textAlign: 'center',
  },
  tierText: {
    marginTop: 2,
  },
  maxChip: {
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: AuroraColors.border,
  },
  upgradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: AuroraColors.primary,
  },
  unlockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: AuroraColors.border,
  },
});
