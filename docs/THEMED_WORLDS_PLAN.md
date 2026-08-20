# Themed Worlds Overhaul Plan

## Problem Statement

Themed worlds (Erics Alley, Hawaii, Old South) currently feel like reskinned versions of the default world, not distinct experiences. Specific issues:

1. **Ground tiles lack variety** — Theme spritesheets have only 6 frames (1 per biome), while the default sheet has 96 (24 tile types × 4 variants). No visual texture variation.
2. **Same objects in every world** — Golf bag always placed at chunk (0,0). Big lake always placed. `pickObstacle`, `pickDecoration`, `pickHostile` all switch on default biome names ("meadow", "forest", etc.) and return `undefined` for themed biomes like "alley" or "beach".
3. **No theme-specific world features** — No cars in Erics Alley, no fire dancers in Hawaii, no cotton fields in Old South. The worldgen places golf courses, tennis courts, fountains, parks — all hardcoded to default biomes.
4. **Faction wars exist but are muted** — `FactionManager` only spawns at hostility ≥ 3 (far from office). User wants gang wars visible and central to the experience.
5. **No vehicles** — No moving objects on roads/streets. User wants GTA-like cars driving around.

## Architecture Analysis

### Current Flow
```
generateChunk(seed, cx, cy, theme?)
  → biomeAt() → picks biome from theme.worldgen.biomes (e.g. "alley", "street", ...)
  → baseGround(biome, theme) → theme.worldgen.baseGround[biome] (e.g. 0 for alley)
  → groundVariation(biome, theme) → theme.worldgen.obstacles[biome][0] (first obstacle tile)
  → pickObstacle(biome, rng, hostility) → switch(biome) — NO themed biome cases → returns undefined
  → pickDecoration(biome, rng) → switch(biome) — NO themed biome cases → returns undefined
  → pickHostile(biome, rng, type) → switch(biome) — NO themed biome cases → returns TILE.ROCK
  → Hardcoded features: golf (meadow only), tennis (meadow/forest), fountains (meadow), etc.
  → Golf bag at chunk (0,0) — UNCONDITIONAL
  → Big lake — UNCONDITIONAL
```

### Key Files
- `client/src/game/worldgen.ts` — Chunk generation, obstacle/decoration/hostile picking, feature placement
- `client/src/game/world.ts` — Chunk rendering, creature/NPC spawning, world update loop
- `client/src/game/alley-tiles.ts` — Procedural tile drawing for Erics Alley (6 biome frames)
- `client/src/game/hawaii-tiles.ts` — Procedural tile drawing for Hawaii (6 biome frames)
- `client/src/game/south-tiles.ts` — Procedural tile drawing for Old South (6 biome frames)
- `client/src/game/factions.ts` — Faction NPC system (already theme-aware via `ThemeConflict`)
- `client/public/assets/themes/*.json` — Theme configs with worldgen, conflict, sky, etc.
- `shared/types.ts` — `ThemeWorldgen`, `WorldTheme`, `TILE` enum

---

## Implementation Plan

### Phase 1: Theme-Aware Worldgen Dispatch
**Goal:** Replace hardcoded biome switches with theme-dispatched worldgen.

**1A. Theme-dispatched obstacle/decoration/hostile picking**
- Add `theme.worldgen.obstacles` lookup to `pickObstacle()` — currently the function switches on default biomes only. For themed worlds, pick from `theme.worldgen.obstacles[biome]` array using rng.
- Add `theme.worldgen.decorations` lookup to `pickDecoration()` — same pattern.
- Add `theme.worldgen.hostileTiles` lookup to `pickHostile()` — same pattern.
- Add `decorationChance()` theme override — add `theme.worldgen.decorationChance` optional field, or derive from biome index.
- Fallback to default switches when no theme.

**1B. Theme-dispatched feature placement**
- Create a `ThemeFeatures` interface in `ThemeWorldgen`:
  ```typescript
  features?: {
    nearOffice?: string[];   // feature names to place near office
    midRange?: string[];     // features for mid-distance chunks
    farRange?: string[];     // features for distant chunks
  };
  ```
- Create a feature registry: `Record<string, (tiles, rng, cx, cy, theme) => void>`
- Register default features: golf, tennis, fountain, park, lake, etc.
- Register theme-specific features (see Phase 2)
- In `generateChunk`, replace hardcoded `if (biome === "meadow")` checks with theme-dispatched feature placement

**1C. Remove unconditional placements**
- Gate golf bag at chunk (0,0) behind `!theme` (default world only) or theme feature config
- Gate big lake behind `!theme` or theme feature config
- Gate golf courses behind `!theme` or theme feature config

---

### Phase 2: Theme-Specific World Features
**Goal:** Each theme gets unique outdoor features that define its identity.

**2A. Erics Alley — Urban Gritty**
- **Cars driving on streets** — New `Vehicle` entity class in `world.ts`:
  - Spawns on "street" biome tiles
  - Drives in straight lines along roads, turns at intersections
  - Player can interact (hijack) — enters "driving mode" (speed boost, can run over creatures)
  - Simple AI: patrol, stop at obstacles, occasional random turns
  - Procedural sprite: drawn as sedan/van with Phaser graphics
- **Gang territory markers** — Spray-painted turf boundaries on walls/ground
- **Cardboard shanties** — Clusters of cardboard box obstacles in "abandoned" biome
- **Manhole covers** — Decorative tiles in "sewer" biome, some open (shaft of light)
- **Dumpster clusters** — Groups of dumpsters as obstacles in "alley" biome
- **Graffiti walls** — Multi-tile obstacle with colorful tags

**2B. Hawaii — Tropical Paradise**
- **Fire dancers** — NPC entities that perform fire spinning animation on "beach" biome
  - Procedural sprite: figure with animated fire circle
  - Stationary, performs on a timer, gives warmth buff if player watches
- **Tiki torches** — Line paths near office, animated flame
- **Coconut groves** — Clusters of palm trees with collectible coconuts
- **Lava streams** — Flowing lava channels in "volcanic_ridge" biome (visual + damage)
- **Tidal pools** — Small water features in "beach" biome with collectible shells
- **Outrigger canoes** — Beached boats as obstacles/decoration on beach

**2C. Old South — Antebellum**
- **Cotton field rows** — Organized row patterns in "cotton_field" biome (already has tile drawing, needs field placement)
- **Plantation houses** — Large multi-tile structures in "garden" biome
- **Carriages on dirt roads** — Horse-drawn carriage entity on "garden"/"cotton_field" paths
  - Slower than cars, follows road tiles
  - Player can ride (transport)
- **Bayou bridges** — Wooden bridges over "bayou" water tiles
- **Battlefield trenches** — Multi-tile earthwork structures in "battlefield" biome
- **Smokehouse ruins** — Chimney remnants as obstacles in "battlefield" biome

---

### Phase 3: Enhanced Faction Wars
**Goal:** Make gang wars a central, visible part of themed worlds.

**3A. Lower hostility threshold for themed conflicts**
- Currently `FACTION_MIN_HOSTILITY = 3` — too far from office
- Add `theme.conflict.minHostility` field (default 3, set to 1 for Erics Alley)
- Add `theme.conflict.spawnInterval` and `theme.conflict.capPerSide` overrides

**3B. Faction territory zones**
- Visual markers on the ground showing faction control
- Turf color tinting on tiles within a faction's zone
- Boundary clashes where territories meet

**3C. Faction reinforcements**
- Periodic spawn waves, not just individual NPCs
- "War boss" spawns when one side is losing badly
- Player can tip the balance by attacking one side

**3D. Theme-specific faction sprites**
- Erics Alley: gang members with distinct colors (Steel Dragons vs Concrete Kings)
- Hawaii: tribal warriors (Shark Tribe vs Turtle Tribe)
- Old South: soldiers (Union vs Confederacy)
- Replace creature sprite reuse with theme-specific procedural sprites

---

### Phase 4: Vehicle System
**Goal:** GTA-like vehicles that drive around and can be hijacked.

**4A. Vehicle entity class**
- New `Vehicle` class in `world.ts` (alongside `Creature`, `Slug`, `Dog`)
- Properties: position, velocity, sprite, type (car/van/truck/carriage/outrigger)
- Behavior states: `patrol` (driving route), `stopped` (at intersection/obstacle), `hijacked` (player driving)
- Road-following AI: detect road tiles, follow them, turn at intersections
- Collision: avoid obstacles, stop at water/walls, damage creatures on impact

**4B. Vehicle spawning**
- Theme-specific spawn logic:
  - Erics Alley: cars on "street" biome, vans on "alley" biome
  - Hawaii: outrigger canoes near beach water, golf carts on "beach"
  - Old South: carriages on "garden"/"cotton_field" paths
- Spawn cap and despawn when far from player (same pattern as creatures)

**4C. Hijack/ride interaction**
- Press E near a stopped/slow vehicle → enter driving mode
- Player sprite hidden, vehicle sprite shows
- WASD controls vehicle, speed boost vs walking
- Can run over creatures (damage), can crash (take damage)
- Press E again to exit

**4D. Procedural vehicle sprites**
- Draw cars/vans/trucks with Phaser graphics (rectangles, circles for wheels)
- Theme-specific styling: rusty cars for Alley, colorful golf carts for Hawaii, horse-drawn carriages for Old South

---

### Phase 5: Ground Tile Visual Variety
**Goal:** Theme spritesheets need more than 1 frame per biome.

**5A. Add variant frames to theme spritesheets**
- Update `generateAlleyWorldTiles`, `generateHawaiiWorldTiles`, `generateSouthWorldTiles` to produce 4 variants per biome (matching `WORLD_VARIANTS = 4`)
- Each variant: same base color/pattern but slightly different noise/detail (cracks, pebbles, patches)
- Spritesheet grows from 6 frames to 24 frames (6 biomes × 4 variants)

**5B. Update tileToFrame for theme variants**
- Current fix maps all tiles to 1 frame per biome
- Update to: `biomeFrame * WORLD_VARIANTS + variant`
- This gives each biome 4 visual variants for ground texture variety

**5C. Improve ground variation blending**
- `groundVariation()` currently uses first obstacle tile as variation — looks bad
- Instead, use a slightly different color variant of the same ground tile
- Or add a `theme.worldgen.variationTile` field with a proper secondary ground tile per biome

---

### Phase 6: Theme-Specific Outdoor Activities
**Goal:** Replace generic activities (golf, tennis) with theme-appropriate ones.

**6A. Activity registry**
- Create `ThemeActivity` interface and registry
- Default world: golf, tennis, fishing
- Each theme registers its own activities

**6B. Erics Alley activities**
- **Dice games** — Interactive tile in alley biome, gamble void shards
- **Graffiti tagging** — Pick up spray paint, tag walls for territory points
- **Card games** — Cardboard box stations outside for gambling

**6C. Hawaii activities**
- **Fire dancing** — Pick up fire torch, perform for rewards
- **Surfing** — Ride waves on beach, timing-based minigame
- **Coconut harvesting** — Collect coconuts from palm groves

**6D. Old South activities**
- **Cotton harvesting** — Collect cotton from field rows
- **Horseback riding** — Mount horses for faster travel
- **Fishing in the bayou** — Catch fish, trade with NPCs

---

## Priority & Sequencing

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| 1: Theme-aware worldgen | Medium | High — fixes broken obstacle/decoration/feature placement | P0 |
| 5: Ground tile variety | Low | High — fixes visual quality of ground tiles | P0 |
| 2: Theme-specific features | High | Very High — defines world identity | P1 |
| 4: Vehicle system | High | Very High — GTA-like feel | P1 |
| 3: Enhanced faction wars | Medium | High — gang wars central to experience | P2 |
| 6: Theme activities | Medium | Medium — depth and replayability | P3 |

## Recommended Implementation Order

1. **Phase 1 + 5** (P0) — Fix the fundamentals: theme-aware worldgen dispatch + ground tile variety. This makes the worlds look correct and distinct without adding new systems.
2. **Phase 4** (P1) — Vehicle system. This is the biggest "wow" factor and most complex new system.
3. **Phase 2** (P1) — Theme-specific features. Gives each world its identity.
4. **Phase 3** (P2) — Enhanced faction wars. Makes gang wars prominent.
5. **Phase 6** (P3) — Theme activities. Depth layer on top.

## Technical Considerations

- **Performance**: Vehicles and new NPCs add update loop cost. Keep caps reasonable (5-8 vehicles, similar to creature cap).
- **Sprite generation**: All new entities use procedural Phaser graphics (no external assets needed for procedural tier).
- **Theme JSON**: Add new optional fields to `ThemeWorldgen` and `ThemeConflict` — backward compatible.
- **Chunk caching**: New tile types don't need new cache keys — they use existing tile IDs.
- **Multiplayer**: Vehicles and activities are client-side only (cosmetic), no server sync needed.
