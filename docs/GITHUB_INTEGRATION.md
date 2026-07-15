# Sprite Heights — GitHub Integration & Deployment Pipeline

## The Problem

Sprite Heights agents produce real code, but that code goes nowhere. Work lives in
ephemeral workspace directories on the server's filesystem. There is no version
control, no history, no diff review, no pull request, no merge, and no path from
"agent finished a task" to "code is deployed."

The current flow:

```
User creates task card → Agent works in workspace/{slug}-{id}/ → Agent calls submit_and_exit → Card moves to "done"
```

That's it. The code sits on disk. If the server crashes, it's gone. If another
agent needs to build on that work, they can read the workspace directory, but
there's no branch, no commit, no review, no merge. The task board says "done"
but nothing shipped.

Railway is already integrated (`server/providers/railway-mcp.ts`) but it's
disconnected from agent output. Railway manages existing projects that were
created outside Sprite Heights. Agents can query deployments and check logs, but they
can't push code that triggers a deploy. The loop is open.

This document proposes closing that loop: **agent work → git commit → GitHub
push → PR → review → merge → Railway auto-deploy.**

---

## Current Architecture (What Exists)

### Workspaces

Each agent gets a plain directory at `workspace/{slug}-{id}/` created via
`mkdirSync` in `server/manager.ts:331`. There is also a shared workspace at
`workspace/shared/` for cross-agent collaboration. No git is involved — files
are written directly to disk.

```
workspace/
  shared/              # cross-agent collaboration
  beep-6ccfc256/       # agent "Beep" workspace
  pixel-a1b2c3d4/      # agent "Pixel" workspace
  events.jsonl         # office event feed
```

### Railway Integration

`server/providers/railway-mcp.ts` spawns `railway mcp` as a subprocess and
communicates via JSON-RPC over stdio. A singleton `RailwayMCPClient` is shared
across all agents. It uses whichever Railway account ran `railway login` on the
server — one shared account for all users.

DevOps agents (role `"devops"`) get Railway MCP tools injected at
`server/providers/cline.ts:419-424`. The tools are whatever Railway's MCP server
exposes — deploy, logs, variables, domains, etc.

### Bubblewrap Sandboxing

Agent shell commands run inside a bubblewrap sandbox (`server/providers/cline.ts:35-55`)
that restricts filesystem access to the agent's workspace and blocks network
access (except for devops agents with Railway enabled). This means agents
**cannot run `git push` or `gh` commands directly** — they have no network
access and no credentials.

### HERMES Docs (Aspirational)

`docs/HERMES.md` describes a planned GitHub MCP integration:

```
hermes mcp install github → GitHub repo + PR tools
```

And envisions devops agents with "GitHub + Railway" MCP servers. None of this
is implemented. It's a design direction, not code.

---

## Proposed Architecture

### Design Principle: Server Owns the Identity

Sprite Heights operates as a managed platform. The server holds a GitHub App (or bot
account) token. Agents never touch git or GitHub credentials directly. The
server performs all git operations on behalf of agents after they submit work.

This mirrors the Railway pattern: one shared account, server-managed, agents
interact through tools that proxy through the server.

### Two Layers

1. **Server-managed git** (automatic, invisible to agents) — Every agent
   workspace is a git repo. On task completion, the server commits, pushes, and
   opens a PR. Agents don't know about git; they just write files.

2. **Agent-facing GitHub tools** (opt-in, for devops/reviewer agents) — MCP
   tools that let agents query PRs, post review comments, merge branches. These
   go through the server, which holds the GitHub token. Network access is not
   required because the server makes the API calls, not the agent's sandboxed
   shell.

### Flow

```
1. User creates task card on the board
2. Agent claims card (or user assigns it)
3. Agent works in workspace/{slug}-{id}/  (a git repo, initialized at agent hire time)
4. Agent calls submit_and_exit
5. Server intercepts completion:
   a. git add -A && git commit -m "task: {card title}"
   b. git push origin {branch}
   c. gh pr create --title "{card title}" --body "{agent summary}"
   d. PR URL posted to office feed
   e. Card moves to "done" with PR link attached
6. (Optional) Reviewer agent or human reviews PR
7. PR merged → GitHub webhook → Railway auto-deploy
8. Deploy status flows back to office feed via Railway MCP
```

### Branch Strategy

Each task card gets its own branch:

```
main (or trunk)
  ├── task/abc12345-fix-auth-loop      # card abc12345
  ├── task/def67890-add-dark-mode      # card def67890
  └── task/ghi11223-refactor-api       # card ghi11223
```

Branch naming: `task/{cardId}-{slugified-card-title}`

This allows multiple agents to work in parallel without conflicts — each on
their own branch. When a PR merges, the agent's workspace pulls `main` to stay
current for the next task.

### Repo Strategy

Two options depending on scale:

**Option A: Single org repo (simpler, good for MVP)**

```
github.com/sprite-heights-org/user-{userId}
  └── main
      ├── task/abc12345-fix-auth-loop
      ├── task/def67890-add-dark-mode
      └── ...
```

One repo per user. All agent work goes to branches in that repo. Railway watches
the repo's main branch for deploys.

**Option B: Per-project repos (more flexible, for multi-project users)**

```
github.com/sprite-heights-org/{userId}-{projectName}
```

Users can create multiple projects, each with its own repo and Railway service.
Task cards are scoped to a project. This is more complex but maps better to
real-world usage where a user has multiple apps.

**Recommendation: Start with Option A. Move to Option B when users need it.**

---

## Implementation Plan

### Phase 1: Git-Enable Workspaces

**Goal:** Every agent workspace is a git repo with history.

**Changes:**

- `server/manager.ts` — In `hire()` and `recruit()`, after `mkdirSync` for the
  workspace, run `git init` and set up a default `.gitignore`.
- `server/manager.ts` — Add a `GitManager` class (or utility functions) that
  handles git operations: init, add, commit, branch, push.
- New file: `server/git.ts` — Wraps `git` CLI via `execFile`. No external deps.
  Functions: `initRepo(cwd)`, `commitAll(cwd, message)`, `createBranch(cwd,
  name)`, `push(cwd, remote, branch)`, `pull(cwd, branch)`.

**No agent-facing changes.** Agents still use `write_files` and `write_shared`
as before. Git is invisible.

### Phase 2: GitHub Connection

**Goal:** Server can push to GitHub and create PRs on behalf of users.

**Changes:**

- Create a GitHub App (or use a bot account with a PAT) stored as
  `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` (or `GITHUB_TOKEN`) env vars.
- New file: `server/providers/github.ts` — Wraps GitHub API via `gh` CLI or
  octokit. Functions: `ensureRepo(org, name)`, `pushBranch(cwd, branch)`,
  `createPR(org, repo, branch, title, body)`, `mergePR(org, repo, number)`,
  `getPRs(org, repo)`, `addReviewComment(org, repo, number, file, line,
  comment)`.
- `server/manager.ts` — On agent hire, ensure a GitHub repo exists for the user
  (create if missing). Add the repo as a git remote in the agent's workspace.
- `shared/types.ts` — Add `github` to `GameSettings`:
  ```typescript
  github: {
    enabled: boolean;
    org: string;       // GitHub org name (e.g. "sprite-heights-users")
    autoPR: boolean;   // auto-create PR on task completion
  };
  ```

### Phase 3: Auto-Commit + PR on Task Completion

**Goal:** When an agent finishes a task, work is committed and a PR is opened.

**Changes:**

- `server/manager.ts` — In `completeCard()` (line 702), before moving card to
  "done":
  1. Get the agent's workspace path
  2. `git add -A && git commit -m "task: {card.title} (agent: {agent.name})"`
  3. `git push origin task/{card.id}-{slug}`
  4. `gh pr create --title "{card.title}" --body "{agent.submitSummary}"`
  5. Attach PR URL to the card (new field: `prUrl?: string`)
  6. Broadcast PR URL to office feed
- `shared/types.ts` — Add `prUrl?: string` to `TaskCard`.
- `client/src/ui/hud.ts` — Render PR link on done cards in the board UI.

**Error handling:** If git commit or push fails (no changes, network error,
auth error), log the error but still move the card to done. Don't block the
agent workflow on infrastructure failures.

### Phase 4: Agent-Facing GitHub Tools

**Goal:** Devops and reviewer agents can interact with GitHub via MCP-style
tools (same pattern as Railway).

**New tools in `server/providers/cline.ts`:**

- `list_prs` — List open PRs for the user's repo
- `get_pr` — Get PR details (title, body, files changed, diff)
- `review_pr` — Post a review comment on a PR
- `merge_pr` — Merge a PR (requires explicit approval in settings)
- `get_pr_diff` — Get the diff for a PR
- `create_issue` — Open a GitHub issue

These tools call `server/providers/github.ts` functions. The server holds the
GitHub token. Agents never need network access or credentials — the server
makes the API call and returns the result as tool output.

**Settings gate:** Add `github.autoMerge` (default: false) to
`GameSettings`. Agents can only merge if explicitly enabled.

### Phase 5: Railway ↔ GitHub Integration

**Goal:** Merged PRs auto-deploy via Railway.

**Changes:**

- Railway project settings: connect each Railway service to the corresponding
  GitHub repo. Railway watches `main` branch — when a PR merges, Railway
  auto-deploys.
- `server/providers/github.ts` — Add a webhook handler for `push` events to
  `main`. On merge, post a deploy-started event to the office feed.
- `server/providers/railway-mcp.ts` — Poll or subscribe to deployment status.
  Post deploy success/failure to the office feed.

This closes the loop:

```
Task card → Agent codes → PR → Merge → Railway deploy → Status in office feed
```

### Phase 6: GitHub Browser Panel

**Goal:** Users can browse GitHub — search repos, view trending, explore repo
contents — from a side panel in the office UI, same pattern as the existing
Marketplace Browser (`client/src/ui/marketplace.ts`).

**UI:**

A new `GitHubBrowser` class (mirroring `MarketplaceBrowser`) accessible via a
topbar button. Three tabs:

- **Trending** — Shows trending repos (daily/weekly/monthly) using the GitHub
  `/search/repositories` API sorted by stars. No auth required for public
  trending — uses the server's GitHub token for higher rate limits.
- **Search** — Free-text search across all of GitHub. Results show repo name,
  owner, description, language, star count, and last-updated. Clicking a repo
  opens a detail view with README preview, file tree, and a "Clone into
  workspace" button.
- **My Repos** — Shows repos in the user's Sprite Heights org. Lists branches, open
  PRs, and deploy status (if Railway connected). This is the management view
  for repos the server created on the user's behalf.

**New files:**

- `client/src/ui/github-browser.ts` — `GitHubBrowser` class, same structure as
  `MarketplaceBrowser`. Slide-in panel from the right, tabs, search input,
  card-based results.
- `server/github-api.ts` — HTTP handler for `/api/github/*` routes:
  - `GET /api/github/trending?since=daily` — proxy to GitHub search API
    (`/search/repositories?q=stars:>1&sort=stars&order=desc`)
  - `GET /api/github/search?q=react` — proxy to GitHub search API
  - `GET /api/github/repo/:owner/:name` — repo metadata + README
  - `GET /api/github/repo/:owner/:name/contents/:path` — file tree browsing
  - `GET /api/github/my-repos` — list repos in the user's org
  - `POST /api/github/clone` — clone a repo into a workspace (see Phase 7)

**Why server-side proxy instead of client-side GitHub API:** Rate limits.
Unauthenticated GitHub API calls are limited to 60/hour per IP. With the
server's token, that jumps to 5,000/hour. Also keeps the token off the client.

**HUD integration:**

- `client/src/ui/hud.ts` — Add a `🦑 GITHUB` button to the topbar (next to
  `🛒 MARKET`), wire it to `GitHubBrowser.toggle()`.
- Keyboard shortcut: `G` to toggle the GitHub panel.

**Agent-facing browsing tools (added in `server/providers/cline.ts`):**

- `search_repos` — Search GitHub repos by keyword. Returns name, owner,
  description, stars, language, URL.
- `get_repo_readme` — Fetch the README of any public repo. Returns markdown
  text.
- `get_repo_files` — List files/directories at a path in a repo. Returns names
  and types.
- `get_repo_file` — Fetch the contents of a single file from a repo. Returns
  text content.
- `get_trending` — Get trending repos (daily/weekly). Returns top 25 with name,
  owner, description, stars, language.

These tools let agents research existing code, find libraries, read
documentation, and discover patterns — all through the server's GitHub token,
no network access needed in the sandbox.

### Phase 7: Pull from External Repos

**Goal:** Users and agents can pull code from any public GitHub repo into a
workspace. This enables "start from a template" and "contribute to existing
project" workflows.

**User flow (via GitHub Browser):**

1. User browses trending or searches for a repo
2. Clicks "Clone into workspace"
3. Server runs `git clone --depth 1 {repoUrl} {workspaceDir}`
4. A new agent is hired (or existing agent reassigned) with that workspace
5. Agent starts with the cloned code already present

**Agent flow (via tools):**

1. Agent calls `search_repos` or `get_trending` to find relevant code
2. Agent calls `clone_repo` with owner/repo — server clones into a subdirectory
   of the agent's workspace (e.g. `workspace/{slug}-{id}/cloned/{owner}-{repo}/`)
3. Agent reads the cloned files with existing `read_files` / `list_files` tools
4. Agent can copy patterns, reference implementations, or use the code as a
   starting point

**New tools in `server/providers/cline.ts`:**

- `clone_repo` — Clone a public GitHub repo into a subdirectory of the agent's
  workspace. Input: `{ owner: string, repo: string, path?: string }`. Uses
  `git clone --depth 1` for speed. The clone goes through the server (not the
  sandboxed shell), so network access is available.
- `pull_repo` — Fetch latest changes for a previously cloned repo. Input:
  `{ path: string }`. Runs `git pull` in the cloned directory.

**Server endpoint:**

- `POST /api/github/clone` — `{ owner, repo, agentId? }` — Clones into the
  specified agent's workspace (or a new workspace if no agentId). Returns the
  local path.

**Security constraints:**

- Only public repos can be cloned by default. Cloning private repos requires
  the user's own GitHub OAuth token (future enhancement).
- Cloned repos are read-only by default (agent can read but not push back).
  Pushing back to an external repo requires explicit user action through the
  UI (fork → push → PR flow).
- Clone size limit: 50MB. Reject repos larger than this to prevent disk
  exhaustion. Use `git clone --depth 1 --single-branch` to minimize download.
- Cloned repos go into a `cloned/` subdirectory to keep them separate from the
  agent's own work. The bubblewrap sandbox already binds the full workspace
  directory, so cloned files are readable by the agent.

**Fork → PR flow (future, not MVP):**

1. User clicks "Fork & Contribute" on a repo in the GitHub Browser
2. Server forks the repo to the user's Sprite Heights org
3. Agent works on a branch in the fork
4. On task completion, server opens a PR against the original repo
5. This enables "agent contributes to open source" workflows

---

## Security Considerations

### GitHub Token Storage

- Store as env var (`GITHUB_APP_PRIVATE_KEY` or `GITHUB_TOKEN`). Never in the
  workspace, never in agent-visible config.
- Use a GitHub App (not a PAT) for better scoping — install on specific repos,
  limit permissions to `contents: write`, `pull-requests: write`, `issues:
  write`.
- Per-user tokens: Future enhancement. Let users connect their own GitHub
  account (OAuth) so PRs are attributed to them, not the bot. Store encrypted.

### Agent Isolation

- Agents still run in bubblewrap sandboxes with no network access. They cannot
  run `git push` or `gh` directly.
- GitHub tools are server-side functions that return text results to the agent.
  The agent never sees credentials, never makes HTTP calls.
- `write_files` and `write_shared` tools already enforce path safety
  (`server/providers/cline.ts:111-122`). Git operations use the same workspace
  paths.

### Multi-Tenant Isolation

- Each user gets their own GitHub repo under the org. Agents from user A cannot
  access user B's repo.
- The `GitManager` and `github.ts` provider must always scope operations by
  `userId` / tenant ID, same as the existing `TenantManager`
  (`server/tenant.ts`).

---

## Data Model Changes

### `shared/types.ts`

```typescript
// Add to GameSettings
github: {
  enabled: boolean;
  org: string;          // GitHub org for user repos
  autoPR: boolean;      // auto-create PR on task completion
  autoMerge: boolean;   // allow agents to merge PRs (default: false)
};

// Add to TaskCard
prUrl?: string;         // GitHub PR URL (set when PR is created)
prNumber?: number;      // PR number for API calls
branch?: string;        // git branch name for this card

// Add to AgentInfo
repoInitialized?: boolean;  // whether git init has been run in workspace
```

### `server/manager.ts`

New private fields:

```typescript
private gitManager: GitManager;  // handles git CLI operations
private githubProvider: GitHubProvider;  // handles GitHub API
```

### Default Settings

```typescript
github: { enabled: false, org: "", autoPR: true, autoMerge: false },
```

---

## File Inventory

| File | Status | Purpose |
|------|--------|---------|
| `server/git.ts` | **New** | Git CLI wrapper (init, commit, branch, push, pull, clone) |
| `server/providers/github.ts` | **New** | GitHub API wrapper (repos, PRs, issues, reviews) |
| `server/github-api.ts` | **New** | HTTP handler for `/api/github/*` (trending, search, repo browsing, clone) |
| `client/src/ui/github-browser.ts` | **New** | GitHub Browser panel (trending, search, my repos) — mirrors `MarketplaceBrowser` |
| `server/manager.ts` | **Modified** | Git init on hire, auto-commit + PR on task completion, clone support |
| `server/providers/cline.ts` | **Modified** | Add GitHub tools (browse, clone, PR, review) for agents |
| `server/providers/types.ts` | **Modified** | Add `github` to `RunContext` |
| `shared/types.ts` | **Modified** | Add `github` settings, `prUrl`/`branch` on `TaskCard` |
| `client/src/ui/hud.ts` | **Modified** | Add GitHub button, render PR links on done cards |
| `client/src/store.ts` | **Modified** | Handle `prUrl` in card state |

---

## Migration Path

Existing agents have workspaces without git. On server startup with GitHub
enabled:

1. Walk `workspace/` for all agent directories
2. `git init` each one (if not already a repo)
3. `git add -A && git commit -m "initial: existing workspace"`
4. Add remote, push to `main`

This is non-destructive — existing files are preserved, just committed.

---

## Open Questions

1. **Per-user GitHub OAuth vs. shared bot account?** Shared bot is simpler for
   MVP. Per-user OAuth gives attribution and lets users deploy to their own
   repos. Start shared, add OAuth later.

2. **Monorepo vs. multi-repo?** One repo per user (Option A) is simpler. If
   users have multiple projects, switch to per-project repos (Option B).

3. **Should agents be able to pull from `main` between tasks?** Yes — before
   starting a new task, the server should `git pull origin main` in the agent's
   workspace so they have the latest merged code. This prevents stale work.

4. **Conflict resolution?** If two agents edit the same file on different
   branches, the PR merge will conflict. For MVP, let the human resolve. Future:
   a reviewer agent could attempt rebase.

5. **Private vs. public repos?** Default to private. Users can make repos
   public in settings.

6. **GitHub Enterprise support?** Not for MVP. The `gh` CLI / octokit can point
   at a custom hostname, so it's a config change when needed.

7. **Trending algorithm?** GitHub doesn't have an official trending API. The
   approach is `/search/repositories?q=created:>2024-01-01&sort=stars&order=desc`
   filtered by recency. Alternatively, scrape github.com/trending (fragile) or
   use a third-party API like GHArchive. The search API approach is stable and
   good enough for MVP.

8. **Clone caching?** If multiple agents clone the same repo, should the server
   cache a bare clone and do `git clone --reference` from it? Saves bandwidth
   and disk. Not for MVP — add when clone volume justifies it.

9. **Should agents be able to browse GitHub without user prompting?** Yes —
   the `search_repos`, `get_trending`, and `get_repo_readme` tools are always
   available (not gated behind devops role). Any agent can research code. Only
   PR/merge operations are role-gated.
