-- Agent HQ tables — shared Supabase project with the Swarms Marketplace.
-- Stores per-user game state as a JSONB blob (same shape as the old save.json).

CREATE TABLE IF NOT EXISTS public.agent_hq_saves (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.agent_hq_saves ENABLE ROW LEVEL SECURITY;

-- Users can read/write only their own save
CREATE POLICY "Users read own HQ save"
  ON public.agent_hq_saves FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own HQ save"
  ON public.agent_hq_saves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own HQ save"
  ON public.agent_hq_saves FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own HQ save"
  ON public.agent_hq_saves FOR DELETE
  USING (auth.uid() = user_id);

-- Index for sorting by update time
CREATE INDEX IF NOT EXISTS idx_agent_hq_saves_updated_at
  ON public.agent_hq_saves (updated_at DESC);
