# Talk Submission

## Your Email
notifications@swarms.world

## Talk Title (Required)
*Give your talk a compelling title*

**Sprite Heights: A Pixel-Art Office Where Every Desk Is a Live Coding Agent**

## What did you build? (Required)
*Start with one clear sentence that says what the project is, then add the demo context. Mention what you'll show live: code, workflow, architecture, eval, repo, logs, or a working system.*

Sprite Heights is a retro top-down office game where you hire real AI coding agents — each employee at a desk is a live Cline SDK agent routed through the Swarms API that actually reads, writes, and runs code in its own sandboxed workspace folder while you watch from a Phaser game world.

In the demo I'll run the working system live: hire an agent in the office, give it a name and model, type a real task, and watch it walk to its desk and start working. Speech bubbles and the office feed stream its actual tool calls, assistant text, and results in real time. I'll show the architecture (Phaser client ↔ WebSocket server ↔ provider runners), the per-agent workspace folders on disk, the persisted save file and JSON session transcripts, and the wire protocol that drives it all. Repo and logs will be on screen.

## What will another builder learn? (Required)
*Share the hard-won lesson: what broke, what surprised you, what tradeoff mattered, or what technique another builder can reuse or avoid.*

The reusable lesson is how to keep many long-lived agents stateful and crash-safe: each agent is one continuous conversation (a Cline Agent instance with persisted message history), so it remembers every order and action across server restarts — the server owns all state and persists the full roster plus every message to a single save file, replaying it on boot. The hard-won tradeoff was the render/streaming loop: naively re-rendering the HUD on every event and rebuilding the roster each frame tanked performance, so I moved to coalescing HUD renders to one per animation frame, appending only new feed/log entries instead of redrawing, and skipping roster rebuilds when nothing changed. I'll also cover sandboxing real agents (per-agent workspace dirs, "stay in your folder" instructions) and how to recover gracefully when the server dies mid-task (agents return idle with a note in their log).

## Technologies Used (Required)
*Name the key models, tools, frameworks, APIs, and platforms used in the build, and what role each played.*

- **Cline SDK (`@cline/sdk`)** — open-source agent runtime that powers the coding agents with local file system and shell tools.
- **Swarms API** — unified cloud API routing requests to Claude, GPT, and Groq models through a single endpoint.
- **Models** — Claude Sonnet 4 (balanced), Haiku 3.5 (fast), Opus 4 (deep); GPT-4.1, o3-mini; Groq Llama 3.3 70B, DeepSeek R1 Distill.
- **Phaser 3** — the top-down office game world: rendering, agent sprites, desk pathing, animations.
- **Node + `ws` (WebSocket)** — the server that owns all state (roster, per-agent logs, running SDK sessions) and streams events to the client over `ws://localhost:3001`.
- **Vite** — dev server and client build tooling.
- **TypeScript / tsx** — implementation language and the runner for the server in dev.
- **marked + DOMPurify** — render and sanitize agent markdown output in the HUD.
- **pngjs** — generates the pixel-art tileset and character sprites.
- **JSON file persistence** — single `ag/save.json` save file plus per-session transcripts in `ag/logs/`.

## Project URL - Website or Github (Optional)
https://example.com

## Project URL 2 (Optional)
https://example.com

## Video Demo URL (Optional)
https://example.com

## I agree to show the technical work behind what I built — live demo, architecture, evals, logs/traces, workflow, or repo. No pitches, no slides. (REQUIRED)
✅ Agreed
