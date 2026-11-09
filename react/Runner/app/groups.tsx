import { StyleSheet, View, TouchableOpacity, Alert, FlatList, RefreshControl } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { listRowDividerStyle } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TAB_BAR_HEIGHT } from '@/components/ui/floating-tab-bar';
import { AuroraColors, Shadows, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SearchBar } from '@/components/ui/search-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getMyGroups,
  searchPublicGroups,
  joinGroupByCode,
  getGroupLeaderboard,
  GROUP_MEMBER_LIMIT,
} from '@/services/groupsService';
import { formatArea } from '@/services/territoryService';
import { Group, GroupWithRole, GroupLeaderboardEntry } from '@/services/supabase';

type TipZavihka = 'moje' | 'odkrij' | 'lestvica';

export default function GroupsScreen() {
  useAmbientVariant('default');
  const insets = useSafeAreaInsets();
  const usmerjevalnik = useRouter();

  const [aktivniZavihek, setAktivniZavihek] = useState<TipZavihka>('moje');
  const [mojeSkupine, setMojeSkupine] = useState<GroupWithRole[]>([]);
  const [rezultatiIskanja, setRezultatiIskanja] = useState<Group[]>([]);
  const [lestvica, setLestvica] = useState<GroupLeaderboardEntry[]>([]);
  const [iskalniNiz, setIskalniNiz] = useState('');
  const [kodaZaPridruzitev, setKodaZaPridruzitev] = useState('');
  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);
  const [pridruzevanje, setPridruzevanje] = useState(false);

  useFocusEffect(
    useCallback(() => {
      naloziPodatke();
    }, [])
  );

  const naloziPodatke = async () => {
    try {
      const [rezultatMojih, rezultatLestvice] = await Promise.all([
        getMyGroups(),
        getGroupLeaderboard(),
      ]);
      if (rezultatMojih.success) setMojeSkupine(rezultatMojih.groups ?? []);
      setLestvica(rezultatLestvice);
    } catch (napaka) {
      console.error('Napaka pri nalaganju skupin:', napaka);
    } finally {
      setNalaganje(false);
      setOsvezevanje(false);
    }
  };

  const osveziPodatke = () => {
    setOsvezevanje(true);
    naloziPodatke();
  };

  const zadnjaPoizvedbaRef = useRef('');

  const obdelajIskanje = async (poizvedba: string) => {
    zadnjaPoizvedbaRef.current = poizvedba;
    if (!poizvedba) {
      setRezultatiIskanja([]);
      return;
    }
    const rezultat = await searchPublicGroups(poizvedba);
    if (zadnjaPoizvedbaRef.current !== poizvedba) return; // a newer query already superseded this one
    if (rezultat.success) setRezultatiIskanja(rezultat.groups ?? []);
  };

  const obdelajPridruzitev = async (koda: string) => {
    if (!koda.trim()) return;
    setPridruzevanje(true);
    const rezultat = await joinGroupByCode(koda);
    setPridruzevanje(false);

    if (rezultat.success && rezultat.group) {
      setKodaZaPridruzitev('');
      naloziPodatke();
      usmerjevalnik.push({ pathname: '/group-detail', params: { groupId: rezultat.group.id } });
    } else {
      Alert.alert('Napaka', rezultat.error || 'Pridružitev ni uspela');
    }
  };

  const jePolnaZamojeSkupine = (skupinaId: string) => mojeSkupine.some((s) => s.id === skupinaId);

  const izrisiMojoSkupino = ({ item }: { item: GroupWithRole }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => usmerjevalnik.push({ pathname: '/group-detail', params: { groupId: item.id } })}
      activeOpacity={0.7}>
      <View style={[styles.colorDot, { backgroundColor: item.color }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.groupNameRow}>
          <ThemedText type="bodyBold">{item.name}</ThemedText>
          {!item.is_public && <IconSymbol name="lock.fill" size={12} color={AuroraColors.textMuted} style={{ marginLeft: 6 }} />}
          {item.role === 'owner' && <IconSymbol name="star.fill" size={12} color={AuroraColors.primary} style={{ marginLeft: 6 }} />}
        </View>
        <ThemedText type="caption" variant="muted">{item.member_count}/{GROUP_MEMBER_LIMIT} članov</ThemedText>
      </View>
      <IconSymbol name="chevron.right" size={18} color={AuroraColors.textFaint} />
    </TouchableOpacity>
  );

  const izrisiRezultatIskanja = ({ item }: { item: Group }) => {
    const zeClan = jePolnaZamojeSkupine(item.id);
    return (
      <View style={styles.row}>
        <View style={[styles.colorDot, { backgroundColor: item.color }]} />
        <View style={{ flex: 1 }}>
          <ThemedText type="bodyBold">{item.name}</ThemedText>
          <ThemedText type="caption" variant="muted">{item.member_count}/{GROUP_MEMBER_LIMIT} članov</ThemedText>
        </View>
        {zeClan ? (
          <ThemedText type="bodySmall" variant="muted">Ste član</ThemedText>
        ) : (
          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => obdelajPridruzitev(item.invite_code)}
            disabled={pridruzevanje}
            activeOpacity={0.7}>
            <ThemedText type="bodySmall" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
              Pridruži se
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const izrisiLestvico = ({ item }: { item: GroupLeaderboardEntry }) => {
    const jeMoja = mojeSkupine.some((s) => s.id === item.group_id);
    return (
      <TouchableOpacity
        style={[styles.row, jeMoja && styles.rowHighlighted]}
        onPress={() => usmerjevalnik.push({ pathname: '/group-detail', params: { groupId: item.group_id } })}
        activeOpacity={0.7}>
        <ThemedText type="h3" variant={jeMoja ? 'primary' : undefined} style={styles.rankNumber}>
          #{item.rank}
        </ThemedText>
        <View style={[styles.colorDot, { backgroundColor: item.color }]} />
        <View style={{ flex: 1 }}>
          <ThemedText type="bodyBold">{item.name}</ThemedText>
          <ThemedText type="caption" variant="muted">{item.member_count}/{GROUP_MEMBER_LIMIT} članov</ThemedText>
        </View>
        <ThemedText type="bodyBold" variant="primary">{formatArea(item.total_area_m2)}</ThemedText>
      </TouchableOpacity>
    );
  };

  const podatkiSeznama = (): any[] => {
    switch (aktivniZavihek) {
      case 'moje': return mojeSkupine;
      case 'odkrij': return rezultatiIskanja;
      case 'lestvica': return lestvica;
    }
  };

  const izrisiElement = (props: any) => {
    switch (aktivniZavihek) {
      case 'moje': return izrisiMojoSkupino(props);
      case 'odkrij': return izrisiRezultatIskanja(props);
      case 'lestvica': return izrisiLestvico(props);
    }
  };

  const praznoSporocilo = () => {
    switch (aktivniZavihek) {
      case 'moje': return 'Še niste v nobeni skupini';
      case 'odkrij': return iskalniNiz ? 'Ni najdenih skupin' : 'Iščite javne skupine po imenu';
      case 'lestvica': return 'Ni še nobene javne skupine';
    }
  };

  const kljucElementa = (item: any, index: number) =>
    aktivniZavihek === 'lestvica' ? item.group_id : aktivniZavihek === 'odkrij' ? item.id : item.id ?? String(index);

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Skupine"
        onBack={() => usmerjevalnik.back()}
        actions={[{ icon: 'plus', onPress: () => usmerjevalnik.push('/create-group') }]}>
        <View style={styles.joinRow}>
          <Input
            style={styles.joinInput}
            value={kodaZaPridruzitev}
            onChangeText={(t) => setKodaZaPridruzitev(t.toUpperCase())}
            placeholder="Imate kodo? Vnesite jo"
            autoCapitalize="characters"
            maxLength={6}
            onSubmitEditing={() => obdelajPridruzitev(kodaZaPridruzitev)}
            returnKeyType="join"
          />
          <TouchableOpacity
            style={[styles.joinCta, Shadows.glowPrimary, (pridruzevanje || !kodaZaPridruzitev.trim()) && styles.joinCtaDisabled]}
            onPress={() => obdelajPridruzitev(kodaZaPridruzitev)}
            disabled={pridruzevanje || !kodaZaPridruzitev.trim()}
            activeOpacity={0.7}>
            <IconSymbol name="checkmark" size={20} color={AuroraColors.onPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            segments={[
              { key: 'moje', label: 'Moje' },
              { key: 'odkrij', label: 'Odkrij' },
              { key: 'lestvica', label: 'Lestvica' },
            ]}
            value={aktivniZavihek}
            onChange={(key) => setAktivniZavihek(key as TipZavihka)}
          />
        </View>
      </ScreenHeader>

      {aktivniZavihek === 'odkrij' && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={styles.searchSection}>
          <SearchBar value={iskalniNiz} onChangeText={setIskalniNiz} onSearch={obdelajIskanje} placeholder="Iskanje javnih skupin" />
        </Animated.View>
      )}

      {nalaganje ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
        </View>
      ) : podatkiSeznama().length === 0 ? (
        <EmptyState icon="person.2.fill" title={praznoSporocilo()} />
      ) : (
        <FlatList
          data={podatkiSeznama()}
          renderItem={izrisiElement}
          keyExtractor={kljucElementa}
          contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg }]}
          ItemSeparatorComponent={() => <View style={listRowDividerStyle} />}
          showsVerticalScrollIndicator={false}
          refreshControl={aktivniZavihek !== 'odkrij' ? <RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} tintColor={AuroraColors.primary} /> : undefined}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  joinRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  joinInput: { flex: 1, minHeight: 50, textAlignVertical: 'center' },
  joinCta: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AuroraColors.primary,
  },
  joinCtaDisabled: { opacity: 0.4 },
  segmentedWrap: { marginTop: Spacing.sm },
  searchSection: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.sm },
  rowHighlighted: { marginHorizontal: -Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: 12, backgroundColor: AuroraColors.primarySoft },
  groupNameRow: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  rankNumber: { width: 36 },
  joinButton: { paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.sm + 2, borderRadius: 9999, backgroundColor: AuroraColors.primary },
});
