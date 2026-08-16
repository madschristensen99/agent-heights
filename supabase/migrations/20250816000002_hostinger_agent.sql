-- Seed the marketplace with a curated Hostinger Agent.
-- Hostinger hosts a remote MCP server at https://mcp.hostinger.com
-- Auth: API Token (Bearer) — generate at hPanel → Account → API
-- Tools: Websites, VPS, Domains/DNS, Email Marketing, Subscriptions & Payments, Ecommerce, WordPress, Agency Hosting

DELETE FROM public.heights_cloud_agents
WHERE name = 'Hostinger Agent';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES (
  'Hostinger Agent',
  '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Hostinger Agent connected via the Hostinger MCP at https://mcp.hostinger.com. You manage Hostinger hosting infrastructure — websites, VPS, domains, DNS, email marketing, subscriptions, ecommerce, and WordPress sites. You authenticate via an API token — the user will provide their Hostinger API token. When asked to perform actions, always confirm destructive operations (deploying, overwriting websites, changing DNS, unlinking domains) with the user first. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":3,"hair":5,"shirt":7,"pants":2,"accessory":1,"accent":4,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"url":"https://mcp.hostinger.com","name":"hostinger","authType":"apikey","keyLabel":"Hostinger API Token","keyPlaceholder":"Paste your Hostinger API token...","keyHelpUrl":"https://hpanel.hostinger.com/profile/api"}]}',
  'Hostinger Agent — connected to Hostinger via MCP (API Token).\n\nManage your Hostinger hosting infrastructure through AI: websites, VPS instances, domains, DNS records, email marketing campaigns, subscriptions & payments, ecommerce stores, and WordPress sites.\n\nThis agent can:\n• Deploy and manage websites (Node.js static, PHP, WordPress)\n• Manage VPS instances\n• Manage domains and DNS records\n• Run email marketing campaigns\n• Handle subscriptions and billing\n• Manage ecommerce stores\n• Per-site WordPress management\n\nTo connect: Generate an API token at hPanel → Account → API, then paste it when hiring this agent.\n\nSecurity note: This agent has full access to your Hostinger account. Restrict with ACLs in shared rooms.',
  'Hostinger agent — manage websites, VPS, domains, DNS, email marketing, billing, and ecommerce via Hostinger MCP (API token)',
  'hostinger,hosting,vps,dns,domains,ecommerce,wordpress,infrastructure,Infrastructure',
  true,
  null,
  null,
  'TypeScript',
  'agent',
  'approved',
  '["Deploy and manage websites on Hostinger","Manage VPS instances","Manage domains and DNS records","Run email marketing campaigns","Handle subscriptions and billing","Manage ecommerce stores"]',
  '["Infrastructure"]',
  '["Hostinger API token (generate at hPanel → Account → API)"]',
  '["https://mcp.hostinger.com","https://hpanel.hostinger.com/profile/api"]',
  'https://icons.duckduckgo.com/ip3/hostinger.com.ico'
);
