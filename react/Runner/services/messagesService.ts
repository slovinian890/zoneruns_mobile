import { supabase, Message, Conversation } from './supabase';
import { getCurrentUser } from './authService';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================
// CONVERSATIONS
// ============================================

/**
 * List conversations (one row per chat partner), newest message first.
 */
export const getConversations = async (): Promise<{ success: boolean; conversations: Conversation[]; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('get_conversations');

    if (error) {
      return { success: false, conversations: [], error: error.message };
    }

    return { success: true, conversations: (data as Conversation[]) ?? [] };
  } catch (error) {
    console.error('Get conversations error:', error);
    return { success: false, conversations: [], error: 'An unexpected error occurred' };
  }
};

/**
 * Total unread message count across all conversations (for a badge).
 */
export const getUnreadMessageCount = async (): Promise<number> => {
  try {
    const { data, error } = await supabase.rpc('get_unread_message_count');
    if (error) return 0;
    return Number(data) || 0;
  } catch {
    return 0;
  }
};

// ============================================
// MESSAGES IN A THREAD
// ============================================

/**
 * All messages exchanged with one other user, oldest first.
 */
export const getMessages = async (
  otherUserId: string,
  limit: number = 100
): Promise<{ success: boolean; messages: Message[]; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, messages: [], error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      return { success: false, messages: [], error: error.message };
    }

    return { success: true, messages: data ?? [] };
  } catch (error) {
    console.error('Get messages error:', error);
    return { success: false, messages: [], error: 'An unexpected error occurred' };
  }
};

/**
 * Send a message to another user.
 */
export const sendMessage = async (
  recipientId: string,
  content: string
): Promise<{ success: boolean; message?: Message; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return { success: false, error: 'Message cannot be empty' };
    }

    if (user.id === recipientId) {
      return { success: false, error: 'Cannot message yourself' };
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: user.id, recipient_id: recipientId, content: trimmed })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, message: data };
  } catch (error) {
    console.error('Send message error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Mark every unread message from one sender as read.
 */
export const markConversationRead = async (otherUserId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .eq('sender_id', otherUserId)
      .is('read_at', null);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Mark conversation read error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

// ============================================
// REAL-TIME
// ============================================

/**
 * Subscribe to new messages involving the current user (both directions).
 * Filter client-side by otherUserId if you only care about one thread.
 */
export const subscribeToMessages = (
  currentUserId: string,
  onMessage: (message: Message) => void
): RealtimeChannel => {
  return supabase
    .channel(`messages:${currentUserId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${currentUserId}` },
      (payload) => onMessage(payload.new as Message)
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${currentUserId}` },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe();
};

export const unsubscribeFromMessages = (channel: RealtimeChannel): void => {
  supabase.removeChannel(channel);
};
