# Agent HQ — Projector Screen & Screen Sharing

A projector screen on the office wall where players can present their screen
to everyone in the room. Walk up, press E, pick what to share, and your
screen appears on the projector for all other players to see.

---

## 1. Overview

The projector screen lets one player at a time share their screen (or a
window, or a browser tab) with everyone else in the same room. The shared
content is rendered live on a projector screen sprite in the game world —
other players walk up and watch.

**Scope:**
- One active presenter per room at a time
- Works in any room (private offices + HQ² lobby)
- Viewer cap: **10 players** (P2P mesh limit — no SFU needed)
- Presenter shares via `getDisplayMedia()` (browser-native screen picker)
- Viewers see the stream rendered on the projector screen in the game world
- Presenter can stop sharing at any time (E again, or browser "Stop sharing")
- Audio from the shared tab/window optional (browser-dependent)

**Out of scope (for now):**
- Multiple simultaneous presenters
- Recording presentations
- Presentations across rooms (only same-room players can view)
- Mobile screen capture (iOS Safari doesn't support `getDisplayMedia`)

---

## 2. Architecture: WebRTC P2P (Same as Voice Chat)

### Why WebRTC P2P

The existing proximity voice chat design (`docs/PROXIMITY_VOICE.md`) already
specifies a WebRTC P2P mesh with the server as a dumb signaling relay. The
projector screen reuses the **exact same signaling architecture** — the only
difference is the media track type (video+audio from `getDisplayMedia` instead
of audio from `getUserMedia`).

| Concern | WebRTC P2P | LiveKit SFU |
|---------|-----------|-------------|
| Dependencies | None (browser APIs) | `livekit-client` + LiveKit server |
| Server bandwidth | Minimal (signaling only) | Scales with viewers |
| Infra needed | None (STUN free, TURN optional) | LiveKit Cloud (paid) or self-hosted |
| Complexity | Medium | Low (but new infra) |
| Scale | ≤ 10 viewers (mesh) | 50+ viewers |
| Fit for Agent HQ | ✅ Perfect — offices are small | Overkill for 2-10 players |

**Decision: WebRTC P2P mesh, capped at 10 viewers.** Rooms typically have
2-10 players. One presenter → N viewers = N peer connections, which is
trivial. If we ever need larger audiences, we swap in an SFU later — the
signaling protocol stays the same.

### How it works

```
Presenter                          Server (signaling)                    Viewers in room
   |                                   |                                    |
   |--- screen_start ----------------->|                                    |
   |                                   |--- screen_state (presenter) ------>|
   |                                   |                                    |
   |  getDisplayMedia() → MediaStream  |                                    |
   |                                   |                                    |
   |<--- screen_peer (viewer) ---------|--- screen_peer (presenter) ------->|
   |                                   |                                    |
   |--- screen_offer (viewer, SDP) --->|--- screen_offer (presenter, SDP)->|
   |<--- screen_answer (viewer, SDP) --|<--- screen_answer (presenter, SDP)-|
   |--- screen_ice (viewer, candidate)->|--- screen_ice (presenter, cand.)->|
   |<--- screen_ice (viewer, candidate)-|<--- screen_ice (presenter, cand.)-|
   |                                   |                                    |
   |<==== video stream (P2P) ============================>|                 |
   |                                   |                                    |
   |                                   |  video.srcObject = stream          |
   |                                   |  projectorTexture.draw(video)      |
```

1. **Presenter starts** — Player walks to projector, presses E, confirms.
   Client calls `navigator.mediaDevices.getDisplayMedia()` — browser shows
   the native screen/window/tab picker.
2. **Server notifies room** — Server marks the room as having an active
   presenter and broadcasts `screen_state` to all players in the room.
   Existing players get `screen_peer` for the presenter; the presenter gets
   `screen_peer` for each viewer.
3. **Peer connection negotiation** — Same SDP offer/answer/ICE exchange as
   voice chat. The presenter creates one `RTCPeerConnection` per viewer,
   adds the screen track (video + optional audio), and negotiates.
4. **Viewer renders stream** — Each viewer receives the remote `MediaStream`,
   assigns it to a hidden `<video>` element, and renders that video as a
   Phaser texture on the projector screen sprite.
5. **Presenter stops** — Player presses E again, or the browser's "Stop
   sharing" button fires `track.ended`. Client closes all peer connections
   and sends `screen_stop`. Server broadcasts `screen_state` with
   `presenterId: null`.

### NAT traversal

Same as voice chat:
- **STUN** — Google's free STUN server (`stun:stun.l.google.com:19302`)
- **TURN** — Optional, for symmetric NATs. Same env vars as voice.

### Relationship to Voice Chat

The projector screen and voice chat share identical signaling patterns. If
both are built, they should be unified into a single `WebRTCManager` that
handles both audio and video tracks per peer connection — one
`RTCPeerConnection` per peer, with audio and screen tracks added as needed.
This avoids maintaining duplicate peer connections.

If voice chat is built first, the projector screen reuses:
- The same `RTCPeerConnection` pool (or adds a video track to existing connections)
- The same STUN/TURN configuration
- The same rate-limit buckets for ICE candidates
- The same server relay logic (just different message type prefixes)

If the projector screen is built first, it establishes 80% of the voice chat
signaling — just swap `getDisplayMedia` for `getUserMedia({ audio: true })`.

---

## 3. Message Types

### New `ClientMsg` variants

```typescript
| { type: "screen_start" }
| { type: "screen_offer"; targetUserId: string; sdp: string }
| { type: "screen_answer"; targetUserId: string; sdp: string }
| { type: "screen_ice"; targetUserId: string; candidate: string }
| { type: "screen_stop" }
```

### New `ServerMsg` variants

```typescript
| { type: "screen_state"; presenterId: string | null; presenterName: string | null }
| { type: "screen_peer"; userId: string; name: string }
| { type: "screen_offer"; fromUserId: string; sdp: string }
| { type: "screen_answer"; fromUserId: string; sdp: string }
| { type: "screen_ice"; fromUserId: string; candidate: string }
| { type: "screen_peer_left"; userId: string }
```

The server never touches media — it only relays SDP/ICE between the two
intended peers using `targetUserId` / `fromUserId`, exactly like the voice
chat signaling design.

`screen_state` is the room-level state broadcast: it tells everyone who is
currently presenting (or `null` if nobody). This drives the projector
sprite's visual state (off / on / showing content) and the E-interaction
label.

---

## 4. Server Changes

### Signaling relay (`server/index.ts`)

Add cases to the existing `ws.on("message")` switch:

- **`screen_start`** — Check that no one else in the room is already
  presenting. If the room already has a presenter, send a toast: "Someone
  is already presenting." If the room has 10+ players (excluding the
  presenter), send a toast: "Room is full for screen sharing (max 10
  viewers)." Otherwise, mark the room's presenter (`room.presenterId =
  user.id`) and broadcast `screen_state` to all players in the room. Send
  `screen_peer` to the presenter for each other player in the room, and
  `screen_peer` to each other player for the presenter.
- **`screen_offer` / `screen_answer` / `screen_ice`** — Look up
  `targetUserId`'s session and relay the message with `fromUserId` set to
  the sender's ID. Drop if the target isn't in the same room.
- **`screen_stop`** — Clear `room.presenterId`. Broadcast `screen_state`
  with `presenterId: null` to all players in the room. Send
  `screen_peer_left` to the presenter for each viewer (so the presenter
  closes peer connections), and `screen_peer_left` to each viewer for the
  presenter.
- **On WebSocket disconnect** — If the disconnecting user was the presenter,
  same as `screen_stop`: clear presenter, broadcast state, notify viewers.
  If the disconnecting user was a viewer, send `screen_peer_left` to the
  presenter.
- **On room switch** — If the switching user was the presenter, stop the
  presentation (same as `screen_stop`). If the switching user was a viewer,
  send `screen_peer_left` to the presenter.

### Room state (`server/tenant.ts`)

Add to the `Room` interface:

```typescript
interface Room {
  // ... existing fields ...
  presenterId: string | null;
}
```

Initialize `presenterId: null` in all room constructors.

### Viewer cap

The 10-viewer cap is enforced in the `screen_start` handler:

```typescript
case "screen_start": {
  const room = tenants.getRoom(sess.roomId);
  if (!room) break;
  if (room.presenterId && room.presenterId !== sess.user.id) {
    sess.broadcast({ type: "toast", text: "Someone is already presenting." });
    break;
  }
  const viewerCount = room.players.size - 1; // exclude presenter
  if (viewerCount > 10) {
    sess.broadcast({ type: "toast", text: "Too many viewers for screen sharing (max 10)." });
    break;
  }
  room.presenterId = sess.user.id;
  // Broadcast screen_state to all in room
  // Send screen_peer to presenter for each other player
  // Send screen_peer to each other player for presenter
  break;
}
```

### Rate limiting (`server/ratelimit.ts`)

```typescript
screen_ice:    { max: 200, refillPerSec: 50 },
screen_offer:  { max: 20,  refillPerSec: 2  },
screen_answer: { max: 20,  refillPerSec: 2  },
```

Same limits as voice — ICE candidates arrive in bursts during connection
setup.

---

## 5. Client: ScreenShareManager (`client/src/screen.ts`)

A new class that encapsulates all WebRTC screen-sharing logic. Mirrors the
`VoiceManager` design from the voice chat doc.

### Responsibilities

- **Screen capture** — `getDisplayMedia()` with video + audio constraints,
  track lifecycle, stop on `track.ended`.
- **Peer connection management** — Create/destroy `RTCPeerConnection` per
  viewer (presenter side) or per presenter (viewer side), add screen track,
  handle incoming tracks.
- **Signaling** — Send/receive SDP and ICE messages via the existing `Net`
  WebSocket.
- **Stream output** — Expose the received `MediaStream` for the scene to
  render on the projector sprite.

### API sketch

```typescript
class ScreenShareManager {
  // Lifecycle
  startPresenting(): Promise<void>  // getDisplayMedia, signal screen_start
  stopPresenting(): void            // close all peers, stop tracks, signal screen_stop

  // Signaling (called by store when screen_* messages arrive)
  onPeer(userId: string, name: string): void
  onOffer(fromUserId: string, sdp: string): void
  onAnswer(fromUserId: string, sdp: string): void
  onIce(fromUserId: string, candidate: string): void
  onPeerLeft(userId: string): void

  // Room state (called when screen_state arrives)
  onScreenState(presenterId: string | null, presenterName: string | null): void

  // Stream access (for scene to render)
  readonly presenting: boolean
  readonly presenterId: string | null
  readonly presenterName: string | null
  readonly remoteStream: MediaStream | null  // null if not viewing

  // Cleanup
  destroy(): void
}
```

### RTC configuration

Same as voice chat:

```typescript
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // TURN added from env if configured (shared with voice chat)
  ],
};
```

### Screen capture constraints

Cap resolution and framerate to keep bandwidth reasonable for P2P mesh:

```typescript
const displayMediaOptions: DisplayMediaStreamOptions = {
  video: {
    width:  { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 15, max: 30 },
  },
  audio: true,  // tab/window audio if the browser supports it
};
```

At 720p15, each viewer connection uses ~1-2 Mbps. For 10 viewers that's
~10-20 Mbps upload for the presenter — within typical home upload speeds.

### Track ended handling

The browser fires `track.ended` when the user clicks "Stop sharing" in the
browser UI. The manager should listen for this and call `stopPresenting()`:

```typescript
const [videoTrack] = stream.getVideoTracks();
videoTrack.addEventListener("ended", () => this.stopPresenting());
```

---

## 6. Client: Scene Integration (`client/src/game/scene.ts`)

### Projector screen object

Add a projector screen on the office wall — a large rectangle sprite
positioned like the task board but on a different wall (or the same wall,
offset). The screen has three visual states:

| State | Visual | When |
|-------|--------|------|
| **Off** | Dark/blank screen with faint "E: PRESENT" hint | No presenter in room |
| **Presenting (local)** | Screen shows "YOU ARE PRESENTING" + "E: STOP" | Local player is presenting |
| **Live** | Screen shows the incoming video stream | Someone else is presenting |

### Tile position

```typescript
private projectorTile: Tile = { x: 14, y: 1 };  // on the wall, above/next to task board
```

The exact position depends on the office map layout. It should be
reachable by walking (not blocked by furniture) and visible from the
center of the office.

### E-interaction

Add to the E-press chain (before the generic "talk to nearest agent" fallback):

```typescript
// Projector screen
const projPx = { x: this.projectorTile.x * TILE_PX + 32, y: this.projectorTile.y * TILE_PX + 32 };
const projDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, projPx.x, projPx.y);
if (projDist < 160) {
  if (screenManager.presenting) {
    screenManager.stopPresenting();
  } else if (screenManager.presenterId) {
    // Someone else is presenting — just viewing, no action needed
    // The stream is already rendering on the projector
    this.store.toast(`${screenManager.presenterName} is presenting.`);
  } else {
    screenManager.startPresenting();
  }
  return;
}
```

### Rendering the video stream

When `screenManager.remoteStream` becomes available (viewer side), create a
Phaser video texture and render it on the projector screen:

```typescript
// In update(), when remoteStream changes:
if (screenManager.remoteStream && !this.projectorVideo) {
  const video = document.createElement("video");
  video.srcObject = screenManager.remoteStream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;  // audio handled separately or via WebRTC audio element
  this.projectorVideo = video;

  // Create a Phaser texture from the video
  this.textures.addVideo("projector-stream");
  const videoTex = this.textures.get("projector-stream");
  videoTex.source.setVideo(video);

  // Render on the projector screen sprite
  this.projectorSprite.setTexture("projector-stream");
  this.projectorSprite.setVisible(true);
}
```

When the stream ends (presenter stops), hide the sprite and clean up the
video element.

### Proximity hint

```typescript
// In updateInteractHints or inline:
const projPx = { x: this.projectorTile.x * TILE_PX + 32, y: this.projectorTile.y * TILE_PX + 32 };
const projDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, projPx.x, projPx.y);
if (projDist < 160) {
  let label: string;
  if (screenManager.presenting) {
    label = "E: STOP PRESENTING";
  } else if (screenManager.presenterId) {
    label = `WATCHING: ${screenManager.presenterName}`;
  } else {
    label = "E: PRESENT SCREEN";
  }
  this.projectorHint.setPosition(projPx.x, projPx.y + 64).setText(hintLabel(label)).setVisible(true);
} else {
  this.projectorHint.setVisible(false);
}
```

### Scene shutdown

Call `screenManager.destroy()` on scene shutdown to close all peer
connections and stop tracks.

---

## 7. Client: UI (`client/src/ui/hud.ts`)

### Presenting indicator

When the local player is presenting, show a banner at the top of the screen:

```
🔴 PRESENTING — E at projector to stop
```

This is a simple DOM element (like the connection indicator `#conn`) that
appears when `screenManager.presenting` is true.

### Viewer count

Optionally show the number of active viewers near the presenting indicator:

```
🔴 PRESENTING TO 3 VIEWERS — E at projector to stop
```

### Hint text

Add to the existing hint line:

> `WASD/arrows move · E talk/board · H hire · F feed · B board · V voice · P present · click an agent · ESC close`

(Or just rely on the proximity hint — no global keybind needed since it's
an E-interaction at the projector.)

### Permission handling

- First `getDisplayMedia()` call triggers the browser's screen picker.
- If denied, show a toast: "Screen share cancelled."
- If `getDisplayMedia` is not supported (e.g., iOS Safari), show:
  "Screen sharing is not supported on this browser."

---

## 8. Environment Variables

Shared with voice chat — same TURN server config:

```bash
# Optional TURN server for NAT traversal (shared with voice chat)
TURN_SERVER=
TURN_USERNAME=
TURN_CREDENTIAL=
```

No additional env vars needed for screen sharing.

---

## 9. Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `shared/types.ts` | Modify | Add screen signaling messages to `ClientMsg` / `ServerMsg` |
| `server/index.ts` | Modify | Handle `screen_start` / `screen_stop` / signaling relay, viewer cap |
| `server/tenant.ts` | Modify | Add `presenterId` to `Room` interface |
| `server/ratelimit.ts` | Modify | Add rate limits for screen messages |
| `client/src/screen.ts` | **Create** | `ScreenShareManager` class — WebRTC, `getDisplayMedia`, peer connections |
| `client/src/store.ts` | Modify | Route screen messages to `ScreenShareManager` |
| `client/src/game/scene.ts` | Modify | Projector screen object, E-interaction, video texture rendering, proximity hint |
| `client/src/ui/hud.ts` | Modify | Presenting indicator banner, hint text |
| `.env.example` | Modify | Already has TURN config from voice chat (no changes if voice is built first) |

---

## 10. Edge Cases

- **Presenter disconnects mid-presentation** — Server detects WebSocket
  close, clears `room.presenterId`, broadcasts `screen_state` with
  `presenterId: null`, sends `screen_peer_left` to all viewers. Viewers
  close their peer connections and the projector goes dark.
- **Presenter switches rooms** — Same as disconnect: stop presentation,
  notify viewers, clear state.
- **Viewer joins mid-presentation** — Server sends `screen_state` with the
  current presenter info on room join, then `screen_peer` so the viewer
  can negotiate a peer connection with the presenter.
- **Viewer leaves mid-presentation** — Server sends `screen_peer_left` to
  the presenter. Presenter closes that peer connection.
- **Two players try to present simultaneously** — Server checks
  `room.presenterId` before allowing `screen_start`. Second player gets a
  toast: "Someone is already presenting."
- **Room exceeds 10 viewers** — `screen_start` is rejected with a toast.
  Existing viewers keep watching. The cap is on starting a new
  presentation, not on joining a room where someone is already presenting.
- **Browser "Stop sharing" button** — `track.ended` fires, client calls
  `stopPresenting()`, which sends `screen_stop` to the server. Normal
  teardown.
- **Screen share audio** — `getDisplayMedia({ audio: true })` captures tab/
  window audio on Chrome/Edge. Firefox only captures tab audio. Safari
  doesn't capture display audio. The audio track is added to the peer
  connection alongside video; viewers hear it through a hidden `<audio>`
  element. If no audio track is present, the presentation is video-only —
  no error.
- **Projector screen while outside** — The projector is an office object;
  proximity hints are hidden when the player is outside (same as all other
  interactables). Screen sharing still works — the signaling is room-based,
  not position-based. The player just can't interact with the projector
  while outside.
- **HQ² lobby** — Screen sharing works in HQ². The projector screen object
  exists in the HQ² map. The 10-viewer cap is especially relevant here
  since HQ² can have many players.

---

## 11. Testing Plan

### Manual testing

1. **Two browser tabs, same room** — Tab A presents, Tab B sees the stream
   on the projector. Verify the video renders and updates in real time.
2. **Presenter stops via E** — Tab A presses E at projector again. Verify
   Tab B's projector goes dark and `screen_state` updates.
3. **Presenter stops via browser UI** — Tab A clicks "Stop sharing" in
   the browser. Verify same teardown as above.
4. **Presenter closes tab** — Close Tab A. Verify Tab B gets
   `screen_peer_left` and projector goes dark.
5. **Viewer joins mid-presentation** — Tab A presenting, Tab C joins the
   room. Verify Tab C sees `screen_state` and negotiates a peer
   connection automatically.
6. **Viewer leaves mid-presentation** — Tab C closes. Verify Tab A gets
   `screen_peer_left` and closes that peer connection.
7. **Two presenters** — Tab A presenting, Tab B tries to present. Verify
   Tab B gets "Someone is already presenting" toast.
8. **Room switch** — Tab A presenting, Tab A switches to HQ². Verify
   presentation stops and viewers are notified.
9. **Permission denied** — Deny screen share in browser, verify toast.
10. **11+ players** — 11 players in a room, one tries to present. Verify
    "Too many viewers" toast.
11. **Audio** — Present a Chrome tab with audio playing. Verify viewers
    can hear the audio.

### Automated testing

- Server-side: Unit test the signaling relay — mock WebSocket pairs,
  verify `screen_offer` is forwarded to the correct `targetUserId`.
- Server-side: Unit test the viewer cap — mock a room with 11 players,
  verify `screen_start` is rejected.
- Client-side: Mock `RTCPeerConnection` and `getDisplayMedia` (jsdom
  doesn't support WebRTC; use a mock library or skip in CI).

---

## 12. Future Enhancements

- **Unified WebRTC manager** — Merge voice and screen share into a single
  `WebRTCManager` that manages one `RTCPeerConnection` per peer with
  multiple tracks (audio + video). Reduces connection overhead and
  simplifies signaling.
- **Multiple presenters** — Allow a queue or simultaneous presenters
  (split-screen on the projector). Would need a UI for switching between
  presenters.
- **SFU for large rooms** — For rooms with 15+ viewers, switch from P2P
  mesh to an SFU (LiveKit, mediasoup). The signaling protocol stays the
  same; only the transport layer changes.
- **Presentation recording** — Record the screen share stream server-side
  or client-side for replay. Could tie into the audit trail.
- **Remote control / collaborative editing** — Let viewers interact with
  the presented content (e.g., shared code editing). Would require an
  input channel back to the presenter.
- **Projector in HQ²** — A large projector in the lobby for community
  presentations, demos, or tutorials. Same tech, just a bigger sprite.
- **Canvas capture alternative** — Instead of `getDisplayMedia`, let
  players share a specific canvas (e.g., an agent's terminal output) via
  `canvas.captureStream()`. No browser permission prompt needed.
- **Picture-in-picture** — Let players view the presentation in a
  floating PiP window outside the game world, so they can watch while
  walking around.
