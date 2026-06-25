# Agent HQ — Hermes Integration

Agents don't just sit at desks coding in sandboxed folders. They have **real
external presence** — a Telegram bot, a Discord moderator, a Slack support
agent. You see it working in the office, but it's also out in the world,
responding to messages, running workflows, and being a bot on platforms you
actually use. Agent HQ is the mission control. Hermes is the deployment
runtime.

This builds on the existing provider architecture (`docs/DOCS.md` §6). The
provider layer is already pluggable — Hermes becomes a new provider that
bridges agents to the outside world.

---

## 1. Vision

Right now an Agent HQ agent is a coding agent in a box. It reads files, writes
files, runs commands, and reports back. It's useful, but it's sealed — the
agent can't reach out, can't be reached, and has no life outside its workspace
folder.

Hermes Agent (by Nous Research) is a self-improving AI agent with a built-in
learning loop, a messaging gateway (Telegram, Discord, Slack, WhatsApp, Signal,
Email), MCP tool ecosystem, skills system, and structured persistent memory.
It's designed to *live* on a server and talk to you from wherever you are.

The integration: **Agent HQ hires an agent → a Hermes profile is created → the
agent gets a Telegram/Discord/Slack presence → all external activity flows back
into the office as live events.**

The office becomes a dashboard for a fleet of agents that have real platform
presence. You watch your Code Gremlin answer a Discord support ticket, your
Docs Bard post a summary to Slack, your Pipeline Plumber respond to a Telegram
query — all visible as office activity, all real.

---

## 2. What Hermes Brings

| Feature | What it does | Why Agent HQ wants it |
|---|---|---|
| **Messaging gateway** | Bridges to Telegram, Discord, Slack, WhatsApp, Signal, Email | Agents become real bots on real platforms |
| **Skills system** | Agent creates, updates, and deletes its own `SKILL.md` procedural skills | Agents get better at their job over time — a Bug Whisperer that's fixed 20 similar bugs accumulates debugging skills |
| **Structured memory** | `MEMORY.md` (environment/workflow notes) + `USER.md` (user profile), agent-managed via a `memory` tool | Replaces the "one long conversation" model with curated, capacity-managed memory |
| **Session search** | Agent searches its own past conversations for relevant context | Agents can recall prior work without carrying entire history in context |
| **MCP ecosystem** | Curated catalog of one-click MCP servers (GitHub, Linear, n8n, filesystem, etc.) + per-server tool filtering | Agents get access to external tools — GitHub PRs, Linear issues, n8n workflows |
| **Multi-provider** | 300+ models via Nous Portal, OpenRouter (200+), NVIDIA NIM, HuggingFace, OpenAI, custom endpoints | Agent HQ escapes the Swarms-only lock-in |
| **Cron scheduling** | Time-based task triggers | Agents can do things on a schedule — daily standup, nightly cleanup |
| **Self-improvement loop** | Background review after sessions suggests skill changes and memory updates | Agents evolve without manual intervention |
| **`hermes mcp serve`** | Hermes runs as an MCP server exposing 10 tools (conversations, messages, events, channels) | Agent HQ can poll for external activity and stream it into the office |

---

## 3. The Two-World Model

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Agent HQ Office                              │
│                                                                          │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐                                 │
│   │ Pixel   │  │ Mocha   │  │ Scout   │     You (the boss) watch         │
│   │ @ desk  │  │ @ desk  │  │ @ desk  │     all activity from the        │
│   │ typing  │  │ on phone│  │ idle    │     office scene                  │
│   └────┬────┘  └────┬────┘  └────┬────┘                                 │
│        │            │            │                                       │
│        │  task      │  telegram  │  idle                                 │
│        │  events    │  message   │                                       │
│        ▼            ▼            ▼                                       │
│   ┌─────────────────────────────────────┐                                │
│   │     Agent HQ Server (Node + ws)     │                                │
│   │     HermesProviderRunner            │                                │
│   │     · spawns/manages Hermes procs   │                                │
│   │     · polls hermes mcp serve        │                                │
│   │     · maps events → TaskEvents      │                                │
│   └──────────────┬──────────────────────┘                                │
│                  │                                                       │
└──────────────────┼───────────────────────────────────────────────────────┘
                   │  subprocess / MCP stdio
                   ▼
          ┌─────────────────────┐
          │   Hermes Agent       │
          │   (Python runtime)   │
          │                     │
          │   profile: pixel     │──► Telegram bot @pixel_hq
          │   profile: mocha     │──► Discord bot in #support
          │   profile: scout     │──► Slack bot in #devops
          │                     │
          │   Skills (SKILL.md)  │
          │   Memory (MEMORY.md) │
          │   MCP tools          │
          │   Session search     │
          └─────────────────────┘
```

An agent exists in two places at once:

1. **In the office** — a sprite at a desk, animated based on what it's doing.
   Coding? Typing animation. Got a Telegram message? Phone rings, agent walks
   to a phone desk, responds, walks back. Idle? Wandering or on break.

2. **In the world** — a live bot on a platform. Real messages in, real
   responses out. Someone DMs the agent on Telegram → the agent processes it
   through Hermes → the response is sent → Agent HQ sees the whole exchange in
   the office feed.

---

## 4. Architecture

### New provider: `server/providers/hermes.ts`

Implements the existing `ProviderRunner` interface:

```typescript
type ProviderRunner = (task: string, ctx: RunContext) => AsyncGenerator<TaskEvent>;
```

The Hermes provider bridges Hermes's Python runtime to Agent HQ's TypeScript
event stream:

```typescript
export const runHermes: ProviderRunner = async function* (task, ctx) {
  // 1. Ensure a Hermes profile exists for this agent
  //    hermes profile create <agentId> --no-skills
  //
  // 2. Configure the profile:
  //    - Set model from ctx.model
  //    - Set system prompt from ctx.systemPrompt
  //    - Set working directory to ctx.cwd (the agent's workspace)
  //    - Enable/disable messaging platforms per agent
  //
  // 3. Start the task:
  //    hermes chat --profile <agentId> -q "<task>"
  //    (or for messaging-mode agents: the gateway is already running,
  //     and the "task" is a message that came in from a platform)
  //
  // 4. Stream events back as TaskEvents:
  //    - assistant text → { kind: "text", text }
  //    - tool calls → { kind: "tool", text }
  //    - completion → { kind: "result", text }
  //    - errors → { kind: "error", text }
  //
  // 5. For messaging agents: poll `hermes mcp serve` for external events
  //    and yield them as TaskEvents so they appear in the office feed
};
```

### The event bridge

`hermes mcp serve` exposes an event system that Agent HQ polls:

```
events_poll(after_cursor=0)     → non-blocking, returns new events
events_wait(after_cursor=42)    → blocks up to timeout for next event
```

Event types: `message`, `approval_requested`, `approval_resolved`.

Agent HQ's server runs a background poller per Hermes-connected agent. When
an external event arrives (someone messaged the agent on Telegram), it:

1. Creates a `TaskEvent` with `kind: "text"` and a prefix like `[Telegram]`
2. Broadcasts it to all clients as a log entry
3. Triggers the agent's "phone ring" animation in the office
4. The agent processes the message through Hermes and the response flows back

### Profile lifecycle

```
Hire agent in Agent HQ
    │
    ▼
hermes profile create <agentId> --no-skills
    │  · model = agent.model
    │  · system prompt = composed prompt (name, title, personality, boss)
    │  · working directory = ag/workspace/<slug>-<id>/
    │  · messaging platforms = configured per agent or per role
    │
    ▼
Profile persists across server restarts
    │  · Hermes profiles live in ~/.hermes/profiles/<agentId>/
    │  · Skills and memory survive restarts (they're files on disk)
    │  · Agent HQ's save.json tracks the profile name
    │
    ▼
Fire agent in Agent HQ
    │
    ▼
hermes profile delete <agentId>
    │  · optionally keep the profile for re-hire (like workspace folders)
    │  · or archive it to ag/workspace/ alongside the agent's files
```

---

## 5. Agent Roles with External Presence

### The messaging agent

Hire an agent whose *primary job* is being a platform bot:

- **Role:** `messenger` (new role, or a sub-type of `worker`)
- **Platform:** Telegram, Discord, Slack, etc.
- **Behavior:** The Hermes gateway runs continuously. The agent sits at its
  desk in "standby" — not working on a coding task, but available. When a
  message arrives, the agent's phone rings (animation), it responds, and the
  exchange appears in the office feed.
- **You can still assign coding tasks** — the agent pauses its bot duties,
  does the task, then resumes listening for messages.

### The dual-life agent

A regular coding agent that *also* has a platform presence:

- **Role:** `worker` (existing)
- **Platform:** optional, configured at hire time or later
- **Behavior:** Normal coding agent most of the time. But it's also reachable
  on Telegram — if someone messages it, the office shows the interruption.
  The agent responds in character (its personality carries over), then goes
  back to its coding task.

### The devops agent with MCP tools

- **Role:** `devops` (existing)
- **MCP servers:** GitHub, Linear, Railway (already partially integrated)
- **Behavior:** The agent can manage GitHub PRs, check Linear issues, deploy
  to Railway — all visible as tool calls in the office feed. Hermes's curated
  MCP catalog makes adding new integrations a one-command operation.

---

## 6. Office Visuals for External Activity

External platform events need to feel alive in the office, not just appear as
log lines.

### Phone call animation

When a messaging agent receives an external message:

1. Agent's desk phone sprite flashes (or a phone icon appears above the desk)
2. Agent stands up, walks to a "phone spot" (like break room spots, but near
   the door — "taking a call")
3. Speech bubble shows: `[Telegram] @user: hey, is the deploy done?`
4. Agent responds (typing animation while composing)
5. Speech bubble shows the response
6. Agent walks back to desk, resumes previous state

### Feed integration

External events appear in the office feed with platform tags:

```
[Telegram → Pixel] @user: hey, is the deploy done?
[Pixel → Telegram] @user: Yeah! Just finished. The staging URL is staging.example.com
[Discord → Mocha] #support: getting a 500 on /api/users
[Mocha → Discord] #support: Looking into it — can you share the request ID?
```

### Status indicator

Agents with active platform connections show a small platform icon next to
their name in the HUD:

```
Pixel 📟  (Telegram connected, idle)
Mocha 💬  (Discord connected, on a call)
Scout     (no platform, coding)
```

---

## 7. Skills and Memory (What Agents Learn)

Hermes's self-improvement loop is the other half of the value. Agents don't
just have external presence — they *get better* over time.

### Skills

Each agent accumulates `SKILL.md` files in its workspace:

```
ag/workspace/pixel-a1b2/
  .hermes/skills/
    debug-auth-loop.md        ← "When auth tests fail in a loop, check JWT expiry first"
    deploy-staging.md         ← "Staging deploy: pnpm build → rsync → restart pm2"
    discord-support-template.md  ← "For 500 errors: ask for request ID, check logs, paste stack"
```

Skills load on demand (progressive disclosure) — when a task matches a skill's
keywords, the skill's instructions are injected into context. The agent
created the skill itself, from its own experience.

This makes `tasksDone` meaningful. An agent with 50 completed tasks has 50
learning opportunities. The office economy (`FEATURES.md` — office
economy/scoreboard) gains a skill-based dimension: experienced agents are
genuinely better, not just more decorated.

### Structured memory

Each agent maintains two memory files:

- **`MEMORY.md`** — environment facts, project conventions, tool quirks,
  lessons learned. "Boss prefers concise summaries." "The staging server is
  at 10.0.0.5." "pnpm test takes 40s — don't run it twice."
- **`USER.md`** — profile of the boss (or external users the agent
  interacts with). "Boss name is Alex. Timezone is EST. Likes dry humor."

Memory is injected into the system prompt as a frozen snapshot at session
start, with capacity limits. The agent manages its own memory — adding,
replacing, removing entries to stay within budget. This replaces Agent HQ's
current "one long conversation" memory model with something that scales.

### Session search

Hermes can search past conversations for relevant context. An agent asked to
"fix the auth bug again" can search its history, find the last time it fixed
an auth bug, and recall the approach — without the full conversation history
being in context.

---

## 8. MCP Tool Ecosystem

Agent HQ already has MCP integration for Railway (`server/providers/railway-mcp.ts`).
Hermes expands this dramatically.

### Curated catalog

Hermes ships a one-click MCP catalog:

```
hermes mcp install github      → GitHub repo + PR tools
hermes mcp install linear       → Linear issue/project management
hermes mcp install n8n          → Manage n8n workflows
hermes mcp install filesystem   → Filesystem access
hermes mcp install browser-use  → Cloud browser automation
```

Each MCP server is reviewed by Nous Research. Per-server tool filtering lets
you expose only the tools you want the agent to see.

### How this works in Agent HQ

- **At hire time** or **in settings**, you pick which MCP servers an agent
  can access
- The Hermes profile is configured with those MCP servers
- Tool calls from MCP servers appear in the office feed like any other tool
  call: `[tool] github.create_pr repo=agent-hq title="Fix auth loop"`
- Devops agents get GitHub + Railway. Docs agents get Linear. Messenger
  agents get the messaging bridge + maybe a search MCP.

### Hermes as MCP server

`hermes mcp serve` exposes 10 tools that let *other* MCP clients (Claude
Code, Cursor, or Agent HQ itself) interact with Hermes's messaging bridge:

- `conversations_list`, `conversation_get`, `messages_read`
- `messages_send` (to Telegram/Discord/Slack/etc.)
- `events_poll`, `events_wait` (near-real-time event stream)
- `channels_list`, `permissions_list_open`, `permissions_respond`

Agent HQ's server connects to this as an MCP client — this is the event
bridge that streams external activity into the office.

---

## 9. Data Structures

### New types in `shared/types.ts`

```typescript
/** Extended provider type. */
export type Provider = "cline" | "hermes";

/** Platform connection for an agent. */
export interface PlatformConnection {
  platform: "telegram" | "discord" | "slack" | "whatsapp" | "signal" | "email";
  handle: string;          // bot username, channel ID, etc.
  connectedAt: number;
}

/** Extended AgentInfo for Hermes agents. */
// AgentInfo gains:
//   platforms: PlatformConnection[];   // external presence
//   hermesProfile: string | null;      // Hermes profile name (= agentId)
//   skillsCount: number;               // how many SKILL.md files the agent has

/** External event from a messaging platform. */
export interface PlatformEvent {
  agentId: string;
  platform: string;
  direction: "inbound" | "outbound";
  sender: string;          // username or channel
  text: string;
  timestamp: number;
}

/** Hermes-specific settings. */
export interface HermesSettings {
  hermesHome: string;      // path to ~/.hermes (or custom)
  gatewayEnabled: boolean;  // is the messaging gateway running?
  mcpServers: string[];     // which catalog MCP servers are installed
}
```

### New messages

```typescript
// Client → server
| { type: "connect_platform"; agentId: string; platform: string; handle: string }
| { type: "disconnect_platform"; agentId: string; platform: string }
| { type: "install_mcp"; agentId: string; mcpName: string }
| { type: "set_hermes_settings"; settings: HermesSettings }

// Server → client
| { type: "platform_event"; agentId: string; event: PlatformEvent }
| { type: "platform_connected"; agentId: string; connection: PlatformConnection }
| { type: "platform_disconnected"; agentId: string; platform: string }
| { type: "hermes_settings"; settings: HermesSettings }
| { type: "skills_update"; agentId: string; count: number; skills: string[] }
```

---

## 10. Integration Challenges

| Challenge | Details | Mitigation |
|---|---|---|
| **Language barrier** | Hermes is Python; Agent HQ is TypeScript/Node | Hermes is a CLI app, not a library. Bridge via subprocess + MCP stdio. No Python-in-process. |
| **Process management** | Each Hermes agent is a separate Python process | Agent HQ already manages per-agent state. A `HermesProcessManager` spawns/stops profiles. The gateway is one shared process. |
| **Tool overlap** | Both have file read/write/list and command execution | Hermes tools are authoritative for Hermes agents. The Cline provider stays for Cline agents. No conflict — they're different providers. |
| **Memory model** | Agent HQ's "one long conversation" vs Hermes's structured files | Hermes agents use Hermes memory. Cline agents use Cline memory. The provider abstraction already separates these. |
| **Workspace alignment** | Hermes uses `~/.hermes/`; Agent HQ uses `ag/workspace/` | Hermes profiles are configured with `cwd = ag/workspace/<slug>-<id>/`. Skills and memory live inside the agent's workspace, not in `~/.hermes/`. |
| **Streaming fidelity** | Cline has rich event callbacks; Hermes CLI output is coarser | `hermes mcp serve` provides structured events. For task execution, parse CLI stdout with delimiters. Accept slightly lower fidelity for much broader capability. |
| **Operational complexity** | Running Python + Node + MCP servers | Hermes handles its own dependencies (uv, venv, Python 3.11). Agent HQ just spawns processes. The MCP bridge is stdio — no extra ports. |
| **Gateway process** | The messaging gateway must be always-on for platform agents | Agent HQ server starts/stops the gateway as a managed child process. If it crashes, Agent HQ restarts it. |

---

## 11. Implementation Plan

### Phase 1 — Hermes provider (task execution only)

1. **`server/providers/hermes.ts`** — `ProviderRunner` that spawns
   `hermes chat --profile <agentId> -q "<task>"` and streams stdout as
   `TaskEvent`s
2. **Profile management** — create/delete Hermes profiles on hire/fire,
   configure model + system prompt + working directory
3. **Wire into `manager.ts`** — add `"hermes"` to the provider pick, add
   Hermes models to `SWARMS_MODELS` (or a new `HERMES_MODELS` array)
4. **Memory + skills passthrough** — Hermes handles these natively; Agent HQ
   just needs to not interfere. Skills and memory files land in the agent's
   workspace.
5. **Settings** — `HermesSettings` in `GameSettings`, `hermesHome` path
   configuration

### Phase 2 — Messaging gateway + event bridge

6. **Gateway management** — Agent HQ server starts/stops
   `hermes gateway start` as a child process
7. **`hermes mcp serve` client** — Agent HQ connects to the MCP server,
   polls `events_poll` / `events_wait` for external events
8. **Platform connection** — `connect_platform` / `disconnect_platform`
   messages, configure per-agent platform bindings
9. **Event → TaskEvent mapping** — external messages become `TaskEvent`s
   with platform tags, flow into the office feed
10. **Phone call animation** — `AgentNPC` gets a "phone" state: walk to
    phone spot, speech bubble with `[Platform] sender: message`, respond,
    walk back

### Phase 3 — MCP ecosystem

11. **MCP installation UI** — settings panel for installing catalog MCP
    servers per agent
12. **MCP tool events in feed** — tool calls from MCP servers (GitHub,
    Linear, etc.) appear in the office feed with server tags
13. **Devops agent expansion** — devops agents get GitHub + Railway MCP
    tools by default

### Phase 4 — Skills visibility + polish

14. **Skills panel** — click an agent → see their accumulated skills
    (SKILL.md files), with descriptions and when they were created
15. **Skills in feed** — when an agent creates or updates a skill, post it
    to the feed: `"Pixel learned a new skill: debug-auth-loop"`
16. **Memory viewer** — optional panel to see what the agent remembers
    (MEMORY.md + USER.md contents)
17. **Platform status indicators** — icons in the HUD showing which agents
    are connected to which platforms
18. **Cross-platform personality** — agent personality carries over to
    platform interactions (the Docs Bard writes dramatic Telegram responses)

---

## 12. What Already Exists

| Component | Location | Reuse |
|---|---|---|
| Provider abstraction | `server/providers/types.ts` | `ProviderRunner` interface — Hermes is a new provider |
| Provider wiring | `server/manager.ts:637` | `runner` pick — add `"hermes"` branch |
| MCP integration | `server/providers/railway-mcp.ts` | Pattern for connecting to MCP servers |
| Agent workspace | `ag/workspace/<slug>-<id>/` | Hermes profile `cwd` points here |
| Agent personalities | `server/manager.ts:47` | Carry over to platform interactions |
| Agent status lifecycle | `server/manager.ts:92` | Add "phone call" state for external events |
| Feed/log system | `server/manager.ts` `log()` | Platform events flow through same system |
| `AgentNPC` state machine | `client/src/game/agent.ts` | Add "phone" animation state |
| Break room spots | `client/src/game/agent.ts` | Pattern for phone spot positions |
| HUD agent panels | `client/src/ui/hud.ts` | Add platform status, skills panel |
| Settings modal | `client/src/ui/hud.ts` | Add Hermes settings tab |
| Save/persistence | `server/persistence.ts` | Persist platform connections, Hermes profile names |
| `SWARMS_MODELS` | `shared/types.ts:311` | Add `HERMES_MODELS` alongside |

---

## 13. Future Ideas (Not v1)

- **Agent-to-agent messaging across platforms** — Pixel on Telegram messages
  Mocha on Discord. Cross-platform office communication visible in the game.
- **Platform-specific skills** — an agent that runs a Discord server develops
  moderation skills that only load when Discord messages come in.
- **External task assignment** — message your agent on Telegram to give it a
  task without opening Agent HQ. The office shows the agent receiving the
  task from "external" and getting to work.
- **Platform analytics dashboard** — track messages handled, response times,
  user satisfaction per agent. Turns the office into a real ops dashboard.
- **Multi-agent platform presence** — one Discord bot backed by multiple
  Agent HQ agents. Messages are routed to the agent with the right skills.
- **Agent reputation on platforms** — external users rate interactions. High
  ratings unlock cosmetic upgrades in the office. The game loop extends
  beyond the office walls.
- **Hermes cron integration** — scheduled tasks appear on the office clock.
  At 5pm, all agents do a standup. At midnight, the devops agent runs a
  nightly deploy check. The office has a rhythm.
- **Skill marketplace** — agents publish their best skills to
  `agentskills.io`. Other Agent HQ instances can install them. Your Bug
  Whisperer's debugging skill becomes famous.
- **Platform-driven hiring** — "Hire a Telegram support agent" → Agent HQ
  creates the agent, connects it to Telegram, and it starts working
  immediately. No coding task needed — the platform IS the task.
