/**
 * MCP server catalog types and client-side helpers.
 * The actual catalog data lives in the Supabase DB (heights_cloud_agents
 * with search_type='mcp_server') and is served via /api/mcp-catalog endpoints.
 * This file only contains the type definitions and helper functions.
 */

export type MCPTransport = "remote" | "stdio";

export type MCPAuthType = "open" | "oauth" | "apikey";

/** Security risk level for an MCP server or agent integration. */
export type RiskLevel = "low" | "medium" | "high";

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
  /** Security risk level — low (read-only/no auth), medium (API key, limited scope), high (financial/trading/write access). */
  riskLevel?: RiskLevel;
  /** Security best-practice advice shown before hiring (e.g., "Scope your PAT to specific repos"). */
  securityNote?: string;
  /** Short summary of what data/tools the agent can access through this server (e.g., "Read and write to your GitHub repos"). */
  dataAccess?: string;
}

/** Fallback security metadata for known MCP servers, keyed by server name.
 *  Used when the DB doesn't have risk_level/security_note/data_access populated. */
export const SECURITY_NOTES: Record<string, { riskLevel: RiskLevel; securityNote: string; dataAccess: string }> = {
  "GitHub": {
    riskLevel: "medium",
    securityNote: "Use a fine-grained PAT scoped to specific repos with the minimum permissions needed. Avoid classic tokens with broad scopes. When sharing spaces, use read-only tokens or restrict the agent via ACLs.",
    dataAccess: "Read and write to your GitHub repositories, issues, pull requests, and code search.",
  },
  "Robinhood": {
    riskLevel: "high",
    securityNote: "This agent can place real trades on your behalf. Always review the confirmation prompt before approving any trade. Consider restricting this agent with ACLs so only trusted users can interact with it.",
    dataAccess: "Place buy/sell orders, view portfolio holdings, and execute trades on your Robinhood account.",
  },
  "Coinbase": {
    riskLevel: "high",
    securityNote: "API key has wallet and trading access. Use Coinbase's API restrictions to limit withdrawal capability. Restrict this agent with ACLs in shared rooms.",
    dataAccess: "Place orders, manage portfolios, convert USDC/USD, and access your Coinbase wallet.",
  },
  "Slack": {
    riskLevel: "medium",
    securityNote: "The bot token grants access to channel messages where the bot is invited. Only invite the bot to channels where agents should read. Use the minimum required scopes.",
    dataAccess: "Read and send messages in Slack channels and DMs where the bot is invited.",
  },
  "Discord": {
    riskLevel: "medium",
    securityNote: "The bot can read all server messages it has access to. Restrict bot roles to specific channels. Enable only the Message Content Intent if needed.",
    dataAccess: "Read and send messages in Discord channels where the bot has access.",
  },
  "AgentWallet": {
    riskLevel: "high",
    securityNote: "This agent can create wallets and transfer tokens on your behalf. Monitor all transactions carefully. Restrict with ACLs in shared rooms.",
    dataAccess: "Create crypto wallets, send tokens, and make x402 payments on 9 EVM chains and Solana.",
  },
  "Runpod": {
    riskLevel: "medium",
    securityNote: "API key grants access to launch GPU instances which incur costs. Monitor usage to prevent unexpected charges.",
    dataAccess: "Launch GPU Pods, deploy serverless endpoints, and manage storage on Runpod.",
  },
  "Massive": {
    riskLevel: "low",
    securityNote: "Web scraping API — no sensitive account access. API usage may incur costs based on volume.",
    dataAccess: "Scrape web pages with captcha solving, JS rendering, and geo-targeting.",
  },
  "Crossmint Wallet": {
    riskLevel: "high",
    securityNote: "Auto-provisioned wallet with sponsored gas. The agent can transfer tokens. Restrict with ACLs in shared rooms.",
    dataAccess: "Create wallets, check balances, transfer tokens, and review transaction history.",
  },
  "Hostinger": {
    riskLevel: "high",
    securityNote: "API token grants full access to hosting infrastructure — websites, VPS, DNS, billing, and ecommerce. Restrict this agent with ACLs in shared rooms. Always review deploy and DNS changes before approving.",
    dataAccess: "Deploy and manage websites, VPS instances, domains, DNS records, email marketing, subscriptions, ecommerce stores, and WordPress sites on Hostinger.",
  },
  "Congress Trades": {
    riskLevel: "low",
    securityNote: "Read-only public data from US House + Senate PTR filings via CongressInvests.com free API. No credentials required. No write or financial access.",
    dataAccess: "Reads publicly available congressional trade filings — politician names, tickers, transaction types, amount ranges, trade dates, and disclosure dates.",
  },
  "Gmail": {
    riskLevel: "medium",
    securityNote: "OAuth grants read access to your Gmail inbox and the ability to create drafts. Drafts are not sent automatically — you review them in Gmail before sending. Use a dedicated Google Account if sharing agents in shared rooms.",
    dataAccess: "Search and read your Gmail threads, create email drafts, and manage labels.",
  },
  "Google Drive": {
    riskLevel: "medium",
    securityNote: "OAuth grants read access to your Google Drive files and the ability to create/copy files. The drive.file scope limits access to files created or opened by the app. Restrict with ACLs in shared rooms.",
    dataAccess: "Search, read, download, create, and copy files in your Google Drive.",
  },
  "Google Docs": {
    riskLevel: "medium",
    securityNote: "OAuth grants read and write access to your Google Docs. The agent can modify document content. Always review proposed changes before approving. The drive.file scope limits file access.",
    dataAccess: "Read and update the content and structure of your Google Docs.",
  },
  "Google Sheets": {
    riskLevel: "medium",
    securityNote: "OAuth grants read and write access to your Google Sheets. The agent can modify cell values, formulas, and spreadsheet structure. Always review proposed changes before approving.",
    dataAccess: "Read and update cell values, formulas, and structure in your Google Sheets.",
  },
  "Google Slides": {
    riskLevel: "medium",
    securityNote: "OAuth grants read and write access to your Google Slides presentations. The agent can modify slide content. Always review proposed changes before approving.",
    dataAccess: "Read and update the content and layout of your Google Slides presentations.",
  },
  "Google Calendar": {
    riskLevel: "medium",
    securityNote: "OAuth grants read access to your calendar events and the ability to create, update, and delete events. Always confirm before the agent modifies your calendar. The scopes are limited to calendar list and events (not settings).",
    dataAccess: "List, search, create, update, and delete events on your Google Calendar.",
  },
  "Google Chat": {
    riskLevel: "medium",
    securityNote: "OAuth grants read access to Google Chat spaces and messages, and the ability to send messages. The bot only sees spaces it has been added to. Be cautious about sending messages to shared spaces.",
    dataAccess: "List and read Google Chat spaces, memberships, and messages. Create messages in spaces.",
  },
  "Google People": {
    riskLevel: "medium",
    securityNote: "OAuth grants read-only access to your Google Contacts, profile, and directory. No write access. Contact information is sensitive — restrict with ACLs in shared rooms.",
    dataAccess: "Read your Google profile, contacts, and organization directory.",
  },
  "Zillapi": {
    riskLevel: "medium",
    securityNote: "API key grants access to Zillow-sourced property data. Treat zk_ keys like passwords — never commit them to a repo. Free tier includes 100 credits.",
    dataAccess: "Look up US property data including prices, Zestimates, photos, tax history, school ratings, and listing details.",
  },
  "StayingAPI": {
    riskLevel: "low",
    securityNote: "All tools are read-only (annotated readOnlyHint). No booking, cancellation, or write capabilities. OAuth 2.1 with PKCE — no static keys. 300 free credits.",
    dataAccess: "Search accommodations, check availability, compare prices, and read reviews across Booking.com, Airbnb, Vrbo, and Google Hotels.",
  },
  "Nomad Stays": {
    riskLevel: "low",
    securityNote: "Read-only public data. No authentication required. No write or booking capabilities.",
    dataAccess: "Search digital nomad accommodations by location, lifestyle, budget, amenities, WiFi speed, and availability.",
  },
};

/** Look up security metadata for a server by name, falling back to the SECURITY_NOTES map. */
export function getSecurityInfo(server: MCPCatalogServer): { riskLevel: RiskLevel; securityNote: string; dataAccess: string } | null {
  if (server.riskLevel && server.securityNote && server.dataAccess) {
    return { riskLevel: server.riskLevel, securityNote: server.securityNote, dataAccess: server.dataAccess };
  }
  return SECURITY_NOTES[server.name] ?? null;
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
 * proven services. The Office Manager uses this to recommend specific agents.
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
- Crossmint Wallet Agent: Solana wallet agent — auto-provisioned smart wallet with sponsored gas. Check balances, transfer tokens, review tx history via Crossmint. No setup needed — wallet created on hire.
- Hostinger Agent: Infrastructure agent — deploy and manage websites, VPS, domains, DNS, email marketing, billing, ecommerce, and WordPress via Hostinger MCP. Requires Hostinger API token (generate at hPanel → Account → API).
- Congress Trades Analyst: Research agent — track US politician stock trades (House + Senate), buy momentum, and trading patterns via CongressInvests free API. No auth needed. Pairs with wallet agents for "follow the politicians" strategies.
- Gmail Agent: Email agent — search, read, and draft emails via Google Workspace Gmail MCP (OAuth). Creates drafts for review, manages labels.
- Google Drive Agent: File agent — search, read, download, create, and copy files via Google Drive MCP (OAuth).
- Google Docs Agent: Document agent — read and update Google Docs via Google Docs MCP (OAuth).
- Google Sheets Agent: Spreadsheet agent — read and update cell values, formulas, and structure via Google Sheets MCP (OAuth).
- Google Slides Agent: Presentation agent — read and update slide decks via Google Slides MCP (OAuth).
- Google Calendar Agent: Scheduling agent — list, search, create, update, and delete events via Google Calendar MCP (OAuth). Suggests meeting times based on free/busy.
- Google Chat Agent: Messaging agent — read and send messages in Google Chat spaces via Google Chat MCP (OAuth).
- Google Contacts Agent: Contacts agent — look up contacts, profile info, and directory via Google People API MCP (OAuth).
- Zillapi Property Analyst: Real estate agent — look up US properties, Zestimates, listings, and 300+ fields per home via Zillapi MCP. Requires API key (free: 100 credits, no card). Pairs with finance agents for mortgage planning.
- StayingAPI Accommodation Scout: Travel agent — search stays across Booking.com, Airbnb, Vrbo & Google Hotels in one unified schema. OAuth, 300 free credits. Read-only — search, compare prices, check availability.
- Nomad Stays Explorer: Housing agent — search digital nomad accommodations worldwide by lifestyle, budget, amenities, WiFi speed. No auth needed. 76 tools for finding remote-work-friendly housing.`;


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
  if (server.riskLevel) config.riskLevel = server.riskLevel;
  if (server.securityNote) config.securityNote = server.securityNote;
  if (server.dataAccess) config.dataAccess = server.dataAccess;
  return config;
}
