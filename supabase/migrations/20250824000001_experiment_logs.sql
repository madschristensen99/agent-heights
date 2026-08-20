-- Experiment log — tracks agent config changes, model swaps, MCP installs,
-- and hiring/firing events as structured experiment entries for the Explorer track.

CREATE TABLE IF NOT EXISTS heights_cloud_experiment_logs (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  type text NOT NULL,
  agent_id text,
  agent_name text,
  hypothesis text,
  setup jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  verdict text NOT NULL DEFAULT 'pending',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiment_logs_user
  ON heights_cloud_experiment_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_experiment_logs_user_created
  ON heights_cloud_experiment_logs(user_id, created_at DESC);

ALTER TABLE heights_cloud_experiment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own experiment logs"
  ON heights_cloud_experiment_logs FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own experiment logs"
  ON heights_cloud_experiment_logs FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own experiment logs"
  ON heights_cloud_experiment_logs FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own experiment logs"
  ON heights_cloud_experiment_logs FOR DELETE
  USING (auth.uid()::text = user_id);
