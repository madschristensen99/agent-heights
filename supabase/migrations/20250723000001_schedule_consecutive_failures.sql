-- Add consecutive_failures column for schedule backoff tracking
ALTER TABLE public.agent_heights_schedules
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
