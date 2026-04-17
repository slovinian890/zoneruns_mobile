
-- 1. PROFILES TABLE

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Profiles are viewable by everyone"
ON profiles FOR SELECT
USING (true);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- 2. PROFILE SETTINGS TABLE

CREATE TABLE IF NOT EXISTS profile_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  profile_visible BOOLEAN DEFAULT true,
  stats_visible BOOLEAN DEFAULT true,
  runs_visible BOOLEAN DEFAULT true,
  achievements_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profile_settings_user ON profile_settings(user_id);

-- Enable RLS
ALTER TABLE profile_settings ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own settings" ON profile_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON profile_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON profile_settings;

CREATE POLICY "Users can view own settings"
ON profile_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
ON profile_settings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
ON profile_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 3. RUNS TABLE

-- Individual run records

CREATE TABLE IF NOT EXISTS runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  run_time TIME,
  distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
  duration INTERVAL,
  pace TEXT,
  calories INTEGER DEFAULT 0,
  elevation_m INTEGER DEFAULT 0,
  avg_heart_rate INTEGER,
  max_heart_rate INTEGER,
  notes TEXT,
  route_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_date ON runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user_date ON runs(user_id, run_date DESC);

-- Enable RLS
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view all runs" ON runs;
DROP POLICY IF EXISTS "Users can insert own runs" ON runs;
DROP POLICY IF EXISTS "Users can update own runs" ON runs;
DROP POLICY IF EXISTS "Users can delete own runs" ON runs;

CREATE POLICY "Users can view all runs"
ON runs FOR SELECT
USING (true);

CREATE POLICY "Users can insert own runs"
ON runs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own runs"
ON runs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own runs"
ON runs FOR DELETE
USING (auth.uid() = user_id);

-- 4. USER STATS TABLE
-- Aggregated user statistics (can be updated via triggers or manually)

CREATE TABLE IF NOT EXISTS user_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  total_runs INTEGER DEFAULT 0,
  total_distance_km NUMERIC(10, 2) DEFAULT 0,
  total_duration INTERVAL DEFAULT '0 seconds',
  total_calories INTEGER DEFAULT 0,
  total_elevation_m INTEGER DEFAULT 0,
  avg_pace TEXT,
  best_pace TEXT,
  longest_run_km NUMERIC(10, 2) DEFAULT 0,
  weekly_goal_km NUMERIC(10, 2) DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_stats_user ON user_stats(user_id);

-- Enable RLS
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view all stats" ON user_stats;
DROP POLICY IF EXISTS "Users can update own stats" ON user_stats;
DROP POLICY IF EXISTS "Users can insert own stats" ON user_stats;

CREATE POLICY "Users can view all stats"
ON user_stats FOR SELECT
USING (true);

CREATE POLICY "Users can update own stats"
ON user_stats FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats"
ON user_stats FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 5. POSTS TABLE
-- Social feed posts

CREATE TABLE IF NOT EXISTS posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'social' CHECK (type IN ('social', 'run', 'achievement', 'photo')),
  title TEXT,
  content TEXT,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_run ON posts(run_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);

-- Enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
DROP POLICY IF EXISTS "Users can insert own posts" ON posts;
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;

CREATE POLICY "Posts are viewable by everyone"
ON posts FOR SELECT
USING (true);

CREATE POLICY "Users can insert own posts"
ON posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
ON posts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
ON posts FOR DELETE
USING (auth.uid() = user_id);

-- 6. POST LIKES TABLE
-- Likes on posts

CREATE TABLE IF NOT EXISTS post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

-- Enable RLS
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON post_likes;
DROP POLICY IF EXISTS "Users can insert own likes" ON post_likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON post_likes;

CREATE POLICY "Likes are viewable by everyone"
ON post_likes FOR SELECT
USING (true);

CREATE POLICY "Users can insert own likes"
ON post_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes"
ON post_likes FOR DELETE
USING (auth.uid() = user_id);

-- 7. POST COMMENTS TABLE
-- Comments on posts

CREATE TABLE IF NOT EXISTS post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user ON post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(created_at DESC);

-- Enable RLS
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON post_comments;
DROP POLICY IF EXISTS "Users can insert own comments" ON post_comments;
DROP POLICY IF EXISTS "Users can update own comments" ON post_comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON post_comments;

CREATE POLICY "Comments are viewable by everyone"
ON post_comments FOR SELECT
USING (true);

CREATE POLICY "Users can insert own comments"
ON post_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
ON post_comments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON post_comments FOR DELETE
USING (auth.uid() = user_id);

-- 8. FOLLOWERS TABLE
-- Follower relationships between users

CREATE TABLE IF NOT EXISTS followers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id);

-- Enable RLS
ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Followers are viewable by everyone" ON followers;
DROP POLICY IF EXISTS "Users can follow others" ON followers;
DROP POLICY IF EXISTS "Users can unfollow" ON followers;

CREATE POLICY "Followers are viewable by everyone"
ON followers FOR SELECT
USING (true);

CREATE POLICY "Users can follow others"
ON followers FOR INSERT
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
ON followers FOR DELETE
USING (auth.uid() = follower_id);

-- 9. ACHIEVEMENTS TABLE
-- Achievement definitions

CREATE TABLE IF NOT EXISTS achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL,
  requirement_type TEXT,
  requirement_value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Achievements are viewable by everyone" ON achievements;

CREATE POLICY "Achievements are viewable by everyone"
ON achievements FOR SELECT
USING (true);

-- 10. USER ACHIEVEMENTS TABLE
-- Junction table for user earned achievements

CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement ON user_achievements(achievement_id);

-- Enable RLS
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "User achievements are viewable by everyone" ON user_achievements;
DROP POLICY IF EXISTS "Users can earn achievements" ON user_achievements;

CREATE POLICY "User achievements are viewable by everyone"
ON user_achievements FOR SELECT
USING (true);

CREATE POLICY "Users can earn achievements"
ON user_achievements FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 11. FUNCTIONS & TRIGGERS

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.email
  );
  
  -- Also create initial user_stats record
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id);
  
  -- Also create initial profile_settings record
  INSERT INTO public.profile_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON runs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON posts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON user_stats;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON profile_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON profile_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 12. SEED ACHIEVEMENTS DATA

INSERT INTO achievements (title, description, icon, category, requirement_type, requirement_value) VALUES
-- Distance Achievements
('First Steps', 'Complete your first run', 'faPersonRunning', 'Distance', 'total_runs', 1),
('5K Warrior', 'Run 5 kilometers in a single run', 'faPersonRunning', 'Distance', 'single_run_distance', 5),
('10K Champion', 'Run 10 kilometers in a single run', 'faMedal', 'Distance', 'single_run_distance', 10),
('Half Marathon Hero', 'Complete a half marathon (21.1km)', 'faTrophy', 'Distance', 'single_run_distance', 21.1),
('Marathon Master', 'Complete a full marathon (42.2km)', 'faTrophy', 'Distance', 'single_run_distance', 42.2),
('Century Club', 'Run 100km total', 'faMedal', 'Distance', 'total_distance', 100),
('500km Explorer', 'Run 500km total', 'faChartLine', 'Distance', 'total_distance', 500),
('1000km Legend', 'Run 1000km total', 'faStar', 'Distance', 'total_distance', 1000),

-- Speed Achievements
('Speed Demon', 'Run at a pace under 5:00/km', 'faBolt', 'Speed', 'best_pace', 300),
('Lightning Fast', 'Run at a pace under 4:30/km', 'faBolt', 'Speed', 'best_pace', 270),
('Supersonic', 'Run at a pace under 4:00/km', 'faBolt', 'Speed', 'best_pace', 240),
('Pace Improver', 'Improve your average pace by 30 seconds', 'faStopwatch', 'Speed', 'pace_improvement', 30),

-- Consistency Achievements
('Getting Started', 'Complete 5 runs', 'faPersonRunning', 'Consistency', 'total_runs', 5),
('Regular Runner', 'Complete 25 runs', 'faFire', 'Consistency', 'total_runs', 25),
('Dedicated Athlete', 'Complete 50 runs', 'faFire', 'Consistency', 'total_runs', 50),
('Running Enthusiast', 'Complete 100 runs', 'faStar', 'Consistency', 'total_runs', 100),
('Week Warrior', 'Run every day for a week', 'faFire', 'Consistency', 'streak_days', 7),
('Month Master', 'Run at least 3 times per week for a month', 'faTrophy', 'Consistency', 'monthly_consistency', 12),

-- Milestones
('Early Bird', 'Complete a run before 7am', 'faClock', 'Milestones', 'morning_run', 1),
('Night Owl', 'Complete a run after 8pm', 'faClock', 'Milestones', 'evening_run', 1),
('Weekend Warrior', 'Run on both Saturday and Sunday', 'faPersonRunning', 'Milestones', 'weekend_runs', 2),
('New Year Runner', 'Complete a run on January 1st', 'faStar', 'Milestones', 'new_year_run', 1),

-- Challenges
('Hill Climber', 'Accumulate 500m of elevation gain', 'faMountain', 'Challenges', 'total_elevation', 500),
('Mountain Goat', 'Accumulate 2000m of elevation gain', 'faMountain', 'Challenges', 'total_elevation', 2000),
('Long Hauler', 'Run for over 2 hours in a single run', 'faClock', 'Challenges', 'single_run_duration', 7200),
('Endurance King', 'Run for over 3 hours in a single run', 'faTrophy', 'Challenges', 'single_run_duration', 10800),

-- Health
('Calorie Crusher', 'Burn 10,000 calories running', 'faHeart', 'Health', 'total_calories', 10000),
('Mega Burner', 'Burn 50,000 calories running', 'faHeart', 'Health', 'total_calories', 50000),
('Heart Health Hero', 'Complete 20 cardio zone runs', 'faHeart', 'Health', 'cardio_runs', 20)