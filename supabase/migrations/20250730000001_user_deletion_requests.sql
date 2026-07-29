-- User account deletion requests with 30-day grace period.
-- When a user requests deletion, a row is inserted here. If they sign
-- back in within 30 days they can cancel. After the grace period the
-- cleanup job permanently deletes the auth user (cascading all FK tables).
-- GDPR Article 17 compliance: right to erasure with reasonable timeframe.

CREATE TABLE IF NOT EXISTS public.agent_heights_deletion_requests (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_deletion_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ
);

-- Index for the cleanup job to find expired requests efficiently
CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled
  ON public.agent_heights_deletion_requests (scheduled_deletion_at)
  WHERE cancelled_at IS NULL;
