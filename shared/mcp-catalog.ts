/**
 * MCP server catalog types and client-side helpers.
 * The actual catalog data lives in the Supabase DB (heights_cloud_agents
 * with search_type='mcp_server') and is served via /api/mcp-catalog endpoints.
 * This file only contains the type definitions and helper functions.
 */

export type MCPTransport = "remote" | "stdio";

export type MCPAuthType = "open" | "oauth" | "apikey";

export interface MCPCatalogServer {
  /** Unique slug identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Short one-line summary for card view. */
  summary: string;
  /** Full description for detail view. */
  description: string;
  /** Transport type — remote (HTTP/SSE) or stdio (local process). */
  transport: MCPTransport;
  /** Auth method required. */
  authType: MCPAuthType;
  /** Whether this is an official server from the service provider. */
  isOfficial: boolean;
  /** Category tags for filtering. */
  category: string[];
  /** Brand logo URL (from simpleicons.org CDN) or inline SVG string for non-branded servers. */
  icon: string;
  /** Estimated weekly visitors (from PulseMCP, approximate). */
  visitorsPerWeek?: string;
  /** For remote servers: the MCP endpoint URL. */
  url?: string;
  /** For stdio servers: the command to spawn. */
  command?: string;
  /** For stdio servers: arguments for the command. */
  args?: string[];
  /** Environment variables the user may need to provide. */
  envVars?: { name: string; description: string; isRequired: boolean }[];
  /** Whether this server is suitable for native game integration (visual). */
  nativeIntegration?: boolean;
  /** Description of the native game integration, if applicable. */
  nativeIntegrationNote?: string;
  /** What to call the credential in the UI (e.g. "Personal Access Token", "Secret Key"). Falls back to "API Key". */
  keyLabel?: string;
  /** Placeholder text for the key input (e.g. "ghp_...", "sk_live_..."). Falls back to "Paste API key...". */
  keyPlaceholder?: string;
  /** URL where users can create/obtain their key. Renders as a "Get your key →" link. */
  keyHelpUrl?: string;
  /** For remote servers where the URL is per-instance (e.g. n8n). When set, the UI shows a URL input field. */
  urlPlaceholder?: string;
}


// ── Client-side helpers ────────────────────────────────────────────────
// The MCP catalog is now served from the DB via /api/mcp-catalog endpoints.
// These client-side stubs remain for backward compatibility.

/** Get a server by its remote URL. Client-side stub — returns undefined.
 *  The client should use s.icon from the agent's mcpServers config instead. */
export function getServerByUrl(_url: string): MCPCatalogServer | undefined {
  return undefined;
}

/**
 * Build a summary of notable curated marketplace agents.
 * These are the seed agents from the Supabase migrations — big tech,
 * proven services. Agent Resources uses this to recommend specific agents.
 */
export const CURATED_AGENTS_SUMMARY = `### Curated Marketplace Agents (hire via MARKET button)
- Yahoo Finance Agent: Strategy evaluator — fetches market data, computes technical indicators inline (RSI, MACD, SMA, Bollinger Bands), evaluates strategy conditions, and emits structured trade signals. No auth needed. Pairs with Robinhood agent via schedule + handoff.
- Robinhood Trading Agent: Trade executor — receives trade signal handoffs from analysis agents, confirms with boss, places trades via Robinhood MCP (OAuth). Always requires human confirmation before executing.
- GitHub Agent: Dev agent — manage repos, issues, PRs, and code search via GitHub MCP. Requires Personal Access Token.
- Coinbase DeFi Trader: Trading agent — place orders, manage portfolios, convert USDC/USD via Coinbase MCP. Requires CDP API key (2 fields from downloaded JSON file).
- AgentWallet Trader: Permissionless wallet agent — create wallets, send tokens, x402 payments on 9 EVM chains + Solana. No KYC. Requires AgentWallet API key.
- Runpod GPU Agent: Cloud infrastructure agent — launch GPU Pods, deploy serverless endpoints, manage storage via Runpod MCP. Requires Runpod API key.
- Massive Web Scraper: Data agent — captcha solving, JS rendering, geo-targeting (195+ countries), Google search with structured results via Massive MCP. For sites that block standard browsers. Requires Massive API token.
- Google Maps Scraper: Data agent — search Google Maps for businesses, retrieve reviews and photos, structure results for prospecting and market analysis via gmapsextractor.com MCP. Requires Google Maps Scraper API key.
- Crossmint Wallet Agent: Solana wallet agent — auto-provisioned smart wallet with sponsored gas. Check balances, transfer tokens, review tx history via Crossmint. No setup needed — wallet created on hire.`;


/** Convert a catalog entry to an MCPServerConfig for agent assignment. */
export function toMCPServerConfig(server: MCPCatalogServer): import("./types.js").MCPServerConfig {
  const config: import("./types.js").MCPServerConfig = {
    name: server.name,
  };
  if (server.transport === "remote" && server.url) {
    config.url = server.url;
  } else if (server.transport === "stdio" && server.command) {
    config.command = server.command;
    config.args = server.args;
  }
  if (server.authType === "oauth") {
    config.authType = "oauth";
  } else if (server.authType === "apikey") {
    config.authType = "apikey";
  }
  if (server.keyLabel) config.keyLabel = server.keyLabel;
  if (server.keyPlaceholder) config.keyPlaceholder = server.keyPlaceholder;
  if (server.keyHelpUrl) config.keyHelpUrl = server.keyHelpUrl;
  if (server.icon) config.icon = server.icon;
  if (server.envVars) config.envVars = server.envVars;
  if (server.urlPlaceholder) config.urlPlaceholder = server.urlPlaceholder;
  return config;
}
