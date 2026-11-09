/**
 * Group chat – one broadcast thread per group, members-only (RLS enforces
 * both read and send are gated on current group_members rows — see
 * supabase/migrations/007_group_chat_and_territory.sql). Mirrors
 * messagesService.ts's 1:1 pattern, minus read receipts: there's no single
 * "recipient" to mark things read for in a group thread.
 */

import { supabase, GroupMessage, GroupMessageWithAuthor } from './supabase';
import { getCurrentUser } from './authService';
import { RealtimeChannel } from '@supabase/supabase-js';

/** All messages in a group's thread, oldest first. */
export const getGroupMessages = async (
  groupId: string,
  limit: number = 100,
): Promise<{ success: boolean; messages: GroupMessageWithAuthor[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*, profiles:sender_id(username, display_name, avatar_url)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      return { success: false, messages: [], error: error.message };
    }

    return { success: true, messages: (data as any) ?? [] };
  } catch (error) {
    console.error('Get group messages error:', error);
    return { success: false, messages: [], error: 'An unexpected error occurred' };
  }
};

export const sendGroupMessage = async (
  groupId: string,
  content: string,
): Promise<{ success: boolean; message?: GroupMessage; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return { success: false, error: 'Message cannot be empty' };
    }

    const { data, error } = await supabase
      .from('group_messages')
      .insert({ group_id: groupId, sender_id: user.id, content: trimmed })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, message: data };
  } catch (error) {
    console.error('Send group message error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/** Subscribe to new messages in one group's thread. */
export const subscribeToGroupMessages = (
  groupId: string,
  onMessage: (message: GroupMessage) => void,
): RealtimeChannel => {
  return supabase
    .channel(`group_messages:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      (payload) => onMessage(payload.new as GroupMessage),
    )
    .subscribe();
};

export const unsubscribeFromGroupMessages = (channel: RealtimeChannel): void => {
  supabase.removeChannel(channel);
};
