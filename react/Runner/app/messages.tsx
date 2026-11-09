import { StyleSheet, View, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { Avatar } from '@/components/ui/avatar';
import { listRowDividerStyle } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { AuroraColors, Spacing } from '@/constants/theme';
import { SearchBar } from '@/components/ui/search-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { getConversations, subscribeToMessages, unsubscribeFromMessages } from '@/services/messagesService';
import { searchProfiles } from '@/services/profileService';
import { getCurrentUser } from '@/services/authService';
import { Conversation, Profile } from '@/services/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export default function MessagesScreen() {
  useAmbientVariant('default');
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastQueryRef = useRef('');

  const loadConversations = useCallback(async () => {
    const result = await getConversations();
    if (result.success) setConversations(result.conversations);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (!u) return;
      setCurrentUserId(u.id);
      channelRef.current = subscribeToMessages(u.id, () => {
        loadConversations();
      });
    });

    return () => {
      if (channelRef.current) unsubscribeFromMessages(channelRef.current);
    };
  }, [loadConversations]);

  const onRefresh = () => {
    setRefreshing(true);
    loadConversations();
  };

  const runSearch = async (text: string) => {
    lastQueryRef.current = text;
    if (!text) {
      setResults([]);
      return;
    }
    const result = await searchProfiles(text);
    if (lastQueryRef.current !== text) return; // a newer query already superseded this one
    if (result.success && result.profiles) {
      setResults(result.profiles.filter((p) => p.id !== currentUserId));
    }
  };

  const openChat = (userId: string) => {
    setSearching(false);
    setQuery('');
    setResults([]);
    router.push({ pathname: '/chat', params: { userId } });
  };

  const formatTimeAgo = (timestamp: string): string => {
    const time = new Date(timestamp).getTime();
    if (isNaN(time)) return '';
    const seconds = Math.floor((Date.now() - time) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString();
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const unread = item.unread_count > 0;
    const isMine = item.last_sender_id === currentUserId;

    return (
      <TouchableOpacity style={styles.row} onPress={() => openChat(item.partner_id)} activeOpacity={0.7}>
        <Avatar uri={item.avatar_url} />
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <ThemedText type={unread ? 'bodyBold' : 'body'} numberOfLines={1} style={{ flex: 1 }}>
              {item.display_name || item.username}
            </ThemedText>
            <ThemedText type="caption" variant="muted">
              {formatTimeAgo(item.last_message_at)}
            </ThemedText>
          </View>
          <View style={styles.rowBottom}>
            <ThemedText
              type="bodySmall"
              variant={unread ? undefined : 'muted'}
              numberOfLines={1}
              style={{ flex: 1 }}>
              {isMine ? 'You: ' : ''}
              {item.last_message}
            </ThemedText>
            {unread && (
              <View style={styles.unreadBadge}>
                <ThemedText type="caption" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
                  {item.unread_count}
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSearchResult = ({ item }: { item: Profile }) => (
    <TouchableOpacity style={styles.row} onPress={() => openChat(item.id)} activeOpacity={0.7}>
      <Avatar uri={item.avatar_url} />
      <View style={styles.rowContent}>
        <ThemedText type="bodyBold">{item.display_name || item.username}</ThemedText>
        <ThemedText type="caption" variant="muted">@{item.username}</ThemedText>
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Messages"
        onBack={() => router.back()}
        actions={[{ icon: searching ? 'xmark' : 'plus', onPress: () => setSearching((s) => !s) }]}
      />

      {searching && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={styles.searchSection}>
          <SearchBar value={query} onChangeText={setQuery} onSearch={runSearch} placeholder="Search people to message" autoFocus />
        </Animated.View>
      )}

      {searching ? (
        <FlatList
          data={results}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={listRowDividerStyle} />}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.emptyState}>
                <ThemedText type="body" variant="muted">No users found</ThemedText>
              </View>
            ) : null
          }
        />
      ) : loading ? (
        <View style={styles.emptyState}>
          <ThemedText type="body" variant="secondary">Loading...</ThemedText>
        </View>
      ) : conversations.length === 0 ? (
        <EmptyState icon="paperplane" title="No messages yet" subtitle="Tap + to start a conversation" />
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.partner_id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.lg }]}
          ItemSeparatorComponent={() => <View style={listRowDividerStyle} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AuroraColors.primary} />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  searchSection: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  list: { paddingHorizontal: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  rowContent: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: AuroraColors.primary,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
});
