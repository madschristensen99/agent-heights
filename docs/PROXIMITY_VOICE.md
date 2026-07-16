# Agent Heights — Proximity Voice Chat

Real-time voice chat between players based on in-world distance. Players who
walk near each other in offices or the outside world can hear each other; walk
away and the voice fades to silence.

---

## 1. Overview

Proximity voice chat lets players talk to each other using their microphones
while moving around the shared game world. Volume is determined by the pixel
distance between two players — close players hear each other clearly, distant
players hear nothing.

**Scope:**
- Works in any room (private offices + HQ² lobby)
- Works outside in the infinite world (as long as players share the same room)
- Distance-based volume attenuation (spatial audio feel)
- Toggle mic on/off, or push-to-talk

**Out of scope (for now):**
- Cross-room voice (players in different rooms can't hear each other)
- Server-side recording or transcription
- Voice-to-text or AI-driven voice features

---

## 2. Architecture: WebRTC Peer-to-Peer

### Why WebRTC

| Concern | WebRTC P2P | Server-Relayed | Third-Party SDK |
|---------|-----------|----------------|-----------------|
| Latency | Lowest (direct) | Higher (hop through server) | Low |
| Server bandwidth | Minimal (signaling only) | Scales with speakers | None |
| NAT traversal | Needs STUN/TURN | None | Handled by SDK |
| Complexity | Medium | Low-Medium | Low |
| Cost | Free (STUN) / cheap (TURN) | Server bandwidth | Free tier → paid |

**Decision: WebRTC P2P mesh.** Rooms typically have 2–10 players, so a full
mesh (each client connects directly to every other voice-enabled player) is
feasible without a selective forwarding unit (SFU).

### How it works

```
Player A                          Server (signaling)                    Player B
   |                                  |                                    |
   |--- voice_start ----------------->|                                    |
   |                                  |--- voice_peer (A) --------------->|
   |                                  |<--- voice_start -------------------|
   |<--- voice_peer (B) --------------|                                    |
   |                                  |                                    |
   |--- voice_offer (B, SDP) -------->|--- voice_offer (A, SDP) ---------->|
   |                                  |                                    |
   |<--- voice_answer (B, SDP) -------|<--- voice_answer (A, SDP) ---------|
   |                                  |                                    |
   |--- voice_ice (B, candidate) ---->|--- voice_ice (A, candidate) ------>|
   |<--- voice_ice (B, candidate) ----|<--- voice_ice (A, candidate) ------|
   |                                  |                                    |
   |<======= direct audio (P2P) ============================>|
   |                                  |                                    |
```

1. **Mic capture** — Client calls `getUserMedia({ audio: true })` with echo
   cancellation, noise suppression, and auto gain control enabled.
2. **Signaling** — The existing WebSocket connection relays SDP
   offers/answers and ICE candidates between players. The server acts as a
   dumb relay — it never touches audio data.
3. **Peer connection** — Each client creates an `RTCPeerConnection` per
   voice peer, adds the local mic track, and negotiates via the signaling
   channel.
4. **Audio output** — Incoming remote streams are routed through a
   per-peer `GainNode` into a shared `AudioContext` destination.
5. **Distance attenuation** — Every frame, the client adjusts each peer's
   `GainNode` based on the pixel distance between the local player and that
   peer's sprite position (already synced via `player_moved` messages at
   10 Hz).

### NAT traversal

- **STUN** — Google's free STUN server (`stun:stun.l.google.com:19302`)
  handles ~85% of NAT scenarios.
- **TURN** — Needed for symmetric NATs (~10–15% of connections). Can be
  self-hosted (coturn) or use a managed service (Twilio, Xirsys). Configured
  via environment variables — optional, not required for dev.

---

## 3. Message Types

### New `ClientMsg` variants

```typescript
| { type: "voice_start" }
| { type: "voice_offer"; targetUserId: string; sdp: string }
| { type: "voice_answer"; targetUserId: string; sdp: string }
| { type: "voice_ice"; targetUserId: string; candidate: string }
| { type: "voice_stop" }
```

### New `ServerMsg` variants

```typescript
| { type: "voice_peer"; userId: string; name: string }
| { type: "voice_offer"; fromUserId: string; sdp: string }
| { type: "voice_answer"; fromUserId: string; sdp: string }
| { type: "voice_ice"; fromUserId: string; candidate: string }
| { type: "voice_peer_left"; userId: string }
```

The server never generates or modifies SDP/candidates — it only relays them
between the two intended peers using `targetUserId` / `fromUserId`.

---

## 4. Server Changes

### Signaling relay (`server/index.ts`)

Add cases to the existing `ws.on("message")` switch:

- **`voice_start`** — Mark the user as voice-active (track in a `Set<string>`
  or add `voiceActive: boolean` to `UserSession`). Notify all other
  voice-active players in the same room with `voice_peer`. Also send the
  joining player a `voice_peer` for each existing voice-active peer.
- **`voice_offer` / `voice_answer` / `voice_ice`** — Look up
  `targetUserId`'s session and relay the message with `fromUserId` set to
  the sender's ID. Drop if the target isn't in the same room.
- **`voice_stop`** — Unmark the user as voice-active. Notify all
  voice-active peers in the room with `voice_peer_left`.
- **On WebSocket disconnect** — Same as `voice_stop`: clean up voice-active
  state and notify peers.

### Proximity filtering (optional optimization)

For small rooms (≤ 10 players), connecting all voice-active peers is fine.
For larger gatherings, the server can check `RoomPlayer` distances and only
send `voice_peer` notifications for pairs within a threshold (e.g., 800px).
This limits the mesh size. The client still handles per-frame volume
attenuation — the server filter just avoids creating connections that would
be inaudible anyway.

### Rate limiting (`server/ratelimit.ts`)

```typescript
voice_ice:    { max: 200, refillPerSec: 50 },
voice_offer:  { max: 20,  refillPerSec: 2  },
voice_answer: { max: 20,  refillPerSec: 2  },
```

ICE candidates can arrive in bursts during connection setup — the limit is
generous to avoid dropping candidates mid-negotiation.

---

## 5. Client: VoiceManager (`client/src/voice.ts`)

A new class that encapsulates all WebRTC logic.

### Responsibilities

- **Mic management** — `getUserMedia` with audio constraints, track
  lifecycle, mute/unmute.
- **Peer connection management** — Create/destroy `RTCPeerConnection` per
  peer, add local track, handle incoming tracks.
- **Signaling** — Send/receive SDP and ICE messages via the existing `Net`
  WebSocket.
- **Audio mixing** — Route each peer's stream through a `GainNode` into a
  shared `AudioContext`.
- **Distance attenuation** — Update per-peer `GainNode` values based on
  positions passed in from the game scene.

### API sketch

```typescript
class VoiceManager {
  // Lifecycle
  start(): Promise<void>     // Request mic, signal voice_start to server
  stop(): void               // Close all peers, stop mic, signal voice_stop
  setMuted(muted: boolean): void

  // Signaling (called by store when voice_* messages arrive)
  onPeer(userId: string, name: string): void
  onOffer(fromUserId: string, sdp: string): void
  onAnswer(fromUserId: string, sdp: string): void
  onIce(fromUserId: string, candidate: string): void
  onPeerLeft(userId: string): void

  // Per-frame volume update (called from scene.update)
  updateVolumes(
    myX: number, myY: number,
    players: Map<string, { x: number; y: number }>
  ): void

  // State
  readonly active: boolean
  readonly muted: boolean
  readonly peers: Map<string, { name: string; connected: boolean }>
}
```

### RTC configuration

```typescript
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // TURN added from env if configured
  ],
};
```

### Distance → gain mapping

```typescript
const MAX_VOICE_DISTANCE = 600; // pixels (~9 tiles)

function distanceToGain(dist: number): number {
  const t = Math.max(0, 1 - dist / MAX_VOICE_DISTANCE);
  return t * t; // exponential falloff — more natural than linear
}
```

- `0px` → gain `1.0` (full volume, right next to each other)
- `300px` → gain `0.25` (halfway, noticeably quieter)
- `600px` → gain `0.0` (inaudible)

The `MAX_VOICE_DISTANCE` can be different for indoors vs. outdoors — e.g.,
`600` inside offices, `1000` in the open world. The scene knows whether the
player is outside via `world.isOutside()`.

---

## 6. Client: Scene Integration (`client/src/game/scene.ts`)

- Instantiate `VoiceManager` on first user gesture (browsers require a user
  interaction before `AudioContext` / `getUserMedia`).
- In `update()`, call:
  ```typescript
  this.voice.updateVolumes(
    this.player.x, this.player.y,
    this.store.roomPlayers  // Map<userId, { x, y, ... }>
  );
  ```
- Wire up `voice_peer` / `voice_peer_left` / `voice_offer` / etc. from the
  store's message handler to `VoiceManager` methods.
- On scene shutdown, call `voice.stop()` to clean up connections.

---

## 7. Client: UI (`client/src/ui/hud.ts`)

### Mic toggle button

Add a 🎤 button to the top bar (next to ROOMS / SETTINGS):

- **Inactive** — Normal appearance, mic is off
- **Active** — Highlighted/green, mic is on
- **Muted** — Red strikethrough, mic on but muted (push-to-talk released)

### Push-to-talk

- Hold **`V`** key to transmit (unmute while held)
- Release `V` to mute
- Alternatively, click 🎤 to toggle always-on mode
- Both modes can coexist: toggle enables voice, `V` acts as PTT within that

### Visual indicators

- **Speaking indicator** — When a remote peer's audio level is above a
  threshold (via `AudioContext.createAnalyser()`), show a small speaker icon
  above their sprite. This requires an `AnalyserNode` per peer.
- **Voice status panel** — Small overlay showing connected voice peers'
  names and connection quality (optional, nice-to-have).
- **Hint text** — Add "· V to talk" to the existing hint line:
  > `WASD/arrows move · E talk/board · H hire · F feed · B board · V voice · click an agent · ESC close`

### Permission handling

- First mic toggle triggers browser permission prompt
- If denied, show a toast: "Microphone access denied — check browser settings."
- If no mic device found, show: "No microphone detected."

---

## 8. Environment Variables

Add to `.env.example`:

```bash
# Optional TURN server for NAT traversal (most setups don't need this)
# Self-host: https://github.com/coturn/coturn
# Managed: Twilio NAT Traversal Service, Xirsys, etc.
TURN_SERVER=
TURN_USERNAME=
TURN_CREDENTIAL=
```

The client reads these from `import.meta.env.VITE_TURN_*` (prefixed with
`VITE_` so Vite exposes them to the browser).

---

## 9. Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `shared/types.ts` | Modify | Add voice signaling messages to `ClientMsg` / `ServerMsg` |
| `server/index.ts` | Modify | Handle `voice_start` / `voice_stop` / signaling relay |
| `server/ratelimit.ts` | Modify | Add rate limits for voice messages |
| `client/src/voice.ts` | **Create** | `VoiceManager` class — WebRTC, mic, gain control |
| `client/src/store.ts` | Modify | Route voice messages to `VoiceManager` |
| `client/src/game/scene.ts` | Modify | Integrate `VoiceManager`, per-frame volume updates |
| `client/src/ui/hud.ts` | Modify | Mic toggle button, PTT key, hint text, indicators |
| `.env.example` | Modify | Add optional TURN server config |

---

## 10. Testing Plan

### Manual testing

1. **Two browser tabs, same room** — Enable voice in both, verify you can
   hear yourself (with headphones to avoid echo). Walk away and verify
   volume decreases.
2. **Two browser tabs, different rooms** — Enable voice in both. Verify no
   audio — peers in different rooms should never connect.
3. **Mic permission denied** — Deny mic in browser settings, click toggle,
   verify toast error.
4. **Disconnect** — Close one tab, verify the other gets `voice_peer_left`
   and cleans up the connection.
5. **Room switching** — Player A in office, player B joins, voice connects.
   Player B switches to HQ² — verify voice disconnects.
6. **Outside world** — Both players go outside, walk far apart, verify voice
   fades. Walk back together, verify it returns.

### Automated testing

- Server-side: Unit test the signaling relay — mock WebSocket pairs, verify
  `voice_offer` is forwarded to the correct `targetUserId` and not to others.
- Client-side: Mock `RTCPeerConnection` and `getUserMedia` (jsdom doesn't
  support WebRTC; use a mock library or skip in CI).

---

## 11. Future Enhancements

- **Selective forwarding (SFU)** — For rooms with 15+ players, switch from
  mesh to an SFU (LiveKit, mediasoup) to avoid O(n²) connections.
- **Spatial audio (HRTF)** — Use `RTCRtpReceiver.getParameters()` with
  positional audio (panner nodes) so voice comes from the direction of the
  speaker, not just louder/quieter.
- **Voice activity detection** — Show a "speaking" indicator above players
  who are actively talking (using `AnalyserNode` data).
- **Mute indicators** — Show a muted icon above players who have voice
  enabled but are muted.
- **Voice-to-text** — Use Web Speech API or a server-side transcription
  service to optionally show subtitles for voice chat.
- **Proximity text chat** — Add text-based proximity chat as a fallback for
  players without microphones or who prefer text.
- **Voice channels** — Persistent voice rooms separate from physical rooms
  (e.g., a "team channel" that works across rooms).
