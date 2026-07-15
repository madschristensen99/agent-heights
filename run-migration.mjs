import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(url, key);
const { data, error } = await sb.from('swarms_cloud_agents').upsert({
  name: 'Market Data Analyst',
  agent: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    systemPrompt: "You are a market data analyst connected to Yahoo Finance via MCP. Your job is to gather financial data — stock quotes, historical prices, company financials, key statistics, and market news — and produce structured analysis for a trading agent. You do NOT place trades. When given a ticker or research task, pull all relevant data, compute or summarize key indicators (price trends, P/E, market cap, 52-week range, volume, moving averages if available), and output a concise but complete analysis with a clear recommendation (bullish/bearish/neutral) and supporting evidence. Format your output so it can be passed directly to a trading execution agent. Always include: current price, key financials, recent price action summary, relevant news headlines, and your analysis with confidence level.",
    provider: "cline",
    source: "agent-hq",
    appearance: { skin: 0, hairStyle: 2, hair: 6, shirt: 6, pants: 2, accessory: 2, accent: 6, beard: 0, eyeColor: 1, headFeature: 0 },
    mcpServers: [{ url: "https://gateway.mcpservers.org/yahoo-finance/mcp", name: "yahoo-finance" }]
  }),
  description: 'Market Data Analyst — a financial data agent connected to Yahoo Finance via MCP.\n\nThis agent can:\n• Fetch real-time and historical stock quotes\n• Pull company financials, key statistics, and fundamentals\n• Read market news and headlines for any ticker\n• Summarize price action, trends, and key levels\n• Produce structured trade recommendations with supporting data\n\nDesigned to work in a pipeline with the Robinhood Trading Agent:\n1. Assign this agent a research task (e.g. "Analyze AAPL")\n2. Use handoff to pass the analysis to the Robinhood agent\n3. Robinhood agent reviews and executes trades\n\nNo authentication required — the Yahoo Finance MCP is open and ready to use.',
  summary: 'Financial data analyst — fetches quotes, financials, and market news via Yahoo Finance MCP. Pairs with Robinhood agent for analysis-to-execution pipeline.',
  tags: 'finance,trading,data,yahoo,analysis,stocks,market,research',
  is_free: true,
  price: null,
  price_usd: null,
  language: 'TypeScript',
  search_type: 'agent',
  status: 'approved',
  use_cases: '["Research stocks and produce trade recommendations","Fetch price history and summarize trends","Pull company financials and key statistics","Analyze market news for sentiment and catalysts","Feed structured analysis to trading execution agents"]',
  category: '["trading","finance","data"]',
  requirements: '["None — Yahoo Finance MCP requires no authentication"]',
  links: '[{"label":"Yahoo Finance MCP","url":"https://gateway.mcpservers.org/yahoo-finance/mcp"},{"label":"Yahoo Finance","url":"https://finance.yahoo.com"}]',
  image_url: 'https://www.google.com/s2/favicons?domain=finance.yahoo.com&sz=128'
}, { onConflict: 'name' }).select('id,name');

if (error) { console.error('Error:', error.message); process.exit(1); }
console.log('Inserted:', data);
