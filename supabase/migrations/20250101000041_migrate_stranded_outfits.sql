-- ── Fix outfit org_id after rename ───────────────────────────────────────────
-- The Agent Heights HQ org ID changed from "org-sprite-heights-hq" to
-- "org-agent-heights-hq" in the code, but existing org-scoped outfits in the
-- database still reference the old org_id. Update them so they show up in the
-- wardrobe again.

UPDATE public.sprite_heights_saved_outfits
  SET org_id = 'org-agent-heights-hq'
  WHERE org_id = 'org-sprite-heights-hq';
