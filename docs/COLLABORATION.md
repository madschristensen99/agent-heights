# Agent HQ — Cross-Agent Collaboration & World-Awareness

The agents today are **capable but blind**. The `@cline/sdk` loop gives them
real iterative tool-calling power — they can read, write, and execute. But
they work in isolated bubbles with no awareness of each other or the shared
project state. This doc maps the gaps, identifies what the SDK already
provides for free, and proposes a prioritized path to genuine collaboration.

---

## 1. What Exists Today

### Collaboration (bare minimum)

- **Manager delegation** (`server/manager.ts`) — Manager gets a roster of
  free workers + a goal, responds with JSON subtask array, `delegate()`
  parses and assigns. This is task *splitting*, not collaboration.
- **Sequential handoffs** — Agent A finishes, result text forwarded to
  Agent B with read-only reference to A's workspace. One-directional,
  one-shot, no back-and-forth.

### Agent capabilities (what's wired up)

- **5 hand-rolled tools**: `read_files`, `write_files`, `list_files`,
  `run_commands`, `submit_and_exit` (`server/providers/cline.ts`)
- **Railway MCP tools** for devops agents only (dynamic discovery via
  JSON-RPC stdio)
- **Persistent conversation memory** via `@cline/sdk` Agent instances +
  `messageStore`
- **Sandboxed workspaces** — each agent gets `workspace/{slug}-{id}/` with
  path traversal protection on file tools (but NOT on `run_commands` —
  `bash -c` can escape)

### What the SDK ships with (but Agent HQ doesn't use)

`@cline/sdk` (via `@cline/core`) exports `createBuiltinTools()` and
`createDefaultToolsWithPreset()` — a full toolset with working Node.js
executors that Agent HQ completely ignores. The current `cline.ts`
hand-rolls 5 tools from scratch and leaves the rest on the shelf.

**Built-in tools available in the SDK:**

| Tool | SDK name | Agent HQ status | What it does |
|---|---|---|---|
| `read_files` | `DefaultToolNames.READ_FILES` | ✅ Hand-rolled (reimplements built-in) | Read file contents with line ranges |
| `run_commands` | `DefaultToolNames.RUN_COMMANDS` | ✅ Hand-rolled (reimplements built-in) | Execute shell commands |
| `submit_and_exit` | `DefaultToolNames.SUBMIT_AND_EXIT` | ✅ Hand-rolled (reimplements built-in) | Signal task completion |
| `search_codebase` | `DefaultToolNames.SEARCH_CODEBASE` | ❌ Not wired up | Grep/ripgrep across the workspace — agents can't search file contents |
| `fetch_web_content` | `DefaultToolNames.FETCH_WEB_CONTENT` | ❌ Not wired up | Fetch URLs and extract content — agents can't access the web |
| `editor` | `DefaultToolNames.EDITOR` | ❌ Not wired up | Surgical file editing (old_text → new_text) — agents do full-file overwrites only |
| `apply_patch` | `DefaultToolNames.APPLY_PATCH` | ❌ Not wired up | Apply unified diffs — no patch capability |
| `ask_question` | `DefaultToolNames.ASK` | ❌ Not wired up | Ask the user a clarifying question with options |
| `skills` | `DefaultToolNames.SKILLS` | ❌ Not wired up | Load/save procedural skill files (SKILL.md) |

**Built-in tool presets** (`ToolPresets`):

| Preset | Tools enabled |
|---|---|
| `act` | read_files, search, bash, web_fetch, editor, skills, ask, spawn_agent, agent_teams |
| `plan` | read_files, search, bash, web_fetch, skills, ask, spawn_agent, agent_teams |
| `search` | read_files, search, spawn_agent, agent_teams |
| `minimal` | bash, spawn_agent |
| `yolo` | read_files, bash, editor, submit_and_exit |

**Built-in team tools** (`TEAM_TOOL_NAMES`) — the SDK has a full
multi-agent coordination system:

| Tool | What it does |
|---|---|
| `team_spawn_teammate` | Create a new sub-agent within a team |
| `team_shutdown_teammate` | Remove a teammate |
| `team_status` | Check status of all teammates |
| `team_task` / `team_run_task` | Assign and run a task on a teammate |
| `team_cancel_run` | Cancel a running task |
| `team_list_runs` / `team_await_runs` | List and wait for task completions |
| `team_send_message` | Send a message to a specific teammate |
| `team_broadcast` | Send a message to all teammates |
| `team_read_mailbox` | Read incoming messages |
| `team_mission_log` | Log a mission event |
| `team_create_outcome` / `team_finalize_outcome` | Track structured outcomes |
| `team_attach_outcome_fragment` / `team_review_outcome_fragment` | Attach and review outcome pieces |

This is a complete inter-agent communication and coordination layer —
message passing, task delegation, progress tracking, outcome management —
that Agent HQ reimplements poorly with JSON-plan parsing and one-shot
handoffs.

### What the docs envision (but isn't built)

- **EXPEDITIONS.md** — Agents plan together, pool resources, build robots,
  react to outcomes. Detailed design doc with zero implementation.
- **SCALING.md** — 7-phase roadmap from auth to ecosystem.
  Infrastructure-focused. Doesn't address agent intelligence or
  collaboration primitives.
- **HERMES.md** — Designs a second provider (`hermes`) with messaging
  gateway, MCP ecosystem, skills, and structured memory. Unbuilt.

---

## 2. The Gaps

Some gaps are Agent HQ-specific (prompt layer, shared workspace, office
context). Others exist only because Agent HQ doesn't wire up tools the
SDK already ships. Each gap below is tagged:

- **[SDK]** — the SDK already provides this; we just need to wire it up
- **[CUSTOM]** — Agent HQ-specific; we need to build it ourselves
- **[HYBRID]** — the SDK provides primitives, but Agent HQ needs to
  bridge them to the office model

### 2.1 No Inter-Agent Communication Channel [HYBRID]

Agents can't talk to each other. At all. The only "collaboration" is the
boss (user) manually chaining handoffs. If Agent A discovers a problem
that Agent B should know about, there's no mechanism to communicate that.

**What the SDK provides:**

- `team_send_message(teammate, text)` — direct message to a teammate
- `team_broadcast(text)` — message all teammates
- `team_read_mailbox()` — read incoming messages
- `team_status()` — see who's on the team and what they're doing

**What Agent HQ needs to bridge:**

The SDK's team tools operate within a single `Agent` instance's team
context (spawned teammates). Agent HQ's agents are independent processes
with separate `Agent` instances. We need to either:

1. **Adopt the SDK's team model** — make the manager agent a "team lead"
   that spawns workers as teammates via `team_spawn_teammate`, getting
   the full messaging/coordination stack for free. This would replace
   the current `delegate()` + `completeHandoff()` machinery.
2. **Bridge the SDK's mailbox to the filesystem** — if agents stay as
   independent instances, implement a custom `post_message` /
   `read_messages` pair that writes to `workspace/{recipient-id}/inbox.jsonl`
   and injects messages into the next task prompt.

Option 1 is cleaner but requires restructuring how agents are spawned.
Option 2 is more incremental but reimplements what the SDK already does.

### 2.2 No Shared Workspace or Shared State [CUSTOM]

Each agent works in total isolation at `workspace/{slug}-{id}/`. The
handoff mechanism gives read-only access to another agent's workspace,
but:

- The receiving agent doesn't know what files exist there (no `list_files`
  on other workspaces)
- There's no shared project directory where multiple agents contribute
- No conflict detection if two agents write to the same logical file

**What's needed (custom — the SDK doesn't provide this):**

- A **shared project workspace** — `workspace/shared/` or
  `workspace/project-{id}/` that multiple agents can read/write to, with
  file locking or conflict markers.
- A **workspace mounting tool** — let agents browse/read other agents'
  workspaces by name, not just the one handed off to them.
- A **diff/merge awareness** — if Agent A and Agent B both modify
  `shared/main.ts`, the system should flag conflicts before completion.

### 2.3 No World Awareness in Agent Prompts [CUSTOM]

The system prompt (`server/manager.ts → buildSystemPrompt()`) is minimal:

```
You are {name}, job title "{title}", an agent employed in Agent HQ.
{personality}
Stay in character.
Your boss is {bossName}. This is one ongoing conversation.
Work only inside your workspace directory. Be effective and concise.
When you finish, summarize what you did.
```

Agents have **zero awareness** of:

- Who else is in the office
- What the task board says
- What other agents are working on
- What happened in previous tasks by other agents
- The state of the shared project
- Game world events (expeditions, fired agents, etc.)

**What's needed (custom — the SDK has no concept of "the office"):**

- **Context injection** — Before each task, inject a brief office state
  summary into the prompt: who's working on what, what's on the task
  board, what the shared project status is.
- **Agent-visible task board** — A tool like `read_board()` that lets
  agents see what cards exist and their status. Agents could pick up
  cards themselves.
- **Event feed injection** — Recent significant events (agent completed
  task X, agent Y encountered error Z) summarized and injected as
  context.
- **Self-assign capability** — Agents could pull tasks from the board
  themselves when idle, rather than waiting for the boss to assign.

### 2.4 No Coordination Protocol [HYBRID]

When a manager delegates, it's fire-and-forget. The subtasks run in
parallel with:

- No dependency tracking (subtask B might need subtask A's output)
- No progress awareness (manager doesn't know when subtasks finish)
- No error cascading (if subtask A fails, subtask B still runs blindly)
- No re-planning (if a worker gets stuck, the manager doesn't adapt)

**What the SDK provides:**

- `team_run_task(teammate, task)` + `team_await_runs()` — assign and wait
  for completion with proper async coordination
- `team_list_runs()` — check progress of running tasks
- `team_cancel_run()` — cancel a running task
- `team_create_outcome` / `team_finalize_outcome` — track structured
  deliverables and their completion status
- `team_attach_outcome_fragment` / `team_review_outcome_fragment` —
  attach artifacts to outcomes and review them

**What Agent HQ needs to bridge:**

If we adopt the SDK's team model (see §2.1 option 1), most of this comes
for free — the manager spawns teammates, assigns tasks with
`team_run_task`, awaits completion with `team_await_runs`, and tracks
deliverables with the outcome tools. The custom work is mapping Agent HQ's
office concepts (desk, sprite, status) to the SDK's team concepts
(teammate, run, outcome).

If we keep independent agents, we need to build dependency-aware
delegation ourselves: extend `managerBrief` to ask for `dependsOn` /
`produces` fields, enforce ordering in `delegate()`, and notify the
manager on subtask completion.

### 2.5 No Planning or Reflection Step [HYBRID]

The agent loop is: receive task → call tools iteratively → submit. There's
no:

- **Pre-task planning** — "Here's the task, what's your approach?" before
  touching files
- **Mid-task checkpointing** — "You're 30 iterations in, here's what
  you've done so far, are you on track?"
- **Post-task reflection** — "You finished, here's what worked and what
  didn't" (stored for future tasks)

**What the SDK provides:**

- `team_mission_log` — structured logging of mission events (could be
  used for planning checkpoints)
- `skills` tool — agents create and load `SKILL.md` procedural skills
  from experience, which is a form of persistent learning
- Outcome tracking tools — structured deliverables with review steps

**What Agent HQ needs to build:**

- **Context window management** — Summarize older messages when
  approaching token limits, preserving key decisions and file state.
  The SDK doesn't provide this; it's Agent HQ's responsibility since we
  manage the `messageStore` and call `agent.restore()`.
- **Pre-submit verification** — Before `submit_and_exit` is accepted,
  run tests/typecheck and feed results back. The SDK's `submit_and_exit`
  has a `verified` boolean field in its schema — we should use it.

### 2.6 Missing Tools for Effectiveness [SDK]

The current 5 hand-rolled tools are minimal. The SDK ships with 9
built-in tools, of which Agent HQ uses 0 (it reimplements 3 from
scratch). The missing ones:

- **`search_codebase`** — Grep/ripgrep across the workspace. `list_files`
  alone isn't enough for large codebases. **Available via
  `createSearchExecutor()`.**
- **`fetch_web_content`** — Fetch URLs and extract content. Agents are
  blind to anything outside their workspace. **Available via
  `createWebFetchExecutor()`.**
- **`editor`** — Surgical file editing (old_text → new_text) instead of
  full-file overwrites. **Available via `createEditorExecutor()`.**
- **`apply_patch`** — Apply unified diffs. **Available via
  `createApplyPatchExecutor()`.**
- **`ask_question`** — Ask the user a clarifying question with options.
  **Available as a built-in tool definition.**
- **`skills`** — Load/save procedural skill files. **Available as a
  built-in tool definition.**

**Still custom (the SDK doesn't provide these):**

- **`git_operations`** — Branch, commit, diff, log. Agents can do this
  via `run_commands` but a structured tool would be cleaner.
- **`read_other_workspace`** — Read from a named agent's workspace (with
  permission). Agent HQ-specific concept.
- **`read_board`** — See the Agent HQ task board. Agent HQ-specific.

### 2.7 No Verification or Quality Gate [HYBRID]

Agents call `submit_and_exit` when they think they're done. There's no:

- Automated test run before completion
- Lint/typecheck check
- File existence verification ("you said you created `foo.ts` — does it
  exist?")
- Diff review ("here's what you changed — does this look right?")

**What the SDK provides:**

The built-in `submit_and_exit` schema has a `verified: boolean` field —
the SDK expects the agent to verify its work before submitting. Agent HQ's
hand-rolled version only has `summary: string` and ignores verification.

**What Agent HQ needs to build:**

- A **pre-submit hook** — When `submit_and_exit` is called, run
  `tsc --noEmit` and any test files in the workspace. Feed results back
  to the agent. If tests fail, the agent must fix before submitting.
- A **review step** — The agent must read back what it wrote and confirm
  it's complete.

---

## 3. Prioritized Implementation Plan

The plan is reorganized around a key realization: **most of the "missing"
tools already exist in the SDK.** The highest-leverage work is (a) wiring
up SDK built-ins, (b) injecting office context into prompts, and (c)
building the small number of truly custom pieces the SDK doesn't cover.

### Tier 1: Wire Up SDK Built-ins + Office Context (highest ROI)

| Step | What | Type | Cost | Impact |
|---|---|---|---|---|
| 1 | **Replace hand-rolled tools with `createBuiltinTools()`** — Swap the 5 custom tools for the SDK's built-in equivalents. Get `search_codebase`, `fetch_web_content`, `editor`, `apply_patch`, `ask_question`, and `skills` for free. Keep `write_files` and `list_files` as custom additions (the SDK doesn't have exact equivalents). | [SDK] | ~40 lines changed in `cline.ts` | Massive — 6 new capabilities with zero custom code |
| 2 | **Inject office context into system prompt** — Before each task, append a brief summary to `buildSystemPrompt()`: "Office roster: [names, statuses, current tasks]. Task board: [cards]." | [CUSTOM] | ~25 lines in `manager.ts` | Immediate world-awareness |
| 3 | **Context window management** — Before `agent.restore()`, check message count. If >N messages, summarize older ones into a compact "previous work summary" and prepend it. | [CUSTOM] | ~60 lines in `cline.ts` | Prevents token limit crashes on long-running agents |
| 4 | **Add a shared project workspace** — Create `workspace/shared/` alongside per-agent workspaces. Add a `workspace` parameter to file tools that targets the shared directory. Agents are told about it in their prompt. | [CUSTOM] | ~50 lines | Unlocks real collaboration |

### Tier 2: Multi-Agent Coordination

| Step | What | Type | Cost | Impact |
|---|---|---|---|---|
| 5 | **Evaluate SDK team tools** — Spike: try `bootstrapAgentTeams()` with the manager as team lead. If it works within Agent HQ's architecture, adopt it and replace `delegate()` + `completeHandoff()`. If not, fall back to step 5b. | [HYBRID] | ~1 day spike | Determines architecture for all coordination |
| 5b | **Filesystem-based agent messaging** (fallback) — `post_message(toAgent, text)` writes to `workspace/{recipient-id}/inbox.jsonl`. `read_messages()` reads from own inbox. Messages injected into the next task prompt. | [CUSTOM] | ~80 lines | Enables agent-to-agent communication |
| 6 | **Dependency-aware delegation** — Either via SDK team tools (`team_run_task` + `team_await_runs`) or by extending `managerBrief` to ask for `dependsOn` / `produces` fields and enforcing ordering in `delegate()`. | [HYBRID] | ~100 lines or less with SDK | Enables real multi-agent projects |
| 7 | **Progress callbacks for managers** — When a delegated subtask completes, the manager agent gets a new conversation turn: "Pixel completed their subtask. Here's their report: ...". With SDK team tools, this is `team_await_runs()`. Custom: poll subtask status and inject results. | [HYBRID] | ~70 lines or near-zero with SDK | Closes the delegation loop |

### Tier 3: World Awareness

| Step | What | Type | Cost | Impact |
|---|---|---|---|---|
| 8 | **Agent-visible task board** — `read_board()` tool returns the current task cards. `claim_card(cardId)` lets an idle agent self-assign. The system prompt says "If you're idle and see an unclaimed card you can handle, claim it." | [CUSTOM] | ~90 lines | Agents become self-directed |
| 9 | **Event feed injection** — After each task, append a summary to a shared `workspace/events.jsonl`. Before each task, inject the last 5 events as context. Agents know what's happening in the office. | [CUSTOM] | ~40 lines | Ambient awareness |
| 10 | **Skills integration** — Wire up the SDK's `skills` tool so agents create and load `SKILL.md` files. Post skill creation to the office feed: "Pixel learned a new skill: debug-auth-loop". | [SDK] | ~20 lines bridge | Agents get better over time |

### Tier 4: Effectiveness & Quality

| Step | What | Type | Cost | Impact |
|---|---|---|---|---|
| 11 | **Pre-submit verification** — When `submit_and_exit` is called, run `tsc --noEmit` and any test files in the workspace. Feed results back. Use the SDK's `verified` boolean field. Agent must fix errors before submit is accepted. | [HYBRID] | ~50 lines | Catches errors before "done" |
| 12 | **Expedition awareness** — When expeditions are implemented, inject robot telemetry into relevant agents' prompts. The builder agents know how their robot is doing. | [CUSTOM] | ~30 lines | Ties agents to game world events |
| 13 | **Git integration** — `git_init`, `git_commit`, `git_diff` tools. Lets agents checkpoint their work and undo mistakes. Also enables the boss to review diffs. | [CUSTOM] | ~100 lines | Version control for agents |

---

## 4. The Key Insight

The original version of this doc proposed building 14 features from
scratch. After inspecting the SDK, **6 of those features already exist as
built-in tools** (`search_codebase`, `fetch_web_content`, `editor`,
`apply_patch`, `ask_question`, `skills`), and **the entire multi-agent
coordination layer** (messaging, task delegation, progress tracking,
outcome management) is available via the SDK's team tools.

The agent intelligence gaps fall into three categories:

1. **Wiring gaps [SDK]** — the SDK has the tool, Agent HQ just doesn't use
   it. Fix: replace hand-rolled `makeTools()` with `createBuiltinTools()`.
   Cost: ~40 lines changed. Impact: 6 new capabilities.

2. **Office context gaps [CUSTOM]** — the SDK has no concept of "the
   office," the roster, the task board, or game world events. These are
   Agent HQ's unique value and must be built custom. Fix: context
   injection in `buildSystemPrompt()`, `read_board()` tool, event feed.
   Cost: ~155 lines total. Impact: agents become world-aware.

3. **Architecture gaps [HYBRID]** — the SDK has multi-agent primitives
   (team tools), but they assume a single `Agent` instance spawning
   teammates. Agent HQ has independent `Agent` instances per agent. We
   need to either adopt the SDK's team model or bridge it. Cost: 1-day
   spike to decide, then ~80-100 lines. Impact: real collaboration.

**The highest-leverage change is Tier 1, step 1** — replacing hand-rolled
tools with `createBuiltinTools()`. It's ~40 lines of changes and
immediately gives agents codebase search, web fetch, surgical editing,
patch application, clarifying questions, and a skills system. Everything
else builds on that foundation.

---

## 5. Architecture Sketch

```
┌──────────────────────────────────────────────────────────────┐
│                     AgentManager                              │
│                                                              │
│  buildSystemPrompt()                                         │
│    ├── identity ("You are {name}...")                        │
│    ├── office context (roster, board, recent events)  ← NEW  │
│    ├── messages from colleagues                    ← NEW     │
│    └── standing instructions                                  │
│                                                              │
│  delegate()                                                  │
│    ├── Option A: SDK team tools (team_run_task, etc.) ← EVAL │
│    ├── Option B: parse plan with dependencies       ← NEW    │
│    ├── enforce ordering                             ← NEW    │
│    ├── pass produced artifacts                      ← NEW    │
│    └── notify manager on completion                 ← NEW    │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                     Cline Provider                            │
│                                                              │
│  Tools (from SDK createBuiltinTools):               ← SWAP    │
│    ├── read_files (built-in executor)                        │
│    ├── run_commands (built-in executor)                      │
│    ├── search_codebase (built-in executor)          ← NEW    │
│    ├── fetch_web_content (built-in executor)        ← NEW    │
│    ├── editor (built-in executor)                   ← NEW    │
│    ├── apply_patch (built-in executor)              ← NEW    │
│    ├── ask_question (built-in)                      ← NEW    │
│    ├── skills (built-in)                            ← NEW    │
│    └── submit_and_exit (built-in, with verified)    ← SWAP    │
│                                                              │
│  Tools (custom, Agent HQ-specific):               ← NEW      │
│    ├── write_files (full-file write, no SDK equiv)           │
│    ├── list_files (directory listing, no SDK equiv)          │
│    ├── read_shared / write_shared                   ← NEW    │
│    ├── read_board / claim_card                      ← NEW    │
│    └── post_message / read_messages (if no SDK team)← NEW    │
│                                                              │
│  Tools (SDK team, if adopted):                     ← EVAL    │
│    ├── team_spawn_teammate / team_shutdown_teammate          │
│    ├── team_run_task / team_await_runs                      │
│    ├── team_send_message / team_broadcast                   │
│    ├── team_read_mailbox / team_status                      │
│    └── team_create_outcome / team_finalize_outcome           │
│                                                              │
│  Memory:                                                     │
│    ├── messageStore (per-agent conversation)                 │
│    └── context window summarization                 ← NEW    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                     Filesystem                               │
│                                                              │
│  workspace/                                                  │
│    ├── {slug}-{id}/          (per-agent private workspace)   │
│    │   ├── inbox.jsonl       (messages from colleagues) ← NEW│
│    │   ├── .hermes/skills/   (SKILL.md files)         ← NEW  │
│    │   └── ... (agent's files)                               │
│    ├── shared/               (shared project space)    ← NEW │
│    │   └── ... (shared files)                                │
│    └── events.jsonl          (office event feed)       ← NEW │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Relationship to Existing Docs

| Doc | Focus | How this doc relates |
|---|---|---|
| `DOCS.md` | Agent architecture, lifecycle, memory, providers | Describes the *current* system. This doc describes what's *missing* and how to extend it. |
| `EXPEDITIONS.md` | Robot expeditions, social layer, workshop | Envisions agents collaborating socially. This doc provides the primitives that would make that possible. |
| `SCALING.md` | Infrastructure scaling, multi-tenant, multiplayer | Focuses on the server/infra layer. This doc focuses on the agent intelligence layer — complementary, not overlapping. |
| `HERMES.md` | Workplace agents, external presence, messaging gateway | Designs a second provider with skills, structured memory, and MCP ecosystem. This doc's SDK tool integration (skills, search, web fetch) overlaps with Hermes's feature set — adopting SDK built-ins reduces the gap between Cline and Hermes providers. |
| `GENERATIVE.md` | Procedural generation | Unrelated to agent collaboration. |
| `ELEVENLABS_INTEGRATION.md` | Voice synthesis | Unrelated to agent collaboration. |
