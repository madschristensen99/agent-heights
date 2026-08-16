-- Rename agent ID from 'agent-resources' to 'office-manager' across all tables.
-- The Office Manager is a permanent NPC; its ID changed for consistency with the rebrand.

-- FK constraints referencing agent_heights_agents(id) don't have ON UPDATE CASCADE,
-- so we drop them, update the IDs, then recreate them.

ALTER TABLE public.agent_heights_agent_logs
  DROP CONSTRAINT IF EXISTS agent_heights_agent_logs_agent_id_fkey;

ALTER TABLE public.agent_heights_task_cards
  DROP CONSTRAINT IF EXISTS agent_heights_task_cards_assigned_agent_id_fkey;

ALTER TABLE public.agent_heights_schedules
  DROP CONSTRAINT IF EXISTS agent_heights_schedules_agent_id_fkey;

ALTER TABLE public.agent_heights_conversation_messages
  DROP CONSTRAINT IF EXISTS agent_heights_conversation_messages_agent_id_fkey;

-- Update the parent table
UPDATE public.agent_heights_agents SET id = 'office-manager' WHERE id = 'agent-resources';

-- Update all child tables
UPDATE public.agent_heights_agent_logs SET agent_id = 'office-manager' WHERE agent_id = 'agent-resources';
UPDATE public.agent_heights_task_cards SET assigned_agent_id = 'office-manager' WHERE assigned_agent_id = 'agent-resources';
UPDATE public.agent_heights_schedules SET agent_id = 'office-manager' WHERE agent_id = 'agent-resources';
UPDATE public.agent_heights_conversation_messages SET agent_id = 'office-manager' WHERE agent_id = 'agent-resources';

-- api_usage_records has agent_id as plain TEXT (no FK)
UPDATE public.api_usage_records SET agent_id = 'office-manager' WHERE agent_id = 'agent-resources';

-- Recreate FK constraints
ALTER TABLE public.agent_heights_agent_logs
  ADD CONSTRAINT agent_heights_agent_logs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.agent_heights_agents(id) ON DELETE CASCADE;

ALTER TABLE public.agent_heights_task_cards
  ADD CONSTRAINT agent_heights_task_cards_assigned_agent_id_fkey
  FOREIGN KEY (assigned_agent_id) REFERENCES public.agent_heights_agents(id) ON DELETE SET NULL;

ALTER TABLE public.agent_heights_schedules
  ADD CONSTRAINT agent_heights_schedules_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.agent_heights_agents(id) ON DELETE CASCADE;

ALTER TABLE public.agent_heights_conversation_messages
  ADD CONSTRAINT agent_heights_conversation_messages_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.agent_heights_agents(id) ON DELETE CASCADE;
