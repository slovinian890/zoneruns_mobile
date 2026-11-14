import { StyleSheet, View, TouchableOpacity, Alert, ScrollView, Share } from 'react-native';
import { useState, useCallback } from 'react';
import { Image } from 'expo-image';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, AuroraColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  getGroup,
  getGroupStats,
  leaveGroup,
  removeMember,
  deleteGroup,
  updateGroup,
  regenerateInviteCode,
  getMyActiveGroup,
  setActiveGroup,
  GROUP_MEMBER_LIMIT,
} from '@/services/groupsService';
import { getCurrentUser } from '@/services/authService';
import { formatArea } from '@/services/territoryService';
import { Group, GroupMemberStat, MyActiveGroup } from '@/services/supabase';

export default function GroupDetailScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const usmerjevalnik = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const [skupina, setSkupina] = useState<Group | null>(null);
  const [clani, setClani] = useState<GroupMemberStat[]>([]);
  const [trenutniUporabnikId, setTrenutniUporabnikId] = useState<string | null>(null);
  const [nalaganje, setNalaganje] = useState(true);
  const [dejanjeVTeku, setDejanjeVTeku] = useState(false);
  // Which clan (if any) the viewer currently represents when claiming hexes —
  // see set_active_group / migrations/017_clan_hex_warfare.sql.
  const [mojAktivniKlan, setMojAktivniKlan] = useState<MyActiveGroup | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (groupId) naloziPodatke();
    }, [groupId])
  );

  const naloziPodatke = async () => {
    if (!groupId) return;
    try {
      const [uporabnik, rezultatSkupine, statistikaClanov, aktivniKlan] = await Promise.all([
        getCurrentUser(),
        getGroup(groupId),
        getGroupStats(groupId),
        getMyActiveGroup(),
      ]);
      setTrenutniUporabnikId(uporabnik?.id ?? null);
      if (rezultatSkupine.success && rezultatSkupine.group) setSkupina(rezultatSkupine.group);
      setClani(statistikaClanov);
      setMojAktivniKlan(aktivniKlan);
    } catch (napaka) {
      console.error('Error loading group:', napaka);
    } finally {
      setNalaganje(false);
    }
  };

  const jeLastnik = !!skupina && !!trenutniUporabnikId && skupina.created_by === trenutniUporabnikId;
  const jeClan = !!trenutniUporabnikId && clani.some((c) => c.user_id === trenutniUporabnikId);
  const jeAktivenZaTaKlub = !!skupina && mojAktivniKlan?.group_id === skupina.id;
  const skupnaPovrsina = clani.reduce((v, c) => v + c.area_m2, 0);

  const obdelajPreklopAktivnegaKluba = async () => {
    if (!skupina) return;
    setDejanjeVTeku(true);
    const rezultat = await setActiveGroup(jeAktivenZaTaKlub ? null : skupina.id);
    setDejanjeVTeku(false);
    if (rezultat.success) {
      setMojAktivniKlan(jeAktivenZaTaKlub ? null : { group_id: skupina.id, name: skupina.name, color: skupina.color });
    } else {
      Alert.alert('Error', 'Could not update your active clan');
    }
  };

  const obdelajDeljenje = async () => {
    if (!skupina) return;
    try {
      await Share.share({
        message: `Join my group "${skupina.name}" on ZoneRuns! Code: ${skupina.invite_code}`,
      });
    } catch {}
  };

  const obdelajZapustitev = () => {
    Alert.alert('Leave Group', `Are you sure you want to leave "${skupina?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setDejanjeVTeku(true);
          const rezultat = await leaveGroup(groupId);
          setDejanjeVTeku(false);
          if (rezultat.success) {
            usmerjevalnik.back();
          } else {
            Alert.alert('Error', rezultat.error || 'Could not leave the group');
          }
        },
      },
    ]);
  };

  const obdelajOdstranitev = (clan: GroupMemberStat) => {
    Alert.alert('Remove Member', `Remove ${clan.display_name || clan.username} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const rezultat = await removeMember(groupId, clan.user_id);
          if (rezultat.success) {
            naloziPodatke();
          } else {
            Alert.alert('Error', rezultat.error || 'Could not remove the member');
          }
        },
      },
    ]);
  };

  const obdelajBrisanje = () => {
    Alert.alert('Delete Group', `The group "${skupina?.name}" will be permanently deleted for all members. This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDejanjeVTeku(true);
          const rezultat = await deleteGroup(groupId);
          setDejanjeVTeku(false);
          if (rezultat.success) {
            usmerjevalnik.back();
          } else {
            Alert.alert('Error', rezultat.error || 'Could not delete the group');
          }
        },
      },
    ]);
  };

  const obdelajPreklopVidnosti = async () => {
    if (!skupina) return;
    const rezultat = await updateGroup(groupId, { is_public: !skupina.is_public });
    if (rezultat.success) {
      setSkupina({ ...skupina, is_public: !skupina.is_public });
    } else {
      Alert.alert('Error', rezultat.error || 'Could not update the group');
    }
  };

  const obdelajNovoKodo = () => {
    Alert.alert('New Invite Code', 'The old code will stop working. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create New',
        onPress: async () => {
          const rezultat = await regenerateInviteCode(groupId);
          if (rezultat.success && rezultat.code && skupina) {
            setSkupina({ ...skupina, invite_code: rezultat.code });
          } else {
            Alert.alert('Error', rezultat.error || 'Could not create a new code');
          }
        },
      },
    ]);
  };

  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!skupina) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Group not found</ThemedText>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: barve.primary }]} onPress={() => usmerjevalnik.back()} activeOpacity={0.7}>
            <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>Back</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: barve.border }]}>
        <TouchableOpacity onPress={() => usmerjevalnik.back()} style={styles.backButtonIcon}>
          <IconSymbol name="chevron.left" size={24} color={barve.text} />
        </TouchableOpacity>
        <ThemedText type="h3" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{skupina.name}</ThemedText>
        <TouchableOpacity
          onPress={() => usmerjevalnik.push({ pathname: '/group-chat', params: { groupId: skupina.id } })}
          style={styles.backButtonIcon}>
          <IconSymbol name="bubble.left.fill" size={22} color={barve.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoSection}>
          <View style={[styles.colorDotLarge, { backgroundColor: skupina.color }]} />
          <View style={styles.badgeRow}>
            <IconSymbol name={skupina.is_public ? 'magnifyingglass' : 'lock.fill'} size={14} color={barve.textMuted} />
            <ThemedText type="caption" variant="muted" style={{ marginLeft: 4 }}>
              {skupina.is_public ? 'Public group' : 'Private group'} · {clani.length}/{GROUP_MEMBER_LIMIT} members
            </ThemedText>
          </View>
          {!!skupina.description && (
            <ThemedText type="body" variant="secondary" style={styles.description}>{skupina.description}</ThemedText>
          )}

          <View style={[styles.totalCard, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary, borderWidth: 1, borderColor: barve.border }]}>
            <IconSymbol name="hexagon.fill" size={22} color={barve.primary} />
            <View style={{ flex: 1 }}>
              <ThemedText type="h3" variant="primary">{formatArea(skupnaPovrsina)}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Group&apos;s total territory</ThemedText>
            </View>
          </View>

          {jeClan && (
            <TouchableOpacity
              style={[
                styles.activeClanRow,
                { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary, borderWidth: 1, borderColor: jeAktivenZaTaKlub ? skupina.color : barve.border },
              ]}
              onPress={obdelajPreklopAktivnegaKluba}
              disabled={dejanjeVTeku}
              activeOpacity={0.7}>
              <IconSymbol name={jeAktivenZaTaKlub ? 'checkmark.circle.fill' : 'hexagon.fill'} size={20} color={jeAktivenZaTaKlub ? skupina.color : barve.primary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="bodyBold">{jeAktivenZaTaKlub ? 'Running for this clan' : 'Run for this clan'}</ThemedText>
                <ThemedText type="caption" variant="muted">
                  {jeAktivenZaTaKlub
                    ? 'Hexes you claim belong to this clan — tap to go solo again'
                    : 'Hexes you claim will belong to the clan, not just you, until you switch back'}
                </ThemedText>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.codeRow, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary, borderWidth: 1, borderColor: barve.border }]}
            onPress={obdelajDeljenje}
            activeOpacity={0.7}>
            <View>
              <ThemedText type="caption" variant="muted">Invite code</ThemedText>
              <ThemedText type="h3" style={{ letterSpacing: 2 }}>{skupina.invite_code}</ThemedText>
            </View>
            <IconSymbol name="square.and.arrow.up" size={20} color={barve.primary} />
          </TouchableOpacity>
        </View>

        <ThemedText type="h3" style={styles.sectionTitle}>Members</ThemedText>
        {clani.map((clan) => {
          const jeTaLastnik = clan.user_id === skupina.created_by;
          return (
            <View key={clan.user_id} style={[styles.memberCard, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background, borderWidth: 1, borderColor: barve.border }]}>
              {clan.avatar_url ? (
                <Image source={{ uri: clan.avatar_url }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatarPlaceholder, { backgroundColor: barve.backgroundSecondary }]}>
                  <IconSymbol name="person.fill" size={18} color={barve.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.groupNameRow}>
                  <ThemedText type="bodyBold">{clan.display_name || clan.username}</ThemedText>
                  {jeTaLastnik && <IconSymbol name="star.fill" size={12} color={barve.primary} style={{ marginLeft: 6 }} />}
                </View>
                <ThemedText type="caption" variant="muted">{formatArea(clan.area_m2)}</ThemedText>
              </View>
              {jeLastnik && !jeTaLastnik && (
                <TouchableOpacity onPress={() => obdelajOdstranitev(clan)} activeOpacity={0.7} style={{ padding: 6 }}>
                  <IconSymbol name="xmark" size={16} color={barve.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {jeLastnik ? (
          <View style={styles.ownerSection}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderWidth: 1, borderColor: barve.border }]}
              onPress={obdelajPreklopVidnosti}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" variant="primary">
                {skupina.is_public ? 'Make private' : 'Make public'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderWidth: 1, borderColor: barve.border }]}
              onPress={obdelajNovoKodo}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" variant="primary">New Code</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dangerButton, { borderColor: '#E53935' }]}
              onPress={obdelajBrisanje}
              disabled={dejanjeVTeku}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" lightColor="#E53935" darkColor="#E53935">Delete Group</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: '#E53935', marginTop: Spacing.lg, marginBottom: Spacing.xl }]}
            onPress={obdelajZapustitev}
            disabled={dejanjeVTeku}
            activeOpacity={0.7}>
            <ThemedText type="bodyBold" lightColor="#E53935" darkColor="#E53935">Leave Group</ThemedText>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonIcon: { padding: 4 },
  content: { flex: 1, padding: Spacing.md },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  backButton: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.card },
  infoSection: { alignItems: 'center', marginBottom: Spacing.lg },
  colorDotLarge: { width: 48, height: 48, borderRadius: 24, marginBottom: Spacing.sm },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  description: { textAlign: 'center', marginBottom: Spacing.md },
  totalCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.card, width: '100%', marginBottom: Spacing.sm },
  activeClanRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.card, width: '100%', marginBottom: Spacing.sm },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderRadius: BorderRadius.card, width: '100%' },
  sectionTitle: { marginBottom: Spacing.sm },
  groupNameRow: { flexDirection: 'row', alignItems: 'center' },
  memberCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.card, marginBottom: Spacing.sm, gap: Spacing.sm },
  memberAvatar: { width: 40, height: 40, borderRadius: 20 },
  memberAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  ownerSection: { marginTop: Spacing.md, marginBottom: Spacing.xl, gap: Spacing.sm },
  secondaryButton: { paddingVertical: Spacing.md, borderRadius: BorderRadius.card, alignItems: 'center' },
  dangerButton: { paddingVertical: Spacing.md, borderRadius: BorderRadius.card, alignItems: 'center', borderWidth: 2 },
});
