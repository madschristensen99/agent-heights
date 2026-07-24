# Testing — The Singularity Will Be Livestreamed

How to test each layer of the livestream infrastructure, from
quick smoke tests to the full RTMP + Twitch pipeline.

---

## Prerequisites

```bash
# Server must be running
pnpm start

# For headless client tests only:
pnpm add -D playwright
npx playwright install chromium
```

---

## 1. Spectator Mode (Browser)

**What it tests:** Client connects without auth, renders the office,
receives real-time updates, no HUD or payment overlays.

### Steps

1. Start the server: `pnpm start`
2. Open a browser tab to `http://localhost:3001/?spectator=1`
3. Open a second tab to `http://localhost:3001` (normal client)

### Expected

| Check | Spectator tab | Normal tab |
|-------|--------------|------------|
| Office renders | Yes | Yes |
| Agents visible | Yes | Yes |
| HUD (task panel, hire button) | **No** | Yes |
| Auth overlay | **No** | Yes (if Supabase configured) |
| Payment overlay | **No** | Yes (if Stripe configured) |

### Real-time sync test

1. In the **normal** tab, assign a task to an agent
2. Switch to the **spectator** tab
3. The agent's status should change from `idle` to `working` in real time
4. Log entries should appear in the spectator feed

### Console check

Open the spectator tab's console — you should see:

```
[net] connecting to ws://localhost:3001/?spectator=1
[net] WebSocket OPEN — flushing 0 queued messages
[store] snapshot received: N agents
```

No `refresh_token` messages (spectator connections don't use auth tokens).

---

## 2. Spectator Chat → Agent Resources

**What it tests:** Spectator can send messages to Agent Resources and get
responses. This is the same path the Twitch chat bot uses.

### Steps

1. Open `http://localhost:3001/?spectator=1`
2. Open the browser console (F12)
3. Run:

```js
const net = game.registry.get("net");
net.send({
  type: "spectator_chat",
  fromName: "test_viewer",
  text: "hey Agent Resources what is everyone working on?"
});
```

### Expected

- Server console logs: `[spectator] chat from test_viewer: hey Agent Resources...`
- Agent Resources's agent status changes to `thinking`
- After a few seconds, a log entry from Agent Resources appears in the spectator view
- Agent Resources's response describes what agents are doing

### Test rejection of non-chat messages

```js
const net = game.registry.get("net");
net.send({ type: "hire", name: "Evil", provider: "cline", model: "gpt-4o" });
```

Server console should log: `[spectator] rejected message type: hire`
No agent should be hired.

---

## 3. Headless Client (Playwright + Canvas Capture)

**What it tests:** Headless Chromium loads the spectator client,
canvas renders, MediaRecorder captures frames.

### Without RTMP (local file output)

Set `STREAM_OUTPUT_FILE` to write to a file instead of RTMP:

```bash
STREAM_OUTPUT_FILE=./test-output.mp4 \
LIVESTREAM_SERVER_URL=http://localhost:3001 \
npx tsx scripts/livestream.ts
```

Wait 10–15 seconds, then Ctrl+C. Check the output file:

```bash
ffprobe test-output.mp4
```

You should see a valid video stream with the correct resolution
and fps. Play it to verify the office is rendering.

### With RTMP (YouTube/Twitch)

```bash
RTMP_URL=rtmp://a.rtmp.youtube.com/live2 \
RTMP_STREAM_KEY=your-stream-key \
LIVESTREAM_SERVER_URL=http://localhost:3001 \
npx tsx scripts/livestream.ts
```

Check YouTube Studio → Go Live → Stream Health:
- Ingestion status: Good
- Bitrate: ~3000 kbps
- Resolution: 1280x720 (or as configured)
- FPS: 30 (or as configured)

### Debugging

| Symptom | Fix |
|---------|-----|
| `Canvas not found` | Server not running or client failed to load — check `LIVESTREAM_SERVER_URL` |
| Black video | WebGL not rendering in headless — ensure `--use-gl=swiftshader` flag (already set) |
| FFmpeg exits immediately | Check `RTMP_URL` and `RTMP_STREAM_KEY` are correct |
| `[livestream] Playwright is not installed` | Run `pnpm add -D playwright && npx playwright install chromium` |
| No video in YouTube | Stream key may be wrong, or YouTube hasn't finished setting up the stream |

---

## 4. Twitch Chat Bot

**What it tests:** Twitch IRC → spectator_chat → Agent Resources → response
relayed back to Twitch chat.

### Setup

1. Get a Twitch OAuth token: https://twitchapps.com/tmi/
2. Set environment variables:

```bash
TWITCH_OAUTH_TOKEN=oauth:your-token-here \
TWITCH_BOT_NICK=yourbotname \
TWITCH_CHANNEL=yourchannel \
LIVESTREAM_SERVER_URL=ws://localhost:3001 \
npx tsx scripts/chat-bot.ts
```

### Expected console output

```
[chat-bot] connected to Twitch IRC — joining #yourchannel
[chat-bot] connecting to ws://localhost:3001/?spectator=1
[chat-bot] WebSocket connected — bridge active
```

### Test commands in Twitch chat

Type these in your Twitch chat:

| Command | Expected bot response |
|---------|----------------------|
| `!status` | "The office is live! Agents are working 24/7..." |
| `!help` | "Just type naturally! Agent Resources can answer questions..." |
| `!agents` | Forwards "list all agents" to Agent Resources, response relayed |
| `hey Agent Resources what is everyone doing?` | Forwarded to Agent Resources, response relayed |
| `hire a React agent named TestBot` | Forwarded to Agent Resources as a task command |

### Rate limiting test

Send 3 messages quickly from the same Twitch user. Only the first
should be forwarded — the next two are silently dropped (30s
cooldown per user by default).

### Profanity filter test

Send a message containing a blocked word. It should be silently
dropped — no response from the bot.

### Debugging

| Symptom | Fix |
|---------|-----|
| `Missing TWITCH_OAUTH_TOKEN` | Get token from https://twitchapps.com/tmi/ |
| IRC connection closes immediately | Token may be invalid or expired |
| `[chat-bot] (disconnected, dropping)` | Server not running — check `LIVESTREAM_SERVER_URL` |
| No response from Agent Resources | Agent Resources may be busy — check server console for `[spectator] chat from...` |

---

## 5. Full End-to-End Test

All three components running simultaneously:

```bash
# Terminal 1 — server
pnpm start

# Terminal 2 — headless client → RTMP
RTMP_URL=rtmp://a.rtmp.youtube.com/live2 \
RTMP_STREAM_KEY=your-key \
LIVESTREAM_SERVER_URL=http://localhost:3001 \
npx tsx scripts/livestream.ts

# Terminal 3 — Twitch chat bot
TWITCH_OAUTH_TOKEN=oauth:xxx \
TWITCH_BOT_NICK=yourbot \
TWITCH_CHANNEL=yourchannel \
LIVESTREAM_SERVER_URL=ws://localhost:3001 \
npx tsx scripts/chat-bot.ts
```

### Verification checklist

- [ ] YouTube Studio shows live video of the office
- [ ] Agents are moving and working in the stream
- [ ] Twitch chat `!status` gets a response
- [ ] Twitch chat message → Agent Resources responds → response appears in Twitch chat
- [ ] Agent Resources's response is also visible in the stream (agent status changes)
- [ ] Stream stays stable for 5+ minutes without drops
- [ ] Ctrl+C on livestream.ts cleanly shuts down FFmpeg and Chromium

---

## 6. Environment Variables Reference

| Variable | Default | Required for |
|----------|---------|-------------|
| `LIVESTREAM_SERVER_URL` | `http://localhost:3001` | Headless client, chat bot |
| `LIVESTREAM_USER_ID` | `dev` | Spectator target office |
| `RTMP_URL` | — | Headless client (RTMP mode) |
| `RTMP_STREAM_KEY` | — | Headless client (RTMP mode) |
| `STREAM_OUTPUT_FILE` | — | Headless client (local file mode) |
| `STREAM_WIDTH` | `1280` | Headless client |
| `STREAM_HEIGHT` | `720` | Headless client |
| `STREAM_FPS` | `30` | Headless client |
| `STREAM_BITRATE` | `3000k` | Headless client |
| `TWITCH_OAUTH_TOKEN` | — | Chat bot |
| `TWITCH_BOT_NICK` | `agentheights` | Chat bot |
| `TWITCH_CHANNEL` | `agentheights` | Chat bot |
| `CHAT_COOLDOWN_MS` | `30000` | Chat bot |
| `CHAT_MAX_LENGTH` | `500` | Chat bot |
