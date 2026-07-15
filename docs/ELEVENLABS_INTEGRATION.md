# ElevenLabs Integration — Sprite Heights

## Overview

Give agents **voices**. When an agent says something, a short one-sentence line is
spoken aloud via ElevenLabs TTS while the full response stays in the text feed.
Add generative sound effects to the office so it feels alive — keyboard typing,
coffee machines, chairs, ambient office hum.

The office becomes audible.

---

## Architecture

```
Agent LLM produces text
  → Server parses SPOKEN: prefix
  → Strips spoken line from displayed text
  → Calls ElevenLabs streaming TTS with the spoken line
  → Streams audio chunks back through WebSocket as binary frames
  → Client plays audio + shows full text in feed
```

```
Player walks near idle agent
  → Client detects proximity
  → Sends "greet" message to server
  → Server runs lightweight greeting prompt (no tools, ~1 sentence)
  → ElevenLabs TTS on the greeting
  → Audio plays, short text bubble appears above agent
```

---

## 1. Agent Voice (TTS)

### 1.1 The SPOKEN Prefix Pattern

The system prompt is modified to instruct agents to begin replies with a single
spoken sentence:

```
When you reply to your boss, begin with SPOKEN: <one short sentence>
then your full response on a new line.
The SPOKEN line will be read aloud. The rest is text-only.
```

Server-side, `manager.ts` regex-parses `^SPOKEN: (.+?)\n` from the agent's text:

- Strips it from `entry.text` (what shows in the feed/detail panel)
- Sets `entry.spoken = "the one sentence"`
- Client sees `entry.spoken` → triggers TTS playback
- Full text remains in the feed as before

This gives exactly the desired UX: short line spoken aloud, longer version in text.

### 1.2 Server-Side Voice Proxy

API key stays server-side. New module `server/providers/voice.ts`:

- Maintains a voice ID map (assign each agent a voice based on personality/title)
- Calls ElevenLabs streaming TTS endpoint:
  `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`
- Streams audio chunks back through the WebSocket as binary frames
- Uses `eleven_turbo_v2_5` model for lowest latency (~300ms first-byte)

### 1.3 Voice Assignment

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
| Yuki (Office Manager) | Warm, professional, welcoming female voice |

Voice IDs are stored in a config map. Users can optionally override per-agent
in settings.

### 1.4 WebSocket Binary Frames

Audio is streamed as binary WebSocket frames alongside the existing JSON text
frames:

- JSON frame: `{ type: "log", agentId, entry: { ts, kind, text, spoken } }` —
  same as today, just with the new `spoken` field
- Binary frames: raw audio chunks (MP3 or PCM) prefixed with a 4-byte agent ID
  header so the client knows which agent is "talking"
- Client decodes via Web Audio API (`decodeAudioData`) or a hidden `<audio>`
  element for MP3 streaming

Frame format for binary:

```
[4 bytes: agent ID length][N bytes: agent ID][M bytes: audio chunk]
```

Client reassembles chunks per agent, plays through the audio system.

### 1.5 Latency & Cost

- **eleven_turbo_v2_5**: ~300ms first-byte latency, good for real-time speech
- **eleven_multilingual_v2**: higher quality, ~1s latency, fallback
- **Cost**: ~$0.30 per 1K characters for standard voices
- **Mitigation**: Only TTS the one-sentence spoken line (~50-100 chars), not
  the full response. Cache common greetings. Skip TTS for tool/status logs.

---

## 2. Greetings

### 2.1 Yuki Greeting (Already Visual — Add Audio)

YukiNPC already has a greeting state machine
(`client/src/game/agent.ts:497-551`): when the player enters her office zone,
she stands up, walks to a greet tile, faces the player, and idles for 3.5
seconds. Currently no text or audio is produced.

Enhancement:

1. When YukiNPC enters "greeting" state, client sends `{ type: "greet",
   agentId: YUKI_ID }` to server
2. Server runs a lightweight greeting prompt (no tools, ~1 sentence): *"Your
   boss just walked into your office. Greet them warmly in one short sentence."*
3. ElevenLabs TTS on the greeting line
4. Audio plays, short text bubble appears above Yuki

### 2.2 Agent Proximity Greetings

When the player walks near an idle agent (similar to Yuki's zone detection but
simpler — distance check):

1. Client detects player within ~2 tiles of an idle agent they haven't greeted
   recently
2. Client sends `{ type: "greet", agentId }` to server
3. Server runs a short greeting prompt — lighter than a full chat:
   - Shorter prompt (no tool use, no workspace context)
   - Instructs agent to say one casual line in character
   - Examples: "Hey boss, what's up?" / "Oh, hey! Need something?" / "Just
     finishing up that thing you asked for."
4. TTS on the greeting, speech bubble above the agent NPC
5. Cooldown per agent (~30s) to avoid spamming

### 2.3 New ClientMsg

Add to `shared/types.ts`:

```typescript
| { type: "greet"; agentId: string }
```

Server handles this in `server/index.ts` alongside the existing `"chat"` case.
Manager gets a new `greet(agentId)` method that:

- Checks agent is idle (no greeting busy agents)
- Runs a minimal prompt through the provider
- Parses `SPOKEN:` line (or uses the whole response if short enough)
- Sends TTS + log entry as usual

---

## 3. Generative Sound Effects

### 3.1 Approach: Hybrid

**Procedural (client-side, zero cost)** — extend the existing `AudioSystem`
in `client/src/game/audio.ts`:

New office SFX methods:

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

New office ambient loop:

- Low-frequency drone (office HVAC)
- Occasional distant keyboard clicks (random intervals, very quiet)
- Occasional chair creak
- Very low volume, always on in office scene

**ElevenLabs Sound Effects API (server-side, sparingly)**:

- Endpoint: `POST https://api.elevenlabs.io/v1/sound-generation`
- Use for unique ambient loops or special event sounds that are hard to
  synthesize:
  - "Quiet open-plan office with distant conversations and keyboard typing"
    (30s loop for office ambient)
  - "Celebratory office party pop" (for task completion)
  - "Sci-fi notification ping" (for Railway deploy events)
- Cache generated sounds (deterministic per prompt + seed) — generate once,
  store as base64 or file, replay locally
- Higher quality than procedural, but API cost per generation

### 3.2 Office Audio System

The `AudioSystem` currently lives on `WorldLayer` (the expedition/world map)
only. The office scene has no audio.

**Recommended**: Lift `AudioSystem` to the scene level so both office and world
share one `AudioContext`. This avoids dual AudioContext issues and lets the
office play SFX + ambient while the world plays biome music.

Changes to `client/src/game/scene.ts`:

- Create `AudioSystem` instance in `OfficeScene.create()`
- Pass it to `WorldLayer` (instead of WorldLayer creating its own)
- Office scene calls `audio.playOfficeAmbient()` on create
- Office scene calls SFX methods on events (agent sits, task done, etc.)
- World layer calls `audio.playMusic(biome)` when entering world (already
  works, just references the shared instance)

### 3.3 Event → SFX Mapping

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
| Yuki greeting | TTS + `chairSqueak()` | YukiNPC greeting state |
| Agent greeting (proximity) | TTS | Proximity detection |

---

## 4. Type Changes

### `shared/types.ts`

```typescript
// LogEntry — add optional spoken field
export interface LogEntry {
  ts: number;
  kind: LogKind;
  text: string;
  /** One-sentence line to be spoken via TTS. Stripped from text. */
  spoken?: string;
}

// ClientMsg — add greet
export type ClientMsg =
  | ...existing...
  | { type: "greet"; agentId: string };

// GameSettings — add voice settings
export interface GameSettings {
  cline: { ... };
  game: { ... };
  railway: { ... };
  voice: {
    enabled: boolean;
    volume: number;       // 0..1
    model: string;        // "eleven_turbo_v2_5" | "eleven_multilingual_v2"
  };
}

export const DEFAULT_SETTINGS: GameSettings = {
  ...,
  voice: { enabled: true, volume: 0.7, model: "eleven_turbo_v2_5" },
};
```

---

## 5. File Change Summary

| File | Change |
|---|---|
| `shared/types.ts` | Add `spoken?` to `LogEntry`, add `"greet"` to `ClientMsg`, add `voice` to `GameSettings` |
| `server/providers/voice.ts` | **New file** — ElevenLabs TTS client, voice ID map, streaming audio relay |
| `server/manager.ts` | Parse `SPOKEN:` prefix, add `greet()` method, call voice provider, modify `buildSystemPrompt()` |
| `server/index.ts` | Handle `"greet"` message, handle binary WS frames for audio streaming |
| `client/src/game/audio.ts` | Add TTS playback method, add office SFX, add office ambient loop |
| `client/src/game/scene.ts` | Lift AudioSystem to scene level, wire office audio, proximity greeting detection |
| `client/src/game/agent.ts` | Add speech bubble text for spoken lines, trigger SFX on state changes |
| `client/src/store.ts` | Handle `spoken` field on log entries, trigger audio playback |
| `client/src/net.ts` | Handle binary WS frames for audio chunks |
| `client/src/ui/hud.ts` | Add voice settings to settings modal (enable/disable, volume slider) |
| `.env.example` | Add `ELEVENLABS_API_KEY` |
| `package.json` | Add `@elevenlabs/elevenlabs-js` dependency (optional — can also use raw fetch) |

---

## 6. Implementation Phases

### Phase 1 — Office Audio + Procedural SFX

- Lift `AudioSystem` to scene level
- Add office ambient loop
- Add office SFX methods (keyboard, chair, coffee, etc.)
- Wire SFX to game events (agent sit/stand, task done, coffee machine)
- No API key needed, zero cost, instant

### Phase 2 — Agent Voice (TTS)

- Add `ELEVENLABS_API_KEY` to env
- Create `server/providers/voice.ts`
- Modify `buildSystemPrompt()` to instruct `SPOKEN:` prefix
- Parse `SPOKEN:` in manager, set `entry.spoken`
- Stream audio through WebSocket binary frames
- Client plays TTS audio on log entries with `spoken` field
- Voice assignment map per personality

### Phase 3 — Greetings

- Add `"greet"` ClientMsg
- Implement `manager.greet()` — lightweight prompt, no tools
- Yuki greeting: trigger on her existing "greeting" state
- Agent proximity greetings: distance check in scene update loop
- Cooldown system to prevent spam
- Speech bubble text above NPC for the spoken line

### Phase 4 — ElevenLabs Sound Effects (Optional)

- Generate high-quality ambient loops via Sound Effects API
- Cache generated sounds locally
- Use for special events that are hard to synthesize procedurally
- Fallback to procedural SFX if API is unavailable

---

## 7. Environment Variables

```bash
# .env addition
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

Get a key at https://elevenlabs.io — free tier includes 10K characters/month.

If `ELEVENLABS_API_KEY` is not set, voice features gracefully degrade:
- No TTS playback (agents are silent, text-only as today)
- Procedural SFX still work (no API key needed)
- Settings modal shows voice options as disabled

---

## 8. Competitor Reference

From the HERMES.md competitive analysis:

> **BossRoom** — Multiplayer 3D office. Voice chat (Deepgram + Inworld TTS with
> HRTF spatial audio). Agents do real work. Shows the voice embodiment angle.
> Spatial audio is interesting — agents have *voices* that get louder as you
> approach. Sprite Heights could add this.

This integration brings that capability to Sprite Heights with ElevenLabs as the TTS
provider, plus the unique `SPOKEN:` prefix pattern that separates the spoken
line from the full text response — something BossRoom doesn't do.

---

## 9. Future Enhancements

- **Spatial audio**: Volume scales with distance from agent (closer = louder)
- **Voice cloning**: Let users clone their own voice for agents
- **Multi-agent conversation**: Agents talk to each other, each with their own
  voice, audible in the office
- **Voice messages**: Player can speak to agents via microphone (STT → agent →
  TTS response loop)
- **Emotional voice settings**: Adjust stability/style based on agent status
  (stressed when working, relaxed when idle)
- **ElevenLabs Conversational AI**: Replace the current prompt → TTS pipeline
  with ElevenLabs' real-time conversational AI agent for lower latency
