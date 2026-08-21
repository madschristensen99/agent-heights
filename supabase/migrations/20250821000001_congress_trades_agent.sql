-- Replace the Capitol Trades Analyst with a Congress Trades Analyst.
-- The old agent used @anguslin/mcp-capitol-trades (scrapes capitoltrades.com) which no longer works.
-- The new agent uses our own MCP server (server/providers/congress-trades-mcp.ts) that proxies
-- to a self-hosted capitol-api instance (github.com/crnicholson/capitol-api).
-- capitol-api fetches US House PTR filings directly from disclosures-clerk.house.gov — free, no auth.

DELETE FROM public.heights_cloud_agents
WHERE name = 'Capitol Trades Analyst';

DELETE FROM public.heights_cloud_agents
WHERE name = 'Congress Trades Analyst';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Congress Trades Analyst',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Congress Trades analyst agent. You use the Congress Trades MCP server to retrieve US House politician stock trade data from official PTR filings (disclosures-clerk.house.gov). You can retrieve trades filtered by ticker, politician name, party, transaction type, and time window. You can identify recent filings, buy momentum signals, and party-specific trading patterns. You provide detailed trade data including politician name, party, state, ticker, transaction type (buy/sell), amount range, trade date, filing date, and PDF link to the original filing. You collaborate with trading and wallet agents in the office — when a user wants to follow politician trades, you identify high-conviction buy signals and relay them to wallet agents for execution. Always present findings with context: who is trading, what they are buying or selling, the reported transaction size range, and the filing date. Note that congressional trade filings have a 30-45 day reporting delay per the STOCK Act — this is not real-time data. Include appropriate disclaimers that this is publicly available filing data, not financial advice. You are sharp, politically aware, and data-driven. You wear a navy suit with a red tie.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":2,"hair":1,"shirt":0,"pants":0,"accessory":1,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"name":"Congress Trades","authType":"open","command":"npx","args":["tsx","server/providers/congress-trades-mcp.ts"],"env":{"CAPITOL_API_URL":"https://capitol-api-production.up.railway.app"}}]}',
    'Congress Trades Analyst — track US politician stock trades via official House PTR filings. No API key needed.

This agent can:
• Get the most recently filed congressional trades
• Get trades filtered by stock ticker, politician name, or party
• Filter by transaction type (buy/sell) and date range
• Identify buy momentum — stocks where politicians are net buyers
• Compare Democrat vs Republican trading activity

Pairs with wallet agents (Coinbase, AgentWallet, Robinhood) for "follow the politicians" trading strategies: this agent identifies high-conviction signals, then the wallet agent executes.

Note: Congressional trade filings have a 30-45 day reporting delay per the STOCK Act. This is public filing data, not financial advice.

Data source: US House of Representatives Periodic Transaction Reports (disclosures-clerk.house.gov), parsed by self-hosted capitol-api.

To start: Just hire the agent. No authentication required — the MCP server fetches public government data.',
    'Congress Trades analyst — politician stock trades, buy momentum, party analysis. No auth needed. Pairs with wallet agents.',
    'congress,trades,politician,house,stocks,trading,finance,research,momentum,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Get the most recently filed congressional trades","Get trades by stock ticker with date filtering","Get trades by politician name (partial match)","Get trades filtered by political party","Identify buy momentum signals from politician trades","Compare Democrat vs Republican trading activity"]',
    '["trading","finance","research","stocks"]',
    '[]',
    '[{"label":"House Clerk Disclosures","url":"https://disclosures-clerk.house.gov/FinancialDisclosure"},{"label":"capitol-api (source)","url":"https://github.com/crnicholson/capitol-api"}]',
    'https://icons.duckduckgo.com/ip3/disclosures-clerk.house.gov.ico'
  )
ON CONFLICT (name) DO NOTHING;
