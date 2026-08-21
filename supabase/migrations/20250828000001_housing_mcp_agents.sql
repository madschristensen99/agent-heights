-- Seed marketplace agents and MCP catalog entries for housing/accommodation MCPs.
-- These support Maslow's "physiological" hierarchy needs (housing/shelter).
-- Auth types: Zillapi (API key), StayingAPI (OAuth DCR), Nomad Stays (open).

-- ── Delete existing entries (idempotent re-seed) ──────────────────────
DELETE FROM public.heights_cloud_agents
WHERE name IN (
  'Zillapi Property Analyst',
  'StayingAPI Accommodation Scout',
  'Nomad Stays Explorer'
);

-- Also clean up any old MCP catalog entries with these names
DELETE FROM public.heights_cloud_agents
WHERE name IN (
  'MCP: Zillapi',
  'MCP: StayingAPI',
  'MCP: Nomad Stays'
)
AND search_type = 'mcp_server';

-- ── Marketplace agents (search_type = 'agent') ────────────────────────
INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Zillapi Property Analyst',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Zillapi property analyst agent connected to Zillow-sourced property data via the Zillapi MCP at https://api.zillapi.com/mcp. You can look up any US property by address, fetch Zestimates, search listings, and pull 300+ fields per home including price, tax history, school ratings, photos, and price history. You help users research home values, run comparables, find investment properties, and understand local market trends. You collaborate with other agents in the office — when a user is house-hunting or evaluating real estate, you provide the data and analysis. Always present findings with context: property address, estimated value, price history, nearby schools, and market trends. Include appropriate disclaimers that this is Zillow-sourced data, not an official appraisal. You are analytical, detail-oriented, and love a good spreadsheet. You wear a blazer with glasses.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":4,"hair":3,"shirt":6,"pants":1,"accessory":2,"accent":1,"beard":0,"eyeColor":0,"headFeature":1},"mcpServers":[{"url":"https://api.zillapi.com/mcp","name":"Zillapi","authType":"apikey","keyLabel":"Zillapi API Key","keyPlaceholder":"zk_...","keyHelpUrl":"https://zillapi.com/signup"}]}',
    'Zillapi Property Analyst — Zillow-sourced property data for 160M+ US homes. API key required.

This agent can:
• Look up any US property by address or Zillow zpid
• Fetch Zestimates (home valuations) and rent estimates
• Search listings by location, price, beds/baths, home type
• Pull 300+ fields: price history, tax records, school ratings, photos
• Run comparables and market analysis

Pairs with finance agents for mortgage planning and investment analysis.

To connect: Get a free API key at https://zillapi.com/signup (100 credits free, no card required). Paste your zk_ key when hiring.',
    'Zillapi analyst — US property data, Zestimates, listings search. API key (zk_...). 100 free credits.',
    'zillapi,zillow,property,real estate,housing,zestimate,listings,mcp,lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Look up US properties by address or Zillow zpid","Fetch Zestimates and rent estimates","Search listings by location, price, and home type","Pull property details: price history, taxes, schools, photos","Run comparables and market analysis"]',
    '["Lifestyle"]',
    '["Zillapi API Key (https://zillapi.com/signup)"]',
    '[{"label":"Zillapi MCP Server","url":"https://api.zillapi.com/mcp"},{"label":"Get your API Key","url":"https://zillapi.com/signup"},{"label":"Zillapi for AI Agents","url":"https://zillapi.com/ai-agents/"}]',
    'https://icons.duckduckgo.com/ip3/zillapi.com.ico'
  ),
  (
    'StayingAPI Accommodation Scout',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a StayingAPI accommodation scout agent connected to cross-platform lodging data via the StayingAPI MCP at https://mcp.stayingapi.com/mcp. You search across Booking.com, Airbnb, Vrbo, and Google Hotels in one unified schema. You can find stays by location and dates, check availability, compare prices across platforms, read reviews, and get full listing details. You help users find the best accommodation deals, compare options across platforms, and plan trips. You collaborate with other agents — when a user needs housing, you provide the search and comparison. Always present findings with context: property name, platform, price per night, total, rating, amenities, and cross-platform price differences. Note that all tools are read-only — you cannot book, only search and compare. You are adventurous, well-traveled, and always find the best deal. You wear a casual travel jacket.","provider":"cline","source":"agent-heights","appearance":{"skin":2,"hairStyle":5,"hair":2,"shirt":4,"pants":2,"accessory":0,"accent":2,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://mcp.stayingapi.com/mcp","name":"StayingAPI","authType":"oauth"}]}',
    'StayingAPI Accommodation Scout — search stays across Booking.com, Airbnb, Vrbo & Google Hotels. OAuth.

This agent can:
• Search stays by location, dates, occupancy, and filters
• Check live availability across 4 platforms in one call
• Compare prices for the same property across booking sites
• Get full listing details, amenities, and photos
• Read reviews from multiple platforms

Coverage: Hotels and short-term rentals worldwide via Booking.com, Airbnb, Vrbo, and Google Hotels — one unified schema.

To connect: Click "Connect via OAuth" when hiring this agent. 300 free credits, no card required.',
    'StayingAPI scout — compare stays across Booking, Airbnb, Vrbo & Google Hotels. OAuth. 300 free credits.',
    'stayingapi,accommodation,hotels,airbnb,booking,vrbo,travel,housing,mcp,lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Search stays across Booking.com, Airbnb, Vrbo & Google Hotels","Check live availability and compare prices cross-platform","Get full listing details, amenities, and photos","Read reviews from multiple platforms","Find the cheapest platform for any property"]',
    '["Lifestyle"]',
    '["StayingAPI account (OAuth connection required)"]',
    '[{"label":"StayingAPI MCP Server","url":"https://mcp.stayingapi.com/mcp"},{"label":"Sign up (300 free credits)","url":"https://stayingapi.com/signup"},{"label":"Documentation","url":"https://stayingapi.com/docs/mcp"}]',
    'https://icons.duckduckgo.com/ip3/stayingapi.com.ico'
  ),
  (
    'Nomad Stays Explorer',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Nomad Stays explorer agent connected to the Nomad Stays MCP at https://mcp.nomadstays.com. You search a curated database of remote-work-friendly and digital-nomad accommodations worldwide. You can find stays by country, continent, city, lifestyle category, budget, amenities, and WiFi speed. You check room availability for specific dates, find nearest available dates, and get live price quotes. You help digital nomads and remote workers find their next home abroad. You collaborate with other agents — when a user is planning a nomad lifestyle or needs long-term housing, you provide the search. Always present findings with context: stay name, location, lifestyle category, price, WiFi speed, amenities, and availability. You can also search the help center for nomad-related questions. You are a seasoned digital nomad who knows the best spots. You wear a linen shirt and carry a passport.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":7,"hair":6,"shirt":8,"pants":3,"accessory":3,"accent":0,"beard":2,"eyeColor":2,"headFeature":0},"mcpServers":[{"url":"https://mcp.nomadstays.com","name":"Nomad Stays","authType":"open"}]}',
    'Nomad Stays Explorer — digital nomad accommodations worldwide. No auth needed.

This agent can:
• Search stays by country, continent, city, or location
• Filter by lifestyle category (Digital Nomad, Beach, City, etc.)
• Find stays within a budget with FX conversion
• Filter by amenities and minimum WiFi speed
• Check room availability for specific dates
• Find nearest available dates when preferred dates are taken
• Get live price quotes for stay packages
• Search the Nomad Stays help center

Coverage: Remote-work-friendly accommodations worldwide. No authentication required — just hire and start searching.

To start: Just hire the agent. No authentication required — the MCP server provides public read-only data.',
    'Nomad Stays explorer — digital nomad housing worldwide. No auth needed. Search by lifestyle, budget, WiFi, amenities.',
    'nomad,stays,digital nomad,accommodation,housing,travel,wifi,remote work,mcp,lifestyle',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Search nomad stays by country, continent, or city","Filter by lifestyle, budget, amenities, and WiFi speed","Check room availability for specific dates","Find nearest available dates","Get live price quotes for stay packages","Search the Nomad Stays help center"]',
    '["Lifestyle"]',
    '[]',
    '[{"label":"Nomad Stays MCP Server","url":"https://mcp.nomadstays.com"},{"label":"Nomad Stays Website","url":"https://www.nomadstays.com"},{"label":"MCP Documentation","url":"https://mcp.nomadstays.com"}]',
    'https://icons.duckduckgo.com/ip3/nomadstays.com.ico'
  )
ON CONFLICT (name) DO NOTHING;

-- ── MCP server catalog entries (search_type = 'mcp_server') ───────────
INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url, risk_level, security_note, data_access)
VALUES
  (
    'MCP: Zillapi',
    '{"id":"zillapi","transport":"remote","authType":"apikey","isOfficial":false,"category":["Lifestyle"],"icon":"https://icons.duckduckgo.com/ip3/zillapi.com.ico","url":"https://api.zillapi.com/mcp","keyLabel":"Zillapi API Key","keyPlaceholder":"zk_...","keyHelpUrl":"https://zillapi.com/signup"}',
    'Zillapi is a Zillow-sourced property data API built for AI agents. Look up any US home by address, fetch Zestimates, search listings, and pull 300+ fields per home across 160M+ US parcels. Free tier: 100 credits, no card.',
    'Zillow property data — lookups, Zestimates, listings for 160M+ US homes. API key.',
    'zillapi,zillow,property,housing,real estate',
    true,
    null,
    null,
    'TypeScript',
    'mcp_server',
    'approved',
    '["Lifestyle"]',
    '["Lifestyle"]',
    '["Zillapi API Key"]',
    '[{"label":"Get API Key","url":"https://zillapi.com/signup"},{"label":"Docs","url":"https://zillapi.com/ai-agents/"}]',
    'https://icons.duckduckgo.com/ip3/zillapi.com.ico',
    'medium',
    'API key grants access to Zillow-sourced property data. Treat zk_ keys like passwords — never commit them to a repo. Free tier includes 100 credits.',
    'Look up US property data including prices, Zestimates, photos, tax history, school ratings, and listing details.'
  ),
  (
    'MCP: StayingAPI',
    '{"id":"stayingapi","transport":"remote","authType":"oauth","isOfficial":false,"category":["Lifestyle"],"icon":"https://icons.duckduckgo.com/ip3/stayingapi.com.ico","url":"https://mcp.stayingapi.com/mcp"}',
    'StayingAPI provides cross-platform accommodation search across Booking.com, Airbnb, Vrbo, and Google Hotels in one unified schema. Seven read-only tools for search, availability, listing details, price comparison, and reviews. OAuth 2.1 with DCR. 300 free credits, no card.',
    'Cross-platform stay search — Booking, Airbnb, Vrbo & Google Hotels. OAuth.',
    'stayingapi,accommodation,hotels,airbnb,booking,vrbo,housing,travel',
    true,
    null,
    null,
    'TypeScript',
    'mcp_server',
    'approved',
    '["Lifestyle"]',
    '["Lifestyle"]',
    '["StayingAPI account (OAuth)"]',
    '[{"label":"Sign up","url":"https://stayingapi.com/signup"},{"label":"Docs","url":"https://stayingapi.com/docs/mcp"}]',
    'https://icons.duckduckgo.com/ip3/stayingapi.com.ico',
    'low',
    'All tools are read-only (annotated readOnlyHint). No booking, cancellation, or write capabilities. OAuth 2.1 with PKCE — no static keys. 300 free credits.',
    'Search accommodations, check availability, compare prices, and read reviews across Booking.com, Airbnb, Vrbo, and Google Hotels.'
  ),
  (
    'MCP: Nomad Stays',
    '{"id":"nomad-stays","transport":"remote","authType":"open","isOfficial":false,"category":["Lifestyle"],"icon":"https://icons.duckduckgo.com/ip3/nomadstays.com.ico","url":"https://mcp.nomadstays.com"}',
    'Nomad Stays provides access to a curated database of remote-work-friendly and digital-nomad accommodations worldwide. 76 tools for searching by country, continent, location, lifestyle, budget, amenities, WiFi speed, and availability. No authentication required for read-only tools.',
    'Digital nomad accommodations worldwide. No auth needed. 76 search tools.',
    'nomad,stays,digital nomad,housing,accommodation,travel,wifi',
    true,
    null,
    null,
    'TypeScript',
    'mcp_server',
    'approved',
    '["Lifestyle"]',
    '["Lifestyle"]',
    '[]',
    '[{"label":"Website","url":"https://www.nomadstays.com"},{"label":"MCP Docs","url":"https://mcp.nomadstays.com"}]',
    'https://icons.duckduckgo.com/ip3/nomadstays.com.ico',
    'low',
    'Read-only public data. No authentication required. No write or booking capabilities.',
    'Search digital nomad accommodations by location, lifestyle, budget, amenities, WiFi speed, and availability.'
  )
ON CONFLICT (name) DO NOTHING;
