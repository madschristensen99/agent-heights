-- Seed the marketplace with a Market Data Analyst agent that uses the Yahoo Finance MCP.
-- This agent is a read-only data source: it fetches quotes, price history, financials,
-- and market news, then produces structured analysis for handoff to the Robinhood
-- Trading Agent (or any execution agent).
--
-- The Yahoo Finance MCP is a remote, no-auth endpoint:
--   https://gateway.mcpservers.org/yahoo-finance/mcp

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Market Data Analyst',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a market data analyst connected to Yahoo Finance via MCP. Your job is to gather financial data — stock quotes, historical prices, company financials, key statistics, and market news — and produce structured analysis for a trading agent. You do NOT place trades. When given a ticker or research task, pull all relevant data, compute or summarize key indicators (price trends, P/E, market cap, 52-week range, volume, moving averages if available), and output a concise but complete analysis with a clear recommendation (bullish/bearish/neutral) and supporting evidence. Format your output so it can be passed directly to a trading execution agent. Always include: current price, key financials, recent price action summary, relevant news headlines, and your analysis with confidence level.","provider":"cline","source":"agent-hq","appearance":{"skin":0,"hairStyle":2,"hair":6,"shirt":6,"pants":2,"accessory":2,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://gateway.mcpservers.org/yahoo-finance/mcp","name":"yahoo-finance"}]}',
    'Market Data Analyst — a financial data agent connected to Yahoo Finance via MCP.

This agent can:
• Fetch real-time and historical stock quotes
• Pull company financials, key statistics, and fundamentals
• Read market news and headlines for any ticker
• Summarize price action, trends, and key levels
• Produce structured trade recommendations with supporting data

Designed to work in a pipeline with the Robinhood Trading Agent:
1. Assign this agent a research task (e.g. "Analyze AAPL")
2. Use handoff to pass the analysis to the Robinhood agent
3. Robinhood agent reviews and executes trades

No authentication required — the Yahoo Finance MCP is open and ready to use.',
    'Financial data analyst — fetches quotes, financials, and market news via Yahoo Finance MCP. Pairs with Robinhood agent for analysis-to-execution pipeline.',
    'finance,trading,data,yahoo,analysis,stocks,market,research',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Research stocks and produce trade recommendations","Fetch price history and summarize trends","Pull company financials and key statistics","Analyze market news for sentiment and catalysts","Feed structured analysis to trading execution agents"]',
    '["trading","finance","data"]',
    '["None — Yahoo Finance MCP requires no authentication"]',
    '[{"label":"Yahoo Finance MCP","url":"https://gateway.mcpservers.org/yahoo-finance/mcp"},{"label":"Yahoo Finance","url":"https://finance.yahoo.com"}]',
    'https://www.google.com/s2/favicons?domain=finance.yahoo.com&sz=128'
  )
ON CONFLICT (name) DO NOTHING;
