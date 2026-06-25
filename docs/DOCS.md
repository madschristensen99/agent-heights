# Agent HQ — Agent Architecture & Logic

Everything agent-related: how agents are structured, how tasks flow through the
system, how memory works, and where every byte of agent data lives.

---

## 1. The big picture

```
                 browser                                node server
┌───────────────────────────────────┐      ┌─────────────────────────────────────┐
│  Phaser scene        DOM HUD      │      │  server/index.ts                    │
│  (sprites, desks,    (roster,     │ ◄──► │   │  routes ClientMsg → manager     │
│   pathfinding)        logs, feed) │  ws  │   ▼                                 │
│        ▲                  ▲       │ 3001 │  server/manager.ts  AgentManager    │
│        └── client/src/store.ts ───┘      │   │  roster, task lifecycle,        │
│            (mirror of state)             │   │  status, logs, persistence      │
└───────────────────────────────────┘      │   ▼                                 │
                                           │  server/providers/cline.ts          │
                                           │   │ async generators of TaskEvents  │
                                           └───┼─────────────────────────────────┘
                                               ▼
                                  @cline/sdk  →  Swarms API
                                               │
                                               ▼
                                     ag/workspace/<slug>-<id>/   (real files)
```

The **server owns all truth**: the roster, every log line, settings, and the
save file. The browser is a view — it renders whatever the server broadcasts
and sends back user intents (`hire`, `assign`, `stop`, `fire`, …). You can
refresh the page, open a second tab, or restart the server; everything
reconstructs from the server snapshot.

---

## 2. What an agent *is*

An agent is three things glued together by one record:

1. **A row in the roster** — `AgentInfo` (defined in `shared/types.ts`):

   | Field | Meaning |
   | --- | --- |
   | `id` | 8-char uuid slice, stable for the agent's lifetime |
   | `name`, `title` | display name + random job title ("Bug Whisperer", …) |
   | `provider` | `"cline"` |
   | `model` | model id passed verbatim to the SDK |
   | `status` | `idle → thinking → working → done / error` (see §4) |
   | `task` | the currently/last assigned task text |
   | `deskIndex` | lowest free integer at hire time; desks 0–7 exist in the map, higher indices work standing (§7) |
   | `sprite`, `accent` | which `char-N.png` sheet + UI accent color |
   | `systemPrompt` | optional standing instructions given at hire time |
   | `sessionId` | **the agent's memory** — provider conversation id (§5) |
   | `tasksDone` | completed-task counter |

2. **A conversation with a model** — one continuous Cline Agent instance with
   message history, resumed for every task (§5).

3. **A folder on disk** — `ag/workspace/<name-slug>-<id>/`, created at hire.
   Every task runs with `cwd` set there; whatever files the agent writes land
   in it. Firing an agent deletes the roster entry but **keeps the folder**.

Server-side, each agent also carries transient runtime state (never sent to
clients): an `AbortController` while a task runs, a capped log buffer
(last 500 entries), and a "done → idle" linger timer.

---

## 3. Lifecycle

### Hire
`hire` message → `AgentManager.hire()`:
- name is trimmed/capped, a random free sprite variant and job title are picked,
  `deskIndex` = lowest unused integer (no cap on hires),
- the workspace folder is created,
- the agent is broadcast to all clients and persisted to the save file.

Client-side, a new NPC spawns at the door and pathfinds (A*, 4-directional,
`client/src/game/path.ts`) to its desk — or its standing spot if the 8 desks
are taken.

### Assign
`assign` (or `assign_all`, which fans out to every non-busy agent after the
huddle broadcast) → `AgentManager.assign()`:
- rejected with a toast if the agent is already `thinking`/`working`,
- `task` is stored, status flips to `thinking`, and `runTask()` starts.

### Run (the core loop, `manager.ts → runTask`)
```
status: thinking ──first event──► working ──finished──► done ──6s──► idle
                                                  └─error──► error ──6s──► idle
```
- The provider runner is chosen by `info.provider` and called with a
  `RunContext`: `{ cwd, model, systemPrompt, abort, settings, sessionId, onSession }`.
- The runner is an **async generator of `TaskEvent`s** —
  `{ kind: "text" | "tool" | "result" | "error", text }`. The manager consumes
  it, converting each event into a log entry (broadcast + persisted).
- The composed system prompt = game identity ("You are {name}, {title}…"),
  the boss's name, the memory note, workspace rules, plus the hire-time
  `systemPrompt` appended as "standing instructions".
- On success `tasksDone++` and status `done`; after 6 s the agent goes `idle`
  (client: pushes back from the desk and wanders).

### Stop / Fire
- `stop` aborts the `AbortController`; the SDK call is cancelled mid-flight and
  status returns to `idle`.
- `fire` aborts, removes the agent from the roster, broadcasts the removal, and
  persists. The workspace folder and the provider-side conversation transcript
  are left on disk.

---

## 4. Status semantics

| Status | Set when | Game world |
| --- | --- | --- |
| `idle` | hire, task finished + 6 s, stop | wanders the office (toggleable in Settings) |
| `thinking` | task assigned, before the first SDK event | walks to desk, types, `…` bubble |
| `working` | first event arrives | types at desk, monitor glows green |
| `done` | run ended without an error event | blue dot, lingers 6 s |
| `error` | run yielded an error event or threw | red dot, lingers 6 s |

The thinking→working flip happens on the *first event of any kind* — it's a
"the model is alive" signal, not a semantic state from the SDK.

---

## 5. Memory — how agents remember

**Mechanism: in-memory message history with session restore.** There is no
custom vector store or summary file; an agent's memory *is* its one long
conversation.

- **Cline** (`server/providers/cline.ts`): each agent gets a persistent
  `AgentRuntime` instance keyed by `agentId`. Messages are stored in an
  in-memory `Map<agentId, AgentMessage[]>`. On every task, the existing
  message history is passed to `agent.restore()` so the model's context
  contains **every previous order and everything the agent said and did**.
  First task: no history → fresh conversation. Every later task resumes the
  same conversation. The `sessionId` on `AgentInfo` tracks the run for
  persistence; on server restart, the message store is rebuilt from the
  saved log entries.

Properties that follow from this design:

- **Broadcast orders are remembered** — `assign_all` calls the same `assign()`
  per agent, so an "everyone do X" lands in each agent's conversation
  identically to a personal order.
- **Memory survives restarts** — `sessionId` lives in `ag/save.json`, and
  message history is persisted in the save file. Restarting the game server
  loses nothing.
- **Memory is per-agent and private.** Agents do not see each other's
  conversations. The only shared channel is the boss relaying things.
- **Stop ≠ amnesia** — an aborted task still happened inside the conversation;
  the next task resumes it.
- **Self-healing**: if a run fails before producing any event *and* the error
  text mentions session/resume/thread, the manager clears `sessionId`, logs
  "Couldn't resume memory — starting a fresh conversation next task", and the
  agent keeps functioning (with reset memory) instead of erroring forever.
- **Fire = permanent memory loss** for the game (the roster entry holding
  `sessionId` is deleted and the in-memory message store is cleared).

What agents do **not** remember: anything that happened in the game outside
their conversation (other agents' work, huddles, your walking around).

---

## 6. Providers — the pluggable runner layer

`server/providers/types.ts` defines the whole contract:

```ts
type ProviderRunner = (task: string, ctx: RunContext) => AsyncGenerator<TaskEvent>;
```

| | Cline |
| --- | --- |
| SDK | `@cline/sdk` `AgentRuntime` via Swarms API |
| System prompt | composed prompt prepended to the first message |
| Tools | `read_files`, `write_files`, `list_files`, `run_commands`, `submit_and_exit` (custom local tools) |
| Permissions | `settings.cline.autoApproveCommands` (auto-approve shell commands or require manual confirmation) |
| Turn cap | `settings.cline.maxIterations` |
| Memory | in-memory message store + `agent.restore()` |
| Abort | `agent.abort()` via `AbortController` |
| Event mapping | `assistant-text-delta` → `text`, `tool-started`/`tool-finished` → `tool`, `run-finished` → `result`, `run-failed` → `error` |

To add a provider: implement the generator, map its native events to
`TaskEvent`s, wire it into the runner pick in `manager.ts`, and add its models
to `shared/types.ts`.

Settings are read **per run** — changing them in the ⚙ SETTINGS modal affects
each agent's *next* task, not one already in flight.

---

## 7. Agents in the game world (client)

`client/src/game/agent.ts` (`AgentNPC`) is a pure *view* of server state — it
never decides anything about tasks; it only animates what the store says.

- **Movement**: A* over a walkability grid derived from the Tiled map's
  `solid` tile property. Agents walk tile-to-tile at 55 px/s; facing is chosen
  by the dominant axis of movement.
- **Desk seating**: desk 0–7 seats come from the Tiled map's object layer
  (`seat-N` points). Agents with `deskIndex ≥ 8` get a standing spot from a
  deterministic list of walkable tiles (every client computes the same list,
  so all browsers agree who stands where).
- **Idle**: wander to random walkable tiles every 2.5–6.5 s (Settings can
  disable wandering).
- **Busy** (`thinking`/`working`): pathfind to the seat, then face up and play
  the typing animation; the desk monitor sprite flips to its glowing frame.
- **Huddle**: on `assign_all` the server broadcasts a `huddle` event *before*
  the assignments. NPCs walk to a ring of tiles around the boss's current
  position, face the boss, and show chat bubbles for 3.2–5 s, then disperse to
  their desks. Pure theater — the SDK runs start immediately.
- **Selection**: click a sprite, or stand within 36 px and press `E`.

---

## 8. Where agent data lives

| Location | Contents | Written by |
| --- | --- | --- |
| `ag/save.json` | **the** save: player, settings, full roster (incl. `sessionId`s), last 500 log entries per agent | `server/persistence.ts`, debounced 400 ms, reloaded on boot |
| `ag/logs/<ISO-time>-<uuid>.json` | append-only transcript of one server session: every hire/assign/status/log/fire/settings event with timestamps | `server/logger.ts`, debounced 300 ms |
| `ag/workspace/<slug>-<id>/` | the agent's real working directory | the agents themselves |
| browser `localStorage` (`agent-hq-player`) | your boss name + workspace (skips onboarding) | the HUD |

**Export**: ⚙ SETTINGS → "EXPORT CHATS & LOGS" downloads
`{ exportedAt, player, settings, agents[], logs{} }` as a single JSON file,
built from the client store (which mirrors the server's save state).

**Restart behavior**: on boot the server reloads `ag/save.json`. Agents that
were mid-task come back `idle` with a "task was interrupted" log line — the
agent process died with the server — but their memory (`sessionId` + saved
messages) is intact, so you can re-assign and they'll remember the
interrupted order was given.

---

## 9. The wire protocol (shared/types.ts)

Client → server: `setup`, `set_settings`, `hire`, `assign`, `assign_all`,
`stop`, `fire`.

Server → client: `snapshot` (full state on connect), `player`, `settings`,
`agent` (upsert), `agent_removed`, `log` (one entry), `huddle`, `toast`.

All messages are JSON over a single WebSocket (`ws://localhost:3001`). The
client buffers outbound messages while disconnected and replays them on
reconnect (exponential backoff, 0.5 s → 8 s).

---

## 10. Security model (read this once)

Agents are real programs with real tool access:

- Agents can run **arbitrary shell commands** inside their workspace folder.
  The workspace folder is a *convention* enforced by prompt (`cwd` +
  instructions), not an OS sandbox. Disable `autoApproveCommands` in Settings
  if you want manual confirmation before each command.
- Treat `ag/workspace/` contents as untrusted output; don't point agents at
  secrets.
