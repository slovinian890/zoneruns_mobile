import { supabase, Profile, ProfileSettings, UpdateProfileInput, UpdateProfileSettingsInput } from './supabase';
import { getCurrentUser } from './authService';

// ============================================
// PROFILE OPERATIONS
// ============================================

/**
 * Get the current user's profile
 */
export const getCurrentProfile = async (): Promise<{ success: boolean; profile?: Profile; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, profile: data };
  } catch (error) {
    console.error('Get current profile error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Get a profile by user ID
 */
export const getProfileById = async (userId: string): Promise<{ success: boolean; profile?: Profile; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, profile: data };
  } catch (error) {
    console.error('Get profile by ID error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Get a profile by username
 */
export const getProfileByUsername = async (username: string): Promise<{ success: boolean; profile?: Profile; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, profile: data };
  } catch (error) {
    console.error('Get profile by username error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Update the current user's profile
 */
export const updateProfile = async (input: UpdateProfileInput): Promise<{ success: boolean; profile?: Profile; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(input)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, profile: data };
  } catch (error) {
    console.error('Update profile error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Check if a username is available
 */
export const isUsernameAvailable = async (username: string): Promise<boolean> => {
  try {
    const user = await getCurrentUser();
    
    let query = supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('username', username);
    
    // Exclude current user from check
    if (user) {
      query = query.neq('id', user.id);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Username check error:', error);
      return false;
    }

    return (count ?? 0) === 0;
  } catch (error) {
    console.error('Username check error:', error);
    return false;
  }
};

/**
 * Search profiles by username or display name
 */
export const searchProfiles = async (
  query: string,
  limit: number = 10
): Promise<{ success: boolean; profiles?: Profile[]; error?: string }> => {
  try {
    const searchTerm = `%${query}%`;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.${searchTerm},display_name.ilike.${searchTerm}`)
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, profiles: data ?? [] };
  } catch (error) {
    console.error('Search profiles error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

// ============================================
// PROFILE SETTINGS OPERATIONS
// ============================================

/**
 * Get the current user's profile settings
 */
export const getProfileSettings = async (): Promise<{ success: boolean; settings?: ProfileSettings; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('profile_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, settings: data };
  } catch (error) {
    console.error('Get profile settings error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Update the current user's profile settings
 */
export const updateProfileSettings = async (
  input: UpdateProfileSettingsInput
): Promise<{ success: boolean; settings?: ProfileSettings; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('profile_settings')
      .update(input)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, settings: data };
  } catch (error) {
    console.error('Update profile settings error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

// ============================================
// AVATAR UPLOAD
// ============================================

/**
 * Upload a profile avatar
 */
export const uploadAvatar = async (
  fileUri: string,
  mimeType: string = 'image/jpeg'
): Promise<{ success: boolean; url?: string; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Create file path
    const fileExt = mimeType.split('/')[1] || 'jpg';
    const fileName = `${user.id}/avatar.${fileExt}`;

    // Read file and convert to blob
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, blob, {
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Update profile with new avatar URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('Upload avatar error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Delete the current user's avatar
 */
export const deleteAvatar = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Remove from storage
    const { error: deleteError } = await supabase.storage
      .from('avatars')
      .remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.jpeg`]);

    if (deleteError) {
      console.warn('Error deleting avatar from storage:', deleteError);
    }

    // Update profile to remove avatar URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete avatar error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Check if profile exists (useful for first-time setup check)
 */
export const hasProfile = async (): Promise<boolean> => {
  const result = await getCurrentProfile();
  return result.success && !!result.profile;
};
