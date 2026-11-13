/**
 * Heroes — collectible pixel-art characters, unlocked and upgraded with
 * coins (see coinsService.ts). Every account owns one random hero from the
 * moment getMyHeroes() is first called (granted server-side, see
 * get_my_heroes() in supabase/migrations/011_heroes.sql) — there's no
 * separate "claim your starter" step on the client.
 */

import { supabase, MyHero, HeroActionResult } from './supabase';

/** Full catalog joined with the current user's ownership/tier/active flag. */
export async function getMyHeroes(): Promise<MyHero[]> {
  try {
    const { data, error } = await supabase.rpc('get_my_heroes');
    if (error) {
      console.warn('getMyHeroes error:', error.message);
      return [];
    }
    return (data ?? []) as MyHero[];
  } catch (e) {
    console.warn('getMyHeroes exception:', e);
    return [];
  }
}

export async function unlockHero(heroId: string): Promise<HeroActionResult> {
  try {
    const { data, error } = await supabase.rpc('unlock_hero', { p_hero_id: heroId });
    if (error) {
      console.warn('unlockHero error:', error.message);
      return { success: false };
    }
    return data as HeroActionResult;
  } catch (e) {
    console.warn('unlockHero exception:', e);
    return { success: false };
  }
}

export async function upgradeHero(heroId: string): Promise<HeroActionResult> {
  try {
    const { data, error } = await supabase.rpc('upgrade_hero', { p_hero_id: heroId });
    if (error) {
      console.warn('upgradeHero error:', error.message);
      return { success: false };
    }
    return data as HeroActionResult;
  } catch (e) {
    console.warn('upgradeHero exception:', e);
    return { success: false };
  }
}

export async function setActiveHero(heroId: string): Promise<HeroActionResult> {
  try {
    const { data, error } = await supabase.rpc('set_active_hero', { p_hero_id: heroId });
    if (error) {
      console.warn('setActiveHero error:', error.message);
      return { success: false };
    }
    return data as HeroActionResult;
  } catch (e) {
    console.warn('setActiveHero exception:', e);
    return { success: false };
  }
}

/** Mirrors hero_upgrade_cost() in SQL — keep the two in sync. */
export function heroUpgradeCost(tier: number): number {
  return 10 + tier * 2;
}

export const HERO_MAX_TIER = 15;

export const RARITY_COLORS: Record<string, string> = {
  common: '#9BA28A',
  rare: '#5B9FE8',
  epic: '#B35BE8',
  legendary: '#E8C23C',
};
