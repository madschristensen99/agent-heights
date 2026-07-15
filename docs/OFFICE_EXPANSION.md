# Sprite Heights — Office Expansion

The office starts small: **6 desks, 6 agents max**. When the player outgrows it,
they press **E** near the expansion zone and the building physically grows —
two new desks slide in and the back wall pushes outward. Each expansion adds
capacity and width, turning the office into something you invest in rather than
an infinite flat roster from the start.

---

## 1. Vision

You start with a cozy 6-desk office. Business is good, you hire your sixth
agent, and the office feels full — no more desks. A faint outline on the back
wall hints at where the building *could* go. You walk over and press **E**.
Construction dust, a rumble, the back wall slides out two tiles, two fresh desks
drop in with monitors and chairs. You now have room for two more agents.

This is the first step toward a **pay-to-expand** economy. For now it's a free
mock — press E, get bigger. Later, each expansion costs coins and the price
scales with office size.

---

## 2. Current State

| Area | Status | What exists | What's missing |
|---|---|---|---|
| Desk seats | ✅ Done | 8 seats parsed from Tiled map objects (`seat-0` … `seat-7`) in `scene.ts` | No cap on hiring; server assigns `deskIndex` infinitely |
| Overflow standing spots | ✅ Done | `extraSpots[]` — agents beyond seat count stand in the office | No limit; 96 standing spots available |
| Office map | ✅ Done | 30×20 tile map (`office.json` / `lumon.json`), 64px tiles | Fixed size; no runtime resizing |
| Hiring | ✅ Done | `AgentManager.hire()` assigns next free `deskIndex` | No max-agent check |
| Building width | ✅ Done | `map.widthInPixels` used for camera and world layer | No mechanism to widen at runtime |
| E interaction | ✅ Done | E is used for talking to nearby agents / boards | No expansion interaction |

---

## 3. Design

### 3.1 Agent Cap

**Constant:** `MAX_AGENTS = 6` (initial capacity, not a hard ceiling)

- `AgentManager.hire()` checks `this.agents.size` (excluding Yuki and Hermes)
  against the current capacity before creating a new agent.
- If at capacity, the server broadcasts a toast: *"The office is full. Expand
  to fit more agents!"*
- The cap is stored as `officeCapacity` on the `AgentManager` and persisted in
  the save file so it survives restarts.
- `recruit()` (re-hiring from the Labyrinth) also respects the cap.

### 3.2 Expansion Trigger

**Input:** Press **E** while standing near the expansion zone (the back wall
of the office).

- A new tile-based interaction zone is placed along the back wall — similar to
  how Yuki's office zone or the server rack E-interaction works.
- When the player is inside the zone and presses E:
  1. **Client** sends a new `ClientMsg`: `{ type: "expand" }`
  2. **Server** increments `officeCapacity` by 2 and broadcasts
     `{ type: "office_expanded", capacity: N }`
  3. **Client** plays the expansion animation (see 3.3) and adds 2 new seats
- A cooldown of ~3 seconds prevents spamming.

### 3.3 Building Widening

Each expansion adds **2 desks** and **2 tiles of width** to the building.

**What changes at runtime:**

| Component | How it widens |
|---|---|
| Tilemap | The Phaser tilemap is not resized in-place. Instead, the office is rendered as a **graphics-based floor + walls** that can be redrawn at any width. The Tiled map provides the initial layout; expansion redraws the back wall 2 tiles further out. |
| Floor | `bg.fillRect()` already covers `map.widthInPixels` — on expansion, redraw with the new width. |
| Back wall | The wall row (currently tiles with GID 9/10/11) is extended by 2 tiles on the right side. New wall tiles are placed as sprites or drawn with graphics. |
| New desks | Two new `seat-N` positions are appended to `this.seats[]` at the new back-wall columns. Each gets a chair sprite, monitor sprite, and desk furniture — same as the Tiled-parsed seats. |
| Walkable grid | `this.grid` is rebuilt with the new dimensions. The 2 new columns become walkable floor. |
| Camera | `this.mapPx.w` is updated; `bestZoom()` recalculates automatically. |
| World layer | `WorldLayer` receives the new office bounds so the infinite world wraps correctly around the wider building. |

**Animation sequence (≈2 seconds):**

1. Dust particle burst at the back wall (existing particle system or simple
   alpha-tweened circles).
2. Screen shake — small rumble (`this.cameras.main.shake(200, 0.01)`).
3. Back wall slides outward 2 tiles (tween the wall sprites' x position).
4. Two desks drop in with a bounce tween (scale 0 → 1 with `Back.easeOut`).
5. Monitors and chairs fade in.
6. Toast: *"Office expanded! 2 new desks ready."*

### 3.4 Seat Layout After Expansion

Desks are arranged in rows. The initial 6 seats use the Tiled map positions.
Expansion seats are placed programmatically:

```
Expansion 0 (initial):  seats 0–5  (from Tiled map)
Expansion 1 (press E):  seats 6–7  (new column, back-right)
Expansion 2 (press E):  seats 8–9  (new column, back-right)
Expansion 3 (press E):  seats 10–11 (new column, back-right)
...
```

Each expansion extends the building to the right by 2 tiles and places the
2 new desks in the new space. The desk row pattern (y-coordinate) matches the
existing desk rows so they line up visually.

### 3.5 Future: Pay-to-Expand

The mock is free. When the coin economy is wired up:

| Expansion | Cost | Cumulative Desks |
|---|---|---|
| Initial | Free | 6 |
| 1st (→8) | 100 coins | 8 |
| 2nd (→10) | 250 coins | 10 |
| 3rd (→12) | 500 coins | 12 |
| 4th (→14) | 1,000 coins | 14 |
| nth | 100 × 2^(n-1) | 6 + 2n |

The server checks the player's coin balance (from the achievements/coins system)
before allowing expansion. If insufficient, toast: *"Not enough coins to
expand."*

---

## 4. Implementation Plan

### Phase 1: Agent Cap (server)

- [ ] Add `officeCapacity: number` to `AgentManager` (default 6)
- [ ] Add capacity check in `hire()` and `recruit()` — count non-Yuki/Hermes
      agents
- [ ] Broadcast toast when at capacity
- [ ] Persist `officeCapacity` in the save file (`persistence.ts`)
- [ ] Add `officeCapacity` to `SaveState` and `WorldState` / `GameSettings`

### Phase 2: Expand Message (protocol + server)

- [ ] Add `{ type: "expand" }` to `ClientMsg` in `shared/types.ts`
- [ ] Add `{ type: "office_expanded", capacity: number }` to `ServerMsg`
- [ ] Handle `expand` in `server/index.ts` — increment capacity by 2, broadcast
- [ ] Add cooldown tracking on the server (reject if last expand < 3s ago)

### Phase 3: Client Expansion Zone + Animation

- [ ] Add an interaction zone along the back wall in `scene.ts`
- [ ] Hook into the existing E-press handler — if near expansion zone, send
      `{ type: "expand" }` instead of the normal talk action
- [ ] Handle `office_expanded` in `store.ts` — update local capacity
- [ ] In `scene.ts`, on `office_expanded`:
  - Redraw floor + back wall with new width
  - Rebuild walkable grid
  - Add 2 new seat positions, chairs, monitors
  - Play dust + shake + slide + drop animation
  - Update `this.mapPx.w` and world layer bounds

### Phase 4: Pay-to-Expand (future)

- [ ] Wire up coin balance check in server `expand` handler
- [ ] Add cost scaling formula
- [ ] Show cost in a UI prompt when pressing E near the zone
- [ ] Deduct coins on successful expansion

---

## 5. Files Touched

| File | Changes |
|---|---|
| `shared/types.ts` | Add `expand` to `ClientMsg`, `office_expanded` to `ServerMsg`, `officeCapacity` to save types |
| `server/manager.ts` | Add `officeCapacity` field, capacity checks in `hire()` / `recruit()`, `expand()` method |
| `server/index.ts` | Route `expand` message to manager |
| `server/persistence.ts` | Persist `officeCapacity` in save file |
| `client/src/store.ts` | Track `officeCapacity`, handle `office_expanded` message |
| `client/src/game/scene.ts` | Expansion zone, E-interaction, animation, seat/grid/wall rebuild |
| `client/src/ui/hud.ts` | Show current capacity in roster panel, disable hire button when full |

---

## 6. Edge Cases

- **Fired agent re-hire (recruit):** counts against capacity. If at cap, toast
  the same message.
- **Server restart:** `officeCapacity` is restored from save. Seats are
  re-derived from capacity (Tiled seats for 0–5, computed positions for 6+).
- **Expansion while agents are standing (overflow):** If agents were in
  standing spots because desks were full, they should migrate to the new desks
  on next `syncAgents()`. The `deskIndex` is reassigned by the server on
  expand — agents with `deskIndex >= old seat count` get shuffled into the
  new seats.
- **Theme switching:** The Lumon map may have different dimensions. Expansion
  logic should work off the current map's base width, not a hardcoded value.
- **Max practical limit:** No hard ceiling in the mock. A reasonable soft cap
  (e.g. 50 desks) prevents the map from becoming absurdly wide. The pay-to-expand
  cost curve naturally limits this in the future.
