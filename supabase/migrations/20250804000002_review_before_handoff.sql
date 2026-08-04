-- Add review_before_handoff setting to game settings table
ALTER TABLE public.agent_heights_game_settings
  ADD COLUMN IF NOT EXISTS cline_review_handoff BOOLEAN NOT NULL DEFAULT false;
