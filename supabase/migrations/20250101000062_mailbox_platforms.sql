-- Add mailbox_platforms column to game_settings
-- Stores which platform each of the 6 mailbox slots is assigned to (null = unassigned)
-- Default: all unassigned — user picks platforms via in-world interaction

ALTER TABLE public.agent_heights_game_settings
  ADD COLUMN IF NOT EXISTS mailbox_platforms TEXT[] NOT NULL DEFAULT
    ARRAY[NULL, NULL, NULL, NULL, NULL, NULL]::TEXT[];
