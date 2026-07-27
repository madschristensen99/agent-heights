-- Add extra_fields JSONB column to agent_heights_agents for persisting fields
-- like cdpSolana, crossmintWallet, personality, mood, acl, waitingFor.
-- These are optional fields on AgentInfo that aren't covered by dedicated columns.

ALTER TABLE public.agent_heights_agents
  ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT '{}';
