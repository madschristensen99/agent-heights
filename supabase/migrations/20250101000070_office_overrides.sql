ALTER TABLE public.agent_heights_world_state
  ADD COLUMN IF NOT EXISTS office_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
