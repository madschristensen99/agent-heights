-- Add index on agent_heights_agents.status to speed up boot restore queries
-- that filter by status IN ('thinking', 'working')
CREATE INDEX IF NOT EXISTS idx_agent_heights_agents_status
  ON public.agent_heights_agents (status);
