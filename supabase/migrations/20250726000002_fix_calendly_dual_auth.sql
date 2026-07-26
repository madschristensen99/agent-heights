-- Calendly supports two authentication methods:
--   1. OAuth 2.1 (for public/multi-user apps) — used by the MCP server at https://mcp.calendly.com
--   2. Personal Access Tokens (for internal/single-account apps) — generated at https://calendly.com/integrations/api_webhooks
--
-- The original seed (20250101000017) created a single "Calendly Agent" with API Key auth,
-- but the MCP catalog has it as OAuth. This migration:
--   1. Updates the existing "Calendly Agent" to use OAuth (matching the MCP catalog)
--   2. Adds a new "Calendly (Personal Token) Agent" for the personal access token flow

-- 1. Switch the existing Calendly Agent to OAuth
UPDATE public.swarms_cloud_agents
SET
  agent = '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Calendly agent connected via the Calendly MCP at https://mcp.calendly.com. You manage scheduling, events, and availability. You authenticate via OAuth — the user will connect their Calendly account. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":6,"hair":3,"shirt":0,"pants":0,"accessory":0,"accent":8,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.calendly.com","name":"calendly","authType":"oauth"}]}',
  description = 'Calendly Agent — connected to Calendly via MCP (OAuth required).

Manage Calendly scheduling, events, and availability. Agents can create meeting types, check availability, and schedule appointments.

This agent can:
• Access Calendly data and capabilities via MCP
• Automate Calendly workflows from conversation
• Create and manage event types
• Check availability and schedule meetings

To connect: Click "Connect via OAuth" when hiring this agent.',
  summary = 'Calendly agent — Scheduling, events, availability. (OAuth)',
  use_cases = '["Access Calendly data and capabilities via MCP","Automate Calendly workflows from conversation","Create and manage event types","Check availability and schedule meetings"]',
  requirements = '["OAuth (https://calendly.com/integrations/api_webhooks)"]',
  links = '[{"label":"Calendly MCP Server","url":"https://mcp.calendly.com"},{"label":"Calendly Developer Docs","url":"https://developer.calendly.com"}]'
WHERE name = 'Calendly Agent';

-- 2. Add a Personal Token variant for users who prefer API keys
DELETE FROM public.swarms_cloud_agents WHERE name = 'Calendly (Personal Token) Agent';

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES (
  'Calendly (Personal Token) Agent',
  '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Calendly agent connected via the Calendly MCP at https://mcp.calendly.com using a Personal Access Token. You manage scheduling, events, availability, and webhook subscriptions. You authenticate with a personal access token — the user will provide their token from https://calendly.com/integrations/api_webhooks. When asked to perform actions, always confirm destructive operations with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"agent-heights","appearance":{"skin":3,"hairStyle":2,"hair":5,"shirt":9,"pants":3,"accessory":1,"accent":8,"beard":0,"eyeColor":4,"headFeature":0},"mcpServers":[{"url":"https://mcp.calendly.com","name":"calendly-pat","authType":"apikey","keyLabel":"Personal Access Token","keyPlaceholder":"eyJ...","keyHelpUrl":"https://calendly.com/integrations/api_webhooks"}]}',
  'Calendly (Personal Token) Agent — connected to Calendly via MCP (Personal Access Token required).

Manage Calendly scheduling, events, and availability using a Personal Access Token. Agents can create meeting types, check availability, schedule appointments, and set up webhook subscriptions for real-time event notifications.

This agent can:
• Access Calendly data and capabilities via MCP
• Automate Calendly workflows from conversation
• Create and manage event types
• Check availability and schedule meetings
• Set up webhook subscriptions for real-time scheduling notifications

Best for: internal apps, single-account usage, local development, and testing.

To connect: Generate a Personal Access Token at https://calendly.com/integrations/api_webhooks',
  'Calendly agent — Scheduling, events, webhooks. (Personal Access Token)',
  'calendly,calendly,mcp,Productivity,scheduling,webhook',
  true,
  null,
  null,
  'TypeScript',
  'agent',
  'approved',
  '["Access Calendly data and capabilities via MCP","Automate Calendly workflows from conversation","Create and manage event types","Check availability and schedule meetings","Set up webhook subscriptions for real-time notifications"]',
  '["Productivity","Scheduling"]',
  '["Personal Access Token (https://calendly.com/integrations/api_webhooks)"]',
  '[{"label":"Calendly MCP Server","url":"https://mcp.calendly.com"},{"label":"Get your Personal Access Token","url":"https://calendly.com/integrations/api_webhooks"},{"label":"Calendly Developer Docs","url":"https://developer.calendly.com"}]',
  'https://icons.duckduckgo.com/ip3/calendly.com.ico'
);
