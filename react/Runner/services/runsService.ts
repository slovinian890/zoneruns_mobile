import { supabase, Run, CreateRunInput, UpdateRunInput, PaginationParams, PaginatedResponse } from './supabase';
import { offlineQueue } from './offlineQueue';
import { getCurrentUser } from './authService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_RUNS_KEY = '@runner:local_runs';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert duration in seconds to PostgreSQL interval string
 */
export const secondsToInterval = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Convert PostgreSQL interval string to seconds
 */
export const intervalToSeconds = (interval: string | null): number => {
  if (!interval) return 0;
  
  // Handle different interval formats
  // Format: "HH:MM:SS" or "X hours Y mins Z secs"
  const timeMatch = interval.match(/(\d+):(\d+):(\d+)/);
  if (timeMatch) {
    const [, hours, minutes, seconds] = timeMatch;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
  }

  // Try parsing verbose format
  let totalSeconds = 0;
  const hoursMatch = interval.match(/(\d+)\s*hour/);
  const minsMatch = interval.match(/(\d+)\s*min/);
  const secsMatch = interval.match(/(\d+)\s*sec/);
  
  if (hoursMatch) totalSeconds += parseInt(hoursMatch[1]) * 3600;
  if (minsMatch) totalSeconds += parseInt(minsMatch[1]) * 60;
  if (secsMatch) totalSeconds += parseInt(secsMatch[1]);
  
  return totalSeconds;
};

/**
 * Calculate pace (seconds per km) from distance and duration
 */
export const calculatePace = (distanceKm: number, durationSeconds: number): string => {
  if (distanceKm <= 0 || durationSeconds <= 0) return '0:00';
  
  const paceSeconds = durationSeconds / distanceKm;
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// ============================================
// RUN CRUD OPERATIONS
// ============================================

/**
 * Create a new run
 * If offline, queues the run for later sync
 */
export const createRun = async (input: CreateRunInput): Promise<{ success: boolean; run?: Run; error?: string; queued?: boolean }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const runData = {
      user_id: user.id,
      ...input,
    };

    const { data, error } = await supabase
      .from('runs')
      .insert(runData)
      .select()
      .single();

    if (error) {
      // If offline or network error, queue the run
      if (error.message.includes('network') || error.message.includes('fetch')) {
        const localId = await saveRunLocally(runData);
        await offlineQueue.enqueue('CREATE_RUN', { ...runData, localId });
        return { success: true, queued: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true, run: data };
  } catch (error) {
    console.error('Create run error:', error);
    
    // Queue for offline sync
    const user = await getCurrentUser();
    if (user) {
      const runData = { user_id: user.id, ...input };
      const localId = await saveRunLocally(runData);
      await offlineQueue.enqueue('CREATE_RUN', { ...runData, localId });
      return { success: true, queued: true };
    }
    
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Get a single run by ID
 */
export const getRun = async (runId: string): Promise<{ success: boolean; run?: Run; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, run: data };
  } catch (error) {
    console.error('Get run error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Get user's run history with pagination
 */
export const getUserRuns = async (
  userId?: string,
  pagination: PaginationParams = {}
): Promise<PaginatedResponse<Run>> => {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  try {
    const user = userId ? { id: userId } : await getCurrentUser();
    if (!user) {
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    // Get total count
    const { count } = await supabase
      .from('runs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Get paginated data
    const { data, error } = await supabase
      .from('runs')
      .select('*')
      .eq('user_id', user.id)
      .order('run_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Get user runs error:', error);
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    const totalCount = count ?? 0;
    return {
      data: data ?? [],
      count: totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };
  } catch (error) {
    console.error('Get user runs error:', error);
    return { data: [], count: 0, page, limit, hasMore: false };
  }
};

/**
 * Get recent runs (for dashboard)
 */
export const getRecentRuns = async (count: number = 5): Promise<Run[]> => {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('runs')
      .select('*')
      .eq('user_id', user.id)
      .order('run_date', { ascending: false })
      .limit(count);

    if (error) {
      console.error('Get recent runs error:', error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error('Get recent runs error:', error);
    return [];
  }
};

/**
 * Update a run
 */
export const updateRun = async (
  runId: string,
  input: UpdateRunInput
): Promise<{ success: boolean; run?: Run; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('runs')
      .update(input)
      .eq('id', runId)
      .eq('user_id', user.id) // Ensure user owns the run
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, run: data };
  } catch (error) {
    console.error('Update run error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Delete a run
 */
export const deleteRun = async (runId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('runs')
      .delete()
      .eq('id', runId)
      .eq('user_id', user.id); // Ensure user owns the run

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete run error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

// ============================================
// OFFLINE SUPPORT
// ============================================

/**
 * Save a run locally when offline
 */
const saveRunLocally = async (runData: CreateRunInput & { user_id: string }): Promise<string> => {
  try {
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const localRuns = await getLocalRuns();
    
    localRuns.push({
      ...runData,
      id: localId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Run);
    
    await AsyncStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify(localRuns));
    return localId;
  } catch (error) {
    console.error('Error saving run locally:', error);
    throw error;
  }
};

/**
 * Get locally stored runs (pending sync)
 */
export const getLocalRuns = async (): Promise<Run[]> => {
  try {
    const data = await AsyncStorage.getItem(LOCAL_RUNS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting local runs:', error);
    return [];
  }
};

/**
 * Remove a local run after successful sync
 */
export const removeLocalRun = async (localId: string): Promise<void> => {
  try {
    const localRuns = await getLocalRuns();
    const filtered = localRuns.filter(run => run.id !== localId);
    await AsyncStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing local run:', error);
  }
};

/**
 * Get all runs (including local unsynced runs)
 */
export const getAllRunsIncludingLocal = async (pagination?: PaginationParams): Promise<PaginatedResponse<Run>> => {
  const [serverRuns, localRuns] = await Promise.all([
    getUserRuns(undefined, pagination),
    getLocalRuns(),
  ]);

  // Combine and sort by date (local runs first as they're more recent)
  const allRuns = [...localRuns, ...serverRuns.data];
  
  return {
    ...serverRuns,
    data: allRuns,
    count: serverRuns.count + localRuns.length,
  };
};

// ============================================
// REGISTER OFFLINE HANDLERS
// ============================================

// Register the handler for creating runs when coming back online
offlineQueue.registerHandler('CREATE_RUN', async (payload: CreateRunInput & { user_id: string; localId?: string }) => {
  const { localId, ...runData } = payload;
  
  const { data, error } = await supabase
    .from('runs')
    .insert(runData)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Remove local copy after successful sync
  if (localId) {
    await removeLocalRun(localId);
  }

  return { success: true };
});
