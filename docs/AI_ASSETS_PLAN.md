# AI Assets + Normal Maps — Premium 2.5D Visual Upgrade

Replace procedural Canvas2D textures with AI-generated photorealistic assets
and upgrade the rendering pipeline to use normal-mapped dynamic lighting.

**The asset pipeline runs once.** Generated images are committed to the repo
as static files in `client/public/assets/ai/`. No runtime AI calls, no
per-build generation. Re-run only when changing art style or adding assets.

---

## Current State

### Asset Inventory (what exists today)

**Static image assets** (loaded via Phaser, pre-baked PNGs):
- `assets/tilesets/office.png` (63KB) — 32 office tiles, 64×64 each
- `assets/tilesets/agentHeights.png` (297KB) — recolored office tileset
- `assets/tilesets/world.png` (235KB) — 24 world tile frames, 64×64 each
- `assets/maps/office.json` + `agentHeights.json` — Tiled map layouts
- `assets/characters/char-0..7.png` — 8 character spritesheets (64×96, 4-dir × 8 frames)
- `assets/characters/boss.png` — player character
- `assets/sprites/bubble.png` — 3-frame thought bubble
- `assets/gameplay.png` (431KB) — gameplay sprites

**Procedural Canvas2D textures** (generated at runtime, no image files):
- `textures.ts` (4,191 lines) — creatures, beasts, projectiles, effects, UI
- `furniture.ts` (2,268 lines) — 30+ furniture types (desks, chairs, monitors, plants, sofa, kitchen, server rack, chimney)
- `workshop.ts` — forge station, code terminal, tool rack, status monitor, blueprint desk
- `chargen.ts` — character spritesheets from parameters (animated, 32 frames each)

### Rendering Architecture
- **Main game**: Phaser 3.90, 2D tilemap + sprites, `pixelArt: true`
- **Custom WebGL2 engine** (`client/src/engine/`): built but dormant (test-only)
  - Has tile-batcher with 32 point lights + ambient in fragment shader
  - Has sprite-batcher (no lighting, just tint)
  - Has post-processing: bloom, ACES tonemapping, DOF
  - Has light-system, shadow-batcher, particle-system, texture-atlas

### Tile Types (from `shared/types.ts`)
World tiles (24 base types, 4 variants each = 96 textures):
- GRASS, WALL, TREE, ROCK, FLOWER, ACID, PATH, SAND, SNOW, LAVA, CRYSTAL, VOID, RUIN, CASTLE, FAIRWAY, GOLF_FLAG, SAND_TRAP, POND, BENCH, HEDGE, BUSH, WATER (3 anim frames), GOLF_CLUB, GOLF_BALL, BIG_TREE, AXE, LEPRECHAUN, TEE_BOX, TENNIS_*, SERVER_RACK, SERVER_SCREEN, CHIMNEY, BIG_ROCK, PALM_TREE, MYSTIC_TREE

Office tiles (32 types in tileset):
- Floor, wall, carpet, door, desk (left/right/side variants), chair (4 directions), filing cabinet, plant (small/large), wall picture, window, coffee machine (top/bottom), water cooler, kitchen counter, sink, microwave, sofa (left/right), toaster, monitor, server rack, server screen, chimney

---

## What Gets AI-Generated (Static Assets)

### Tier 1: World Tile Textures (highest visual impact)
These cover the entire outdoor world. 24 base types × 4 variants = 96 images.

| Tile | Count | Normal Map? | Notes |
|---|---|---|---|
| GRASS | 4 variants | Yes | Tileable, with height variation for normal map |
| PATH | 4 variants | Yes | Tileable dirt/cracked earth |
| SAND | 4 variants | Yes | Tileable, dune-like |
| SNOW | 4 variants | Yes | Tileable, sparkle detail |
| WALL | 4 variants | Yes | Brick/concrete, tileable |
| WATER | 3 frames | Yes | Animated — 3 frames of rippling |
| TREE | 4 variants | No (sprite) | Transparent background, top-down tree |
| BIG_TREE | 4 variants | No (sprite) | Larger tree variant |
| PALM_TREE | 4 variants | No (sprite) | Palm tree |
| MYSTIC_TREE | 4 variants | No (sprite) | Glowing magical tree |
| ROCK | 4 variants | Yes | Boulder, tileable edges |
| BIG_ROCK | 4 variants | Yes | Large boulder |
| RUIN | 4 variants | Yes | Crumbling stone, tileable |
| CASTLE | 4 variants | Yes | Cut stone block, tileable |
| CRYSTAL | 4 variants | Yes | Glowing crystal formation |
| LAVA | 4 variants | Yes | Glowing molten rock, tileable |
| VOID | 4 variants | Yes | Dark void tear, tileable |
| FLOWER | 4 variants | No (sprite) | Small flower cluster |
| BUSH | 4 variants | No (sprite) | Shrub |
| HEDGE | 4 variants | Yes | Trimmed hedge, tileable |
| BENCH | 1 | No (sprite) | Park bench |
| FAIRWAY | 4 variants | Yes | Smooth grass, tileable |
| SAND_TRAP | 4 variants | Yes | Loose sand, tileable |
| GOLF_FLAG | 1 | No (sprite) | Flag on pole |
| ACID | 4 variants | Yes | Acid pool, tileable |
| POND | 4 variants | Yes | Still water, tileable |
| Specials (golf, tennis, axe, etc.) | 1 each | No (sprite) | Game-specific props |

**Total: ~96 tile textures + ~48 normal maps = ~144 images**

### Tier 2: Office Tileset
Replace the current 64×64 office tileset with AI-generated versions.

| Tile | Count | Normal Map? | Notes |
|---|---|---|---|
| Office floor (carpet/wood) | 4 variants | Yes | Tileable |
| Office walls | 4 variants | Yes | Tileable, with baseboard |
| Door | 1 | Yes | Wooden door |
| Desk surfaces (left/right/side) | 6 | Yes | Wood laminate |
| Office chairs (4 directions) | 4 | Yes | Mesh/leather office chair |
| Filing cabinet | 1 | Yes | Metal cabinet |
| Plants (small/large) | 2 | No (sprite) | Potted plants |
| Wall picture | 1 | No (sprite) | Framed art |
| Window | 1 | Yes | Office window with frame |
| Coffee machine (top/bottom) | 2 | Yes | Stainless steel |
| Water cooler | 1 | Yes | Blue jug + white body |
| Kitchen counter | 1 | Yes | Granite countertop |
| Kitchen sink | 1 | Yes | Stainless sink |
| Microwave | 1 | Yes | Black microwave |
| Sofa (left/right) | 2 | Yes | Fabric sofa |
| Toaster | 1 | Yes | Chrome toaster |
| Monitor (front/side) | 2 | Yes | LCD monitor |
| Server rack | 1 | Yes | Black server rack |
| Server screen | 1 | Yes | Server with display |
| Chimney | 1 | Yes | Industrial brick chimney |

**Total: ~40 tile textures + ~30 normal maps = ~70 images**

### Tier 3: Furniture Sprites (runtime procedural → pre-baked)
Currently drawn procedurally in `furniture.ts`. Replace with AI-generated
sprites with transparent backgrounds.

All 30+ furniture types from `furniture.ts` + `workshop.ts`:
- Desks (left, right, side, side-mirror × 2)
- Chairs (down, up, left, right)
- Monitors (front, side, lit/unlit variants)
- Filing cabinet, small plant, large plant
- Wall picture, window
- Coffee machine (top, bottom), water cooler
- Kitchen counter, sink, microwave, toaster
- Sofa (left, right)
- Server rack, server screen, chimney
- Workshop: forge station, code terminal, tool rack, status monitor, blueprint desk

**Total: ~50 sprite textures + ~20 normal maps = ~70 images**

### Tier 4: Background / Environment (optional, big visual win)
- Office exterior building (seen from world)
- Sky gradient / skybox for world view
- Distant skyline / parallax background

**Total: ~5 images**

### NOT AI-Generated (kept procedural)
- **Character spritesheets** — `chargen.ts` works well, AI can't do consistent 32-frame animation
- **Creature sprites** — same animation consistency problem
- **VFX / particles** — procedural is better for animated effects
- **UI elements** — crisp, scalable, better as vector/procedural

---

## Asset Pipeline Script

### File: `scripts/generate-ai-assets.ts`

A standalone Node.js script that:
1. Calls an AI image generation API (fal.ai Flux or Replicate SDXL)
2. Generates each asset with a carefully crafted prompt
3. Generates a normal map for each asset (depth estimation → normal)
4. Post-processes: resize to 64×64, remove background (for sprites), ensure tileability
5. Saves as WebP to `client/public/assets/ai/`

### API Choice: fal.ai with Flux

- **Flux.1 [schnell]** — fastest, cheapest, high quality (~$0.003/image)
- **Flux.1 [dev]** — higher quality, ~$0.025/image
- Normal maps: **Flux Depth** or **Marigold** depth estimation → convert to normal

### Prompt Strategy

Each asset gets a structured prompt. Example for grass tile:

```
Top-down view of photorealistic grass texture, seamless tileable, 
64x64 pixels, lush green lawn, slight height variation, 
soft natural lighting, no shadows, flat lay photography style
```

Example for office desk:

```
Top-down view of a modern office desk, laminated wood surface, 
64x64 pixels, photorealistic, soft studio lighting, 
transparent background, centered, no shadow
```

### Pipeline Structure

```
scripts/generate-ai-assets.ts
├── Asset definitions (prompt + size + type + normalMap flag)
├── API client (fal.ai or Replicate)
├── Post-processing
│   ├── Resize to target dimensions (64×64 for tiles, larger for sprites)
│   ├── Tileability check + seam fixing (for tile textures)
│   ├── Background removal (for sprites — use rembg API or alpha channel)
│   └── Normal map generation (depth → normal map conversion)
├── Output writer (WebP to client/public/assets/ai/)
└── Manifest generator (JSON manifest of all generated assets)
```

### Output Structure

```
client/public/assets/ai/
├── tiles/
│   ├── grass_0.webp        (albedo)
│   ├── grass_0_n.webp      (normal map)
│   ├── grass_1.webp
│   ├── grass_1_n.webp
│   ├── path_0.webp
│   ├── ...
│   └── water_0.webp        (3 frames for animation)
│   └── water_1.webp
│   └── water_2.webp
├── office/
│   ├── floor_0.webp
│   ├── floor_0_n.webp
│   ├── wall_0.webp
│   ├── wall_0_n.webp
│   ├── desk_left.webp
│   ├── desk_left_n.webp
│   └── ...
├── furniture/
│   ├── chair_down.webp
│   ├── chair_down_n.webp
│   ├── monitor.webp
│   ├── monitor_n.webp
│   └── ...
├── backgrounds/
│   ├── sky.webp
│   └── skyline.webp
└── manifest.json           (asset registry: key → filename, size, hasNormal)
```

### Cost Estimate

| Category | Images | Normal Maps | Total | Cost (Flux schnell) |
|---|---|---|---|---|
| World tiles | 96 | 48 | 144 | ~$0.43 |
| Office tiles | 40 | 30 | 70 | ~$0.21 |
| Furniture | 50 | 20 | 70 | ~$0.21 |
| Backgrounds | 5 | 0 | 5 | ~$0.02 |
| Retries (~20%) | — | — | ~58 | ~$0.17 |
| **Total** | **191** | **98** | **~289** | **~$1.04** |

With Flux [dev] for higher quality: ~$7.23 total. Still very cheap.

---

## Shader Upgrades

### Where: Custom WebGL2 Engine (`client/src/engine/`)

The custom engine already has the infrastructure. We need to:
1. Switch the main game from Phaser to the custom engine (per `ENGINE_PLAN.md`)
2. Upgrade shaders to use normal maps

**If we stay on Phaser**: We can still use AI assets (just swap the PNG
sources), but we lose normal-mapped lighting. Phaser's 2D renderer doesn't
support custom shaders per-tile. We'd only get the "high-quality 2D" upgrade,
not the "premium 2.5D with dynamic lighting" upgrade.

**Recommendation**: The full visual upgrade requires the custom engine. But
we can phase it — swap assets first (immediate visual improvement on Phaser),
then switch to the custom engine for normal-mapped lighting.

### Phase A: Tile Fragment Shader Upgrade

Current lighting in `tile-batcher.ts`:
```glsl
vec3 lit = uAmbient * albedo;
for (int i = 0; i < 32; i++) {
  float d = distance(vWorldPos, uLightPos[i].xy);
  float atten = 1.0 - smoothstep(0.0, uLightRadius[i], d);
  lit += uLightColor[i] * albedo * atten * uLightIntensity[i];
}
```

Upgraded with normal mapping + specular:
```glsl
uniform sampler2D uNormalAtlas;  // normal map atlas

void main() {
  vec3 albedo = texture(uAtlas, vUV).rgb;
  vec3 normal = texture(uNormalAtlas, vUV).rgb * 2.0 - 1.0;
  normal = normalize(normal);
  
  vec3 lit = uAmbient * albedo;
  for (int i = 0; i < 32; i++) {
    if (i >= uLightCount) break;
    vec3 toLight = uLightPos[i] - vec3(vWorldPos, 0.0);
    float d = length(toLight.xy);
    float atten = 1.0 - smoothstep(0.0, uLightRadius[i], d);
    
    vec3 lightDir = normalize(toLight);
    float diff = max(dot(normal, lightDir), 0.0);
    lit += uLightColor[i] * albedo * diff * atten * uLightIntensity[i];
    
    // Specular highlight (Blinn-Phong)
    vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    lit += uLightColor[i] * spec * atten * uLightIntensity[i] * 0.3;
  }
  fragColor = vec4(lit, edgeFade);
}
```

### Phase B: Sprite Fragment Shader Upgrade

Current `sprite-batcher.ts` has no lighting — just `tex * tint`. Upgrade:
- Add normal map sampling for furniture sprites
- Apply the same Blinn-Phong lighting as tiles
- Characters stay unlit (they're animated, lighting would look wrong frame-to-frame)

### Phase C: Texture Atlas Upgrade

`texture-atlas.ts` needs to support a second texture unit for normal maps:
- Albedo atlas: existing 2048×2048 texture
- Normal atlas: parallel 2048×2048 texture, same UV layout
- Both bound to different texture units in shaders

---

## Implementation Plan

### Step 1: Asset Pipeline Script (Week 1)

**Files:**
- `scripts/generate-ai-assets.ts` — main pipeline script
- `scripts/lib/ai-image-client.ts` — fal.ai API client
- `scripts/lib/post-process.ts` — resize, tileability, background removal
- `scripts/lib/normal-map.ts` — depth → normal map conversion

**Tasks:**
1. Define asset manifest (all ~289 images with prompts + metadata)
2. Build fal.ai API client (fetch → buffer → save)
3. Post-processing: sharp/jimp for resize, rembg for background removal
4. Normal map generation: call depth estimation API, convert depth → normal in code
5. Tileability: for tile textures, check edge pixels match, blend seams if needed
6. Save as WebP (smaller than PNG, supports alpha)
7. Generate `manifest.json` registry

**Dependencies to add:**
- `sharp` — image processing (resize, format conversion)
- `@fal-ai/client` or just `fetch` — API calls
- `rembg` or `@imgly/background-removal-node` — background removal for sprites

**Run:** `pnpm tsx scripts/generate-ai-assets.ts`
**Output:** ~289 images in `client/public/assets/ai/` + `manifest.json`

### Step 2: Integrate AI Assets into Phaser (Week 1-2)

Immediate visual upgrade without engine switch.

**Files to modify:**
- `client/src/game/boot.ts` — load AI assets instead of/in addition to existing tilesets
- `client/src/game/textures.ts` — skip procedural generation for assets that now have AI versions
- `client/src/game/furniture.ts` — load AI furniture sprites instead of procedural drawing
- `client/src/game/world.ts` — use AI world tile textures

**Approach:**
- Load `manifest.json` at boot
- For each AI asset, load the WebP via Phaser's loader
- Replace `world.png` spritesheet with AI-generated tile frames
- Replace office tileset PNG with AI-generated version
- Replace furniture procedural generation with AI sprite loading
- Keep procedural generation as fallback for any missing AI assets

**Result**: Game looks dramatically better immediately. No shader changes
needed — just better source art. This is the "high-quality 2D" baseline.

### Step 3: Custom Engine Activation (Week 2-3)

Follow `ENGINE_PLAN.md` to switch from Phaser to the custom WebGL2 engine.

This is the larger effort but the engine is already built. Key tasks:
- Port `scene.ts` to use engine API instead of Phaser
- Port `world.ts` chunk rendering to engine
- Port `agent.ts` to engine sprites
- Port `lighting.ts` to engine LightSystem
- Port `effects.ts` to engine ParticleSystem
- Port `furniture.ts` to engine sprites
- Swap `main.ts` to boot engine instead of Phaser

**Result**: Game runs on custom WebGL2 engine with existing lighting
(32 point lights, ambient, bloom, ACES, DOF). Same AI assets, but now
with real dynamic lighting instead of fake additive sprites.

### Step 4: Normal-Mapped Lighting (Week 3)

Upgrade the shaders to use normal maps.

**Files to modify:**
- `client/src/engine/texture-atlas.ts` — add second atlas texture for normal maps
- `client/src/engine/tile-batcher.ts` — upgrade fragment shader (diffuse + specular)
- `client/src/engine/sprite-batcher.ts` — add lighting for furniture sprites
- `client/src/engine/engine.ts` — bind normal atlas as texture unit 1

**Tasks:**
1. Extend `TextureAtlas` to manage a parallel normal map atlas
2. Upload normal maps alongside albedo maps during asset loading
3. Upgrade tile fragment shader with Blinn-Phong (diffuse + specular)
4. Upgrade sprite fragment shader with lighting for furniture
5. Tune specular intensity per material (metal > wood > fabric > grass)
6. Add material roughness uniform (can be per-tile-type constant for now)

**Result**: Premium 2.5D. Normal-mapped tiles with dynamic per-pixel
lighting, specular highlights on surfaces, real light falloff. The office
lights actually illuminate the desk surfaces with proper highlights.
Lava glows with real emissive + bounce light on adjacent tiles.

### Step 5: Polish (Week 4)

- **Emissive maps**: Add emissive texture for lava, crystals, void, monitors
  (self-illuminated surfaces that ignore lighting)
- **Ambient occlusion**: Bake AO into tile textures (darken crevices)
- **Material properties**: Per-tile roughness/metalness values
- **Tuning**: Light intensities, specular power, ambient levels
- **Performance**: Verify 60fps with normal-mapped tiles + 32 lights

---

## File Summary

### New Files
```
scripts/generate-ai-assets.ts          # Main pipeline script
scripts/lib/ai-image-client.ts         # fal.ai API client
scripts/lib/post-process.ts            # Image post-processing
scripts/lib/normal-map.ts              # Depth → normal conversion
client/public/assets/ai/               # Generated assets (committed to repo)
client/public/assets/ai/manifest.json  # Asset registry
```

### Modified Files
```
# Phase 2: Asset integration (Phaser)
client/src/game/boot.ts                # Load AI assets
client/src/game/textures.ts            # Skip AI-replaced procedural textures
client/src/game/furniture.ts           # Load AI furniture sprites
client/src/game/world.ts               # Use AI world tiles

# Phase 3: Engine activation
client/src/main.ts                     # Boot engine instead of Phaser
client/src/game/scene.ts               # Port to engine API
client/src/game/agent.ts               # Port to engine sprites
client/src/game/lighting.ts            # Use engine LightSystem
client/src/game/effects.ts             # Use engine ParticleSystem

# Phase 4: Normal-mapped lighting
client/src/engine/texture-atlas.ts     # Dual atlas (albedo + normal)
client/src/engine/tile-batcher.ts      # Blinn-Phong fragment shader
client/src/engine/sprite-batcher.ts    # Lighting for furniture
client/src/engine/engine.ts            # Bind normal atlas
```

### Unchanged Files
```
client/src/game/chargen.ts             # Character generation stays procedural
client/src/game/worldgen.ts            # Pure math, no rendering
client/src/game/path.ts                # Pathfinding logic
client/src/net.ts                      # Networking
client/src/store.ts                    # State management
shared/types.ts                        # Protocol types
server/*                               # Backend unchanged
```

---

## Dependencies

### New npm packages
- `sharp` — image processing (resize, WebP encoding)
- `@fal-ai/client` — fal.ai API (or use raw `fetch`)
- `@imgly/background-removal-node` — background removal for sprites (optional, can use rembg API instead)

### Existing packages we'll use
- `three` (already in package.json, currently unused) — not needed for this approach
- `gl-matrix` (already installed) — used by custom engine
- `pngjs` (already in devDeps) — used by existing asset scripts

### Environment variables
- `FAL_KEY` — fal.ai API key (only needed when running the pipeline script, not at runtime)

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| AI images look inconsistent | Use same model + style prefix for all prompts. Generate in batches with seed control. Manual curation — reject and regenerate bad outputs. |
| Normal maps look wrong | Use established depth estimation (Marigold, MiDaS). Manual review of each normal map. Fallback: generate normals from grayscale heightmap in code. |
| Tileability issues | Post-process: check edge pixel match, blend seams. Use ControlNet Tile border for seamless generation. |
| Bundle size increase | WebP compression (typically 30-50% smaller than PNG). 289 images × ~5KB avg = ~1.4MB total. Acceptable. |
| Engine migration is big | Phase it: swap assets first (immediate win on Phaser), then migrate engine. Each phase ships independently. |
| AI API downtime | Pipeline is offline/one-time. Run locally, retry failures. No runtime dependency on AI APIs. |
