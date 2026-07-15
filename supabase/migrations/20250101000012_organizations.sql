-- Phase 4: Organizations
-- Adds organizations that group multiple users, own rooms, and can map 1:1
-- to a GitHub organization. This relaxes the single-tenant constraint to
-- allow shared org rooms where members can collaborate.

-- ── organizations ───────────────────────────────────────────────────────────
-- An organization groups users and owns rooms. Maps to a GitHub org.

CREATE TABLE IF NOT EXISTS public.sprite_heights_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  github_org TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sprite_heights_organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to organizations" ON public.sprite_heights_organizations;
CREATE POLICY "Service role full access to organizations"
  ON public.sprite_heights_organizations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── organization_members ────────────────────────────────────────────────────
-- Tracks which users belong to which organizations and their role.

CREATE TABLE IF NOT EXISTS public.sprite_heights_org_members (
  org_id UUID REFERENCES public.sprite_heights_organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- admin | member
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

ALTER TABLE public.sprite_heights_org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read orgs they belong to" ON public.sprite_heights_org_members;
CREATE POLICY "Users read orgs they belong to"
  ON public.sprite_heights_org_members FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to org members" ON public.sprite_heights_org_members;
CREATE POLICY "Service role full access to org members"
  ON public.sprite_heights_org_members FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Extend rooms with org support ───────────────────────────────────────────
-- Add org_id and room_type to sprite_heights_rooms.

ALTER TABLE public.sprite_heights_rooms
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.sprite_heights_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.sprite_heights_rooms
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'private'; -- private | organization | public

-- Index for org-scoped room queries
CREATE INDEX IF NOT EXISTS idx_sprite_heights_rooms_org
  ON public.sprite_heights_rooms (org_id);

-- Allow org rooms to have NULL owner_id (owned by the org, not a single user)
-- This is handled at the application level; the DB column stays nullable.

-- ── Seed the Sprite Heights HQ organization ───────────────────────────────────────
-- Pre-seed the "Sprite Heights HQ" org. Members are added at runtime when the
-- whitelisted users (remseechannel@gmail.com, madschristensen99@icloud.com)
-- connect for the first time.

INSERT INTO public.sprite_heights_organizations (name, slug, github_org)
  VALUES ('Sprite Heights HQ', 'sprite-heights-hq', 'sprite-heights')
  ON CONFLICT (slug) DO NOTHING;
