/**
 * PulseMCP search helper — calls the PulseMCP REST API directly
 * to search 22,000+ MCP servers from pulsemcp.com.
 *
 * API: https://api.pulsemcp.com/v0beta/servers (legacy)
 *      https://api.pulsemcp.com/v0.1/servers (new, requires auth)
 */
import type { MCPServerConfig } from "../shared/types.js";

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
  /** v0beta may include remotes directly */
  remotes?: { type: string; url: string }[];
  /** v0beta may include packages with transport info */
  packages?: { registryType?: string; identifier?: string; transport?: { type: string }; runtimeHint?: string }[];
}

interface PulseMCPListResponse {
  servers: PulseMCPServer[];
  total_count: number;
  next: string | null;
}

/** Structured result for client-side rendering (marketplace Community tab). */
export interface CommunityMCPResult {
  name: string;
  description: string;
  source_code_url?: string;
  github_stars?: number;
  /** Constructed MCPServerConfig for hiring. */
  mcpConfig: MCPServerConfig;
}

const PULSEMCP_API_BASE = "https://api.pulsemcp.com/v0beta";
const PULSEMCP_SEARCH_TIMEOUT_MS = 8_000;

/**
 * Search PulseMCP for MCP servers matching the query.
 * Returns a formatted string suitable for injecting into Agent Resources's context.
 * Returns null if the search fails, times out, or finds no results.
 */
/**
 * Fetch raw server data from PulseMCP API.
 * Tries v0beta first, falls back to v0.1 (which may require auth).
 */
async function fetchPulseMCPServers(query: string, limit: number): Promise<PulseMCPServer[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PULSEMCP_SEARCH_TIMEOUT_MS);

  try {
    // Try v0beta first (no auth needed)
    const url = new URL(`${PULSEMCP_API_BASE}/servers`);
    url.searchParams.set("query", query);
    url.searchParams.set("count_per_page", String(limit));
    url.searchParams.set("offset", "0");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });

    if (res.ok) {
      const parsed: PulseMCPListResponse = await res.json();
      // Also check for remotes/packages fields that v0beta might include
      return parsed.servers ?? [];
    }

    console.warn(`[pulsemcp] v0beta returned ${res.status}, trying v0.1...`);

    // Fallback: try v0.1 with search param (may work without auth for basic queries)
    const v01Url = new URL("https://api.pulsemcp.com/v0.1/servers");
    v01Url.searchParams.set("search", query);
    v01Url.searchParams.set("limit", String(limit));
    v01Url.searchParams.set("version", "latest");

    const v01Res = await fetch(v01Url.toString(), {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });

    if (v01Res.ok) {
      const v01Parsed = await v01Res.json();
      // v0.1 has a different shape: { servers: [{ server: { name, description, repository, packages, remotes } }] }
      const servers: PulseMCPServer[] = (v01Parsed.servers ?? []).map((entry: any) => {
        const s = entry.server ?? entry;
        const pkg = s.packages?.[0];
        const remote = s.remotes?.[0];
        return {
          name: s.title ?? s.name ?? "Unknown",
          url: remote?.url,
          short_description: s.description,
          source_code_url: s.repository?.url,
          package_registry: pkg?.registryType,
          package_name: pkg?.identifier,
        };
      });
      return servers;
    }

    console.warn(`[pulsemcp] v0.1 also returned ${v01Res.status}`);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pulsemcp] fetch failed for "${query}": ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Try to fetch server.json from a GitHub repo to get remotes/packages.
 * Returns the MCP remote URL if found, or null.
 */
async function fetchServerJsonRemote(githubUrl: string): Promise<string | null> {
  try {
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
    if (!match) return null;
    const [, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, "");
    for (const branch of ["main", "master"]) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/server.json`;
        const res = await fetch(rawUrl, {
          signal: AbortSignal.timeout(5_000),
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) continue;
        const json = await res.json() as {
          remotes?: { type: string; url: string }[];
          packages?: { identifier?: string; transport?: { type: string }; runtimeHint?: string }[];
        };
        const remote = json.remotes?.find((r) => r.url && !r.url.includes("github.com"));
        if (remote?.url) {
          console.log(`[pulsemcp] found remote URL in server.json: ${remote.url}`);
          return remote.url;
        }
      } catch { /* try next branch */ }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch package.json from a GitHub repo to find the npm package name.
 * Returns { command, args } for npx install, or null.
 */
async function fetchPackageJsonFromGithub(githubUrl: string): Promise<{ command: string; args: string[] } | null> {
  try {
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
    if (!match) return null;
    const [, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, "");
    for (const branch of ["main", "master"]) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/package.json`;
        const res = await fetch(rawUrl, {
          signal: AbortSignal.timeout(5_000),
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) continue;
        const pkg = await res.json() as {
          name?: string;
          bin?: string | Record<string, string>;
          scripts?: Record<string, string>;
        };
        if (pkg.name) {
          // If it has a bin field or a start script, it's likely an MCP server package
          const hasBin = typeof pkg.bin === "string" || (pkg.bin && Object.keys(pkg.bin).length > 0);
          const hasStart = pkg.scripts?.start;
          if (hasBin || hasStart) {
            console.log(`[pulsemcp] found npm package in package.json: ${pkg.name}`);
            return { command: "npx", args: ["-y", pkg.name] };
          }
        }
      } catch { /* try next branch */ }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert a PulseMCPServer into an MCPServerConfig for hiring.
 * Prefers remote URL, falls back to npx package install.
 * This is the synchronous version — uses only data already in the server object.
 */
function toMCPConfigSync(s: PulseMCPServer): MCPServerConfig {
  // Check remotes array first (v0beta or v0.1 may include it)
  const remoteUrl = s.remotes?.find((r) => r.url && !r.url.includes("github.com") && !r.url.includes("pulsemcp.com"))?.url;
  if (remoteUrl) {
    return { name: s.name, url: remoteUrl };
  }
  // Only use url if it looks like an actual MCP endpoint (not a GitHub page)
  if (s.url && !s.url.includes("github.com") && !s.url.includes("pulsemcp.com")) {
    return { name: s.name, url: s.url };
  }
  // Check packages array (v0.1 format)
  const pkg = s.packages?.find((p) => p.identifier);
  if (pkg?.identifier) {
    return {
      name: s.name,
      command: pkg.runtimeHint ?? "npx",
      args: ["-y", pkg.identifier],
    };
  }
  if (s.package_name) {
    return {
      name: s.name,
      command: "npx",
      args: ["-y", s.package_name],
    };
  }
  // No installable config from available data
  return { name: s.name };
}

/**
 * Search PulseMCP for MCP servers matching the query.
 * Returns a formatted string suitable for injecting into Agent Resources's context.
 * Returns null if the search fails, times out, or finds no results.
 */
export async function searchPulseMCP(query: string, limit = 10): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const servers = await fetchPulseMCPServers(trimmed, limit);
  if (!servers || servers.length === 0) {
    console.log(`[pulsemcp] no results for "${trimmed}"`);
    return null;
  }

  const lines = servers.map((s) => {
    const stars = s.github_stars ? ` (${s.github_stars}★)` : "";
    const integrations = s.integrations?.length
      ? ` — integrations: ${s.integrations.map((i) => i.name).join(", ")}`
      : "";
    const source = s.source_code_url ? ` (source: ${s.source_code_url})` : "";
    return `- ${s.name}${stars}: ${s.short_description ?? "No description"}${integrations}${source}`;
  });

  console.log(`[pulsemcp] search "${trimmed}" → ${servers.length} results`);
  return `### PulseMCP Community Search Results for "${trimmed}"\n${lines.join("\n")}`;
}

/**
 * Search PulseMCP and return structured results for the marketplace UI.
 * Each result includes a ready-to-use MCPServerConfig.
 * For servers without a direct URL/package, tries to fetch server.json
 * from the GitHub repo to discover the remote endpoint.
 */
export async function searchPulseMCPStructured(query: string, limit = 20): Promise<CommunityMCPResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const servers = await fetchPulseMCPServers(trimmed, limit);
  if (!servers) return [];

  const results: CommunityMCPResult[] = [];
  for (const s of servers) {
    let config = toMCPConfigSync(s);

    // If no installable config yet, try fetching server.json from GitHub for a remote URL
    if (!config.url && !config.command && s.source_code_url) {
      const remoteUrl = await fetchServerJsonRemote(s.source_code_url);
      if (remoteUrl) {
        config = { name: s.name, url: remoteUrl };
      }
    }

    // Still no installable config — try fetching package.json for npm package name
    if (!config.url && !config.command && s.source_code_url) {
      const pkgConfig = await fetchPackageJsonFromGithub(s.source_code_url);
      if (pkgConfig) {
        config = { name: s.name, ...pkgConfig };
      }
    }

    // Still no installable config — include sourceUrl for agent self-setup
    if (!config.url && !config.command && s.source_code_url) {
      config.sourceUrl = s.source_code_url;
    }

    results.push({
      name: s.name,
      description: s.short_description ?? "No description available",
      source_code_url: s.source_code_url,
      github_stars: s.github_stars,
      mcpConfig: config,
    });
  }
  return results;
}

/**
 * Determine if a user's message to Agent Resources seems like it's asking about
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
