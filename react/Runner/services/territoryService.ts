/**
 * Territory Service – Compute hex territories from actual runs.
 *
 * Instead of a separate DB table, territories are derived on-the-fly
 * from the runs table.  Each run's route_data.coordinates are converted
 * to hex IDs.  The most-recent run that crosses a tile "owns" it.
 *
 * Uses a flat-top hex grid with offset coordinates.
 * Each hex ≈ 50 m radius, globally consistent IDs like "q_r".
 */

import { supabase, Run, RouteData } from './supabase';
import { getCurrentUser } from './authService';

// ─── Hex Grid Constants ──────────────────────────────────────
const HEX_SIZE = 0.00045; // degrees ≈ 50 m at mid-latitudes
const SQRT3 = Math.sqrt(3);

// ─── Hex Grid Math ───────────────────────────────────────────

/** Convert a lat/lng into the axial (q, r) of the enclosing flat-top hex */
export function latLngToHex(lat: number, lng: number): { q: number; r: number; hexId: string } {
  const q = Math.round(lng / (1.5 * HEX_SIZE));
  const isOdd = Math.abs(q % 2) === 1;
  const rowOffset = isOdd ? (SQRT3 / 2) * HEX_SIZE : 0;
  const r = Math.round((lat - rowOffset) / (SQRT3 * HEX_SIZE));
  return { q, r, hexId: `${q}_${r}` };
}

/** Centre lat/lng of a hex given its axial coordinates */
export function hexCenter(q: number, r: number): { lat: number; lng: number } {
  const isOdd = Math.abs(q % 2) === 1;
  const lng = q * 1.5 * HEX_SIZE;
  const lat = r * SQRT3 * HEX_SIZE + (isOdd ? (SQRT3 / 2) * HEX_SIZE : 0);
  return { lat, lng };
}

/** 6 corner vertices of a flat-top hex (as [lat, lng] pairs) */
export function hexVertices(centerLat: number, centerLng: number): Array<[number, number]> {
  const verts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    verts.push([
      centerLat + HEX_SIZE * Math.sin(angle),
      centerLng + HEX_SIZE * Math.cos(angle),
    ]);
  }
  return verts;
}

/** All hexes whose centres fall inside the given lat/lng bounds */
export function getHexesInBounds(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
): Array<{ q: number; r: number; hexId: string; lat: number; lng: number }> {
  const hexes: Array<{ q: number; r: number; hexId: string; lat: number; lng: number }> = [];
  const minQ = Math.floor(minLng / (1.5 * HEX_SIZE)) - 1;
  const maxQ = Math.ceil(maxLng / (1.5 * HEX_SIZE)) + 1;
  const minR = Math.floor(minLat / (SQRT3 * HEX_SIZE)) - 2;
  const maxR = Math.ceil(maxLat / (SQRT3 * HEX_SIZE)) + 2;

  for (let q = minQ; q <= maxQ; q++) {
    for (let r = minR; r <= maxR; r++) {
      const center = hexCenter(q, r);
      if (
        center.lat >= minLat - HEX_SIZE &&
        center.lat <= maxLat + HEX_SIZE &&
        center.lng >= minLng - HEX_SIZE &&
        center.lng <= maxLng + HEX_SIZE
      ) {
        hexes.push({ q, r, hexId: `${q}_${r}`, ...center });
      }
    }
  }
  return hexes;
}

/** Given a route (array of {latitude, longitude}), return the unique hex IDs traversed */
export function routeToHexIds(
  route: Array<{ latitude: number; longitude: number }>,
): Array<{ hexId: string; lat: number; lng: number }> {
  const seen = new Set<string>();
  const result: Array<{ hexId: string; lat: number; lng: number }> = [];
  for (const pt of route) {
    const h = latLngToHex(pt.latitude, pt.longitude);
    if (!seen.has(h.hexId)) {
      seen.add(h.hexId);
      const c = hexCenter(h.q, h.r);
      result.push({ hexId: h.hexId, lat: c.lat, lng: c.lng });
    }
  }
  return result;
}

// ─── Database Types ──────────────────────────────────────────
export interface HexTerritory {
  hex_id: string;
  user_id: string;
  trail_color: string;
  claimed_at: string;
  center_lat: number;
  center_lng: number;
}

// ─── Compute territories from actual runs ────────────────────

/**
 * Fetch runs for the current user AND everyone they follow,
 * then compute hex territories from each run's route_data.
 * Most-recent run that crosses a hex "owns" it.
 *
 * Returns a flat array of HexTerritory suitable for the TerritoryMap.
 */
export async function getTerritoriesFromRuns(): Promise<{ territories: HexTerritory[]; myCount: number }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { territories: [], myCount: 0 };

    // 1. Get list of people I follow
    const { data: followRows } = await supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', user.id);

    const userIds = [user.id, ...(followRows?.map((f) => f.following_id) ?? [])];

    // 2. Fetch all runs with route_data from these users (newest first)
    const { data: runs, error } = await supabase
      .from('runs')
      .select('user_id, run_date, created_at, route_data')
      .in('user_id', userIds)
      .not('route_data', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('getTerritoriesFromRuns query error:', error.message);
      return { territories: [], myCount: 0 };
    }

    if (!runs || runs.length === 0) return { territories: [], myCount: 0 };

    // 3. Build hex map — first writer wins (runs are newest-first)
    const hexMap = new Map<string, HexTerritory>();

    for (const run of runs) {
      const rd = run.route_data as RouteData | null;
      if (!rd?.coordinates || rd.coordinates.length === 0) continue;

      const trailColor = rd.trailColor ?? '#5B7EA4';
      const runDate = run.created_at ?? run.run_date;

      const hexes = routeToHexIds(rd.coordinates);
      for (const h of hexes) {
        // First time seeing this hex → newest run owns it
        if (!hexMap.has(h.hexId)) {
          hexMap.set(h.hexId, {
            hex_id: h.hexId,
            user_id: run.user_id,
            trail_color: trailColor,
            claimed_at: runDate,
            center_lat: h.lat,
            center_lng: h.lng,
          });
        }
      }
    }

    const territories = Array.from(hexMap.values());
    const myCount = territories.filter((t) => t.user_id === user.id).length;

    return { territories, myCount };
  } catch (e) {
    console.warn('getTerritoriesFromRuns exception:', e);
    return { territories: [], myCount: 0 };
  }
}

/**
 * Compute territories locally from a single run route.
 * Useful for immediately updating the map after completing a run
 * (before re-fetching from DB).
 */
export function computeLocalTerritories(
  route: Array<{ latitude: number; longitude: number }>,
  userId: string,
  trailColor: string,
): HexTerritory[] {
  const hexes = routeToHexIds(route);
  return hexes.map((h) => ({
    hex_id: h.hexId,
    user_id: userId,
    trail_color: trailColor,
    claimed_at: new Date().toISOString(),
    center_lat: h.lat,
    center_lng: h.lng,
  }));
}

// ─── Hex Grid Constants (exported for use in map HTML) ───────
export { HEX_SIZE, SQRT3 };
