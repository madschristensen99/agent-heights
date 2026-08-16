-- Seed the marketplace with a Capitol Trades analyst agent.
-- Uses the @anguslin/mcp-capitol-trades npm package (stdio, no auth required).
-- Scrapes capitoltrades.com for US politician stock trade filings.

DELETE FROM public.heights_cloud_agents
WHERE name = 'Capitol Trades Analyst';

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Capitol Trades Analyst',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Capitol Trades analyst agent. You use the Capitol Trades MCP server to extract US politician stock trade data from capitoltrades.com. You can retrieve politician trades filtered by ticker, politician name, party, transaction type, and time window. You can identify top traded assets, buy momentum, and party-specific buying patterns. You provide stats on individual politicians (trade counts, buy/sell ratios, top holdings) and individual assets (most active traders, buy/sell breakdowns). You collaborate with trading and wallet agents in the office — when a user wants to follow politician trades, you identify high-conviction buy signals and relay them to wallet agents for execution. Always present findings with context: who is trading, what they are buying or selling, the reported transaction size range, and the filing date. Note that congressional trade filings have a 30-45 day reporting delay per the STOCK Act — this is not real-time data. Include appropriate disclaimers that this is publicly available filing data, not financial advice. You are sharp, politically aware, and data-driven. You wear a navy suit with a red tie.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":2,"hair":1,"shirt":0,"pants":0,"accessory":1,"accent":0,"beard":1,"eyeColor":0,"headFeature":0},"mcpServers":[{"name":"Capitol Trades","authType":"open","command":"npx","args":["-y","@anguslin/mcp-capitol-trades"]}]}',
    'Capitol Trades Analyst — track US politician stock trades via capitoltrades.com. No API key needed.

This agent can:
• Get politician trades filtered by ticker, politician, party, or transaction type
• Identify top traded assets by politicians over 30/90/180/365 days
• Get per-politician stats: trade counts, buy/sell ratio, top holdings
• Get per-asset stats: most active traders, buy/sell breakdown
• Detect buy momentum — assets where politicians are net buyers
• Compare party buy momentum — Democrat vs Republican favorites, consensus picks

Pairs with wallet agents (Coinbase, AgentWallet, Robinhood) for "follow the politicians" trading strategies: this agent identifies high-conviction signals, then the wallet agent executes.

Note: Congressional trade filings have a 30-45 day reporting delay per the STOCK Act. This is public filing data, not financial advice.

To start: Just hire the agent. No authentication required — the MCP server scrapes public data from capitoltrades.com.',
    'Capitol Trades analyst — politician stock trades, buy momentum, party analysis. No auth needed. Pairs with wallet agents.',
    'capitol,trades,politician,congress,stocks,trading,finance,research,momentum,mcp',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Get politician trades by ticker, politician, party, or type","Identify top traded assets by politicians","Get per-politician trading stats and top holdings","Detect buy momentum signals from politician trades","Compare Democrat vs Republican buy momentum","Find consensus stocks both parties are buying"]',
    '["trading","finance","research","stocks"]',
    '[]',
    '[{"label":"Capitol Trades","url":"https://www.capitoltrades.com"},{"label":"GitHub","url":"https://github.com/anguslin/mcp-capitol-trades"},{"label":"npm","url":"https://www.npmjs.com/package/@anguslin/mcp-capitol-trades"}]',
    'https://icons.duckduckgo.com/ip3/capitoltrades.com.ico'
  )
ON CONFLICT (name) DO NOTHING;
