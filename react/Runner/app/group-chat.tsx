import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuroraColors, Colors, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getGroupMessages,
  sendGroupMessage,
  subscribeToGroupMessages,
  unsubscribeFromGroupMessages,
} from '@/services/groupMessagesService';
import { getGroup } from '@/services/groupsService';
import { getCurrentUser } from '@/services/authService';
import { Group, GroupMessage, GroupMessageWithAuthor } from '@/services/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export default function GroupChatScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const [skupina, setSkupina] = useState<Group | null>(null);
  const [trenutniUporabnikId, setTrenutniUporabnikId] = useState<string | null>(null);
  const [sporocila, setSporocila] = useState<GroupMessageWithAuthor[]>([]);
  const [osnutek, setOsnutek] = useState('');
  const [nalaganje, setNalaganje] = useState(true);
  const [posiljanje, setPosiljanje] = useState(false);

  const listRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const pomakniNaKonec = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    if (!groupId) return;
    let preklicano = false;

    (async () => {
      const [uporabnik, rezultatSkupine, rezultatSporocil] = await Promise.all([
        getCurrentUser(),
        getGroup(groupId),
        getGroupMessages(groupId),
      ]);

      if (preklicano) return;

      if (uporabnik) setTrenutniUporabnikId(uporabnik.id);
      if (rezultatSkupine.success && rezultatSkupine.group) setSkupina(rezultatSkupine.group);
      if (rezultatSporocil.success) setSporocila(rezultatSporocil.messages);
      setNalaganje(false);

      channelRef.current = subscribeToGroupMessages(groupId, (prejeto: GroupMessage) => {
        setSporocila((prej) => {
          if (prej.some((s) => s.id === prejeto.id)) return prej;
          // Realtime payload has no joined profile -- fill it in from the
          // sender's own profile row if we already know it from the
          // messages we've loaded, otherwise show a plain fallback.
          const ze = prej.find((s) => s.sender_id === prejeto.sender_id);
          return [...prej, { ...prejeto, profiles: ze?.profiles ?? { username: '', display_name: null, avatar_url: null } }];
        });
        pomakniNaKonec();
      });
    })();

    return () => {
      preklicano = true;
      if (channelRef.current) unsubscribeFromGroupMessages(channelRef.current);
    };
  }, [groupId, pomakniNaKonec]);

  useEffect(() => {
    if (!nalaganje) pomakniNaKonec();
  }, [nalaganje, pomakniNaKonec]);

  const obdelajPosiljanje = async () => {
    const besedilo = osnutek.trim();
    if (!besedilo || !groupId || posiljanje) return;

    setPosiljanje(true);
    setOsnutek('');
    const rezultat = await sendGroupMessage(groupId, besedilo);
    setPosiljanje(false);

    if (rezultat.success && rezultat.message) {
      setSporocila((prej) =>
        prej.some((s) => s.id === rezultat.message!.id)
          ? prej
          : [
              ...prej,
              {
                ...rezultat.message!,
                profiles: { username: '', display_name: 'Vi', avatar_url: null },
              },
            ],
      );
      pomakniNaKonec();
    } else {
      setOsnutek(besedilo);
    }
  };

  const oblikujCas = (timestamp: string): string => {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const izrisiSporocilo = ({ item }: { item: GroupMessageWithAuthor }) => {
    const jeMoje = item.sender_id === trenutniUporabnikId;
    return (
      <View style={[styles.bubbleRow, jeMoje ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
        {!jeMoje && (
          <ThemedText type="caption" variant="muted" style={styles.senderName}>
            {item.profiles?.display_name || item.profiles?.username || 'Tekač'}
          </ThemedText>
        )}
        <View
          style={[
            styles.bubble,
            jeMoje
              ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
              : { backgroundColor: isDark ? colors.card : colors.backgroundSecondary, borderBottomLeftRadius: 4 },
          ]}>
          <ThemedText type="body" lightColor={jeMoje ? AuroraColors.onPrimary : undefined} darkColor={jeMoje ? AuroraColors.onPrimary : undefined}>
            {item.content}
          </ThemedText>
        </View>
        <ThemedText type="caption" variant="muted" style={jeMoje ? styles.timeMine : styles.timeTheirs}>
          {oblikujCas(item.created_at)}
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: isDark ? colors.card : colors.backgroundSecondary, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <IconSymbol name="chevron.left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {skupina && <View style={[styles.colorDot, { backgroundColor: skupina.color }]} />}
          <ThemedText type="bodyBold" numberOfLines={1}>{skupina?.name || 'Skupina'}</ThemedText>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {nalaganje ? (
          <View style={styles.emptyState}>
            <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={sporocila}
            renderItem={izrisiSporocilo}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={pomakniNaKonec}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <ThemedText type="body" variant="muted">Bodite prvi, ki nekaj napiše 👋</ThemedText>
              </View>
            }
          />
        )}

        <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: isDark ? colors.card : colors.background }]}>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? colors.background : colors.backgroundSecondary, color: colors.text }]}
            value={osnutek}
            onChangeText={setOsnutek}
            placeholder="Sporočilo skupini..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={obdelajPosiljanje}
            disabled={!osnutek.trim() || posiljanje}
            style={[styles.sendButton, (!osnutek.trim() || posiljanje) && { opacity: 0.4 }]}
            activeOpacity={0.7}>
            <IconSymbol name="paperplane.fill" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: Spacing.xs, width: 32, alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  messagesList: { padding: Spacing.md, flexGrow: 1 },
  bubbleRow: { marginBottom: Spacing.sm, maxWidth: '78%' },
  bubbleRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderName: { marginBottom: 2, marginLeft: 4 },
  bubble: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.large },
  timeMine: { marginTop: 2, marginRight: 4 },
  timeTheirs: { marginTop: 2, marginLeft: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, padding: Spacing.sm, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: BorderRadius.large, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 16, maxHeight: 120 },
  sendButton: { padding: Spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
});
