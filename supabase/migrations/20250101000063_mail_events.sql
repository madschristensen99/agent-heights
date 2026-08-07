-- Mail events table — persists inbound/outbound platform messages per user.
-- Replaces the in-memory platformEvents map in AgentManager.

CREATE TABLE IF NOT EXISTS public.agent_heights_mail_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  platform    TEXT NOT NULL,
  direction   TEXT NOT NULL DEFAULT 'inbound',  -- 'inbound' | 'outbound'
  sender      TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL DEFAULT '',
  timestamp   BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::BIGINT,
  status      TEXT NOT NULL DEFAULT 'new',       -- 'new' | 'delivered' | 'handled' | 'escalated'
  assigned_agent_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying a user's mail by platform, newest first
CREATE INDEX IF NOT EXISTS idx_mail_events_user_platform
  ON public.agent_heights_mail_events (user_id, platform, timestamp DESC);

-- Index for counting unread/new messages per user
CREATE INDEX IF NOT EXISTS idx_mail_events_user_status
  ON public.agent_heights_mail_events (user_id, status);

-- Enable RLS
ALTER TABLE public.agent_heights_mail_events ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own mail events
CREATE POLICY "mail_events_owner_select" ON public.agent_heights_mail_events
  FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "mail_events_owner_insert" ON public.agent_heights_mail_events
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "mail_events_owner_update" ON public.agent_heights_mail_events
  FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "mail_events_owner_delete" ON public.agent_heights_mail_events
  FOR DELETE USING (auth.uid()::text = user_id);

-- Service role bypasses RLS (used by the server)
