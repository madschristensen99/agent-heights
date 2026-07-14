-- ── org-scoped outfits ──────────────────────────────────────────────────────
-- Add org_id column so outfits can belong to an organization (shared wardrobe)
-- or to an individual user (personal wardrobe).

ALTER TABLE public.agent_hq_saved_outfits
  ADD COLUMN IF NOT EXISTS org_id UUID NULL;

-- Index for org-scoped outfit lookups
CREATE INDEX IF NOT EXISTS idx_saved_outfits_org
  ON public.agent_hq_saved_outfits(org_id)
  WHERE org_id IS NOT NULL;

-- Index for user-scoped personal outfit lookups (excluding org outfits)
CREATE INDEX IF NOT EXISTS idx_saved_outfits_user_personal
  ON public.agent_hq_saved_outfits(user_id)
  WHERE org_id IS NULL;
