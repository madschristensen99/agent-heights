# Agent HQ — Office Customization

The player can personalize their office space — swap floors, buy new desks and
chairs, place plants and decor, and choose between preset room layouts. The
existing Lumon theme becomes one of several available layouts rather than a
separate hardcoded mode.

---

## 1. Vision

You walk into your office and it feels like *yours*. The floors are marble, your
desk is a standing desk with a monitor glow, there's a bonsai in the corner and
a rug under the meeting area. Your agents sit in ergonomic mesh chairs you
picked out. The break room has an espresso machine instead of a drip coffee
maker because you earned the coins for it.

Customization is cosmetic — it doesn't affect agent productivity or gameplay
mechanics. It's a coin sink and a self-expression layer. The office is your
home base; making it feel personal keeps players coming back.

---

## 2. Resource Economy

### Coins

- **The player's currency** — already referenced by the "Coming Soon"
  achievements `first_coin`, `coin_hoarder`, and `first_purchase` in
  `client/src/game/achievements.ts`.
- **Earned by the player** from:
  - Task completion — each completed task by any agent gives the player a few
    coins ("company revenue"). Suggested: 2–5 coins per task.
  - Achievement unlocks — bonus coins per achievement (5–50 depending on tier).
  - Treasure brought back by robot expeditions (agents split the scrap, you get
    the coins).
- **Spent by the player** on:
  - Office furniture and decor (this system)
  - Expedition funding (existing expedition system)
  - Future cosmetic features (character outfits, etc.)

### Pricing Philosophy

- **Floors & walls**: cheap (10–30 coins) — high visual impact, encourages
  first purchases
- **Furniture (desks, chairs)**: medium (25–75 coins) — the core of
  customization
- **Decor (plants, rugs, lamps, art)**: varied (5–100 coins) — impulse buys
  and premium showpieces
- **Room layouts**: free — layouts are structural presets, not purchases

---

## 3. Room Layouts (Incorporating Lumon)

The existing theme system (`OfficeTheme` in `shared/types.ts`) switches between
hardcoded maps by restarting the scene. This becomes the **layout** layer —
structural presets that define room shape, wall positions, and desk placement
zones. Layouts are free to switch between.

### Available Layouts

| Layout | Description | Status |
|---|---|---|
| **Classic** | Wood floors, cozy open office, break room, meeting corner, mail room | Existing |
| **Lumon** | Green carpet sea, white walls, shared desk block in center | Existing |
| **Open Plan** *(future)* | No internal walls, one big room, desks in a circle | New |
| **Corner Office** *(future)* | L-shaped with private office nook, larger break room | New |
| **Loft** *(future)* | Exposed brick walls, high ceilings, industrial aesthetic | New |

### How Layouts Work

Each layout is a `MapTheme` object (already defined in
`scripts/generate-assets.ts`) with a `paint(G, W, F)` function. The layout
defines:

- Room shape and internal walls
- Desk positions (the `desks[]` array)
- Yuki's desk and Hermes's desk positions
- Spawn point and door position
- Default furniture for non-customizable slots (kitchen counters, server racks)

**Customization overrides** are applied *after* the layout's `paint()` runs.
When the scene builds the tilemap, it:

1. Loads the base layout map JSON (as today)
2. Applies floor/wall overrides from the player's customization data
3. Applies furniture overrides (swapped desks, chairs, placed decor)
4. Builds the collision/walkability grid from the final tile state
5. Runs `upgradeFurniture()` which renders procedural sprites on top

This means customization is a **post-processing layer** on top of the existing
layout system. The layout provides the skeleton; the player's choices skin it.

### Layout Selection UI

The settings panel (`hud.ts` → `openSettings()`) already has a theme dropdown.
This becomes a **layout dropdown** with the same behavior — changing it sends
`set_settings` and triggers a scene restart. The existing `OfficeTheme` type
expands to include new layouts as they're added.

---

## 4. Customization Categories

### 4.1 Flooring

Floor tiles are painted onto the Ground layer. Each layout defines floor zones
(work area, lobby, break room, meeting corner). The player picks a floor type
and it applies to all zones, or optionally per-zone in an advanced mode.

| Item | Cost | Description |
|---|---|---|
| Hardwood (default) | 0 | Warm wood planks — classic office |
| Polished Marble | 30 | White veined marble, reflective sheen |
| Industrial Concrete | 20 | Smooth gray concrete, modern loft feel |
| Bamboo | 25 | Light natural bamboo, eco startup vibe |
| Carpet Roll | 15 | Wall-to-wall office carpet, mute colors |
| Checkered Tile | 20 | Black-and-white checkerboard, diner style |
| Moss Floor | 50 | Living moss carpet, biophilic design |
| Glass Floor | 75 | Transparent panels with glowing underlights |

**Implementation**: Each floor type is a pair of `TILE` entries (A/B variants
for the alternating pattern). New tile drawers are added to
`generate-assets.ts`. At runtime, the scene reads the player's floor choice and
overrides Ground-layer tiles before building the collision grid.

### 4.2 Desks

Desks are the signature furniture piece — every agent sits at one. Swapping
desk style changes the visual for all standard desks (desk-left + desk-right
tile pair). Yuki's and Hermes's side desks have their own style options.

| Item | Cost | Description |
|---|---|---|
| Standard Wood (default) | 0 | Laminated wood with metal legs |
| Glass Top | 40 | Tempered glass surface, chrome frame |
| Standing Desk | 50 | Height-adjustable, modern silhouette |
| Walnut Executive | 60 | Rich dark wood, brass fittings |
| Minimalist White | 35 | Clean white laminate, no visible legs |
| Industrial Pipe | 45 | Reclaimed wood on black pipe frame |
| Gaming Battle Station | 70 | RGB accent strip, curved surface, cup holder |

**Implementation**: Each desk style is a new `drawDeskLeft*()` and
`drawDeskRight*()` function pair in `furniture.ts`. The `FURNITURE_TYPES`
registry maps tile IDs to draw functions — we add a style parameter that
selects which draw function to use. The scene reads the player's desk choice
and passes it to `upgradeFurniture()`.

### 4.3 Chairs

Chairs are already managed as separate sprites in the scene (not part of the
tilemap furniture layer). Each chair sprite uses one of four directional
textures (`CHAIR_TEX_DOWN`, `CHAIR_TEX_UP`, `CHAIR_TEX_LEFT`,
`CHAIR_TEX_RIGHT`). Swapping chair style means regenerating these four textures
with a different draw function.

| Item | Cost | Description |
|---|---|---|
| Ergonomic Mesh (default) | 0 | Black mesh back, adjustable |
| Leather Executive | 35 | Brown leather, high back, brass accents |
| Gaming Chair | 45 | Bucket seat, RGB strips, racing stripes |
| Beanbag | 25 | Slouchy fabric beanbag (comedic option) |
| Stacking Chair | 15 | Cheap plastic, no wheels |
| Eames Lounge | 80 | Mid-century modern, premium leather and wood |
| Exercise Ball Chair | 30 | Stability ball on a ring base |

**Implementation**: Add a `chairStyle` field to the customization data. In
`upgradeFurniture()`, the chair texture generation block reads this field and
calls the appropriate `drawOfficeChair*()` variant for each direction. The
scene's `syncAgents()` already swaps chair textures between up/down — it just
needs to use style-specific texture keys (e.g. `chair-up-leather`).

### 4.4 Plants & Decor

These are individual items the player places on specific tiles. Unlike
floors/desks/chairs which are global style swaps, decor is **per-tile
placement**.

| Item | Cost | Description |
|---|---|---|
| Small Potted Plant (default) | 0 | Basic green sprout |
| Tall Ficus | 20 | Floor-standing tree, fills a corner |
| Bonsai | 30 | Miniature tree on a ceramic tray |
| Cactus | 15 | Low-maintenance desert vibe |
| Hanging Ivy | 25 | Wall-mounted trailing vines |
| Monstera | 35 | Trendy split-leaf plant |
| Floor Lamp | 20 | Warm glow, ambient lighting |
| Desk Lamp | 15 | Task lighting, adjustable arm |
| Wall Art — Abstract | 25 | Geometric canvas print |
| Wall Art — Motivational | 15 | "HUSTLE" poster, startup parody |
| Area Rug — Persian | 40 | Ornate red and gold pattern |
| Area Rug — Shag | 30 | Fuzzy 70s throwback |
| Bookshelf | 50 | Tall shelf with colorful spines |
| Trophy Case | 60 | Glass display with golden cups |
| Aquarium | 80 | Fish tank with bubbling animation |
| Arcade Cabinet | 100 | Retro game cabinet, glowing screen |
| Espresso Machine | 45 | Replaces drip coffee maker |
| Mini Fridge | 35 | Personal beverage cooler |
| Transmogrifier | 100 | Copy/printer machine that generates custom accessories from text input (see §4.6) |

**Implementation**: Each decor item has a tile ID, a draw function, and a
`solid` collision flag. The player's customization data stores an array of
`{ itemId, tileX, tileY }` placements. During scene init, after the layout's
`paint()` runs, placed decor items are plotted onto the Furniture layer (or as
sprite overlays for animated items like the aquarium). The collision grid is
built after placement so solid items block walkability.

### 4.5 Wall Colors

Wall paint is a global tint applied to the `WALL_FACE` tiles. The layout
defines wall positions; the player picks the color.

| Item | Cost | Description |
|---|---|---|
| Off-White (default) | 0 | Standard office white |
| Warm Beige | 10 | Soft sand tone |
| Slate Gray | 15 | Modern cool gray |
| Sage Green | 20 | Calming nature tone |
| Navy Blue | 20 | Professional and deep |
| Exposed Brick | 40 | Red brick texture, industrial loft |
| Chalkboard | 35 | Dark writable surface, doodles appear |
| Wallpaper — Damask | 30 | Victorian patterned paper |

**Implementation**: Wall color is applied as a `setTint()` call on the wall
tiles after the tilemap is created, or as a separate set of wall tile drawers
in `generate-assets.ts` that use the player's chosen palette. The simpler
approach is tinting; the richer approach is dedicated tile art.

### 4.6 The Transmogrifier

A copy/printer-looking object placed in the break room near the wardrobe. Walk
up, press E, type anything, and it generates a wearable accessory you can
carry around. This is the **generative counterpart** to the wardrobe — instead
of carefully picking parameters, you type a prompt and get a result.

**Two modes**:

1. **Procedural (free)** — Hash the input text to deterministically derive
   colors and accessory style. Same input always produces the same result.
   No LLM cost, feels magical:
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

**Visual**: A gray copy/printer machine — paper tray at the bottom, green
status LED, paper output slot at the top. When activated, the machine whirs
(animation + sound), a piece of "paper" emerges with the accessory sprite
drawn on it, then the accessory pops out and is added to inventory. Toast:
*"Transmogrified! Got: Robinhood Cap"*.

**Premium tier**: Free players get procedural mode (hash-based). Premium
players get LLM-driven mode for truly custom, creative accessories. This is
the first example of the generative customization economy — the same pattern
extends to generative character presets, generative office decor, and
generative agent appearances in the marketplace. See `GENERATIVE.md` for the
full parametric sprite system design.

**Future expansion**: The transmogrifier could eventually generate more than
accessories — custom desk skins, chair styles, floor patterns, even full
agent outfits for premium marketplace listings. The hash-based procedural
mode is always free; the LLM-driven mode is premium.

---

## 5. Data Model

### New Types (`shared/types.ts`)

```typescript
/** A placed decor item in the office. */
export interface PlacedItem {
  itemId: string;       // e.g. "bonsai", "floor-lamp"
  tileX: number;        // grid position
  tileY: number;
}

/** Global style choices for the office. */
export interface OfficeStyles {
  floor: string;        // "hardwood" | "marble" | "concrete" | ...
  desk: string;         // "wood" | "glass" | "standing" | ...
  chair: string;        // "mesh" | "leather" | "gaming" | ...
  wall: string;         // "white" | "beige" | "brick" | ...
}

/** Full office customization state. */
export interface OfficeCustomization {
  layout: OfficeTheme;          // "classic" | "lumon" | ... (renamed from theme)
  styles: OfficeStyles;         // global style swaps
  decor: PlacedItem[];          // per-tile placed items
  ownedItems: string[];         // item IDs the player has purchased
}
```

### Persistence (`server/persistence.ts`)

Add `office?: OfficeCustomization` to `SaveState`. The JSONB blob in Supabase
auto-migrates — no schema change needed. The `DbPersistence` and `SaveFile`
classes get a `setOffice()` method following the existing pattern.

### Client Messages (`shared/types.ts`)

```typescript
| { type: "buy_item"; itemId: string }
| { type: "place_item"; itemId: string; tileX: number; tileY: number }
| { type: "remove_item"; tileX: number; tileY: number }
| { type: "set_office_styles"; styles: OfficeStyles }
| { type: "set_office_layout"; layout: OfficeTheme }
```

### Server Messages

```typescript
| { type: "office"; office: OfficeCustomization }
| { type: "coins"; amount: number }
| { type: "purchase_ok"; itemId: string; coinsRemaining: number }
| { type: "purchase_failed"; reason: string }
```

---

## 6. The Shop UI

A new modal accessible from the HUD (a "🛋️ FURNISH" button next to the
existing "⚙ SETTINGS" button, or via a new interactable furniture catalog on
a desk in the office).

### Layout

```
┌─────────────────────────────────────────────────┐
│  OFFICE SHOP                          🪙 247    │
├──────────┬──────────────────────────────────────┤
│ TABS     │  ITEM GRID                           │
│          │                                      │
│ Floors   │  [Hardwood]  [Marble]  [Concrete]   │
│ Desks    │   ✓ owned     30🪙      20🪙         │
│ Chairs   │                                      │
│ Walls    │  [Bamboo]    [Carpet]   [Moss]      │
│ Plants   │   25🪙       15🪙       50🪙         │
│ Decor    │                                      │
│          │  [Glass Floor]                       │
│          │   75🪙  "Transparent panels with     │
│          │         glowing underlights"         │
│          │   [BUY]                              │
└──────────┴──────────────────────────────────────┘
```

- **Tabs** filter by category (floors, desks, chairs, walls, plants, decor)
- **Owned items** show a checkmark and can be equipped/unequipped for free
- **Unowned items** show price and a BUY button
- **Decor items** (per-tile placement) enter placement mode after purchase
- **Style items** (floors, desks, chairs, walls) apply immediately on equip
- Coin balance shown in the top-right corner

### Placement Mode

When the player selects a decor item to place:

1. The game enters **placement mode** — a semi-transparent grid overlay appears
   over the office floor
2. The player walks around (or uses mouse) to highlight a tile
3. Valid tiles glow green; blocked tiles (walls, existing furniture, desks)
   glow red
4. Click or press E to place the item
5. Press Q or ESC to cancel (item returns to inventory)
6. Placed items can be picked up by walking near and pressing E (returns to
   inventory, no refund)

---

## 7. Scene Integration

### Build Order (modified `OfficeScene.create()`)

The existing phased init in `scene.ts` gets two new phases inserted:

```
Phase 1: textures & animations          (existing)
Phase 2: tilemap & collision            (existing — loads layout map)
Phase 2.5: APPLY CUSTOMIZATION          (NEW — overrides floors, walls,
                                         furniture tiles, placed decor)
Phase 3: map objects                    (existing — reads seats, monitors)
Phase 4: player & UI                    (existing)
Phase 5: interactables                  (existing)
Phase 6: world layer                    (existing)
...
```

### What Phase 2.5 Does

1. **Floor override**: Iterate Ground layer tiles. For each floor tile, replace
   with the player's chosen floor type (preserving the A/B alternation pattern).

2. **Wall override**: Apply wall color tint or swap wall tile IDs to the
   player's wall choice.

3. **Desk override**: The furniture layer already has `DESK_L`/`DESK_R` tiles
   at desk positions. Replace these with the player's desk style tile IDs (or
   mark them for the style-aware `upgradeFurniture()` pass).

4. **Chair override**: Pass the chair style to `upgradeFurniture()` so it
   generates style-specific chair textures.

5. **Decor placement**: For each `PlacedItem` in the player's customization
   data, set the appropriate tile on the Furniture layer (or queue a sprite
   overlay for animated items).

6. **Collision rebuild**: The walkability grid is built *after* all overrides
   are applied, so placed decor items correctly block movement.

### Live Editing vs Restart

- **Style swaps** (floor, desk, chair, wall) require a scene restart — they
  change tile textures and collision. The existing theme-restart pattern
  handles this.
- **Decor placement** can be live — adding a plant sprite to the scene doesn't
  require a full restart. Removing a decor item hides its sprite and updates
  the collision grid. This makes placement mode feel snappy and interactive.
- **Layout changes** require a restart (same as today's theme switch).

### Coin Display

Add a coin counter to the HUD top bar (next to the connection indicator).
Updates when the server sends `coins` messages. Stored in `Store` as
`playerCoins: number`.

---

## 8. Item Catalog Definition

All items are defined in a single catalog file (e.g.
`shared/office-catalog.ts`) that both client and server can import:

```typescript
export interface CatalogItem {
  id: string;
  name: string;
  category: "floor" | "desk" | "chair" | "wall" | "plant" | "decor";
  cost: number;
  description: string;
  /** Tile ID(s) this item maps to (for tile-based items). */
  tileIds?: number[];
  /** Whether the item blocks movement. */
  solid?: boolean;
  /** Whether the item is animated (rendered as sprite, not tile). */
  animated?: boolean;
  /** Icon for the shop UI (emoji or sprite key). */
  icon: string;
}

export const CATALOG: CatalogItem[] = [
  { id: "floor-hardwood",  name: "Hardwood",        category: "floor",  cost: 0,  icon: "🪵",  description: "Warm wood planks" },
  { id: "floor-marble",    name: "Polished Marble",  category: "floor",  cost: 30, icon: "⬜",  description: "White veined marble" },
  { id: "desk-wood",       name: "Standard Wood",    category: "desk",   cost: 0,  icon: "🪵",  description: "Laminated wood desk" },
  { id: "desk-glass",      name: "Glass Top",        category: "desk",   cost: 40, icon: "🔍",  description: "Tempered glass surface" },
  { id: "chair-mesh",      name: "Ergonomic Mesh",   category: "chair",  cost: 0,  icon: "🪑",  description: "Black mesh back" },
  { id: "chair-leather",   name: "Leather Executive",category: "chair",  cost: 35, icon: "🪑",  description: "Brown leather, high back" },
  { id: "plant-bonsai",    name: "Bonsai",           category: "plant",  cost: 30, icon: "🌳",  description: "Miniature tree", solid: true },
  { id: "decor-aquarium",  name: "Aquarium",         category: "decor",  cost: 80, icon: "🐟",  description: "Fish tank", solid: true, animated: true },
  // ... etc
];
```

The server uses this catalog to validate purchases and deduct coins. The
client uses it to render the shop UI.

---

## 9. Implementation Phases

### Phase 1 — Foundation (MVP)

- Add `OfficeCustomization` types to `shared/types.ts`
- Add `office` field to `SaveState` + `setOffice()` to persistence
- Add `coins` to `SaveState` + `Store`
- Add coin earning on task completion (server-side)
- Add `buy_item`, `set_office_styles` client messages
- Add `office` and `coins` server messages
- Build the item catalog (`shared/office-catalog.ts`)
- Implement 3 floor styles + 2 desk styles + 2 chair styles (procedural draw
  functions in `furniture.ts`)
- Add the "Apply Customization" phase to scene init
- Add a basic shop modal (style swaps only, no placement)
- Wire up the `first_coin` and `first_purchase` achievements

### Phase 2 — Decor Placement

- Add `place_item` / `remove_item` messages
- Build placement mode (grid overlay, valid/invalid tile highlighting)
- Implement 8–10 decor items (plants, lamps, rugs, bookshelf)
- Add live sprite placement (no scene restart needed for decor)
- Add a furniture catalog interactable in the office (a desk or kiosk)

### Phase 3 — Polish

- Add wall color/style options (8 styles)
- Add remaining floor, desk, and chair styles
- Add animated decor items (aquarium, arcade cabinet)
- Add per-zone floor selection (advanced mode)
- Add item preview in shop (render the item in a mini canvas)
- Add "reset to default" button
- Add the `coin_hoarder` achievement (1,000 coins)

### Phase 4 — New Layouts

- Design and implement 2–3 new room layouts (Open Plan, Corner Office, Loft)
- Add layout preview thumbnails in the settings panel
- Ensure all customization overrides work across all layouts
- Add layout-specific decor placement validation (some items may not fit in
  certain layouts)

### Phase 5 — The Transmogrifier

- Add `CarriedAccessory` type to `shared/types.ts`
- Add `accessories: CarriedAccessory[]` to `SaveState` + persistence
- Implement `generateAccessorySprite()` in `chargen.ts` — draws an accessory
  from `CarriedAccessory` params (type, baseColor, accentColor, glow, features)
- Add new accessory types to `drawAccessory()` (scarf, mask, crown, cape, etc.)
- Add the transmogrifier as an office interactable (copy/printer visual, E-press)
- Build text input modal for the transmogrifier
- Implement procedural (hash-based) mode — free for all players
- Implement LLM-driven mode — premium only, gated by subscription check
- Add equip/unequip UI for carried accessories (in wardrobe or quick-equip slot)
- Wire up `RawCharAppearance` support in `appearanceToPalette()` so equipped
  accessories with custom colors render correctly
- Toast: *"Transmogrified! Got: [name]"* on success

---

## 10. Relationship to Existing Systems

### Expeditions (`docs/EXPEDITIONS.md`)

Coins are shared between both systems. The expedition doc already mentions
"cosmetic desk upgrades, office decorations" as a future coin sink. This doc
is the realization of that forward reference. The `first_purchase` achievement
("Buy your first cosmetic desk upgrade") is the bridge.

### Achievements (`client/src/game/achievements.ts`)

Three "Coming Soon" achievements become activatable:
- `first_coin` — "Earn your first coin" → activate when coin earning goes live
- `coin_hoarder` — "Accumulate 1,000 coins" → track coin balance
- `first_purchase` — "Buy your first cosmetic desk upgrade" → activate when
  the shop opens

### Character Customization (`shared/types.ts` → `CharAppearance`)

The office customization follows the same pattern as character appearance:
index-based style selections, procedural rendering, persisted in save data.
The Wardrobe modal is the UI template for the shop modal.

The character system also has a **generative path** — the transmogrifier
(§4.6) and premium marketplace agents use `RawCharAppearance` (raw hex
colors + string style names) instead of preset indices. The underlying
renderer (`chargen.ts` → `CharPalette`) already works with hex strings, so
both representations coexist. See `GENERATIVE.md` §5 for the full
`RawCharAppearance` design and parametric sprite system.

### Theme System (`OfficeTheme` in `shared/types.ts`)

The existing `OfficeTheme` type (`"classic" | "lumon"`) becomes the layout
identifier. The `OFFICE_THEMES` array expands with new layouts. The settings
panel dropdown is rebranded from "OFFICE THEME" to "ROOM LAYOUT". The scene
restart mechanism is unchanged.

### Furniture Rendering (`client/src/game/furniture.ts`)

The `FURNITURE_TYPES` registry and `upgradeFurniture()` function are the
primary extension points. New furniture styles add new draw functions and
new entries to the registry. The function signature may gain a `styles`
parameter to select which draw variant to use for each category.

### Asset Generation (`scripts/generate-assets.ts`)

New floor/wall tiles are added to the tileset PNG via new tile drawers. The
tileset grid expands from 42 tiles to accommodate new floor and wall variants.
The `buildMap()` function's `MapTheme.paint()` calls are unchanged —
customization is applied as a post-processing layer, not baked into the map
JSON.
