-- Add vacationed_agents column to world_state (JSONB array, same pattern as fired_agents)

ALTER TABLE public.sprite_heights_world_state
  ADD COLUMN IF NOT EXISTS vacationed_agents JSONB NOT NULL DEFAULT '[]'::jsonb;
