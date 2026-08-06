-- ── Rename "Agent Heights HQ" org to "Command Center" ────────────────────────
-- Update the seeded organization name and slug to match the new code constants.
-- The org_id string also changes from "org-agent-heights-hq" to "org-command-center".

UPDATE public.agent_heights_organizations
  SET name = 'Command Center', slug = 'command-center'
  WHERE slug IN ('agent-heights-hq', 'sprite-heights-hq');

-- Update org_id references in saved outfits (org_id is a TEXT column, not a FK)
UPDATE public.agent_heights_saved_outfits
  SET org_id = 'org-command-center'
  WHERE org_id IN ('org-agent-heights-hq', 'org-sprite-heights-hq');
