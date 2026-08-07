-- Remove broken/non-functional curated agents from the marketplace
-- Talken, Phantom, and WAIaaS agents don't work and are being removed from the curated list

DELETE FROM heights_cloud_agents
WHERE name IN (
  'Talken Swap Agent',
  'Phantom Wallet Agent',
  'WAIaaS DeFi Agent'
);
