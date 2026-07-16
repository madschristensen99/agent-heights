# Agent Heights — Scaling Roadmap: The System Builds the System

> Agent Heights is not just a product. It's a factory. The HQ HQ is the factory
> floor. The agents are the workers. The product is the platform. Each phase
> of this roadmap is a construction project that the agents undertake, and
> each completed project makes the factory more capable.

---

## 1. The Two-Tier Model

```
┌─────────────────────────────────────────────────────────────┐
│                      HQ HQ (The Platform)                     │
│                                                              │
│  The master Agent Heights instance. Runs on Railway.              │
│  You (the founder) manage agents HERE that build             │
│  and operate the platform itself.                            │
│                                                              │
│  Hermes deploys services. Workers write code.                │
│  This is the "company" that builds the product.              │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Hermes   │  │ Worker:  │  │ Worker:  │                   │
│  │ (devops) │  │ backend  │  │ database │                   │
│  │ deploys  │  │ writes   │  │ writes   │                   │
│  │ services │  │ features │  │ migrations│                  │
│  └──────────┘  └──────────┘  └──────────┘                   │
│       │                                                      │
│       ▼                                                      │
│  Railway: agent-heights-api, agent-heights-redis,                      │
│           agent-heights-worker, agent-heights-db, ...                  │
│                                                              │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ User A's │    │ User B's │    │ User C's │
   │ Private  │    │ Private  │    │ Private  │
   │   HQ     │    │   HQ     │    │   HQ     │
   │          │    │          │    │          │
   │ own      │    │ own      │    │ own      │
   │ agents   │    │ agents   │    │ agents   │
   │ own API  │    │ own API  │    │ own API  │
   │ key      │    │ key      │    │ key      │
   │          │    │          │    │          │
   │ can open │    │ private  │    │ can open │
   │ to guests│    │ (solo)   │    │ to guests│
   └──────────┘    └──────────┘    └──────────┘
```

### HQ HQ

The meta-office. An Agent Heights instance where the "product" being built IS
Agent Heights. The agents there work on the real codebase, deploy to Railway,
manage infrastructure. You're the boss of the HQ HQ.

Hermes is the platform's SRE — it deploys services, scales them, checks
logs, manages variables. Every phase involves Hermes doing infrastructure
work that a human would otherwise do manually.

### Private HQs

What users get when they sign up. Each is a fully isolated Agent Heights office
— their own agents, their own workspaces, their own API key/credits. A
Private HQ starts solo (the current single-player experience) but can
later be opened to guests (multiplayer).

### Key architectural principles

1. **HQ HQ is a special tenant, not a separate codebase.** The HQ HQ is
   just a Private HQ that has been granted "platform admin" role. Its
   agents work on the Agent Heights codebase (their workspace is a clone of the
   repo). Hermes has elevated Railway MCP permissions. The code is the
   same — it's the configuration and permissions that differ.

2. **Private HQs are the default user experience.** When someone signs up,
   they get a Private HQ. It's the current single-player game, but
   multi-tenant. They can hire agents, assign tasks, watch them work. Their
   agents use their API key.

3. **Rooms are an opt-in layer on top of Private HQs.** A Private HQ
   starts as a solo room. The owner can create additional shared rooms and
   invite other users. In a shared room, everyone sees each other's boss
   sprite, can see the shared agents, and can interact based on their role
   (owner / member / guest).

4. **The `ProviderRunner` interface is the abstraction boundary.** Whether
   an agent runs locally (Phase 0–4), on a worker service (Phase 5+), or
   on E2B / Cloudflare (future), the `AgentManager` doesn't change. The
   provider abstraction in `server/providers/types.ts` is the seam that
   lets the system evolve without rewriting the core.

5. **Hermes is the platform operator.** Hermes already exists as a
   permanent devops agent with Railway MCP tools. In this roadmap, Hermes
   becomes the platform's SRE — it deploys services, scales them, checks
   logs, manages variables. Every phase involves Hermes doing
   infrastructure work that a human would otherwise do manually.

---

## 2. Current Architecture (What We're Starting From)

```
Browser (Phaser)  ←──WebSocket──→  Single Node Process  ←──→  Swarms API
                                    ├── In-memory Map<userId, UserSession>
                                    ├── Each session has its own AgentManager
                                    ├── Agent Cline SDK instances in-process
                                    ├── Agent workspaces on LOCAL filesystem
                                    └── Supabase (auth + JSONB blob save)
```

### What works well

- Clean separation: client (view) ↔ server (truth) ↔ providers (execution)
- Pluggable provider layer (`ProviderRunner` interface)
- Per-user auth via Supabase JWT
- Snapshot + delta sync protocol
- Debounced persistence (400ms)
- Hermes + Railway MCP for infrastructure operations
- Manager delegation — managers break goals into subtasks for workers

### Critical bottlenecks

| Area | Problem | Impact |
|---|---|---|
| **Server** | Single process, in-memory state | No horizontal scaling; process death = total state loss |
| **Database** | JSONB blob per user — entire game state in one column | Write amplification (megabytes per log line); no queryability; no concurrency control |
| **Agent execution** | In-process, local filesystem, no isolation | Agents share OS; can read other tenants' files; CPU-bound commands block event loop |
| **WebSocket** | Plain `ws` server, no adapter | No clustering, no cross-server broadcast |
| **Multiplayer** | Does not exist | No rooms, no shared state, no presence, no position sync |
| **Billing** | Single global `SWARMS_API_KEY` | No per-user cost tracking; multiplayer = one person pays for everyone |

---

## 3. Agent Execution Isolation

### The current problem

Agents run shell commands directly on the server's OS
(`server/providers/cline.ts:130`):

```typescript
const { stdout, stderr } = await execFileAsync("bash", ["-c", cmd], { cwd, ... });
```

The only "isolation" is `cwd` being set to the agent's workspace folder. But:

- **No filesystem isolation** — an agent can `cd ..` or `cat /etc/passwd`.
  The `safe()` function tries to prevent path traversal, but `run_commands`
  passes raw shell commands to `bash -c` — the agent can do anything.
- **No process isolation** — agents share the Node process's CPU and memory.
  One agent running `npm install` blocks the event loop for everyone.
- **No network isolation** — agents can make arbitrary network requests.
- **Multi-tenant nightmare** — if two users are on the same server, their
  agents share the same filesystem.

### Isolation levels (from simplest to most robust)

**Level 1: OS-level sandboxing (quick win)**

- Run each agent's shell commands inside a restricted namespace using
  `bubblewrap` (bwrap) or `firejail`.
- No Docker needed — just wrap the `execFile` call.
- Limits filesystem access to the agent's workspace, blocks network by
  default.
- **Pros**: Lightweight, no startup overhead, works on Railway (Linux).
- **Cons**: Not true isolation, still shares kernel.
- **When**: Phase 1 (tenant isolation).

**Level 2: Docker container per agent**

- Each agent gets its own Docker container with its workspace mounted as a
  volume.
- `docker run --rm -v /path/to/workspace:/work agent-image bash -c "cmd"`.
- **Pros**: Real filesystem + process + network isolation.
- **Cons**: Container startup latency (~1–2s per command), needs
  Docker-in-Docker on Railway (tricky), resource overhead per container.
- **When**: Optional intermediate step, or skip to Level 3.

**Level 3: Container per agent session**

- Keep a container running per agent for the duration of a task.
- `docker exec` into it for each command.
- **Pros**: Amortizes startup cost, real isolation.
- **Cons**: Memory overhead per active agent, container lifecycle management.
- **When**: Phase 5 (agent execution workers).

**Level 4: External execution service**

- Don't run agents on the Agent Heights server at all. Offload to:
  - **E2B / Daytona** — cloud sandboxes, sub-second boot, API-based.
  - **Cloudflare Agents** — edge runtime, hibernates when idle.
  - **Railway services** — each agent workspace is a Railway service with a
    persistent volume.
- The `ProviderRunner` interface already abstracts this — implement a new
  provider that sends commands to a remote sandbox instead of local
  `execFile`.
- **Pros**: True horizontal scaling, agents can't touch the server, works
  across multiple Agent Heights instances.
- **Cons**: Network latency, external dependency, cost per sandbox.
- **When**: Phase 5+ (agent execution workers) and beyond.

---

## 4. The Self-Bootstrapping Roadmap

Each phase is built by agents in the HQ HQ. Each phase's output expands
what the HQ HQ agents can do next. The loop compounds.

```
Phase 0: Auth + API Keys
  │  built by: current HQ HQ agents (Hermes + workers on single process)
  │  enables:  multiple users with isolated billing
  ▼
Phase 1: Tenant Isolation
  │  built by: HQ HQ agents (now with auth from Phase 0)
  │  enables:  safe multi-tenant — users can't see each other
  ▼
Phase 2: Relational Database
  │  built by: HQ HQ agents (now with isolation from Phase 1)
  │  enables:  queryable data, no write amplification
  ▼
Phase 3: Redis + Shared State
  │  built by: HQ HQ agents (now with relational DB from Phase 2)
  │  enables:  stateless servers, presence, cross-server events
  ▼
Phase 4: Private HQs + Rooms
  │  built by: HQ HQ agents (now with Redis from Phase 3)
  │  enables:  MULTIPLAYER — people in the same room
  ▼
Phase 5: Agent Execution Workers
  │  built by: HQ HQ agents (now with rooms from Phase 4)
  │  enables:  isolated, scalable agent execution
  ▼
Phase 6: WebSocket Clustering
  │  built by: HQ HQ agents (now with workers from Phase 5)
  │  enables:  thousands of concurrent users
  ▼
Phase 7: Ecosystem + Billing
  │  built by: HQ HQ agents (now at scale from Phase 6)
  │  enables:  revenue, marketplace, network effects
  ▼
  ... continue ...
```

---

### Phase 0 — "The Foundation"

**Built by**: Current HQ HQ agents (Hermes + workers on single process).

**No new infrastructure needed.** Uses the existing single-process Agent Heights
+ Hermes Railway MCP.

#### Tasks

| Agent | Task |
|---|---|
| Hermes | "Deploy a Postgres connection pooler service on Railway. Set up the connection string as an env var on the main service." |
| Worker "auth" | "Write `server/apikeys.ts` — encrypted per-user API key storage in Supabase. Add a `user_api_keys` table. Modify the Cline provider to check for a per-user key before falling back to the global `SWARMS_API_KEY`." |
| Worker "auth" | "Add token refresh to the WebSocket connection. If the JWT expires mid-session, send a `refresh_token` message to the client and close the connection if it's not renewed." |
| Worker "auth" | "Add rate limiting per user — max 10 hires per minute, max 50 assigns per minute. Use a simple in-memory token bucket for now." |

#### What it unlocks

- Multiple users can sign up, each with their own API key.
- The platform can charge for usage (or at least track it).
- HQ HQ agents can now work knowing the auth layer is solid.

#### Auth gaps being filled

The current auth (`server/supabase.ts`) verifies a Supabase JWT on WS
connect but has no:

- **Session expiry / refresh** — the WS connection authenticates once, no
  refresh flow. If the JWT expires mid-session, the connection stays open.
- **Rate limiting** — anyone with a valid token can spam messages.
- **Authorization / roles** — every user is equal. For multiplayer rooms
  you need room owners, admins, guests.
- **Per-user API keys** — `SWARMS_API_KEY` is a single server-wide env var.
  Without per-user keys, multiplayer means one person pays for everyone's
  agent calls.

---

### Phase 1 — "Tenant Isolation"

**Built by**: HQ HQ agents, using Phase 0's auth + API keys.

#### Tasks

| Agent | Task |
|---|---|
| Worker "backend" | "Refactor `server/index.ts` to support tenant isolation. Replace `sessions = Map<userId, UserSession>` with a `TenantManager` that creates an isolated `AgentManager` per user. Each tenant gets its own workspace root: `ag/users/{userId}/workspace/`." |
| Worker "backend" | "Add filesystem isolation. Wrap the `run_commands` tool in `cline.ts` with `bwrap` (bubblewrap) to restrict each agent to its tenant's workspace directory. Block network access by default unless the agent has a devops role." |
| Worker "database" | "Write a Supabase migration that adds `tenant_id` to the `sprite_heights_saves` table. Add RLS policies so users can only access rows where `tenant_id = auth.uid()`. Keep the JSONB blob for now — we'll decompose it in Phase 2." |
| Hermes | "Deploy the updated service to Railway. Verify the bubblewrap sandbox works in the container." |

#### What it unlocks

- True multi-tenant: User A's agents cannot see User B's files or agents.
- The platform is now safe to open to external users.
- Each user's Private HQ is isolated at the filesystem level.

#### Isolation approach

Use `bubblewrap` (bwrap) for Phase 1. It's a single binary, no Docker
needed, works on Linux (which Railway uses). Wrap the `execFile` call:

```bash
bwrap --ro-bind / / --bind <workspace> <workspace> --unshare-net bash -c "cmd"
```

This gives filesystem + network isolation with zero infrastructure changes.

---

### Phase 2 — "Relational Database"

**Built by**: HQ HQ agents, using Phase 0+1.

#### Tasks

| Agent | Task |
|---|---|
| Worker "database" | "Write a Supabase migration that decomposes the JSONB blob into relational tables: `rooms`, `room_players`, `agents`, `agent_logs`, `task_cards`, `world_state`. Write a migration script that reads existing JSONB blobs and inserts rows into the new tables." |
| Worker "backend" | "Write `server/db-relational.ts` — a new `Persistence` implementation that reads/writes individual rows instead of upserting a megabyte blob. Each agent log entry is one INSERT. Each agent status change is one UPDATE. Keep the same `Persistence` interface so `AgentManager` doesn't change." |
| Worker "backend" | "Add log retention — `agent_logs` older than 30 days are archived to a `agent_logs_archive` table (or deleted). Add a cron job that runs nightly." |
| Hermes | "Run the migration on the production Supabase. Deploy the updated service." |

#### Relational schema (target)

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'classic',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE room_players (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- owner | member | guest
  appearance JSONB,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  task TEXT,
  desk_index INTEGER NOT NULL DEFAULT 0,
  sprite INTEGER NOT NULL DEFAULT 0,
  appearance JSONB,
  accent TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'worker',
  session_id TEXT,
  tasks_done INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_logs (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  ts BIGINT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE INDEX idx_agent_logs_agent_id ON agent_logs (agent_id, ts DESC);

CREATE TABLE task_cards (
  id TEXT PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE world_state (
  room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL DEFAULT 0,
  fired_agents JSONB NOT NULL DEFAULT '[]'::jsonb
);
```

#### What it unlocks

- Write amplification solved — a single log line is one row, not a
  megabyte blob.
- Queryable: "list all rooms with free agents", "who's online", "how many
  agents does user X have".
- Foundation for rooms (Phase 4) — the `rooms` table already exists.
- Foundation for marketplace — can query across tenants.

---

### Phase 3 — "Redis + Shared State"

**Built by**: HQ HQ agents, using Phase 0–2.

#### Tasks

| Agent | Task |
|---|---|
| Hermes | "Deploy a Redis service on Railway. Create a service called `agent-heights-redis`. Get the connection URL and set it as an env var on the main service." |
| Worker "backend" | "Write `server/redis.ts` — a Redis client wrapper. Replace the in-memory `sessions` Map with Redis hashes: `tenant:{userId}:agents`, `tenant:{userId}:logs:{agentId}` (Redis lists, capped at 500). Add a Redis pub/sub channel `tenant:{userId}:events` for cross-server broadcast." |
| Worker "backend" | "Refactor `broadcast()` in `server/index.ts` to publish to the Redis pub/sub channel instead of iterating `sess.clients`. Each server instance subscribes to the channels for its connected users and forwards messages to its local WebSockets." |
| Worker "backend" | "Add presence: each WS connection sets a Redis key `presence:{userId}` with a 30s TTL. Heartbeat every 10s to renew. Other servers can check who's online." |
| Hermes | "Deploy the updated service with Redis env vars. Verify pub/sub works across two instances." |

#### Redis key layout

```
# Tenant state
tenant:{userId}:agents        → Hash (agentId → JSON blob)
tenant:{userId}:logs:{agentId} → List (capped at 500 entries)
tenant:{userId}:board         → Hash (cardId → JSON blob)
tenant:{userId}:world         → String (JSON blob)
tenant:{userId}:settings      → String (JSON blob)
tenant:{userId}:player        → String (JSON blob)

# Presence
presence:{userId}             → String (serverId, TTL 30s)

# Pub/sub channels
tenant:{userId}:events        → ServerMsg broadcasts
room:{roomId}:events          → Room-scoped broadcasts (Phase 4)

# Task queue (Phase 5)
task:queue                    → BullMQ queue
task:{taskId}:result          → SSE stream key
```

#### What it unlocks

- Multiple Agent Heights server instances can share state — any server can
  handle any user's connection.
- Presence system (who's online) — prerequisite for multiplayer.
- Pub/sub broadcast — prerequisite for cross-server room events.
- The server is now **stateless** — can be horizontally scaled.

---

### Phase 4 — "Private HQs + Room Model"

**Built by**: HQ HQ agents, using Phase 0–3.

This is the phase that delivers **multiplayer** — the core feature.

#### Tasks

| Agent | Task |
|---|---|
| Worker "backend" | "Implement the Room model. A `Room` belongs to a tenant (the owner). The owner can invite other users as `members` or `guests`. Add `ClientMsg` types: `create_room`, `join_room`, `leave_room`, `invite_to_room`. Add `ServerMsg` types: `room_state`, `player_joined`, `player_left`, `player_moved`." |
| Worker "backend" | "Refactor `UserSession` into `RoomSession`. A `RoomSession` has multiple connected players (each with their own WebSocket), shared agents, shared board. The `broadcast()` sends to all WebSockets in the room, across all servers (via Redis pub/sub)." |
| Worker "client" | "Add player position sync. The boss sprite position is sent to the server on movement (throttled to 10Hz). The server broadcasts `player_moved` messages to other players in the room. Render other human players as sprites with name labels above their heads." |
| Worker "client" | "Add a room browser UI. Users see their Private HQ (solo by default) and can create/join shared rooms. Room codes for inviting friends." |
| Worker "client" | "Add join/leave notifications — toast when a player joins or leaves your room. Show online player count in the HUD." |
| Hermes | "Deploy the updated service. Verify multiplayer works across two browser tabs with different users." |

#### New wire protocol additions

```typescript
// Client → server
| { type: "create_room"; name: string; theme?: OfficeTheme }
| { type: "join_room"; roomId: string }
| { type: "leave_room"; roomId: string }
| { type: "invite_to_room"; roomId: string; userId: string; role: "member" | "guest" }
| { type: "player_move"; x: number; y: number; dir: Dir }

// Server → client
| { type: "room_state"; roomId: string; name: string; players: PlayerPresence[]; agents: AgentInfo[]; board: TaskCard[] }
| { type: "player_joined"; roomId: string; player: PlayerPresence }
| { type: "player_left"; roomId: string; userId: string }
| { type: "player_moved"; roomId: string; userId: string; x: number; y: number; dir: Dir }
```

```typescript
interface PlayerPresence {
  userId: string;
  name: string;
  appearance: CharAppearance | null;
  role: "owner" | "member" | "guest";
  x: number;  // pixel position in office
  y: number;
  dir: "up" | "down" | "left" | "right";
}
```

#### Room roles

| Role | Can hire | Can assign | Can fire | Can invite | Can change settings |
|---|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes | Yes |
| Member | Yes | Yes | No | No | No |
| Guest | No | No | No | No | No |

#### What it unlocks

- **The core feature**: multiple people in the same office, seeing each
  other, sharing agents.
- Private HQs can be opened to guests — the "lot of people in the same
  room" scenario.
- Room owners control who can join, hire, assign, fire.
- Each room's agents use the owner's API key (or split costs — future
  feature).

---

### Phase 5 — "Agent Execution Workers"

**Built by**: HQ HQ agents, using Phase 0–4.

#### Tasks

| Agent | Task |
|---|---|
| Hermes | "Deploy a new Railway service called `agent-heights-worker`. It's a Node process that accepts task requests via HTTP and runs them in isolated sandboxes. Give it its own volume for agent workspaces." |
| Worker "backend" | "Write `server/providers/remote-worker.ts` — a new `ProviderRunner` that sends task requests to the worker service via HTTP instead of running Cline locally. The worker service runs the Cline SDK in a sandboxed process and streams events back via SSE." |
| Worker "backend" | "Write the worker service (`worker/index.ts`). It receives task requests, creates a sandboxed environment (Docker container or bubblewrap namespace), runs the Cline agent, and streams `TaskEvent`s back. Workspaces are stored on the worker's volume, not the API server's filesystem." |
| Worker "backend" | "Add a task queue (BullMQ on Redis). The API server enqueues tasks; workers pull from the queue. This decouples agent execution from the WebSocket server — the API server becomes a thin relay." |
| Hermes | "Scale the worker service to 2 instances on Railway. Verify tasks are distributed across workers." |

#### Architecture after Phase 5

```
                    ┌─────────────────────────┐
                    │   Agent Heights API Server    │
                    │   (stateless, scalable)  │
                    │                          │
                    │  WebSocket ←→ Redis      │
                    │  Auth, rooms, presence   │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────────┐
                    │      Redis               │
                    │  state + pub/sub +       │
                    │  task queue (BullMQ)     │
                    └─────────┬───────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ Worker 1 │       │ Worker 2 │       │ Worker N │
    │          │       │          │       │          │
    │ Cline SDK│       │ Cline SDK│       │ Cline SDK│
    │ sandboxed│       │ sandboxed│       │ sandboxed│
    │ per agent│       │ per agent│       │ per agent│
    └──────────┘       └──────────┘       └──────────┘
         │                  │                  │
         ▼                  ▼                  ▼
    Swarms API         Swarms API         Swarms API
```

#### What it unlocks

- Agent execution is fully isolated — agents run on separate machines,
  can't touch the API server.
- Agent execution scales independently — add more workers as load grows.
- The API server is now truly lightweight — just WebSocket relay + state
  management.
- Agents from different tenants are physically separated.

---

### Phase 6 — "WebSocket Clustering + Load Balancing"

**Built by**: HQ HQ agents, using Phase 0–5.

#### Tasks

| Agent | Task |
|---|---|
| Hermes | "Configure a Railway load balancer / reverse proxy in front of the Agent Heights API service. Enable sticky sessions or verify that stateless operation works without stickiness." |
| Worker "backend" | "Add a health check endpoint to the API server. Add graceful WebSocket disconnect handling — if a server is shutting down, send a `reconnect` message to clients so they reconnect to another instance immediately." |
| Worker "backend" | "Add connection draining — when a server receives SIGTERM, stop accepting new connections, let existing connections finish their current operation, then close." |
| Worker "backend" | "Scale the API service to 3 instances on Railway. Verify that users connected to different instances can be in the same room (via Redis pub/sub)." |
| Hermes | "Set up Railway auto-scaling rules: scale up when CPU > 70%, scale down when CPU < 30%. Set min instances to 2 for HA." |

#### What it unlocks

- Horizontal scaling of the API layer — handle thousands of concurrent
  connections.
- High availability — if one server dies, users reconnect to another.
- The platform can now host many Private HQs and shared rooms
  simultaneously.

---

### Phase 7 — "The Ecosystem"

**Built by**: HQ HQ agents, using Phase 0–6.

#### Tasks

| Agent | Task |
|---|---|
| Worker "marketplace" | "Build the agent marketplace — users can publish their agents (with skills, system prompts, configurations) for others to install. Extend the existing `server/marketplace.ts` and `server/publish.ts`." |
| Worker "marketplace" | "Add skill sharing — agents can publish their `SKILL.md` files to the marketplace. Other users' agents can install them. An agent that's great at debugging can share its skills." |
| Worker "marketplace" | "Add room templates — users can publish their room configuration (office theme, agent roster, task board setup) as a template. Other users can instantiate from a template." |
| Worker "billing" | "Add a credit system — users buy credits, each agent task consumes credits based on model + token usage. Integrate with Stripe. Free tier with monthly credits." |
| Worker "billing" | "Add usage analytics — dashboard showing credits used, tasks completed, agents active. Per-user and per-room breakdowns." |

#### What it unlocks

- Revenue model — the platform can sustain itself.
- Ecosystem — users share agents, skills, room templates.
- Network effects — more users = more shared agents = more value.

---

## 5. The Bootstrapping Loop

Each phase is built by agents who have the tools and infrastructure from
all previous phases. The HQ HQ gets more capable with each phase — more
agents can work in parallel, Hermes has more Railway services to
orchestrate, the database is more queryable, the execution is more
isolated.

### How "the system builds the system" works in practice

**Step 1**: You hire agents in the HQ HQ and assign them tasks to build
the scaling infrastructure. You give a high-level goal, the manager
breaks it down, workers execute in parallel.

**Step 2**: You review their work in the office (watching their logs,
reading their output), then merge their workspace files into the main
codebase.

**Step 3**: Hermes deploys the updated Agent Heights to Railway using the
Railway MCP tools.

**Step 4**: The updated Agent Heights now has new capabilities. You use it to
hire more agents to build the next phase.

### Why this works

- **The agents are real coders** — they use the Cline SDK with file
  read/write/list and shell command tools. They can write TypeScript, run
  `tsc`, run tests, and iterate.
- **Hermes can deploy** — the Railway MCP integration means Hermes can
  create services, set env vars, trigger deployments. You don't need to
  leave Agent Heights to deploy changes.
- **The workspace is the codebase** — if you point an agent's workspace
  at a clone of the Agent Heights repo, they can work directly on the codebase.
- **Manager delegation works** — you give a high-level goal, the manager
  breaks it down, workers execute in parallel.
- **You see everything** — the office feed shows every tool call, every
  file write, every command. You're not blind to what the agents are doing.

### The bootstrapping problem

The catch-22: to have multiplayer Agent Heights, you need to scale Agent Heights,
and to scale Agent Heights, you're using Agent Heights which isn't scaled yet. But
this is fine because:

1. You're a single user (the developer) using Agent Heights to build Agent Heights.
2. The current single-process architecture handles one user fine.
3. Each scaling phase makes the next phase easier to build with more
   agents.
4. By the time you need multiplayer to build multiplayer, you've already
   built the foundation.

---

## 6. Phase Summary

| Phase | What agents build | What it unlocks | New infra |
|---|---|---|---|
| **0** Foundation | Per-user API keys, token refresh, rate limiting | Multi-user billing | None |
| **1** Tenant Isolation | TenantManager, bubblewrap sandboxing, tenant RLS | Safe multi-tenant | None |
| **2** Relational DB | Decompose JSONB → tables, new Persistence impl | Queryable data, no write amplification | None (Supabase already) |
| **3** Redis + Shared State | Redis client, pub/sub broadcast, presence | Stateless servers, cross-server events | Redis service |
| **4** Private HQs + Rooms | Room model, position sync, room browser UI | **MULTIPLAYER** | None |
| **5** Agent Workers | Remote ProviderRunner, worker service, task queue | Isolated, scalable agent execution | Worker service |
| **6** WS Clustering | Health checks, graceful disconnect, auto-scaling | Thousands of concurrent users | Multiple API instances |
| **7** Ecosystem | Marketplace, skill sharing, credits, billing | Revenue, network effects | Stripe integration |

---

## 7. What Already Exists (Reuse Map)

| Component | Location | Role in roadmap |
|---|---|---|
| Provider abstraction | `server/providers/types.ts` | The seam for remote workers (Phase 5) — zero changes to `AgentManager` |
| Railway MCP | `server/providers/railway-mcp.ts` | Hermes deploys all new infrastructure (every phase) |
| Hermes agent | `server/manager.ts:210-234` | Platform SRE — deploys, scales, monitors |
| Manager delegation | `server/manager.ts:793-844` | Break goals into subtasks for parallel worker agents |
| Supabase auth | `server/supabase.ts` | Foundation for Phase 0 — extend with API keys + roles |
| Persistence interface | `server/persistence.ts` | Same interface for relational DB (Phase 2) — `AgentManager` unchanged |
| Snapshot + delta sync | `shared/types.ts:330-355` | Extend with room/presence messages (Phase 4) |
| Agent workspace | `ag/workspace/<slug>-<id>/` | Becomes tenant-scoped (Phase 1), then worker-hosted (Phase 5) |
| Marketplace | `server/marketplace.ts`, `server/publish.ts` | Extended in Phase 7 |
| Dockerfile | `Dockerfile` | Base for worker service image (Phase 5) |

---

## 8. Future Directions (Post-Phase 7)

- **Cloudflare Agents backend** — each Agent Heights agent is backed by a
  Cloudflare Agent that hibernates when idle. Zero cost when nobody's
  talking to the agent. Instant wake when a message arrives. Scales to
  millions of agents across the edge.
- **E2B / Daytona sandboxes** — replace Docker/bubblewrap with cloud
  sandboxes. Sub-second boot, API-based, no Docker-in-Docker needed.
- **Cross-room agent lending** — rent your agents to other users' rooms.
  The agent works in someone else's office but you get credits.
- **Agent reputation** — track success rate, task completion time, user
  ratings. High-reputation agents are worth more in the marketplace.
- **Voice embodiment** — TTS voices for agents that play when you walk
  near them. Spatial audio so voices get louder as you approach. See
  [ElevenLabs Integration](ELEVENLABS_INTEGRATION.md) for the existing
  voice synthesis design.
- **Scheduled tasks** — Hermes cron integration. At 9am, the Linear agent
  does a board sweep. At 5pm, all agents do a standup. The office has a
  rhythm that matches your workday.
