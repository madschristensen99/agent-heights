-- Social graph: friends, display names, and org persistence.
-- The agent_heights_organizations and agent_heights_org_members tables already
-- exist from migration 20250101000012 (renamed in 20250727000002). This migration
-- adds the friends table and a display_name column to user profiles.

-- ── friends ─────────────────────────────────────────────────────────────────
-- Bidirectional friend relationships. Each row is a directed request; accepted
-- rows exist in both directions (user_id → friend_id and friend_id → user_id).

CREATE TABLE IF NOT EXISTS public.heights_cloud_friends (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | blocked
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

ALTER TABLE public.heights_cloud_friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to friends" ON public.heights_cloud_friends;
CREATE POLICY "Service role full access to friends"
  ON public.heights_cloud_friends FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for looking up a user's friends
CREATE INDEX IF NOT EXISTS idx_heights_cloud_friends_user
  ON public.heights_cloud_friends (user_id, status);

-- Index for finding pending requests targeting a user
CREATE INDEX IF NOT EXISTS idx_heights_cloud_friends_friend
  ON public.heights_cloud_friends (friend_id, status);

-- ── display_name on user_profiles ───────────────────────────────────────────
-- Add a display_name column to the existing heights_cloud_user_profiles table
-- for social display (friends list, online players, room occupancy).

ALTER TABLE public.heights_cloud_user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;
