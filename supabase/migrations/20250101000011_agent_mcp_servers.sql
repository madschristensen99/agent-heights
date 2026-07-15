-- Add mcp_servers column to sprite_heights_agents so MCP server configs survive restarts.
-- Without this, agents hired from the marketplace (e.g. Robinhood Trading Agent) lose
-- their mcpServers config on rebuild/redeploy, even though OAuth tokens persist in user_mcp_keys.

ALTER TABLE public.sprite_heights_agents
  ADD COLUMN IF NOT EXISTS mcp_servers JSONB;
