-- Store the free-text onboarding description users provide during signup.
-- Used for agentic agent recommendations and CRM insights (what tools/roles
-- our users actually need).
CREATE TABLE IF NOT EXISTS heights_cloud_user_onboarding (
  user_id   TEXT PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE heights_cloud_user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own onboarding text"
  ON heights_cloud_user_onboarding FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own onboarding text"
  ON heights_cloud_user_onboarding FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own onboarding text"
  ON heights_cloud_user_onboarding FOR UPDATE
  USING (auth.uid()::text = user_id);
