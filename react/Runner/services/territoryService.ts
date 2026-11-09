/**
 * Territory Service – closed-loop polygon capture.
 *
 * When a run's path returns close to its own starting point, the server
 * (see supabase/migrations) turns the loop into a real polygon, merges it
 * into the runner's owned MultiPolygon, and subtracts it from any other
 * runner's territory it overlaps — a piece if the loop only cuts into their
 * land, all of it if the loop fully encloses it.
 *
 * All geometry math happens in Postgres/PostGIS. This file just calls the
 * RPCs and shapes the results for the map + UI.
 */

import { supabase, ClaimTerritoryResult, TerritoryFeature } from './supabase';

export const LOOP_CLOSE_THRESHOLD_M = 40;
export const MIN_LOOP_AREA_M2 = 300;

/**
 * Call right after a run is saved. Turns the run's route into a claimed
 * polygon if (and only if) the path closes a loop near its own start.
 * `placeLabel` (best-effort reverse-geocoded, e.g. "Tivoli Park") rides
 * along into any attack_notifications rows this claim generates, so a
 * victim's push alert can say "near X" instead of just a bare area.
 */
export async function claimTerritoryFromRun(runId: string, placeLabel?: string | null): Promise<ClaimTerritoryResult> {
  try {
    const { data, error } = await supabase.rpc('claim_territory_from_run', {
      p_run_id: runId,
      p_place_label: placeLabel ?? null,
    });
    if (error) {
      console.warn('claimTerritoryFromRun error:', error.message);
      return { success: false };
    }
    return (data as ClaimTerritoryResult) ?? { success: false };
  } catch (e) {
    console.warn('claimTerritoryFromRun exception:', e);
    return { success: false };
  }
}

/**
 * Fetch every runner's claimed territory that intersects the given map
 * bounds, clipped to those bounds server-side to keep payloads small.
 */
export async function getTerritoriesInBounds(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<TerritoryFeature[]> {
  try {
    const { data, error } = await supabase.rpc('get_territories_in_bounds', {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
    });

    if (error) {
      console.warn('getTerritoriesInBounds error:', error.message);
      return [];
    }

    return (data ?? [])
      .filter((row: any) => !!row.geojson)
      .map((row: any) => ({
        user_id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        trail_color: row.trail_color ?? '#C9D54A',
        area_m2: Number(row.area_m2) || 0,
        geojson: JSON.parse(row.geojson),
      }));
  } catch (e) {
    console.warn('getTerritoriesInBounds exception:', e);
    return [];
  }
}

/** Current user's total claimed area, for the Profile stats grid. */
export async function getMyTerritoryStats(): Promise<{ areaM2: number }> {
  try {
    const { data, error } = await supabase.rpc('get_my_territory_stats');
    if (error || !data) return { areaM2: 0 };
    return { areaM2: Number((data as any).area_m2) || 0 };
  } catch {
    return { areaM2: 0 };
  }
}

/** Human-friendly area: m² under 10,000, km² above. */
export function formatArea(areaM2: number): string {
  if (areaM2 >= 10000) return `${(areaM2 / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(areaM2).toLocaleString()} m²`;
}

// ── Haversine, used for the live "loop ready" hint while running ──
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * True once the live route has gone far enough out AND the current point
 * has come back close enough to the start to be claimable as a loop.
 * Mirrors the server-side rule so the UI can hint at it in real time.
 */
export function isLoopReady(route: Array<{ latitude: number; longitude: number }>): boolean {
  if (route.length < 8) return false;
  const start = route[0];
  const current = route[route.length - 1];
  const gap = distanceMeters(start, current);
  if (gap > LOOP_CLOSE_THRESHOLD_M) return false;

  // Require the runner to have actually gone somewhere, not just jittered
  // in place — find how far the path strayed from the start at its peak.
  let maxOut = 0;
  for (const pt of route) {
    const d = distanceMeters(start, pt);
    if (d > maxOut) maxOut = d;
  }
  return maxOut > LOOP_CLOSE_THRESHOLD_M * 1.5;
}
