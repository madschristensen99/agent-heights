-- Aspirational profiling system — tracks which "aspiration" each user resonates with.
-- Six tracks: warrior, builder, explorer, puzzle_solver, creator, strategist.
-- Scores are 0.0–1.0 with exponential decay (half-life ~7 days).
-- The dominant_aspiration column is computed on write and used by the concierge,
-- suggestion engine, and NPC speech to personalize the experience.

CREATE TABLE IF NOT EXISTS heights_cloud_aspiration_profiles (
  user_id              text PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  warrior_score        float NOT NULL DEFAULT 0.0,
  builder_score        float NOT NULL DEFAULT 0.0,
  explorer_score       float NOT NULL DEFAULT 0.0,
  puzzle_solver_score  float NOT NULL DEFAULT 0.0,
  creator_score        float NOT NULL DEFAULT 0.0,
  strategist_score     float NOT NULL DEFAULT 0.0,
  dominant_aspiration  text,
  signal_count         int NOT NULL DEFAULT 0,
  last_signal_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_aspiration_profiles_dominant
  ON heights_cloud_aspiration_profiles(dominant_aspiration)
  WHERE dominant_aspiration IS NOT NULL;

-- Helpful view for analytics
CREATE OR REPLACE VIEW aspiration_summary AS
SELECT
  dominant_aspiration,
  count(*) AS user_count,
  avg(warrior_score) AS avg_warrior,
  avg(builder_score) AS avg_builder,
  avg(explorer_score) AS avg_explorer,
  avg(puzzle_solver_score) AS avg_puzzle_solver,
  avg(creator_score) AS avg_creator,
  avg(strategist_score) AS avg_strategist
FROM heights_cloud_aspiration_profiles
WHERE dominant_aspiration IS NOT NULL
GROUP BY dominant_aspiration;
