-- Add `archived` column to agent_logs and conversation_messages.
-- Instead of hard-deleting logs/messages when a user clears an agent's chat,
-- we soft-delete by setting archived=true. This preserves the full audit trail
-- on the server while giving the agent a fresh context window.

-- ── agent_logs ─────────────────────────────────────────────────────────────

ALTER TABLE public.sprite_heights_agent_logs
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sprite_heights_agent_logs_agent_active
  ON public.sprite_heights_agent_logs (agent_id, ts DESC)
  WHERE archived = FALSE;

-- ── conversation_messages ──────────────────────────────────────────────────

ALTER TABLE public.sprite_heights_conversation_messages
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_agent_active
  ON public.sprite_heights_conversation_messages (agent_id, seq)
  WHERE archived = FALSE;
