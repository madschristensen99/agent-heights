-- Seed the marketplace with a Yahoo Finance Agent that uses the Yahoo Finance MCP.
-- This agent is a read-only data source: it fetches quotes, price history, financials,
-- and market news from Yahoo Finance, then produces structured analysis for handoff
-- to the Robinhood Trading Agent (or any execution agent).
--
-- The Yahoo Finance MCP is a remote, no-auth endpoint:
--   https://gateway.mcpservers.org/yahoo-finance/mcp

INSERT INTO public.swarms_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Yahoo Finance Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Yahoo Finance data agent. You are connected to the Yahoo Finance MCP at https://gateway.mcpservers.org/yahoo-finance/mcp which gives you access to stock quotes, historical price data, company financials, key statistics, and market news — all from Yahoo Finance. Your job is to gather this data and produce structured analysis for a trading execution agent (like the Robinhood Trading Agent). You do NOT place trades yourself. When given a ticker or research task: 1) Fetch current quote and key statistics (price, market cap, P/E, 52-week range, volume) 2) Pull historical price data and summarize recent trends 3) Get company financials if relevant 4) Read recent market news headlines 5) Produce a structured analysis with: current price, key financials, price action summary, relevant news, and a clear recommendation (bullish/bearish/neutral) with confidence level. Format your output so it can be passed directly to a trading agent via handoff.","provider":"cline","source":"agent-hq","appearance":{"skin":0,"hairStyle":2,"hair":6,"shirt":6,"pants":2,"accessory":2,"accent":6,"beard":0,"eyeColor":1,"headFeature":0},"mcpServers":[{"url":"https://gateway.mcpservers.org/yahoo-finance/mcp","name":"yahoo-finance"}]}',
    'Yahoo Finance Agent — a financial data agent that pulls market data from Yahoo Finance via the Yahoo Finance MCP (https://gateway.mcpservers.org/yahoo-finance/mcp).

DATA SOURCE: Yahoo Finance (via MCP — no API key needed, no authentication required)

This agent can:
• Fetch real-time stock quotes and price data
• Pull historical price history (OHLCV) for any ticker
• Get company financials, key statistics, and fundamentals (P/E, market cap, 52-week range, EPS, etc.)
• Read market news and headlines for any symbol
• Summarize price action, trends, and key levels
• Produce structured trade recommendations with supporting data

DESIGNED TO PAIR WITH THE ROBINHOOD TRADING AGENT:
1. Hire this agent + the Robinhood Trading Agent
2. Assign this agent a research task (e.g. "Analyze AAPL — get quotes, financials, and news")
3. Set handoff to the Robinhood agent
4. This agent gathers Yahoo Finance data and produces analysis
5. Robinhood agent receives the analysis and can place trades

No authentication required — the Yahoo Finance MCP is open and works immediately.',
    'Yahoo Finance data agent — pulls stock quotes, price history, financials, and market news via Yahoo Finance MCP. No API key needed. Pairs with Robinhood agent for analysis-to-execution pipeline.',
    'yahoo,finance,trading,data,stocks,market,analysis,research,quotes,financials',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Fetch stock quotes and key statistics from Yahoo Finance","Pull historical price data and summarize trends","Get company financials and fundamentals","Read market news and headlines for any ticker","Produce structured trade analysis for handoff to Robinhood Trading Agent"]',
    '["trading","finance","data"]',
    '["None — Yahoo Finance MCP requires no authentication. Just hire and assign a task."]',
    '[{"label":"Yahoo Finance MCP Endpoint","url":"https://gateway.mcpservers.org/yahoo-finance/mcp"},{"label":"Yahoo Finance","url":"https://finance.yahoo.com"},{"label":"Robinhood Trading Agent (pair with this)","url":"https://agent.robinhood.com/mcp/trading"}]',
    'https://www.google.com/s2/favicons?domain=finance.yahoo.com&sz=128'
  );
