import { StyleSheet, View, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { listRowDividerStyle } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TAB_BAR_HEIGHT } from '@/components/ui/floating-tab-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AuroraColors, Spacing } from '@/constants/theme';
import { formatArea } from '@/services/territoryService';
import { getTerritoryLeaderboard, getWeeklyLeaderboard, getWeeklyGroupLeaderboard, formatNetArea } from '@/services/leaderboardService';
import { getGroupLeaderboard, getMyGroups } from '@/services/groupsService';
import { getCurrentUser } from '@/services/authService';
import {
  TerritoryLeaderboardEntry,
  WeeklyLeaderboardEntry,
  GroupLeaderboardEntry,
  WeeklyGroupLeaderboardEntry,
} from '@/services/supabase';

type Vrsta = 'posamezniki' | 'skupine';
type Obseg = 'vsi' | 'teden';

const RANK_COLORS: Record<number, string> = {
  1: '#F3D065',
  2: '#E3E7ED',
  3: '#E3A368',
};

function RankBadge({ rank }: { rank: number }) {
  const barva = RANK_COLORS[rank];
  return (
    <View style={styles.rankWrap}>
      {rank === 1 && <IconSymbol name="crown.fill" size={14} color={RANK_COLORS[1]} style={{ marginBottom: -2 }} />}
      <ThemedText type="h3" style={[styles.rankNumber, barva ? { color: barva } : undefined]}>
        #{rank}
      </ThemedText>
    </View>
  );
}

export default function LeaderboardScreen() {
  useAmbientVariant('default');
  const insets = useSafeAreaInsets();
  const usmerjevalnik = useRouter();

  const [vrsta, setVrsta] = useState<Vrsta>('posamezniki');
  const [obseg, setObseg] = useState<Obseg>('vsi');

  const [posamezVsi, setPosamezVsi] = useState<TerritoryLeaderboardEntry[]>([]);
  const [posamezTeden, setPosamezTeden] = useState<WeeklyLeaderboardEntry[]>([]);
  const [skupineVsi, setSkupineVsi] = useState<GroupLeaderboardEntry[]>([]);
  const [skupineTeden, setSkupineTeden] = useState<WeeklyGroupLeaderboardEntry[]>([]);
  const [mojId, setMojId] = useState<string | null>(null);
  const [mojeSkupineId, setMojeSkupineId] = useState<Set<string>>(new Set());

  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);

  const naloziPodatke = useCallback(async () => {
    try {
      const [uporabnik, pv, pt, sv, st, mojeSkupine] = await Promise.all([
        getCurrentUser(),
        getTerritoryLeaderboard(),
        getWeeklyLeaderboard(),
        getGroupLeaderboard(),
        getWeeklyGroupLeaderboard(),
        getMyGroups(),
      ]);
      setMojId(uporabnik?.id ?? null);
      setPosamezVsi(pv);
      setPosamezTeden(pt);
      setSkupineVsi(sv);
      setSkupineTeden(st);
      setMojeSkupineId(new Set((mojeSkupine.groups ?? []).map((g) => g.id)));
    } catch (napaka) {
      console.error('Napaka pri nalaganju lestvice:', napaka);
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

  const podatki: any[] =
    vrsta === 'posamezniki' ? (obseg === 'vsi' ? posamezVsi : posamezTeden) : obseg === 'vsi' ? skupineVsi : skupineTeden;

  const izrisiPosameznika = (item: TerritoryLeaderboardEntry | WeeklyLeaderboardEntry) => {
    const jeMoj = item.user_id === mojId;
    const trailing = obseg === 'vsi' ? formatArea((item as TerritoryLeaderboardEntry).area_m2) : formatNetArea((item as WeeklyLeaderboardEntry).net_m2);
    const netPozitiven = obseg !== 'vsi' && (item as WeeklyLeaderboardEntry).net_m2 >= 0;
    return (
      <TouchableOpacity
        style={[styles.row, jeMoj && styles.rowHighlighted]}
        onPress={() => usmerjevalnik.push({ pathname: '/user-profile', params: { userId: item.user_id } })}
        activeOpacity={0.7}>
        <RankBadge rank={item.rank} />
        <Avatar uri={item.avatar_url} active={jeMoj} />
        <View style={{ flex: 1 }}>
          <ThemedText type="bodyBold" numberOfLines={1}>{item.display_name || item.username}</ThemedText>
          <ThemedText type="caption" variant="muted">@{item.username}</ThemedText>
        </View>
        <ThemedText
          type="bodyBold"
          lightColor={obseg === 'vsi' ? AuroraColors.primary : netPozitiven ? AuroraColors.success : AuroraColors.danger}
          darkColor={obseg === 'vsi' ? AuroraColors.primary : netPozitiven ? AuroraColors.success : AuroraColors.danger}>
          {trailing}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  const izrisiSkupino = (item: GroupLeaderboardEntry | WeeklyGroupLeaderboardEntry) => {
    const jeMoja = mojeSkupineId.has(item.group_id);
    const trailing = obseg === 'vsi' ? formatArea((item as GroupLeaderboardEntry).total_area_m2) : formatNetArea((item as WeeklyGroupLeaderboardEntry).net_m2);
    const netPozitiven = obseg !== 'vsi' && (item as WeeklyGroupLeaderboardEntry).net_m2 >= 0;
    return (
      <TouchableOpacity
        style={[styles.row, jeMoja && styles.rowHighlighted]}
        onPress={() => usmerjevalnik.push({ pathname: '/group-detail', params: { groupId: item.group_id } })}
        activeOpacity={0.7}>
        <RankBadge rank={item.rank} />
        <View style={[styles.colorDot, { backgroundColor: item.color }]} />
        <View style={{ flex: 1 }}>
          <ThemedText type="bodyBold" numberOfLines={1}>{item.name}</ThemedText>
          <ThemedText type="caption" variant="muted">{item.member_count} članov</ThemedText>
        </View>
        <ThemedText
          type="bodyBold"
          lightColor={obseg === 'vsi' ? AuroraColors.primary : netPozitiven ? AuroraColors.success : AuroraColors.danger}
          darkColor={obseg === 'vsi' ? AuroraColors.primary : netPozitiven ? AuroraColors.success : AuroraColors.danger}>
          {trailing}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  const praznoSporocilo = () => {
    if (obseg === 'teden') {
      return vrsta === 'posamezniki' ? 'Še nihče ni zasegel ozemlja ta teden' : 'Še nobena skupina ni aktivna ta teden';
    }
    return vrsta === 'posamezniki' ? 'Še nihče ni zasegel ozemlja' : 'Ni še nobene javne skupine';
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Lestvica" onBack={() => usmerjevalnik.back()}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            segments={[
              { key: 'posamezniki', label: 'Posamezniki' },
              { key: 'skupine', label: 'Skupine' },
            ]}
            value={vrsta}
            onChange={(k) => setVrsta(k as Vrsta)}
          />
        </View>
        <View style={styles.segmentedWrapSmall}>
          <SegmentedControl
            segments={[
              { key: 'vsi', label: 'Ves čas' },
              { key: 'teden', label: 'Ta teden' },
            ]}
            value={obseg}
            onChange={(k) => setObseg(k as Obseg)}
          />
        </View>
      </ScreenHeader>

      {nalaganje ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
        </View>
      ) : podatki.length === 0 ? (
        <EmptyState
          icon={vrsta === 'posamezniki' ? 'hexagon.fill' : 'person.2.fill'}
          title={praznoSporocilo()}
          subtitle={obseg === 'teden' ? 'Pojdite tekat in zasezite ozemlje, da se uvrstite!' : undefined}
        />
      ) : (
        <FlatList
          data={podatki}
          renderItem={({ item }) => (vrsta === 'posamezniki' ? izrisiPosameznika(item) : izrisiSkupino(item))}
          keyExtractor={(item) => (vrsta === 'posamezniki' ? item.user_id : item.group_id)}
          contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg }]}
          ItemSeparatorComponent={() => <View style={listRowDividerStyle} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} tintColor={AuroraColors.primary} />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  segmentedWrap: { marginTop: Spacing.sm },
  segmentedWrapSmall: { marginTop: Spacing.sm },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.sm },
  rowHighlighted: { marginHorizontal: -Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: 12, backgroundColor: AuroraColors.primarySoft },
  rankWrap: { width: 40, alignItems: 'center' },
  rankNumber: { textAlign: 'center' },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
});
