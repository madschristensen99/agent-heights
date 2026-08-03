-- Seed the marketplace with a Google Maps Scraper Agent.
-- Uses the gmapsextractor.com MCP for Google Maps business search, reviews, and photos.
-- Requires a Google Maps Scraper API key (user-provided, Bearer token auth).

-- Delete any existing agent with this name first (idempotent re-seed)
DELETE FROM public.heights_cloud_agents
WHERE name = 'Google Maps Scraper';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Google Maps Scraper',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a local business research agent powered by the Google Maps Scraper MCP. You can search Google Maps for businesses (name, address, phone, website, rating, review count), retrieve public reviews with filtering, and fetch public business photos. You are the go-to agent for prospecting research, local market analysis, and listing enrichment. Always structure results in clear tables or lists. When searching, include relevant filters like rating thresholds, review counts, or categories to narrow results. Be helpful, precise, and thorough in your responses.","provider":"cline","source":"agent-heights","appearance":{"skin":2,"hairStyle":4,"hair":3,"shirt":5,"pants":1,"accessory":2,"accent":3,"beard":1,"eyeColor":2,"headFeature":0},"mcpServers":[{"url":"https://cloud.gmapsextractor.com/api/mcp","name":"Google Maps Scraper","authType":"apikey","keyLabel":"API Key","keyPlaceholder":"Paste your gmapsextractor.com API key...","keyHelpUrl":"https://gmapsextractor.com/google-maps-scraper-mcp"}]}',
    'Google Maps Scraper — live Google Maps business data via the gmapsextractor.com MCP.

This agent can:
• Search Google Maps for businesses (name, address, phone, website, rating, review count)
• Retrieve public Google Maps reviews with filtering options
• Fetch public business photos from Google Maps listings
• Structure results for prospecting, market analysis, and listing enrichment

Perfect for:
• Prospecting research — find businesses by category, location, or rating
• Local market analysis — compare competitors in a given area
• Listing enrichment — gather contact info, reviews, and photos for business directories

⚠️ Free monthly requests available; paid plans for higher volume. Get your API key at gmapsextractor.com.',
    'Google Maps business search, reviews, and photos via gmapsextractor.com MCP. For prospecting, market analysis, and listing enrichment.',
    'google,maps,scraper,local,business,reviews,photos,prospecting,market-analysis,data',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Search Google Maps for businesses with ratings and contact info","Retrieve public business reviews with filtering","Fetch public business photos","Structure results for prospecting and market analysis"]',
    '["data","research"]',
    '["Google Maps Scraper API key (get yours at gmapsextractor.com)"]',
    '[{"label":"Google Maps Scraper MCP","url":"https://gmapsextractor.com/google-maps-scraper-mcp"},{"label":"Get API Key","url":"https://gmapsextractor.com/google-maps-scraper-mcp"}]',
    'https://www.google.com/s2/favicons?domain=gmapsextractor.com&sz=128'
  );
