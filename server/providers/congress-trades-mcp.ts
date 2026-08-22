/**
 * Congress Trades MCP Server (stdio transport)
 *
 * Fetches congressional stock trade data directly from the US House
 * Clerk's public disclosure archives (disclosures-clerk.house.gov).
 * Downloads the filing index ZIP, parses PTR PDFs on-demand.
 * Free, no API key, no external service required.
 *
 * Spawned by StdioMCPClient with:
 *   command: "npx"
 *   args: ["tsx", "server/providers/congress-trades-mcp.ts"]
 *
 * Tools exposed:
 *   - get_recent_filings     — most recently filed PTRs (index only, fast)
 *   - get_recent_trades      — parse recent PTR PDFs for trade details
 *   - get_trades_by_politician — filter by politician name (downloads PDFs)
 *   - get_trades_by_ticker   — search for a ticker across filings
 *   - get_buy_momentum       — net buy signals from recent filings
 */

// adm-zip uses export = which doesn't play nice with ESM TS — use require
const AdmZip = require("adm-zip");

const CLERK_BASE = "https://disclosures-clerk.house.gov";
const LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json";

interface FilingEntry {
  name: string;
  last: string;
  first: string;
  state: string;
  filingDate: string;
  docId: string;
  party?: string;
}

interface Trade {
  member: string;
  chamber: string;
  ticker: string;
  asset: string;
  transactionType: string;
  tradeDate: string;
  notificationDate: string;
  amount: string;
  owner: string;
  filingDate: string;
  docId: string;
  pdfUrl: string;
  party?: string;
  state?: string;
}

// ── Caches ──────────────────────────────────────────────────────────────

let filingIndexCache: FilingEntry[] = [];
let filingIndexTime = 0;
const pdfCache = new Map<string, Trade[]>();
const legislatorPartyMap = new Map<string, string>();
let legislatorsLoaded = false;

const INDEX_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

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

// ── CongressInvests API (historical data, free 100 req/day) ─────────────

const CI_BASE = "https://congressinvests.com";

interface CITrade {
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

interface CIResponse {
  total: number;
  trades: CITrade[];
  last_updated: string;
}

async function fetchCI(path: string): Promise<CIResponse> {
  const url = `${CI_BASE}${path}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CongressInvests API returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return await res.json() as CIResponse;
}

// ── House Clerk (current filings, free, unlimited) ──────────────────────

async function loadLegislators(): Promise<void> {
  if (legislatorsLoaded) return;
  legislatorsLoaded = true;
  try {
    const res = await fetch(LEGISLATORS_URL, { signal: AbortSignal.timeout(15_000) });
    const data = await res.json() as Array<{
      name: { first: string; last: string; official_full?: string };
      terms: Array<{ party: string; type: string }>;
    }>;
    for (const leg of data) {
      const name = (leg.name.official_full || `${leg.name.first} ${leg.name.last}`).toLowerCase();
      const lastTerm = leg.terms[leg.terms.length - 1];
      if (lastTerm) legislatorPartyMap.set(name, lastTerm.party);
    }
    console.error(`[congress-trades-mcp] loaded ${data.length} legislators`);
  } catch (err) {
    console.error(`[congress-trades-mcp] failed to load legislators:`, err);
  }
}

function getParty(name: string): string | undefined {
  return legislatorPartyMap.get(name.toLowerCase());
}

async function fetchFilingIndex(): Promise<{ filings: FilingEntry[]; timestamp: number }> {
  if (filingIndexCache.length && Date.now() - filingIndexTime < INDEX_CACHE_MS) {
    return { filings: filingIndexCache, timestamp: filingIndexTime };
  }
  const year = new Date().getFullYear();
  const url = `${CLERK_BASE}/public_disc/financial-pdfs/${year}FD.zip`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`House Clerk ZIP returned ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const xmlEntry = zip.getEntry(`${year}FD.xml`);
  if (!xmlEntry) throw new Error(`No ${year}FD.xml in ZIP`);
  const xml = zip.readAsText(xmlEntry);

  const filings: FilingEntry[] = [];
  const memberRegex = /<Member>([\s\S]*?)<\/Member>/g;
  let m: RegExpExecArray | null;
  while ((m = memberRegex.exec(xml)) !== null) {
    const block = m[1];
    if (!block.includes("<FilingType>P</FilingType>")) continue;
    const last = (block.match(/<Last>(.*?)<\/Last>/) || [])[1] || "";
    const first = (block.match(/<First>(.*?)<\/First>/) || [])[1] || "";
    const stateDst = (block.match(/<StateDst>(.*?)<\/StateDst>/) || [])[1] || "";
    const filingDate = (block.match(/<FilingDate>(.*?)<\/FilingDate>/) || [])[1] || "";
    const docId = (block.match(/<DocID>(.*?)<\/DocID>/) || [])[1] || "";
    const name = `${first} ${last}`.trim();
    filings.push({ name, last, first, state: stateDst, filingDate, docId, party: getParty(name) });
  }
  filings.sort((a, b) => {
    const da = new Date(a.filingDate).getTime() || 0;
    const db = new Date(b.filingDate).getTime() || 0;
    return db - da;
  });
  filingIndexCache = filings;
  filingIndexTime = Date.now();
  console.error(`[congress-trades-mcp] filing index: ${filings.length} PTRs, latest ${filings[0]?.filingDate}`);
  return { filings, timestamp: filingIndexTime };
}

async function parsePtrPdf(docId: string, filing: FilingEntry): Promise<Trade[]> {
  if (pdfCache.has(docId)) return pdfCache.get(docId)!;
  const year = new Date().getFullYear();
  const url = `${CLERK_BASE}/public_disc/ptr-pdfs/${year}/${docId}.pdf`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`PTR PDF ${docId} returned ${res.status}`);
  const pdfData = new Uint8Array(await res.arrayBuffer());

  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const trades: Trade[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(" ");

    // PTR PDFs have tabular rows: Asset (TICKER) [TYPE]  S/P  date  date  amount
    // Match patterns like: "AT&T Inc. (T) [ST] S 08/14/2026 08/14/2026 $50,001 - $100,000"
    const tradeRegex = /([A-Z][A-Za-z&.\s]+?)\s*\(([A-Z]{1,5})\)\s*\[([A-Z]+)\]\s*([SP])\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([$]\d[\d,]*\s*-\s*[$]\d[\d,]*)/g;
    let t: RegExpExecArray | null;
    while ((t = tradeRegex.exec(text)) !== null) {
      trades.push({
        member: filing.name,
        chamber: "House",
        ticker: t[2],
        asset: t[1].trim(),
        transactionType: t[4] === "P" ? "buy" : "sell",
        tradeDate: t[5],
        notificationDate: t[6],
        amount: t[7].replace(/\s+/g, " "),
        owner: "SP",
        filingDate: filing.filingDate,
        docId,
        pdfUrl: url,
        party: filing.party,
        state: filing.state,
      });
    }
  }

  pdfCache.set(docId, trades);
  return trades;
}

async function fetchRecentTradesFromClerk(count: number): Promise<Trade[]> {
  await loadLegislators();
  const { filings } = await fetchFilingIndex();
  const recent = filings.slice(0, Math.min(count, 30)); // limit PDF downloads
  const allTrades: Trade[] = [];
  for (const f of recent) {
    try {
      const trades = await parsePtrPdf(f.docId, f);
      allTrades.push(...trades);
    } catch (err) {
      console.error(`[congress-trades-mcp] failed to parse ${f.docId}:`, err);
    }
  }
  return allTrades;
}

// ── Formatting ──────────────────────────────────────────────────────────

function formatTrades(trades: Trade[], source: string): string {
  if (!trades.length) return `No trades found (source: ${source}).`;
  const summary = `Found ${trades.length} trades (source: ${source})\n`;
  const rows = trades.map((t) => ({
    member: t.member,
    chamber: t.chamber,
    ticker: t.ticker,
    type: t.transactionType,
    amount: t.amount,
    trade_date: t.tradeDate,
    disclosed: t.filingDate,
    party: t.party,
    state: t.state,
    link: t.pdfUrl,
  }));
  return summary + JSON.stringify(rows, null, 2);
}

function formatFilings(filings: FilingEntry[]): string {
  if (!filings.length) return "No PTR filings found.";
  const summary = `Found ${filings.length} PTR filings (House Clerk index, updated daily)\n`;
  const rows = filings.map((f) => ({
    member: f.name,
    state: f.state,
    filing_date: f.filingDate,
    doc_id: f.docId,
    party: f.party,
    pdf_url: `${CLERK_BASE}/public_disc/ptr-pdfs/${new Date().getFullYear()}/${f.docId}.pdf`,
  }));
  return summary + JSON.stringify(rows, null, 2);
}

function ciToTrades(ci: CIResponse): Trade[] {
  return ci.trades.map((t) => ({
    member: t.member,
    chamber: t.chamber,
    ticker: t.ticker,
    asset: t.asset.slice(0, 80),
    transactionType: t.trade_type,
    tradeDate: t.tx_date,
    notificationDate: t.disclosed,
    amount: t.amount.replace(/\n/g, " "),
    owner: "",
    filingDate: t.disclosed,
    docId: "",
    pdfUrl: t.link,
  }));
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
    name: "get_recent_filings",
    description:
      "Get the most recently filed House PTR filings (index only, no PDF parsing — fast). Returns politician name, state, filing date, party, and PDF link. Use this to see who filed recently, then use get_recent_trades for trade details.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          description: "Number of recent filings to return (default 20, max 100)",
        },
      },
    },
    handler: async (args) => {
      const count = Math.min(Number(args.count) || 20, 100);
      await loadLegislators();
      const { filings } = await fetchFilingIndex();
      return formatFilings(filings.slice(0, count));
    },
  },
  {
    name: "get_recent_trades",
    description:
      "Get the most recently filed congressional stock trades. Combines CongressInvests historical data with House Clerk PDF parsing for the latest filings. Returns trades sorted by date (newest first) with politician name, chamber, ticker, transaction type, amount range, dates, and PDF link.",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          description: "Number of recent filings to parse from House Clerk (default 15, max 30). Also fetches recent trades from CongressInvests.",
        },
      },
    },
    handler: async (args) => {
      const count = Math.min(Number(args.count) || 15, 30);
      const [ciTrades, clerkTrades] = await Promise.allSettled([
        fetchCI(`/trades?limit=100`).then(ciToTrades),
        fetchRecentTradesFromClerk(count),
      ]);
      const trades: Trade[] = [];
      if (ciTrades.status === "fulfilled") trades.push(...ciTrades.value);
      if (clerkTrades.status === "fulfilled") trades.push(...clerkTrades.value);
      // Deduplicate by member+ticker+tradeDate
      const seen = new Set<string>();
      const deduped = trades.filter((t) => {
        const key = `${t.member}|${t.ticker}|${t.tradeDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => {
        const da = new Date(a.filingDate).getTime() || 0;
        const db = new Date(b.filingDate).getTime() || 0;
        return db - da;
      });
      const sources = [
        ciTrades.status === "fulfilled" ? "CongressInvests" : null,
        clerkTrades.status === "fulfilled" ? "House Clerk" : null,
      ].filter(Boolean).join(" + ");
      return formatTrades(deduped, sources || "none");
    },
  },
  {
    name: "get_trades_by_ticker",
    description:
      "Get congressional trades for a specific stock ticker. Searches CongressInvests historical data and recent House Clerk filings. Returns politician name, chamber, transaction type, amount range, dates, and filing link.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: {
          type: "string",
          description: "Stock ticker symbol (e.g. AAPL, TSLA, NVDA)",
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
      const limit = Math.min(Number(args.limit) || 50, 200);
      const [ciResult, clerkTrades] = await Promise.allSettled([
        fetchCI(`/trades/${ticker}?limit=${limit}`),
        fetchRecentTradesFromClerk(20),
      ]);
      const trades: Trade[] = [];
      if (ciResult.status === "fulfilled") trades.push(...ciToTrades(ciResult.value));
      if (clerkTrades.status === "fulfilled") {
        trades.push(...clerkTrades.value.filter((t) => t.ticker === ticker));
      }
      const seen = new Set<string>();
      const deduped = trades.filter((t) => {
        const key = `${t.member}|${t.ticker}|${t.tradeDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return formatTrades(deduped.slice(0, limit), "CongressInvests + House Clerk");
    },
  },
  {
    name: "get_trades_by_politician",
    description:
      "Get trades by a specific politician (partial name match). Searches CongressInvests historical data and recent House Clerk filings. Returns trade history with ticker, transaction type, amount range, dates, and chamber.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Politician name (partial match, e.g. 'Pelosi', 'Nancy Pelosi', 'Tim Moore')",
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
      const [ciResult, clerkTrades] = await Promise.allSettled([
        fetchCI(`/trades?limit=500`),
        fetchRecentTradesFromClerk(20),
      ]);
      const trades: Trade[] = [];
      if (ciResult.status === "fulfilled") {
        trades.push(...ciToTrades(ciResult.value).filter((t) => t.member.toLowerCase().includes(name)));
      }
      if (clerkTrades.status === "fulfilled") {
        trades.push(...clerkTrades.value.filter((t) => t.member.toLowerCase().includes(name)));
      }
      const seen = new Set<string>();
      const deduped = trades.filter((t) => {
        const key = `${t.member}|${t.ticker}|${t.tradeDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return formatTrades(deduped.slice(0, limit), "CongressInvests + House Clerk");
    },
  },
  {
    name: "get_buy_momentum",
    description:
      "Identify stocks with strong politician buy momentum — where members of Congress are net buyers. Combines CongressInvests historical buys with recent House Clerk buy trades. Use this to spot consensus picks and follow-the-leader patterns. Pair with wallet agents for execution.",
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
      const [ciResult, clerkTrades] = await Promise.allSettled([
        fetchCI(`/trades?limit=500`),
        fetchRecentTradesFromClerk(20),
      ]);
      const trades: Trade[] = [];
      if (ciResult.status === "fulfilled") {
        trades.push(...ciToTrades(ciResult.value).filter((t) => t.transactionType === "buy"));
      }
      if (clerkTrades.status === "fulfilled") {
        trades.push(...clerkTrades.value.filter((t) => t.transactionType === "buy"));
      }
      const seen = new Set<string>();
      const deduped = trades.filter((t) => {
        const key = `${t.member}|${t.ticker}|${t.tradeDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => {
        const da = new Date(a.filingDate).getTime() || 0;
        const db = new Date(b.filingDate).getTime() || 0;
        return db - da;
      });
      return formatTrades(deduped.slice(0, limit), "CongressInvests + House Clerk");
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

console.error("[congress-trades-mcp] started, hybrid: CongressInvests.com + House Clerk direct");
