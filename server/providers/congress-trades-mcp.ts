/**
 * Congress Trades MCP Server (stdio transport)
 *
 * A standalone MCP server that proxies tool calls to a self-hosted
 * capitol-api instance (https://github.com/crnicholson/capitol-api).
 * capitol-api fetches and parses US House PTR filings from
 * disclosures-clerk.house.gov — free, no API key needed.
 *
 * Spawned by StdioMCPClient with:
 *   command: "npx"
 *   args: ["tsx", "server/providers/congress-trades-mcp.ts"]
 *   env: { CAPITOL_API_URL: "https://your-capitol-api.up.railway.app" }
 *
 * Tools exposed:
 *   - get_recent_trades       — most recently filed trades
 *   - get_trades_by_ticker    — filter by stock ticker
 *   - get_trades_by_politician — filter by politician name
 *   - get_trades_by_party     — filter by party
 *   - get_buy_momentum        — tickers where politicians are net buyers
 */

const API_URL = process.env.CAPITOL_API_URL || "http://localhost:3000";

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

async function fetchJson(path: string): Promise<string> {
  const url = `${API_URL}${path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`capitol-api returned ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch from capitol-api (${url}): ${msg}`);
  }
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
      "Get the most recently filed congressional stock trades from US House PTR filings. Returns trades sorted by filing date (newest first). Each trade includes politician name, party, state, ticker, transaction type (buy/sell), amount range, trade date, filing date, and PDF link.",
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
      return fetchJson(`/api/trades?recent=${count}`);
    },
  },
  {
    name: "get_trades_by_ticker",
    description:
      "Get all congressional trades for a specific stock ticker. Filter by transaction category (buy/sell) and date range. Returns politician name, party, transaction details, and filing metadata.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: {
          type: "string",
          description: "Stock ticker symbol (e.g. AAPL, TSLA, NVDA)",
        },
        category: {
          type: "string",
          description: "Filter by transaction category",
          enum: ["buy", "sell", "exchange", "gift"],
        },
        from: {
          type: "string",
          description: "Trade date lower bound (ISO format: YYYY-MM-DD)",
        },
        to: {
          type: "string",
          description: "Trade date upper bound (ISO format: YYYY-MM-DD)",
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
      required: ["ticker"],
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      params.set("ticker", String(args.ticker).toUpperCase());
      if (args.category) params.set("category", String(args.category));
      if (args.from) params.set("from", String(args.from));
      if (args.to) params.set("to", String(args.to));
      params.set("limit", String(args.limit || 50));
      return fetchJson(`/api/trades?${params}`);
    },
  },
  {
    name: "get_trades_by_politician",
    description:
      "Get all trades by a specific politician (partial name match). Returns their full trade history with ticker, transaction type, amount range, dates, and party affiliation.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Politician name (partial match, e.g. 'Pelosi', 'Nancy Pelosi')",
        },
        category: {
          type: "string",
          description: "Filter by transaction category",
          enum: ["buy", "sell", "exchange", "gift"],
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      params.set("person", String(args.name));
      if (args.category) params.set("category", String(args.category));
      params.set("limit", String(args.limit || 50));
      return fetchJson(`/api/trades?${params}`);
    },
  },
  {
    name: "get_trades_by_party",
    description:
      "Get congressional trades filtered by political party. Compare Democrat vs Republican trading activity. Returns all trades for the specified party with full details.",
    inputSchema: {
      type: "object",
      properties: {
        party: {
          type: "string",
          description: "Political party (partial match)",
          enum: ["Democrat", "Republican"],
        },
        category: {
          type: "string",
          description: "Filter by transaction category (buy/sell)",
          enum: ["buy", "sell"],
        },
        ticker: {
          type: "string",
          description: "Optional: filter to a specific ticker within this party",
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
      required: ["party"],
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      params.set("party", String(args.party));
      if (args.category) params.set("category", String(args.category));
      if (args.ticker) params.set("ticker", String(args.ticker).toUpperCase());
      params.set("limit", String(args.limit || 50));
      return fetchJson(`/api/trades?${params}`);
    },
  },
  {
    name: "get_buy_momentum",
    description:
      "Identify stocks with strong politician buy momentum — where US House members are net buyers. Returns recent buy trades sorted by date. Use this to spot consensus picks and follow-the-leader patterns. Pair with wallet agents for execution.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "Look back N days for trades (default 90)",
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 50)",
        },
      },
    },
    handler: async (args) => {
      const days = Number(args.days) || 90;
      const limit = String(args.limit || 50);
      const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const params = new URLSearchParams();
      params.set("category", "buy");
      params.set("from", from);
      params.set("sort", "date");
      params.set("order", "desc");
      params.set("limit", limit);
      return fetchJson(`/api/trades?${params}`);
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

console.error("[congress-trades-mcp] started, API URL:", API_URL);
