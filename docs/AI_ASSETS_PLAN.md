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

Assets split into three categories based on which model generates them:

- **Tileable surface textures** (floors, walls, terrain) → **PATINA Material**
  (text-to-PBR, outputs basecolor + normal + roughness + metalness + height
  in one call, seamlessly tileable by default)
- **Object sprites** (furniture, props, trees) → **Recraft V4.1** for SVG source
  (text-to-vector, clean editable paths, infinitely scalable), then rasterize
  and pass to **PATINA Image-to-Map** for PBR extraction
- **UI elements / icons** → **Recraft V4.1** (text-to-SVG, rendered directly
  in DOM HUD, no rasterization needed)
- **Backgrounds / complex scenes** → **Nano Banana 2** (text-to-image,
  photorealistic raster, where vector art can't capture the detail needed)

### Tier 1: World Tile Textures (highest visual impact)
These cover the entire outdoor world. Tileable surfaces use PATINA Material;
object sprites use Recraft V4.1 (SVG) + PATINA Image-to-Map for PBR.
Some complex sprites (crystals, mystic trees) use Nano Banana 2 instead.

| Tile | Count | Model | PBR Maps? | Notes |
|---|---|---|---|---|
| GRASS | 4 variants | PATINA Material | Full set | Tileable, `tiling_mode: both` |
| PATH | 4 variants | PATINA Material | Full set | Tileable dirt/cracked earth |
| SAND | 4 variants | PATINA Material | Full set | Tileable, dune-like |
| SNOW | 4 variants | PATINA Material | Full set | Tileable, sparkle detail |
| WALL | 4 variants | PATINA Material | Full set | Brick/concrete, tileable |
| WATER | 3 frames | PATINA Material | Full set | 3 separate gens for animation frames |
| TREE | 4 variants | Recraft V4.1 | PATINA i2m | SVG source, transparent bg, top-down tree |
| BIG_TREE | 4 variants | Recraft V4.1 | PATINA i2m | SVG source, larger tree variant |
| PALM_TREE | 4 variants | Recraft V4.1 | PATINA i2m | SVG source, palm tree |
| MYSTIC_TREE | 4 variants | Nano Banana 2 | PATINA i2m | Complex glow effects, raster better |
| ROCK | 4 variants | PATINA Material | Full set | Boulder surface, tileable |
| BIG_ROCK | 4 variants | Recraft V4.1 | PATINA i2m | SVG source, large boulder sprite |
| RUIN | 4 variants | PATINA Material | Full set | Crumbling stone, tileable |
| CASTLE | 4 variants | PATINA Material | Full set | Cut stone block, tileable |
| CRYSTAL | 4 variants | Nano Banana 2 | PATINA i2m | Complex glow/refraction, raster better |
| LAVA | 4 variants | PATINA Material | Full set | Molten rock, tileable, emissive |
| VOID | 4 variants | PATINA Material | Full set | Dark void tear, tileable |
| FLOWER | 4 variants | Recraft V4.1 | No | SVG source, small flower cluster sprite |
| BUSH | 4 variants | Recraft V4.1 | No | SVG source, shrub sprite |
| HEDGE | 4 variants | PATINA Material | Full set | Trimmed hedge, tileable |
| BENCH | 1 | Recraft V4.1 | PATINA i2m | SVG source, park bench sprite |
| FAIRWAY | 4 variants | PATINA Material | Full set | Smooth grass, tileable |
| SAND_TRAP | 4 variants | PATINA Material | Full set | Loose sand, tileable |
| GOLF_FLAG | 1 | Recraft V4.1 | No | SVG source, flag on pole sprite |
| ACID | 4 variants | PATINA Material | Full set | Acid pool, tileable |
| POND | 4 variants | PATINA Material | Full set | Still water, tileable |
| Specials (golf, tennis, axe, etc.) | 1 each | Recraft V4.1 | No | SVG source, game-specific prop sprites |

**Totals:**
- PATINA Material calls: ~60 (tileable surfaces × 4 variants + 3 water frames)
  → 60 calls × 5 maps each = 300 PBR map images + 60 basecolor images
- Recraft V4.1 calls: ~30 (simple object sprites — trees, rocks, flowers, props)
  → 30 SVG files (committed as source) + 30 rasterized PNGs for PBR extraction
- Nano Banana 2 calls: ~10 (complex sprites — mystic tree, crystals, backgrounds)
- PATINA Image-to-Map calls: ~20 (PBR extraction from rasterized SVGs + Nano Banana sprites)

### Tier 2: Office Tileset
Replace the current 64×64 office tileset with AI-generated versions.

| Tile | Count | Model | PBR Maps? | Notes |
|---|---|---|---|---|
| Office floor (carpet/wood) | 4 variants | PATINA Material | Full set | Tileable |
| Office walls | 4 variants | PATINA Material | Full set | Tileable, with baseboard |
| Door | 1 | Recraft V4.1 | PATINA i2m | SVG source, wooden door sprite |
| Desk surfaces (left/right/side) | 6 | Recraft V4.1 | PATINA i2m | SVG source, wood laminate sprites |
| Office chairs (4 directions) | 4 | Recraft V4.1 | PATINA i2m | SVG source, mesh/leather office chair |
| Filing cabinet | 1 | Recraft V4.1 | PATINA i2m | SVG source, metal cabinet sprite |
| Plants (small/large) | 2 | Recraft V4.1 | No | SVG source, potted plant sprites |
| Wall picture | 1 | Recraft V4.1 | No | SVG source, framed art sprite |
| Window | 1 | Recraft V4.1 | PATINA i2m | SVG source, office window sprite |
| Coffee machine (top/bottom) | 2 | Recraft V4.1 | PATINA i2m | SVG source, stainless steel sprites |
| Water cooler | 1 | Recraft V4.1 | PATINA i2m | SVG source, blue jug + white body |
| Kitchen counter | 1 | PATINA Material | Full set | Granite countertop, tileable |
| Kitchen sink | 1 | Recraft V4.1 | PATINA i2m | SVG source, stainless sink sprite |
| Microwave | 1 | Recraft V4.1 | PATINA i2m | SVG source, black microwave sprite |
| Sofa (left/right) | 2 | Recraft V4.1 | PATINA i2m | SVG source, fabric sofa sprites |
| Toaster | 1 | Recraft V4.1 | PATINA i2m | SVG source, chrome toaster sprite |
| Monitor (front/side) | 2 | Recraft V4.1 | PATINA i2m | SVG source, LCD monitor sprites |
| Server rack | 1 | Recraft V4.1 | PATINA i2m | SVG source, black server rack sprite |
| Server screen | 1 | Recraft V4.1 | PATINA i2m | SVG source, server with display sprite |
| Chimney | 1 | Recraft V4.1 | PATINA i2m | SVG source, industrial brick chimney |

**Totals:**
- PATINA Material calls: ~8 (floors, walls, counter — tileable surfaces)
- Recraft V4.1 calls: ~28 (furniture/object sprites as SVG)
- PATINA Image-to-Map calls: ~22 (PBR extraction from rasterized SVGs)

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

**Note**: Many of these overlap with Tier 2 office tiles. The unique
furniture sprites not already covered above:
- Recraft V4.1 calls: ~20 (workshop items + additional furniture variants as SVG)
- PATINA Image-to-Map calls: ~15

### Tier 4: Background / Environment (optional, big visual win)
- Office exterior building (seen from world) — Nano Banana 2 (complex detail)
- Sky gradient / skybox for world view — Nano Banana 2 (atmospheric)
- Distant skyline / parallax background — Nano Banana 2 (complex scene)

**Total: ~3 Nano Banana 2 calls**

### Tier 5: UI Elements / Icons (new — was procedural)
Replace procedural UI drawing with AI-generated SVG icons. SVGs render
natively in the DOM-based HUD (`client/src/ui/hud.ts`) — no rasterization
needed, infinitely scalable, tiny file size.

| Element | Count | Model | Notes |
|---|---|---|---|---|
| HUD icons (health, compass, minimap) | ~10 | Recraft V4.1 | SVG, rendered in DOM |
| Marketplace icons | ~5 | Recraft V4.1 | SVG, rendered in DOM |
| Achievement badges | ~15 | Recraft V4.1 | SVG, rendered in DOM |
| Agent status indicators | ~8 | Recraft V4.1 | SVG, rendered in DOM |
| Button / panel decorations | ~10 | Recraft V4.1 | SVG, CSS-styled |

**Total: ~48 Recraft V4.1 calls (SVG, no PBR maps needed)**

### NOT AI-Generated (kept procedural)
- **Character spritesheets** — `chargen.ts` works well, AI can't do consistent 32-frame animation
- **Creature sprites** — same animation consistency problem
- **VFX / particles** — procedural is better for animated effects

---

## AI Models Used

### PATINA Material (`fal-ai/patina/material`) — Text to PBR

Dedicated PBR material generation model. Give it a text prompt, get back a
complete, seamlessly tileable PBR map set in one call:

- **Basecolor** (albedo) — pure surface color, no baked lighting
- **Normal map** — surface detail normals (OpenGL +Y convention)
- **Roughness map** — how glossy/matte the surface is
- **Metalness map** — whether surface is metal (1) or dielectric (0)
- **Height map** — displacement/bump detail

All maps are **cross-channel consistent** (normal matches height, roughness
matches basecolor) and **seamlessly tileable** out of the box via
`tiling_mode: "both"`.

**Pricing:** $0.01 base + $0.02/Mp + $0.01/Mp per map.
A 1024×1024 full 5-map set = **$0.08**.

**API:**
```typescript
const result = await fal.subscribe("fal-ai/patina/material", {
  input: {
    prompt: "weathered oak wood planks, office floor",
    image_size: "square_hd",   // 1024×1024
    tiling_mode: "both",
    maps: ["basecolor", "normal", "roughness", "metalness", "height"],
    output_format: "webp",
    seed: 42,                   // reproducible
  }
});
// Returns: { images: [
//   { url },                          // base texture
//   { url, map_type: "basecolor" },
//   { url, map_type: "normal" },
//   { url, map_type: "roughness" },
//   { url, map_type: "metalness" },
//   { url, map_type: "height" },
// ]}
```

### PATINA Image-to-Map (`fal-ai/patina`) — Image to PBR

Feed it an existing image (e.g. a Nano Banana 2 sprite) and it extracts all
PBR maps. Same cross-channel consistency.

**Pricing:** $0.01 + $0.01/Mp per output map.
A 1024×1024 input generating all 5 maps = **$0.06**.

### Recraft V4.1 Text-to-Vector (`fal-ai/recraft/v4.1/text-to-vector`) — Text to SVG

Generates **true SVG vector files** directly from text prompts — not
raster-to-vector tracing, but actual clean vector paths. Used for furniture
sprites, props, trees, and all UI elements.

**Why SVG for sprites:**
- **Infinitely scalable** — re-export at 64×64, 128×128, 256×256 without quality loss
- **Tiny file size** — ~2-5KB per SVG vs ~5-20KB per WebP
- **Human-editable** — tweak colors, shapes, paths in any vector editor
- **Version-controllable** — SVG is text/XML, diffs cleanly in git
- **DOM-native** — UI icons render directly in the DOM HUD without rasterization

**Pricing:** $0.08 per SVG (standard), $0.30 per SVG (Pro — higher fidelity).

**API:**
```typescript
const result = await fal.subscribe("fal-ai/recraft/v4.1/text-to-vector", {
  input: {
    prompt: "modern office chair, mesh back, top-down view, flat color, clean vector style",
  }
});
// Returns: { images: [{ url, file_name: "image.svg", content_type: "image/svg+xml" }] }
```

**Workflow for furniture sprites (SVG → PBR):**
1. Generate SVG sprite via Recraft V4.1
2. Save SVG source to `client/public/assets/ai/furniture/*.svg` (editable, version-controlled)
3. Rasterize SVG to 1024×1024 PNG using `sharp`
4. Pass rasterized PNG to PATINA Image-to-Map for PBR map extraction
5. Save PBR maps as WebP alongside the SVG source

**Workflow for UI elements (SVG only, no PBR):**
1. Generate SVG icon via Recraft V4.1
2. Save SVG to `client/public/assets/ai/ui/*.svg`
3. Reference directly in DOM HUD via `<img src="...svg">` or inline SVG

### Nano Banana 2 (`fal-ai/nano-banana-2`) — Text to Raster Image

General image generation model for complex scenes where vector art can't
capture the needed detail (glow effects, atmospheric backgrounds, crystals
with refraction). Used sparingly — only for assets that are too complex
for SVG.

**Pricing:** ~$0.05 per image (varies by size/options).

**Workflow:**
1. Generate image with prompt like `"glowing purple crystal formation,
   top-down view, isolated on solid green background, photorealistic"`
2. Remove background (chroma key the green, or use `fal-ai/bria/background/remove`)
3. If PBR maps needed: pass the cleaned image to PATINA Image-to-Map

---

## Asset Pipeline Script

### File: `scripts/generate-ai-assets.ts`

A standalone Node.js script that:
1. For **tileable surfaces**: calls `fal-ai/patina/material` (text → full PBR set in one call)
2. For **object sprites**: calls `fal-ai/recraft/v4.1/text-to-vector` (text → SVG),
   saves SVG source, rasterizes to PNG, then calls `fal-ai/patina` (image → PBR maps)
3. For **complex sprites**: calls `fal-ai/nano-banana-2` (text → raster image),
   removes background, then calls `fal-ai/patina` (image → PBR maps) if needed
4. For **UI elements**: calls `fal-ai/recraft/v4.1/text-to-vector` (text → SVG),
   saves SVG directly (no rasterization or PBR needed)
5. Post-processes: resize rasterized images to 64×64 (or 128×128 for larger sprites)
6. Saves SVG sources and WebP PBR maps to `client/public/assets/ai/`

### Why Not Generic Flux?

Generic image models (Flux, SDXL) produce pretty pictures but:
- No built-in tileability — requires manual seam fixing
- No PBR maps — requires separate depth estimation (MiDaS/Marigold) +
  code to convert depth → normal, and no roughness/metalness at all
- No cross-channel consistency — normal map won't match the albedo

PATINA is **purpose-built for PBR material generation**. It outputs
tileable, cross-channel-consistent map sets directly. This eliminates
the entire post-processing pipeline (seam fixing, depth estimation,
normal map conversion) and gives us roughness + metalness maps that
generic models can't produce.

### Prompt Strategy

**PATINA Material prompts** (tileable surfaces):
```
"lush green grass, lawn, slight height variation, natural"
"cracked earth path, dry dirt, scattered pebbles"
"weathered oak wood planks, office floor, laminated"
"dark brick wall, mortared, weathered"
```

**Recraft V4.1 prompts** (object sprites as SVG):
```
"modern office chair, mesh back, top-down view, flat color, clean vector
 style, isolated, no background, no shadow"
```

**Recraft V4.1 prompts** (UI icons as SVG):
```
"health bar icon, game UI, flat color, clean vector style, minimal"
"compass rose icon, game UI, flat color, clean vector style"
```

**Nano Banana 2 prompts** (complex sprites, raster only):
```
"glowing purple crystal formation, magical, top-down view, isolated on
 solid green background, photorealistic, studio lighting"
```

### Pipeline Structure

```
scripts/generate-ai-assets.ts
├── Asset definitions (prompt + model + size + maps needed + svg flag)
├── PATINA Material client (text → PBR set, tileable)
├── Recraft V4.1 client (text → SVG vector)
├── Nano Banana 2 client (text → raster image, complex sprites only)
├── SVG rasterizer (sharp — SVG → PNG at 1024×1024 for PBR extraction)
├── Background removal (chroma key or fal-ai/bria/background/remove)
├── PATINA Image-to-Map client (raster image → PBR maps)
├── Post-processing
│   └── Resize rasterized images to target dimensions (sharp)
├── Output writer (SVG + WebP to client/public/assets/ai/)
└── Manifest generator (JSON manifest of all generated assets + map types)
```

### Output Structure

```
client/public/assets/ai/
├── tiles/
│   ├── grass_0_basecolor.webp
│   ├── grass_0_normal.webp
│   ├── grass_0_roughness.webp
│   ├── grass_0_metalness.webp
│   ├── grass_0_height.webp
│   ├── grass_1_basecolor.webp
│   ├── ...
│   ├── water_0_basecolor.webp     (3 frames for animation)
│   ├── water_1_basecolor.webp
│   ├── water_2_basecolor.webp
│   └── ...
├── office/
│   ├── floor_0_basecolor.webp
│   ├── floor_0_normal.webp
│   ├── ...
│   ├── desk_left.svg              (SVG source — editable, scalable)
│   ├── desk_left_basecolor.webp   (rasterized from SVG for PBR)
│   ├── desk_left_normal.webp
│   ├── desk_left_roughness.webp
│   └── ...
├── furniture/
│   ├── chair_down.svg             (SVG source)
│   ├── chair_down_basecolor.webp  (rasterized from SVG)
│   ├── chair_down_normal.webp
│   ├── ...
├── ui/
│   ├── health_icon.svg            (SVG only — no PBR maps needed)
│   ├── compass.svg
│   ├── minimap_frame.svg
│   ├── achievement_badge_*.svg
│   └── ...
├── backgrounds/
│   ├── sky.webp
│   └── skyline.webp
└── manifest.json           (asset registry: key → filenames, maps, size, svg source)
```

### Cost Estimate

| Category | PATINA Material | Recraft V4.1 | Nano Banana 2 | PATINA i2m | Cost |
|---|---|---|---|---|---|
| World tiles (tileable) | 60 × $0.08 | — | — | — | $4.80 |
| World tiles (SVG sprites) | — | 30 × $0.08 | — | 15 × $0.06 | $3.30 |
| World tiles (raster sprites) | — | — | 10 × $0.05 | 5 × $0.06 | $0.80 |
| Office tiles (tileable) | 8 × $0.08 | — | — | — | $0.64 |
| Office tiles (SVG sprites) | — | 28 × $0.08 | — | 22 × $0.06 | $3.56 |
| Furniture (unique, SVG) | — | 20 × $0.08 | — | 15 × $0.06 | $2.50 |
| UI elements (SVG only) | — | 48 × $0.08 | — | — | $3.84 |
| Backgrounds (raster) | — | — | 3 × $0.05 | — | $0.15 |
| Retries (~15%) | ~10 × $0.08 | ~19 × $0.08 | ~2 × $0.05 | ~9 × $0.06 | ~$2.92 |
| **Total** | **78 calls** | **145 calls** | **15 calls** | **66 calls** | **~$22.51** |

~$23 total for the complete asset set with full PBR maps + SVG sources + UI icons.
More than the generic Flux approach (~$1-7) but you get:
- Purpose-built, tileable, cross-channel-consistent PBR materials (PATINA)
- Editable, infinitely scalable SVG source files for all sprites and UI (Recraft)
- Complex photorealistic sprites where vector art can't cut it (Nano Banana 2)

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

Upgraded with PBR lighting (normal + roughness + metalness maps):
```glsl
uniform sampler2D uNormalAtlas;    // normal map atlas
uniform sampler2D uRoughnessAtlas; // roughness map atlas
uniform sampler2D uMetalnessAtlas; // metalness map atlas

void main() {
  vec3 albedo = texture(uAtlas, vUV).rgb;
  vec3 normal = texture(uNormalAtlas, vUV).rgb * 2.0 - 1.0;
  normal = normalize(normal);
  float roughness = texture(uRoughnessAtlas, vUV).r;
  float metalness = texture(uMetalnessAtlas, vUV).r;
  
  // PBR specular: dielectric F0 = 0.04, metal F0 = albedo
  vec3 F0 = mix(vec3(0.04), albedo, metalness);
  
  vec3 lit = uAmbient * albedo;
  for (int i = 0; i < 32; i++) {
    if (i >= uLightCount) break;
    vec3 toLight = uLightPos[i] - vec3(vWorldPos, 0.0);
    float d = length(toLight.xy);
    float atten = 1.0 - smoothstep(0.0, uLightRadius[i], d);
    
    vec3 lightDir = normalize(toLight);
    
    // Diffuse (Lambert)
    float diff = max(dot(normal, lightDir), 0.0);
    lit += uLightColor[i] * albedo * diff * atten * uLightIntensity[i];
    
    // Specular (Blinn-Phong with roughness-driven exponent)
    float specPower = mix(8.0, 256.0, 1.0 - roughness);
    vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(normal, halfDir), 0.0), specPower);
    vec3 specColor = mix(F0, albedo, metalness);
    lit += uLightColor[i] * specColor * spec * atten * uLightIntensity[i];
  }
  fragColor = vec4(lit, edgeFade);
}
```

Key improvements over the Blinn-Phong-only approach:
- **Roughness map** drives specular power — rough surfaces (grass, fabric)
  have broad dull highlights, smooth surfaces (metal desk, water) have
  tight sharp highlights
- **Metalness map** changes specular color — metals reflect their own
  color (albedo), dielectrics reflect a neutral 0.04 F0
- This is proper PBR-style lighting, not just Blinn-Phong with a fixed
  specular exponent

### Phase B: Sprite Fragment Shader Upgrade

Current `sprite-batcher.ts` has no lighting — just `tex * tint`. Upgrade:
- Add normal + roughness + metalness map sampling for furniture sprites
- Apply the same PBR lighting as tiles
- Characters stay unlit (they're animated, lighting would look wrong frame-to-frame)

### Phase C: Texture Atlas Upgrade

`texture-atlas.ts` needs to support multiple texture units for PBR maps:
- Albedo atlas: existing 2048×2048 texture (texture unit 0)
- Normal atlas: parallel 2048×2048 texture (texture unit 1)
- Roughness atlas: parallel 2048×2048 texture (texture unit 2)
- Metalness atlas: parallel 2048×2048 texture (texture unit 3)
- All atlases share the same UV layout — a sprite uploaded at UV (u,v,w,h)
  has its albedo, normal, roughness, and metalness at the same UV region
- Height maps can be omitted from the atlas (used only for parallax, which
  we're not doing in v1)

---

## Implementation Plan

### Step 1: Asset Pipeline Script (Week 1)

**Files:**
- `scripts/generate-ai-assets.ts` — main pipeline script
- `scripts/lib/fal-client.ts` — fal.ai API client (PATINA Material, PATINA i2m, Nano Banana 2)
- `scripts/lib/post-process.ts` — resize, background removal (chroma key or Bria API)

**Tasks:**
1. Define asset manifest (all assets with prompts, model choice, map requirements)
2. Build fal.ai client for four models:
   - `fal-ai/patina/material` — text → tileable PBR set (5 maps in one call)
   - `fal-ai/recraft/v4.1/text-to-vector` — text → SVG vector (sprites + UI)
   - `fal-ai/nano-banana-2` — text → raster image (complex sprites only)
   - `fal-ai/patina` — image → PBR maps (for sprites that need normal/roughness)
3. SVG rasterization: use `sharp` to convert SVG → PNG at 1024×1024 for PBR extraction
4. Background removal: chroma key for solid-color backgrounds, or
   `fal-ai/bria/background/remove` for complex sprites
5. Post-processing: `sharp` to resize rasterized images to 64×64 (or 128×128)
6. Save SVG sources (sprites + UI) and WebP PBR maps
7. Generate `manifest.json` registry (key → filenames, map types, dimensions, svg source)

**Key simplification vs. original plan:**
- No manual normal map generation (PATINA outputs normals directly)
- No tileability checking/seam fixing (PATINA outputs tileable by default)
- No depth estimation models (PATINA outputs height maps directly)
- No separate roughness/metalness synthesis (PATINA outputs both)

**Dependencies to add:**
- `@fal-ai/client` — fal.ai API client (handles all four models)
- `sharp` — image resize, SVG rasterization, and WebP encoding

**Run:** `pnpm tsx scripts/generate-ai-assets.ts`
**Output:** ~400 PBR map WebPs + ~145 SVG source files + `manifest.json`

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

### Step 4: PBR-Mapped Lighting (Week 3)

Upgrade the shaders to use the full PBR map set (normal + roughness + metalness).

**Files to modify:**
- `client/src/engine/texture-atlas.ts` — add parallel atlases for normal, roughness, metalness
- `client/src/engine/tile-batcher.ts` — upgrade fragment shader (PBR diffuse + specular)
- `client/src/engine/sprite-batcher.ts` — add PBR lighting for furniture sprites
- `client/src/engine/engine.ts` — bind all atlases to texture units 0-3

**Tasks:**
1. Extend `TextureAtlas` to manage 4 parallel textures (albedo, normal, roughness, metalness)
2. Upload all PBR maps during asset loading (albedo + 3 maps per asset)
3. Upgrade tile fragment shader with PBR lighting:
   - Lambert diffuse with normal-mapped normals
   - Blinn-Phong specular with roughness-driven exponent
   - Metalness-driven F0 (metal vs dielectric reflection)
4. Upgrade sprite fragment shader with same PBR lighting for furniture
5. Characters stay unlit (animated sprites — lighting would flicker frame-to-frame)

**Result**: Premium 2.5D. PBR-mapped tiles with dynamic per-pixel lighting,
roughness-driven specular highlights (tight on metal/water, broad on
grass/fabric), metalness-driven reflection color. The office lights
actually illuminate desk surfaces with proper material-specific highlights.
Lava glows with real emissive + bounce light on adjacent tiles.

### Step 5: Polish (Week 4)

- **Emissive maps**: Add emissive texture for lava, crystals, void, monitors
  (self-illuminated surfaces that ignore lighting). PATINA doesn't output
  emissive maps, so these are hand-authored or derived from basecolor
  (e.g. threshold bright pixels in lava basecolor → emissive mask)
- **Height maps**: Use PATINA height maps for parallax occlusion mapping
  on tiles close to camera (optional, adds depth without geometry)
- **Tuning**: Light intensities, ambient levels, roughness/metalness
  response curves per tile type
- **Performance**: Verify 60fps with PBR-mapped tiles + 32 lights +
  4 texture samples per pixel (albedo + normal + roughness + metalness)

---

## File Summary

### New Files
```
scripts/generate-ai-assets.ts          # Main pipeline script
scripts/lib/fal-client.ts              # fal.ai client (PATINA Material, PATINA i2m, Recraft V4.1, Nano Banana 2)
scripts/lib/post-process.ts            # Image resize, SVG rasterization, background removal
client/public/assets/ai/               # Generated assets (SVG + WebP, committed to repo)
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

# Phase 4: PBR-mapped lighting
client/src/engine/texture-atlas.ts     # Quad atlas (albedo + normal + roughness + metalness)
client/src/engine/tile-batcher.ts      # PBR fragment shader (diffuse + specular + roughness + metalness)
client/src/engine/sprite-batcher.ts    # PBR lighting for furniture
client/src/engine/engine.ts            # Bind all atlases to texture units 0-3
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
- `@fal-ai/client` — fal.ai API client (PATINA Material, PATINA i2m, Recraft V4.1, Nano Banana 2, Bria bg removal)
- `sharp` — image resize, SVG rasterization, and WebP encoding

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
| AI images look inconsistent | Use PATINA for all tileable surfaces (consistent PBR output). Use Recraft V4.1 with fixed style prefix for all SVG sprites/UI. Use Nano Banana 2 only for complex raster sprites. Seed control for reproducibility. Manual curation — reject and regenerate bad outputs. |
| PBR maps look wrong | PATINA is purpose-built for PBR — cross-channel consistency is built in. Manual review of each material set. Fallback: regenerate with different seed. |
| Tileability issues | PATINA outputs seamlessly tileable by default (`tiling_mode: both`). No manual seam fixing needed. |
| SVG sprites too simple | Recraft V4.1 produces clean vector art but may lack photorealistic detail. For sprites that need complexity (crystals, mystic trees, backgrounds), fall back to Nano Banana 2 raster. SVG source is still saved for simple objects. |
| Bundle size increase | WebP compression for PBR maps (~1.2MB). SVG files are tiny (~2-5KB each, ~145 files = ~500KB). Total ~1.7MB. Acceptable. |
| Engine migration is big | Phase it: swap assets first (immediate win on Phaser), then migrate engine. Each phase ships independently. |
| AI API downtime | Pipeline is offline/one-time. Run locally, retry failures. No runtime dependency on AI APIs. |
| PATINA model limitations | PATINA generates surface materials, not complex objects. For furniture/props we use Recraft V4.1 (SVG) → rasterize → PATINA i2m. For complex objects, Nano Banana 2 → PATINA i2m. Three-model pipeline covers all asset types. |
