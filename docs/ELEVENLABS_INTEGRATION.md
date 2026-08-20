# ElevenLabs Speech Engine Integration — Agent Heights

## Overview

Two layers of audio for the office:

1. **Real-time voice conversations** — Player talks to agents via microphone.
   ElevenLabs Speech Engine handles STT + TTS + turn-taking; our server keeps
   all agent logic (Cline, MCP tools, task system, usage caps).
2. **Procedural office SFX** — Client-side synthesized sound effects (keyboard,
   chair, coffee machine, ambient hum). Zero API cost, no key needed.

The office becomes a place you can *talk* to.

---

## Why Speech Engine (not ElevenAgents)

ElevenLabs offers two products for voice AI:

| Product | Agent logic lives | Tools | Fit |
|---|---|---|---|
| **ElevenAgents** (Conversational AI) | ElevenLabs platform | Platform-managed | Standalone voice bots |
| **Speech Engine** | Your server | Your existing tools | ✅ Agent Heights |

Agent Heights already has a full agent runtime: Cline provider, MCP tools,
task queues, usage caps, subscription gating, personality system. Speech Engine
lets us keep all of that — ElevenLabs handles audio I/O only.

**Flow:**

```
Browser (mic) → ElevenLabs STT → transcript → our server
  → manager.chat(agentId, transcript)
  → agent LLM produces response (with tools, MCP, etc.)
  → server streams response text back via sendResponse()
  → ElevenLabs TTS → audio plays in browser
```

The SDK manages WebSocket routing, session lifecycle, ping/pong, turn-taking,
and interruption handling. We just provide the response text.

---

## 1. Speech Engine Architecture

### 1.1 Server Setup

New module `server/providers/voice.ts`:

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Create Speech Engine resource (one-time setup)
const engine = await elevenlabs.speechEngine.create({
  name: "Agent Heights Voice",
  speechEngine: { wsUrl: process.env.PUBLIC_WS_URL }, // wss://agentheights.com/ws-voice
  overrides: { firstMessage: true },
  tts: {
    modelId: "eleven_flash_v2_5",
    voiceId: "default",
    optimizeStreamingLatency: "2",
  },
  asr: {
    provider: "scribe_realtime",
    keywords: ["Agent Heights", "Cline", "Railway", "MCP"],
  },
});
// Store engine.engineId in ELEVENLABS_SPEECH_ENGINE_ID env var
```

### 1.2 Attaching to the HTTP Server

```typescript
const engine = await elevenlabs.speechEngine.get(process.env.ELEVENLABS_SPEECH_ENGINE_ID!);
engine.attach(httpServer, "/ws-voice", {
  debug: process.env.NODE_ENV !== "production",
  onInit: async (session) => {
    // Called when a new conversation starts
    // session.conversationId is available here
  },
  onTranscript: async (session, transcript) => {
    // 1. Identify which agent the user is talking to
    //    (from session metadata passed at conversation start)
    const agentId = session.conversationId.split(":")[0];
    const userId = session.conversationId.split(":")[1];

    // 2. Treat transcript as untrusted user input — validate
    const clean = transcript.trim().slice(0, 2000);
    if (!clean) return;

    // 3. Run through existing manager.chat() pipeline
    //    Collect the agent's response text
    const responseText = await collectAgentResponse(userId, agentId, clean);

    // 4. Stream response back — ElevenLabs converts to speech
    await session.sendResponse(responseText);
  },
  onClose: (session) => {
    // Clean disconnect
  },
  onDisconnect: (session) => {
    // Unexpected WebSocket drop
  },
});
```

### 1.3 Token Endpoint (Browser Auth)

The browser never sees the API key. Server issues a conversation token:

```typescript
// GET /api/voice-token?agentId=xxx
app.get("/api/voice-token", async (req, res) => {
  const agentId = req.query.agentId as string;
  const userId = req.user.id;

  const response = await elevenlabs.conversationalAi.conversations.getWebrtcToken({
    agentId: process.env.ELEVENLABS_SPEECH_ENGINE_ID!,
  });

  res.json({
    token: response.token,
    conversationId: `${agentId}:${userId}`, // passed to Speech Engine
  });
});
```

### 1.4 Browser Client

Using `@elevenlabs/react`:

```typescript
import { useConversation } from "@elevenlabs/react";

const conversation = useConversation({
  onConnect: () => console.log("voice connected"),
  onDisconnect: () => console.log("voice disconnected"),
  onError: (error) => console.error(error),
  onMessage: (msg) => {
    // Show agent's text response in the game feed
    if (msg.source === "agent") {
      store.addLogEntry(activeAgentId, { ts: Date.now(), kind: "text", text: msg.message });
    }
  },
});

async function startVoiceChat(agentId: string) {
  await navigator.mediaDevices.getUserMedia({ audio: true });
  const { token } = await fetch(`/api/voice-token?agentId=${agentId}`).then(r => r.json());
  await conversation.startSession({
    conversationToken: token,
    overrides: {
      agent: { firstMessage: undefined }, // no greeting — user initiated
    },
  });
}
```

### 1.5 Security: Untrusted Transcript

Speech-recognition text can contain prompt-injection attempts from user speech
or played audio. The server must:

- Treat transcript as untrusted user input (same as chat text today)
- Do NOT map raw speech text directly into tool calls or privileged actions
- The existing `manager.chat()` pipeline already validates: usage caps,
  subscription gating, ACL checks, 2000-char limit, agent status checks
- For tool-using agents, the agent's own system prompt + Cline's tool approval
  flow provides additional validation

---

## 2. Voice Assignment

Each agent gets a distinct voice. The Speech Engine resource has a default voice,
but we can override per-conversation by configuring voice IDs on the resource
or by using different Speech Engine resources per voice character.

Map personality types to ElevenLabs pre-made voice IDs:

| Title | Voice Character |
|---|---|
| Code Gremlin | Higher-pitched, energetic, mischievous |
| Bug Whisperer | Calm, gentle, soft-spoken |
| Refactor Goblin | Precise, tidy, measured |
| Docs Bard | Theatrical, warm, dramatic |
| Pipeline Plumber | Gruff, practical, no-nonsense |
| Prompt Wrangler | Laconic cowboy, slow drawl |
| Merge Medic | Calm urgency, clinical |
| Yak Shaver | Rambling, distracted, chatty |
| Loop Unroller | Robotic, literal, methodical |
| Cache Invalidator | Weary, wise, slow |
| The Manager | Upbeat, clear, mid-range |
| Office Manager | Warm, professional, welcoming female voice |

Voice IDs are stored in a config map in `server/providers/voice.ts`. Users can
optionally override per-agent in settings.

---

## 3. Text Chat Fallback (SPOKEN Prefix)

For text-only chat (no microphone), we keep the SPOKEN prefix pattern so agents
still get a voice line when typing:

```
When you reply to your boss, begin with SPOKEN: <one short sentence>
then your full response on a new line.
The SPOKEN line will be read aloud. The rest is text-only.
```

Server-side, `manager.ts` regex-parses `^SPOKEN: (.+?)\n` from the agent's text:

- Strips it from `entry.text` (what shows in the feed/detail panel)
- Sets `entry.spoken = "the one sentence"`
- Client sees `entry.spoken` → triggers TTS playback via a lightweight
  `fetch` to ElevenLabs TTS API (server-side proxy, no SDK needed for this path)
- Full text remains in the feed as before

This gives the desired UX for text chat: short line spoken aloud, longer
version in text. For voice chat, the full response is spoken naturally by
Speech Engine.

---

## 4. Greetings

### 4.1 Voice Greeting (Speech Engine)

When the player clicks the mic button on an agent, the Speech Engine session
starts with a first message override:

```typescript
await conversation.startSession({
  conversationToken: token,
  overrides: {
    agent: { firstMessage: `Hey boss, what's up?` }, // agent-specific greeting
  },
});
```

The first message is generated server-side from the agent's personality and
recent activity (e.g. "Just finishing up that thing you asked for.").

### 4.2 Text Greeting (Proximity)

When the player walks near an idle agent (no mic needed):

1. Client detects player within ~2 tiles of an idle agent
2. Client sends `{ type: "greet", agentId }` to server
3. Server runs a short greeting prompt (no tools, ~1 sentence)
4. Response appears as a speech bubble above the agent NPC
5. If voice is enabled, TTS plays the greeting line
6. Cooldown per agent (~30s) to avoid spamming

### 4.3 New ClientMsg

```typescript
| { type: "greet"; agentId: string }
| { type: "voice_start"; agentId: string }
| { type: "voice_stop" }
```

---

## 5. Procedural Office SFX

### 5.1 Approach

Extend the existing `AudioSystem` in `client/src/game/audio.ts` — zero API
cost, no key needed:

| Method | Description |
|---|---|
| `keyboardTyping()` | Rapid filtered noise bursts, typewriter feel |
| `chairSqueak()` | Short high-freq sweep with quick decay |
| `phoneRing()` | Two-tone oscillator, classic office phone |
| `doorOpen()` | Low creak — slow downward sweep + noise |
| `printerSound()` | Mechanical rhythm — repeated short noise bursts |
| `coffeePour()` | Liquid pour — filtered noise with pitch drop |
| `footstepOffice()` | Softer than world footsteps — carpet muffle |
| `notificationChime()` | Soft bell for task completion / toast |
| `agentSitDown()` | Chair + fabric rustle combo |
| `agentStandUp()` | Reverse of sit down |

Office ambient loop:

- Low-frequency drone (office HVAC)
- Occasional distant keyboard clicks (random intervals, very quiet)
- Occasional chair creak
- Very low volume, always on in office scene

### 5.2 Lift AudioSystem to Scene Level

The `AudioSystem` currently lives on `WorldLayer` (expedition/world map) only.
The office scene has no audio.

Changes to `client/src/game/scene.ts`:

- Create `AudioSystem` instance in `OfficeScene.create()`
- Pass it to `WorldLayer` (instead of WorldLayer creating its own)
- Office scene calls `audio.playOfficeAmbient()` on create
- Office scene calls SFX methods on events (agent sits, task done, etc.)

### 5.3 Event → SFX Mapping

| Game Event | SFX | Source |
|---|---|---|
| Agent sits at desk | `agentSitDown()` | AgentNPC sync → busy |
| Agent stands up (task assigned) | `agentStandUp()` | AgentNPC sync → hop |
| Agent walking | `footstepOffice()` | AgentNPC update loop |
| Task completed (confetti) | `notificationChime()` | AgentNPC sync → done |
| Task error | `errorBuzz()` | AgentNPC sync → error |
| Player opens modal | `uiClick()` | HUD button clicks |
| Player sends chat | `uiClick()` | HUD SAY button |
| Coffee machine interaction | `coffeePour()` | Scene coffee tile |
| Water cooler interaction | `waterBubbler()` | Scene cooler tile |
| Door / entering world | `doorOpen()` | Scene transition |
| Voice chat starts | `chairSqueak()` | Mic button click |
| Agent greeting (proximity) | TTS | Proximity detection |

---

## 6. Type Changes

### `shared/types.ts`

```typescript
// LogEntry — add optional spoken field (for text chat TTS fallback)
export interface LogEntry {
  ts: number;
  kind: LogKind;
  text: string;
  /** One-sentence line to be spoken via TTS. Stripped from text. */
  spoken?: string;
}

// ClientMsg — add greet + voice control
export type ClientMsg =
  | ...existing...
  | { type: "greet"; agentId: string }
  | { type: "voice_start"; agentId: string }
  | { type: "voice_stop" };

// GameSettings — add voice settings
export interface GameSettings {
  cline: { ... };
  game: { ... };
  railway: { ... };
  voice: {
    enabled: boolean;
    volume: number;       // 0..1
    ttsModel: string;     // "eleven_flash_v2_5" | "eleven_turbo_v2_5"
  };
}

export const DEFAULT_SETTINGS: GameSettings = {
  ...,
  voice: { enabled: true, volume: 0.7, ttsModel: "eleven_flash_v2_5" },
};

// ServerMsg — add voice state
export type ServerMsg =
  | ...existing...
  | { type: "voice_state"; active: boolean; agentId: string | null };
```

---

## 7. File Change Summary

| File | Change |
|---|---|
| `shared/types.ts` | Add `spoken?` to `LogEntry`, `"greet"` + `"voice_start"` + `"voice_stop"` to `ClientMsg`, `voice` to `GameSettings`, `"voice_state"` to `ServerMsg` |
| `server/providers/voice.ts` | **New file** — Speech Engine setup, attach to HTTP server, onTranscript callback → manager.chat(), token endpoint, voice ID map, TTS proxy for text chat fallback |
| `server/manager.ts` | Parse `SPOKEN:` prefix, add `greet()` method, add `collectResponse()` helper for voice callback, modify `buildSystemPrompt()` |
| `server/index.ts` | Handle `"greet"` / `"voice_start"` / `"voice_stop"` messages, add `/api/voice-token` HTTP route, attach Speech Engine on startup |
| `client/src/game/audio.ts` | Add office SFX methods, add office ambient loop |
| `client/src/game/scene.ts` | Lift AudioSystem to scene level, wire office audio, proximity greeting detection |
| `client/src/game/agent.ts` | Add speech bubble text for spoken lines, trigger SFX on state changes |
| `client/src/store.ts` | Handle `spoken` field on log entries, handle `voice_state` messages |
| `client/src/net.ts` | No binary WS frames needed — Speech Engine uses its own WebSocket + WebRTC |
| `client/src/ui/hud.ts` | Add mic button to agent detail panel, voice settings to settings modal, voice state indicator |
| `client/src/voice.ts` | **New file** — `@elevenlabs/react` `useConversation` wrapper, mic permission handling, voice session lifecycle |
| `.env.example` | Add `ELEVENLABS_API_KEY`, `ELEVENLABS_SPEECH_ENGINE_ID`, `PUBLIC_WS_URL` |
| `package.json` | Add `@elevenlabs/elevenlabs-js` (server) + `@elevenlabs/react` (client) |

---

## 8. Implementation Phases

### Phase 1 — Procedural Office SFX (zero cost, no API key)

- Lift `AudioSystem` to scene level
- Add office ambient loop
- Add office SFX methods (keyboard, chair, coffee, etc.)
- Wire SFX to game events (agent sit/stand, task done, coffee machine)
- No API key needed, zero cost, instant

### Phase 2 — Speech Engine Setup + Voice Chat

- Add `ELEVENLABS_API_KEY` + `ELEVENLABS_SPEECH_ENGINE_ID` to env
- Create Speech Engine resource (one-time CLI script)
- Create `server/providers/voice.ts` — attach to HTTP server
- Implement `onTranscript` callback → `manager.chat()` → `sendResponse()`
- Add `/api/voice-token` endpoint
- Add `client/src/voice.ts` — `@elevenlabs/react` wrapper
- Add mic button to agent detail panel in HUD
- Voice assignment map per personality
- Usage cap + subscription gating applies to voice chats (same as text chat)

### Phase 3 — Text Chat TTS + Greetings

- Implement SPOKEN prefix parsing in `manager.ts`
- Server-side TTS proxy for `entry.spoken` (lightweight fetch, no SDK)
- Client plays TTS audio on log entries with `spoken` field
- Add `"greet"` ClientMsg + `manager.greet()` method
- Office Manager greeting: trigger on her existing greeting state
- Agent proximity greetings: distance check in scene update loop
- Cooldown system to prevent spam
- Speech bubble text above NPC for the spoken line

### Phase 4 — Polish + Spatial Audio

- Volume scales with distance from agent (closer = louder)
- Voice activity indicator on agent NPCs (speaking animation)
- Interruption handling (user interrupts agent mid-sentence)
- Emotional voice settings (stressed when working, relaxed when idle)
- ElevenLabs Sound Effects API for special event sounds (optional)

---

## 9. Environment Variables

```bash
# ElevenLabs Speech Engine
# Get an API key at https://elevenlabs.io — free tier includes 10K chars/month
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Speech Engine resource ID (created once via setup script)
# Created by running: tsx scripts/create-speech-engine.ts
ELEVENLABS_SPEECH_ENGINE_ID=your-speech-engine-id

# Public WebSocket URL for Speech Engine server (must be reachable by ElevenLabs)
# In production: wss://agentheights.com/ws-voice
# In dev (with ngrok): wss://your-ngrok-url.ngrok.app/ws-voice
PUBLIC_WS_URL=wss://agentheights.com/ws-voice
```

If `ELEVENLABS_API_KEY` is not set, voice features gracefully degrade:
- No voice chat (mic button hidden or disabled)
- No TTS for text chat (agents are silent, text-only as today)
- Procedural SFX still work (no API key needed)
- Settings modal shows voice options as disabled

---

## 10. Cost Considerations

- **Speech Engine (voice chat)**: Pay per conversation minute. STT + TTS + LLM
  turn-taking handled by ElevenLabs. Cost depends on conversation length.
- **TTS (text chat fallback)**: ~$0.30 per 1K characters. Only the one-sentence
  SPOKEN line is synthesized (~50-100 chars per response).
- **Mitigation**: Usage caps apply to voice chats (same pipeline as text chat).
  Subscription gating: voice chat requires entry fee or subscription. Skip TTS
  for tool/status logs. Cache common greetings.
- **Free tier**: 10K characters/month — enough for development + testing.

---

## 11. Competitor Reference

From the HERMES.md competitive analysis:

> **BossRoom** — Multiplayer 3D office. Voice chat (Deepgram + Inworld TTS with
> HRTF spatial audio). Agents do real work. Shows the voice embodiment angle.
> Spatial audio is interesting — agents have *voices* that get louder as you
> approach.

Speech Engine gives Agent Heights the same capability with key advantages:

- **Agent logic stays server-side** — all tools, MCP servers, task system,
  usage caps remain in our control (BossRoom uses platform-managed agents)
- **SPOKEN prefix for text chat** — separates spoken line from full text
  response, so text users get voice too without a mic
- **Existing pipeline reuse** — voice chat goes through the same `manager.chat()`
  pipeline as text chat, so subscription gating, ACL checks, usage caps, and
  agent personality all apply automatically

---

## 12. Future Enhancements

- **Spatial audio**: Volume scales with distance from agent (closer = louder)
- **Voice cloning**: Let users clone their own voice for agents
- **Multi-agent voice**: Agents talk to each other, each with their own voice,
  audible in the office
- **Voice messages**: Asynchronous voice messages (player records, agent
  responds when idle)
- **Emotional voice**: Adjust stability/style based on agent status (stressed
  when working, relaxed when idle)
- **Custom wake words**: "Hey [agent name]" to start a voice session without
  clicking
- **Phone integration**: ElevenLabs SIP support — call your agents from a phone
