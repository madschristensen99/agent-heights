# The Singularity Will Be Livestreamed

A 24/7 livestream of a self-running AI office where viewers interact
through chat to hire agents, assign tasks, and watch an autonomous
organization build, deploy, and collaborate in real time.

---

## 1. Overview

The Agent Heights office is already alive — agents have personalities,
pick up backlog cards on their own, talk to each other, get bored,
delegate, and hand off work. The autonomous think loop
(`server/manager.ts:tickThinkLoop`) and cron scheduler
(`server/manager.ts:tickSchedules`) keep the office running without any
human input.

This document describes how to point a camera at that office and
broadcast it to YouTube/Twitch 24/7, with viewer chat integration that
lets the audience participate.

**What makes this unique:**

- **Not AI slop.** Virtual office, agents walking around, emotes,
  helicopter deliveries, task boards. It looks like a game because it
  is one. No voiceover, no stock footage, no generated images.
- **Generative content.** The office builds itself. New agents bring
  new MCPs, new capabilities, new interactions. No two streams are the
  same. The narrative emerges from agent behavior.
- **Community interactive.** Viewers aren't watching — they're
  managing. Chat messages become tasks for Agent Resources, who can hire agents,
  create board cards, and respond to questions. The audience staffs
  the office.
- **Endless.** Agents on cron schedules run recurring tasks forever.
  The autonomous think loop means idle agents self-assign work. The
  stream never needs new content — it generates its own.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Headless Server (existing)                                       │
│                                                                   │
│  AgentManager          Cron Scheduler        Autonomous Think     │
│  (hire, assign,        (tickSchedules)       Loop (tickThinkLoop) │
│   handoff, delegate)                                              │
│       │                                                           │
│       │  WebSocket broadcast (world state, logs, emotes,          │
│       │  agent_chat, toasts, helicopter_delivery)                 │
│       │                                                           │
│  ┌────┴───────────────────────────────────────────────────────┐  │
│  │  Spectator WebSocket (new)                                  │  │
│  │  Read-only connection — receives all broadcasts,            │  │
│  │  cannot assign/fire/stop. Optional chat→Agent Resources bridge.        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         │ ws://                         │ ws://
         ▼                              ▼
┌─────────────────┐            ┌──────────────────────┐
│  Headless       │            │  Twitch/YouTube      │
│  Browser Client │            │  Chat Bot (new)      │
│  (Playwright)   │            │                      │
│                 │            │  IRC → Agent Resources chat     │
│  Phaser scene   │            │  commands            │
│  renders to     │            │  (hire, assign,      │
│  <canvas>       │            │   ask questions)     │
│                 │            └──────────────────────┘
│  canvas.        │
│  captureStream()│
└────────┬────────┘
         │ MediaStream (30fps)
         ▼
┌─────────────────┐
│  FFmpeg          │
│  H.264 encode    │
│  -f flv          │
│  → RTMP push     │
└────────┬────────┘
         │ RTMP
         ▼
┌─────────────────┐
│  YouTube /       │
│  Twitch          │
│  24/7 livestream │
└─────────────────┘
```

### Data flow

1. **Server** runs the office autonomously — agents work, talk, hand
   off, delegate. All state changes are broadcast over WebSocket.
2. **Headless browser** (Playwright) loads the client page, connects as
   a spectator, and renders the Phaser scene to a canvas. No HUD, no
   input handling — just the world view.
3. **Canvas capture** — `canvas.captureStream(30)` produces a
   `MediaStream` from the rendered game canvas. No browser permission
   prompt needed (it's our own canvas, not `getDisplayMedia`).
4. **FFmpeg** encodes the stream to H.264 and pushes it via RTMP to
   YouTube or Twitch.
5. **Chat bot** connects to Twitch IRC or YouTube Live Chat API,
   receives viewer messages, and forwards them to the server as Agent Resources
   chat commands. Agent Resources's existing `isAgentResourcesQuestion()` logic
   (`server/manager.ts:45`) distinguishes questions from task commands.

---

## 3. Spectator Mode

### New `ClientMsg` variant

```typescript
| { type: "spectator_join" }
```

### New `ServerMsg` variant

```typescript
| { type: "spectator_welcome"; worldState: WorldState }
| { type: "spectator_chat_relay"; fromUserId: string; fromName: string; text: string }
```

### Server changes (`server/index.ts`)

Add a spectator connection path that:

- **Accepts WebSocket without auth** — Spectators don't need a Supabase
  account. The connection is read-only.
- **Sends full world state on join** — All agents, logs, board cards,
  schedules, emotes. Same as the normal `init` message but tagged as
  spectator.
- **Relays all broadcasts** — Spectators receive every `agent`,
  `log`, `agent_chat`, `emote`, `toast`, `helicopter_delivery`,
  `card`, `schedule`, and `feed_item` message. They see everything the
  boss sees.
- **Cannot send commands** — Spectator connections ignore `assign`,
  `hire`, `fire`, `stop`, `chat`, and all other boss commands. Only
  `spectator_join` is accepted.
- **Optional chat bridge** — If `spectator_chat_relay` is enabled,
  chat messages from the Twitch/YouTube bot are forwarded to Agent Resources's
  chat handler. The bot authenticates as a special user (e.g.
  `twitch-chat`) with limited permissions — only chat with Agent Resources,
  no direct agent control.

### Rate limiting

Spectator connections are read-only, so rate limiting is minimal:

- `spectator_join`: 1 per connection (handled on connect)
- `spectator_chat_relay`: 10 per minute per connection (prevent spam)

### Connection limits

- Soft cap: 50 concurrent spectators per server (headless client only
  needs 1; this is for future web-based spectator viewing)
- If scaling is needed, spectators can connect to a read-only replica
  that subscribes to the Redis pub/sub broadcast channel

### Room state (`server/tenant.ts`)

No changes needed — spectators don't join a room. They observe the
default/primary office. The server sends them the active room's world
state.

---

## 4. Headless Browser Client

### Playwright setup

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=swiftshader",     // software WebGL for headless rendering
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});

const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
});

// Load the client with a spectator flag
await page.goto("http://localhost:3001/?spectator=1");

// Wait for the Phaser canvas to appear
await page.waitForSelector("canvas", { timeout: 30_000 });
```

### Client changes (`client/src/main.ts`)

When `?spectator=1` is in the URL:

- **Skip auth** — No Supabase login, no payment check
- **Connect as spectator** — Send `spectator_join` instead of normal
  `setup` message
- **Hide HUD** — No roster panel, no feed, no hire button, no settings.
  The viewer sees only the game world.
- **Disable input** — No keyboard, no click-to-select, no E-interaction.
  The camera can slowly pan or follow an agent of interest.
- **Render everything** — Agents, emotes, task board, helicopter
  deliveries, agent chat bubbles. The world is the content.

### Camera behavior

In spectator mode, the camera operates in one of several modes:

| Mode | Behavior | When |
|------|----------|------|
| **Follow** | Centers on the most recently active agent | Default |
| **Overview** | Slow zoom out to show the whole office | Idle periods |
| **Event** | Jump to significant events (helicopter, emote burst) | On broadcast |
| **Manual** | Chat commands: `!cam <agent-name>` | Viewer request |

The camera mode is controlled by a small client-side state machine that
reacts to broadcast messages. No server changes needed.

---

## 5. Canvas Capture & RTMP Push

### Canvas → MediaStream

```typescript
// Inside the headless page, via page.evaluate()
const canvas = document.querySelector("canvas");
const stream = canvas.captureStream(30); // 30fps
```

`canvas.captureStream()` is a standard browser API that produces a
`MediaStream` from a canvas element. No permission prompt, no
`getDisplayMedia` — it's our own canvas.

### MediaStream → FFmpeg → RTMP

Two approaches:

#### Option A: Page-side MediaRecorder (simpler)

```typescript
const stream = canvas.captureStream(30);
const recorder = new MediaRecorder(stream, {
  mimeType: "video/webm;codecs=vp9",
  videoBitsPerSecond: 4_000_000,
});

// Pipe recorded chunks to FFmpeg via stdin
const ffmpeg = spawn("ffmpeg", [
  "-i", "pipe:0",
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-tune", "zerolatency",
  "-b:v", "3000k",
  "-maxrate", "3000k",
  "-bufsize", "6000k",
  "-pix_fmt", "yuv420p",
  "-f", "flv",
  `rtmp://a.rtmp.youtube.com/live2/<stream-key>`
]);

recorder.ondataavailable = (e) => {
  if (e.data.size > 0) ffmpeg.stdin.write(e.data);
};
recorder.start(1000); // 1-second chunks
```

#### Option B: Playwright screencast (more reliable)

```typescript
const stream = await page.screencast({
  format: "webm",
  quality: 80,
  fps: 30,
});

// Pipe to FFmpeg same as above
```

Playwright's `screencast()` captures the page directly without needing
`canvas.captureStream()`, which can be more reliable in headless mode.

### Recommended encoding settings

| Setting | Value | Reason |
|---------|-------|--------|
| Codec | H.264 (libx264) | Universal compatibility |
| Preset | veryfast | Low CPU, low latency |
| Tune | zerolatency | Minimize stream delay |
| Bitrate | 3000 kbps | 720p30, good quality |
| Keyframe | 2s | Twitch/YouTube requirement |
| Pixel format | yuv420p | Broad compatibility |
| Resolution | 1280×720 | Good quality, low bandwidth |
| FPS | 30 | Smooth agent movement |

### Audio (optional)

The office has ambient sound (`client/src/game/audio.ts`) and voice
chat. For the livestream:

- **Ambient audio** — Route the game's audio context to FFmpeg as a
  second input. Provides office ambiance (typing sounds, notification
  chimes).
- **TTS for agent chat** — Use ElevenLabs (already integrated, see
  `docs/ELEVENLABS_INTEGRATION.md`) to voice agent chat messages.
  When an agent says something in the office feed, generate TTS audio
  and mix it into the stream. This makes the stream watchable without
  reading text.
- **Music** — Lo-fi background track. Standard for 24/7 streams.

---

## 6. Chat Integration

### Twitch IRC

```
Twitch IRC (irc.chat.twitch.tv:6667)
    ↓
Chat bot (Node.js)
    ↓
WebSocket → server
    ↓
manager.chat(AGENT_RESOURCES_ID, message)
    ↓
Agent Resources processes via isAgentResourcesQuestion() / runAgentResourcesChat()
    ↓
Response broadcast to all connections (including headless client)
```

### Chat bot implementation

```typescript
import { WebSocket } from "ws";

// Connect to Twitch IRC
const irc = new IRCClient({
  server: "irc.chat.twitch.tv",
  port: 6667,
  nick: "AgentHeights",
  oauth: process.env.TWITCH_OAUTH_TOKEN,
  channels: ["#agentheights"],
});

// Connect to Agent Heights server as chat bridge
const ws = new WebSocket("ws://localhost:3001/?spectator=1&chat=1");

irc.on("message", (channel, user, message) => {
  // Forward chat messages to Agent Resources
  ws.send(JSON.stringify({
    type: "spectator_chat_relay",
    fromUserId: `twitch:${user.username}`,
    fromName: user.displayName ?? user.username,
    text: message,
  }));
});

// Relay Agent Resources's responses back to Twitch chat
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "log" && msg.kind === "text") {
    // Only relay Agent Resources's responses, not all agent chatter
    if (msg.agentId === "agent-resources") {
      irc.say("#agentheights", msg.text);
    }
  }
});
```

### Chat commands

Viewers can type natural language — Agent Resources's `isAgentResourcesQuestion()` handles
intent detection. But explicit commands also work:

| Command | Effect | Example |
|---------|--------|---------|
| `hire <name>` | Agent Resources hires an agent | `hire ReactBot` |
| `assign <task>` | Creates a board card | `assign fix the login bug` |
| `ask <question>` | Agent Resources answers locally | `ask what agents are working` |
| `!cam <name>` | Camera follows agent | `!cam Agent Resources` |
| `!status` | Bot posts office summary | `!status` |

### Spam & moderation

- **Rate limit**: 1 message per user per 30 seconds (enforced server-side)
- **Twitch AutoMod**: Rely on Twitch's built-in moderation
- **Profanity filter**: Simple word list before forwarding to Agent Resources
- **Max message length**: 500 characters
- **Cooldown**: If Agent Resources is busy (thinking/working), queue messages and
  process them when she's idle. Show a "Agent Resources is busy" toast on stream.

---

## 7. Content Design

### Always-on agents

The stream office should be pre-staffed with agents on schedules so
there's always activity:

| Agent | Role | Schedule | Purpose |
|-------|------|----------|---------|
| **Agent Resources** | Office manager | Always on | Chat interface, hires agents, answers questions |
| **GitHub Agent** | Worker | Every 30 min | Reviews PRs, merges approved ones, creates cards for issues |
| **Railway Agent** | DevOps | On handoff | Deploys what GitHub agent produces |
| **Supabase Agent** | Worker | On handoff | Handles database migrations |
| **Content Agent** | Worker | Every 2 hours | Writes a summary of what the office accomplished, posts to social |
| **Social Agent** | Worker | Every 1 hour | Monitors stream chat, responds to questions in office feed |

### Emergent narratives

The stream generates stories naturally:

- **The time GitHub Agent broke production** — Railway Agent deploys,
  something fails, manager delegates a fix, Supabase Agent rolls back
  the migration. Viewers watched the whole incident response unfold.
- **The agent that went rogue** — An agent with high openness and low
  conscientiousness keeps picking up tasks it can't finish. Manager
  notices, fires it, hires a replacement. Office drama.
- **The 3am collaboration** — Two idle agents start talking
  (`startAgentConversation`), one mentions a bug it noticed, the other
  picks it up as a task. Nobody asked them to. Chat goes wild.
- **Helicopter delivery** — A viewer asks Agent Resources to hire a specialist.
  The helicopter animation plays on stream. Chat erupts.

### Stream overlays

Lightweight DOM overlays on top of the canvas (added in the headless
client, not the main client):

- **Agent name tags** — Floating labels above each agent showing name
  and current task
- **Task feed ticker** — Bottom of screen, scrolling log of recent
  agent actions (same as the office feed, but formatted for video)
- **Activity indicator** — Top corner: "3 agents working · 2 idle · 1
  scheduled task in 12m"
- **Chat highlights** — When a chat message triggers a Agent Resources response,
  show the exchange on screen
- **Logo + URL** — "AGENT HEIGHTS · agent-heights.com" in corner

### Stream schedule

The stream is 24/7, but content density varies:

| Time | Activity | Why |
|------|----------|-----|
| **Peak hours** (6-10pm ET) | Chat-driven tasks, viewer hires, live demos | Max viewers, max interaction |
| **Daytime** (9am-5pm ET) | Scheduled agent work, PR reviews, deploys | Looks like a real office |
| **Overnight** (12-6am ET) | Slow mode — agents on long tasks, ambient | Chill vibes, lo-fi, people leave it on |

---

## 8. Monetization Integration

The stream is both content and customer acquisition:

```
Viewer watches stream
    ↓
"Wait, I can hire my own AI agent?"
    ↓
Goes to agent-heights.com
    ↓
$0.99 starter office (1 agent)
    ↓
$4.99 small team (3 agents + handoffs)
    ↓
$20.00 full office (unlimited agents + managers)
```

### Stream-specific calls to action

- **Periodic overlay**: "Want your own office? agent-heights.com ·
  starts at $0.99"
- **Agent Resources mentions**: When Agent Resources answers a chat question, she can append
  "You can hire your own agents at agent-heights.com"
- **Agent bios**: When a new agent is hired, the overlay shows their
  name, role, and "Hire agents like this at agent-heights.com"
- **Clip-friendly moments**: Helicopter deliveries, agent conversations,
  and task completions are natural clip moments. Each clip is a
  mini-ad for the product.

---

## 9. Environment Variables

```bash
# ── Livestream ───────────────────────────────────────────────────────
# YouTube RTMP endpoint and stream key
# Get your key at https://studio.youtube.com → Go Live → Stream Key
YOUTUBE_RTMP_URL=rtmp://a.rtmp.youtube.com/live2
YOUTUBE_STREAM_KEY=your-stream-key

# OR Twitch RTMP endpoint and stream key
# Get your key at https://dashboard.twitch.tv/settings/streams
TWITCH_RTMP_URL=rtmp://live.twitch.tv/app/
TWITCH_STREAM_KEY=your-stream-key

# ── Twitch Chat Bot ──────────────────────────────────────────────────
# OAuth token: https://twitchapps.com/tmi/
TWITCH_OAUTH_TOKEN=oauth:your-token
TWITCH_BOT_NICK=agentheights
TWITCH_CHANNEL=agentheights

# ── Headless client ──────────────────────────────────────────────────
# URL of the Agent Heights server (for the headless browser to connect to)
LIVESTREAM_SERVER_URL=http://localhost:3001

# Whether to enable TTS for agent chat (uses ElevenLabs)
LIVESTREAM_TTS=true

# Whether to enable chat → Agent Resources bridge
LIVESTREAM_CHAT_BRIDGE=true
```

---

## 10. Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `server/index.ts` | Modify | Add spectator WebSocket path — accept unauthenticated connections, send world state, relay broadcasts, accept `spectator_chat_relay` |
| `shared/types.ts` | Modify | Add `spectator_join` to `ClientMsg`, `spectator_welcome` and `spectator_chat_relay` to `ServerMsg` |
| `server/tenant.ts` | Modify | Track spectator connections separately from authenticated sessions |
| `server/ratelimit.ts` | Modify | Add rate limits for spectator chat relay |
| `client/src/main.ts` | Modify | Detect `?spectator=1` URL param — skip auth, connect as spectator, hide HUD, disable input |
| `client/src/game/scene.ts` | Modify | Spectator camera modes (follow, overview, event), stream overlays (name tags, feed ticker, activity indicator) |
| `scripts/livestream.ts` | **Create** | Playwright headless client — launches browser, loads spectator page, captures canvas, pipes to FFmpeg, pushes RTMP |
| `scripts/chat-bot.ts` | **Create** | Twitch IRC / YouTube Live Chat bot — receives messages, forwards to server via WebSocket, relays Agent Resources responses back to chat |
| `.env.example` | Modify | Add livestream env vars |
| `docs/LIVESTREAM.md` | **Create** | This document |

---

## 11. Deployment

### Single-server (MVP)

Run everything on one machine:

```
Agent Heights server (port 3001)
    ↓
Headless Playwright client (connects to localhost:3001)
    ↓
FFmpeg (canvas stream → RTMP)
    ↓
YouTube/Twitch

Twitch chat bot (separate process)
    ↓
WebSocket to localhost:3001
```

**Requirements:**
- 2 CPU cores, 4GB RAM (server + headless browser + FFmpeg)
- 10Mbps upload (for 720p30 stream)
- Ubuntu 22.04+ (for Playwright + FFmpeg)

**Process management:**
```bash
# Start server
pnpm start &

# Start headless client + RTMP push
node scripts/livestream.ts &

# Start chat bot
node scripts/chat-bot.ts &

# Or use a process manager
pm2 start ecosystem.config.js
```

### Scaling (future)

When the stream grows:

- **Separate stream server** — Dedicated machine for Playwright +
  FFmpeg, connects to the game server over the network
- **Redis pub/sub** — Spectator connections subscribe to the broadcast
  channel via Redis, enabling multiple spectator endpoints
- **Multiple camera angles** — Multiple headless clients with different
  camera modes, switched via an OBS-like controller
- **Clip generation** — Automatically clip significant events
  (helicopter delivery, agent conversation, task completion) and post
  to social media

---

## 12. Testing Plan

### Manual testing

1. **Spectator connection** — Open `http://localhost:3001/?spectator=1`
   in a browser. Verify world renders, no HUD, no input. Verify agents
   move and work normally.
2. **Canvas capture** — Run `scripts/livestream.ts`, verify FFmpeg
   receives video and pushes to RTMP. Check stream on YouTube
   dashboard.
3. **Chat → Agent Resources** — Send a message in Twitch chat, verify it reaches
   Agent Resources, verify Agent Resources's response appears on stream and in Twitch chat.
4. **Hire via chat** — Type "hire a React agent" in Twitch chat.
   Verify helicopter delivery animation plays on stream.
5. **Autonomous activity** — Leave stream running for 1 hour with no
   chat input. Verify agents pick up tasks, talk to each other, and
   the office remains active.
6. **Overnight stability** — Leave stream running for 24 hours.
   Verify no crashes, no memory leaks, stream stays connected.
7. **Reconnection** — Kill the headless client, verify it restarts
   and reconnects automatically. Verify stream resumes.
8. **Chat spam** — Send 20 messages in 10 seconds. Verify rate
   limiting kicks in and Agent Resources isn't overwhelmed.

### Automated testing

- **Spectator WebSocket** — Unit test: connect without auth, verify
  world state is received, verify commands are rejected.
- **Chat relay** — Unit test: send `spectator_chat_relay`, verify it
  reaches Agent Resources's chat handler, verify response is broadcast.
- **Rate limiting** — Unit test: send 11 messages in 30 seconds,
  verify 11th is rejected.

---

## 13. Future Enhancements

- **Multi-office stream** — Multiple offices on one stream, split
  screen. Viewers vote on which office to follow.
- **Agent POV** — Camera switches to an agent's perspective, showing
  their terminal output and tool calls as they work. Like watching
  over someone's shoulder.
- **Stream highlights** — Automatically detect significant events
  (task completion, helicopter delivery, agent conversation) and
  compile a daily highlight reel.
- **Viewer-owned agents** — Viewers can pay to have their own agent
  in the stream office. Their agent works alongside the main cast.
  $0.99 to place an agent, $4.99/month to keep it.
- **Tournaments** — "Which agent can build a landing page fastest?"
  Viewers vote, agents compete, stream shows the race.
- **Seasonal events** — Office parties, hackathons, "the office
  overnight" episodes where agents work on ambitious multi-agent
  projects while viewers sleep.
- **Podcast mode** — TTS-voiced agent conversations as an audio-only
  podcast feed, generated from the autonomous agent-to-agent chats.
- **Replay system** — Record the world state stream (not video) and
  allow replaying any moment in the office's history. Viewers can
  scrub through the timeline like a DVR.

---

## 14. Agent-as-Streamer via MCP (Alternative Architecture)

The architecture in sections 2–12 describes a **server-side camera**
pointed at the office. An alternative approach is to give an agent
**MCP tools to control its own stream** — the agent is the streamer,
not just the subject.

### Concept

A curated marketplace agent (e.g. "Stream Agent") is hired with a
**Streaming MCP server** attached — same pattern as Robinhood Trading
MCP or GitHub MCP. The MCP exposes streaming tools the agent calls
autonomously:

| Tool | Purpose |
|------|---------|
| `start_stream` | Begin RTMP broadcast to YouTube/Twitch (FFmpeg on server) |
| `stop_stream` | End the stream |
| `capture_frame` | Grab current game canvas around the agent, feed to RTMP pipeline |
| `narrate` | Generate TTS audio from text, mix into stream audio track |
| `get_chat_messages` | Pull recent messages from YouTube/Twitch chat |
| `send_chat_reply` | Post a message to the stream chat |
| `get_viewer_stats` | Viewer count, likes, etc. |

The agent's **system prompt** defines its streamer personality. The
agent's LLM brain handles "what to do" — explore, narrate, respond to
chat. The MCP tools handle "how to broadcast."

### Why This Fits the Existing Architecture

Everything already exists — this is one more MCP server in the catalog:

- **`MCPCatalogServer`** entry in `shared/mcp-catalog.ts` — add a
  "Streaming" entry with `nativeIntegration: true`
- **Seed migration** in Supabase — creates the marketplace listing
  (same pattern as the 100+ existing curated agents)
- **`hire()`** in `server/manager.ts` already accepts `mcpServers`
  param — no changes needed
- **`loadMCPTools()`** in `server/providers/mcp-client.ts` already
  discovers and wraps MCP tools as agent tools
- **`ScreenshotManager`** in `server/providers/screenshot.ts` already
  captures frames from agent browsers — could feed the RTMP pipeline
- **Narration** in `server/narration.ts` already generates LLM
  commentary — could pipe to TTS → stream audio
- **ElevenLabs TTS** already integrated (see
  `docs/ELEVENLABS_INTEGRATION.md`) — `SPOKEN:` prefix pattern could
  drive stream narration

### The Streaming MCP Server

A standalone package wrapping FFmpeg + TTS + platform APIs. Two flavors:

**Option A: stdio MCP** (runs on the Agent Heights server)
- Spawns as a child process via `npx @agent-heights/streaming-mcp`
- Direct access to FFmpeg, game canvas snapshots (sent via WS from
  client), and TTS APIs
- Tools: `start_stream`, `stop_stream`, `push_frame`, `narrate`,
  `get_chat`, `send_chat`, `get_stats`

**Option B: remote MCP** (hosted service)
- HTTP/SSE endpoint like `https://stream-mcp.agentheights.com/mcp`
- Handles RTMP encoding, TTS, platform API integration
- The agent calls it like any other remote MCP (Notion, GitHub, etc.)

Option A is simpler for a first version — direct access to the
server's FFmpeg and the client's canvas frames via existing WS
infrastructure.

### Data Flow

```
1. User hires "Stream Agent" from marketplace
   → agent arrives with streaming MCP attached

2. User assigns task: "Stream your exploration of the world"
   → agent's LLM starts making decisions (move, look, narrate)

3. Agent calls MCP tools:
   → start_stream(rtmp_url, stream_key)
   → capture_frame()  ← server asks client for canvas snapshot via WS
   → narrate("I see a forest ahead, let's check it out")  ← TTS → audio
   → get_chat_messages()  ← reads YouTube/Twitch chat
   → send_chat_reply("Yeah I've been exploring for about 10 minutes")
   → stop_stream()

4. Client renders the agent moving in the world
   → sends canvas frames to server via existing WS infrastructure
   → server feeds frames to FFmpeg → RTMP → YouTube/Twitch
```

### Relationship to the Office Broadcast Architecture

The two approaches are complementary:

- **Office broadcast** (sections 2–12): Server-side camera captures
  the whole office. No agent involvement in streaming. Good for 24/7
  ambient office content.
- **Agent-as-streamer** (this section): Agent controls its own stream
  via MCP tools. Agent is the content creator. Good for personality-
  driven, exploration-based content.

Both can coexist — the office broadcast runs 24/7, and individual
agents can spin up their own streams when they have something
interesting to show.

---

## 15. Agent World Exploration (Prerequisite)

Agent-as-streamer is compelling when the agent can **leave the office
and explore the procedural world**. Currently agents are office-bound:

- `AgentSprite` (`client/src/game/agent.ts`) pathfinds on an office
  grid, walks to desks and break spots
- The procedural world (`client/src/game/world.ts`, `worldgen.ts`) is
  player-only — chunk-based, dynamically loaded, separate grid
- `autonomousThink` (`server/manager.ts`) only fires emotes (💡, 💤, 💭)
  — no real autonomous behavior

### What's Needed

| Component | Effort | Risk |
|-----------|--------|------|
| `"explorer"` agent role + server decision loop | Medium | Medium — mostly server logic |
| Client `WorldAgentSprite` — world pathfinding + movement | Medium | Medium — extends existing A* pathfinding |
| In-game livestream — projector canvas capture + HUD feed | Medium | Medium — reuses screenshot infrastructure |
| External livestream — narration events + client snapshot upload | Low | Low — extends existing narration |
| Server-side world perception (shared worldgen) | High | Medium — needs extracting worldgen from client bundle |
| Autonomous decision loop (LLM-driven) | Medium | Medium — LLM cost/latency |

### Hybrid World Perception

Server uses shared `generateChunk()` for terrain awareness (it's
seed-based math, no Phaser deps). Client reports dynamic state
(creatures, health, items, position). Server knows terrain, client
knows live game state.

### Decision Engine

Every 5–15 seconds, the agent gets an LLM prompt describing its
surroundings and chooses an action:

```
You are {name}, an explorer in a procedural world.
Current situation:
- Biome: {biome} (hostility level: {level})
- Health: {hp}/100
- Nearby features: {list of notable tiles within 10-tile radius}
- Inventory: {items}
- Tiles explored: {count}
- Last 3 decisions: {history}

What do you want to do next? Choose one:
- move (direction)
- investigate (feature)
- rest
- head_back
- fight
- screenshot

Respond with JSON: {"action": "...", "target": "...", "reasoning": "..."}
```

The LLM also generates **commentary** — first-person streamer
monologue. This goes through TTS (ElevenLabs) and becomes the audio
track of the stream.

### Stream Persona

The agent's `systemPrompt` at hire time defines its streamer
personality:

- **The Explorer**: calm, curious, nature-documentary style
- **The Speedrunner**: aggressive, risk-taking, tries to go far fast
- **The Collector**: obsessively picks up every item, narrates inventory
- **The Storyteller**: invents lore about the world, roleplays as a character

Personality traits (`PersonalityTraits` on `AgentInfo`) modulate the
commentary style. High openness = more wonder at discoveries. High
neuroticism = more panic near danger.

---

## 16. Reservations & Risks

### 30fps video over WebSocket is rough

The existing `agent_frame` infrastructure sends JPEG screenshots at
~1–2fps. A real livestream needs 30fps. At 720p, that's ~2MB/s of
base64 frames over WS. This will strain the connection and server
memory. The alternative — WebRTC/WHIP directly from the client
browser — bypasses the server entirely, but then the MCP server can't
control the stream start/stop.

### The client must stay open

If frames come from the client canvas, closing the browser tab kills
the stream. This isn't a 24/7 autonomous streamer — it's "while
you're in the game, your agent streams." For true 24/7 streaming
you'd need a headless browser running the client (same as the office
broadcast approach in sections 2–12).

### TTS + LLM latency

Each narration cycle is: LLM generates commentary (2–5s) → TTS
synthesizes audio (1–3s). Commentary is always 3–8 seconds behind the
action. Human streamers have delay too, but this is on top of the
existing RTMP buffer. Could feel sluggish.

### Continuous API cost

A 1-hour stream = ~240–720 LLM calls (decisions + chat responses) +
~240–720 TTS calls. At current pricing that's potentially $5–15/hour
in API costs alone. Who pays? The user's subscription? The agent's
wallet?

### Platform OAuth complexity

YouTube Live and Twitch streaming require OAuth with specific scopes
(broadcast management, chat read/write). The existing OAuth flow
handles Robinhood, but YouTube/Twitch token refresh and broadcast
lifecycle management is more involved — you need to create broadcast
events, bind video streams, transition broadcast states.

### Agent world exploration is new game mechanics

Agents can't leave the office today. Making them roam the world means
a new client sprite class that pathfinds on world chunks, server-side
world perception, and a decision loop that drives movement. This is
genuine new game mechanics, not just wiring up an MCP.

---

## 17. Recommended Phased Approach

Decouple streaming from world exploration:

### Phase 1: Streaming MCP + Player Gameplay Narration

Build the streaming MCP + canvas capture + platform OAuth. Prove you
can stream the **player's** gameplay to YouTube/Twitch via an agent's
MCP tools. No world exploration needed — the agent is a "director"
narrating what the player does.

- Streaming MCP server (FFmpeg + TTS + platform APIs) — known tech
- Platform OAuth (YouTube/Twitch) — token lifecycle complexity
- Canvas capture pipeline (client → server → RTMP) — bandwidth/perf
- Agent narrates player's actions using existing narration patterns

**Ships something useful early. De-risks the hard part separately.**

### Phase 2: Agent World Exploration

Build agent world exploration separately. Once agents can roam the
world, the streaming MCP already exists and just works.

- `"explorer"` role + server decision loop
- Client `WorldAgentSprite` — world pathfinding + movement
- Server-side world perception (shared worldgen extraction)
- Autonomous decision loop (LLM-driven, with cost controls)

### Phase 3: Full Autonomous Streamer

Combine Phase 1 + Phase 2. The agent explores the world and streams
its own journey with TTS narration and chat interaction.

- Audience interaction (chat → agent awareness → commentary)
- Stream persona system (personality-driven commentary)
- Cost management (budget-aware streaming, auto-stop on budget exhaustion)
