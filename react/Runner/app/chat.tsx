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
import { Image } from 'expo-image';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuroraColors, Colors, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getMessages,
  sendMessage,
  markConversationRead,
  subscribeToMessages,
  unsubscribeFromMessages,
} from '@/services/messagesService';
import { getProfileById } from '@/services/profileService';
import { getCurrentUser } from '@/services/authService';
import { Message, Profile } from '@/services/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { userId: otherUserId } = useLocalSearchParams<{ userId: string }>();

  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    if (!otherUserId) return;
    let cancelled = false;

    (async () => {
      const [user, profileResult, messagesResult] = await Promise.all([
        getCurrentUser(),
        getProfileById(otherUserId),
        getMessages(otherUserId),
      ]);

      if (cancelled) return;

      if (user) setCurrentUserId(user.id);
      if (profileResult.success && profileResult.profile) setOtherProfile(profileResult.profile);
      if (messagesResult.success) setMessages(messagesResult.messages);
      setLoading(false);

      markConversationRead(otherUserId);

      if (user) {
        channelRef.current = subscribeToMessages(user.id, (incoming) => {
          const isThisThread =
            (incoming.sender_id === otherUserId && incoming.recipient_id === user.id) ||
            (incoming.sender_id === user.id && incoming.recipient_id === otherUserId);
          if (!isThisThread) return;

          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));

          if (incoming.sender_id === otherUserId) {
            markConversationRead(otherUserId);
          }
          scrollToEnd();
        });
      }
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) unsubscribeFromMessages(channelRef.current);
    };
  }, [otherUserId, scrollToEnd]);

  useEffect(() => {
    if (!loading) scrollToEnd();
  }, [loading, scrollToEnd]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !otherUserId || sending) return;

    setSending(true);
    setDraft('');
    const result = await sendMessage(otherUserId, text);
    setSending(false);

    if (result.success && result.message) {
      setMessages((prev) => (prev.some((m) => m.id === result.message!.id) ? prev : [...prev, result.message!]));
      scrollToEnd();
    } else {
      setDraft(text);
    }
  };

  const formatTime = (timestamp: string): string => {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === currentUserId;
    return (
      <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
        <View
          style={[
            styles.bubble,
            isMine
              ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
              : {
                  backgroundColor: isDark ? colors.card : colors.backgroundSecondary,
                  borderBottomLeftRadius: 4,
                },
          ]}>
          <ThemedText
            type="body"
            lightColor={isMine ? AuroraColors.onPrimary : undefined}
            darkColor={isMine ? AuroraColors.onPrimary : undefined}>
            {item.content}
          </ThemedText>
        </View>
        <ThemedText type="caption" variant="muted" style={isMine ? styles.timeMine : styles.timeTheirs}>
          {formatTime(item.created_at)}
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          { backgroundColor: isDark ? colors.card : colors.backgroundSecondary, borderBottomColor: colors.border },
        ]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <IconSymbol name="chevron.left" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={0.7}
          onPress={() => otherUserId && router.push({ pathname: '/user-profile', params: { userId: otherUserId } })}>
          {otherProfile?.avatar_url ? (
            <Image source={{ uri: otherProfile.avatar_url }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.background }]}>
              <IconSymbol name="person.fill" size={16} color={colors.primary} />
            </View>
          )}
          <ThemedText type="bodyBold" numberOfLines={1}>
            {otherProfile?.display_name || otherProfile?.username || 'Runner'}
          </ThemedText>
        </TouchableOpacity>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {loading ? (
          <View style={styles.emptyState}>
            <ThemedText type="body" variant="secondary">Loading...</ThemedText>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={scrollToEnd}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <ThemedText type="body" variant="muted">Say hi 👋</ThemedText>
              </View>
            }
          />
        )}

        <View
          style={[
            styles.inputBar,
            { borderTopColor: colors.border, backgroundColor: isDark ? colors.card : colors.background },
          ]}>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: isDark ? colors.background : colors.backgroundSecondary, color: colors.text },
            ]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            style={[styles.sendButton, (!draft.trim() || sending) && { opacity: 0.4 }]}
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
  headerAvatar: { width: 28, height: 28, borderRadius: 14 },
  headerAvatarPlaceholder: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  messagesList: { padding: Spacing.md, flexGrow: 1 },
  bubbleRow: { marginBottom: Spacing.sm, maxWidth: '78%' },
  bubbleRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.large,
  },
  timeMine: { marginTop: 2, marginRight: 4 },
  timeTheirs: { marginTop: 2, marginLeft: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: BorderRadius.large,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    maxHeight: 120,
  },
  sendButton: { padding: Spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
});
