-- Replace the Capitol Trades Analyst with a Congress Trades Analyst.
-- The old agent used @anguslin/mcp-capitol-trades (scrapes capitoltrades.com) which no longer works.
-- The new agent uses our own MCP server (server/providers/congress-trades-mcp.ts) with a hybrid approach:
--   1. CongressInvests.com free API for historical trades (House + Senate, ~5,000+ records)
--   2. Direct House Clerk ZIP index + PDF parsing for current filings (disclosures-clerk.house.gov)
-- Free, no API key, no external service required.

DELETE FROM public.heights_cloud_agents
WHERE name = 'Capitol Trades Analyst';

DELETE FROM public.heights_cloud_agents
WHERE name = 'Congress Trades Analyst';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Congress Trades Analyst',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Congress Trades analyst agent. You use the Congress Trades MCP server to retrieve US politician stock trade data from official PTR filings. Data comes from two sources: (1) CongressInvests.com for historical trades (House + Senate, ~5,000+ records, may be up to 2 months stale), and (2) direct House Clerk PDF parsing for the most recent filings (disclosures-clerk.house.gov, updated daily). You can retrieve recent filings, recent trades, trades by politician name, trades by ticker, and identify buy momentum signals. You provide detailed trade data including politician name, chamber, ticker, transaction type (buy/sell), amount range, trade date, disclosure date, and link to original filing. You collaborate with trading and wallet agents in the office — when a user wants to follow politician trades, you identify high-conviction buy signals and relay them to wallet agents for execution. Always present findings with context: who is trading, what they are buying or selling, the reported transaction size range, and the filing date. Note that congressional trade filings have a 30-45 day reporting delay per the STOCK Act — this is not real-time data. Include appropriate disclaimers that this is publicly available filing data, not financial advice. You are sharp, politically aware, and data-driven. You wear a navy suit with a red tie.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":2,"hair":1,"shirt":0,"pants":0,"accessory":1,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"name":"Congress Trades","authType":"open","command":"npx","args":["tsx","server/providers/congress-trades-mcp.ts"]}]',
    'Congress Trades Analyst — track US politician stock trades via official PTR filings. Hybrid data: CongressInvests historical + House Clerk direct PDF parsing. No API key needed.

This agent can:
• Get the most recently filed House PTR filings (fast index lookup)
• Get recent trades with full details (parses PDFs from House Clerk)
• Get trades by politician name (partial match)
• Get trades by stock ticker
• Identify buy momentum — stocks where politicians are net buyers

Data sources:
• CongressInvests.com — ~5,000+ historical trades (House + Senate), may lag up to 2 months
• disclosures-clerk.house.gov — direct ZIP index + PDF parsing for current filings (updated daily)

Pairs with wallet agents (Coinbase, AgentWallet, Robinhood) for "follow the politicians" trading strategies.

Note: Congressional trade filings have a 30-45 day reporting delay per the STOCK Act. This is public filing data, not financial advice.

To start: Just hire the agent. No authentication required.',
    'Congress Trades analyst — politician stock trades (House + Senate), buy momentum. No auth needed. Pairs with wallet agents.',
    'congress,trades,politician,house,senate,stocks,trading,finance,research,momentum,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Get the most recently filed House PTR filings","Get recent trades with full details from parsed PDFs","Get trades by politician name (partial match)","Get trades by stock ticker","Identify buy momentum signals from politician trades"]',
    '["trading","finance","research","stocks"]',
    '[]',
    '[{"label":"CongressInvests API","url":"https://congressinvests.com"},{"label":"House Clerk Disclosures","url":"https://disclosures-clerk.house.gov/FinancialDisclosure"},{"label":"Senate EFD","url":"https://efdsearch.senate.gov"}]',
    'https://icons.duckduckgo.com/ip3/disclosures-clerk.house.gov.ico'
  )
ON CONFLICT (name) DO NOTHING;
