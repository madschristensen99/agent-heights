-- Fix Otter.ai agent: switch from API Key to OAuth authentication
-- The Otter MCP server uses OAuth, not API keys (per https://help.otter.ai/hc/en-us/articles/35287607569687)
UPDATE public.heights_cloud_agents
SET
  agent = '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Otter.ai agent connected via the Otter.ai MCP at https://mcp.otter.ai/mcp. Unlock your meeting intelligence. You authenticate via OAuth — no API key is needed. You have three tools: fetch (query a specific conversation by URL), search (search across all meeting transcripts), and get user info. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":4,"hair":4,"shirt":12,"pants":1,"accessory":0,"accent":9,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.otter.ai/mcp","name":"otter-ai","authType":"oauth"}]}',
  description = 'Otter.ai Agent — connected to Otter.ai via MCP (OAuth required).

Access Otter.ai''s meeting transcription platform via OAuth. Agents can fetch specific conversation transcripts by URL, search across all meeting transcripts, and retrieve user info.

This agent can:
• Fetch meeting transcripts by conversation URL
• Search across all captured meetings
• Retrieve Otter.ai user info

To connect: Authenticate with your Otter.ai account via OAuth.',
  summary = 'Otter.ai agent — Unlock your meeting intelligence. (OAuth)',
  use_cases = '["Fetch meeting transcripts by conversation URL","Search across all captured meetings","Retrieve Otter.ai user info"]',
  requirements = '["OAuth (https://help.otter.ai/hc/en-us/articles/35287607569687-Otter-MCP-Server)"]',
  links = '[{"label":"Otter.ai MCP Server","url":"https://mcp.otter.ai/mcp"},{"label":"Otter MCP Setup Guide","url":"https://help.otter.ai/hc/en-us/articles/35287607569687-Otter-MCP-Server"}]'
WHERE name = 'Otter.ai Agent';
