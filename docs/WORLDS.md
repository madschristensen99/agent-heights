# Agent Heights — Worlds Mode

Alternate realities as GitHub branches. Each world is a fork of the game
running on its own Railway deployment, with its own visual theme, assets,
and world generation. A wizard NPC lets you reshape the world through
conversation — every change is a commit to the branch.

---

## 1. Vision

The base game is the **HQ** — the office building with the meadow→infernal
biome gradient. Worlds Mode lets players generate **alternate worlds** that
replace the visual metaphor entirely. Instead of an office with computers,
a world might be a back alley with street life, a medieval castle with
alchemy, a space station with robotics — whatever the world creator
imagines.

Each world is:
- A **GitHub branch** on the player's fork of the repo
- **Deployed to Railway** as an independent game instance
- **Themed** — different furniture, tiles, biomes, visual metaphors
- **Editable in-game** via the Wizard NPC, who maps conversation to file
  commits on the branch

Players enter worlds through **portals** from the HQ, or directly via URL.

---

## 2. What Already Exists

Significant infrastructure is already built:

| Component | Location | Status |
|---|---|---|
| GitHub API client | `server/github.ts` | ✅ Fork, branch, read/write/create/delete files |
| Railway deploy | `server/providers/railway-mcp.ts` | ✅ Deploy branch as live service |
| World deployment types | `shared/types.ts:583` | ✅ `WorldDeployment` interface |
| WS messages | `shared/types.ts:686-698` | ✅ `github_fork`, `github_query`, `railway_deploy`, etc. |
| Client state | `client/src/store.ts:75-86` | ✅ `currentWorld`, `deployments`, `portalTarget` |
| Worlds panel UI | `client/src/ui/hud.ts:3639` | ✅ Create fork, list branches, deploy, open portal |
| Portal navigation | `client/src/ui/hud.ts:4102` | ✅ "Open Portal" button → navigate to Railway URL |
| Return to HQ | `client/src/ui/hud.ts:2049` | ✅ Banner with "← Return to HQ" button |
| In-game code editor | `client/src/ui/hud.ts` | ✅ Browse/edit files on a branch via GitHub API |
| Asset generation | `scripts/generate-assets.ts` | ✅ Procedural PNG generation for base game |
| AI tile textures | `client/src/game/ai-tiles.ts` | ✅ AI-generated texture mapping system |
| Worldgen | `client/src/game/worldgen.ts` | ✅ Seeded chunk generation with biomes |
| Furniture rendering | `client/src/game/furniture.ts` | ✅ 30+ procedural furniture types |

**The full flow already works:** fork repo → create branch → deploy to
Railway → open portal → play in alt world → return to HQ.

What's missing is **theming**, the **wizard NPC**, and **asset generation
for alt worlds**.

---

## 3. World Theme System

### 3.1 The Problem

The base game's visual identity is hardcoded across multiple files:
- `furniture.ts` — 30+ office furniture drawing functions
- `worldgen.ts` — biome names, tile types, obstacle/decoration pickers
- `scene.ts` — office layout, interactable objects, helipad, chimney
- `textures.ts` — creature sprites, effect textures
- `ai-tiles.ts` — AI texture key mappings
- `boot.ts` — asset loading (spritesheets, tilesets)
- `shared/types.ts` — `TILE` enum, `Biome` type

An alt world needs to override all of these without forking the entire
codebase per world.

### 3.2 Theme Config

A world theme is a JSON config file (`world-theme.json`) committed to the
branch root. The game loads it at boot and uses it to override the base
theme.

```typescript
interface WorldTheme {
  /** Unique identifier for this theme. */
  id: string;
  /** Display name shown in world selection UI. */
  name: string;
  /** Short description. */
  description: string;
  /** Visual metaphor — what the agent "work" activity looks like. */
  workMetaphor: string;
  /** Arrival metaphor — replaces helicopter delivery. */
  arrivalMetaphor: string;

  /** Office layout — replaces the Tiled map. */
  office: {
    tilemapPath: string;       // path to Tiled JSON on the branch
    tilesetPath: string;       // path to tileset PNG on the branch
    floorTile: number;
    wallTile: number;
    doorTile: number;
  };

  /** Furniture overrides — which furniture drawing functions to use. */
  furniture: {
    [tileId: number]: string;  // tileId → drawing function name
  };

  /** World generation overrides. */
  worldgen: {
    biomes: string[];                    // biome names (replaces meadow→infernal)
    baseGround: { [biome: string]: number };
    obstacles: { [biome: string]: number[] };
    decorations: { [biome: string]: number[] };
    hostileTiles: { [biome: string]: number[] };
    hostilityThresholds: number[];       // chunk distances for each biome
  };

  /** Tile definitions — new tile types for this world. */
  tiles: {
    [name: string]: {
      id: number;
      walkable: boolean;
      textureKey?: string;     // AI-generated texture key
      animated?: boolean;
      frames?: number;
    };
  };

  /** Interactable objects — replaces office interactables. */
  interactables: {
    [name: string]: {
      tileId: number;
      x: number;
      y: number;
      interactionType: string;  // "wizard", "wardrobe", "forge", etc.
    };
  };

  /** Agent work animation override. */
  agentWorkAnim: {
    spritesheetPath: string;   // path to PNG on the branch
    frames: number;
    frameRate: number;
  };

  /** Status colors — can override to match theme palette. */
  statusColors?: {
    idle: number;
    thinking: number;
    working: number;
    done: number;
    error: number;
    waiting: number;
  };

  /** Emote map — can override emote icons. */
  emotes?: Record<string, number>;

  /** Asset paths — all relative to the branch root. */
  assets: {
    tilesetPath: string;
    characterSpritesheetPath: string;
    furnitureSpritesheetPath?: string;
    worldTileSpritesheetPath?: string;
    uiTexturePath?: string;
  };
}
```

### 3.3 Theme Loading

At boot, the game checks for `world-theme.json` in the asset path. If
found, it loads the theme config and uses it to override the base game's
hardcoded values. If not found, the game runs in **HQ mode** (default
office theme).

```
Boot sequence:
  1. Load world-theme.json (if exists)
  2. If theme found:
     a. Load theme tileset PNG
     b. Load theme furniture spritesheet (if specified)
     c. Load theme world tile spritesheet (if specified)
     d. Load theme character spritesheet (if specified)
     e. Override worldgen biome/tile mappings
     f. Override furniture drawing functions
     g. Override interactable object positions
  3. If no theme: proceed with base game assets (existing behavior)
```

### 3.4 Theme-Aware Rendering

The key insight: the rendering pipeline doesn't need to change. Phaser
renders tiles and sprites the same way regardless of theme. What changes
is **which textures are loaded** and **which drawing functions generate
them**.

For procedural furniture (Canvas2D), each theme provides its own set of
drawing functions in a `furniture-theme.ts` file on the branch. The
`furniture.ts` loader checks the theme and imports the right module.

For AI-generated textures, each theme has its own set of PNGs in
`client/public/assets/ai/` on the branch, with the same texture keys
as the base game.

---

## 4. The Wizard NPC

### 4.1 Concept

The Wizard is an in-game NPC that lives in every alt world. It's the
**world editor** — you talk to it in natural language, and it modifies
the world by committing changes to the GitHub branch.

The Wizard is powered by an LLM (Claude, via the existing provider
system). It has access to:
- The current `WorldTheme` config
- The GitHub branch file API (read, write, create, delete files)
- The asset generation pipeline
- Knowledge of the game's codebase structure

### 4.2 Interaction Flow

```
Player walks up to Wizard NPC → presses E
    │
    ▼
Chat panel opens (similar to agent chat, but with Wizard)
    │
    ▼
Player types: "Make the agents sit on toilets instead of desks"
    │
    ▼
Wizard (LLM) interprets request:
    · Identifies what needs to change (furniture, tilemap, sprites)
    · Generates new furniture drawing code
    · Generates/updates world-theme.json
    · Commits changes to the GitHub branch via GitHub API
    │
    ▼
Wizard responds: "Done! I've replaced the desks with toilets. The
agents will now sit on toilets while they work. Redeploy to see
the changes."
    │
    ▼
Player clicks "Redeploy" (or Wizard auto-triggers redeploy)
    │
    ▼
Railway rebuilds the branch → world reloads with new theme
```

### 4.3 Wizard Capabilities

The Wizard can:

1. **Modify furniture** — Generate new Canvas2D drawing functions for
   furniture pieces, commit them to `furniture-theme.ts` on the branch

2. **Modify tiles** — Generate new tile textures, update the tileset PNG,
   update `world-theme.json` tile definitions

3. **Modify worldgen** — Change biome names, tile distributions, obstacle
   types, hostility thresholds

4. **Modify the office layout** — Edit the Tiled map JSON to rearrange
   furniture, add/remove rooms, change floor/wall tiles

5. **Modify agent animations** — Generate new work animation spritesheets
   (e.g., smoking instead of typing)

6. **Modify interactables** — Add/remove/ relocate interactive objects

7. **Generate new assets** — Use the AI asset pipeline to generate new
   textures and commit them to the branch

8. **Modify status colors and emotes** — Override the visual feedback
   system to match the theme

### 4.4 Wizard as Agent

The Wizard is implemented as a special agent type — it uses the existing
LLM provider system but with a specialized system prompt and tool set:

```typescript
const WIZARD_SYSTEM_PROMPT = `
You are the World Wizard, a magical entity that can reshape this game world.
You exist inside a game called Agent Heights, which is running on a GitHub
branch. You can modify the world by editing files on the branch.

The world is defined by:
- world-theme.json (theme configuration)
- client/public/assets/maps/office.json (Tiled map layout)
- client/public/assets/tilesets/ (tile graphics)
- client/src/game/furniture-theme.ts (procedural furniture drawing)
- client/public/assets/ai/ (AI-generated textures)

When the player asks you to change something, you:
1. Identify which files need to change
2. Generate the new content (code, JSON, or image descriptions)
3. Commit the changes to the branch using your file editing tools
4. Explain what you changed in plain language
5. Suggest redeploying to see the changes

You can generate new assets by describing them and using the asset
generation tool, which creates PNGs and commits them to the branch.

Be creative, be responsive, and make the world feel alive.
`;
```

The Wizard has access to GitHub file operations via MCP tools:
- `github_read_file` — read any file on the branch
- `github_write_file` — modify an existing file
- `github_create_file` — create a new file
- `github_delete_file` — remove a file
- `generate_asset` — generate a new texture/image and commit it

### 4.5 Wizard NPC Visual

The Wizard is a distinct NPC sprite — a robed figure with a staff, or
whatever fits the world's theme. In the base HQ, the Wizard doesn't
appear (the HQ is the default world, not editable). In alt worlds, the
Wizard stands in a prominent location (center of the map, or near the
spawn point).

The Wizard sprite is generated per-world by the asset pipeline, based
on the world theme. In Erics Alley, the Wizard might be a street-wise
character with a hoodie and a spray can.

---

## 5. Asset Generation Pipeline for Alt Worlds

### 5.1 Current Pipeline (Base Game)

The base game uses `scripts/generate-assets.ts` to generate all pixel art
procedurally (characters, tilesets, maps, sprites). Additionally,
`docs/AI_ASSETS_PLAN.md` describes an AI generation pipeline using:
- **PATINA Material** — tileable surface textures (PBR maps)
- **Recraft V4.1** — object sprites (SVG source)
- **Nano Banana 2** — complex sprites (raster)

These are run once and committed as static files.

### 5.2 Alt World Pipeline

For alt worlds, asset generation happens **on demand** when the Wizard
creates or modifies a world. The pipeline:

```
Wizard describes a new asset (e.g., "a dumpster for the alley world")
    │
    ▼
Asset generation tool:
    1. Calls AI image generation API (Nano Banana 2 or Recraft)
    2. Post-processes: resize to 64×64, remove background (Bria RMBG)
    3. Saves as PNG to client/public/assets/ai/
    4. Commits to the GitHub branch via GitHub API
    │
    ▼
World theme config updated to reference the new asset
    │
    ▼
Redeploy → asset loads in the world
```

### 5.3 Procedural Furniture for Alt Worlds

For procedural (Canvas2D) furniture, the Wizard generates TypeScript
code for new drawing functions. Example for Erics Alley:

```typescript
// furniture-theme.ts (committed to the branch by the Wizard)
function drawDumpster(ctx: CanvasRenderingContext2D, s: number): void {
  // ... Canvas2D drawing code for a dumpster ...
}

function drawCardboardBox(ctx: CanvasRenderingContext2D, s: number): void {
  // ... Canvas2D drawing code for a cardboard box ...
}

function drawBarrelFire(ctx: CanvasRenderingContext2D, s: number): void {
  // ... Canvas2D drawing code for a barrel with fire ...
}

export const THEME_FURNITURE: FurnitureType[] = [
  { tileIds: [17], draw: drawDumpster },      // replaces drawDeskLeft
  { tileIds: [18], draw: drawCardboardBox },   // replaces drawDeskRight
  { tileIds: [19], draw: drawBarrelFire },     // replaces drawOfficeChair
  // ...
];
```

The `furniture.ts` loader checks for `furniture-theme.ts` on the branch.
If found, it uses the theme's furniture types instead of the base set.

### 5.4 Tileset Generation

For tile-based assets (floors, walls, ground tiles), the pipeline
generates a new tileset PNG. The Wizard can either:
- Generate tiles procedurally (Canvas2D code)
- Generate tiles via AI image generation
- Use a combination (AI base texture + procedural overlays)

The tileset PNG is committed to `client/public/assets/tilesets/` on the
branch, and `world-theme.json` points to it.

---

## 6. World Selection Flow

### 6.1 Entry Point

From the HQ, the player accesses Worlds Mode through the **server racks**
(existing interactable in the office). Pressing E on the server racks
opens the Worlds Panel (already built in `hud.ts`).

### 6.2 Selection UI

The Worlds Panel shows:

```
┌─────────────────────────────────────────────┐
│  WORLDS                                      │
│                                              │
│  ┌─ HQ (Base World) ──────────────────────┐  │
│  │  The default office. You are here.     │  │
│  │  ● Active                              │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ Your Worlds ──────────────────────────┐  │
│  │                                        │  │
│  │  🌀 Erics Alley                        │  │
│  │     Gritty back alley world            │  │
│  │     ● Deployed at erics-alley.up.railway│  │
│  │     [Open Portal] [Redeploy] [Delete]  │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ Create New World ─────────────────────┐  │
│  │  World name: [________________]        │  │
│  │  Theme: [Custom ▼]                     │  │
│  │  [Generate World]                      │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ World Templates ──────────────────────┐  │
│  │  🏢 Office (default)                   │  │
│  │  🏚️ Erics Alley (gritty street)        │  │
│  │  🏰 Medieval Castle                    │  │
│  │  🚀 Space Station                      │  │
│  │  🌴 Tropical Island                    │  │
│  │  [More templates coming soon]          │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 6.3 World Creation Flow

```
Player clicks "Generate World"
    │
    ▼
Choose template (or "Custom" for blank slate)
    │
    ▼
Enter world name → becomes branch name (sanitized)
    │
    ▼
System:
    1. Forks the repo (if not already forked)
    2. Creates a new branch from main
    3. Generates world-theme.json from the template
    4. Generates/commits initial assets (tileset, furniture, etc.)
    5. Commits all files to the branch
    │
    ▼
System deploys branch to Railway
    │
    ▼
Portal opens → player enters the new world
```

### 6.4 Portal System

Already implemented. When a world is deployed, the player can "Open
Portal" which navigates to the Railway URL. The deployed instance
detects it's an alt world (via `world-theme.json` on the branch) and
loads the theme.

The HQ shows a "Return to HQ" banner when the player is in an alt world
(already implemented in `hud.ts:2049`).

---

## 7. Erics Alley — First Alt World

### 7.1 Concept

Erics Alley is a gritty urban world where the visual metaphor for AI
agent management is **street life** instead of **office work**.

| Base Game (Office) | Erics Alley (Street) |
|---|---|
| Office building | Back alley / street corner |
| Desks with monitors | Cardboard box "stations" with spray-painted walls |
| Office chairs | Crates and overturned buckets |
| Agents typing on computers | Agents smoking (work = deep thought) |
| Coffee machine / water cooler | Barrel fire / liquor bottle |
| Filing cabinets | Dumpsters |
| Sofa | Mattress on the ground |
| Plants | Weeds growing through cracks |
| Helicopter delivery | Van pulls up, agent gets out |
| Elevator | Manhole cover / fire escape |
| Server room + chimney | Fuse box + steam vent |
| CRT terminal (Nemesis) | Graffiti wall with glowing tags |
| Trophy case | Chain-link fence with trophies hung on it |
| Hall of Fame board | Brick wall with polaroids taped on |
| Red button | Fire alarm pull |
| Wardrobe | Shopping cart with clothes |
| Projector screen | Billboard with flickering ads |
| Phone booth | Phone booth (graffiti-covered) |
| Golf course / tennis court | Basketball court / dice game |
| Biome: meadow → infernal | Biome: alley → undercity → sewer → hellmouth |

### 7.2 Visual Metaphor Mapping

The core metaphor shift: **"working" = "smoking"**.

In the base game, when an agent is "working," they sit at a desk and
type on a computer. The monitor glows with their status color. This
represents the abstract concept of an AI processing a task.

In Erics Alley, when an agent is "working," they lean against a wall
and smoke. The smoke itself is tinted with their status color. This
represents the same abstract concept — the agent is deep in thought,
processing — through a different visual metaphor.

| Agent Status | Base Game Visual | Erics Alley Visual |
|---|---|---|
| idle | Standing near desk, shuffling | Leaning against wall, hands in pockets |
| thinking | Speech bubble, amber accent | Looks up, squints, amber smoke puff |
| working | Typing, monitor glows green | Smoking, green-tinted smoke rises |
| done | Confetti, blue accent | Nods slowly, blue smoke ring |
| error | Red accent, error bubble | Coughs, red smoke burst |
| waiting | Walks to colleague's desk | Walks to another corner, stands near them |
| done (break) | Walks to coffee machine/sofa | Walks to barrel fire / sits on crate |

### 7.3 World Theme Config for Erics Alley

```json
{
  "id": "erics-alley",
  "name": "Erics Alley",
  "description": "Gritty back alley world where agents smoke instead of type",
  "workMetaphor": "smoking",
  "arrivalMetaphor": "van_delivery",

  "office": {
    "tilemapPath": "client/public/assets/maps/erics-alley.json",
    "tilesetPath": "client/public/assets/tilesets/erics-alley.png",
    "floorTile": 0,
    "wallTile": 1,
    "doorTile": 6
  },

  "furniture": {
    "17": "drawCardboardStation",
    "18": "drawCardboardStationRight",
    "19": "drawCrate",
    "20": "drawDumpster",
    "21": "drawWeedPatch",
    "22": "drawAlleyWindow",
    "23": "drawBarrelFireTop",
    "24": "drawBarrelFireBottom",
    "25": "drawShoppingCart",
    "26": "drawAlleyCounter",
    "27": "drawPuddle",
    "28": "drawTrashCan",
    "29": "drawMattressLeft",
    "30": "drawMattressRight",
    "31": "drawDeadPlant",
    "32": "drawSprayPaintCans",
    "35": "drawFuseBox",
    "36": "drawFuseBoxScreen",
    "37": "drawSteamVent"
  },

  "worldgen": {
    "biomes": ["alley", "street", "abandoned", "undercity", "sewer", "hellmouth"],
    "baseGround": {
      "alley": 0,
      "street": 6,
      "abandoned": 6,
      "undercity": 7,
      "sewer": 7,
      "hellmouth": 7
    },
    "hostilityThresholds": [2, 4, 7, 11, 18]
  },

  "interactables": {
    "wizard": { "tileId": 99, "x": 15, "y": 10, "interactionType": "wizard" },
    "wardrobe": { "tileId": 100, "x": 21, "y": 18, "interactionType": "wardrobe" },
    "forge": { "tileId": 101, "x": 23, "y": 14, "interactionType": "forge" }
  },

  "agentWorkAnim": {
    "spritesheetPath": "client/public/assets/characters/smoke-anim.png",
    "frames": 8,
    "frameRate": 6
  },

  "statusColors": {
    "idle": 0x6a6a78,
    "thinking": 0xe8a838,
    "working": 0x4cb866,
    "done": 0x4a9cd8,
    "error": 0xe05858,
    "waiting": 0xb47ec4
  },

  "assets": {
    "tilesetPath": "client/public/assets/tilesets/erics-alley.png",
    "characterSpritesheetPath": "client/public/assets/characters/alley-chars.png",
    "furnitureSpritesheetPath": "client/public/assets/sprites/alley-furniture.png",
    "worldTileSpritesheetPath": "client/public/assets/tilesets/alley-world.png"
  }
}
```

### 7.4 Erics Alley Furniture Set

New procedural drawing functions needed:

| Tile ID | Name | Replaces | Description |
|---|---|---|---|
| 17 | Cardboard station (left) | Desk left | Cardboard box with spray-painted "monitor" on wall behind it |
| 18 | Cardboard station (right) | Desk right | Right half of cardboard station |
| 19 | Crate | Office chair | Wooden crate to sit on |
| 20 | Dumpster | Filing cabinet | Green rusted dumpster with lid open |
| 21 | Weed patch | Small plant | Weeds growing through cracked pavement |
| 22 | Alley window | Window | Barred window with broken glass |
| 23 | Barrel fire (top) | Coffee machine top | Burning barrel with flames and embers |
| 24 | Barrel fire (bottom) | Coffee machine bottom | Base of barrel, ash and coals |
| 25 | Shopping cart | Water cooler | Tipped shopping cart with random stuff |
| 26 | Alley counter | Kitchen counter | makeshift table from plywood and cinder blocks |
| 27 | Puddle | Kitchen sink | Oily puddle reflecting light |
| 28 | Trash can | Microwave | Dented metal trash can with lid |
| 29 | Mattress (left) | Sofa left | Stained mattress on the ground |
| 30 | Mattress (right) | Sofa right | Right half of mattress |
| 31 | Dead plant | Large plant | Dead plant in cracked pot |
| 32 | Spray paint cans | Toaster | Cans of spray paint scattered on ground |
| 35 | Fuse box | Server rack | Wall-mounted fuse box with switches and LEDs |
| 36 | Fuse box screen | Server screen | Small cracked LCD showing power grid |
| 37 | Steam vent | Chimney | Manhole cover with steam rising |

### 7.5 Erics Alley Biomes

| Biome | Ground Tile | Obstacles | Hostile Tiles | Mood |
|---|---|---|---|---|
| alley | Cracked pavement | Dumpsters, crates, trash bags | None | Safe, familiar |
| street | Asphalt | Parked cars, fire hydrants, lampposts | Puddles (slow) | Urban, slightly edgy |
| abandoned | Rubble | Collapsed walls, debris, broken furniture | Rats, broken glass | Derelict, dangerous |
| undercity | Concrete | Pipes, support pillars, cables | Steam vents (damage) | Oppressive, industrial |
| sewer | Dark stone | Pipes, grates, flowing water | Sewage (poison) | Claustrophobic, hostile |
| hellmouth | Scorched earth | Bones, lava rocks, demonic structures | Lava, fire | Final tier, lethal |

### 7.6 Erics Alley Arrival Metaphor

Instead of helicopter delivery:

1. A **beat-up van** pulls up at the alley entrance (replaces helicopter)
2. Agent gets out of the back of the van
3. Walks to a **manhole cover** (replaces elevator)
4. Manhole cover slides open, agent descends
5. Agent emerges in the alley from a ground-level entrance

### 7.7 Erics Alley Wizard

The Wizard in Erics Alley is a **street artist / graffiti wizard** — a
character in a paint-splattered hoodie who carries a spray can like a
wand. When you talk to them, they can "tag" the world with changes.

The Wizard stands near the barrel fire in the center of the alley.

---

## 8. Architecture: How Worlds Load

### 8.1 Branch Detection

When the game boots, it needs to know which world it's running in. The
detection mechanism:

1. **Environment variable** — `WORLD_THEME_PATH` set by Railway deploy
   to point to the theme config on the branch
2. **File check** — Check for `world-theme.json` in the asset path at
   boot. If found, load the theme.
3. **URL parameter** — `?world=erics-alley` in the URL tells the client
   to load a specific theme

The simplest approach: the Railway deployment includes the theme files
on the branch (they're committed by the Wizard). The boot sequence
checks for `world-theme.json` and loads it if present.

### 8.2 Theme-Aware Boot

```typescript
// boot.ts — modified create() sequence
async create(): Promise<void> {
  // Check for world theme
  const themeResponse = await fetch('/assets/world-theme.json');
  if (themeResponse.ok) {
    const theme: WorldTheme = await themeResponse.json();
    this.registry.set('worldTheme', theme);

    // Load theme-specific assets
    await this.loadThemeAssets(theme);

    // Use theme tileset instead of base tileset
    this.load.tilemapTiledJSON('office', theme.office.tilemapPath);
    this.load.image('officeTiles', theme.office.tilesetPath);
  } else {
    // No theme — load base game assets (existing behavior)
    this.loadBaseAssets();
  }

  // Continue with existing boot sequence...
}
```

### 8.3 Theme-Aware Scene

`scene.ts` checks the registry for a world theme at key points:

```typescript
// In create():
const theme = this.registry.get('worldTheme');
if (theme) {
  // Use theme interactables instead of hardcoded ones
  this.setupThemeInteractables(theme.interactables);
  // Use theme furniture
  this.loadThemeFurniture(theme);
} else {
  // Base game interactables (existing behavior)
  this.drawRedButton();
  this.drawWardrobe();
  this.drawNemesisTerminal();
  // ...
}

// In updateLighting():
const theme = this.registry.get('worldTheme');
const statusColors = theme?.statusColors ?? STATUS_COLORS;
// Use statusColors for monitor glow, name tags, etc.
```

### 8.4 Theme-Aware Worldgen

`worldgen.ts` checks the theme for biome/tile overrides:

```typescript
export function generateChunk(worldSeed: number, cx: number, cy: number, theme?: WorldTheme): Chunk {
  const biomes = theme?.worldgen.biomes ?? ["meadow", "forest", "ruins", "wasteland", "void", "infernal"];
  const thresholds = theme?.worldgen.hostilityThresholds ?? [2, 4, 7, 11, 18];

  // ... rest of generation uses theme biome/tile mappings
}
```

---

## 9. Server Architecture

### 9.1 New Module: `server/wizard.ts`

Handles Wizard NPC conversations and world editing:

```typescript
class WizardEngine {
  private provider: LLMProvider;
  private githubToken: string;
  private branchName: string;
  private repoOwner: string;
  private repoName: string;

  /** Process a player's request to modify the world. */
  async processRequest(message: string, context: WizardContext): Promise<WizardResponse> {
    // 1. Build prompt with current world state + file structure
    // 2. Call LLM with GitHub file editing tools
    // 3. LLM generates file changes and commits them
    // 4. Return summary of changes + redeploy recommendation
  }

  /** Generate a new world from a template. */
  async generateWorld(template: string, worldName: string): Promise<WorldGenResult> {
    // 1. Fork repo + create branch (existing github.ts)
    // 2. Generate world-theme.json from template
    // 3. Generate initial assets (procedural or AI)
    // 4. Commit all files to the branch
    // 5. Deploy to Railway (existing railway-mcp.ts)
    // 6. Return deployment info
  }
}
```

### 9.2 New Messages

```typescript
// Client → Server
| { type: "wizard_chat"; message: string }
| { type: "generate_world"; template: string; worldName: string }

// Server → Client
| { type: "wizard_response"; text: string; changes: string[]; redeployRecommended: boolean }
| { type: "world_generating"; worldName: string; stage: string }
| { type: "world_generated"; deployment: WorldDeployment; theme: WorldTheme }
| { type: "world_gen_error"; error: string }
```

### 9.3 World Templates

Templates are predefined starting points for world generation:

```typescript
interface WorldTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;                    // emoji or icon key
  themeConfig: Partial<WorldTheme>; // pre-filled defaults
  furnitureSet: string[];          // furniture function names to generate
  biomeSet: string[];              // biome names
  arrivalMetaphor: string;         // "van_delivery", "portal_open", etc.
  workAnimation: string;           // "smoking", "typing", "alchemy", etc.
}
```

Built-in templates:
- **Office** (default) — the base game, no changes needed
- **Erics Alley** — gritty street, smoking metaphor
- **Medieval Castle** — fantasy, alchemy metaphor
- **Space Station** — sci-fi, robotics metaphor
- **Tropical Island** — beach, fishing metaphor
- **Custom** — blank slate, Wizard builds from scratch

---

## 10. Implementation Plan

### Phase 1 — Theme System Foundation (Weeks 1-2)

1. **`WorldTheme` interface** in `shared/types.ts`
2. **`world-theme.json` loading** in `boot.ts` — check for theme file,
   load theme assets if present
3. **Theme-aware furniture loading** in `furniture.ts` — check for
   `furniture-theme.ts`, use theme furniture if present
4. **Theme-aware worldgen** in `worldgen.ts` — accept optional theme
   parameter, override biomes/tiles
5. **Theme-aware scene** in `scene.ts` — check registry for theme,
   use theme interactables/positions
6. **Theme-aware status colors** in `agent.ts` — use theme colors if
   present, fall back to `STATUS_COLORS`

**Deliverable:** A world-theme.json file can be placed in the assets
directory and the game loads with the themed furniture, tiles, biomes,
and colors.

### Phase 2 — Erics Alley Assets (Weeks 2-3)

7. **Erics Alley tileset** — generate 32 alley-themed tiles (cracked
   pavement, brick walls, asphalt, etc.)
8. **Erics Alley furniture** — write 19 new Canvas2D drawing functions
   (dumpster, crate, barrel fire, mattress, etc.)
9. **Erics Alley office map** — create Tiled map JSON with alley layout
10. **Erics Alley world tiles** — generate world tile textures for 6
    biomes (alley, street, abandoned, undercity, sewer, hellmouth)
11. **Smoking animation spritesheet** — 8-frame work animation of agent
    smoking (replaces typing animation)
12. **Van delivery cinematic** — replace helicopter with van arrival
13. **Erics Alley world-theme.json** — complete theme config

**Deliverable:** Erics Alley is playable as a themed world. Fork the
repo, commit the theme, deploy, and play.

### Phase 3 — Wizard NPC (Weeks 3-4)

14. **`WizardEngine` class** in `server/wizard.ts` — LLM-powered world
    editor with GitHub file tools
15. **Wizard NPC sprite** — procedural drawing function for the wizard
    character (theme-aware)
16. **Wizard chat UI** — conversation panel (similar to agent chat)
17. **Wizard system prompt** — specialized prompt for world editing
18. **Wizard tools** — `github_read_file`, `github_write_file`,
    `github_create_file`, `generate_asset`
19. **Auto-redeploy** — after Wizard commits changes, trigger Railway
    redeploy automatically
20. **Wizard responses** — show what changed, with diff summary

**Deliverable:** Talk to the Wizard in an alt world, ask for changes,
Wizard commits them to the branch, world redeploys.

### Phase 4 — World Generation Pipeline (Weeks 4-5)

21. **World templates** — predefined theme configs for each template
22. **`generate_world` endpoint** — fork + branch + commit theme +
    deploy in one flow
23. **World selection UI** — template picker in the Worlds Panel
24. **Asset generation tool** — AI image generation for new textures,
    committed to branch
25. **Procedural furniture code generation** — Wizard generates
    TypeScript drawing functions for new furniture
26. **Theme validation** — validate world-theme.json schema before
    commit

**Deliverable:** Click "Generate World" → choose template → world is
created, deployed, and portal opens.

### Phase 5 — Polish (Weeks 5-6)

27. **Theme-aware audio** — different ambient sounds per world theme
28. **Theme-aware particles** — smoke particles for Erics Alley instead
    of standard effects
29. **Theme-aware emotes** — different emote icons per theme
30. **World gallery** — browse community-created worlds
31. **World sharing** — share world URLs with other players
32. **Wizard memory** — Wizard remembers past changes and can undo them
33. **Multi-world portals** — portals between alt worlds (not just HQ)

---

## 11. What Already Exists (Reuse Map)

| Component | Location | Reuse for Worlds Mode |
|---|---|---|
| GitHub API client | `server/github.ts` | Wizard file operations, world creation |
| Railway deploy | `server/providers/railway-mcp.ts` | Deploy world branches |
| Worlds Panel UI | `client/src/ui/hud.ts:3639` | World selection, creation, portal opening |
| Portal navigation | `client/src/ui/hud.ts:4102` | Enter alt worlds |
| Return to HQ | `client/src/ui/hud.ts:2049` | Exit alt worlds |
| Current world tracking | `client/src/store.ts:83` | Know which world you're in |
| Code editor | `client/src/ui/hud.ts` | Wizard can use same GitHub file API |
| Procedural furniture | `client/src/game/furniture.ts` | Pattern for theme furniture |
| AI tile textures | `client/src/game/ai-tiles.ts` | Pattern for theme textures |
| Worldgen | `client/src/game/worldgen.ts` | Theme overrides for biomes/tiles |
| Asset generation | `scripts/generate-assets.ts` | Pattern for alt world assets |
| LLM provider system | `server/providers/` | Wizard LLM calls |
| Agent chat UI | `client/src/ui/hud.ts` | Wizard chat panel pattern |
| AgentNPC | `client/src/game/agent.ts` | Wizard NPC extends this pattern |
| Status colors | `client/src/game/agent.ts:14` | Theme override target |
| Emote system | `client/src/game/agent.ts:331` | Theme override target |
| Helicopter delivery | `client/src/game/scene.ts:4706` | Pattern for van delivery |
| Chunk caching | `client/src/game/chunk-cache.ts` | Theme-aware chunk caching |
| WorldState | `shared/types.ts:338` | Theme seed in world state |
| WS message system | `shared/types.ts` | New wizard/world messages |

---

## 12. Key Design Decisions

### 12.1 Why GitHub Branches?

Each world is a branch because:
- **Isolation** — changes to one world don't affect others or the base
  game
- **Version control** — every Wizard change is a commit with history
- **Collaboration** — multiple players can work on a world via PRs
- **Rollback** — revert a bad Wizard change with `git revert`
- **Deployment** — Railway deploys from branches, already integrated

### 12.2 Why Not Just Runtime Theme Switching?

Runtime theme switching (load a JSON, swap textures) would be simpler
but:
- No persistence — changes are lost on refresh
- No history — can't undo or see what changed
- No collaboration — can't share worlds with others
- No deployment — can't give each world its own URL

The branch approach gives every world its own URL, its own history, and
the ability to share and collaborate.

### 12.3 Why the Wizard Instead of a UI Editor?

A UI editor (drag-and-drop furniture, tile painter) would be more
precise but:
- **Much more engineering** — full editor UI, collision detection,
  validation
- **Less creative** — players are limited to predefined options
- **Less fun** — talking to a wizard who reshapes the world is more
  engaging than clicking buttons

The Wizard approach leverages the existing LLM infrastructure and lets
players make any change they can describe in natural language. The
Wizard generates code, assets, and config — things a UI editor can't
do.

### 12.4 Why Per-World Deployment Instead of One Server?

Each world runs as its own Railway service because:
- **Isolation** — a broken world doesn't take down the HQ
- **Independent scaling** — popular worlds get more resources
- **Custom URLs** — each world has its own shareable link
- **Theme loading** — the theme files are on the branch, so the
  deployment naturally has the right assets

The downside is cost (each Railway service costs money), but this can
be mitigated with:
- Sleep mode for inactive worlds
- Shared infrastructure for low-traffic worlds
- Premium tier for world hosting

---

## 13. Resolved Decisions

1. **World persistence** — Per-world. Each world (room) has its own
   agent state, tasks, and feed. Agents could theoretically travel
   between rooms, but it's unclear what that accomplishes — not a
   priority. All rooms are independent.

2. **Wizard safety** — Railway has built-in rollback if the deployment
   fails. If the Wizard commits broken code, Railway's deploy fails and
   the previous working version stays live. No custom sandboxing needed
   for MVP.

3. **Asset generation cost** — Paying customers only. We cover the
   fal.ai credits. Budget asset generation alongside inference credits
   in the subscription cost. Subscribers get 1 custom world per month
   (asset generation + inference included).

4. **World limits** — Each player gets **one custom world** for now.
   No tiers, no multiple worlds. Keep it simple.

5. **Cross-world agents** — Each world has its own agent roster. No
   agent can exist in two worlds at once. Agent IDs are managed in one
   place (central state) to prevent duplicates. Players can have
   separate MCP-based agents (e.g., Slack agents) that exist outside
   the world system, but in-world agents are scoped to their world.

6. **World publishing** — Worlds are **auto-published and forkable**.
   When a player creates a world, it's live on Railway with a public
   URL. Other players can fork the branch and remix it. No separate
   publish step — deployment is publishing.

---

## 14. Faction Conflict System

The outside world isn't just monsters in biomes — it has **living
conflict**. Two factions are at war, and the player navigates through
an active warzone to explore. This makes the outside world feel alive
in a way that random monster spawns don't.

### 14.1 Concept

Each world has its own conflict that reflects its theme:

| World | Conflict | Factions |
|---|---|---|
| Erics Alley | Gang turf war | Rival crews fighting over blocks |
| Hawaii | Island chiefdom war | Rival tribes battling for territory |
| Old South | Civil War | Union vs. Confederacy |

The player's home base (office/alley/pavilion/plantation) exists in
spite of the war outside. That tension makes both sides more
interesting — your peaceful HQ is an island in a warzone.

### 14.2 How It Works Mechanically

- Two faction NPCs spawn in the outside world and fight each other in
  certain biome zones
- Their battles create **dynamic danger zones** — you don't have to
  fight them, but you can't walk through a crossfire unscathed
- Faction control shifts as you explore deeper — the safe zone
  shrinks, the war intensifies
- Boss-tier creatures are **war bosses** — a gang warlord, a spectral
  general, a chiefdom champion
- The player can:
  - **Avoid** the fighting and sneak through
  - **Pick a side** and help them (affects which areas are safe)
  - **Loot** the aftermath of battles
  - **Get caught** in crossfire (environmental hazard, like lava but
    mobile)

### 14.3 Implementation

The faction system is a new layer in `worldgen.ts` / `world.ts` that
spawns opposing NPCs in conflict zones. It does not replace the
existing creature system — creatures and factions coexist. Factions
are themed per-world via the `WorldTheme.conflict` config:

```typescript
interface ThemeConflict {
  factionA: { name: string; color: number; spriteKey: string };
  factionB: { name: string; color: number; spriteKey: string };
  zones: Record<string, "skirmish" | "battle" | "occupied_a" | "occupied_b">;
}
```

This is a **Phase 2 addition** — not required for the first playable
version of any world. The world is fully functional without it; the
conflict layer adds depth and environmental storytelling on top.

---

## 15. Hawaii — Tropical Fire-Spinning World

### 15.1 Concept

An open-air beach pavilion on a tropical island where the visual
metaphor for AI agent management is **fire spinning** (poi / fire knife
dancing) instead of office work. The outside world is tropical island
exploration with rival chiefdoms at war.

| Base Game (Office) | Hawaii (Beach) |
|---|---|
| Office building | Open-air tiki pavilion / beach hut |
| Desks with monitors | Tiki torch stations / surfboard workbenches |
| Agents typing on computers | Agents fire spinning (poi / fire knife) |
| Monitor glow = status color | Fire color = status color |
| Office chairs | Log stools / coconuts |
| Filing cabinet | Treasure chest |
| Coffee machine | Coconut drink station / tiki bar |
| Water cooler | Rain catchment |
| Kitchen counter | Prep table / imu (underground oven) |
| Microwave | Lava rock grill |
| Sofa | Hammock |
| Window | Open ocean view (no glass) |
| Small plant | Hibiscus / plumeria |
| Large plant | Palm tree |
| Server rack | Tiki totem |
| Server screen | Tiki totem eyes (glow color = status) |
| Chimney | Volcano vent |
| Golf course | Beach volleyball court |
| Tennis court | Horseshoe pit (island version) |
| Helicopter delivery | Outrigger canoe paddles in |
| Biome: meadow→infernal | Beach → jungle → volcanic ridge → lava tubes → underwater cave → volcano summit |

### 15.2 Why Fire Spinning Works

The fire itself IS the status indicator. No need for a separate monitor
glow system — the agent's fire poi color IS the status color. Green
flames = working, amber = thinking, red sputtering = error, blue =
done. It's more elegant than the office monitor system because the
status and the work animation are the same visual element.

### 15.3 Agent Status Visuals

| Agent Status | Base Game Visual | Hawaii Visual |
|---|---|---|
| idle | Standing near desk, shuffling | Standing near torch, poi hanging |
| thinking | Speech bubble, amber accent | Looks up, poi slows, amber flames |
| working | Typing, green monitor glow | Fire spinning, green flames |
| done | Walks to coffee machine | Walks to tiki bar / hammock |
| error | Red monitor, sparks | Coughing smoke, red sputtering flames |
| waiting | Walks to colleague's desk | Walks to another torch station |

### 15.4 World Theme Config

```json
{
  "id": "hawaii",
  "name": "Hawaii",
  "description": "Tropical beach world where agents fire-spin instead of type",
  "workMetaphor": "fire_spinning",
  "arrivalMetaphor": "outrigger_delivery",
  "office": {
    "tilemapPath": "client/public/assets/maps/hawaii.json",
    "tilesetPath": "client/public/assets/tilesets/hawaii.png",
    "floorTile": 0,
    "wallTile": 1,
    "doorTile": 6
  },
  "furniture": {
    "17": "drawTorchStationLeft",
    "18": "drawTorchStationRight",
    "19": "drawLogStool",
    "20": "drawTreasureChest",
    "21": "drawHibiscus",
    "22": "drawOceanView",
    "23": "drawTikiBarTop",
    "24": "drawTikiBarBottom",
    "25": "drawRainCatchment",
    "26": "drawPrepTable",
    "27": "drawLavaRockGrill",
    "28": "drawHammockLeft",
    "29": "drawHammockRight",
    "30": "drawPalmTree",
    "31": "drawPlumeria",
    "32": "drawCoconutGrill",
    "35": "drawTikiTotem",
    "36": "drawTikiTotemEyes",
    "37": "drawVolcanoVent"
  },
  "worldgen": {
    "biomes": ["beach", "jungle", "volcanic_ridge", "lava_tubes", "underwater_cave", "volcano_summit"],
    "baseGround": {
      "beach": 0,
      "jungle": 6,
      "volcanic_ridge": 7,
      "lava_tubes": 8,
      "underwater_cave": 9,
      "volcano_summit": 10
    },
    "obstacles": {
      "beach": [2, 3, 4],
      "jungle": [2, 24, 39],
      "volcanic_ridge": [3, 37],
      "lava_tubes": [3, 9],
      "underwater_cave": [3, 21],
      "volcano_summit": [9, 11]
    },
    "hostileTiles": {
      "lava_tubes": [9],
      "volcano_summit": [9, 11]
    },
    "hostilityThresholds": [2, 4, 7, 11, 18]
  },
  "statusColors": {
    "idle": 7143424,
    "thinking": 13834552,
    "working": 5019238,
    "done": 4882074,
    "error": 15138488,
    "waiting": 12240244
  },
  "dialect": {
    "systemPromptSuffix": "Speak in Hawaiian Pidgin English. Use words like 'brah', 'da kine', 'pau', 'mahalo'. Keep it warm and friendly.",
    "chatStyle": "hawaiian_pidgin",
    "emotes": ["shaka", "mahalo", "chee_hoo"]
  },
  "assets": {
    "tilesetPath": "client/public/assets/tilesets/hawaii.png",
    "characterSpritesheetPath": "client/public/assets/characters/hawaii-chars.png",
    "furnitureSpritesheetPath": "client/public/assets/sprites/hawaii-furniture.png",
    "worldTileSpritesheetPath": "client/public/assets/tilesets/hawaii-world.png",
    "assetTier": "procedural"
  },
  "conflict": {
    "factionA": { "name": "Shark Tribe", "color": 43690, "spriteKey": "faction-shark" },
    "factionB": { "name": "Turtle Tribe", "color": 26624, "spriteKey": "faction-turtle" }
  }
}
```

### 15.5 Hawaii Biomes

| Biome | Ground Tile | Obstacles | Hostile Tiles | Mood |
|---|---|---|---|---|
| Beach | White sand | Palm trees, driftwood, shells | None | Safe, paradise |
| Jungle | Dense foliage | Vines, banyan roots, bamboo | Mosquitoes (slow) | Lush, adventurous |
| Volcanic ridge | Black rock | Jagged lava rock, steam vents | Steam (damage) | Harsh, otherworldly |
| Lava tubes | Dark stone | Stalactites, lava pools | Lava (damage) | Claustrophobic, hot |
| Underwater cave | Wet stone | Coral, sea anemones | Undertow (drag) | Surreal, disorienting |
| Volcano summit | Magma | Lava rivers, fire geysers | Lava, fire | Final tier, lethal |

### 15.6 Hawaii Outside World Creatures

- **Low tier:** crabs, jellyfish, sea urchins, geckos
- **Mid tier:** sharks, moray eels, wild boars, giant centipedes
- **High tier:** mo'o (Hawaiian dragon lizard), volcano spirit, Pele's
  fire guardian
- **Boss tier:** Pele (volcano goddess avatar), Mo'o-nui (great dragon
  lizard)
- **Legendary:** Kā-moho-aliʻi (shark god — appears as final boss at
  volcano summit)

### 15.7 Hawaii Arrival Metaphor

Instead of helicopter delivery:

1. An **outrigger canoe** paddles in from the ocean (replaces helicopter)
2. Agent steps off onto the beach
3. Walks to a **tiki torch** marking their station (replaces elevator)
4. Agent lights the torch and takes their position

### 15.8 Hawaii Wizard NPC

A **kahuna** (Hawaiian priest/sage) — stands near the volcano vent in
the center of the pavilion. Carries a bone fishing hook like a wand.
When you talk to them, they can reshape the island with volcanic power.

---

## 16. Old South — Battle of New Orleans World

### 16.1 Concept

An idealized antebellum Southern plantation themed around the **Battle
of New Orleans** (War of 1812). The visual metaphor for AI agent
management is **harvesting** — agents tend crops and work the land.
The outside world is the Battle of New Orleans — American and British
forces clashing across the map, with riverboat gamblers, wild west
outlaws, and Mississippi culture woven in. The plantation is your
peaceful home base; the battle is the danger outside.

The Battle of New Orleans theme brings together multiple facets of
Southern Americana:
- **Plantation mansion** — the home base (idealized, not ashamed of
  Southern heritage)
- **Battle of New Orleans** — the outside conflict (Jackson's forces
  vs. the British redcoats)
- **Mississippi riverboat** — card dealing, steamboat culture
- **Wild West** — outlaws and frontier justice as secondary creatures
  in the outside world

| Base Game (Office) | Old South (Plantation) |
|---|---|
| Office building | Antebellum mansion — white columns, wraparound porch, magnolias |
| Desks with monitors | Field plots / garden stations with crop rows |
| Agents typing on computers | Agents harvesting — bending, picking crops |
| Monitor glow = status color | Crop particles = status color |
| Office chairs | Wooden stools / overturned buckets |
| Filing cabinet | Wooden storage chest |
| Coffee machine | Sweet tea pitcher / well pump |
| Water cooler | Rain barrel |
| Kitchen counter | Smokehouse / curing shed |
| Microwave | Cast iron stove |
| Sofa | Porch swing |
| Window | Tall windows with wooden shutters |
| Small plant | Cotton sprig / magnolia cutting |
| Large plant | Live oak with Spanish moss |
| Server rack | Smokehouse |
| Server screen | Smokehouse vents (smoke color = status) |
| Chimney | Brick chimney |
| Golf course | Croquet lawn |
| Tennis court | Horseshoe pit |
| Helicopter delivery | Horse-drawn carriage rolls up the drive |
| Biome: meadow→infernal | Garden → cotton field → pine forest → bayou → battlefield → infernal |
| Conflict | Battle of New Orleans — American vs. British redcoats |

### 16.2 Work Metaphor: "harvesting"

Agent bends over crop rows, picking. Status-colored particles rise from
the crops — green cotton bolls when working, amber leaves when
thinking, red when error (blight), blue when done (harvested). Same
mechanical role as the monitor glow — just agricultural instead of
digital.

### 16.3 Agent Status Visuals

| Agent Status | Base Game Visual | Old South Visual |
|---|---|---|
| idle | Standing near desk, shuffling | Standing near field row, wiping brow |
| thinking | Speech bubble, amber accent | Pauses, looks at sky, amber leaves drift |
| working | Typing, green monitor glow | Harvesting, green cotton particles rise |
| done | Walks to coffee machine | Walks to sweet tea pitcher / porch swing |
| error | Red monitor, sparks | Crop blight, red withering particles |
| waiting | Walks to colleague's desk | Walks to another field row |

### 16.4 World Theme Config

```json
{
  "id": "old-south",
  "name": "Old South",
  "description": "Antebellum plantation world where agents harvest instead of type",
  "workMetaphor": "harvesting",
  "arrivalMetaphor": "carriage_delivery",
  "office": {
    "tilemapPath": "client/public/assets/maps/old-south.json",
    "tilesetPath": "client/public/assets/tilesets/old-south.png",
    "floorTile": 0,
    "wallTile": 1,
    "doorTile": 6
  },
  "furniture": {
    "17": "drawFieldPlotLeft",
    "18": "drawFieldPlotRight",
    "19": "drawWoodenStool",
    "20": "drawStorageChest",
    "21": "drawCottonSprig",
    "22": "drawShutterWindow",
    "23": "drawSweetTeaPitcher",
    "24": "drawWellPump",
    "25": "drawRainBarrel",
    "26": "drawSmokehouse",
    "27": "drawCastIronStove",
    "28": "drawPorchSwingLeft",
    "29": "drawPorchSwingRight",
    "30": "drawLiveOak",
    "31": "drawMagnoliaTree",
    "32": "drawHorseshoePit",
    "35": "drawSmokehouseVent",
    "36": "drawSmokehouseScreen",
    "37": "drawBrickChimney"
  },
  "worldgen": {
    "biomes": ["garden", "cotton_field", "pine_forest", "bayou", "battlefield", "infernal"],
    "baseGround": {
      "garden": 0,
      "cotton_field": 6,
      "pine_forest": 7,
      "bayou": 21,
      "battlefield": 12,
      "infernal": 9
    },
    "obstacles": {
      "garden": [2, 4, 28],
      "cotton_field": [2, 3, 22],
      "pine_forest": [2, 24, 37],
      "bayou": [3, 21, 20],
      "battlefield": [3, 12, 13],
      "infernal": [9, 11, 13]
    },
    "hostileTiles": {
      "bayou": [21],
      "battlefield": [5],
      "infernal": [9, 11]
    },
    "hostilityThresholds": [2, 4, 7, 11, 18]
  },
  "statusColors": {
    "idle": 8026762,
    "thinking": 13935160,
    "working": 5925450,
    "done": 4882074,
    "error": 12071928,
    "waiting": 10118644
  },
  "dialect": {
    "systemPromptSuffix": "Speak with a refined Southern drawl appropriate to the early 1800s Louisiana territory. Use period language like 'I do declare', 'reckon', 'yonder'. Be courtly and genteel but capable.",
    "chatStyle": "southern_1812",
    "emotes": ["declare", "reckon", "yonder"]
  },
  "assets": {
    "tilesetPath": "client/public/assets/tilesets/old-south.png",
    "characterSpritesheetPath": "client/public/assets/characters/old-south-chars.png",
    "furnitureSpritesheetPath": "client/public/assets/sprites/old-south-furniture.png",
    "worldTileSpritesheetPath": "client/public/assets/tilesets/old-south-world.png",
    "assetTier": "procedural"
  },
  "conflict": {
    "factionA": { "name": "Union", "color": 30840, "spriteKey": "faction-union" },
    "factionB": { "name": "Confederacy", "color": 9211020, "spriteKey": "faction-confederate" }
  }
}
```

### 16.5 Old South Biomes

| Biome | Ground Tile | Obstacles | Hostile Tiles | Mood |
|---|---|---|---|---|
| Garden | Manicured grass | Fountains, hedges, benches | None | Safe, civilized |
| Cotton field | Tilled soil | Cotton rows, scarecrows | Crows (mild) | Familiar, working |
| Pine forest | Pine needles | Fallen logs, pine trees | Wild boars | Dark, frontier |
| Bayou | Murky water | Cypress knees, Spanish moss | Gators, water moccasins | Oppressive, dangerous |
| Battlefield | Scorched earth | Trenches, cannon, broken fences | Spectral soldiers | Haunted, war-torn |
| Infernal | Brimstone | Bones, fire, ruined mansion | Lava, demons | Final tier, lethal |

### 16.6 Old South Outside World Creatures

Southern folklore and wildlife, escalating to supernatural:

- **Low tier:** raccoons, possums, crows, rabbits
- **Mid tier:** wild boars, rattlesnakes, alligators, black panthers
- **High tier:** Wampus Cat, Rougarou (Cajun werewolf), Mothman
- **Boss tier:** Spectral Civil War general (ghost), Infernal Plantation
  Owner (corrupted spirit)
- **Legendary:** The Gray Man (South Carolina legend — warns of storms,
  but in the Labyrinth he's a harbinger of the infernal)

### 16.7 Old South Arrival Metaphor

Instead of helicopter delivery:

1. A **horse-drawn carriage** trots up the oak-lined drive (replaces
   helicopter)
2. Agent steps out at the mansion gate
3. Walks through the front gate to their field station (replaces
   elevator)
4. Agent takes their position at the crop rows

### 16.8 Old South Wizard NPC

A **traveling peddler / snake oil salesman** — rides in on a wagon,
sells "miracle tonics" that modify the world. Stands near the carriage
turnaround at the end of the drive. Period-appropriate version of the
graffiti wizard — carries a satchel of curios instead of a spray can.

### 16.9 The War Outside

The Civil War is the living conflict in the outside world. Union and
Confederate patrols spawn in the mid-to-deep biomes and fight each
other. Key design points:

- **Garden and cotton field** — safe zones, no war activity. This is
  your home.
- **Pine forest** — scouting parties, occasional skirmishes. You hear
  distant musket fire.
- **Bayou** — no military presence, but the swamp itself is hostile.
  Deserters and bandits hide here.
- **Battlefield** — active war zone. Trenches, cannon fire, spectral
  soldiers from past battles. Crossfire is a real hazard.
- **Infernal** — the war has opened a hellmouth. Both sides are
  corrupted into demons. The final tier.

The contrast is the point — your peaceful plantation exists in spite of
the war outside. That tension makes both sides more interesting.

---

## 17. World Comparison Summary

| | Erics Alley | Hawaii | Old South |
|---|---|---|---|
| **Home base** | Back alley | Beach pavilion | Antebellum plantation |
| **Work metaphor** | Smoking | Fire spinning | Harvesting |
| **Status indicator** | Smoke color | Flame color | Crop particles |
| **Arrival** | Van delivery | Outrigger canoe | Horse-drawn carriage |
| **Wizard** | Graffiti artist | Kahuna (priest) | Snake oil peddler |
| **Biomes** | alley→street→abandoned→undercity→sewer→hellmouth | beach→jungle→volcanic ridge→lava tubes→underwater cave→volcano summit | garden→cotton field→pine forest→bayou→battlefield→infernal |
| **Outside conflict** | Gang turf war | Island chiefdom war | Battle of New Orleans |
| **Legendary boss** | (TBD — urban legend) | Kā-moho-aliʻi (shark god) | The Gray Man |
| **Asset tier** | Procedural (upgradeable) | Procedural (upgradeable) | Procedural (upgradeable) |

All three worlds use the same `WorldTheme` system — different furniture
draw functions, theme configs, tilesets, and work/arrival animations.
The architecture does not change between worlds. The faction conflict
system (§14) is a shared layer that adds living conflict to the outside
world of each theme.

---

## 18. World Accents

Each world's agents speak with a distinct accent that flavors their
chat messages, status updates, and NPC dialogue. Accents are applied
as a system prompt modifier — the agent's underlying LLM is instructed
to write in the accent, so it affects word choice, slang, and phrasing
without changing the actual capabilities.

| World | Accent | Example phrasing |
|---|---|---|
| HQ (default) | Neutral / standard | "Task completed successfully." |
| Erics Alley | Street / urban slang | "Yo, that's done. Handled it, boss." |
| Hawaii | Pidgin / Hawaiian Creole | "Ho brah, all pau. We good." |
| Old South | Southern drawl / 1812-era | "Well I do declare, that task is done right proper." |

### 18.1 Implementation

The accent is defined in `world-theme.json` as a `dialect` field on the
`WorldTheme` interface:

```json
{
  "dialect": {
    "systemPromptSuffix": "Speak with a Southern drawl appropriate to the
      early 1800s Louisiana territory. Use period-appropriate language
      but remain clear and professional.",
    "chatStyle": "southern_1812",
    "emotes": ["yall", "reckon", "declare"]
  }
}
```

The `systemPromptSuffix` is appended to each agent's system prompt when
they are hired in that world. This is the simplest approach — no
post-processing or translation layer needed. The LLM naturally adopts
the accent in all its outputs.

### 18.2 Accent Definitions

**Erics Alley — Street/Urban:**
- Suffix: "Speak casually with urban street slang. Be direct, a little
  rough around the edges, but still competent and professional."
- Emotes: smoke, shrug, cough

**Hawaii — Pidgin/Hawaiian Creole:**
- Suffix: "Speak in Hawaiian Pidgin English. Use words like 'brah',
  'da kine', 'pau', 'mahalo'. Keep it warm and friendly."
- Emotes: shaka, mahalo, chee hoo

**Old South — Southern Drawl / 1812-era:**
- Suffix: "Speak with a refined Southern drawl appropriate to the early
  1800s Louisiana territory. Use period language like 'I do declare',
  'reckon', 'yonder'. Be courtly and genteel but capable."
- Emotes: declare, reckon, yonder

### 18.3 Type Definition

Add to `WorldTheme` interface in `shared/types.ts`:

```typescript
export interface ThemeDialect {
  systemPromptSuffix: string;
  chatStyle: string;
  emotes?: string[];
}
```

Add `dialect?: ThemeDialect` to `WorldTheme`.

### 18.4 Wiring

When `manager.ts` constructs the agent's system prompt, it checks for
`worldTheme.dialect.systemPromptSuffix` and appends it. This happens
at hire time and on world theme change. No client-side changes needed
— the accent flows naturally through the existing chat and status
message pipeline.
