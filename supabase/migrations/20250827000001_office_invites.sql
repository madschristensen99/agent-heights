-- Office invites: email-based invites to visit and use someone's office.
-- A paid user (entrance fee or subscription) can invite friends by email.
-- The friend gets a branded email, signs up, and is auto-invited to the
-- inviter's private office room with "talk" access.

CREATE TABLE IF NOT EXISTS public.heights_cloud_office_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  room_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | claimed | expired
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at    TIMESTAMPTZ,
  claimed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- One pending invite per email per inviter
  UNIQUE (inviter_id, invitee_email)
);

ALTER TABLE public.heights_cloud_office_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to office_invites" ON public.heights_cloud_office_invites;
CREATE POLICY "Service role full access to office_invites"
  ON public.heights_cloud_office_invites FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for listing a user's pending invites
CREATE INDEX IF NOT EXISTS idx_office_invites_inviter
  ON public.heights_cloud_office_invites (inviter_id, status);

-- Index for looking up an invite by invitee email (used during claim)
CREATE INDEX IF NOT EXISTS idx_office_invites_email
  ON public.heights_cloud_office_invites (invitee_email, status);
