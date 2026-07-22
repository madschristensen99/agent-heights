ALTER TABLE public.sprite_heights_world_state
  ADD COLUMN IF NOT EXISTS office_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
