# Agent HQ — The Labyrinth

The infinite generative world outside the office door.

---

## 1. Vision

Every player has their own office where their hired agents work. But the office
has a door. Walk through it and you enter **the Labyrinth** — an infinite,
procedurally generated world that unfolds on demand as you explore. No boundary,
no end. Your agents stay behind working; the Labyrinth is a solo journey.

### Three layers of the product

1. **Agent HQ HQ** — The meta-office, the product's own office where it builds
   itself. The lobby/hub players spawn into. Showcase, onboarding, and the door
   to everywhere.
2. **Personal Offices** — Each player's own office with their own agents.
   Already exists as the core game.
3. **The Labyrinth** — The open world. Walk out the door, keep walking forever.

---

## 2. What's out there

### Fired agents haunt the Labyrinth

When you fire an agent, they don't just vanish — they wander out into the
Labyrinth. They're erratic: some are melancholy, some are hostile, some mumble
about their old tasks. You can encounter them, talk to them, or recruit them
back (re-hire them into the office). Their memory (`sessionId`) is preserved
when fired, so if you recruit them back, they remember everything.

### Pure exploration

The core experience is the vibe of walking through an infinite, on-demand
generated space. No combat, no crafting, no quests — just the joy of discovery.
The world tells a story through what you find: landmarks, ruins, structures,
strange formations. The Labyrinth is a place to *be*, not a place to *win*.

---

## 3. World structure — Hybrid Labyrinth

Not a pure maze, not a pure open field. A hybrid:

- **Open areas** — larger rooms and clearings, varied sizes, sometimes with
  landmarks or features
- **Corridors** — labyrinthine passages connecting the open areas, varying in
  length and width
- The generator places rooms and carves corridors between them, creating a
  connected graph of spaces

### Chunk-based generation

The world is divided into **chunks** (e.g. 32×32 tiles each). Chunks are
generated on demand as the player approaches:

- Each chunk has a deterministic seed derived from the world seed + chunk
  coordinates, so the same chunk is always the same
- Chunks are generated when the player enters a radius around them and kept in
  memory while nearby
- Visited chunks are persisted to disk (`ag/world/`) so the world is consistent
  across sessions
- The generator runs entirely client-side (no server round-trip for terrain)

### Biomes

Different regions of the world have different visual character:

- **Office overflow** — carpeted hallways with cubicle walls (near the office
  door, feels like the building extends)
- **Concrete ruins** — cracked floors, pillars, debris
- **Overgrown** — moss, vines, broken tiles, plants pushing through
- **Void** — dark tiles, faint glow, silence

Biome is determined by distance from origin + noise, so transitions feel
organic.

---

## 4. Architecture

### Client-side (Phaser)

```
OfficeScene (existing)
  │
  │  player walks through door
  ▼
WorldScene (new)
  ├── ChunkManager — generates/loads/unloads chunks around the player
  ├── WorldGenerator — seeded procedural terrain (rooms + corridors + biomes)
  ├── FiredAgentNPC — wandering fired agents encountered in the world
  └── Player — same boss sprite, same movement, infinite camera
```

### Scene transition

The office door becomes interactive. Walk into it → fade transition →
WorldScene starts. The WorldScene has a "return door" at the origin tile that
takes you back to the office. The office keeps running (agents keep working)
because the server doesn't care which scene the client is in.

### Server-side changes

Minimal:

- **Fired agent persistence**: when an agent is fired, instead of just deleting
  them, save a `FiredAgent` record (name, title, sprite, accent, sessionId,
  provider, model, personality, last task) to a new `firedAgents` array in the
  save file. The client reads this on entering the Labyrinth.
- **Recruit back**: a new `recruit` message that re-hires a fired agent by id,
  restoring their memory.
- **World seed**: stored in the save file, generated once per player.

---

## 5. Data structures

```typescript
// In shared/types.ts

/** A fired agent that now wanders the Labyrinth. */
interface FiredAgent {
  id: string;          // same id they had in the office
  name: string;
  title: string;
  sprite: number;
  accent: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  sessionId: string | null;  // preserved memory
  tasksDone: number;
  firedAt: number;     // timestamp
  lastTask: string | null;
  /** Current position in the world (chunk coords + tile offset). */
  worldX: number;
  worldY: number;
  /** Mood affects dialogue: melancholy, hostile, wandering, dormant. */
  mood: FiredAgentMood;
}

type FiredAgentMood = "melancholy" | "hostile" | "wandering" | "dormant";

/** Persisted world state. */
interface WorldState {
  seed: number;
  firedAgents: FiredAgent[];
  /** Chunk keys the player has visited: "cx,cy" → serialized tile data. */
  visitedChunks: Record<string, number[]>;
}
```

### Chunk format

Each chunk is a flat array of tile type integers (0 = floor, 1 = wall, etc.).
Chunk size is `CHUNK_SIZE × CHUNK_SIZE` tiles. The generator produces this
array deterministically from `seed + chunkX + chunkY`.

---

## 6. Implementation plan

1. **`docs/LABYRINTH.md`** — this doc ✅
2. **Shared types** — add `FiredAgent`, `WorldState`, new messages
3. **Server: fired-agent persistence** — save fired agents to world data
4. **Client: world generator** — seeded chunk-based hybrid labyrinth
5. **Client: `WorldScene`** — Phaser scene with infinite scrolling, chunk
   loading, player movement
6. **Scene transition** — door in office → WorldScene, return door → OfficeScene
7. **Fired agent NPCs** — spawn in the world, wander, interact on proximity
8. **Recruit back** — talk to a fired agent → option to re-hire them

---

## 7. Future ideas (not in v1)

- **Landmarks & lore** — special structures with descriptions, telling the
  story of the world
- **Other players' offices** — discover other players' offices as structures in
  the world (multiplayer tie-in)
- **Agent expeditions** — send agents into the Labyrinth to retrieve things
- **Labyrinth biomes deepen** — more visual variety, weather, ambient sound
- **Mapping** — a map UI that fills in as you explore
- **Fast travel** — markers you can place to return to spots
