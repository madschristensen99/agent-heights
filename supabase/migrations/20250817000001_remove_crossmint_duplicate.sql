-- Remove duplicate Crossmint Wallet agent.
-- The manual " Agent" suffix cleanup created a second row; keep the one
-- without the suffix to match all other marketplace agents.

DELETE FROM public.heights_cloud_agents
WHERE name = 'Crossmint Wallet Agent';
