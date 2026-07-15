/**
 * PulseMCP search helper — calls the PulseMCP REST API directly
 * to search 22,000+ MCP servers from pulsemcp.com.
 *
 * API: https://api.pulsemcp.com/v0beta/servers
 */
interface PulseMCPServer {
  name: string;
  url?: string;
  external_url?: string;
  short_description?: string;
  source_code_url?: string;
  github_stars?: number;
  package_registry?: string;
  package_name?: string;
  package_download_count?: number;
  integrations?: { name: string; slug: string; url?: string }[];
}

interface PulseMCPListResponse {
  servers: PulseMCPServer[];
  total_count: number;
  next: string | null;
}

const PULSEMCP_API_BASE = "https://api.pulsemcp.com/v0beta";
const PULSEMCP_SEARCH_TIMEOUT_MS = 8_000;

/**
 * Search PulseMCP for MCP servers matching the query.
 * Returns a formatted string suitable for injecting into Yuki's context.
 * Returns null if the search fails, times out, or finds no results.
 */
export async function searchPulseMCP(query: string, limit = 10): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PULSEMCP_SEARCH_TIMEOUT_MS);

  try {
    const url = new URL(`${PULSEMCP_API_BASE}/servers`);
    url.searchParams.set("query", trimmed);
    url.searchParams.set("count_per_page", String(limit));
    url.searchParams.set("offset", "0");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      console.warn(`[pulsemcp] API returned ${res.status} for "${trimmed}"`);
      return null;
    }

    const parsed: PulseMCPListResponse = await res.json();

    if (!parsed.servers || parsed.servers.length === 0) {
      console.log(`[pulsemcp] no results for "${trimmed}"`);
      return null;
    }

    const lines = parsed.servers.map((s) => {
      const stars = s.github_stars ? ` (${s.github_stars}★)` : "";
      const integrations = s.integrations?.length
        ? ` — integrations: ${s.integrations.map((i) => i.name).join(", ")}`
        : "";
      const source = s.source_code_url ? ` (source: ${s.source_code_url})` : "";
      return `- ${s.name}${stars}: ${s.short_description ?? "No description"}${integrations}${source}`;
    });

    console.log(`[pulsemcp] search "${trimmed}" → ${parsed.servers.length} results (of ${parsed.total_count})`);
    return `### PulseMCP Community Search Results (${parsed.total_count} total matches for "${trimmed}")\n${lines.join("\n")}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pulsemcp] search failed for "${trimmed}": ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Determine if a user's message to Yuki seems like it's asking about
 * finding tools, agents, or capabilities that would warrant a PulseMCP search.
 * Only triggers on messages that look like they're seeking a specific tool/service,
 * not generic questions about the office or current agents.
 */
export function shouldSearchPulseMCP(message: string): boolean {
  const lower = message.toLowerCase();
  // Strong signals: user is looking for a specific capability or tool
  const strongTriggers = [
    "mcp server", "mcp tool", "is there a tool", "is there an mcp",
    "is there a server", "find a tool", "find a server", "find an mcp",
    "find me a", "find me an", "find me some",
    "looking for a tool", "looking for a server", "looking for an mcp",
    "need a tool", "need a server", "need an mcp", "need a plugin",
    "recommend a tool", "recommend a server", "recommend an mcp",
    "any mcp", "any tool", "any server", "any plugin",
    "what tools", "what servers", "what mcp",
    "search for", "integrate with", "connect to",
    "pulsemcp", "pulse mcp", "pulse-mcp",
    "mcp catalog", "mcp catalogue", "mcp directory",
    "browse mcp", "browse the market", "browse the catalog",
    "what's in there", "whats in there", "what's available", "whats available",
    "show me mcp", "show me servers", "show me tools",
    "examples of", "give me examples",
  ];
  if (strongTriggers.some((w) => lower.includes(w))) return true;

  // Weaker signals: only trigger if the message also mentions a specific domain
  const domainWords = [
    "trading", "finance", "stocks", "crypto", "payment", "stripe",
    "github", "notion", "slack", "database", "email", "calendar",
    "deploy", "monitoring", "analytics", "crm", "sales", "marketing",
    "design", "social", "cloud", "kubernetes", "docker",
    "defi", "hyperliquid", "perps", "nft", "web3", "blockchain",
    "solana", "ethereum", "bitcoin", "uniswap", "aave",
    "ai", "ml", "llm", "rag", "embedding", "vector",
    "seo", "sem", "ads", "content", "writing",
    "sentry", "vercel", "cloudflare", "gitlab",
    "linear", "asana", "clickup", "airtable",
    "mongo", "postgres", "redis", "supabase",
    "brave", "tavily", "exa", "firecrawl",
    "hubspot", "apollo", "ahrefs", "semrush",
  ];
  const queryWords = ["tool", "server", "mcp", "mcps", "integration", "plugin", "connect", "automate"];
  return domainWords.some((d) => lower.includes(d)) && queryWords.some((q) => lower.includes(q));
}

/**
 * Extract search keywords from a user's message for PulseMCP search.
 * Strips common question words and keeps meaningful terms.
 */
export function extractSearchQuery(message: string): string {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "can", "i", "you", "me", "my",
    "do", "have", "has", "find", "search", "tool", "agent", "hire",
    "mcp", "mcps", "server", "help", "need", "want", "looking", "for", "with",
    "about", "how", "what", "which", "any", "some", "please", "recommend",
    "connect", "integrate", "integration", "service", "plugin", "extension",
    "to", "and", "or", "if", "there", "available", "use", "using",
    "pulse", "catalog", "catalogue", "directory", "browse", "examples",
    "related", "niche", "give", "show", "see", "look", "yoou",
  ]);
  const words = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  return words.slice(0, 5).join(" ");
}
