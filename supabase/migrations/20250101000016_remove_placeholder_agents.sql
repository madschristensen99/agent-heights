-- Remove placeholder/crap agents from the marketplace.
-- Keep only: Robinhood Trading Agent, Market Data Analyst, GitHub Agent.
-- The Robinhood and Yahoo Finance agents are seeded in earlier migrations;
-- the GitHub Agent is seeded in 20250101000015.

DELETE FROM public.swarms_cloud_agents
WHERE name IN (
  'Code Review Sentinel',
  'Data Analyst Pro',
  'Research Assistant',
  'DevOps Automator',
  'Content Writer'
);
