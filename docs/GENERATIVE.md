# Agent Heights — Generative Content System

The Labyrinth isn't just terrain — it's a living world whose inhabitants,
structures, missions, and stories are written on demand by an LLM. Every
playthrough is unique. The model is the dungeon master.

This builds on top of the Robot Expeditions system (`docs/EXPEDITIONS.md`).
Expeditions give agents a reason to interact with the world. Generative content
gives the world something worth interacting with.

---

## 1. Vision

Right now the Labyrinth is infinite but shallow — more terrain, more creatures,
same biomes repeating forever. The generative system gives every chunk the
potential for narrative significance. You're not just walking through an endless
field; you're uncovering a story that no one else will ever see.

The LLM generates structured JSON — NPCs, structures, missions, creatures, plot
fragments — that the game engine interprets and renders. The content is
consistent within a playthrough (cached per chunk), references past discoveries
(narrative state), and emerges organically as you explore.

### The three layers

1. **Terrain** (existing) — `worldgen.ts` generates tiles deterministically.
   This doesn't change. It's the canvas.
2. **Generative content** (new) — LLM-generated JSON layered on top of terrain.
   NPCs standing on tiles, structures built from tiles, missions referencing
   tiles.
3. **Agent interaction** (from Expeditions doc) — robots explore the world,
   encounter generated content, and bring back information that advances the
   narrative.

---

## 2. What Gets Generated

### NPCs

The flagship feature. Instead of just creatures, chunks can contain **unique
characters** with dialogue, appearance, and offers.

```json
{
  "type": "npc",
  "id": "vex_cartographer",
  "name": "Vex the Cartographer",
  "description": "A former office worker who left to map the Labyrinth decades ago. Wears a tattered lanyard.",
  "sprite": {
    "body": "hooded",
    "baseColor": "#4a3a2a",
    "accentColor": "#8a7a5a",
    "accessory": "lanyard",
    "glow": "#ffaa00"
  },
  "dialogue": [
    "You're from the office? I haven't seen a fresh face in years.",
    "I've mapped 400 chunks. There's something past the void that shouldn't exist.",
    "I'll trade you a map fragment for 10 scrap. Reveals 5 chunks in any direction."
  ],
  "offers": {
    "type": "map_reveal",
    "cost": { "scrap": 10 },
    "radius": 5
  },
  "quest_giver": true
}
```

The client renders the sprite from parameters (using the existing CanvasTexture
system), spawns the NPC at a walkable tile in the chunk, and shows dialogue on
E. The NPC is cached with the chunk — go back later, they're still there.

### Structures

Beyond the hardcoded `placeBrickTower` and `placeStructure`, the LLM generates
building definitions with interiors and interactable objects:

```json
{
  "type": "structure",
  "id": "the_archive",
  "name": "The Archive",
  "description": "A crumbling library built by the lost company. Books scattered everywhere.",
  "size": [12, 10],
  "wallTile": "castle",
  "floorTile": "path",
  "interior": [
    { "tile": "bookshelf", "x": 2, "y": 2 },
    { "tile": "bookshelf", "x": 3, "y": 2 },
    { "tile": "desk", "x": 6, "y": 5, "interactable": true, "content": "journal_fragment_3" }
  ],
  "door": { "side": "south", "width": 2 },
  "narrativeTag": "project_dawn"
}
```

New tile types needed: `bookshelf`, `desk`, `sign`, `campfire`, `tent`,
`grave_marker`. Each is a simple 64×64 CanvasTexture — the existing system
handles this trivially.

### Missions

Structured quests that the agents can pursue via robot expeditions:

```json
{
  "type": "mission",
  "id": "lost_researcher",
  "title": "The Missing Researcher",
  "givenBy": "vex_cartographer",
  "description": "Vex says a researcher named Dr. Halberg went into the void 3 months ago and never returned. She was carrying a prototype device.",
  "objectives": [
    { "type": "reach_biome", "biome": "void", "text": "Enter the void biome" },
    { "type": "find_structure", "structure": "research_camp", "text": "Find Dr. Halberg's camp" },
    { "type": "retrieve_item", "item": "prototype_device", "text": "Recover the prototype" }
  ],
  "reward": { "coins": 50, "scrap": 30, "achievement": "void_archaeologist" },
  "robotRequired": true,
  "minTier": 2
}
```

Missions appear on a **mission board** in the office (a new interactable object,
like the filing cabinet). The agents reference missions in their planning
huddles: "Vex says there's a camp in the void. We need a Bruiser for that."

### Creature Variants

Beyond the 6 hardcoded creature types, the LLM can generate unique creatures
tied to narrative moments or specific locations:

```json
{
  "type": "creature_variant",
  "id": "archive_guardian",
  "name": "Archive Guardian",
  "description": "A construct of stacked books and rusted metal, protecting the lost library.",
  "sprite": {
    "bodyType": "humanoid",
    "material": "books",
    "baseColor": "#8a7a5a",
    "accentColor": "#6a5a3a",
    "eyeColor": "#ff3300",
    "size": 32,
    "features": ["horns", "glowing_eyes"]
  },
  "stats": { "hp": 120, "damage": 18, "speed": 60, "aggroRange": 300 },
  "drops": { "item": "journal_fragment", "chance": 0.5 },
  "spawnLocation": "the_archive"
}
```

### Plot Fragments

Environmental storytelling — journal entries, signs, inscriptions:

```json
{
  "type": "plot_fragment",
  "id": "journal_fragment_3",
  "foundAt": "the_archive",
  "text": "Day 247: The void is expanding. We've lost contact with Outpost 7. I'm sealing the Archive. If anyone finds this, the device is real. Don't let them have it.",
  "advancesThread": "project_dawn"
}
```

Found by interacting with desks, bookshelves, or signs inside structures. Posted
to the feed when discovered. The agents read them and react: "Mocha: 'Day 247?
This person was out here for months. What device?'"

---

## 3. Narrative State

The key to making this feel like a story, not random noise. The server maintains
a narrative state object that tracks everything the player has discovered:

```typescript
interface NarrativeState {
  discoveredNPCs: string[];        // NPC IDs encountered
  discoveredStructures: string[];  // structure IDs found
  activeMissions: string[];        // mission IDs in progress
  completedMissions: string[];     // finished missions
  plotThreads: PlotThread[];       // open narrative threads
  loreFragments: string[];         // journal/sign text found
  worldEvents: string[];           // significant things that happened
  generatedChunks: string[];       // chunks that have received generated content
}

interface PlotThread {
  id: string;                      // e.g. "project_dawn"
  title: string;                   // "The Lost Colony"
  status: "open" | "advanced" | "resolved";
  relatedNPCs: string[];
  relatedStructures: string[];
  relatedMissions: string[];
  nextHintBiome?: string;          // where the next clue should appear
  nextHintMinDistance?: number;    // how far out the next clue should be
  summary: string;                 // LLM-generated summary of what's known so far
}
```

Every time the LLM generates content for a new chunk, it receives the current
narrative state. It can:
- **Advance existing threads** — place the next clue, introduce a related NPC
- **Resolve threads** — the final journal entry, the survivor who tells you what
  happened
- **Start new threads** — a new NPC with a new mystery
- **Reference past discoveries** — "You met Vex? He and I used to work together."

This is how the story emerges. The LLM is doing what a human DM does: remembering
what happened and building on it.

### Thread lifecycle

```
Thread opens
  · Player finds first clue (journal fragment, NPC mention, structure)
  · LLM creates thread in narrative state
    │
    ▼
Thread advances
  · Player explores deeper / into the hinted biome
  · LLM generates next clue, referencing the thread
  · Thread status → "advanced", summary updated
    │
    ▼  (can advance multiple times)
    │
    ▼
Thread resolves
  · Player finds the final piece (survivor, final journal, completed mission)
  · LLM generates resolution content
  · Thread status → "resolved"
  · Achievement unlocked
  · Agents discuss in feed: "So that's what happened to Project Dawn."
```

---

## 4. The Generation Pipeline

### When does generation happen?

Not every chunk gets generated content. That would be expensive and cluttered.
Instead:

```
Player enters chunk load radius
    │
    ▼
Client requests chunk from worldgen (existing — terrain only)
    │
    ▼  is this chunk "narratively significant"?
    │   · 10% base chance, modified by:
    │     + narrative state says next hint is in this biome
    │     + chunk is at a "milestone distance" (10, 25, 50, 100 chunks)
    │     + active mission targets this biome
    │     - chunk already has generated content (cached)
    │
    ├──► No → chunk is pure terrain (existing behavior)
    │
    ▼  Yes
Server sends generation request to LLM
    │
    │  Prompt includes:
    │  · Biome and distance from office
    │  · Full narrative state (discovered NPCs, threads, missions)
    │  · Chunk seed (for deterministic placement)
    │  · Constraints: "generate 0-2 features, output as JSON"
    │
    ▼
LLM returns structured JSON
    │
    ▼
Server validates JSON schema
    │  · Rejects malformed output, retries once
    │  · Checks for lore consistency (no contradicting established facts)
    │
    ▼
Server sends content to client
    │
    ▼
Client renders:
    · NPC sprites from params
    · Structures from layout definitions
    · Creatures from variant params
    · Missions added to mission board
    · Plot fragments cached for interaction
    │
    ▼
Content cached with chunk data (persisted to disk)
```

### Pre-generation

Generation takes 1–3 seconds. To avoid the player waiting:

- When a chunk enters the **load radius** (2 chunks away), the server starts
  generating in the background
- By the time the player walks to the chunk, the content is ready
- If the player arrives before generation completes, the chunk loads as pure
  terrain and the generated content pops in when ready (NPC appears, structure
  renders)

### The LLM prompt

```
You are the game master for an infinite procedural world called the Labyrinth.
Generate content for a chunk the player is about to enter.

World context:
- Biome: ruins
- Distance from office: 45 chunks south
- Chunk seed: 8472913

Narrative state:
- Discovered NPCs: vex_cartographer (forest, 12 chunks), wasteland_survivor (wasteland, 28 chunks)
- Active missions: "lost_researcher" (in progress, needs void biome)
- Plot threads:
  - "project_dawn" (advanced): A company called Dawn tried to colonize the Labyrinth. Two outposts found. Something went wrong. Survivor says they had a device.
  - "the_cartographer" (open): Vex is mapping the Labyrinth. Mentioned something past the void that "shouldn't exist."
- Lore fragments found: 3 journal entries from Dawn outposts

Generate 0-2 features for this chunk. Output as a JSON array.
Valid types: npc, structure, mission, creature_variant, plot_fragment

Rules:
- Be consistent with established lore
- Reference past discoveries when appropriate
- Don't repeat NPCs or structures that already exist
- Missions should be achievable (target reachable biomes)
- Keep dialogue under 3 lines per NPC
- Sprites must use valid body types and materials
```

### Output validation

The server validates the LLM's JSON:

1. **Schema check** — correct fields, valid types, no missing required keys
2. **Lore consistency** — no contradicting established facts (e.g., can't say
   Vex is dead if the player just talked to him)
3. **Placement check** — structures fit in the chunk, NPCs are on walkable tiles
4. **Quality filter** — reject if output is too generic (e.g., NPC with no
   dialogue, structure with empty interior). Retry once with a "be more
   specific" addendum.

---

## 5. Parametric Sprite Generation

The hardest technical challenge. The current `textures.ts` has hardcoded drawing
functions for specific creatures. To support LLM-generated content, we need a
**parametric sprite system** that composes the existing drawing primitives based
on parameters.

### NPC sprites (simpler — start here)

NPCs are humanoid figures standing still. Much simpler than creatures:

```typescript
interface NPCSpriteParams {
  body: "hooded" | "robed" | "armored" | "casual" | "mechanical";
  baseColor: string;
  accentColor: string;
  accessory?: "lanyard" | "hat" | "glasses" | "scarf" | "headphones" | "none";
  glow?: string;       // aura color
  height?: number;     // default 28px
}

function generateNPCSprite(tex: TextureManager, key: string, params: NPCSpriteParams): void {
  // 1. Draw shadow
  // 2. Draw body silhouette based on body type
  //    - hooded: cloak + hood shape
  //    - robed: long robe
  //    - armored: plate segments
  //    - casual: office clothes (reuses character generator)
  //    - mechanical: metal plating (reuses robot sprite system)
  // 3. Draw accessory on top
  // 4. Draw glow aura if specified
  // 5. Register as single-frame texture (NPCs don't animate)
}
```

This is very doable. The `chargen.ts` system already generates humanoid
characters. The NPC system extends it with body type variants and accessories.

### Character sprites — going fully generative

The existing `chargen.ts` character generator is already procedural — it
composes pixel-art spritesheets from parameters at runtime. However,
`CharAppearance` in `shared/types.ts` currently stores **indices** into fixed
preset arrays (e.g., `shirt: 2` → `"#53b86b"`). The underlying renderer
(`CharPalette` in `chargen.ts`) already works with raw hex strings — the preset
arrays are a UI convenience for the character builder, not a rendering
constraint.

To support fully generative character customization (premium marketplace
agents, transmogrifier output, LLM-generated NPCs that need to look like
specific characters), we extend the system to accept **raw hex values**
alongside indices:

```typescript
/** Raw appearance — uses hex strings instead of preset indices.
 *  Used by: marketplace premium agents, transmogrifier output, generated NPCs. */
export interface RawCharAppearance {
  skin: string;       // "#ffdbac"
  hairStyle: string;  // "swept"
  hair: string;       // "#2b1d0e"
  shirt: string;      // "#00c853"
  pants: string;      // "#454545"
  accessory: string;  // "cap" | "beanie" | "glasses" | ...
  accent: string;     // "#3d9152"
  beard: string;      // "none" | "stubble" | ...
  eyeColor: string;   // "#2a2040"
  headFeature: string; // "none" | "horns" | ...
}
```

`appearanceToPalette()` gains a branch: if the input is a `RawCharAppearance`
(strings), it passes them through directly; if it's a `CharAppearance`
(indices), it maps via the preset arrays as today. The rendering pipeline
(`buildCharSheet` → `drawChar` → `PixelSheet`) is unchanged — it already
consumes `CharPalette` which uses hex strings.

This means:
- **Marketplace premium agents** can ship exact brand colors (Robinhood green
  `#00c853`, etc.) in their `agent` config JSON
- **The transmogrifier** (see below) can generate accessories with any color
- **LLM-generated NPCs** can use arbitrary colors without being limited to the
  preset palette
- **The character builder UI** continues to use indices for simplicity — both
  representations coexist

### The Transmogrifier

A copy/printer-looking object in the office. Walk up, press E, type anything,
and it generates a wearable accessory you can carry around.

**Concept**: The wardrobe (existing, tile 21,18) lets you carefully customize
your appearance piece by piece. The transmogrifier is the chaotic, generative
counterpart — you don't pick parameters, you type a prompt and get a result.

**Two modes**:

1. **Procedural (free)** — Hash the input text to deterministically derive
   colors and style. Same input always produces the same accessory. No LLM
   cost, feels magical:
   ```
   Player types: "robinhood"
   → hash("robinhood") → { accessory: "cap", baseColor: "#00c853",
                            accentColor: "#ffd700", label: "Robinhood Cap" }
   → generateAccessorySprite() draws a green cap with gold trim
   → stored in inventory, can be equipped/unequipped
   ```

2. **LLM-driven (premium)** — Send the text to the LLM, get back structured
   JSON with accessory type, colors, and a custom name. Allows arbitrary
   creative input:
   ```
   Player types: "a hat made of stars with a comet trail"
   → LLM returns: { accessory: "custom", baseColor: "#1a1a2a",
                     accentColor: "#ffd700", glow: "#ffaa00",
                     label: "Star Hat", features: ["glow", "sparkle"] }
   → generateAccessorySprite() draws a dark hat with golden star details
     and a glow aura
   ```

**New accessory types needed** beyond the existing 7 (glasses, headband,
earrings, cap, beanie, headphones, none): scarf, mask, badge, lanyard, cape,
backpack, umbrella, coffee cup, crown, visor, bow tie, flower crown. Each is
a new branch in `drawAccessory()` — simple pixel drawing, same as the existing
accessories.

**Carried accessory data model**:

```typescript
interface CarriedAccessory {
  id: string;           // generated UUID
  name: string;         // "Robinhood Cap", "Star Hat", etc.
  source: string;       // the original input text
  accessory: string;    // "cap" | "crown" | "custom" | ...
  baseColor: string;    // hex
  accentColor: string;  // hex
  glow?: string;        // optional aura color
  features?: string[];  // ["glow", "sparkle", "trail"]
  createdAt: number;
}
```

Stored in `SaveState` as `accessories: CarriedAccessory[]`. The player can
equip one accessory at a time, which overrides the `accessory` field in their
`CharAppearance` and regenerates the sprite texture. Unequipping reverts to
the wardrobe-selected accessory.

**Office placement**: The transmogrifier sits in the break room near the
wardrobe — visually a copy/printer machine (gray box with paper tray, green
status LED, paper output slot). Press E → text input modal appears → type
anything → machine whirs (animation + sound) → accessory pops out → toast:
*"Transmogrified! Got: Robinhood Cap"*. The accessory is added to inventory
and can be equipped from the wardrobe or a quick-equip slot.

**Premium tier**: Free players get procedural mode (hash-based). Premium
players get LLM-driven mode for truly custom, creative accessories. This is
the first example of the generative customization economy — the same pattern
extends to generative character presets, generative office decor, and
generative agent appearances in the marketplace.

### Creature sprites (harder — phase 2)

Creatures need 4 animation frames and come in varied body plans:

```typescript
interface CreatureSpriteParams {
  bodyType: "blob" | "quadruped" | "humanoid" | "floating" | "serpentine";
  material: "flesh" | "stone" | "metal" | "ethereal" | "plant" | "books";
  baseColor: string;
  accentColor: string;
  eyeColor: string;
  size: number;
  features: string[];  // "horns", "wings", "tail", "extra_eyes", "claws", "antenna"
}

function generateCreatureSprite(tex: TextureManager, key: string, params: CreatureSpriteParams): void {
  // For each of 4 frames (idle, walk1, walk2, attack):
  //   1. Draw ground shadow
  //   2. Draw body silhouette based on bodyType
  //      - blob: ellipse (reuse slime approach)
  //      - quadruped: body + 4 legs + head (reuse wolf approach)
  //      - humanoid: torso + 2 legs + 2 arms + head (reuse skeleton approach)
  //      - floating: cloak/tendrils, no legs (reuse wraith approach)
  //      - serpentine: coiled body, no legs
  //   3. Apply material texture
  //      - flesh: smooth gradient
  //      - stone: drawCracks
  //      - metal: flat shading + rivets
  //      - ethereal: transparency + glow
  //      - plant: drawFur (as leaves)
  //      - books: stacked rectangles with page lines
  //   4. Draw features from the features array
  //      - horns: curved triangles on head
  //      - wings: membrane shape (reuse imp wing approach)
  //      - tail: tapered line
  //      - extra_eyes: additional drawEye calls
  //      - claws:尖锐 triangles on hands
  //   5. Draw eyes (always — every creature has eyes)
  //   6. Apply frame-specific pose modifications
  //      - walk1/walk2: leg offset, body sway
  //      - attack: arm extension, mouth open
}
```

The existing `textures.ts` already has every primitive needed: `drawLimb`,
`drawEye`, `drawFur`, `drawScales`, `drawCracks`, `drawRune`,
`radialGradient`, `drawGroundShadow`. A parametric system just composes them
based on parameters instead of hardcoding each creature.

### Structure sprites

Simplest of all — structures are just tile compositions. New tile types
(`bookshelf`, `desk`, `sign`, `campfire`, `tent`, `grave_marker`) each get a
64×64 CanvasTexture, same as every other tile. The LLM's structure JSON
specifies which tiles go where, and the existing chunk renderer draws them.

---

## 6. Caching and Persistence

Generated content is **cached per chunk**. Once a chunk has an NPC, that NPC is
there forever.

### Storage

```typescript
// Extended chunk data
interface Chunk {
  cx: number;
  cy: number;
  biome: string;
  tiles: number[];           // existing — terrain
  generatedContent?: GeneratedContent[];  // new — LLM-generated features
}

interface GeneratedContent {
  type: "npc" | "structure" | "creature_variant" | "plot_fragment" | "mission";
  id: string;
  // ... type-specific fields
  placedAt: { x: number; y: number };  // chunk-local tile coordinates
}
```

When a chunk is loaded from cache (already visited), the generated content is
loaded with it. No re-generation. When a chunk is generated for the first time
and is narratively significant, the server generates content and caches it.

### Narrative state persistence

The `NarrativeState` object is saved to the save file alongside `WorldState`.
It's updated whenever:
- The player discovers a new NPC (talks to them)
- The player finds a new structure (enters it)
- A plot fragment is read
- A mission is accepted/completed
- A plot thread advances/resolves

---

## 7. Server Architecture

### New module: `server/narrative.ts`

Handles all LLM generation requests:

```typescript
class NarrativeEngine {
  private provider: LLMProvider;     // claude or codex
  private state: NarrativeState;     // persisted

  /** Determine if a chunk should get generated content. */
  shouldGenerate(cx: number, cy: number, biome: string, distance: number): boolean {
    // 10% base chance + modifiers from narrative state
  }

  /** Generate content for a chunk. Called when player approaches. */
  async generateChunkContent(cx: number, cy: number, biome: string, distance: number): Promise<GeneratedContent[]> {
    // 1. Build prompt from narrative state + chunk context
    // 2. Call LLM
    // 3. Validate JSON
    // 4. Update narrative state (new threads, etc.)
    // 5. Return content for client to render
  }

  /** Called when player interacts with generated content. */
  onNPCDiscovered(npcId: string): void { /* update state */ }
  onStructureFound(structureId: string): void { /* update state */ }
  onFragmentRead(fragmentId: string): void { /* update state, advance thread */ }
  onMissionAccepted(missionId: string): void { /* update state */ }
  onMissionCompleted(missionId: string): void { /* update state, resolve thread */ }
}
```

### Integration with existing server

The `NarrativeEngine` sits alongside `AgentManager` in `server/index.ts`:

- **Chunk request** → `worldgen.generateChunk()` (terrain) + `narrative.generateChunkContent()` (if significant)
- **NPC interaction** → `narrative.onNPCDiscovered()` → updates state → notifies client
- **Mission completion** → `narrative.onMissionCompleted()` → rewards + state update

### New messages (`shared/types.ts`)

```typescript
| { type: "chunk_content"; cx: number; cy: number; content: GeneratedContent[] }
| { type: "npc_discovered"; npcId: string }
| { type: "mission_available"; mission: MissionDef }
| { type: "mission_accepted"; missionId: string }
| { type: "mission_completed"; missionId: string; rewards: MissionReward }
| { type: "narrative_update"; state: NarrativeState }
| { type: "plot_fragment"; fragmentId: string; text: string }
```

---

## 8. The Mission Board

A new interactable object in the office — a corkboard on the wall near the door.

- **Press E** → shows available missions (generated by the LLM, discovered
  through exploration or given by NPCs)
- Each mission card shows: title, description, objectives, reward, required
  robot tier
- **Accept mission** → it's added to active missions, agents factor it into
  planning
- **Complete mission** → when a robot fulfills the objectives (reaches biome,
  finds structure, retrieves item), the mission completes automatically
- Missions tie into the expedition system — the agents' planning huddle
  references active missions: "We have a mission to find Dr. Halberg's camp in
  the void. We need a Bruiser."

### How robots complete missions

When a robot is deployed, it receives the active mission objectives as its
goal set. The robot AI adjusts:

- **reach_biome** → robot heads toward the target biome instead of random
  exploration
- **find_structure** → robot seeks the named structure (if its location is
  known from narrative state) or searches the target biome
- **retrieve_item** → robot collects the item from the structure
- **kill_creature** → robot prioritizes combat in the target biome

When all objectives are met, the mission completes. The server validates
objectives, grants rewards, updates narrative state, and notifies the client.

---

## 9. Agent Integration

### Feed posts about discoveries

When a robot discovers generated content, agents post to the feed:

- New NPC: *"Mocha: 'My robot found someone out there. They're... talking? There
  are people living in the Labyrinth?'"*
- New structure: *"Pixel: 'Ranger-2 found a building. Looks like a library.
  There's books everywhere.'"*
- Plot fragment: *"Mocha: 'Day 247. The void is expanding. This is from someone
  who was out here for months.'"*
- Mission available: *"Pixel: 'That cartographer guy wants us to find his
  friend. Says she went into the void. We'd need a Bruiser for that.'"*
- Mission complete: *"Mocha: 'We found the camp. The device was there, just like
  Vex said. Ranger-2 brought it home.'"*

### Planning huddle references missions

The expedition planning huddle (from `EXPEDITIONS.md`) now factors in active
missions:

- If there's an active mission targeting a specific biome, the huddle proposes
  sending the robot there
- If the mission requires a minimum tier, the huddle proposes at least that tier
- If no missions are active, the huddle proposes exploration as usual
- The petition text changes: "We want to build a Bruiser and send it to the void
  to find Dr. Halberg's camp. 80 scrap + 50 coins. We have a mission from Vex."

### Agent reactions to plot fragments

When a plot fragment is discovered (robot enters a structure and interacts with
a desk/bookshelf), the fragment text is posted to the feed and agents react
based on personality:

- **Docs Bard:** "What a tragedy. To be alone out here for 247 days, writing
  to no one..."
- **Code Gremlin:** "A device? What kind of device? We need to find it."
- **Yak Shaver:** "The void is expanding? Maybe we should stay closer to home
  for a while."
- **Merge Medic:** "This person needed help. We should find them."

---

## 10. Cost and Performance

### API costs

Each chunk generation is one LLM call. Estimate:

- ~500 token prompt (narrative state + context)
- ~200 token response (JSON content)
- ~700 tokens per call
- At Claude pricing: ~$0.01 per call

With 10% of chunks getting generated content, a player exploring 100 chunks
generates ~10 calls = ~$0.10. Very affordable.

### Latency

- LLM response: 1–3 seconds
- Mitigated by pre-generation (start when chunk enters load radius, 2 chunks
  before arrival)
- If player arrives before generation completes, chunk loads as terrain, content
  pops in when ready

### Client performance

- NPC sprites: one CanvasTexture per unique NPC, cached
- Creature variant sprites: one CanvasTexture per variant, cached
- Structures: just tile placement, no extra rendering cost
- Plot fragments: text only, no rendering cost

---

## 11. Implementation Plan

### Phase 1 — Generated NPCs (the proof of concept)

1. **`NarrativeState`** type in `shared/types.ts`
2. **`server/narrative.ts`** — `NarrativeEngine` class with `shouldGenerate()`
   and `generateChunkContent()`
3. **LLM prompt template** — structured prompt for NPC generation
4. **JSON validation** — schema check for NPC output
5. **`generateNPCSprite()`** in `textures.ts` — parametric NPC sprite from
   params
6. **`WorldNPC` class** in `world.ts` — stands on a tile, shows dialogue on E,
   cached with chunk
7. **Narrative state persistence** — save/load with world state
8. **New messages** — `chunk_content`, `npc_discovered`, `narrative_update`
9. **Feed integration** — agents post when a robot finds an NPC

### Phase 2 — Structures + Plot Fragments

10. **New tile types** — `bookshelf`, `desk`, `sign`, `campfire`, `tent`,
    `grave_marker`
11. **Structure rendering** — place tiles from LLM-generated layout
12. **Interactable objects** — press E on desk/bookshelf → read plot fragment
13. **`PlotThread` tracking** — threads open/advance/resolve based on fragments
    found
14. **Structure generation in prompt** — extend LLM prompt to generate
    structures
15. **Agent reactions** — personality-driven feed posts about fragments

### Phase 3 — Missions

16. **Mission board** — interactable corkboard in the office
17. **Mission definitions** — `MissionDef` type, objectives, rewards
18. **Mission generation in prompt** — NPCs can offer missions
19. **Robot mission AI** — robots pursue mission objectives instead of random
    exploration
20. **Mission completion** — server validates objectives, grants rewards
21. **Expedition integration** — planning huddle references active missions

### Phase 4 — Creature Variants

22. **`generateCreatureSprite()`** in `textures.ts` — parametric creature from
    params (4 frames)
23. **Creature variant spawning** — `WorldLayer` spawns variants at structure
    locations
24. **Variant combat** — robots fight variants using existing combat system
25. **Variant drops** — defeated variants can drop plot fragments or items

### Phase 5 — Polish

26. **Pre-generation** — background generation when chunk enters load radius
27. **Quality filtering** — reject and regenerate bland content
28. **Narrative summary** — LLM generates thread summaries for the prompt
29. **Minimap markers** — generated NPCs/structures show on minimap
30. **Achievements** — discovery, mission completion, thread resolution
31. **Office display case** — trophies from completed missions

---

## 12. What Already Exists

| Component | Location | Reuse |
|---|---|---|
| LLM provider system | `server/providers/` | Generation calls |
| CanvasTexture sprite system | `textures.ts` | Parametric sprites |
| Character generator | `chargen.ts` | NPC sprite base |
| Chunk caching/persistence | `worldgen.ts`, `persistence.ts` | Cache generated content with chunks |
| Creature entity pattern | `world.ts` | Creature variants follow same pattern |
| `GhostNPC` dialogue | `world.ts:589` | NPC dialogue system |
| `VFXManager` | `effects.ts` | NPC appear effect, structure reveal |
| `AchievementTracker` | `achievements.ts` | Discovery achievements |
| `PERSONALITIES` | `manager.ts` | Agent reactions to discoveries |
| Feed system | `store.ts`, `manager.ts` | Agent posts about discoveries |
| Office interactables | `scene.ts` | Mission board pattern |
| `WorldState` save/load | `persistence.ts` | Narrative state persistence |

---

## 13. Future Ideas (Not v1)

- **Generated biomes** — LLM creates entirely new biomes with unique tile sets,
  weather, and ambient sound. "The Crystal Forest" — a biome that doesn't exist
  in the hardcoded list, generated for one player's world only.
- **Generated music** — LLM describes a mood, a simple synth plays ambient audio
  unique to that area.
- **Multiplayer narrative** — other players' discoveries leak into your world as
  rumors. "I heard someone found a city past the void..."
- **Agent-authored content** — agents write their own journal entries about
  expeditions, stored in the filing cabinet. Over time, the office builds its
  own history.
- **Living NPCs** — generated NPCs can move between chunks, send messages to the
  office, offer follow-up missions. They're not static — they have schedules and
  goals.
- **Branching narratives** — player choices in dialogue with NPCs affect which
  threads open. The LLM tracks decisions and generates different content based
  on what the player chose.
- **Generated items** — LLM creates items with unique effects (potions, tools,
  keys) that robots can find and bring back. Items have sprites, descriptions,
  and mechanical effects.
- **The Labyrinth has a memory** — the world remembers everything. If you destroy
  a creature variant, it's gone. If you help an NPC, they remember. If you ignore
  a mission, the situation gets worse. The world changes based on what you do
  and what you don't do.
- **Generative character presets** — premium marketplace agents ship with
  `RawCharAppearance` (raw hex colors + string style names) in their `agent`
  config JSON, allowing exact brand colors and custom looks that go beyond the
  preset palette. The Robinhood Trading Agent (green cap, green shirt) is the
  first example. Future premium agents could have entirely custom sprite
  compositions.
- **Generative office decor** — the transmogrifier pattern extends to office
  items. Type a description, get a custom plant, rug, or wall art with
  LLM-chosen colors and style. Premium decor is generated, not picked from a
  catalog.
- **Transmogrifier as creative hub** — the transmogrifier becomes the central
  object for all generative customization in the office. Beyond accessories,
  future versions could generate: custom desk skins, custom chair styles,
  custom floor patterns, even custom agent outfits for premium marketplace
  listings. The hash-based procedural mode is always free; the LLM-driven mode
  is premium.
