/**
 * Curated MCP server catalog — a static list of high-value MCP servers
 * sourced from PulseMCP (pulsemcp.com/servers). This replaces the need for
 * a live API integration; the catalog can be updated periodically.
 *
 * Each entry contains enough metadata to construct an MCPServerConfig at
 * install time and to render a store card in the UI.
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
  /** Brand logo URL (from simpleicons.org CDN) or emoji fallback for non-branded servers. */
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
}

export const MCP_CATALOG: MCPCatalogServer[] = [
  // ── Tier 1: Remote MCPs (Store Items) ────────────────────────────────

  {
    id: "notion",
    name: "Notion",
    summary: "Search content, query databases, manage pages and comments.",
    description:
      "Bridges to the Notion API for searching content, querying databases, and managing pages and comments without leaving the agent workspace. Agents can read docs, update databases, and create new pages.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["productivity", "knowledge"],
    icon: "https://cdn.simpleicons.org/notion/white",
    visitorsPerWeek: "120k",
    url: "https://mcp.notion.com/mcp",
  },
  {
    id: "github",
    name: "GitHub",
    summary: "Manage repositories, issues, pull requests, and search code.",
    description:
      "Manage repositories, issues, pull requests, and search code via GitHub API. Agents can create issues, review PRs, search across repos, and manage branches.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["development", "git"],
    icon: "https://cdn.simpleicons.org/github/white",
    visitorsPerWeek: "106k",
    url: "https://api.githubcopilot.com/mcp/",
  },
  {
    id: "linear",
    name: "Linear",
    summary: "Manage projects, issues, and cycles in Linear.",
    description:
      "Access your Linear data to manage your projects and issues in a simple and secure way. Agents can create issues, update status, view cycles, and track progress.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["productivity", "project-management"],
    icon: "https://cdn.simpleicons.org/linear",
    visitorsPerWeek: "66k",
    url: "https://mcp.linear.app/mcp",
  },
  {
    id: "slack",
    name: "Slack",
    summary: "Send messages, read channels, and manage Slack workspace.",
    description:
      "Integrates with Slack to enable agents to send messages, read channel history, search messages, and interact with your Slack workspace.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["communication", "productivity"],
    icon: "https://cdn.simpleicons.org/slack",
    visitorsPerWeek: "—",
    url: "https://mcp.slack.com/sse",
  },
  {
    id: "stripe",
    name: "Stripe",
    summary: "Payment processing, customer management, and financial ops.",
    description:
      "Integrates with Stripe's API to enable payment processing, customer management, and financial operations. Agents can create charges, manage customers, handle subscriptions, and query transaction data.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["finance", "payments"],
    icon: "https://cdn.simpleicons.org/stripe",
    visitorsPerWeek: "70k",
    url: "https://mcp.stripe.com",
  },
  {
    id: "gmail",
    name: "Gmail",
    summary: "Read, send, and manage Gmail messages.",
    description:
      "Enables agents to read, send, and manage Gmail messages. Supports searching emails, drafting replies, applying labels, and managing threads.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["communication", "productivity"],
    icon: "https://cdn.simpleicons.org/gmail",
    visitorsPerWeek: "—",
    url: "https://mcp.gmail.com/sse",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    summary: "View, create, and manage calendar events.",
    description:
      "Enables agents to view, create, and manage Google Calendar events. Supports scheduling, checking availability, and updating existing events.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["productivity", "scheduling"],
    icon: "https://cdn.simpleicons.org/googlecalendar",
    visitorsPerWeek: "—",
    url: "https://mcp.google.com/sse",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    summary: "Read, write, and manipulate Google Sheets data.",
    description:
      "Enables agents to read, write, and manipulate data in Google Sheets. Supports creating spreadsheets, updating cells, formatting, and running formulas.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["productivity", "data"],
    icon: "https://cdn.simpleicons.org/googlesheets",
    visitorsPerWeek: "—",
    url: "https://mcp.google.com/sse",
  },
  {
    id: "figma",
    name: "Figma",
    summary: "Extract design info, variables, and component data.",
    description:
      "Integrates with Figma's desktop app to extract design information, variables, and component data from selected frames. Agents can read design specs, extract assets, and query design tokens.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["design", "development"],
    icon: "https://cdn.simpleicons.org/figma",
    visitorsPerWeek: "87k",
    url: "https://mcp.figma.com/mcp",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    summary: "CRM contacts, companies, deals, and task management.",
    description:
      "Integrates with HubSpot CRM to enable secure access to contact information, company records, deal data, and task management. Agents can create contacts, update deals, and track pipeline.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["crm", "sales"],
    icon: "https://cdn.simpleicons.org/hubspot",
    visitorsPerWeek: "63k",
    url: "https://mcp.hubspot.com/mcp",
  },
  {
    id: "salesforce",
    name: "Salesforce CLI",
    summary: "Org management, metadata deployment, SOQL queries.",
    description:
      "Integrates with Salesforce development tools to provide org management, metadata deployment, SOQL queries, code execution, and more. Agents can query records, deploy changes, and manage orgs.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["crm", "enterprise"],
    icon: "https://cdn.simpleicons.org/salesforce",
    visitorsPerWeek: "69k",
    url: "https://mcp.salesforce.com/sse",
  },
  {
    id: "grafana",
    name: "Grafana",
    summary: "Search dashboards, query Prometheus metrics, fetch data.",
    description:
      "Integrates with Grafana to enable searching dashboards, fetching datasource information, querying Prometheus metrics, and visualizing observability data.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["monitoring", "devops"],
    icon: "https://cdn.simpleicons.org/grafana",
    visitorsPerWeek: "140k",
    url: "https://mcp.grafana.com/sse",
  },
  {
    id: "mongodb",
    name: "MongoDB",
    summary: "Comprehensive database operations for MongoDB.",
    description:
      "Provides a bridge between MongoDB databases and conversational interfaces, enabling comprehensive database operations including CRUD, aggregation, and schema inspection.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["database", "data"],
    icon: "https://cdn.simpleicons.org/mongodb",
    visitorsPerWeek: "54k",
    url: "https://mcp.mongodb.com/sse",
  },
  {
    id: "bigquery",
    name: "BigQuery",
    summary: "Run analytics queries on Google Cloud BigQuery.",
    description:
      "Official Google Cloud BigQuery remote server that runs on managed infrastructure with HTTPS endpoints, IAM authentication. Agents can run SQL queries and analyze large datasets.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["database", "analytics"],
    icon: "https://cdn.simpleicons.org/googlecloud/white",
    visitorsPerWeek: "66k",
    url: "https://mcp.google.com/sse",
  },
  {
    id: "firecrawl",
    name: "FireCrawl",
    summary: "Advanced web scraping for extracting structured data.",
    description:
      "Integration with FireCrawl to provide advanced web scraping capabilities for extracting structured data from complex websites. Agents can crawl sites, extract content, and convert pages to markdown.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["web", "data"],
    icon: "https://cdn.simpleicons.org/firecrawl",
    visitorsPerWeek: "92k",
    url: "https://mcp.firecrawl.dev/sse",
  },
  {
    id: "n8n",
    name: "n8n",
    summary: "Workflow automation with 525+ integration nodes.",
    description:
      "Integrates with n8n workflow automation platform to provide conversational access to 525+ nodes including AI-capable ones. Agents can create, trigger, and manage automated workflows.",
    transport: "remote",
    authType: "apikey",
    isOfficial: false,
    category: ["automation", "productivity"],
    icon: "https://cdn.simpleicons.org/n8n",
    visitorsPerWeek: "122k",
    url: "https://mcp.n8n.io/sse",
  },
  {
    id: "vercel",
    name: "Vercel",
    summary: "Deployment management and project operations.",
    description:
      "Manage Vercel deployments, projects, and environments. Agents can deploy, check deployment status, manage environment variables, and view analytics.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["devops", "hosting"],
    icon: "https://cdn.simpleicons.org/vercel/white",
    visitorsPerWeek: "—",
    url: "https://mcp.vercel.com/sse",
  },
  {
    id: "supabase",
    name: "Supabase",
    summary: "Manage databases, projects, migrations, and storage.",
    description:
      "Integrates with the Supabase platform for managing databases, projects, migrations, and storage. Agents can run SQL, manage tables, handle auth, and deploy edge functions.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["database", "backend"],
    icon: "https://cdn.simpleicons.org/supabase",
    visitorsPerWeek: "93k",
    url: "https://mcp.supabase.com/mcp",
  },
  {
    id: "aws-docs",
    name: "AWS Documentation",
    summary: "Search AWS docs and get recommendations.",
    description:
      "Provides tools to access AWS documentation, search for content, and get recommendations. Agents can look up AWS service docs, find best practices, and reference architecture patterns.",
    transport: "remote",
    authType: "open",
    isOfficial: true,
    category: ["cloud", "documentation"],
    icon: "https://cdn.simpleicons.org/amazonwebservices/white",
    visitorsPerWeek: "163k",
    url: "https://mcp.aws.amazon.com/sse",
  },
  {
    id: "gitlab",
    name: "GitLab",
    summary: "Repo management, merge requests, issues, and CI/CD.",
    description:
      "Integrates with GitLab's API to enable repository management, issue tracking, merge request handling, and file operations. Agents can create MRs, review code, and manage pipelines.",
    transport: "remote",
    authType: "apikey",
    isOfficial: false,
    category: ["development", "git"],
    icon: "https://cdn.simpleicons.org/gitlab",
    visitorsPerWeek: "62k",
    url: "https://mcp.gitlab.com/sse",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    summary: "Read-only SQL queries on Postgres databases.",
    description:
      "Access and analyze Postgres databases with read-only queries. Agents can inspect schemas, run SELECT queries, and analyze data without write access.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["database", "data"],
    icon: "https://cdn.simpleicons.org/postgresql",
    visitorsPerWeek: "79k",
    url: "https://mcp.postgres.com/sse",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    summary: "Web and local search via Brave Search API.",
    description:
      "Enables agents to perform web searches and local business searches using the Brave Search API. Good for research tasks, fact-checking, and finding current information.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["search", "web"],
    icon: "https://cdn.simpleicons.org/brave",
    visitorsPerWeek: "—",
    url: "https://mcp.brave.com/sse",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    summary: "AI-powered web search and research.",
    description:
      "Enables agents to perform AI-powered web searches using Perplexity's API. Provides cited answers with sources, good for research-heavy tasks.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["search", "ai"],
    icon: "https://cdn.simpleicons.org/perplexity",
    visitorsPerWeek: "—",
    url: "https://mcp.perplexity.ai/sse",
  },
  {
    id: "tavily",
    name: "Tavily",
    summary: "AI-optimized web search and extraction.",
    description:
      "AI-optimized search API that returns clean, relevant results for agent consumption. Supports search, extract, and crawl operations.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["search", "web"],
    icon: "🔎",
    visitorsPerWeek: "—",
    url: "https://mcp.tavily.com/mcp",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    summary: "Search, read, and manage Google Drive files.",
    description:
      "Enables agents to search, read, and manage files in Google Drive. Supports listing folders, reading document content, and finding files by query.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["productivity", "storage"],
    icon: "https://cdn.simpleicons.org/googledrive/white",
    visitorsPerWeek: "—",
    url: "https://mcp.google.com/sse",
  },
  {
    id: "youtube",
    name: "YouTube",
    summary: "Search videos, get transcripts, and channel data.",
    description:
      "Enables agents to search YouTube videos, retrieve video transcripts, get channel information, and analyze video content.",
    transport: "remote",
    authType: "apikey",
    isOfficial: false,
    category: ["media", "search"],
    icon: "https://cdn.simpleicons.org/youtube",
    visitorsPerWeek: "—",
    url: "https://mcp.youtube.com/sse",
  },
  {
    id: "spotify",
    name: "Spotify",
    summary: "Control playback, search music, manage playlists.",
    description:
      "Enables agents to search for music, control playback, manage playlists, and get recommendations via the Spotify API.",
    transport: "remote",
    authType: "oauth",
    isOfficial: true,
    category: ["media", "entertainment"],
    icon: "https://cdn.simpleicons.org/spotify",
    visitorsPerWeek: "—",
    url: "https://mcp.spotify.com/sse",
  },

  // ── Tier 2: Local MCPs (Native Game Integration Candidates) ──────────

  {
    id: "playwright",
    name: "Playwright",
    summary: "Browser automation — navigate, click, screenshot, fill forms.",
    description:
      "Microsoft's official MCP server for browser automation. Agents can navigate websites, capture page snapshots, interact with elements, take screenshots, and fill forms. The #1 most-visited MCP server on PulseMCP (5.5M weekly visitors).",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["browser", "automation", "development"],
    icon: "https://cdn.simpleicons.org/playwright",
    visitorsPerWeek: "5.5M",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-playwright"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Browser station: render a live browser viewport on the agent's desk monitor. Player watches the agent navigate pages, click elements, and fill forms in real-time.",
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools",
    summary: "Direct Chrome browser control for automation and debugging.",
    description:
      "Google's official MCP server providing direct Chrome browser control through DevTools for web automation, debugging, and performance analysis. Pairs well with Playwright.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["browser", "automation", "development"],
    icon: "https://cdn.simpleicons.org/googlechrome",
    visitorsPerWeek: "2M",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-chrome-devtools"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "DevTools panel: show network requests, console output, and performance graphs on the agent's monitor alongside Playwright.",
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    summary: "Structured problem decomposition with iterative refinement.",
    description:
      "Implements a structured sequential thinking process for breaking down complex problems, iteratively refining ideas, and tracking reasoning steps. Agents can think through multi-step problems methodically.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["reasoning", "ai"],
    icon: "🧠",
    visitorsPerWeek: "195k",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-sequential-thinking"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Thought bubbles: show reasoning steps as thought bubbles above the agent's head as they work through complex problems. Each step appears as a new bubble.",
  },
  {
    id: "knowledge-graph-memory",
    name: "Knowledge Graph Memory",
    summary: "Persistent semantic memory networks for agents.",
    description:
      "Build and query persistent semantic networks for data management. Agents can store entities, relationships, and observations — creating a long-term memory that persists across tasks.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["memory", "ai"],
    icon: "🕸️",
    visitorsPerWeek: "113k",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-memory"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Memory board: a corkboard in the office where agents pin things they've learned. Connected notes show relationships. Persists across tasks and sessions.",
  },
  {
    id: "context7",
    name: "Context7",
    summary: "Up-to-date library and framework documentation.",
    description:
      "Connects to Context7.com's documentation database to provide up-to-date library and framework documentation. Agents can look up API references, find usage examples, and resolve version-specific questions.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["documentation", "development"],
    icon: "📚",
    visitorsPerWeek: "998k",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Reference library: agents look up docs with a bookshelf animation. Doc content appears in a side panel when the agent pulls a 'book'.",
  },
  {
    id: "git",
    name: "Git",
    summary: "Interact with local Git repositories for version control.",
    description:
      "Interact with local Git repositories for version control tasks. Agents can check status, diff, commit, branch, log, and manage repository state.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["development", "git"],
    icon: "https://cdn.simpleicons.org/git/white",
    visitorsPerWeek: "245k",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-git"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Version control station: agents commit work with a visual 'saving' animation. Git log panel shows commit history in the office.",
  },
  {
    id: "storybook",
    name: "Storybook",
    summary: "Write and test UI component stories automatically.",
    description:
      "Help agents automatically write and test stories for your UI components. Agents can generate stories, run visual tests, and verify component behavior.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["testing", "development", "ui"],
    icon: "https://cdn.simpleicons.org/storybook",
    visitorsPerWeek: "1.7M",
    command: "npx",
    args: ["-y", "@storybook/mcp-server"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Testing lab room: a dedicated room where agents write and run stories. Pass/fail results displayed on a screen. Gamify test coverage as a score.",
  },
  {
    id: "browser-use",
    name: "Browser Use",
    summary: "Web data access and extraction via browser-use.com API.",
    description:
      "Enables LLMs, agents, and apps to access, search, and extract web data in real-time using the browser-use.com API. Simpler than Playwright — no local browser needed.",
    transport: "remote",
    authType: "apikey",
    isOfficial: true,
    category: ["browser", "web", "automation"],
    icon: "🌐",
    visitorsPerWeek: "1.1M",
    url: "https://mcp.browser-use.com/sse",
  },
  {
    id: "time",
    name: "Time",
    summary: "Timezone conversion and localized time tools.",
    description:
      "MCP server providing time and timezone conversion tools for AI assistants to handle localized time data and timezone-aware scheduling.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["utility"],
    icon: "🕐",
    visitorsPerWeek: "92k",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-time"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Wall clock: a clock in the office showing the current time. Minor but adds atmosphere and timezone awareness for scheduling agents.",
  },
  {
    id: "filesystem",
    name: "Filesystem",
    summary: "Read, write, and manipulate local files (controlled API).",
    description:
      "Read, write, and manipulate local files through a controlled API. Requires specifying allowed directories. Note: AgentHQ already has built-in file tools — this is for agents that need direct filesystem access outside the workspace sandbox.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["filesystem", "development"],
    icon: "📂",
    visitorsPerWeek: "525k",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-filesystem"],
    envVars: [
      { name: "ALLOWED_DIRS", description: "Comma-separated list of directories the server can access", isRequired: true },
    ],
  },
  {
    id: "fetch",
    name: "Fetch",
    summary: "Retrieve and convert web content to markdown.",
    description:
      "Retrieve and convert web content to markdown for analysis. Note: AgentHQ agents already have a built-in web_fetch tool — this MCP provides a more robust fetching pipeline with better content extraction.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["web", "utility"],
    icon: "📡",
    visitorsPerWeek: "301k",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-fetch"],
  },
  {
    id: "duckdb",
    name: "DuckDB",
    summary: "Execute SQL queries and analyze data in DuckDB.",
    description:
      "Execute SQL queries and analyze data in DuckDB databases. Lightweight, fast analytical database perfect for data analysis tasks.",
    transport: "stdio",
    authType: "open",
    isOfficial: false,
    category: ["database", "data", "analytics"],
    icon: "https://cdn.simpleicons.org/duckdb",
    visitorsPerWeek: "47k",
    command: "npx",
    args: ["-y", "@ktanaka101/mcp-server-duckdb"],
  },
  {
    id: "sqlite",
    name: "SQLite",
    summary: "Query and manage SQLite databases.",
    description:
      "Query and manage SQLite databases. Agents can run SQL, inspect schemas, and manage local database files.",
    transport: "stdio",
    authType: "open",
    isOfficial: true,
    category: ["database", "data"],
    icon: "https://cdn.simpleicons.org/sqlite/white",
    visitorsPerWeek: "—",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-sqlite"],
  },
  {
    id: "memory-bank",
    name: "Memory Bank",
    summary: "Persistent project context and memory for agents.",
    description:
      "A persistent memory system that maintains project context across sessions. Agents can store decisions, track progress, and recall past work — ensuring continuity between tasks.",
    transport: "stdio",
    authType: "open",
    isOfficial: false,
    category: ["memory", "productivity"],
    icon: "🏦",
    visitorsPerWeek: "—",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-memory-bank"],
    nativeIntegration: true,
    nativeIntegrationNote:
      "Memory vault: a visual vault or filing cabinet in the office where agents store and retrieve project context. Shows what the agent 'remembers'.",
  },
  {
    id: "rag",
    name: "RAG",
    summary: "Retrieval-augmented generation over your documents.",
    description:
      "Provides retrieval-augmented generation capabilities, allowing agents to search and reference your document corpus for accurate, context-aware responses.",
    transport: "stdio",
    authType: "open",
    isOfficial: false,
    category: ["ai", "search", "documentation"],
    icon: "📄",
    visitorsPerWeek: "—",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-rag"],
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    summary: "Control smart home devices, automations, and systems.",
    description:
      "Enables natural language control of Home Assistant smart home devices, automations, and system management. Agents can toggle lights, set temperatures, check sensors, and trigger automations.",
    transport: "remote",
    authType: "apikey",
    isOfficial: false,
    category: ["iot", "smart-home"],
    icon: "https://cdn.simpleicons.org/homeassistant",
    visitorsPerWeek: "123k",
    url: "https://mcp.home-assistant.io/sse",
  },
];

// ── Helper functions ───────────────────────────────────────────────────

/** All unique category tags across the catalog. */
export const MCP_CATEGORIES: string[] = [...new Set(MCP_CATALOG.flatMap((s) => s.category))].sort();

/** Search the catalog by text query. */
export function searchCatalog(query: string): MCPCatalogServer[] {
  const q = query.toLowerCase().trim();
  if (!q) return MCP_CATALOG;
  return MCP_CATALOG.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    s.summary.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.category.some((c) => c.toLowerCase().includes(q)),
  );
}

/** Filter the catalog by category. */
export function filterByCategory(category: string): MCPCatalogServer[] {
  return MCP_CATALOG.filter((s) => s.category.includes(category));
}

/** Get a server by ID. */
export function getServerById(id: string): MCPCatalogServer | undefined {
  return MCP_CATALOG.find((s) => s.id === id);
}

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
  return config;
}
