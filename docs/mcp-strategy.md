# SpriteHeights MCP Strategy

## Overview

SpriteHeights is a gamified AI agent office — a tile-based multiplayer game where players hire AI agents as NPCs with personalities, moods, and custom appearances. Agents work in a shared workspace, communicate via inboxes, manage a task board, and can be fired into a "Labyrinth."

This document outlines the current MCP (Model Context Protocol) integration, analyzes the [PulseMCP directory](https://www.pulsemcp.com/servers) (22,305 servers), and proposes a strategy for leveraging it as the primary tool/server marketplace.

---

## Current Architecture

### Agent Runtime

- **Server**: `AgentManager` (`server/manager.ts`) orchestrates agents via WebSocket
- **Agent engine**: Cline SDK (`@cline/sdk`) with tool-calling
- **Built-in tools**: `read_files`, `write_files`, `list_files`, `bash`, `search`, `web_fetch`, `editor`, `post_message`, `read_messages`, `read_board`, `claim_card`, `read_events`, `submit_and_exit`
- **Agent roles**: `worker`, `manager`, `devops` (Railway operator)
- **Special NPCs**: Yuki (office manager), Hermes (devops engineer)
- **Persistence**: Save state for agents, world, task board, fired agents
- **Models**: Claude Sonnet 4, Claude 3.7 Sonnet, Claude Opus 4, GPT-4o, GPT-4.1 Mini/Nano, o3-mini, Gemini 1.5 Pro, Tencent Hy3 (free)

### MCP Client Infrastructure

SpriteHeights already has a solid MCP foundation:

#### Generalized MCP Client (`server/providers/mcp-client.ts`)

Supports two transports:

- **stdio** (`StdioMCPClient`): Spawns a child process, communicates via JSON-RPC over stdin/stdout. Used for local MCP servers (e.g. `npx -y @some/mcp-server`).
- **HTTP/SSE** (`HttpMCPClient`): Connects to remote URLs via HTTP POST, handles both plain JSON and Server-Sent Events responses. Used for remote MCP servers (e.g. `https://agent.robinhood.com/mcp/trading`).

Both clients:
- Perform the MCP `initialize` handshake (protocol version `2024-11-05`)
- Discover tools via `tools/list`
- Cache tool definitions
- Wrap tools as Cline `AgentTool` objects with `execute()` functions
- Support 30-second call timeouts
- Are cached globally by URL or command string

#### Railway MCP (`server/providers/railway-mcp.ts`)

A specialized singleton for the Railway CLI:
- Spawns `railway mcp` as a stdio child process
- Discovers and wraps Railway tools
- Used by devops agents (Hermes) when `settings.railway.enabled` is true
- Also provides `queryRailway()` for the client dashboard
- This is essentially a **hardcoded local MCP** — a template for future native integrations

#### MCP Key Management (`server/manager.ts`)

- `mcpKeys: Record<string, string>` — maps server URL to stored credential
- `injectMcpKeys()` — at task time, refreshes expired OAuth tokens and injects auth tokens into `MCPServerConfig`
- OAuth token refresh via `refreshMcpToken()` with 60-second expiry threshold
- Keys are injected as `Bearer` tokens in HTTP headers

#### Marketplace (`server/marketplace.ts` + `client/src/ui/marketplace.ts`)

Supabase-backed store with three item types:
- **Agents** (`swarms_cloud_agents`): Pre-configured agents with system prompts, appearances, and MCP server configs
- **Prompts** (`swarms_cloud_prompts`): Reusable prompt templates
- **Tools** (`swarms_cloud_tools`): Standalone tool listings

Marketplace agents can declare `mcpServers` in their config JSON:
```json
{
  "model": "claude-sonnet-4-20250514",
  "systemPrompt": "You are a trading agent...",
  "appearance": { "skin": 0, "hairStyle": 1, ... },
  "mcpServers": [
    { "url": "https://agent.robinhood.com/mcp/trading", "authType": "oauth" }
  ]
}
```

Auth flow supports:
- **OAuth 2.0 PKCE**: Full flow with callback URL handling
- **API Key**: User pastes a key, stored encrypted server-side

The UI gates the "Hire" button until all declared MCP servers are authenticated.

### Current Flow

```
Marketplace (Supabase) → Browse agents → Agent has mcpServers config
  → User authenticates (OAuth/API key) → Hire → Helicopter delivery animation
    → Agent gets task → makeTools() → loadMCPTools() → tools merged → Cline Agent runs
```

### Key Types

```typescript
// shared/types.ts
interface MCPServerConfig {
  url?: string;           // Remote HTTP/SSE URL
  command?: string;       // Command to spawn for stdio
  args?: string[];        // Arguments for spawned command
  env?: Record<string, string>;  // Environment variables (e.g. API keys)
  headers?: Record<string, string>;  // HTTP headers
  authToken?: string;     // Bearer token
  authType?: "oauth" | "apikey";  // Auth method
  name?: string;          // Human-readable label
}
```

---

## PulseMCP Directory Analysis

[PulseMCP](https://www.pulsemcp.com/servers) lists **22,305 MCP servers** updated daily. The top servers by estimated weekly visitors (sorted by traffic):

### Tier 1: Remote MCPs for the Store

These are HTTP-based, require auth, and connect to external SaaS. They map perfectly to the existing marketplace agent model — an agent ships with an `mcpServers` config, the user authenticates, and the agent gets tools.

| Server | Visitors/wk | Classification | Use Case |
|--------|------------|----------------|----------|
| Playwright | 5.5M | official | Browser automation (also Tier 2 — see below) |
| Chrome DevTools | 2M | official | Browser control, debugging, performance analysis |
| Storybook | 1.7M | official | Write and test UI component stories |
| Browser Use | 1.1M | official | Web data access via browser-use.com API |
| Context7 | 998k | official | Up-to-date library/framework documentation |
| Filesystem | 525k | reference | Local file read/write (redundant with built-in tools) |
| Fetch | 301k | reference | Web content retrieval (redundant with built-in tools) |
| Git | 245k | reference | Local Git repository interaction |
| Sequential Thinking | 195k | reference | Structured problem decomposition |
| Edgar Tools | 191k | community | SEC EDGAR filings |
| Telnyx | 183k | official | Voice/SMS/MMS telecom |
| AWS Documentation | 163k | official | AWS docs search and recommendations |
| Grafana | 140k | official | Dashboard search, Prometheus metrics |
| Home Assistant | 123k | community | Smart home control |
| n8n | 122k | community | Workflow automation (525+ nodes) |
| Notion | 120k | official | Search content, query DBs, manage pages |
| Knowledge Graph Memory | 113k | reference | Persistent semantic memory networks |
| GitHub | 106k | reference | Repos, issues, code search |
| Supabase | 92.5k | official | DB management, migrations, storage |
| FireCrawl | 92.1k | official | Advanced web scraping |
| Time | 92.1k | reference | Timezone conversion |
| Desktop Commander | 87.4k | official | Terminal + filesystem (redundant with built-in tools) |
| Figma | 86.9k | official | Design data extraction from Figma desktop app |
| Agent Device | 86.1k | official | iOS/Android/macOS device automation |
| PostgreSQL | 79.2k | reference | Read-only Postgres queries |
| Stripe | 70.1k | official | Payment processing, customer management |
| Salesforce CLI | 68.9k | official | Org management, SOQL, code deployment |
| Next.js DevTools | 68.4k | official | Next.js runtime diagnostics |
| Linear | 66.1k | official | Project/issue management |
| BigQuery | 65.6k | official | Google Cloud analytics queries |
| HubSpot | 63.4k | official | CRM contacts, companies, deals |
| GitLab | 61.9k | community | Repo management, MRs, issues |
| Office Word | 61.8k | community | Microsoft Word document creation |
| GitMCP | 61.3k | community | Transform GitHub repos into MCP docs |
| XcodeBuild | 59.2k | community | iOS/macOS build and debug |
| MongoDB | 54.2k | official | Database operations |
| Figma Context | 47.5k | community | Figma API design operations |
| DuckDB | 47.3k | community | SQL queries on DuckDB |

**Best candidates for the store** (high utility, broad appeal, remote-capable):

- **Notion** — knowledge workers
- **GitHub** — core dev workflow
- **Linear** — project management (fits task board metaphor)
- **Slack** — messaging (fits inter-agent comms theme)
- **Stripe** — finance agents
- **Gmail** — email automation
- **Google Calendar** — scheduling
- **Google Sheets** — data manipulation
- **Figma** — design data
- **HubSpot** — CRM
- **Salesforce** — enterprise CRM
- **Grafana** — dashboard querying
- **MongoDB** — DB operations
- **BigQuery** — analytics
- **FireCrawl** — web scraping
- **n8n** — workflow automation
- **Vercel** — deployment management
- **Supabase** — DB management (already used by SpriteHeights)
- **AWS Documentation** — infra docs lookup

### Tier 2: Local MCPs for Native Game Integration

These are stdio-based, run locally, and could be integrated directly into the game engine as first-class visual features rather than just agent tools.

#### Playwright Browser Automation (5.5M visitors/wk — #1 on PulseMCP)

**The standout opportunity.**

- Microsoft's official MCP server for browser control
- Navigate websites, capture page snapshots, interact with elements, take screenshots
- **Native integration idea**: A "browser station" in the office. When an agent uses Playwright, a browser viewport appears on their desk monitor. The player can watch the agent navigate pages in real-time — clicking, scrolling, filling forms. Screenshots render as the agent's screen.
- This is a killer visual feature that makes agent work tangible and engaging.

#### Chrome DevTools (2M visitors/wk)

- Google's official browser control via DevTools
- Web automation, debugging, performance analysis
- **Native integration idea**: Pairs with Playwright. Could show a "dev tools" panel — network requests, console output, performance graphs — on the agent's monitor.

#### Sequential Thinking (195k visitors/wk)

- Structured problem decomposition with iterative refinement
- **Native integration idea**: Thought bubbles / reasoning steps visible above the agent's head as they work through complex problems. Each "thinking step" appears as a new thought bubble, creating a visual reasoning chain.

#### Knowledge Graph Memory (113k visitors/wk)

- Persistent semantic memory networks
- **Native integration idea**: A "memory board" in the office where agents pin things they've learned. Persists across tasks. The player can see what each agent remembers. Could be a corkboard UI element with connected notes.

#### Context7 — Documentation Database (998k visitors/wk)

- Upstash's documentation database for libraries and frameworks
- **Native integration idea**: A "reference library" — agents look up docs. Could show a bookshelf animation where the agent pulls a book, reads it, and returns it. The doc content could appear in a side panel.

#### Git (245k visitors/wk)

- Local Git repository interaction
- **Native integration idea**: A "version control station" — agents commit their work, show diffs, manage branches. The player sees a git log panel in the office. Commits could trigger a visual "saving" animation at the agent's desk.

#### Storybook (1.7M visitors/wk)

- Write and test UI component stories
- **Native integration idea**: A "testing lab" room in the office. Agents write and run stories, with pass/fail results shown on a display. Could gamify test coverage as a score.

#### Browser Use (1.1M visitors/wk)

- Web data access via browser-use.com API (no local browser needed)
- **Native integration idea**: Simpler alternative to Playwright for remote deployments. Agent "searches the web" with a visible search animation.

#### Time (92.1k visitors/wk)

- Timezone conversion tools
- **Native integration idea**: A wall clock in the office showing the current time. Minor but adds atmosphere.

### Tier 3: Redundant or Niche (Skip)

These overlap with existing built-in tools or are too niche for broad adoption:

- **Filesystem** — redundant with `read_files`, `write_files`, `list_files`
- **Fetch** — redundant with `web_fetch`
- **Desktop Commander** — redundant with `bash` (bwrap-sandboxed)
- **SAP Fiori / UI5 / SAP CAP** — enterprise SAP niche
- **XcodeBuild** — macOS only, not relevant for a web-based product
- **Telnyx** — telecom niche
- **Edgar Tools** — SEC filings niche
- **WeRead Finance** — niche finance data
- **Home Assistant** — smart home (cool but not core to SpriteHeights)

---

## Strategic Recommendations

### 1. Replace Marketplace with PulseMCP Directory

The current Supabase marketplace (`swarms_cloud_agents`, `swarms_cloud_prompts`, `swarms_cloud_tools`) requires manual curation and has limited inventory. PulseMCP has 22,305 servers updated daily with an API.

**Proposal**: Use PulseMCP as the primary tool/server directory. The "store" becomes a browser for PulseMCP servers. Users pick servers → those get attached to agents.

This shifts the model from "hire a pre-configured agent with tools" to "hire an agent + equip it with MCP servers from the directory."

The existing `MarketplaceBrowser` UI (`client/src/ui/marketplace.ts`) can be adapted — instead of browsing agents from Supabase, it browses MCP servers from PulseMCP. The search, tabs, and card layout already work.

### 2. Remote MCPs = Store Items

Remote HTTP MCPs (Notion, GitHub, Linear, Stripe, etc.) become **store items** the user can browse and "install." When installed, they're available to assign to any agent.

The auth flow already built (OAuth PKCE + API key) handles the connection. The `MCPServerConfig` type already supports `url`, `authToken`, `authType`, `headers`.

**User flow**:
1. Open store → browse PulseMCP servers
2. Click "Install" on a server (e.g. Notion)
3. Authenticate (OAuth or API key)
4. Server appears in the user's "installed tools" inventory
5. Assign to any agent → agent gets those tools on next task

### 3. Local MCPs = Native Game Features

Local stdio MCPs should be **first-class game mechanics**, not just agent tools. The `StdioMCPClient` in `mcp-client.ts` and the Railway MCP pattern in `railway-mcp.ts` provide the technical foundation.

The key difference: local MCPs get **visual game integration** — the player can see the agent using the tool in real-time.

#### Implementation Pattern

```
Local MCP Server (stdio)
  → StdioMCPClient spawns process, discovers tools
    → Tools wrapped as AgentTool objects (existing pattern)
    → BUT ALSO: tool events emit game-state updates
      → Game client renders visual feedback (browser monitor, thought bubbles, etc.)
```

The Railway MCP already does something similar — `queryRailway()` returns structured data for the client dashboard. The same pattern can be extended:

| MCP Server | Game Visual | Data Flow |
|-----------|-------------|-----------|
| Playwright | Browser viewport on agent's desk monitor | Screenshots → canvas render |
| Sequential Thinking | Thought bubbles above agent | Thinking steps → bubble text |
| Knowledge Graph Memory | Memory board (corkboard UI) | Graph nodes → pinned notes |
| Git | Git log panel in office | Commits → log entries |
| Context7 | Bookshelf / reference desk | Doc lookups → book animation |
| Storybook | Testing lab room | Test results → pass/fail display |

### 4. Railway MCP as the Template

The Railway MCP integration is the existing template for native local MCP integration:

- Singleton client (`getRailwayMCP()`)
- Spawns process, JSON-RPC handshake
- Caches tools
- Wraps as `AgentTool` objects
- Also provides structured data for client UI (`queryRailway()`)

Future native integrations (Playwright, Git, etc.) should follow this pattern:
1. Create a dedicated client class (like `RailwayMCPClient`)
2. Spawn the MCP server process
3. Discover and cache tools
4. Wrap as `AgentTool` objects for the agent
5. **Add game-event emission** for visual feedback (new step beyond Railway)
6. Add client-side rendering for the visual

### 5. Phased Rollout

#### Phase 1: PulseMCP as Directory
- Integrate PulseMCP API into the marketplace browser
- Replace Supabase agent queries with PulseMCP server queries
- Keep existing auth flow (OAuth + API key)
- Users browse 22k+ servers instead of curated agents

#### Phase 2: Tool Inventory System
- Decouple MCP servers from agent configs
- Users have an "installed tools" inventory
- Assign tools to any agent (not just marketplace agents)
- Persist installed tools in save state

#### Phase 3: Native Local MCP Integration
- Start with **Playwright** (highest impact, best visual)
- Add browser viewport rendering on agent desk monitors
- Then add Sequential Thinking (thought bubbles)
- Then Knowledge Graph Memory (memory board)
- Then Git (git log panel)

#### Phase 4: Game-Integrated MCP Rooms
- Storybook testing lab room
- Context7 reference library room
- Dedicated "tool rooms" in the office for visual MCP interactions

---

## Technical Notes

### MCPServerConfig (shared/types.ts)

```typescript
interface MCPServerConfig {
  url?: string;           // Remote HTTP/SSE URL
  command?: string;       // Command to spawn for stdio
  args?: string[];        // Arguments for spawned command
  env?: Record<string, string>;  // Environment variables
  headers?: Record<string, string>;  // HTTP headers
  authToken?: string;     // Bearer token
  authType?: "oauth" | "apikey";  // Auth method
  name?: string;          // Human-readable label
}
```

### Tool Loading Flow (server/providers/cline.ts)

```typescript
// makeTools() builds the tool list:
// 1. Built-in tools (read_files, write_files, bash, etc.)
// 2. Shared workspace tools (read_shared, write_shared, list_shared)
// 3. Inter-agent messaging (post_message, read_messages)
// 4. Task board tools (read_board, claim_card)
// 5. Event feed tool (read_events)
// 6. Railway MCP tools (if settings.railway.enabled)
// 7. MCP server tools (if agent has mcpServers config)
```

### Key Files

| File | Purpose |
|------|---------|
| `server/providers/mcp-client.ts` | Generalized MCP client (stdio + HTTP/SSE) |
| `server/providers/railway-mcp.ts` | Railway CLI MCP integration (template for local MCPs) |
| `server/providers/cline.ts` | Agent runtime, tool building, `makeTools()` |
| `server/manager.ts` | Agent orchestration, MCP key injection |
| `server/marketplace.ts` | Supabase marketplace API |
| `server/mcp-oauth.ts` | OAuth PKCE flow for MCP servers |
| `client/src/ui/marketplace.ts` | Marketplace browser UI |
| `client/src/ui/hud.ts` | HUD wiring, `hireFromMarketplace()` |
| `shared/types.ts` | Shared types including `MCPServerConfig` |
| `shared/marketplace.ts` | Marketplace item types |
