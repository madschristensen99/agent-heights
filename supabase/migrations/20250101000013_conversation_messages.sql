-- Conversation messages: full LLM message history per agent.
-- Enables context restoration across server restarts and provides
-- a complete audit trail of all assistant turns, tool calls, and results.

CREATE TABLE IF NOT EXISTS public.sprite_heights_conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES public.sprite_heights_agents(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  ts TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sprite_heights_conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own conversation messages"
  ON public.sprite_heights_conversation_messages FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users insert own conversation messages"
  ON public.sprite_heights_conversation_messages FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users delete own conversation messages"
  ON public.sprite_heights_conversation_messages FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Service role full access to conversation messages"
  ON public.sprite_heights_conversation_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_agent
  ON public.sprite_heights_conversation_messages (agent_id, seq);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_owner
  ON public.sprite_heights_conversation_messages (owner_id);
