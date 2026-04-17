import {
  supabase,
  Post,
  PostWithAuthor,
  PostComment,
  PostCommentWithAuthor,
  Follower,
  FollowerWithProfile,
  CreatePostInput,
  CreateCommentInput,
  PaginationParams,
  PaginatedResponse,
  Profile,
} from './supabase';
import { getCurrentUser } from './authService';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================
// FEED / POSTS OPERATIONS
// ============================================

/**
 * Get feed posts with author info, paginated.
 * 3 queries total — works on all PostgREST/Supabase versions.
 */
export const getFeedPosts = async (
  pagination: PaginationParams = {}
): Promise<PaginatedResponse<PostWithAuthor> & { error?: string }> => {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  try {
    const user = await getCurrentUser();
    console.log('[Feed] Current user:', user?.id ?? 'NOT LOGGED IN');

    // 1. Posts with joined profile and run data
    const { data, error, count } = await supabase
      .from('posts')
      .select(
        `
        *,
        profiles:user_id (username, display_name, avatar_url),
        runs:run_id (distance_km, duration, pace, route_data, run_date, run_time)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Feed] Posts query error:', error.message, 'code:', error.code);
      return { data: [], count: 0, page, limit, hasMore: false, error: `${error.message} (code: ${error.code})` };
    }

    const posts = data ?? [];
    console.log('[Feed] Fetched posts:', posts.length, 'total:', count);

    if (posts.length === 0) {
      return { data: [], count: count ?? 0, page, limit, hasMore: false };
    }

    if (posts.length > 0) {
      console.log('[Feed] First post sample:', JSON.stringify({
        id: posts[0].id,
        type: posts[0].type,
        hasProfiles: !!posts[0].profiles,
        hasRuns: !!posts[0].runs,
        run_id: posts[0].run_id,
      }));
    }

    const postIds = posts.map((p) => p.id);

    // 2. All likes for these posts
    const { data: allLikes, error: likesError } = await supabase
      .from('post_likes')
      .select('post_id, user_id')
      .in('post_id', postIds);

    if (likesError) {
      console.error('[Feed] Likes query error:', likesError.message);
    }

    // 3. All comment rows for these posts
    const { data: allComments, error: commentsError } = await supabase
      .from('post_comments')
      .select('post_id')
      .in('post_id', postIds);

    if (commentsError) {
      console.error('[Feed] Comments query error:', commentsError.message);
    }

    const likesCount: Record<string, number> = {};
    const likedByCurrentUser = new Set<string>();
    for (const like of allLikes ?? []) {
      likesCount[like.post_id] = (likesCount[like.post_id] ?? 0) + 1;
      if (user && like.user_id === user.id) {
        likedByCurrentUser.add(like.post_id);
      }
    }

    const commentsCount: Record<string, number> = {};
    for (const comment of allComments ?? []) {
      commentsCount[comment.post_id] = (commentsCount[comment.post_id] ?? 0) + 1;
    }

    const postsWithCounts = posts.map((post) => ({
      ...post,
      profiles: post.profiles ?? { username: 'Unknown', display_name: null, avatar_url: null },
      likes_count: likesCount[post.id] ?? 0,
      comments_count: commentsCount[post.id] ?? 0,
      is_liked: likedByCurrentUser.has(post.id),
    } as PostWithAuthor));

    const totalCount = count ?? 0;
    console.log('[Feed] Returning', postsWithCounts.length, 'posts with counts');
    return {
      data: postsWithCounts,
      count: totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };
  } catch (err) {
    console.error('[Feed] Unexpected error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { data: [], count: 0, page, limit, hasMore: false, error: msg };
  }
};

/**
 * Get posts from followed users only
 */
export const getFollowingFeed = async (
  pagination: PaginationParams = {}
): Promise<PaginatedResponse<PostWithAuthor>> => {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    // Get list of users the current user follows
    const { data: following } = await supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingIds = following?.map(f => f.following_id) ?? [];
    
    // Include own posts in feed
    followingIds.push(user.id);

    if (followingIds.length === 0) {
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    // Get posts from followed users
    const { data, error, count } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (username, display_name, avatar_url),
        runs:run_id (distance_km, duration, pace, route_data, run_date, run_time)
      `, { count: 'exact' })
      .in('user_id', followingIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Get following feed error:', error);
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    const totalCount = count ?? 0;
    return {
      data: (data ?? []) as PostWithAuthor[],
      count: totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };
  } catch (error) {
    console.error('Get following feed error:', error);
    return { data: [], count: 0, page, limit, hasMore: false };
  }
};

/**
 * Get a user's posts
 */
export const getUserPosts = async (
  userId: string,
  pagination: PaginationParams = {}
): Promise<PaginatedResponse<PostWithAuthor>> => {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (username, display_name, avatar_url),
        runs:run_id (distance_km, duration, pace, route_data, run_date, run_time)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Get user posts error:', error);
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    const totalCount = count ?? 0;
    return {
      data: (data ?? []) as PostWithAuthor[],
      count: totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };
  } catch (error) {
    console.error('Get user posts error:', error);
    return { data: [], count: 0, page, limit, hasMore: false };
  }
};

/**
 * Create a new post
 */
export const createPost = async (
  input: CreatePostInput
): Promise<{ success: boolean; post?: Post; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        ...input,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, post: data };
  } catch (error) {
    console.error('Create post error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete post error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

// ============================================
// LIKES OPERATIONS
// ============================================

/**
 * Like a post
 */
export const likePost = async (postId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('post_likes')
      .insert({
        post_id: postId,
        user_id: user.id,
      });

    if (error) {
      // Ignore duplicate key error (already liked)
      if (error.code === '23505') {
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Like post error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Unlike a post
 */
export const unlikePost = async (postId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unlike post error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Toggle like on a post
 */
export const toggleLike = async (postId: string): Promise<{ success: boolean; liked?: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Check if already liked
    const { data: existingLike } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingLike) {
      await unlikePost(postId);
      return { success: true, liked: false };
    } else {
      await likePost(postId);
      return { success: true, liked: true };
    }
  } catch (error) {
    console.error('Toggle like error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

// ============================================
// COMMENTS OPERATIONS
// ============================================

/**
 * Get comments for a post
 */
export const getPostComments = async (
  postId: string,
  pagination: PaginationParams = {}
): Promise<PaginatedResponse<PostCommentWithAuthor>> => {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('post_comments')
      .select(`
        *,
        profiles:user_id (username, display_name, avatar_url)
      `, { count: 'exact' })
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Get post comments error:', error);
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    const totalCount = count ?? 0;
    return {
      data: (data ?? []) as PostCommentWithAuthor[],
      count: totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };
  } catch (error) {
    console.error('Get post comments error:', error);
    return { data: [], count: 0, page, limit, hasMore: false };
  }
};

/**
 * Add a comment to a post
 */
export const addComment = async (
  input: CreateCommentInput
): Promise<{ success: boolean; comment?: PostComment; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: input.post_id,
        user_id: user.id,
        content: input.content,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, comment: data };
  } catch (error) {
    console.error('Add comment error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Delete a comment
 */
export const deleteComment = async (commentId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete comment error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

// ============================================
// FOLLOWERS OPERATIONS
// ============================================

/**
 * Follow a user
 */
export const followUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    if (user.id === userId) {
      return { success: false, error: 'Cannot follow yourself' };
    }

    const { error } = await supabase
      .from('followers')
      .insert({
        follower_id: user.id,
        following_id: userId,
      });

    if (error) {
      // Ignore duplicate key error (already following)
      if (error.code === '23505') {
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Follow user error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('followers')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unfollow user error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Check if current user is following a user
 */
export const isFollowing = async (userId: string): Promise<boolean> => {
  try {
    const user = await getCurrentUser();
    if (!user) return false;

    const { data } = await supabase
      .from('followers')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', userId)
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error('Check following error:', error);
    return false;
  }
};

/**
 * Get follower count for a user
 */
export const getFollowerCount = async (userId: string): Promise<number> => {
  try {
    const { count } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    return count ?? 0;
  } catch (error) {
    console.error('Get follower count error:', error);
    return 0;
  }
};

/**
 * Get following count for a user
 */
export const getFollowingCount = async (userId: string): Promise<number> => {
  try {
    const { count } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    return count ?? 0;
  } catch (error) {
    console.error('Get following count error:', error);
    return 0;
  }
};

/**
 * Get followers with profile info
 */
export const getFollowers = async (
  userId: string,
  pagination: PaginationParams = {}
): Promise<PaginatedResponse<Profile>> => {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('followers')
      .select(`
        follower:follower_id (id, username, display_name, avatar_url)
      `, { count: 'exact' })
      .eq('following_id', userId)
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Get followers error:', error);
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    const profiles = (data ?? []).map(f => f.follower as unknown as Profile);
    const totalCount = count ?? 0;

    return {
      data: profiles,
      count: totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };
  } catch (error) {
    console.error('Get followers error:', error);
    return { data: [], count: 0, page, limit, hasMore: false };
  }
};

/**
 * Get users being followed with profile info
 */
export const getFollowing = async (
  userId: string,
  pagination: PaginationParams = {}
): Promise<PaginatedResponse<Profile>> => {
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('followers')
      .select(`
        following:following_id (id, username, display_name, avatar_url)
      `, { count: 'exact' })
      .eq('follower_id', userId)
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Get following error:', error);
      return { data: [], count: 0, page, limit, hasMore: false };
    }

    const profiles = (data ?? []).map(f => f.following as unknown as Profile);
    const totalCount = count ?? 0;

    return {
      data: profiles,
      count: totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };
  } catch (error) {
    console.error('Get following error:', error);
    return { data: [], count: 0, page, limit, hasMore: false };
  }
};

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to new posts in the feed
 */
export const subscribeToFeed = (
  onNewPost: (post: Post) => void
): RealtimeChannel => {
  return supabase
    .channel('public:posts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'posts' },
      (payload) => {
        onNewPost(payload.new as Post);
      }
    )
    .subscribe();
};

/**
 * Subscribe to likes on a specific post
 */
export const subscribeToPostLikes = (
  postId: string,
  onLikeChange: (count: number) => void
): RealtimeChannel => {
  return supabase
    .channel(`post_likes:${postId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_likes', filter: `post_id=eq.${postId}` },
      async () => {
        // Fetch updated count
        const { count } = await supabase
          .from('post_likes')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', postId);
        onLikeChange(count ?? 0);
      }
    )
    .subscribe();
};

/**
 * Subscribe to comments on a specific post
 */
export const subscribeToPostComments = (
  postId: string,
  onNewComment: (comment: PostComment) => void
): RealtimeChannel => {
  return supabase
    .channel(`post_comments:${postId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
      (payload) => {
        onNewComment(payload.new as PostComment);
      }
    )
    .subscribe();
};

/**
 * Unsubscribe from a channel
 */
export const unsubscribe = (channel: RealtimeChannel): void => {
  supabase.removeChannel(channel);
};
