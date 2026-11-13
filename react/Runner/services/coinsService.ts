/**
 * Coins — a run reward on top of territory capture. Every saved run earns
 * coins based on distance, tiered: under 5km = 1, 5-10km = 2, and so on.
 *
 * The actual award happens server-side (award_run_coins() trigger on the
 * runs table, see supabase/migrations/010_coins_badges_leaderboard.sql) so
 * it can't be missed by an offline-synced run. coinsForDistance() below is
 * the same formula, kept client-side only so the post-run screen can show
 * "+N coins" immediately without waiting on a refetch.
 */

import { supabase, CoinTransaction } from './supabase';
import { getCurrentUser } from './authService';

/** Mirrors award_run_coins()'s SQL exactly — keep the two in sync. */
export function coinsForDistance(distanceKm: number): number {
  return Math.max(1, Math.floor(distanceKm / 5) + 1);
}

/** Current user's recent coin payouts, most recent first. */
export async function getMyCoinHistory(limit: number = 20): Promise<CoinTransaction[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('coin_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('getMyCoinHistory error:', error.message);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.warn('getMyCoinHistory exception:', e);
    return [];
  }
}
