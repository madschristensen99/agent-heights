-- Add pending_tasks JSONB column to world_state for agent task resumption across restarts.
ALTER TABLE public.agent_heights_world_state
  ADD COLUMN IF NOT EXISTS pending_tasks JSONB NOT NULL DEFAULT '{}'::jsonb;
