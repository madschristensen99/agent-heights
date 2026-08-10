-- Remove Shopify Agent — seeded URL (https://setup.shopify.com/mcp) is not a real MCP server (404).
-- Shopify's Storefront MCP is per-store (https://{shop}.myshopify.com/api/mcp), not a universal endpoint.
-- Can re-add later with per-store URL placeholder support.

DELETE FROM heights_cloud_agents
WHERE name = 'Shopify';
