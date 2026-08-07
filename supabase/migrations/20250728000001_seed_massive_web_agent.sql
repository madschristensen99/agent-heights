-- Seed the marketplace with a Massive Web Scraping Agent.
-- Uses the Massive Web Render API MCP for captcha-solving, JS rendering,
-- and 195+ country geo-targeting. Requires a Massive API token (user-provided).

-- Delete any existing agent with this name first (idempotent re-seed)
DELETE FROM public.heights_cloud_agents
WHERE name = 'Massive Web Scraper';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Massive Web Scraper',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a web scraping and research agent powered by the Massive Web Render API. You can fetch any URL with JavaScript rendering, automatic captcha solving, and geo-targeting across 195+ countries. You can also perform Google searches with structured results including organic results, AI overviews, and People Also Ask data. You are the go-to agent when other agents hit paywalls, CAPTCHAs, Cloudflare blocks, or need content from specific geographic regions. Always return content in clean markdown format. When fetching difficult sites, try difficulty=medium first, then escalate to high if needed. Check account_status before heavy scraping sessions to monitor remaining credits. You have a sleek dark appearance with a web-themed accent.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":5,"hair":1,"shirt":9,"pants":3,"accessory":3,"accent":6,"beard":0,"eyeColor":3,"headFeature":2},"mcpServers":[{"name":"Massive","authType":"apikey","command":"npx","args":["-y","@joinmassive/mcp-server"],"envVars":[{"name":"MASSIVE_TOKEN","description":"Massive API token from joinmassive.com","isRequired":true}],"keyLabel":"API Token","keyPlaceholder":"mst_...","keyHelpUrl":"https://joinmassive.com"}]}',
    'Massive Web Scraper — premium web scraping with captcha solving, JS rendering, and geo-targeting via the Massive Web Render API.

This agent can:
• Fetch any URL with full JavaScript rendering (returns clean markdown)
• Automatically solve CAPTCHAs and bypass Cloudflare/anti-bot protection
• Geo-target requests from 195+ countries (see content as users in specific regions)
• Perform Google searches with structured results (organic, AI overview, People Also Ask)
• Control scraping difficulty (low/medium/high) to optimize credit usage
• Check remaining credits with account_status (free, no credits consumed)

Perfect for:
• Scraping sites behind Cloudflare, reCAPTCHA, or other anti-bot systems
• Fetching region-locked content (news, pricing, search results by country)
• Research tasks that require reliable web access when Playwright gets blocked
• Google search with structured parsing (titles, snippets, AI overviews)

⚠️ Each web_fetch and web_search call consumes Massive credits. The agent will check account_status before heavy sessions. Get your API token at joinmassive.com.',
    'Premium web scraper — captcha solving, JS rendering, geo-targeting, Google search via Massive API. For sites that block standard browsers.',
    'massive,web,scraping,captcha,cloudflare,geo-targeting,search,fetch,render,anti-bot',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Fetch any URL with JS rendering and captcha solving","Google search with structured results","Geo-target from 195+ countries","Bypass Cloudflare and anti-bot protection","Control scraping difficulty to optimize credits","Check remaining credits (free)"]',
    '["data","research"]',
    '["Massive API token (get yours at joinmassive.com)"]',
    '[{"label":"Massive Web Render API","url":"https://docs.joinmassive.com/web-render"},{"label":"Get API Token","url":"https://joinmassive.com"},{"label":"Pricing","url":"https://joinmassive.com/pricing"}]',
    'https://www.google.com/s2/favicons?domain=joinmassive.com&sz=128'
  )
ON CONFLICT (name) DO NOTHING;
