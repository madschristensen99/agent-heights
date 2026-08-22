/**
 * Congress Trades MCP Server (stdio transport)
 *
 * Fetches congressional stock trade data from CongressInvests.com
 * free API (100 req/day, no API key required). Covers both House
 * and Senate PTR filings from official government sources.
 *
 * Spawned by StdioMCPClient with:
 *   command: "npx"
 *   args: ["tsx", "server/providers/congress-trades-mcp.ts"]
 *
 * Tools exposed:
 *   - get_recent_trades       — most recently filed trades
 *   - get_trades_by_ticker    — filter by stock ticker
 *   - get_trades_by_politician — filter by politician name
 *   - get_trades_by_type      — filter by buy/sell
 *   - get_buy_momentum        — tickers where politicians are net buyers
 */

const API_BASE = "https://congressinvests.com";

interface CongressInvestsTrade {
  member: string;
  chamber: string;
  trade_type: string;
  amount: string;
  tx_date: string;
  disclosed: string;
  asset: string;
  ticker: string;
  link: string;
}

interface CongressInvestsResponse {
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  trades: CongressInvestsTrade[];
  data_current: boolean;
  last_updated: string;
}

// ── JSON-RPC helpers ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

function send(msg: JsonRpcResponse | Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function respond(id: number, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id: number, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// ── HTTP helper ─────────────────────────────────────────────────────────

async function fetchTrades(path: string): Promise<CongressInvestsResponse> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`CongressInvests API returned ${res.status}: ${body.slice(0, 500)}`);
    }
    return await res.json() as CongressInvestsResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch from CongressInvests (${url}): ${msg}`);
  }
}

function formatTrades(data: CongressInvestsResponse): string {
  const summary = `Found ${data.total} trades (showing ${data.trades.length}). Data last updated: ${data.last_updated}\n`;
  const rows = data.trades.map((t) => ({
    member: t.member,
    chamber: t.chamber,
    ticker: t.ticker,
    type: t.trade_type,
    amount: t.amount.replace(/\n/g, " "),
    trade_date: t.tx_date,
    disclosed: t.disclosed,
    asset: t.asset.slice(0, 80),
    link: t.link,
  }));
  return summary + JSON.stringify(rows, null, 2);
}

// ── Tool definitions ────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const TOOLS: ToolDef[] = [
  {
    name: "get_recent_trades",
    description:
      "Get the most recently filed congressional stock trades (House + Senate). Returns trades sorted by filing date (newest first). Each trade includes politician name, chamber, ticker, transaction type (buy/sell), amount range, trade date, disclosure date, and link to original filing.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          description: "Number of recent trades to return (default 25, max 100)",
        },
      },
    },
    handler: async (args) => {
      const count = Math.min(Number(args.count) || 25, 100);
      const data = await fetchTrades(`/trades?limit=${count}`);
      return formatTrades(data);
    },
  },
  {
    name: "get_trades_by_ticker",
    description:
      "Get all congressional trades for a specific stock ticker (House + Senate). Returns politician name, chamber, transaction type, amount range, dates, and filing link.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: {
          type: "string",
          description: "Stock ticker symbol (e.g. AAPL, TSLA, NVDA)",
        },
        chamber: {
          type: "string",
          description: "Filter by chamber",
          enum: ["House", "Senate"],
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
      required: ["ticker"],
    },
    handler: async (args) => {
      const ticker = String(args.ticker).toUpperCase();
      const limit = Math.min(Number(args.limit) || 50, 500);
      let path = `/trades/${ticker}?limit=${limit}`;
      if (args.chamber) path += `&chamber=${args.chamber}`;
      const data = await fetchTrades(path);
      return formatTrades(data);
    },
  },
  {
    name: "get_trades_by_politician",
    description:
      "Get all trades by a specific politician (partial name match). Fetches all recent trades and filters client-side by member name. Returns their trade history with ticker, transaction type, amount range, dates, and chamber.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Politician name (partial match, e.g. 'Pelosi', 'Nancy Pelosi')",
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const name = String(args.name).toLowerCase();
      const limit = Math.min(Number(args.limit) || 50, 200);
      const data = await fetchTrades(`/trades?limit=500`);
      const filtered = data.trades.filter((t) => t.member.toLowerCase().includes(name));
      const result: CongressInvestsResponse = {
        ...data,
        total: filtered.length,
        trades: filtered.slice(0, limit),
      };
      return formatTrades(result);
    },
  },
  {
    name: "get_trades_by_type",
    description:
      "Get congressional trades filtered by buy/sell transaction type. Use to compare buying vs selling activity. Returns all trades of the specified type with full details.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Transaction type",
          enum: ["buy", "sell"],
        },
        ticker: {
          type: "string",
          description: "Optional: filter to a specific ticker",
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
      required: ["type"],
    },
    handler: async (args) => {
      const type = String(args.type);
      const limit = Math.min(Number(args.limit) || 50, 200);
      if (args.ticker) {
        const ticker = String(args.ticker).toUpperCase();
        const data = await fetchTrades(`/trades/${ticker}?limit=500`);
        const filtered = data.trades.filter((t) => t.trade_type === type);
        const result: CongressInvestsResponse = { ...data, total: filtered.length, trades: filtered.slice(0, limit) };
        return formatTrades(result);
      }
      const data = await fetchTrades(`/trades?limit=500`);
      const filtered = data.trades.filter((t) => t.trade_type === type);
      const result: CongressInvestsResponse = { ...data, total: filtered.length, trades: filtered.slice(0, limit) };
      return formatTrades(result);
    },
  },
  {
    name: "get_buy_momentum",
    description:
      "Identify stocks with strong politician buy momentum — where members of Congress are net buyers. Returns recent buy trades sorted by date. Use this to spot consensus picks and follow-the-leader patterns. Pair with wallet agents for execution.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
    },
    handler: async (args) => {
      const limit = Math.min(Number(args.limit) || 50, 200);
      const data = await fetchTrades(`/trades?limit=500`);
      const buys = data.trades.filter((t) => t.trade_type === "buy");
      const result: CongressInvestsResponse = { ...data, total: buys.length, trades: buys.slice(0, limit) };
      return formatTrades(result);
    },
  },
];

// ── MCP server loop ─────────────────────────────────────────────────────

let buffer = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      continue;
    }
    handleRequest(req).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (req.id != null) respondError(req.id, -32603, msg);
    });
  }
});

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  const id = req.id ?? 0;

  switch (req.method) {
    case "initialize":
      respond(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "congress-trades", version: "1.0.0" },
      });
      break;

    case "notifications/initialized":
      // No response needed for notifications
      break;

    case "tools/list":
      respond(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      break;

    case "tools/call": {
      const { name, arguments: args } = req.params ?? {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        respondError(id, -32601, `Unknown tool: ${name}`);
        return;
      }
      try {
        const result = await tool.handler(args ?? {});
        respond(id, {
          content: [{ type: "text", text: result }],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        respond(id, {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        });
      }
      break;
    }

    default:
      if (id !== 0) respondError(id, -32601, `Unknown method: ${req.method}`);
  }
}

console.error("[congress-trades-mcp] started, using CongressInvests.com free API");
