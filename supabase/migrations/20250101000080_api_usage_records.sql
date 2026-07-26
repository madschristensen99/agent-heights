-- Per-user API usage tracking: one row per LLM call.
-- Records token counts, estimated cost, model, agent, and task context
-- so we can build spend dashboards and enforce budgets.

CREATE TABLE IF NOT EXISTS public.api_usage_records (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT,
  agent_name TEXT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'swarms',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,6) NOT NULL DEFAULT 0,
  task TEXT,
  is_chat BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage records"
  ON public.api_usage_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to usage records"
  ON public.api_usage_records FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_api_usage_records_user
  ON public.api_usage_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_records_user_model
  ON public.api_usage_records (user_id, model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_records_created_at
  ON public.api_usage_records (created_at DESC);
