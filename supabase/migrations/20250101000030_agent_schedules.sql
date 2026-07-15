-- Agent schedules: recurring cron-like tasks assigned to agents.
CREATE TABLE IF NOT EXISTS public.sprite_heights_schedules (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES public.sprite_heights_agents(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.sprite_heights_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  task TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at BIGINT,
  next_run_at BIGINT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  handoff_to TEXT,
  created_at BIGINT NOT NULL
);

ALTER TABLE public.sprite_heights_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own schedules"
  ON public.sprite_heights_schedules FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert own schedules"
  ON public.sprite_heights_schedules FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users update own schedules"
  ON public.sprite_heights_schedules FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users delete own schedules"
  ON public.sprite_heights_schedules FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access to schedules"
  ON public.sprite_heights_schedules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sprite_heights_schedules_owner ON public.sprite_heights_schedules (owner_id);
CREATE INDEX IF NOT EXISTS idx_sprite_heights_schedules_agent ON public.sprite_heights_schedules (agent_id);
CREATE INDEX IF NOT EXISTS idx_sprite_heights_schedules_next_run ON public.sprite_heights_schedules (next_run_at);
