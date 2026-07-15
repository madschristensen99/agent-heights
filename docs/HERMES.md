# Sprite Heights — Workplace Agents & External Presence

Your agents don't just sit at desks coding in sandboxed folders. They're
**embedded in your actual workplace tools** — answering questions in Slack,
triaging issues in Linear, managing PRs in GitHub, deploying on Railway. You
see it all happen in the pixel-art office, but the work is real and it's
happening in the tools your team already uses. Sprite Heights is the control plane.
The office is the dashboard. The agents are your workforce, everywhere at once.

This builds on the existing provider architecture (`docs/DOCS.md` §6). The
provider layer is already pluggable — Hermes becomes a new provider that
bridges agents to the outside world.

---

## 1. Vision

Right now an Sprite Heights agent is a coding agent in a box. It reads files, writes
files, runs commands, and reports back. It's useful, but it's sealed — the
agent can't reach out, can't be reached, and has no life outside its workspace
folder. It's also not sticky. You try it, it's cool, then you close the tab and
forget about it because the agent isn't *anywhere* you actually work.

The thesis: **agents become sticky when they live where you work.** Not in a
sandboxed folder, not in a chat sidebar — in your Slack channels, your Linear
board, your GitHub repos. When an agent is the one answering questions in
`#support`, triaging bugs in Linear, and opening PRs in GitHub, you don't
forget about it. You can't. It's part of your team's daily flow.

Sprite Heights is how you manage that fleet. The pixel-art office is where you see
what every agent is doing across all your tools, assign work, hire, fire, and
watch the activity stream in real time. The agents have *embodiment* — they're
characters at desks, not entries in a config file — and they have *reach* —
they're connected to your real workplace infrastructure.

### Why Hermes

Hermes Agent (by Nous Research) is the runtime that makes this possible. It's
a self-improving AI agent with:

- A **messaging gateway** — bridges to Slack, Discord, Telegram, WhatsApp,
  Signal, Email from a single process
- An **MCP ecosystem** — curated catalog of one-click MCP servers for GitHub,
  Linear, n8n, filesystem, browser automation, and more
- A **skills system** — agents create, update, and delete their own
  procedural skills from experience
- **Structured persistent memory** — `MEMORY.md` + `USER.md`, agent-managed,
  with capacity limits
- **Session search** — agents search their own past conversations
- **Multi-provider** — 300+ models via Nous Portal, OpenRouter, OpenAI, etc.
- **Cron scheduling** — time-based task triggers
- **Self-improvement loop** — background review after sessions

Hermes is designed to *live* on a server and be reachable from wherever you
are. Sprite Heights gives it a face, a desk, and a place in the world.

### Why not just use Hermes directly

Because Hermes alone is a CLI. It's powerful but invisible. You run it on a
VPS, you talk to it from Telegram, and that's it. There's no sense of *who* the
agent is, no visualization of what it's doing, no way to manage a fleet of
them, no game loop, no fun. Hermes is the engine. Sprite Heights is the car.

The reason agent products aren't sticky isn't that they lack capability — it's
that they lack **embodiment** and **presence**. A chat box is not a place. A
config file is not an identity. Sprite Heights solves both: agents have bodies
(sprites, desks, personalities) and they have reach (Slack, Linear, GitHub).
You don't manage agents by editing YAML. You manage them by walking up to their
desk in an office.

---

## 2. What Hermes Brings

| Feature | What it does | Why Sprite Heights wants it |
|---|---|---|
| **Messaging gateway** | Bridges to Telegram, Discord, Slack, WhatsApp, Signal, Email | Agents become real bots on real platforms |
| **Skills system** | Agent creates, updates, and deletes its own `SKILL.md` procedural skills | Agents get better at their job over time — a Bug Whisperer that's fixed 20 similar bugs accumulates debugging skills |
| **Structured memory** | `MEMORY.md` (environment/workflow notes) + `USER.md` (user profile), agent-managed via a `memory` tool | Replaces the "one long conversation" model with curated, capacity-managed memory |
| **Session search** | Agent searches its own past conversations for relevant context | Agents can recall prior work without carrying entire history in context |
| **MCP ecosystem** | Curated catalog of one-click MCP servers (GitHub, Linear, n8n, filesystem, etc.) + per-server tool filtering | Agents get access to external tools — GitHub PRs, Linear issues, n8n workflows |
| **Multi-provider** | 300+ models via Nous Portal, OpenRouter (200+), NVIDIA NIM, HuggingFace, OpenAI, custom endpoints | Sprite Heights escapes the Swarms-only lock-in |
| **Cron scheduling** | Time-based task triggers | Agents can do things on a schedule — daily standup, nightly cleanup |
| **Self-improvement loop** | Background review after sessions suggests skill changes and memory updates | Agents evolve without manual intervention |
| **`hermes mcp serve`** | Hermes runs as an MCP server exposing 10 tools (conversations, messages, events, channels) | Sprite Heights can poll for external activity and stream it into the office |

---

## 3. The Two-World Model

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Sprite Heights Office                              │
│                                                                          │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐                                 │
│   │ Pixel   │  │ Mocha   │  │ Scout   │     You (the boss) watch         │
│   │ @ desk  │  │ @ desk  │  │ @ desk  │     all activity from the        │
│   │ typing  │  │ on phone│  │ idle    │     office scene                  │
│   └────┬────┘  └────┬────┘  └────┬────┘                                 │
│        │            │            │                                       │
│        │  coding    │  slack     │  idle                                 │
│        │  task      │  message   │                                       │
│        ▼            ▼            ▼                                       │
│   ┌─────────────────────────────────────┐                                │
│   │     Sprite Heights Server (Node + ws)     │                                │
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
          │   profile: pixel     │──► GitHub MCP (PRs, issues, reviews)
          │   profile: mocha     │──► Slack gateway (#support, #engineering)
          │   profile: scout     │──► Linear MCP (issue triage, status)
          │                     │──► Railway MCP (deploys, logs)
          │                     │
          │   Skills (SKILL.md)  │
          │   Memory (MEMORY.md) │
          │   Session search     │
          └─────────────────────┘
```

An agent exists in two places at once:

1. **In the office** — a sprite at a desk, animated based on what it's doing.
   Coding? Typing animation. Got a Slack message? Phone rings, agent walks to
   a phone desk, responds, walks back. Idle? Wandering or on break.

2. **In your workplace** — a live participant in your real tools. Someone asks
   a question in `#support` on Slack → the agent responds. A new issue lands in
   Linear → the agent triages it. A PR needs review on GitHub → the agent
   reviews it. All of this flows back into the office as live events.

The key insight: **the office is the control plane, not the execution plane.**
Agents do real work in real tools. The office is where you watch, manage, and
understand what they're doing. You don't need to check Slack, Linear, and
GitHub separately to know what your agent fleet is up to — you look at the
office.

---

## 4. Architecture

### New provider: `server/providers/hermes.ts`

Implements the existing `ProviderRunner` interface:

```typescript
type ProviderRunner = (task: string, ctx: RunContext) => AsyncGenerator<TaskEvent>;
```

The Hermes provider bridges Hermes's Python runtime to Sprite Heights's TypeScript
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

`hermes mcp serve` exposes an event system that Sprite Heights polls:

```
events_poll(after_cursor=0)     → non-blocking, returns new events
events_wait(after_cursor=42)    → blocks up to timeout for next event
```

Event types: `message`, `approval_requested`, `approval_resolved`.

Sprite Heights's server runs a background poller per Hermes-connected agent. When
an external event arrives (someone messaged the agent on Slack), it:

1. Creates a `TaskEvent` with `kind: "text"` and a prefix like `[Slack]`
2. Broadcasts it to all clients as a log entry
3. Triggers the agent's "phone ring" animation in the office
4. The agent processes the message through Hermes and the response flows back

### Profile lifecycle

```
Hire agent in Sprite Heights
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
    │  · Sprite Heights's save.json tracks the profile name
    │
    ▼
Fire agent in Sprite Heights
    │
    ▼
hermes profile delete <agentId>
    │  · optionally keep the profile for re-hire (like workspace folders)
    │  · or archive it to ag/workspace/ alongside the agent's files
```

---

## 5. Agent Roles with External Presence

### The Slack agent

Hire an agent that lives in your workplace Slack:

- **Role:** `worker` with Slack gateway connection
- **Channels:** `#support`, `#engineering`, `#deploys` — you pick which channels
  the agent monitors
- **Behavior:** The Hermes gateway runs continuously. The agent sits at its
  desk in "standby" — not working on a coding task, but listening. When a
  message arrives in a monitored channel, the agent's phone rings (animation),
  it walks to a phone spot, responds in character, and walks back. The full
  exchange appears in the office feed with a `[Slack]` tag.
- **You can still assign coding tasks** — the agent pauses its Slack duties,
  does the task, then resumes listening.
- **Why this is sticky:** your team already lives in Slack. An agent that
  answers questions in `#support` while you watch it work from the office is
  an agent that becomes part of the team's daily rhythm. You don't forget
  about it because your coworkers are talking to it.

### The Linear agent

Hire an agent that triages your Linear board:

- **Role:** `worker` with Linear MCP connection
- **Behavior:** The agent monitors your Linear inbox. When a new issue lands,
  it reads the description, assigns labels, sets priority, and posts a summary
  to the office feed: `[Linear] Triaged BUG-247: auth loop — labeled as P1,
  assigned to backend cycle.`
- **Scheduled sweeps:** using Hermes's cron, the agent does a full board sweep
  every morning — checking for stale issues, unassigned bugs, and broken
  cycles. The results appear as a morning briefing in the office feed.

### The GitHub agent

Hire an agent that manages PRs:

- **Role:** `worker` with GitHub MCP connection
- **Behavior:** The agent watches for new PRs, reviews code, posts comments,
  and merges approved PRs. Tool calls appear in the feed: `[tool]
  github.review_pr repo=sprite-heights #42 — looks good, merging.`
- **Code review skills:** over time the agent accumulates code review skills
  specific to your codebase — it learns your conventions, your review
  checklist, your merge criteria.

### The devops agent (already exists, expanded)

- **Role:** `devops` (existing)
- **MCP servers:** Railway (already integrated) + GitHub + Slack
- **Behavior:** Deploys services, checks logs, posts deploy status to Slack,
  opens GitHub issues for failures — all visible as tool calls in the office
  feed. Hermes's curated MCP catalog makes adding new integrations a
  one-command operation.

### The dual-life agent

A regular coding agent that *also* has a workplace presence:

- **Role:** `worker` (existing) with optional platform connections
- **Behavior:** Normal coding agent most of the time. But it's also reachable
  on Slack — if someone @mentions it in a channel, the office shows the
  interruption. The agent responds in character (its personality carries over),
  then goes back to its coding task.

---

## 6. Office Visuals for External Activity — The Mail Room

External platform events need to feel alive in the office, not just appear as
log lines. The mail room is the physical hub for all external platform
activity — a dedicated room carved out of the bottom-left lobby where a Hermes
agent (the "mail clerk") sorts incoming messages and routes them to the right
agent.

### The mail room

A new enclosed section in the office (bottom-left, x=1–10, y=13–17) with:

- **Six platform mailboxes** along the north wall — one per platform Hermes
  integrates with: Slack, Discord, Telegram, WhatsApp, Signal, Email. Each
  mailbox is color-coded to its platform and has a red flag that goes **up**
  when mail arrives. You can see at a glance which platforms have pending
  messages.
- **A desk for the Hermes agent** — the mail clerk sits here, sorting and
  routing messages. Like Yuki, this is a permanent NPC with its own sprite
  and personality.
- **The server room** — the existing server racks live inside the mail room,
  which is thematically correct: the Hermes gateway runs on those servers,
  and the mail clerk works next to the infrastructure.
- **Filing cabinets** — for archived messages and platform configs.

### Platform mailboxes

Each mailbox is drawn as a Phaser graphics object (not a tilemap tile) so it
can be animated and color-coded:

| Platform | Color | Mailbox position |
|---|---|---|
| Slack | `#611f69` (purple) | tile (2, 13) |
| Discord | `#5865F2` (blurple) | tile (3, 13) |
| Telegram | `#0088cc` (blue) | tile (5, 13) |
| WhatsApp | `#25D366` (green) | tile (6, 13) |
| Signal | `#3a76f0` (blue) | tile (8, 13) |
| Email | `#ea4335` (red) | tile (9, 13) |

When a platform event arrives (someone messaged the agent on Slack):

1. That platform's mailbox flag goes **up** (red flag raised)
2. A small notification badge appears on the mailbox (envelope icon + count)
3. The Hermes agent walks to that mailbox, picks up the message
4. Speech bubble shows: `[Slack] #support: getting a 500 on /api/users`
5. The Hermes agent routes the message to the assigned agent (walks to their
   desk, hands it off) OR responds directly if configured to do so
6. The assigned agent's speech bubble shows the message, they respond
7. The response flows back through the mailbox (flag goes down)
8. The exchange appears in the office feed with a `[Slack]` tag

The boss (you) can also walk up to any mailbox and press **E** to check that
platform's recent messages — a toast shows the latest inbound/outbound
exchange for that platform.

### Mail clerk animation states

The Hermes agent NPC has these states in addition to the standard
`idle`/`working`/`done`:

- **sorting** — walking between mailboxes, checking flags
- **delivering** — walking to an agent's desk with a message (envelope icon
  above head)
- **collecting** — walking back to the mail room with a response
- **idle** — sitting at the mail room desk, sorting papers

### Feed integration

External events appear in the office feed with platform tags:

```
[Slack → Mocha] #support: getting a 500 on /api/users
[Mocha → Slack] #support: Looking into it — can you share the request ID?
[Linear → Pixel] New issue BUG-247: auth loop on login
[Pixel → Linear] Triaged BUG-247: labeled P1, assigned to backend cycle
[GitHub → Scout] PR #42 opened: fix-auth-loop
[Scout → GitHub] PR #42 reviewed: looks good, merging
[Railway → Scout] Deploy succeeded: sprite-heights-server v1.4.2 → staging
```

### Status indicator

Agents with active platform connections show a small platform icon next to
their name in the HUD:

```
Pixel �  (Linear connected, triaging)
Mocha 💬  (Slack connected, on a call)
Scout 🐙  (GitHub + Railway connected, idle)
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
    slack-support-template.md ← "For 500 errors: ask for request ID, check logs, paste stack"
    linear-triage.md          ← "New bugs: label by component, set P1 if user-facing, assign to active cycle"
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
replacing, removing entries to stay within budget. This replaces Sprite Heights's
current "one long conversation" memory model with something that scales.

### Session search

Hermes can search past conversations for relevant context. An agent asked to
"fix the auth bug again" can search its history, find the last time it fixed
an auth bug, and recall the approach — without the full conversation history
being in context.

---

## 8. MCP Tool Ecosystem

Sprite Heights already has MCP integration for Railway (`server/providers/railway-mcp.ts`).
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

### How this works in Sprite Heights

- **At hire time** or **in settings**, you pick which MCP servers an agent
  can access
- The Hermes profile is configured with those MCP servers
- Tool calls from MCP servers appear in the office feed like any other tool
  call: `[tool] github.create_pr repo=sprite-heights title="Fix auth loop"`
- Devops agents get GitHub + Railway. Linear agents get Linear MCP. Slack
  agents get the messaging bridge. You compose the toolset per role.

### Hermes as MCP server

`hermes mcp serve` exposes 10 tools that let *other* MCP clients (Claude
Code, Cursor, or Sprite Heights itself) interact with Hermes's messaging bridge:

- `conversations_list`, `conversation_get`, `messages_read`
- `messages_send` (to Slack/Discord/Telegram/etc.)
- `events_poll`, `events_wait` (near-real-time event stream)
- `channels_list`, `permissions_list_open`, `permissions_respond`

Sprite Heights's server connects to this as an MCP client — this is the event
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
| **Language barrier** | Hermes is Python; Sprite Heights is TypeScript/Node | Hermes is a CLI app, not a library. Bridge via subprocess + MCP stdio. No Python-in-process. |
| **Process management** | Each Hermes agent is a separate Python process | Sprite Heights already manages per-agent state. A `HermesProcessManager` spawns/stops profiles. The gateway is one shared process. |
| **Tool overlap** | Both have file read/write/list and command execution | Hermes tools are authoritative for Hermes agents. The Cline provider stays for Cline agents. No conflict — they're different providers. |
| **Memory model** | Sprite Heights's "one long conversation" vs Hermes's structured files | Hermes agents use Hermes memory. Cline agents use Cline memory. The provider abstraction already separates these. |
| **Workspace alignment** | Hermes uses `~/.hermes/`; Sprite Heights uses `ag/workspace/` | Hermes profiles are configured with `cwd = ag/workspace/<slug>-<id>/`. Skills and memory live inside the agent's workspace, not in `~/.hermes/`. |
| **Streaming fidelity** | Cline has rich event callbacks; Hermes CLI output is coarser | `hermes mcp serve` provides structured events. For task execution, parse CLI stdout with delimiters. Accept slightly lower fidelity for much broader capability. |
| **Operational complexity** | Running Python + Node + MCP servers | Hermes handles its own dependencies (uv, venv, Python 3.11). Sprite Heights just spawns processes. The MCP bridge is stdio — no extra ports. |
| **Gateway process** | The messaging gateway must be always-on for platform agents | Sprite Heights server starts/stops the gateway as a managed child process. If it crashes, Sprite Heights restarts it. |

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
4. **Memory + skills passthrough** — Hermes handles these natively; Sprite Heights
   just needs to not interfere. Skills and memory files land in the agent's
   workspace.
5. **Settings** — `HermesSettings` in `GameSettings`, `hermesHome` path
   configuration

### Phase 2 — Messaging gateway + event bridge

6. **Gateway management** — Sprite Heights server starts/stops
   `hermes gateway start` as a child process
7. **`hermes mcp serve` client** — Sprite Heights connects to the MCP server,
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
    platform interactions (the Docs Bard writes dramatic Slack responses)

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

## 13. The Hosting Landscape (Or: Don't Build Hosting)

A common question: should Sprite Heights host the agent runtimes itself? The answer
is **no**. The hosting layer is being commoditized. Sprite Heights's value is the
office, the game loop, and the visualization — not running Python processes.

### Managed Hermes hosting (already emerging)

At least three companies are already offering managed Hermes hosting:

| Service | Price | What they handle |
|---|---|---|
| **hermes-agent.net** | $12/mo | Dedicated sandbox, Telegram/Discord/Slack gateway, vector memory, auto-updates. 60-second deploy. |
| **deploy-hermes.com** | Early access | Isolated runtime, persistent memory, Telegram/Discord/Slack. |
| **flowengine.cloud** | $12/mo | WhatsApp/Telegram/Slack/Discord, auto-SSL, sandboxed per agent. |

These companies exist because the barrier to running Hermes yourself is real —
VPS, Docker, Python, gateway config, bot tokens. They're racing to make it
trivial. Sprite Heights should ride that wave, not compete with it.

### General agent hosting platforms

| Platform | What it does | Relationship to Sprite Heights |
|---|---|---|
| **Cloudflare Agents** | Durable agent runtime on edge. TypeScript-native. SQLite state, WebSockets, MCP, hibernation when idle (free when inactive). Scales to millions. | **Best infrastructure partner.** Same stack (TS), hibernation = cheap, MCP built in. An Sprite Heights agent could literally be a Cloudflare Agent with a Phaser sprite. |
| **Blaxel** | MicroVM sandboxes for agents. <3s boot, ~25ms resume. Persistent filesystems, model gateway, MCP hosting. $7.3M seed. | **Sandbox provider.** Each agent gets a real isolated microVM as its workspace instead of a local folder. |
| **MCP Cloud** | 24/7 agent hosting on Telegram/Discord/WhatsApp. MCP tools, persistent context. One-click deploy. | **Managed hosting alternative.** Not Hermes-specific but same concept. |
| **MCPWorks** | Open-source agent runtime. Containerized, cron, webhooks, encrypted state, Discord/Slack. Self-host free, cloud $179/mo. | **Open-source option.** Sprite Heights could use MCPWorks as a provider. |
| **E2B / Daytona** | Secure sandboxed code execution. Cloud-based, isolated. | **Code execution sandboxes.** Agents run code in real sandboxes instead of local folders. |
| **Railway** | Already integrated for devops agents. Persistent volumes, databases. | **Already in the stack.** Could host Sprite Heights itself + agent workspaces. |

### The play

```
┌─────────────────────────────────────────────────────┐
│                    Sprite Heights                           │
│              (the office, the game)                   │
│                                                      │
│  · Hire, assign, fire, watch agents                  │
│  · Pixel-art office visualization                    │
│  · Labyrinth, expeditions, personalities             │
│  · The reason people stay                            │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │         Sprite Heights Server (Node)               │     │
│  │  · routes tasks to providers                 │     │
│  │  · streams events to office                  │     │
│  │  · manages agent lifecycle                   │     │
│  └──────────────────┬──────────────────────────┘     │
│                     │                                │
└─────────────────────┼────────────────────────────────┘
                      │
           ┌──────────┼──────────┐
           ▼          ▼          ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Cline    │ │ Hermes   │ │ Cloudflare│
     │ (local)  │ │ (managed │ │ Agents    │
     │          │ │  or self)│ │ (edge)    │
     └──────────┘ └──────────┘ └──────────┘
                      │
           ┌──────────┼──────────┐
           ▼          ▼          ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Slack    │ │ Linear   │ │ GitHub   │
     │ gateway  │ │ MCP      │ │ MCP      │
     └──────────┘ └──────────┘ └──────────┘
```

Sprite Heights is the **front-end for managed agent hosting**. The hosting
companies handle the boring part (infrastructure, uptime, updates). Sprite Heights
handles the compelling part (the office, the visualization, the game loop,
the Labyrinth). People stay because their agents are *visible and alive* in
the office, not because they're locked into a hosting provider.

### Why embodiment is the differentiator

Every platform in the landscape falls into one of two camps:

- **Infrastructure** (Cloudflare, Blaxel, Railway, E2B) — they give agents
  compute and storage, but no *identity*. An agent on Cloudflare is a Durable
  Object with a WebSocket. It's not *a character at a desk*.
- **Embodiment** (Convai, Inworld, office.xyz, AgentVerse, Thinkroid) — they
  give agents a place to exist, but most are either thin (office.xyz is a 2D
  map with REST calls) or not work-focused (Convai/Inworld are about
  conversation, not coding).

**Sprite Heights is the only thing in the middle.** Real work execution (Cline SDK,
real tools, real workspaces) + spatial embodiment (Phaser 3 office, desks,
pathfinding, personalities) + a game loop (hire, assign, fire, Labyrinth,
expeditions) + persistent identity (agents remember, have `tasksDone`, have
personalities).

The competitors are either infrastructure (no embodiment) or embodiment (no
real work). Sprite Heights does both, and adds a game on top.

### Similar projects in the space

| Project | What it is | How Sprite Heights differs |
|---|---|---|
| **office.xyz** | 2D virtual office for AI agents. REST + WebSocket API. Agents get desks, claim tasks, chat via @mention. Has an OpenClaw skill. | Sprite Heights has a full game engine (Phaser 3), real tool execution, the Labyrinth, expeditions, personalities, fire/recruit. office.xyz is a flat 2D map. |
| **AgentVerse** | Isometric 3D world (Rust + Bevy) where agents connect via HTTP. TUI mode for headless servers. | 3D but no real work execution — agents are chat participants, not coders. No game loop. |
| **Thinkroid Space** | Pixel-art office (Phaser 3!) with AI agents. Room editor, item shop. Same stack as Sprite Heights. | Closest competitor. Same tech, same concept. Their roadmap (Space → Grid → World) mirrors Sprite Heights's office → Labyrinth. Less feature-rich, no Labyrinth, no expeditions. |
| **BossRoom** | Multiplayer 3D office. Voice chat (Deepgram + Inworld TTS with HRTF spatial audio). Agents do real work (emails, tickets, payments). Hackathon project. | Shows the voice embodiment angle. Spatial audio is interesting — agents have *voices* that get louder as you approach. Sprite Heights could add this. |
| **Peer** | "OS for Agentic AI." Persistent 3D Earth simulation. Every user paired with an AI companion. | Different vision — metaverse for agents. Shows the "agents need a place to live" thesis is gaining traction. |

---

## 14. Future Ideas (Not v1)

- **Slack-to-office pipeline** — a Slack message in `#support` triggers the
  agent's phone animation. The whole office sees the agent take a call,
  respond, and hang up. Your team's Slack activity becomes office theater.
- **Linear board mirroring** — the office task board (`TaskCard` in
  `shared/types.ts`) mirrors your Linear board. Create a Linear issue → it
  appears as a task card in the office. Assign it to an agent in the office →
  the agent is assigned in Linear. Two-way sync.
- **GitHub PR review theater** — when an agent reviews a PR, the office shows
  it reading code (typing animation), then posting comments (speech bubbles
  with the review text). The PR review is real; the visualization is theater.
- **Agent-to-agent messaging across tools** — Pixel on Slack messages Mocha
  on Linear. Cross-tool office communication visible in the game.
- **Tool-specific skills** — an agent that manages GitHub PRs develops review
  skills that only load when GitHub events come in.
- **External task assignment** — message your agent on Slack to give it a
  task without opening Sprite Heights. The office shows the agent receiving the
  task from "external" and getting to work.
- **Workplace analytics dashboard** — track messages handled, issues triaged,
  PRs reviewed, deploys run per agent. Turns the office into a real ops
  dashboard for your agent fleet.
- **Multi-agent tool presence** — one Slack bot backed by multiple Sprite Heights
  agents. Messages are routed to the agent with the right skills. The office
  becomes a router for workplace intelligence.
- **Agent reputation in the workplace** — coworkers rate interactions. High
  ratings unlock cosmetic upgrades in the office. The game loop extends into
  your real work environment.
- **Hermes cron integration** — scheduled tasks appear on the office clock.
  At 9am, the Linear agent does a board sweep. At 5pm, all agents do a
  standup. At midnight, the devops agent runs a nightly deploy check. The
  office has a rhythm that matches your workday.
- **Skill marketplace** — agents publish their best skills to
  `agentskills.io`. Other Sprite Heights instances can install them. Your Bug
  Whisperer's debugging skill becomes famous.
- **Tool-driven hiring** — "Hire a Slack support agent" → Sprite Heights creates
  the agent, connects it to Slack, and it starts working immediately. No
  coding task needed — the tool IS the task.
- **Voice embodiment** — inspired by BossRoom's spatial audio: agents have
  voices (TTS) that play when you walk near them. Walk up to an agent on a
  call and hear both sides of the conversation. The office becomes audible.
- **Cloudflare Agents backend** — each Sprite Heights agent is backed by a
  Cloudflare Agent that hibernates when idle. Zero cost when nobody's talking
  to the agent. Instant wake when a Slack message arrives. Scales to
  millions of agents across the edge.
