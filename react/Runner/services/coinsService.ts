/**
 * Coins — a run reward on top of territory capture, plus a daily login
 * bonus. Every saved run earns coins based on distance, tiered: under 5km
 * = 1, 5-10km = 2, and so on.
 *
 * The actual award happens server-side (award_run_coins() trigger on the
 * runs table, see supabase/migrations/010_coins_badges_leaderboard.sql) so
 * it can't be missed by an offline-synced run. coinsForDistance() below is
 * the same formula, kept client-side only so the post-run screen can show
 * "+N coins" immediately without waiting on a refetch.
 */

import { supabase, CoinTransaction, ClaimDailyLoginResult } from './supabase';
import { getCurrentUser } from './authService';

/** Mirrors award_run_coins()'s SQL exactly — keep the two in sync. */
export function coinsForDistance(distanceKm: number): number {
  return Math.max(1, Math.floor(distanceKm / 5) + 1);
}

/**
 * Slovenian noun declension for "kovanec" (coin) isn't a simple suffix swap
 * (kovanec → kovanca, not "kovanekca"), so this spells out the four forms
 * instead of guessing one from a stem. Shared by every screen that shows a
 * coin count (post-run-modal, daily-login-provider, ...).
 */
export function besedaZaKovance(n: number): string {
  if (n === 1) return 'kovanec';
  if (n === 2) return 'kovanca';
  if (n === 3 || n === 4) return 'kovanci';
  return 'kovancev';
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

/**
 * Call once per app start (see components/daily-login-provider.tsx). Pays
 * out a streak-scaled coin bonus the first time it's called on a given
 * calendar day (server-enforced via claim_daily_login() — see
 * supabase/migrations/013_daily_login.sql) and no-ops on every later call
 * that same day.
 */
export async function claimDailyLogin(): Promise<ClaimDailyLoginResult> {
  try {
    const { data, error } = await supabase.rpc('claim_daily_login');
    if (error) {
      console.warn('claimDailyLogin error:', error.message);
      return { success: false };
    }
    return (data as ClaimDailyLoginResult) ?? { success: false };
  } catch (e) {
    console.warn('claimDailyLogin exception:', e);
    return { success: false };
  }
}
