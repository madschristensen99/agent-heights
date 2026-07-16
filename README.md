# Agent Heights

A retro pixel-art office where you hire and manage **real AI agents**. Each employee at a desk is a live coding agent — powered by the [Cline SDK](https://github.com/cline/cline) routed through the [Swarms API](https://swarms.world) — that actually reads, writes, and runs code in its own workspace folder while you watch it work from a top-down Phaser office.

Hire an agent, give it a name and a model, type a task, and watch it walk to its desk and start typing. Speech bubbles and the office feed stream its real tool calls and output in real time.

> 📖 **Deep dive:** see [DOCS.md](docs/DOCS.md) for the full agent architecture — lifecycle, providers, memory system, persistence, and the wire protocol.

## How it works

```
┌─────────────────────┐        WebSocket         ┌──────────────────────┐
│  Client (Phaser 3)  │ ◄──── ws://:3001 ─────►  │  Server (Node + ws)  │
│  office scene, HUD  │                          │  AgentManager        │
└─────────────────────┘                          │   └─ Cline runner ───┼──► @cline/sdk → Swarms API
                                                 └──────────┬───────────┘
                                                            │ each agent works in
                                                            ▼
                                                 ag/workspace/<name>-<id>/
```

- The **client** is a Phaser 3 game served by Vite. It renders the office, animates agents between their desks, and shows a HUD for hiring, assigning tasks, and reading per-agent logs.
- The **server** is a Node WebSocket server (`ws://localhost:3001`). It owns all state: the roster, per-agent logs, and the running SDK sessions.
- All game data lives in one folder: `ag/`. Each hired agent gets its own sandbox directory under `ag/workspace/` — tasks run there; agents can create files, run shell commands, and search the web, but are instructed to stay inside their folder.
- State persists across restarts: the full roster and every agent message are saved to `ag/save.json` (the single save file the server reloads on boot), and each play session gets a JSON transcript in `ag/logs/`. If the server restarts mid-task, agents come back idle with a note in their log.

## Features

- **Hire as many agents as you want** — the first 8 get desks, the rest work standing. Each gets a name, a random job title (Code Gremlin, Bug Whisperer, Refactor Goblin…), a sprite, and an optional custom system prompt set at hire time.
- **Persistent memory** — each agent is one continuous conversation (Cline Agent instance with message history, resumed on every task), so it remembers every order you've given it and everything it did, across server restarts.
- **One provider, eight models** via Swarms API:
  - Claude: Sonnet 4 (balanced), 3.7 Sonnet (fast), Opus 4 (deep)
  - OpenAI: GPT-4o (balanced), GPT-4.1 Mini (fast), GPT-4.1 Nano (cheapest), o3-mini (reasoning)
  - Google: Gemini 1.5 Pro (fast)
- **Assign tasks** to one agent or broadcast the same task to everyone who's free ("ASSIGN TO ALL").
- **Live activity feed** — assistant text, tool calls, results, and errors stream into the office feed and per-agent log panels.
- **Stop and fire** — abort a running task, or remove an agent entirely (their desk frees up).
- **Status lifecycle**: `idle → thinking → working → done / error`, reflected in the game world.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io)
- A `SWARMS_API_KEY` in your environment / `.env` (get one at [https://swarms.world/platform/api-keys](https://swarms.world/platform/api-keys)).

## Getting started

```bash
pnpm install

# (optional) regenerate the pixel-art tileset and character sprites
pnpm assets

# start the agent server and the Vite client together
pnpm dev
```

Then open **http://localhost:5173**. On first launch you'll name yourself and your office, then hit **+ HIRE AGENT** to bring on your first employee.

### Scripts

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | Runs the WebSocket server (`tsx watch`) and Vite client concurrently |
| `pnpm server`    | Runs only the agent server on port 3001                              |
| `pnpm client`    | Runs only the Vite dev server on port 5173                           |
| `pnpm build`     | Builds the client into `dist/`                                       |
| `pnpm assets`    | Regenerates sprites/tilesets into `client/public/assets/`            |
| `pnpm typecheck` | Type-checks the whole project with `tsc --noEmit`                    |

## Configuration

| Variable                | Default | Purpose                                                                                                    |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `SWARMS_API_KEY`        | —       | Auth key for the Swarms API (required)                                                                      |

> ⚠️ **Security note:** agents can run shell commands inside their workspace folder. The workspace folder is a *convention* enforced by prompt (`cwd` + instructions), not an OS sandbox. Treat `ag/workspace/` as untrusted output, and disable auto-approve in Settings if you want manual confirmation before each command.

## Project layout

```
agent-game/
├── shared/
│   └── types.ts              # Protocol + types shared by client and server (ClientMsg/ServerMsg, models, port)
├── server/
│   ├── index.ts              # WebSocket server: connections, message routing, snapshots
│   ├── manager.ts            # AgentManager: hire/assign/stop/fire, task lifecycle, desk + sprite allocation
│   ├── persistence.ts        # SaveFile — roster and logs persisted to ag/save.json
│   ├── logger.ts             # SessionLogger — append-only session log in ag/logs/
│   └── providers/
│       ├── types.ts          # ProviderRunner interface (task → async stream of TaskEvents)
│       └── cline.ts          # Cline SDK runner (Swarms API + local tools)
├── client/
│   ├── index.html
│   ├── public/assets/        # Generated tileset, character sprites, map
│   └── src/
│       ├── main.ts           # Boot: Phaser game + HUD + WebSocket connection
│       ├── net.ts            # WebSocket client
│       ├── store.ts          # Client-side state synced from server messages
│       ├── ui/hud.ts         # DOM HUD: roster, hire dialog, task input, log panels
│       └── game/
│           ├── scene.ts      # Office scene: tilemap, desks, camera
│           ├── agent.ts      # Agent sprites, walking animation, speech bubbles
│           └── path.ts       # Grid pathfinding for agent movement
├── scripts/
│   └── generate-assets.ts    # Procedurally generates all pixel art (pngjs)
└── ag/                       # All game data (gitignored)
    ├── save.json             #   the save file — roster + every agent message
    ├── logs/                 #   one JSON transcript per play session
    └── workspace/            #   per-agent working directories
```

### Adding a provider

Providers are pluggable. Implement the `ProviderRunner` signature from `server/providers/types.ts` — an async generator that takes a task plus run context (`cwd`, `model`, `systemPrompt`, `abort`) and yields `TaskEvent`s (`text` | `tool` | `result` | `error`) — then wire it into the runner selection in `server/manager.ts` and add its models to `shared/types.ts`.

## Tech stack

- [Phaser 3](https://phaser.io/) — game rendering
- [Vite](https://vite.dev/) — client dev server and build
- [ws](https://github.com/websockets/ws) — WebSocket server
- [tsx](https://tsx.is/) — TypeScript execution for the server
- [@cline/sdk](https://www.npmjs.com/package/@cline/sdk) — open-source agent runtime with local tools and streaming
- [Swarms API](https://swarms.world) — unified cloud API for LLM providers
- [pngjs](https://github.com/pngjs/pngjs) — procedural pixel-art generation
