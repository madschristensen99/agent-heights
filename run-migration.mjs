import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(url, key);

// Update the existing row (inserted earlier as "Market Data Analyst")
const { data: existing, error: findErr } = await sb.from('swarms_cloud_agents').select('id').eq('name', 'Market Data Analyst').maybeSingle();
const targetId = existing?.id;

const payload = {
  name: 'Yahoo Finance Agent',
  agent: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    systemPrompt: "You are a Yahoo Finance data agent. You are connected to the Yahoo Finance MCP at https://gateway.mcpservers.org/yahoo-finance/mcp which gives you access to stock quotes, historical price data, company financials, key statistics, and market news — all from Yahoo Finance. Your job is to gather this data and produce structured analysis for a trading execution agent (like the Robinhood Trading Agent). You do NOT place trades yourself. When given a ticker or research task: 1) Fetch current quote and key statistics (price, market cap, P/E, 52-week range, volume) 2) Pull historical price data and summarize recent trends 3) Get company financials if relevant 4) Read recent market news headlines 5) Produce a structured analysis with: current price, key financials, price action summary, relevant news, and a clear recommendation (bullish/bearish/neutral) with confidence level. Format your output so it can be passed directly to a trading agent via handoff.",
    provider: "cline",
    source: "agent-hq",
    appearance: { skin: 0, hairStyle: 2, hair: 6, shirt: 6, pants: 2, accessory: 2, accent: 6, beard: 0, eyeColor: 1, headFeature: 0 },
    mcpServers: [{ url: "https://gateway.mcpservers.org/yahoo-finance/mcp", name: "yahoo-finance" }]
  }),
  description: 'Yahoo Finance Agent — a financial data agent that pulls market data from Yahoo Finance via the Yahoo Finance MCP (https://gateway.mcpservers.org/yahoo-finance/mcp).\n\nDATA SOURCE: Yahoo Finance (via MCP — no API key needed, no authentication required)\n\nThis agent can:\n• Fetch real-time stock quotes and price data\n• Pull historical price history (OHLCV) for any ticker\n• Get company financials, key statistics, and fundamentals (P/E, market cap, 52-week range, EPS, etc.)\n• Read market news and headlines for any symbol\n• Summarize price action, trends, and key levels\n• Produce structured trade recommendations with supporting data\n\nDESIGNED TO PAIR WITH THE ROBINHOOD TRADING AGENT:\n1. Hire this agent + the Robinhood Trading Agent\n2. Assign this agent a research task (e.g. "Analyze AAPL — get quotes, financials, and news")\n3. Set handoff to the Robinhood agent\n4. This agent gathers Yahoo Finance data and produces analysis\n5. Robinhood agent receives the analysis and can place trades\n\nNo authentication required — the Yahoo Finance MCP is open and works immediately.',
  summary: 'Yahoo Finance data agent — pulls stock quotes, price history, financials, and market news via Yahoo Finance MCP. Pairs with Robinhood agent for analysis-to-execution pipeline. No API key needed.',
  tags: 'yahoo,finance,trading,data,stocks,market,analysis,research,quotes,financials',
  is_free: true,
  price: null,
  price_usd: null,
  language: 'TypeScript',
  search_type: 'agent',
  status: 'approved',
  use_cases: '["Fetch stock quotes and key statistics from Yahoo Finance","Pull historical price data and summarize trends","Get company financials and fundamentals","Read market news and headlines for any ticker","Produce structured trade analysis for handoff to Robinhood Trading Agent"]',
  category: '["trading","finance","data"]',
  requirements: '["None — Yahoo Finance MCP requires no authentication. Just hire and assign a task."]',
  links: '[{"label":"Yahoo Finance MCP Endpoint","url":"https://gateway.mcpservers.org/yahoo-finance/mcp"},{"label":"Yahoo Finance","url":"https://finance.yahoo.com"},{"label":"Robinhood Trading Agent (pair with this)","url":"https://agent.robinhood.com/mcp/trading"}]',
  image_url: 'https://www.google.com/s2/favicons?domain=finance.yahoo.com&sz=128'
};

let result;
if (targetId) {
  result = await sb.from('swarms_cloud_agents').update(payload).eq('id', targetId).select('id,name');
} else {
  result = await sb.from('swarms_cloud_agents').insert(payload).select('id,name');
}

if (result.error) { console.error('Error:', result.error.message); process.exit(1); }
console.log('Updated:', result.data);
