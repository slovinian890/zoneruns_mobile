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
  GROUP_MEMBER_LIMIT,
} from '@/services/groupsService';
import { getCurrentUser } from '@/services/authService';
import { formatArea } from '@/services/territoryService';
import { Group, GroupMemberStat } from '@/services/supabase';

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

  useFocusEffect(
    useCallback(() => {
      if (groupId) naloziPodatke();
    }, [groupId])
  );

  const naloziPodatke = async () => {
    if (!groupId) return;
    try {
      const [uporabnik, rezultatSkupine, statistikaClanov] = await Promise.all([
        getCurrentUser(),
        getGroup(groupId),
        getGroupStats(groupId),
      ]);
      setTrenutniUporabnikId(uporabnik?.id ?? null);
      if (rezultatSkupine.success && rezultatSkupine.group) setSkupina(rezultatSkupine.group);
      setClani(statistikaClanov);
    } catch (napaka) {
      console.error('Napaka pri nalaganju skupine:', napaka);
    } finally {
      setNalaganje(false);
    }
  };

  const jeLastnik = !!skupina && !!trenutniUporabnikId && skupina.created_by === trenutniUporabnikId;
  const skupnaPovrsina = clani.reduce((v, c) => v + c.area_m2, 0);

  const obdelajDeljenje = async () => {
    if (!skupina) return;
    try {
      await Share.share({
        message: `Pridruži se moji skupini "${skupina.name}" v ZoneRuns! Koda: ${skupina.invite_code}`,
      });
    } catch {}
  };

  const obdelajZapustitev = () => {
    Alert.alert('Zapusti skupino', `Ali ste prepričani, da želite zapustiti "${skupina?.name}"?`, [
      { text: 'Prekliči', style: 'cancel' },
      {
        text: 'Zapusti',
        style: 'destructive',
        onPress: async () => {
          setDejanjeVTeku(true);
          const rezultat = await leaveGroup(groupId);
          setDejanjeVTeku(false);
          if (rezultat.success) {
            usmerjevalnik.back();
          } else {
            Alert.alert('Napaka', rezultat.error || 'Zapustitev ni uspela');
          }
        },
      },
    ]);
  };

  const obdelajOdstranitev = (clan: GroupMemberStat) => {
    Alert.alert('Odstrani člana', `Odstranite ${clan.display_name || clan.username} iz skupine?`, [
      { text: 'Prekliči', style: 'cancel' },
      {
        text: 'Odstrani',
        style: 'destructive',
        onPress: async () => {
          const rezultat = await removeMember(groupId, clan.user_id);
          if (rezultat.success) {
            naloziPodatke();
          } else {
            Alert.alert('Napaka', rezultat.error || 'Odstranitev ni uspela');
          }
        },
      },
    ]);
  };

  const obdelajBrisanje = () => {
    Alert.alert('Izbriši skupino', `Skupina "${skupina?.name}" bo trajno izbrisana za vse člane. Tega dejanja ni mogoče razveljaviti.`, [
      { text: 'Prekliči', style: 'cancel' },
      {
        text: 'Izbriši',
        style: 'destructive',
        onPress: async () => {
          setDejanjeVTeku(true);
          const rezultat = await deleteGroup(groupId);
          setDejanjeVTeku(false);
          if (rezultat.success) {
            usmerjevalnik.back();
          } else {
            Alert.alert('Napaka', rezultat.error || 'Brisanje ni uspelo');
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
      Alert.alert('Napaka', rezultat.error || 'Posodobitev ni uspela');
    }
  };

  const obdelajNovoKodo = () => {
    Alert.alert('Nova koda za pridružitev', 'Stara koda ne bo več delovala. Nadaljujete?', [
      { text: 'Prekliči', style: 'cancel' },
      {
        text: 'Ustvari novo',
        onPress: async () => {
          const rezultat = await regenerateInviteCode(groupId);
          if (rezultat.success && rezultat.code && skupina) {
            setSkupina({ ...skupina, invite_code: rezultat.code });
          } else {
            Alert.alert('Napaka', rezultat.error || 'Ustvarjanje nove kode ni uspelo');
          }
        },
      },
    ]);
  };

  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!skupina) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Skupina ni najdena</ThemedText>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: barve.primary }]} onPress={() => usmerjevalnik.back()} activeOpacity={0.7}>
            <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>Nazaj</ThemedText>
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
              {skupina.is_public ? 'Javna skupina' : 'Zasebna skupina'} · {clani.length}/{GROUP_MEMBER_LIMIT} članov
            </ThemedText>
          </View>
          {!!skupina.description && (
            <ThemedText type="body" variant="secondary" style={styles.description}>{skupina.description}</ThemedText>
          )}

          <View style={[styles.totalCard, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary, borderWidth: 1, borderColor: barve.border }]}>
            <IconSymbol name="hexagon.fill" size={22} color={barve.primary} />
            <View style={{ flex: 1 }}>
              <ThemedText type="h3" variant="primary">{formatArea(skupnaPovrsina)}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Skupno ozemlje skupine</ThemedText>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.codeRow, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary, borderWidth: 1, borderColor: barve.border }]}
            onPress={obdelajDeljenje}
            activeOpacity={0.7}>
            <View>
              <ThemedText type="caption" variant="muted">Koda za pridružitev</ThemedText>
              <ThemedText type="h3" style={{ letterSpacing: 2 }}>{skupina.invite_code}</ThemedText>
            </View>
            <IconSymbol name="square.and.arrow.up" size={20} color={barve.primary} />
          </TouchableOpacity>
        </View>

        <ThemedText type="h3" style={styles.sectionTitle}>Člani</ThemedText>
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
                {skupina.is_public ? 'Naredi zasebno' : 'Naredi javno'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderWidth: 1, borderColor: barve.border }]}
              onPress={obdelajNovoKodo}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" variant="primary">Nova koda</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dangerButton, { borderColor: '#E53935' }]}
              onPress={obdelajBrisanje}
              disabled={dejanjeVTeku}
              activeOpacity={0.7}>
              <ThemedText type="bodyBold" lightColor="#E53935" darkColor="#E53935">Izbriši skupino</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: '#E53935', marginTop: Spacing.lg, marginBottom: Spacing.xl }]}
            onPress={obdelajZapustitev}
            disabled={dejanjeVTeku}
            activeOpacity={0.7}>
            <ThemedText type="bodyBold" lightColor="#E53935" darkColor="#E53935">Zapusti skupino</ThemedText>
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
