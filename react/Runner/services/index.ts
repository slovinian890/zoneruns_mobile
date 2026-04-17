// Supabase Client & Types
export { supabase } from './supabase';
export type {
  Session,
  User,
  AuthChangeEvent,
  Profile,
  ProfileSettings,
  Run,
  RoutePoint,
  RouteData,
  UserStats,
  Post,
  PostWithAuthor,
  PostType,
  PostLike,
  PostComment,
  PostCommentWithAuthor,
  Follower,
  FollowerWithProfile,
  Achievement,
  UserAchievement,
  UserAchievementWithDetails,
  CreateRunInput,
  UpdateRunInput,
  UpdateProfileInput,
  UpdateProfileSettingsInput,
  CreatePostInput,
  CreateCommentInput,
  PaginationParams,
  PaginatedResponse,
} from './supabase';

// Authentication
export {
  signUp,
  signIn,
  signOut,
  getSession,
  getCurrentUser,
  isLoggedIn,
  onAuthStateChange,
  sendPasswordReset,
  updatePassword,
  refreshSession,
  updateEmail,
  resendConfirmationEmail,
} from './authService';
export type { SignUpParams, SignInParams, AuthResult, AuthStateListener } from './authService';

// Profile
export {
  getCurrentProfile,
  getProfileById,
  getProfileByUsername,
  updateProfile,
  isUsernameAvailable,
  searchProfiles,
  getProfileSettings,
  updateProfileSettings,
  uploadAvatar,
  deleteAvatar,
  hasProfile,
} from './profileService';

// Runs
export {
  createRun,
  getRun,
  getUserRuns,
  getRecentRuns,
  updateRun,
  deleteRun,
  getLocalRuns,
  removeLocalRun,
  getAllRunsIncludingLocal,
  secondsToInterval,
  intervalToSeconds,
  calculatePace,
} from './runsService';

// Social
export {
  getFeedPosts,
  getFollowingFeed,
  getUserPosts,
  createPost,
  deletePost,
  likePost,
  unlikePost,
  toggleLike,
  getPostComments,
  addComment,
  deleteComment,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowerCount,
  getFollowingCount,
  getFollowers,
  getFollowing,
  subscribeToFeed,
  subscribeToPostLikes,
  subscribeToPostComments,
  unsubscribe,
} from './socialService';

// Stats & Achievements
export {
  getCurrentUserStats,
  getUserStats,
  updateUserStatsAfterRun,
  updateWeeklyGoal,
  getThisWeekDistance,
  getAllAchievements,
  getAchievementsByCategory,
  getUserAchievements,
  awardAchievement,
  hasAchievement,
  checkAndAwardAchievements,
  getAchievementProgress,
} from './statsService';

// Offline Queue
export { offlineQueue } from './offlineQueue';
export type { QueueItem, QueueActionType } from './offlineQueue';
