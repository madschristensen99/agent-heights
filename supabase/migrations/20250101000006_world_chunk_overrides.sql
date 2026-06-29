-- Add chunk_overrides column to world_state table for persisting tile modifications.

ALTER TABLE public.agent_hq_world_state
  ADD COLUMN IF NOT EXISTS chunk_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
