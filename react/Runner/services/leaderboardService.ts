/**
 * Leaderboards — solo and clan, each all-time (currently-held territory)
 * and weekly (net area change over the last 7 days: claimed minus
 * stolen-from-them). The weekly board exists so the rankings don't stay
 * locked in forever by whoever claimed land first — see migration
 * 010_coins_badges_leaderboard.sql for the reasoning and the SQL.
 *
 * All-time clan leaderboard is groupsService.getGroupLeaderboard() — not
 * duplicated here.
 */

import { supabase, TerritoryLeaderboardEntry, WeeklyLeaderboardEntry, WeeklyGroupLeaderboardEntry } from './supabase';

/** Solo, all-time, ranked by currently-held territory. */
export async function getTerritoryLeaderboard(limit: number = 50): Promise<TerritoryLeaderboardEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_territory_leaderboard', { p_limit: limit });
    if (error) {
      console.warn('getTerritoryLeaderboard error:', error.message);
      return [];
    }
    return (data ?? []) as TerritoryLeaderboardEntry[];
  } catch (e) {
    console.warn('getTerritoryLeaderboard exception:', e);
    return [];
  }
}

/** Solo, this week, ranked by net area change. */
export async function getWeeklyLeaderboard(limit: number = 50): Promise<WeeklyLeaderboardEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_leaderboard', { p_limit: limit });
    if (error) {
      console.warn('getWeeklyLeaderboard error:', error.message);
      return [];
    }
    return (data ?? []) as WeeklyLeaderboardEntry[];
  } catch (e) {
    console.warn('getWeeklyLeaderboard exception:', e);
    return [];
  }
}

/** Clans, this week, ranked by combined net area change. */
export async function getWeeklyGroupLeaderboard(limit: number = 20): Promise<WeeklyGroupLeaderboardEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_group_leaderboard', { p_limit: limit });
    if (error) {
      console.warn('getWeeklyGroupLeaderboard error:', error.message);
      return [];
    }
    return (data ?? []) as WeeklyGroupLeaderboardEntry[];
  } catch (e) {
    console.warn('getWeeklyGroupLeaderboard exception:', e);
    return [];
  }
}

/** "+1.2 km²" / "-450 m²" — signed area for the weekly net-change column. */
export function formatNetArea(areaM2: number): string {
  const sign = areaM2 >= 0 ? '+' : '-';
  const abs = Math.abs(areaM2);
  const formatted = abs >= 10000 ? `${(abs / 1_000_000).toFixed(2)} km²` : `${Math.round(abs).toLocaleString()} m²`;
  return `${sign}${formatted}`;
}
