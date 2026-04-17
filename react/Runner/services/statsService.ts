import {
  supabase,
  UserStats,
  Achievement,
  UserAchievement,
  UserAchievementWithDetails,
  Run,
} from './supabase';
import { getCurrentUser } from './authService';
import { intervalToSeconds, calculatePace } from './runsService';

// ============================================
// USER STATS OPERATIONS
// ============================================

/**
 * Get current user's stats
 */
export const getCurrentUserStats = async (): Promise<{ success: boolean; stats?: UserStats; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, stats: data };
  } catch (error) {
    console.error('Get current user stats error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Get stats for a specific user
 */
export const getUserStats = async (userId: string): Promise<{ success: boolean; stats?: UserStats; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, stats: data };
  } catch (error) {
    console.error('Get user stats error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Update user stats after a run
 * This recalculates all stats from the runs table
 */
export const updateUserStatsAfterRun = async (run: Run): Promise<{ success: boolean; stats?: UserStats; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get all user runs to recalculate stats
    const { data: runs, error: runsError } = await supabase
      .from('runs')
      .select('*')
      .eq('user_id', user.id);

    if (runsError) {
      return { success: false, error: runsError.message };
    }

    // Calculate aggregated stats
    const totalRuns = runs?.length ?? 0;
    let totalDistanceKm = 0;
    let totalDurationSeconds = 0;
    let totalCalories = 0;
    let totalElevationM = 0;
    let longestRunKm = 0;
    let bestPaceSeconds = Infinity;

    runs?.forEach((r) => {
      totalDistanceKm += r.distance_km || 0;
      totalDurationSeconds += intervalToSeconds(r.duration);
      totalCalories += r.calories || 0;
      totalElevationM += r.elevation_m || 0;

      if (r.distance_km > longestRunKm) {
        longestRunKm = r.distance_km;
      }

      // Calculate pace for this run
      const runDuration = intervalToSeconds(r.duration);
      if (r.distance_km > 0 && runDuration > 0) {
        const runPace = runDuration / r.distance_km;
        if (runPace < bestPaceSeconds) {
          bestPaceSeconds = runPace;
        }
      }
    });

    // Calculate average pace
    const avgPace = totalDistanceKm > 0
      ? calculatePace(totalDistanceKm, totalDurationSeconds)
      : null;

    const bestPace = bestPaceSeconds < Infinity
      ? calculatePace(1, bestPaceSeconds)
      : null;

    // Calculate streak
    const streak = await calculateStreak(user.id);

    // Convert total duration to interval string
    const hours = Math.floor(totalDurationSeconds / 3600);
    const minutes = Math.floor((totalDurationSeconds % 3600) / 60);
    const seconds = totalDurationSeconds % 60;
    const totalDuration = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Update stats
    const { data, error } = await supabase
      .from('user_stats')
      .update({
        total_runs: totalRuns,
        total_distance_km: totalDistanceKm,
        total_duration: totalDuration,
        total_calories: totalCalories,
        total_elevation_m: totalElevationM,
        avg_pace: avgPace,
        best_pace: bestPace,
        longest_run_km: longestRunKm,
        current_streak: streak.current,
        longest_streak: Math.max(streak.current, streak.longest),
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, stats: data };
  } catch (error) {
    console.error('Update user stats error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Calculate running streak
 */
const calculateStreak = async (userId: string): Promise<{ current: number; longest: number }> => {
  try {
    const { data: runs } = await supabase
      .from('runs')
      .select('run_date')
      .eq('user_id', userId)
      .order('run_date', { ascending: false });

    if (!runs || runs.length === 0) {
      return { current: 0, longest: 0 };
    }

    // Get unique dates
    const uniqueDates = [...new Set(runs.map(r => r.run_date))].sort().reverse();
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if most recent run is today or yesterday
    const mostRecentDate = new Date(uniqueDates[0]);
    mostRecentDate.setHours(0, 0, 0, 0);

    if (mostRecentDate.getTime() === today.getTime() || mostRecentDate.getTime() === yesterday.getTime()) {
      currentStreak = 1;

      for (let i = 1; i < uniqueDates.length; i++) {
        const currentDate = new Date(uniqueDates[i]);
        const prevDate = new Date(uniqueDates[i - 1]);
        currentDate.setHours(0, 0, 0, 0);
        prevDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((prevDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    for (let i = 1; i < uniqueDates.length; i++) {
      const currentDate = new Date(uniqueDates[i]);
      const prevDate = new Date(uniqueDates[i - 1]);
      currentDate.setHours(0, 0, 0, 0);
      prevDate.setHours(0, 0, 0, 0);

      const diffDays = Math.round((prevDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return { current: currentStreak, longest: longestStreak };
  } catch (error) {
    console.error('Calculate streak error:', error);
    return { current: 0, longest: 0 };
  }
};

/**
 * Update weekly goal
 */
export const updateWeeklyGoal = async (goalKm: number): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('user_stats')
      .update({ weekly_goal_km: goalKm })
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Update weekly goal error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Get this week's distance
 */
export const getThisWeekDistance = async (): Promise<number> => {
  try {
    const user = await getCurrentUser();
    if (!user) return 0;

    // Get start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('runs')
      .select('distance_km')
      .eq('user_id', user.id)
      .gte('run_date', startOfWeek.toISOString().split('T')[0]);

    const totalDistance = data?.reduce((sum, run) => sum + (run.distance_km || 0), 0) ?? 0;
    return totalDistance;
  } catch (error) {
    console.error('Get this week distance error:', error);
    return 0;
  }
};

// ============================================
// ACHIEVEMENTS OPERATIONS
// ============================================

/**
 * Get all available achievements
 */
export const getAllAchievements = async (): Promise<{ success: boolean; achievements?: Achievement[]; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .order('category', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, achievements: data ?? [] };
  } catch (error) {
    console.error('Get all achievements error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Get achievements by category
 */
export const getAchievementsByCategory = async (category: string): Promise<Achievement[]> => {
  try {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .eq('category', category)
      .order('requirement_value', { ascending: true });

    if (error) {
      console.error('Get achievements by category error:', error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error('Get achievements by category error:', error);
    return [];
  }
};

/**
 * Get user's earned achievements
 */
export const getUserAchievements = async (userId?: string): Promise<{ success: boolean; achievements?: UserAchievementWithDetails[]; error?: string }> => {
  try {
    const user = userId ? { id: userId } : await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('user_achievements')
      .select(`
        *,
        achievements (*)
      `)
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, achievements: data as UserAchievementWithDetails[] };
  } catch (error) {
    console.error('Get user achievements error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Award an achievement to the current user
 */
export const awardAchievement = async (achievementId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('user_achievements')
      .insert({
        user_id: user.id,
        achievement_id: achievementId,
      });

    if (error) {
      // Ignore duplicate key error (already earned)
      if (error.code === '23505') {
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Award achievement error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Check if user has a specific achievement
 */
export const hasAchievement = async (achievementId: string): Promise<boolean> => {
  try {
    const user = await getCurrentUser();
    if (!user) return false;

    const { data } = await supabase
      .from('user_achievements')
      .select('id')
      .eq('user_id', user.id)
      .eq('achievement_id', achievementId)
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error('Check achievement error:', error);
    return false;
  }
};

/**
 * Check and award achievements after a run
 */
export const checkAndAwardAchievements = async (
  run: Run,
  stats: UserStats
): Promise<Achievement[]> => {
  try {
    const earnedAchievements: Achievement[] = [];
    
    // Get all achievements
    const { achievements } = await getAllAchievements();
    if (!achievements) return [];

    // Get already earned achievements
    const { achievements: userAchievements } = await getUserAchievements();
    const earnedIds = new Set(userAchievements?.map(ua => ua.achievement_id) ?? []);

    for (const achievement of achievements) {
      // Skip if already earned
      if (earnedIds.has(achievement.id)) continue;

      const { requirement_type, requirement_value } = achievement;
      if (!requirement_type || requirement_value === null) continue;

      let earned = false;

      switch (requirement_type) {
        case 'total_runs':
          earned = stats.total_runs >= requirement_value;
          break;
        case 'single_run_distance':
          earned = run.distance_km >= requirement_value;
          break;
        case 'total_distance':
          earned = stats.total_distance_km >= requirement_value;
          break;
        case 'streak_days':
          earned = stats.current_streak >= requirement_value;
          break;
        case 'total_elevation':
          earned = stats.total_elevation_m >= requirement_value;
          break;
        case 'total_calories':
          earned = stats.total_calories >= requirement_value;
          break;
        case 'best_pace':
          // requirement_value is in seconds
          if (stats.best_pace) {
            const [mins, secs] = stats.best_pace.split(':').map(Number);
            const paceSeconds = mins * 60 + secs;
            earned = paceSeconds <= requirement_value;
          }
          break;
        case 'single_run_duration':
          const runDuration = intervalToSeconds(run.duration);
          earned = runDuration >= requirement_value;
          break;
      }

      if (earned) {
        await awardAchievement(achievement.id);
        earnedAchievements.push(achievement);
      }
    }

    return earnedAchievements;
  } catch (error) {
    console.error('Check and award achievements error:', error);
    return [];
  }
};

/**
 * Get achievement progress for a specific achievement
 */
export const getAchievementProgress = async (
  achievement: Achievement,
  stats: UserStats
): Promise<{ current: number; target: number; percentage: number }> => {
  const { requirement_type, requirement_value } = achievement;
  
  if (!requirement_type || requirement_value === null) {
    return { current: 0, target: 0, percentage: 0 };
  }

  let current = 0;
  const target = requirement_value;

  switch (requirement_type) {
    case 'total_runs':
      current = stats.total_runs;
      break;
    case 'total_distance':
      current = stats.total_distance_km;
      break;
    case 'streak_days':
      current = stats.current_streak;
      break;
    case 'total_elevation':
      current = stats.total_elevation_m;
      break;
    case 'total_calories':
      current = stats.total_calories;
      break;
    default:
      // For single-run achievements, we can't show progress
      return { current: 0, target, percentage: 0 };
  }

  const percentage = Math.min(100, (current / target) * 100);
  return { current, target, percentage };
};
