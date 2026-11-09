/**
 * Groups – team competition.
 *
 * Anyone can create or join as many groups as they want (30-member cap per
 * group, enforced server-side by a trigger). A group is Public (searchable,
 * instant join) or Private (invite-code only) — every group has a code
 * either way, so joinGroupByCode() is the one path for both: a public
 * group's code travels along with it once it shows up in search, a private
 * group's code only reaches someone if the owner shares it directly.
 *
 * "Competing" means combined territory area across a group's members — the
 * same area_m2 the individual territory leaderboard already uses, just
 * summed per group (see supabase/migrations/006_groups.sql).
 */

import { supabase, Group, GroupWithRole, GroupMemberStat, GroupLeaderboardEntry, GroupTerritoryFeature } from './supabase';
import { getCurrentUser } from './authService';

export const GROUP_MEMBER_LIMIT = 30;

export const createGroup = async (
  name: string,
  description: string | null,
  color: string,
  isPublic: boolean,
): Promise<{ success: boolean; group?: Group; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('create_group', {
      p_name: name,
      p_description: description,
      p_color: color,
      p_is_public: isPublic,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, group: data as Group };
  } catch (error) {
    console.error('Create group error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

export const joinGroupByCode = async (
  code: string,
): Promise<{ success: boolean; group?: Group; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('join_group_by_code', { p_code: code.trim() });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, group: data as Group };
  } catch (error) {
    console.error('Join group error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/** Leave a group. The owner can't leave this way — they delete the group instead. */
export const leaveGroup = async (groupId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'User not authenticated' };

    const { error, count } = await supabase
      .from('group_members')
      .delete({ count: 'exact' })
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    if (error) return { success: false, error: error.message };
    if (!count) return { success: false, error: "As the owner, you can't leave — delete the group instead." };

    return { success: true };
  } catch (error) {
    console.error('Leave group error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/** Owner-only: remove someone else from the group. RLS blocks anything else. */
export const removeMember = async (
  groupId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error, count } = await supabase
      .from('group_members')
      .delete({ count: 'exact' })
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    if (!count) return { success: false, error: 'Could not remove that member' };

    return { success: true };
  } catch (error) {
    console.error('Remove member error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

export const deleteGroup = async (groupId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error, count } = await supabase.from('groups').delete({ count: 'exact' }).eq('id', groupId);
    if (error) return { success: false, error: error.message };
    if (!count) return { success: false, error: 'Only the owner can delete this group' };
    return { success: true };
  } catch (error) {
    console.error('Delete group error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

export const updateGroup = async (
  groupId: string,
  updates: Partial<Pick<Group, 'name' | 'description' | 'color' | 'is_public'>>,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.from('groups').update(updates).eq('id', groupId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    console.error('Update group error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

const generateInviteCode = (): string =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

/** Owner-only: rotate the invite code (e.g. a private group's code leaked too widely). */
export const regenerateInviteCode = async (
  groupId: string,
): Promise<{ success: boolean; code?: string; error?: string }> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateInviteCode();
    const { error } = await supabase.from('groups').update({ invite_code: code }).eq('id', groupId);
    if (!error) return { success: true, code };
    if (error.code !== '23505') return { success: false, error: error.message }; // not a collision — give up
  }
  return { success: false, error: 'Could not generate a new code, try again' };
};

/** Groups the current user belongs to, newest membership first. */
export const getMyGroups = async (): Promise<{ success: boolean; groups?: GroupWithRole[]; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'User not authenticated' };

    const { data: memberships, error: memberError } = await supabase
      .from('group_members')
      .select('group_id, role, joined_at')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false });

    if (memberError) return { success: false, error: memberError.message };
    if (!memberships || memberships.length === 0) return { success: true, groups: [] };

    const roleByGroupId = new Map(memberships.map((m) => [m.group_id, m.role]));
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('*')
      .in('id', memberships.map((m) => m.group_id));

    if (groupsError) return { success: false, error: groupsError.message };

    const order = memberships.map((m) => m.group_id);
    const byId = new Map((groups ?? []).map((g) => [g.id, g]));
    const ordered = order.map((id) => byId.get(id)).filter((g): g is Group => !!g);

    return {
      success: true,
      groups: ordered.map((g) => ({ ...g, role: roleByGroupId.get(g.id) ?? 'member' })),
    };
  } catch (error) {
    console.error('Get my groups error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/** Search public groups by name — same shape as profileService.searchProfiles. */
export const searchPublicGroups = async (
  query: string,
  limit: number = 10,
): Promise<{ success: boolean; groups?: Group[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('is_public', true)
      .ilike('name', `%${query}%`)
      .order('member_count', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, groups: data ?? [] };
  } catch (error) {
    console.error('Search groups error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

export const getGroup = async (groupId: string): Promise<{ success: boolean; group?: Group; error?: string }> => {
  try {
    const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, group: data };
  } catch (error) {
    console.error('Get group error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/** Member-by-member territory breakdown for one group, ranked highest first. */
export const getGroupStats = async (groupId: string): Promise<GroupMemberStat[]> => {
  try {
    const { data, error } = await supabase.rpc('get_group_stats', { p_group_id: groupId });
    if (error) {
      console.warn('getGroupStats error:', error.message);
      return [];
    }
    return (data ?? []) as GroupMemberStat[];
  } catch (e) {
    console.warn('getGroupStats exception:', e);
    return [];
  }
};

/** Public-groups leaderboard, ranked by combined member territory. */
export const getGroupLeaderboard = async (limit: number = 20): Promise<GroupLeaderboardEntry[]> => {
  try {
    const { data, error } = await supabase.rpc('get_group_leaderboard', { p_limit: limit });
    if (error) {
      console.warn('getGroupLeaderboard error:', error.message);
      return [];
    }
    return (data ?? []) as GroupLeaderboardEntry[];
  } catch (e) {
    console.warn('getGroupLeaderboard exception:', e);
    return [];
  }
};

/**
 * Each public group's members' territory, merged into one shape per group
 * and clipped to the given map bounds — same shape as territoryService's
 * getTerritoriesInBounds, aggregated per group instead of per user, so the
 * same TerritoryMap component renders both without any changes.
 */
export const getGroupTerritoriesInBounds = async (
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<GroupTerritoryFeature[]> => {
  try {
    const { data, error } = await supabase.rpc('get_group_territories_in_bounds', {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
    });

    if (error) {
      console.warn('getGroupTerritoriesInBounds error:', error.message);
      return [];
    }

    return (data ?? [])
      .filter((row: any) => !!row.geojson)
      .map((row: any) => ({
        group_id: row.group_id,
        name: row.name,
        color: row.color ?? '#2196F3',
        area_m2: Number(row.area_m2) || 0,
        geojson: JSON.parse(row.geojson),
      }));
  } catch (e) {
    console.warn('getGroupTerritoriesInBounds exception:', e);
    return [];
  }
};
