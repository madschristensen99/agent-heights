-- Add platform_credentials JSONB column to world_state for persisting
-- per-user messaging platform tokens (e.g. TELEGRAM_BOT_TOKEN) across redeploys.

ALTER TABLE public.sprite_heights_world_state
  ADD COLUMN IF NOT EXISTS platform_credentials JSONB NOT NULL DEFAULT '{}'::jsonb;
