import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

// `expo export`'s static web build prerenders every route in Node before any
// browser `window` exists. This module runs at import time, so on that pass
// AsyncStorage's web shim (and GoTrueClient's session/auto-refresh init) would
// touch `window` and crash immediately. Skip persistence/auto-refresh there;
// real browser and native runs are unaffected.
const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: isServerRender
    ? {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    : {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
});

// Re-export useful types from Supabase
export type { Session, User, AuthChangeEvent };

// ============================================
// DATABASE TYPES (matching schema.sql)
// ============================================

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  trail_color: string | null;
  active_hero_id: string | null;
  // Which clan (if any) your runs currently claim/heal hexes for — see
  // set_active_group / migrations/017_clan_hex_warfare.sql.
  active_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileSettings {
  id: string;
  user_id: string;
  profile_visible: boolean;
  stats_visible: boolean;
  runs_visible: boolean;
  achievements_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: number;
  speed?: number;
}

export interface RouteData {
  coordinates: RoutePoint[];
  startLocation?: { latitude: number; longitude: number };
  endLocation?: { latitude: number; longitude: number };
  trailColor?: string; // User's chosen trail color (hex)
}

export interface Run {
  id: string;
  user_id: string;
  title: string | null;
  run_date: string;
  run_time: string | null;
  distance_km: number;
  duration: string | null; // PostgreSQL interval as string
  pace: string | null;
  route_data: RouteData | null;
  created_at: string;
  updated_at: string;
  // Optional columns — may not exist in older DB deployments
  calories?: number | null;
  elevation_m?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  notes?: string | null;
  // Ghost runs still steal territory normally — victims just aren't sent
  // an attack notification for it (see claim_territory_from_run).
  is_ghost?: boolean | null;
}

export interface UserStats {
  id: string;
  user_id: string;
  total_runs: number;
  total_distance_km: number;
  total_duration: string;
  total_calories: number;
  total_elevation_m: number;
  avg_pace: string | null;
  best_pace: string | null;
  longest_run_km: number;
  weekly_goal_km: number;
  current_streak: number;
  longest_streak: number;
  coins: number;
  created_at: string;
  updated_at: string;
  last_login_date?: string | null;
  login_streak?: number;
  /** Last calendar date a Ghost Run actually applied (suppressed victim notifications) — see claim_territory_from_run. Null/not today = Ghost Run is available. */
  last_ghost_run_date?: string | null;
}

export type PostType = 'social' | 'run' | 'achievement' | 'photo';

export interface Post {
  id: string;
  user_id: string;
  type: PostType;
  title: string | null;
  content: string | null;
  run_id: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

// Post with joined profile data for feed display
export interface PostWithAuthor extends Post {
  profiles: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>;
  runs?: Pick<Run, 'distance_km' | 'duration' | 'pace' | 'route_data' | 'run_date' | 'run_time'> | null;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

export interface PostLike {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface PostCommentWithAuthor extends PostComment {
  profiles: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>;
}

export interface Follower {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface FollowerWithProfile extends Follower {
  profiles: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement_type: string | null;
  requirement_value: number | null;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string;
}

export interface UserAchievementWithDetails extends UserAchievement {
  achievements: Achievement;
}

// ============================================
// INPUT TYPES (for creating/updating records)
// ============================================

export interface CreateRunInput {
  title?: string;
  run_date: string;
  run_time?: string;
  distance_km: number;
  duration?: string;
  pace?: string;
  route_data?: RouteData;
  // These only work if the corresponding columns have been added to the DB
  calories?: number;
  elevation_m?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  notes?: string;
  is_ghost?: boolean;
}

export interface UpdateRunInput extends Partial<CreateRunInput> {}

export interface UpdateProfileInput {
  username?: string;
  display_name?: string | null;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  trail_color?: string;
}

// ============================================
// TERRITORY TYPES
// ============================================

/** A GeoJSON Polygon/MultiPolygon as returned by ST_AsGeoJSON */
export interface TerritoryGeoJSON {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

/** One user's claimed area within the current map bounds (from get_territories_in_bounds) */
export interface TerritoryFeature {
  user_id: string;
  username: string;
  display_name: string | null;
  trail_color: string;
  area_m2: number;
  geojson: TerritoryGeoJSON;
}

/** Result of the claim_territory_from_run RPC */
export interface ClaimTerritoryResult {
  success: boolean;
  reason?: 'already_claimed' | 'run_not_found' | 'not_owner' | 'too_few_points' | 'loop_not_closed' | 'invalid_polygon' | 'area_too_small' | 'daily_limit_reached';
  gap_m?: number;
  area_m2?: number;
  claimed_area_m2?: number;
  /** Enemy hexes hit hard enough to knock down a defense level, but not enough to finish — see migration 012. */
  weakened_count?: number;
  /** Enemy hexes that were already at level 1 and just got finished — they go neutral, not to you. See migration 016. */
  neutralized_count?: number;
  /** Coins paid out this run from bounties on hexes just neutralized above. */
  bounty_earned?: number;
  total_area_m2?: number;
  stolen?: Array<{ user_id: string; area_m2: number; zones_lost: number }>;
  /**
   * Whether Ghost Run actually suppressed victim notifications for this
   * claim. Can be false even when the run was *saved* with is_ghost=true —
   * Ghost Run only works once a day (see migrations/019_ghost_run_daily_limit.sql);
   * if already used today, this claim proceeds normally and victims are notified.
   */
  ghost_active?: boolean;
  /** True when this claim ran 21:00–06:00 local and gained at least one brand-new hex — those start at level 3 instead of the usual 2. See migration 020. */
  night_bonus?: boolean;
}

// ============================================
// HEX GRID / FORTIFY / BOUNTY
// ============================================

/** One hex cell from get_hexes_in_bounds — the full grid (claimed + neutral) in a map viewport. */
export interface HexCell {
  hexCol: number;
  hexRow: number;
  userId: string | null;
  username: string | null;
  trailColor: string | null;
  /** Current defense level (1..maxLevel). Null when the hex is neutral/unclaimed. */
  level: number | null;
  /** Fortified ceiling, 2..5 — what the hex heals back up to when its owner runs over it. */
  maxLevel: number | null;
  /** Sum of every active bounty on this hex, from any placer. */
  bountyTotal: number;
  /** Sum of the current user's own active bounty on this hex (0 if none). */
  myBounty: number;
  /** Clan that owns this hex, if any — null means it's personally owned (or unclaimed). See migrations/017_clan_hex_warfare.sql. */
  ownerGroupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  geojson: TerritoryGeoJSON;
}

/** Result of the fortify_hex RPC. */
export interface FortifyHexResult {
  success: boolean;
  reason?: 'not_authenticated' | 'not_claimed' | 'not_owner' | 'max_level' | 'insufficient_coins';
  new_level?: number;
  cost?: number;
  coins?: number;
}

/** Result of the place_bounty RPC. */
export interface PlaceBountyResult {
  success: boolean;
  reason?: 'not_authenticated' | 'invalid_hex_count' | 'amount_too_small' | 'invalid_target' | 'insufficient_coins';
  per_hex_amount?: number;
  total_charged?: number;
  hex_count?: number;
  min_amount?: number;
  cost?: number;
  coins?: number;
}

/** Result of the cancel_my_bounty RPC. */
export interface CancelBountyResult {
  success: boolean;
  reason?: 'not_authenticated' | 'no_bounty';
  refunded?: number;
}

/** Result of the set_active_group RPC. */
export interface SetActiveGroupResult {
  success: boolean;
  reason?: 'not_authenticated' | 'not_member';
  group_id?: string | null;
}

/** The caller's own active clan, from get_my_active_group — null if running solo. */
export interface MyActiveGroup {
  group_id: string;
  name: string;
  color: string;
}

// ============================================
// HEROES
// ============================================

export type HeroRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** One row from get_my_heroes() — catalog entry joined with this user's ownership. */
export interface MyHero {
  hero_id: string;
  slug: string;
  name: string;
  rarity: HeroRarity;
  unlock_cost: number;
  owned: boolean;
  tier: number | null;
  is_active: boolean;
}

export interface HeroActionResult {
  success: boolean;
  reason?: 'already_owned' | 'hero_not_found' | 'not_enough_coins' | 'not_owned' | 'max_tier';
  cost?: number;
  coins?: number;
  new_tier?: number;
}

// ============================================
// COINS
// ============================================

/** One row from coin_transactions — a run reward, daily login bonus, hex
 * fortify spend, or bounty place/payout/refund. */
export interface CoinTransaction {
  id: string;
  user_id: string;
  run_id: string | null;
  amount: number;
  distance_km: number;
  kind: 'run' | 'login' | 'fortify' | 'bounty_place' | 'bounty_payout' | 'bounty_refund';
  created_at: string;
}

/** Result of the claim_daily_login RPC. */
export interface ClaimDailyLoginResult {
  success: boolean;
  reason?: 'not_authenticated' | 'already_claimed';
  coins_awarded?: number;
  streak?: number;
}

// ============================================
// LEADERBOARD TYPES
// ============================================

/** One row from get_territory_leaderboard — solo, all-time, by held area. */
export interface TerritoryLeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  trail_color: string;
  area_m2: number;
  rank: number;
}

/** One row from get_weekly_leaderboard — solo, this week's net area change. */
export interface WeeklyLeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  trail_color: string;
  gained_m2: number;
  lost_m2: number;
  net_m2: number;
  rank: number;
}

/** One row from get_weekly_group_leaderboard — clans, this week's net area change. */
export interface WeeklyGroupLeaderboardEntry {
  group_id: string;
  name: string;
  color: string;
  member_count: number;
  gained_m2: number;
  lost_m2: number;
  net_m2: number;
  rank: number;
}

// ============================================
// ATTACK NOTIFICATION TYPES
// ============================================

/** One "someone stole your territory" event (see migrations/009_attack_notifications.sql) */
export interface AttackNotification {
  id: string;
  victim_id: string;
  attacker_id: string;
  attacker_username: string;
  attacker_display_name: string | null;
  run_id: string | null;
  area_m2: number;
  zones_lost: number;
  place_label: string | null;
  read_at: string | null;
  created_at: string;
}

// ============================================
// MESSAGE TYPES
// ============================================

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface Conversation {
  partner_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  last_sender_id: string;
  unread_count: number;
}

export interface UpdateProfileSettingsInput {
  profile_visible?: boolean;
  stats_visible?: boolean;
  runs_visible?: boolean;
  achievements_visible?: boolean;
}

// ============================================
// GROUP TYPES
// ============================================

export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_public: boolean;
  invite_code: string;
  member_count: number;
  created_by: string | null;
  created_at: string;
}

export type GroupRole = 'owner' | 'member';

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

/** One row of a group's "My Groups" list — the group plus the caller's role in it. */
export interface GroupWithRole extends Group {
  role: GroupRole;
}

/** One member row from get_group_stats, ranked by their own claimed territory. */
export interface GroupMemberStat {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  area_m2: number;
}

/** One row from get_group_leaderboard. */
export interface GroupLeaderboardEntry {
  group_id: string;
  name: string;
  color: string;
  member_count: number;
  total_area_m2: number;
  rank: number;
}

/** One group's merged/unioned member territory, clipped to the map viewport. */
export interface GroupTerritoryFeature {
  group_id: string;
  name: string;
  color: string;
  area_m2: number;
  geojson: TerritoryGeoJSON;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface GroupMessageWithAuthor extends GroupMessage {
  profiles: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>;
}

export interface CreatePostInput {
  type: PostType;
  title?: string;
  content?: string;
  run_id?: string;
  image_url?: string;
}

export interface CreateCommentInput {
  post_id: string;
  content: string;
}

// ============================================
// PAGINATION TYPES
// ============================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
