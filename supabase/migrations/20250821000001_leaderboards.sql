-- Leaderboards & Trophy Room: add speedrun tracking columns to achievements table
-- The heights_cloud_achievements table already stores unlocked/stats/sets as JSONB.
-- We add a dedicated speedrun_time_ms column for fast leaderboard queries and
-- a weekly_reset_at column to track when weekly stats were last reset.

-- Add speedrun_time_ms column (nullable — only set when crown is placed)
ALTER TABLE heights_cloud_achievements
  ADD COLUMN IF NOT EXISTS speedrun_time_ms BIGINT;

-- Add weekly_stats JSONB column for tracking stats within the current week
ALTER TABLE heights_cloud_achievements
  ADD COLUMN IF NOT EXISTS weekly_stats JSONB DEFAULT '{}'::jsonb;

-- Add weekly_reset_at timestamp to track when weekly stats were last reset
ALTER TABLE heights_cloud_achievements
  ADD COLUMN IF NOT EXISTS weekly_reset_at TIMESTAMPTZ DEFAULT now();

-- Add index on speedrun_time_ms for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_achievements_speedrun
  ON heights_cloud_achievements (speedrun_time_ms)
  WHERE speedrun_time_ms IS NOT NULL;
