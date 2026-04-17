import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, User, AuthChangeEvent } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
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
  created_at: string;
  updated_at: string;
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
}

export interface UpdateRunInput extends Partial<CreateRunInput> {}

export interface UpdateProfileInput {
  username?: string;
  display_name?: string;
  bio?: string;
  location?: string;
  avatar_url?: string;
}

export interface UpdateProfileSettingsInput {
  profile_visible?: boolean;
  stats_visible?: boolean;
  runs_visible?: boolean;
  achievements_visible?: boolean;
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
