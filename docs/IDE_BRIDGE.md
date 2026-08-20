# IDE Bridge — External Coding Tool Visibility in the Office

> *Your office shouldn't be blind to what you're doing outside it.*

Software engineers already use AI coding tools — Cursor, Windsurf, VS Code,
Claude Code, Codex, Aider. Agent Heights agents work in `ag/workspace/`, a
completely separate world from the user's real IDE. The office feels
disconnected from the actual work happening on the user's machine.

The IDE Bridge closes that gap. It streams real-time activity from any
external coding tool into the office, visualizes it as a **contractor desk**
or **terminal station**, feeds events into the office feed, and makes the
user's current context available to AH agents when assigning tasks.

The office becomes a unified command center: your real work + your AI
agents, all visible in one place.

---

## 1. What It Looks Like in the Office

### 1.1 Contractor Desk (IDE Tools)

A new desk type for VS Code / Cursor / Windsurf sessions. Placed in the
office alongside agent desks. Features:

- **Monitor** showing live IDE state: current file name, language icon,
  cursor position, lines changed, git branch
- **Matrix rain effect** (reusing `monitorMatrixOverlays`) with a **cyan
  tint** to distinguish "you" from agents (agents stay green)
- **Status indicator**: idle (dim), typing (pulsing), debugging (red tint),
  running tests (yellow)
- **Speech bubble** with periodic activity: "Editing auth.ts", "Running
  tests", "Git commit: fix login bug"

### 1.2 Terminal Station (CLI Tools)

A distinct desk type for Claude Code, Codex, Aider, and other terminal-native
tools. Retro CRT terminal aesthetic (green/amber phosphor) vs the blue LCD
monitors of regular agents.

The terminal shows:

- **Tool name + icon**: `🟠 Claude Code`, `🟢 Codex`, `🔵 Aider`
- **Current activity**: "Editing src/auth.ts", "Running npm test",
  "Searching for 'authToken'"
- **Session timer**: how long the CLI session has been active
- **File change counter**: `+127 -43 lines across 4 files`
- **Status light**: active (pulsing), waiting for input (dim), error (red)

### 1.3 Wall Dashboard

A wall-mounted screen (reuses projector surface or a new wall display)
showing aggregate metrics across all external sessions:

```
┌─────────────────────────────────────┐
│  EXTERNAL TOOLS                     │
│                                     │
│  🟠 Claude Code    12m active       │
│     4 files changed, 127 lines      │
│                                     │
│  🟢 Codex          5m active        │
│     1 file changed, 45 lines        │
│                                     │
│  🖥️ Cursor         active now       │
│     Editing: src/payment.ts         │
│                                     │
│  Total today: 5 files, 172 lines    │
│                                     │
│  ─── Language Breakdown ───         │
│  TypeScript 60% ████████░░          │
│  Python     30% ████░░░░░░          │
│  Other      10% █░░░░░░░░░          │
│                                     │
│  ─── Activity Sparkline ───         │
│  ▁▂▃▅▇▆▄▃▅▇█▇▅▃▂▁                  │
└─────────────────────────────────────┘
```

Additional panels:

- **Files changed today** with sparkline
- **Lines written/removed** (GitHub contribution graph style)
- **AI interactions**: completions accepted/rejected, chat messages sent
- **Language breakdown**: donut chart
- **Time spent**: active coding time this session
- **Git activity**: commits, branch switches

### 1.4 Office Feed Integration

External tool events flow into the existing office feed alongside agent
activity:

```
🟠 Claude Code: Editing src/auth.ts (+12 -3)
🟠 Claude Code: Running npm test auth.test.ts
🟠 Claude Code: ✅ All tests passed (8/8)
🟢 Codex: Created src/payment.ts (+45 lines)
🟢 Codex: Git commit "add payment module"
🖥️ Cursor: Saved src/index.ts (+5 -1)
🖥️ Cursor: Switched to branch feature/payment-flow
```

This creates a unified timeline of everything happening across the user's
entire dev stack.

### 1.5 Agent Context (Killer Feature)

When a user assigns a task to an AH agent, the agent's system prompt
includes context from active external sessions:

> "External tool Claude Code is currently editing `src/auth.ts` on branch
> `feature/payment-fix`. It has made 3 file changes and run 2 test suites
> in the last 10 minutes. The user is also running Cursor with
> `src/payment.ts` open."

This means the user can say "fix the test that's failing" and the agent
already knows which file and which test. No more copy-pasting context.

### 1.6 Cross-Tool Analytics

If the user has multiple sessions open (Cursor for frontend, Claude Code
for backend), each gets its own desk. The wall dashboard aggregates across
all of them. Future: "Claude Code vs your AH agents — who ships more?"

---

## 2. Bridge Strategies by Tool Category

### 2.1 VS Code Ecosystem (Cursor, Windsurf, VS Code)

**Mechanism**: VS Code extension (`ah-bridge`)

All three editors are VS Code forks and support the same extension API.

**What it tracks** (all opt-in, configurable):

- Active file path + language
- Edit events (throttled to 1/sec, sends diff line counts — not content)
- Save events (file name + line delta)
- Git branch changes + commits
- Terminal commands + exit codes (test runs detected by command pattern)
- AI interactions (accepted completions, chat panel messages — via VS Code
  command interception)
- Active/inactive states (window focus)

**Privacy**: No file content is sent. Only metadata: file names, line
counts, language, git info, command names. Users can configure
allowlists/blocklists for paths.

### 2.2 Claude Code (Terminal CLI)

**Mechanism**: Claude Code hooks system

Claude Code has a first-class hooks system. Configure
`~/.claude/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": "ah-hook $TOOL_NAME $FILE_PATH",
    "Notification": "ah-hook --event notification --message \"$MESSAGE\"",
    "Stop": "ah-hook --event session-end"
  }
}
```

This gives us **everything**: every file edit, every shell command, every
search, session start/stop. We ship a tiny `ah-hook` script that forwards
these events to the AH server via WebSocket.

**Data we get**: tool name, file paths, command strings, session lifecycle,
diffs (if we want them).

**This is the cleanest integration of any external tool** — better than
even the VS Code extension. Zero ongoing friction after one-time config.

### 2.3 Codex, Aider, and Other CLI Tools

Three layered strategies, users pick their comfort level:

#### `ah watch` — Universal Daemon (Zero Friction)

```bash
# Terminal 1: start the bridge
ah watch

# Terminal 2: use whatever tool you want
claude "fix the auth tests"
codex "refactor the payment module"
aider --stream
```

**What it does**:

- **File watcher** (`chokidar` / `inotify`) — detects file creates/edits/
  deletes in real time
- **Git monitor** — polls `git status` + `git log` every few seconds for
  branch changes, commits, staged files
- **Process detector** — checks if `claude`, `codex`, `aider`, etc. are
  running in any terminal session
- **Terminal output capture** (optional) — if run as `ah wrap claude`,
  wraps the command and parses stdout for events
- Streams everything to AH server via WebSocket

**Data**: file changes (names + line deltas), git activity, which tool is
active, rough activity timeline.

**Limitations**: Can't see the conversation between user and CLI tool.
Can't distinguish "AI made this edit" from "user made this edit" unless
wrapping the command.

#### `ah wrap <command>` — Wrapper Mode (Low Friction, Richer)

```bash
ah wrap claude "fix the auth tests"
ah wrap codex "refactor the payment module"
```

Wraps the CLI tool, captures stdout/stderr, parses for events:

- File edit announcements (most CLI tools print "Editing src/auth.ts...")
- Command execution ("Running: npm test")
- Error/success states
- Session start/end

**Data**: everything `ah watch` gives us, plus conversation-level
visibility — what the user asked for and what the tool did about it.

**Limitations**: Requires the user to prefix their commands with `ah wrap`.

#### Claude Code Hooks (Zero Friction, Richest)

As described in §2.2. Configure once in `~/.claude/hooks.json`, get full
tool-call visibility forever.

### 2.4 Richness vs Friction Summary

```
                    Friction    Data Richness
                    ────────    ──────────────
Claude Code Hooks   zero        highest (every tool call)
ah wrap <cmd>       low         high (conversation + output)
VS Code extension   low         high (cursor + edits + AI events)
ah watch            zero        moderate (files + git + process)
```

---

## 3. Architecture

### 3.1 Package Structure

```
ah-bridge/                        # VS Code extension (Cursor/Windsurf/VS Code)
  src/
    extension.ts                  # Activation, WS connection to AH server
    activity-tracker.ts           # File open/edit/save, cursor, language
    git-tracker.ts                # Branch changes, commits, staged files
    ai-tracker.ts                 # Detect AI completions (Cursor/Windsurf/Copilot)
    terminal-tracker.ts           # Command execution, test results
    ws-client.ts                  # WebSocket client → AH server
  package.json                    # VS Code extension manifest

ah-cli/                           # npm package for CLI bridge
  src/
    watch.ts                      # `ah watch` — file watcher + git monitor daemon
    wrap.ts                       # `ah wrap <cmd>` — command wrapper with output capture
    hook.ts                       # `ah-hook` — Claude Code hook receiver
    ws-client.ts                  # Shared WebSocket client → AH server
    process-detector.ts           # Detects running CLI tools
  package.json                    # bin: { ah: "./dist/cli.js" }
  README.md
```

### 3.2 Server Side

```
server/
  ide-bridge.ts                   # New module: WS handler for external sessions
                                  # Stores active sessions per userId
                                  # Broadcasts to office room
```

The server treats external sessions like lightweight "virtual agents" —
they get a desk slot, appear in the roster, but have no task lifecycle.
They're display-only.

### 3.3 Client Side

- **`scene.ts`**: `ContractorDesk` class for IDE sessions, `TerminalStation`
  class for CLI sessions. Both reuse `monitorMatrixOverlays` with distinct
  color tints. Speech bubbles for activity events.
- **`hud.ts`**: New "🖥️ IDE" button in topbar showing connection status +
  settings. Office feed entries for external events. Wall dashboard panel.
- **`store.ts`**: `externalSessions` state, WS handlers for
  `external_session_update` and `external_feed_event`.

### 3.4 Data Flow

```
VS Code / Cursor / Windsurf          Claude Code          Codex / Aider
  ↓ (extension)                        ↓ (hooks)           ↓ (ah watch / ah wrap)
  ↓ WebSocket                           ↓ WebSocket          ↓ WebSocket
  ↓                                     ↓                    ↓
  └────────────── AH Server (ide-bridge.ts) ─────────────────┘
                    ↓ Broadcasts to room
                    ↓
              AH Client (scene.ts + store.ts)
                    ↓ Renders contractor desk / terminal station
                    ↓ Adds events to office feed
                    ↓ Makes context available to agent system prompts
```

### 3.5 Shared Protocol

New types in `shared/types.ts`:

```typescript
type ExternalTool = "vscode" | "cursor" | "windsurf"
                  | "claude-code" | "codex" | "aider" | "unknown";

interface ExternalSession {
  sessionId: string;
  userId: string;
  tool: ExternalTool;
  state: "active" | "idle" | "error" | "disconnected";
  currentFile?: string;
  language?: string;
  gitBranch?: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  lastActivity: number;
  events: ExternalEvent[];
}

interface ExternalEvent {
  type: "file_edit" | "file_save" | "git_commit" | "git_branch"
      | "test_run" | "test_result" | "command" | "ai_completion"
      | "ai_chat" | "session_start" | "session_end" | "error";
  timestamp: number;
  file?: string;
  linesAdded?: number;
  linesRemoved?: number;
  message?: string;
  success?: boolean;
}
```

New `ClientMsg` types (from bridge tools to server):

- `external_connect` — session start (tool, sessionId, userId, auth token)
- `external_activity` — heartbeat with current state + recent events
- `external_disconnect` — session end

New `ServerMsg` types (server → game client):

- `external_session_update` — broadcast to room (contractor desk state)
- `external_feed_event` — office feed entry
- `external_sessions_sync` — full sync on room join

### 3.6 Agent Context Injection

When a user assigns a task, `server/manager.ts` builds the system prompt.
Before sending, it queries `ide-bridge.ts` for active external sessions
and appends a context block:

```
## External Context

The following external tools are currently active:

- Claude Code: editing src/auth.ts on branch feature/payment-fix
  (3 files changed, 2 test suites run in last 10 minutes)
- Cursor: src/payment.ts open (TypeScript)

The user is actively working on the auth/payment module.
```

This is opt-in per agent (checkbox in hire dialog: "Receive external IDE
context").

---

## 4. Privacy

- **No file content is ever sent.** Only metadata: file names, line counts,
  language, git branch, command names, exit codes.
- **All tracking is opt-in.** The extension/CLI prompts for consent on
  first run.
- **Path allowlist/blocklist.** Users can exclude directories (e.g.
  `node_modules`, `.env` files, proprietary paths).
- **Data is ephemeral.** External session state lives in memory only. It
  is not persisted to the database. Feed events follow the same retention
  as existing agent feed events.
- **No AI conversation content.** We track "AI completion accepted" as a
  counter, not the content of the completion. We track "chat message sent"
  as a timestamp, not the message text.

---

## 5. Phased Plan

### Phase 1: MVP — CLI Bridges + Terminal Station (~3-4 days)

**Goal**: Claude Code and Codex/Aider users get immediate value.

- [ ] `ah-cli` npm package
  - `ah watch` — file watcher + git monitor daemon
  - `ah-hook` — Claude Code hook receiver script
  - `ah wrap` — command wrapper with output capture
  - Shared WebSocket client with auth (Supabase token)
  - Process detector (which CLI tools are running)
- [ ] `server/ide-bridge.ts`
  - WS handlers for `external_connect`, `external_activity`,
    `external_disconnect`
  - Session store (in-memory, per userId)
  - Broadcast `external_session_update` + `external_feed_event` to room
  - `external_sessions_sync` on room join
- [ ] `shared/types.ts`
  - `ExternalTool`, `ExternalSession`, `ExternalEvent` interfaces
  - New `ClientMsg` and `ServerMsg` types
- [ ] `client/src/store.ts`
  - `externalSessions` state
  - WS handlers for all new message types
- [ ] `client/src/game/scene.ts`
  - `TerminalStation` class: CRT terminal desk with tool icon, activity
    text, session timer, file change counter, status light
  - Cyan-tinted matrix rain overlay for active sessions
  - Speech bubbles for significant events (test pass/fail, git commit)
- [ ] `client/src/ui/hud.ts`
  - "🖥️ IDE" button in topbar showing connection count + status
  - External events in office feed
  - Connection setup panel (shows `ah watch` / `ah-hook` instructions)
- [ ] `client/src/net.ts`
  - New message types added to `SILENT_MSG_TYPES`
- [ ] Claude Code hooks documentation
  - `~/.claude/hooks.json` template
  - Setup walkthrough

**Not in Phase 1**: VS Code extension, wall dashboard, agent context
injection, AI interaction tracking.

### Phase 2: VS Code Extension + Wall Dashboard (~3-4 days)

**Goal**: Cover the IDE users and add the aggregate visualization.

- [ ] `ah-bridge` VS Code extension
  - Activity tracker (file open/edit/save, cursor, language)
  - Git tracker (branch, commits, staged files)
  - Terminal tracker (commands, test results)
  - AI tracker (completion accepted/rejected, chat messages)
  - WS client with auto-reconnect
  - Settings UI: enable/disable tracking, path allowlist/blocklist
- [ ] Wall dashboard in scene
  - Reuses projector or new wall-mounted screen
  - Aggregate stats: files, lines, languages, time, git activity
  - Per-tool breakdown panel
  - Activity sparkline
  - Language donut chart
- [ ] Agent context injection
  - `server/manager.ts` queries `ide-bridge.ts` for active sessions
  - Appends external context to agent system prompt on task assign
  - Opt-in per agent (hire dialog checkbox)
- [ ] `ah wrap` output parser improvements
  - Parse Claude Code, Codex, and Aider stdout formats
  - Extract file names, commands, test results from output

### Phase 3: AI Interaction Tracking + Analytics (~2-3 days)

**Goal**: Make the AI-vs-human dynamic visible.

- [ ] VS Code extension: detect Cursor/Windsurf/Copilot AI completions
  - Intercept `onDidAcceptCompletion` / inline completion events
  - Track accepted/rejected counts
  - Detect chat panel messages (Cursor chat, Windsurf chat, Copilot chat)
- [ ] "AI assists" counter on contractor desk
- [ ] Wall dashboard: AI vs manual code ratio
- [ ] Achievements
  - "100 AI completions accepted"
  - "Paired with Cursor for 4 hours"
  - "Used 3 different AI tools in one session"
  - "Claude Code + AH agent collaboration: 10 tasks completed"
- [ ] Aspiration signal integration
  - External tool usage feeds into aspiration profiling
  - "Explorer" signal for trying new AI tools
  - "Builder" signal for lines shipped via external tools

### Phase 4: Multi-Session + Social (~2-3 days)

**Goal**: Multiple tools, multiple sessions, social visibility.

- [ ] Multiple external sessions = multiple terminal stations / contractor
  desks
- [ ] Other users visiting your office can see your active external work
  (read-only, same as visiting a trophy room)
- [ ] Cross-tool analytics: Claude Code vs Codex vs your AH agents — who
  ships more?
- [ ] "Pair programming" mode: share IDE context with an AH agent for
  collaborative tasks on the same codebase
- [ ] External tool leaderboard (opt-in): most lines shipped, most tests
  passed, longest active session

---

## 6. Key Design Decisions

### 6.1 Desk Placement

Contractor desks and terminal stations do **not** take a regular agent desk
slot. They get their own zone (e.g. near the window or in a dedicated
"contractor area"). This way hiring 8 agents doesn't block external
visibility.

### 6.2 Session Lifecycle

- External sessions are **ephemeral** — they exist only while the bridge
  tool is connected. Disconnect = desk disappears.
- No persistence: external session data is never saved to `ag/save.json`
  or the database. It's pure runtime state.
- Reconnection: if the WS connection drops, the bridge tool retries with
  exponential backoff. The server keeps the session alive for 60s grace
  period before removing the desk.

### 6.3 Authentication

Bridge tools authenticate using the user's Supabase auth token (same as
the game client). The `ah-cli` package will prompt for login on first
run, store the token, and refresh as needed.

### 6.4 Performance

- Activity reports throttled to **1/sec max** from bridge tools
- Only deltas are sent (what changed since last heartbeat)
- Server broadcasts to room at most **2/sec** (batched updates)
- Client renders terminal stations with the same delta-reconciliation
  pattern used for agent monitors

### 6.5 Extension Distribution

- **VS Code Marketplace**: for VS Code users
- **Cursor**: Cursor has its own extension marketplace; may need to
  publish there separately or provide side-loading instructions
- **Windsurf**: Same situation as Cursor
- **Initial approach**: Side-loading via `.vsix` file + instructions in
  README. Marketplace publishing once the feature is stable.

---

## 7. Why This Is Worth Building

1. **Bridges the gap**: Users don't have to choose between Cursor and
   Agent Heights — both coexist
2. **Makes the office feel alive**: Your real work reflected in the game
   world, not just agent work
3. **Agent context**: Agents become dramatically more useful when they
   know what you're working on
4. **Differentiator**: No other AI agent platform has a visual command
   center for your entire dev workflow
5. **Onboarding hook**: "Connect your IDE" is a natural second step after
   "hire your first agent"
6. **Retention**: The office becomes the dashboard you keep open all day,
   even when you're not actively managing agents
7. **Claude Code hooks are the best integration surface**: Zero friction,
   richest data, covers the most technical users first

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Privacy concerns** | No file content, only metadata. Opt-in with clear messaging. Path allowlist/blocklist. Ephemeral data. |
| **Extension marketplace fragmentation** | Start with side-loading `.vsix`. Publish to each marketplace once stable. |
| **Performance overhead** | Throttle to 1/sec. Delta-only updates. Server batches broadcasts. |
| **CLI tool output format changes** | `ah wrap` parsers are best-effort. `ah watch` (file watching) is format-agnostic and always works as fallback. |
| **Auth token management** | Reuse Supabase auth. Token refresh handled by bridge tool. No separate credentials. |
| **Desk clutter** | External desks in their own zone. Max 4 visible at once; overflow collapses into a summary. |
