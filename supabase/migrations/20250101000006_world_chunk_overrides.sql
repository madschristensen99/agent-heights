-- Add chunk_overrides column to world_state table for persisting tile modifications.

ALTER TABLE public.sprite_heights_world_state
  ADD COLUMN IF NOT EXISTS chunk_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
