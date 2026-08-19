-- User profiles for adaptive communication and funnel tracking.
-- Stores inferred usage category, funnel stage, and confidence scores.
-- ProfileManager ingests task completions, hires, MCP connections, model choices
-- and infers a category (research, coding, marketing, finance, general).
-- Confidence-gated: don't act on inferred data until confidence > 0.6.

CREATE TABLE IF NOT EXISTS heights_cloud_user_profiles (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Inferred usage category: research, coding, marketing, finance, general
  category         TEXT NOT NULL DEFAULT 'general',
  -- Confidence score 0.0–1.0 — only act when > 0.6
  category_confidence REAL NOT NULL DEFAULT 0.0,

  -- Funnel stage: pre_entry, entry, activated, retained, churned
  funnel_stage     TEXT NOT NULL DEFAULT 'pre_entry',
  -- Whether the user has paid the $0.99 entrance fee
  entrance_paid    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Explicit onboarding intent (from the post-first-hire modal)
  stated_intent    TEXT,

  -- Activity counters (updated by ProfileManager.ingest*)
  total_tasks_done     INT NOT NULL DEFAULT 0,
  total_agents_hired   INT NOT NULL DEFAULT 0,
  total_mcp_connections INT NOT NULL DEFAULT 0,
  total_fires          INT NOT NULL DEFAULT 0,
  total_recruits       INT NOT NULL DEFAULT 0,

  -- Model usage frequency map (model_id → count) as JSONB
  model_usage      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- MCP server types connected (for feature recommendations)
  mcp_server_types JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Feature recommendation tracking (rate-limited 1/week)
  last_feature_rec_at BIGINT NOT NULL DEFAULT 0,
  last_feature_rec_type TEXT,

  -- Funnel email tracking
  last_funnel_email_at  BIGINT NOT NULL DEFAULT 0,
  last_funnel_email_type TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE heights_cloud_user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON heights_cloud_user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own stated_intent
CREATE POLICY "Users can update own profile"
  ON heights_cloud_user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (server) has full access via supabaseAdmin
