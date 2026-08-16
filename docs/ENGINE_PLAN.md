# HexStage — Custom WebGL2 Engine Plan

A hand-rolled WebGL2 hex-grid 2.5D engine to replace Phaser 3.
Optimized for visual identity, bundle size, user conversion, and
**agent-authored world generation** — the world builds itself from
computational actions, manifested as symbolic magic (inspired by
Loom's compositional thread system and the Snow Crash / True Names
vision of computation-as-magic).

---

## 1. Why Not Three.js

Three.js provides a scene graph, PBR materials, built-in lighting/shadows,
animation mixer, OrbitControls, GLTF loader, and EffectComposer. We need
almost none of this:

- Our hierarchy is flat (tiles + sprites + overlays)
- We want stylized rendering, not PBR realism
- We need a custom cinematic camera, not orbit controls
- We do frame-based sprite animation, not skeletal rigs
- Our existing GLSL shaders are already hand-written
- Our chunk system already does frustum culling

Three.js would add ~600KB of bundle and an abstraction tax (wrappers,
convention conversion, fighting defaults) for ~300 lines of saved matrix
math. Instead we use `gl-matrix` (15KB) for math and write ~1,000 lines
of purpose-built engine code.

---

## 2. Dependency Summary

| Dependency | Size | Purpose |
|---|---|---|
| `gl-matrix` | ~15KB gzipped | mat4/vec3 math (ortho, perspective, lookAt) |
| WebGL2 | native | Rendering (no library) |
| Web Audio API | native | Already used directly (audio.ts) |
| Web Workers | native | Already used for chunk generation |

No other dependencies. Total engine bundle target: <80KB gzipped.

---

## 3. File Structure

```
client/src/
  engine/                    ← NEW — the engine core (~1,000 lines)
    gl.ts                    WebGL2 context creation, shader utils, buffer helpers
    camera.ts                Ortho/perspective/cinematic camera with gl-matrix
    hexgrid.ts               Axial coordinate math, pixel conversion, neighbors
    tile-batcher.ts          Instanced hex tile renderer (1 draw call)
    sprite-batcher.ts        Billboard sprite renderer with texture atlas (1 draw call)
    shadow-batcher.ts        Blob shadow renderer (1 draw call, additive)
    light-system.ts          Up to 32 point lights, uploaded as uniform array
    particle-system.ts       GPU instanced quad particles
    postfx.ts                FBO chain: bloom → color grade → tilt-shift DOF
    texture-atlas.ts         Canvas → GPU texture upload, atlas packing, frame registration
    input.ts                 Keyboard, mouse, touch — unified pointer events
    scene-manager.ts         Lifecycle: preload → create → update → shutdown
    tween.ts                 Eased value animation (replaces Phaser tweens)
    engine.ts                Main loop (rAF), ties everything together
    types.ts                 Engine-internal types (GameObject, Sprite, Tile, etc.)
    threads.ts               Loom-inspired thread composition system (8 fundamental forces)
    spell-library.ts         Tool call → draft mapping, visual manifestation of spells
    domain.ts                Agent workspace → physical domain mapping (files as objects)
    mutation.ts              World mutation protocol (server → engine event stream)

  game/                      ← REWRITTEN — game logic on top of engine
    scene.ts                 Office scene (rewritten from Phaser to engine API)
    boot.ts                  Boot/loading scene (rewritten)
    agent.ts                 AgentNPC, OfficeManagerNPC, HermesNPC (rewritten)
    world.ts                 WorldLayer — chunk rendering, creatures, combat (rewritten)
    worldgen.ts              UNCHANGED — pure math, no Phaser
    worldgen.worker.ts       UNCHANGED — pure math, no Phaser
    path.ts                  MODIFIED — expand to 6-directional hex pathfinding
    textures.ts              MODIFIED — output to engine TextureAtlas instead of Phaser CanvasTexture
    chargen.ts               MODIFIED — output to engine TextureAtlas instead of Phaser
    shaders.ts               PORTED — raw GLSL extracted from Phaser pipeline wrappers
    lighting.ts              REWRITTEN — use engine LightSystem instead of Phaser sprites
    effects.ts               REWRITTEN — use engine ParticleSystem instead of Phaser emitters
    furniture.ts             REWRITTEN — draw to engine sprites/graphics instead of Phaser
    workshop.ts              REWRITTEN — same as furniture
    hud.ts (game/)           REWRITTEN — use engine camera/sprites instead of Phaser
    achievements.ts          MOSTLY UNCHANGED — pure logic, minimal Phaser refs
    audio.ts                 UNCHANGED — uses Web Audio API directly

  ui/                        ← UNCHANGED — all DOM-based, no Phaser
    hud.ts                   DOM HUD (no changes)
    marketplace.ts           DOM marketplace (no changes)
    md.ts                    DOM markdown renderer (no changes)

  main.ts                    MODIFIED — boot engine instead of Phaser.Game
  net.ts                     UNCHANGED
  store.ts                   UNCHANGED
  auth.ts                    UNCHANGED
  payment.ts                 UNCHANGED
  touch.ts                   UNCHANGED
  voice.ts                   UNCHANGED
  screen-share.ts            UNCHANGED
  webcam.ts                  UNCHANGED
  style.css                  UNCHANGED
```

### Phaser Import Map (13 files to rewrite)

| File | Size | Phaser Usage | Rewrite Effort |
|---|---|---|---|
| `scene.ts` | 339KB | Everything — the main scene | **High** — largest file, most logic |
| `world.ts` | 98KB | Chunk rendering, creatures, combat, UI | **High** |
| `furniture.ts` | 69KB | Graphics drawing for furniture | **Medium** — drawing calls |
| `textures.ts` | 132KB | CanvasTexture generation | **Medium** — swap output target |
| `workshop.ts` | 28KB | Graphics drawing for workshop items | **Medium** |
| `agent.ts` | 29KB | Sprite, Container, Text, Graphics, tweens | **Medium** |
| `hud.ts (game/)` | 13KB | In-game HUD (compass, minimap, health bar) | **Medium** |
| `effects.ts` | 12KB | Particle emitters, tweens | **Medium** |
| `boot.ts` | 11KB | Scene lifecycle, asset loading, animations | **Medium** |
| `chargen.ts` | 11KB | CanvasTexture for character generation | **Low** — swap output |
| `shaders.ts` | 9KB | PostFXPipeline wrappers | **Low** — extract raw GLSL |
| `lighting.ts` | 6KB | Additive blend sprites | **Low** — use LightSystem |
| `main.ts` | 5KB | Phaser.Game config | **Low** — swap to engine |

### Files That Stay Unchanged (engine-agnostic)

| File | Why |
|---|---|
| `net.ts` | WebSocket client, no rendering |
| `store.ts` | State management, no rendering |
| `auth.ts` | DOM overlay, Supabase auth |
| `payment.ts` | DOM overlay, Stripe |
| `touch.ts` | Pure state object |
| `voice.ts` | WebRTC |
| `screen-share.ts` | WebRTC |
| `webcam.ts` | WebRTC |
| `worldgen.ts` | Pure math (PRNG, noise, biome rules) |
| `worldgen.worker.ts` | Pure math worker |
| `audio.ts` | Web Audio API directly |
| `achievements.ts` | Pure logic + localStorage |
| `ui/hud.ts` | DOM-based HUD |
| `ui/marketplace.ts` | DOM-based marketplace |
| `ui/md.ts` | DOM markdown renderer |
| `shared/types.ts` | Protocol + type definitions |
| `shared/char-draw.ts` | Pixel drawing logic (shared with scripts/) |

---

## 4. Engine Architecture

### 4.1 Render Loop

```
requestAnimationFrame(loop)
  │
  ├─ Update phase
  │   ├─ InputManager.poll()
  │   ├─ SceneManager.active.update(time, dt)
  │   ├─ TweenManager.update(time)
  │   └─ ParticleSystem.update(dt)
  │
  ├─ Render phase
  │   ├─ gl.clear(COLOR | DEPTH)
  │   ├─ Camera.updateMatrices()
  │   │
  │   ├─ TileBatcher.render(visibleTiles, camera)
  │   │   └─ gl.drawArraysInstanced (1 call)
  │   ├─ ShadowBatcher.render(shadows, camera)
  │   │   └─ gl.drawArrays (1 call, additive blend)
  │   ├─ SpriteBatcher.render(sprites, camera)
  │   │   └─ gl.drawArrays (1 call)
  │   ├─ LightSystem.render(lights, camera)
  │   │   └─ gl.drawArrays (1 call, additive blend)
  │   ├─ ParticleSystem.render(camera)
  │   │   └─ gl.drawArraysInstanced (1 call)
  │   │
  │   └─ PostFX.render(sceneFramebuffer)
  │       ├─ BloomPass (FBO → FBO)
  │       ├─ ColorGradePass (FBO → FBO)
  │       ├─ TiltShiftDOFPass (FBO → screen)
  │       └─ gl.bindFramebuffer(null) + final blit
  │
  └─ rAF(loop)
```

Total: ~7 draw calls per frame.

### 4.2 Hex Grid Math (`hexgrid.ts`)

Coordinate system: **axial coordinates (q, r)** with cube coordinate
conversion for pathfinding and distance.

```typescript
// Flat-top hex layout
const HEX_SIZE = 32; // radius (center to vertex)

// Axial → pixel
function hexToPixel(q: number, r: number): { x: number; y: number } {
  return {
    x: HEX_SIZE * (3/2 * q),
    y: HEX_SIZE * (Math.sqrt(3) * (r + q/2)),
  };
}

// Pixel → axial (for picking)
function pixelToHex(x: number, y: number): { q: number; r: number } {
  const q = (2/3 * x) / HEX_SIZE;
  const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_SIZE;
  return hexRound(q, r);
}

// CRITICAL: hexRound must use cube coordinate rounding to avoid
// edge-case artifacts where the pointer snaps to the wrong hex at
// vertex boundaries. Convert axial → cube, round each axis, convert back.
function hexRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
  else if (rDiff > sDiff) rr = -rq - rs;
  return { q: rq, r: rr };
}

// 6 neighbors (vs current 4-directional)
const HEX_NEIGHBORS = [
  { q: +1, r:  0 },  // E
  { q: -1, r:  0 },  // W
  { q:  0, r: +1 },  // SE
  { q:  0, r: -1 },  // NW
  { q: +1, r: -1 },  // NE
  { q: -1, r: +1 },  // SW
];

// Cube distance (for A* heuristic)
function hexDistance(a: Hex, b: Hex): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r)
        + Math.abs((-a.q - a.r) - (-b.q - b.r))) / 2;
}
```

The existing A* in `path.ts` changes from 4-directional to 6-directional:
- Neighbor array expands from `[[1,0],[-1,0],[0,1],[0,-1]]` to 6 entries
- Heuristic changes from Manhattan to cube distance
- Grid stores `walkable[q][r]` instead of `walkable[y][x]`
- ~15 lines changed

### 4.3 Tile Renderer (`tile-batcher.ts`)

Each visible hex tile is an instanced quad with per-instance attributes:

**Per-instance attributes:**
- `aOffset` (vec2): pixel position of tile center
- `aElevation` (float): height of tile (0 = flat, >0 = raised)
- `aTexIndex` (float): which tile in the texture atlas
- `aTint` (vec3): color multiplier for biome variation
- `aAnimFrame` (float): current animation frame (for water tiles)

**Vertex shader** transforms the hex quad into a 3D prism:
- Top face at `z = aElevation * TILE_HEIGHT`
- Side walls drawn when `aElevation > 0` via a **second instanced pass**
  (WebGL2 / OpenGL ES 3.0 has **no geometry shader support** — must use
  instanced side quads). The instance buffer contains the 6 edge
directions of the hex. The vertex shader generates side wall geometry in
camera space for each elevated tile.
- Camera matrices applied

**Fragment shader** samples the atlas texture, applies tint, applies lighting:
```glsl
// Lighting: ambient + sum of point lights
vec3 lit = uAmbient * texColor.rgb;
for (int i = 0; i < MAX_LIGHTS; i++) {
  float dist = distance(vWorldPos.xy, uLights[i].pos);
  float atten = 1.0 - smoothstep(0.0, uLights[i].radius, dist);
  lit += uLights[i].color * texColor.rgb * atten * uLights[i].intensity;
}
gl_FragColor = vec4(lit, texColor.a);
```

One `gl.drawArraysInstanced` call for all visible tiles.

### 4.4 Sprite Renderer (`sprite-batcher.ts`)

Billboard sprites for characters, furniture, items.

**Texture atlas:** A single large texture (e.g. 2048×2048) containing:
- Character sprite sheets (8 frames per direction × 4 directions = 32 frames per character)
- Furniture textures
- Effect textures (sparks, dust, shockwaves, emotes)
- UI textures (health bars, compass, minimap)

The existing procedural generation in `textures.ts` and `chargen.ts` draws
to canvases. Instead of `Phaser.Textures.CanvasTexture`, we:
1. Draw to an `OffscreenCanvas` (same drawing code)
2. Upload via `gl.texSubImage2D` into the atlas at a packed UV region
3. Register the frame's UV coordinates for animation lookup

**Per-sprite attributes:**
- `aPosition` (vec2): world position (x, y)
- `aZOffset` (float): height above tile (for flying, elevation)
- `aUVOffset` (vec2): top-left UV in atlas
- `aUVSize` (vec2): frame size in atlas
- `aSize` (vec2): display size in pixels
- `aTint` (vec4): color multiplier + alpha
- `aFlip` (float): horizontal flip flag

**Vertex shader** positions the billboard:
- Quad centered at `(aPosition.x, aPosition.y, aZOffset)`
- Billboard always faces camera (rotate quad normal to camera forward)
- Depth written to z-buffer for proper occlusion with terrain

One `gl.drawArrays` call for all sprites.

### 4.5 Shadow Renderer (`shadow-batcher.ts`)

Simple blob shadows on the ground beneath sprites and furniture.

- Each shadow is a textured quad (radial gradient texture) laid flat on
  the ground at `z = 0`
- Per-instance: position, size, opacity
- Rendered with `gl.blendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)`
- One draw call

### 4.6 Lighting System (`light-system.ts`)

Replaces the additive-sprite approach in `lighting.ts`.

**Light uniform array** (uploaded once per frame):
```glsl
#define MAX_LIGHTS 32
uniform vec3 uLightPos[MAX_LIGHTS];    // x, y, z
uniform vec3 uLightColor[MAX_LIGHTS];  // r, g, b
uniform float uLightRadius[MAX_LIGHTS];
uniform float uLightIntensity[MAX_LIGHTS];
uniform int uLightCount;
uniform vec3 uAmbient;                 // ambient color
uniform float uTime;                   // for pulsing
```

**Light sources** (same as current `lighting.ts`):
- Player aura (brighter at night)
- Monitor glows (colored by agent status)
- Creature hostile glow
- Beast auras
- Lava/crystal/void tile lights
- Day/night cycle modulates ambient

**Day/night:** A single ambient color uniform that shifts from warm daytime
to cool nighttime. No overlay rectangles needed — the lighting is baked
into the tile/sprite fragment shaders.

### 4.7 Particle System (`particle-system.ts`)

GPU-instanced quads for particles. Replaces Phaser's particle emitters.

**Particle data** stored in a typed array buffer:
- Position (x, y, z)
- Velocity (vx, vy, vz)
- Color (r, g, b, a)
- Size
- Lifespan / age
- Texture index (spark, dust, ember, etc.)

**Update:** CPU-side, iterate the array, integrate velocity, decay alpha.
At ~200 particles this is negligible CPU work.

**Render:** Upload instance buffer, one `gl.drawArraysInstanced` call.

**Emitter presets** (matching current `effects.ts`):
- `sparkBurst(x, y, color, count, speed)` — impact sparks
- `dustCloud(x, y, count, scale)` — footstep dust
- `shockwave(x, y, color, maxScale)` — expanding ring (tweened quad)
- `smoke(x, y)` — ambient smoke from chimney
- `embers(x, y)` — floating embers near lava
- `confetti(x, y, colors[])` — celebration burst

### 4.8 Post-Processing (`postfx.ts`)

Direct WebGL2 FBO chain. Ports the 3 existing shaders from `shaders.ts`.

**Pipeline:**
```
Scene rendered → FBO_A
  │
  ├─ BloomPass: FBO_A → FBO_B
  │   Bright-pass extract + horizontal blur + vertical blur + composite
  │   (existing BLOOM_FRAGMENT, unchanged GLSL)
  │
  ├─ ColorGradePass: FBO_B → FBO_C
  │   ACES tone mapping + teal/amber split-tone
  │   (existing COLOR_GRADE_FRAGMENT, unchanged GLSL)
  │
  └─ TiltShiftDOFPass: FBO_C → screen
      Blur increases with distance from focus center
      (existing DOF_FRAGMENT, modified for diorama tilt-shift)
```

**Implementation:**
- 3 framebuffer objects (scene, pass A, pass B)
- 3 shader programs (compiled from existing GLSL)
- Each pass: bind FBO → bind program → set uniforms → draw fullscreen triangle
- Final pass renders to default framebuffer (screen)

**New: Tilt-shift DOF** — modifies the existing DOF shader to use a
horizontal focus band (not radial) when in diorama camera mode. This
creates the "miniature village" effect:
```glsl
// Horizontal band focus (tilt-shift)
float bandDist = abs(uv.y - uFocusCenter.y) * uAspectRatio;
float blurAmount = smoothstep(uFocusRadius, uFocusRadius + 0.3, bandDist) * uDOFStrength;
```

### 4.9 Camera (`camera.ts`)

Three modes with smooth tweened transitions:

```typescript
type CameraMode = "topdown" | "diorama" | "cinematic";

class Camera {
  private mode: CameraMode;
  private target: GameObject | null;  // follow target
  private zoom: number;
  private viewport: { w: number; h: number };

  // Projection matrices (gl-matrix mat4)
  private ortho: mat4;    // top-down orthographic
  private persp: mat4;    // tilted perspective
  private view: mat4;     // lookAt

  // Mode parameters
  // topdown:   ortho, looking straight down, zoom = 1.0
  // diorama:   persp, 30° tilt, zoom = 1.2, slight DOF
  // cinematic: persp, orbiting, auto-tour logic

  setMode(mode: CameraMode, tweenDuration = 1000): void;
  follow(target: GameObject): void;
  setZoom(zoom: number): void;
  pan(dx: number, dy: number): void;  // free-look mode

  // Called each frame — computes view matrix
  update(time: number): void;

  // Screen-to-world ray (for picking)
  screenToWorld(sx: number, sy: number): { x: number; y: number };
}
```

**Diorama mode** (default for spectator):
- Perspective camera at ~30° pitch
- Looks at the office center
- Slight tilt-shift DOF active
- This is the "dollhouse" view

**Cinematic auto-tour** (spectator only):
- Camera slowly orbits the office
- Pauses on active agents (3s each) with a subtle zoom-in
- Pans to the door, follows the world path briefly
- Returns to office, repeats
- Logic: ~100 lines, state machine with timed transitions

**Top-down mode** (gameplay):
- Orthographic, straight down
- No DOF
- Used for building/editing/precise interaction

**Transitions:** Tween the camera position, pitch, and distance over
800-1200ms with ease-in-out. **Do NOT lerp between ortho and perspective
projection matrices** — this produces a nauseating shearing distortion
because depth distribution is fundamentally different between the two.

Instead, use a **single perspective frustum with animated FOV**:
- Top-down mode: camera pulled far back along look vector, FOV widened
  proportionally → parallax flattens to near-zero (simulates ortho)
- Diorama mode: camera closer, 30° pitch, narrower FOV → visible depth
- Cinematic mode: same frustum, orbiting position
- Transitions animate the camera distance + FOV + pitch together,
  producing a smooth "focus pull" without projection switching

This avoids the ortho/persp matrix blend entirely. All three modes use
`mat4.perspective()` — only the parameters change.

### 4.10 Input (`input.ts`)

Unified keyboard + mouse + touch:

```typescript
class InputManager {
  private keys: Set<string>;
  private pointers: Map<number, Pointer>;
  private wheelDelta: number;

  // Query state
  isDown(key: string): boolean;
  wasPressed(key: string): boolean;  // edge-triggered
  getPointers(): Pointer[];
  getWheel(): number;

  // Camera-aware picking
  pickHex(sx: number, sy: number, camera: Camera): Hex | null;
  pickSprite(sx: number, sy: number, sprites: Sprite[]): Sprite | null;
}
```

**Hex picking:** `screenToWorld` → `pixelToHex`. O(1), no raycasting needed.

**Sprite picking:** Transform screen point to world, then AABB test against
sprite bounds. O(n) where n = visible sprites (typically <50).

**Touch:** Multi-touch tracking for pinch-zoom and pan. Reuses the existing
`touch.ts` state object. Two-finger gestures handled here instead of in
scene code.

### 4.11 Scene Manager (`scene-manager.ts`)

Minimal lifecycle replacing Phaser's Scene class:

```typescript
interface Scene {
  preload?(loader: Loader): void | Promise<void>;
  create?(): void;
  update?(time: number, dt: number): void;
  shutdown?(): void;
}

class SceneManager {
  private scenes: Map<string, Scene>;
  private active: Scene | null;
  private loader: Loader;

  add(key: string, scene: Scene): void;
  start(key: string): void;     // calls shutdown on current, create on new
  restart(): void;              // shutdown + create on same scene
  update(time: number, dt: number): void;
}
```

**Loader:** Simple async asset loader — fetches JSON tilemap data and
image files, uploads to texture atlas. Replaces Phaser's `this.load.*`.

### 4.12 Tween Engine (`tween.ts`)

Replaces `Phaser.Tweens`:

```typescript
class TweenManager {
  add(opts: {
    target: object;
    props: Record<string, [from: number, to: number]>;
    duration: number;
    ease?: (t: number) => number;  // default: easeInOutQuad
    yoyo?: boolean;
    onComplete?: () => void;
  }): Tween;

  update(time: number): void;
  killAll(): void;
}
```

Used for: agent hop, confetti, shockwave scaling, camera transitions,
UI element fade-in, helicopter cinematic.

### 4.13 Texture Atlas (`texture-atlas.ts`)

Replaces Phaser's TextureManager + CanvasTexture:

```typescript
class TextureAtlas {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture;
  private size: number;  // e.g. 2048
  private regions: Map<string, { u: number; v: number; w: number; h: number }>;
  private cursor: { x: number; y: number; rowH: number };

  // Upload a canvas region to the atlas
  addCanvas(key: string, canvas: HTMLCanvasElement | OffscreenCanvas): void;

  // Get UV coordinates for a registered texture
  getUV(key: string): { u: number; v: number; w: number; h: number };

  // Bind the atlas texture for rendering
  bind(unit: number): void;
}
```

**Atlas packing:** **Skyline packing** algorithm (not shelf packing).
Shelf packing fragments when agents are dynamically generated and deleted
— freed slots are not contiguous. Skyline packing tracks the upper
contour of packed rectangles and finds the lowest fitting gap, minimizing
wasted vertical space.

If fragmentation becomes severe during long sessions, implement a
**defragmentation pass** during scene transitions: pause rendering,
rebuild the atlas from all live textures, re-upload in one batch.

The existing `textures.ts` generates ~50 textures totaling ~512KB of pixel
data. A 2048×2048 atlas has 4MB of space — plenty of headroom.

**Dynamic registration:** Character textures generated at runtime (via
`chargen.ts`) are uploaded on-demand. When a new agent with a custom
appearance is hired, their sprite sheet is drawn to a canvas and uploaded
to the next free atlas slot. When an agent is fired, their slot is freed
and the skyline is updated.

### 4.14 Engine Entry Point (`engine.ts`)

Replaces `new Phaser.Game(config)`:

```typescript
class Engine {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private input: InputManager;
  private scenes: SceneManager;
  private tweens: TweenManager;
  private tiles: TileBatcher;
  private sprites: SpriteBatcher;
  private shadows: ShadowBatcher;
  private lights: LightSystem;
  private particles: ParticleSystem;
  private postfx: PostFX;
  private atlas: TextureAtlas;
  private registry: Map<string, unknown>;  // replaces Phaser registry

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions);

  // Registry (same pattern as Phaser)
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;

  // Start the render loop
  start(): void;
  stop(): void;
}
```

---

## 5. Migration: Phaser API → Engine API

### 5.1 Game Object Equivalents

| Phaser | Engine Equivalent |
|---|---|
| `this.add.sprite(x, y, key, frame)` | `engine.sprites.add({ x, y, atlasKey, frame })` |
| `this.add.image(x, y, key)` | `engine.sprites.add({ x, y, atlasKey })` |
| `this.add.text(x, y, str, style)` | `engine.sprites.addText({ x, y, text, font, size, color })` |
| `this.add.graphics()` | `engine.sprites.addGraphics()` — retained draw commands |
| `this.add.container(x, y, children)` | `engine.sprites.addGroup(children)` — transforms together |
| `this.add.rectangle(...)` | `engine.sprites.addQuad({ color, alpha })` |
| `this.add.ellipse(...)` | `engine.sprites.addQuad({ texture: "ellipse", color })` |
| `this.add.circle(...)` | Same as ellipse |
| `this.add.zone(...)` | `engine.input.addZone(x, y, w, h, onPointer)` |
| `this.add.particles(...)` | `engine.particles.emit(preset, x, y, opts)` |

### 5.2 Animation Equivalents

| Phaser | Engine Equivalent |
|---|---|
| `this.anims.create({ key, frames, frameRate, repeat })` | `engine.sprites.registerAnim(key, frames, frameRate, repeat)` |
| `sprite.play(key)` | `sprite.playAnimation(key)` |
| `this.anims.generateFrameNumbers(key, { frames: [...] })` | `engine.sprites.framesFromAtlas(key, [frameIndices])` |
| `sprite.anims.currentAnim?.key` | `sprite.currentAnim` |

### 5.3 Camera Equivalents

| Phaser | Engine Equivalent |
|---|---|
| `this.cameras.main.startFollow(sprite)` | `engine.camera.follow(sprite)` |
| `this.cameras.main.setZoom(z)` | `engine.camera.setZoom(z)` |
| `this.cameras.main.setScroll(x, y)` | `engine.camera.pan(x, y)` |
| `camera.setScrollFactor(0)` | `sprite.fixedToScreen = true` |

### 5.4 Input Equivalents

| Phaser | Engine Equivalent |
|---|---|
| `this.input.keyboard.addKey('W')` | `engine.input.isDown('w')` |
| `this.input.keyboard.createCursorKeys()` | `engine.input.isDown('ArrowUp')` etc. |
| `sprite.setInteractive()` + `on('pointerdown')` | `engine.input.onSpriteDown(sprite, callback)` |
| `this.input.on('pointerdown', fn)` | `engine.input.onPointerDown(fn)` |

### 5.5 Tween Equivalents

| Phaser | Engine Equivalent |
|---|---|
| `this.tweens.add({ targets, x: val, duration, yoyo, ease, onComplete })` | `engine.tweens.add({ target, props: { x: [from, val] }, duration, yoyo, ease, onComplete })` |
| `this.scene.time.delayedCall(ms, fn)` | `engine.tweens.delay(ms, fn)` or `setTimeout` |

### 5.6 Texture Equivalents

| Phaser | Engine Equivalent |
|---|---|
| `this.textures.createCanvas(key, w, h)` | `engine.atlas.createCanvas(key, w, h)` → returns `OffscreenCanvas` |
| `texture.add(frame, 0, x, y, w, h)` | `engine.atlas.registerFrame(key, frame, { x, y, w, h })` |
| `this.load.spritesheet(key, url, { frameWidth, frameHeight })` | `engine.loader.loadSpritesheet(key, url, frameW, frameH)` → uploads to atlas |
| `this.load.image(key, url)` | `engine.loader.loadImage(key, url)` → uploads to atlas |
| `this.load.tilemapTiledJSON(key, url)` | `engine.loader.loadJSON(key, url)` → returns parsed JSON |

---

## 6. Build Phases (Conversion-Prioritized)

### Phase 1: Engine Core + Spectator Showcase (Weeks 1-2)

**Goal:** Ship a beautiful `?spectator=1` link that makes people want to sign up.

**Build:**
- `gl.ts` — WebGL2 context, shader compile/link helpers, buffer helpers
- `camera.ts` — ortho + perspective + cinematic auto-tour
- `hexgrid.ts` — axial math, pixel conversion, neighbors, distance
- `tile-batcher.ts` — instanced hex tile renderer
- `texture-atlas.ts` — canvas upload, shelf packing, UV registration
- `postfx.ts` — FBO chain with bloom + color grade + tilt-shift DOF
- `engine.ts` — main loop tying it together
- `scene-manager.ts` — minimal lifecycle
- `input.ts` — basic keyboard/mouse (no touch yet)

**Port:**
- `shaders.ts` → extract raw GLSL, remove Phaser PostFXPipeline wrappers
- `textures.ts` → output to `TextureAtlas` instead of `Phaser.Textures.CanvasTexture`
- `boot.ts` → engine-based loading scene

**Deliverable:** Spectator mode renders the office as a hex diorama with
cinematic camera, bloom, color grading, and tilt-shift. No agents, no
interaction — just the space looking beautiful. The auto-tour camera
slowly pans through the office.

**Conversion metric:** Share the spectator link. Measure click-through
to signup page.

### Phase 2: Agents Come Alive (Weeks 3-4)

**Goal:** Agents visible and animated in the diorama. Spectator link now
shows a *working* office, not just an empty room.

**Build:**
- `sprite-batcher.ts` — billboard sprite renderer with atlas UV indexing
- `shadow-batcher.ts` — blob shadows
- `light-system.ts` — 32 point lights, day/night ambient
- `tween.ts` — eased value animation
- `particle-system.ts` — GPU instanced particles

**Port:**
- `agent.ts` → AgentNPC/OfficeManagerNPC/HermesNPC using engine sprites + tweens
- `chargen.ts` → output character sheets to atlas
- `lighting.ts` → use engine LightSystem (delete Phaser additive sprites)
- `effects.ts` → use engine ParticleSystem (delete Phaser emitters)
- `scene.ts` → agent sync, desk assignment, walking, status bubbles

**Deliverable:** Spectator link shows agents walking to desks, sitting
down, typing with monitor glow, status-colored lighting, emote bubbles.
Day/night cycle running. Particles for task completion celebrations.

**Conversion metric:** Time spent on spectator page. Signup rate from
spectator → auth.

### Phase 3: Full Gameplay (Weeks 5-6)

**Goal:** Authenticated users can play the game — move, interact, hire,
assign tasks. Feature parity with core Phaser loop.

**Build:**
- Complete `input.ts` — touch, pinch-zoom, pan, tap-to-walk
- Camera mode transitions (top-down ↔ diorama)
- Onboarding cinematic (camera swoop, lights turning on)

**Port:**
- `scene.ts` → player movement, interaction system, build mode, all
  interactables (fridge, cooler, clock, wardrobe, trophy, board, etc.)
- `furniture.ts` → procedural furniture drawing to engine graphics
- `workshop.ts` → expedition workshop items
- `hud.ts (game/)` → in-game HUD (compass, minimap, health bar, damage
  numbers)
- `path.ts` → expand to 6-directional hex pathfinding
- `main.ts` → boot engine instead of Phaser

**Deliverable:** Full office gameplay. Camera starts in diorama mode,
switches to top-down for building/editing. All interactables work.
Onboarding cinematic plays for new users.

**Conversion metric:** Signup → first agent hire completion rate.
Payment wall conversion rate.

### Phase 4: World & Combat (Weeks 7-8)

**Goal:** The outside world rendered as elevated hex terrain with biomes,
creatures, and combat.

**Build:**
- Elevated hex tile rendering (side walls for cliffs/plateaus)
- Biome-specific tile textures and lighting
- World chunk system adapted to hex grid

**Port:**
- `world.ts` → chunk loading/unloading, creature rendering, combat,
  golf, tennis, flower picking, ghost NPCs
- `worldgen.ts` → adapt tile generation from square to hex grid
  (biome rules stay the same, just hex topology)
- `worldgen.worker.ts` → unchanged (pure math, just hex output)

**Deliverable:** Walk out the office door into elevated hex terrain.
Creatures roam, combat works, expeditions feel epic with 3D terrain
and biome lighting.

**Conversion metric:** Session length. Return rate (day 2 retention).

### Phase 5: Multiplayer & Polish (Weeks 9-10)

**Goal:** Full feature parity with current Phaser build.

**Port:**
- Remote player sprites + name labels
- Voice chat integration (VoiceManager)
- Screen share integration (ScreenShareManager)
- Webcam integration (WebcamManager)
- Helicopter delivery cinematic
- Portal system
- All achievements
- Spectator mode final polish (auto-tour visits world, follows active
  agents, shows their task captions)

**Polish:**
- Performance profiling (target 60fps with 50+ sprites + 32 lights)
- Mobile optimization (reduce particle count, simplify DOF on mobile)
- Bundle size audit (confirm <80KB gzipped for engine)
- Cross-browser testing (Chrome, Firefox, Safari, Edge)

**Deliverable:** Drop-in replacement for Phaser. Remove Phaser from
`package.json`. Full feature parity. Smaller bundle. Better visuals.

**Conversion metric:** A/B test old Phaser build vs new engine on
spectator → signup conversion.

---

## 7. Hex Grid Migration Details

### 7.1 Office Map

The office currently uses a Tiled JSON map with square tiles (30×20 grid,
64px tiles). Migration options:

**Option A: Keep office as square grid, world as hex (recommended for v1)**
- Office stays square — minimal disruption to furniture/desk layout
- World outside uses hex grid
- Transition at the office door: square tiles → hex tiles
- The tile batcher supports both geometries (square is just a degenerate
  hex with 4 neighbors)

**Option B: Full hex conversion**
- Office rebuilt as hex grid
- All furniture/desk positions converted from (x, y) to (q, r)
- More visually consistent but requires re-authoring the office map
- Do this in Phase 4 or post-launch

### 7.2 Pathfinding Changes (`path.ts`)

Current 4-directional A* → 6-directional hex A*:

```typescript
// Current
const NEIGHBORS = [[1,0],[-1,0],[0,1],[0,-1]];
function heuristic(a, b) { return Math.abs(a.x-b.x) + Math.abs(a.y-b.y); }

// New (hex)
const HEX_NEIGHBORS = [[+1,0],[-1,0],[0,+1],[0,-1],[+1,-1],[-1,+1]];
function heuristic(a, b) {
  return (Math.abs(a.q-b.q) + Math.abs(a.r-b.r)
        + Math.abs((-a.q-a.r)-(-b.q-b.r))) / 2;
}
```

The Grid class changes from `walkable[y][x]` to `walkable[r][q]`.
The `findPath` algorithm itself is unchanged — just the neighbor list
and heuristic.

### 7.3 Tile Coordinate Migration

All `Tile { x, y }` references become `Hex { q, r }`. This affects:
- `agent.ts` — `tileOf()`, `feetOf()`, seat/desk positions
- `scene.ts` — all interactable tile positions (fridge, cooler, etc.)
- `world.ts` — chunk coordinates, creature positions
- `path.ts` — Grid and findPath

A type alias `type Hex = { q: number; r: number }` with helper functions
eases the transition. Search-and-replace `Tile` → `Hex` is mechanical.

---

## 8. Shader Porting Details

### 8.1 Bloom (from `shaders.ts:16-56`)

The existing `BLOOM_FRAGMENT` GLSL is already raw fragment shader code.
Extraction:
1. Remove `uniform sampler2D uMainSampler` — replace with our FBO input texture
2. Keep all uniform declarations
3. Compile as a standalone WebGL2 program
4. Render fullscreen triangle with input FBO bound

**Changes:** None to the GLSL. Only the wrapper changes from
`Phaser.Renderer.WebGL.Pipelines.PostFXPipeline` to direct FBO binding.

### 8.2 Color Grade (from `shaders.ts:90-127`)

Same extraction. The `uTime` uniform is already used for subtle animation.
The ACES tone mapping and split-tone grading are unchanged.

### 8.3 Tilt-Shift DOF (from `shaders.ts:155-200`)

**Modified** from the existing DOF shader:
- Current: radial blur from screen center
- New: horizontal band focus (tilt-shift) for diorama mode
- Add a `uniform int uMode` (0 = radial, 1 = tilt-shift band)
- In tilt-shift mode, blur increases with vertical distance from a
  configurable focus center

### 8.4 Lighting Shader (new, replaces `lighting.ts`)

Written into the tile and sprite fragment shaders directly:

```glsl
// In tile/sprite fragment shader
uniform vec3 uAmbient;
uniform int uLightCount;
uniform vec3 uLightPos[32];
uniform vec3 uLightColor[32];
uniform float uLightRadius[32];
uniform float uLightIntensity[32];

vec3 applyLighting(vec3 albedo, vec2 worldPos) {
  vec3 color = uAmbient * albedo;
  for (int i = 0; i < 32; i++) {
    if (i >= uLightCount) break;
    float dist = distance(worldPos, uLightPos[i].xy);
    float atten = 1.0 - smoothstep(0.0, uLightRadius[i], dist);
    color += uLightColor[i] * albedo * atten * uLightIntensity[i];
  }
  return clamp(color, 0.0, 1.0);
}
```

This replaces:
- `LightingSystem` class with additive sprites (`lighting.ts`)
- `dayNightTint` rectangle overlay
- `ambientDarkness` rectangle overlay
- `brightnessBoost` rectangle overlay
- Per-light `Phaser.GameObjects.Image` with additive blend

All of that becomes one uniform array upload + shader math.

---

## 9. Testing Strategy

### 9.1 Engine Unit Tests

```
tests/
  engine/
    hexgrid.test.ts        Hex math: conversion, neighbors, distance, rounding
    camera.test.ts         Projection matrices, screen-to-world, mode transitions
    path-hex.test.ts       6-directional A* on hex grid
    texture-atlas.test.ts  Packing, UV registration, no overlaps
    tween.test.ts          Easing functions, yoyo, onComplete callbacks
```

### 9.2 Visual Regression

- Screenshot the spectator mode at fixed camera positions
- Compare against baseline after each change
- Automated via Playwright: `page.goto('/?spectator=1')` → screenshot

### 9.3 Performance Benchmarks

- Target: 60fps with 50 sprites + 32 lights + 200 particles + full postfx
- Measure: `performance.now()` around each render pass
- Profile: Chrome DevTools GPU profiler
- Mobile target: 30fps with reduced particles + simplified DOF

### 9.4 Migration Verification

For each phase, verify feature parity:
- Phase 2: Agent count, desk assignment, status colors, emotes
- Phase 3: All interactables (fridge, cooler, clock, wardrobe, etc.)
- Phase 4: Creature spawning, combat damage, biome transitions
- Phase 5: Remote players, voice, screen share, helicopter cinematic

---

## 10. Risk Mitigation

| Risk | Mitigation |
|---|---|
| `scene.ts` is 339KB — huge rewrite | Phase the rewrite: spectator first (no interaction), then agents, then full gameplay. Never rewrite the whole file at once. |
| Hex grid breaks existing office layout | Option A: keep office as square grid in v1. Hex only for world. |
| WebGL2 not supported on older devices | WebGL2 has 96%+ browser support (caniuse). Fallback: show "please update your browser" message. No WebGL1 fallback — not worth the effort. |
| Performance regression during migration | Keep Phaser build on a branch. A/B test. Roll back if metrics drop. |
| Post-processing too heavy on mobile | Detect mobile GPU → disable DOF, reduce bloom samples, lower particle cap. Feature flag per device class. |
| Texture atlas too small | Start at 2048². If overflow, expand to 4096² (16MB — still fine for modern GPUs). |
| Camera mode transition (ortho ↔ persp) | **Solved:** Use a single perspective frustum with animated FOV + distance. Top-down = far camera + wide FOV (parallax flattens). No ortho/persp matrix blend. |
| Texture atlas fragmentation | **Solved:** Skyline packing instead of shelf packing. Defragmentation pass during scene transitions if needed. |
| Geometry shaders for tile side walls | **Solved:** WebGL2 has no geometry shaders. Use second instanced pass with 6 edge directions per hex. |

---

## 11. The Thread System (Loom-Inspired Compositional Magic)

### Design Philosophy

Inspired by Loom (1990): magic is a **language**, not a button. Instead of
hardcoding 50 tool calls to 50 visual effects, we define 8 fundamental
**threads** (forces of computation) and compose them into **drafts**
(sequences) that manifest as visible spells. The effect emerges from the
composition, not from a lookup table.

### The 8 Threads

| Thread | Note | Computational Primitive | Visual Signature |
|---|---|---|---|
| **Open** | C | Read / access / connect | Unfolding — portals part, files unfurl, doors open |
| **Close** | D | Terminate / disconnect / seal | Folding inward — barriers close, connections sever |
| **Weave** | E | Create / write / compose | Threads interlace — objects materialize from interwoven light |
| **Unweave** | F | Delete / remove / destroy | Threads unravel — objects dissolve into scattered filaments |
| **Dye** | G | Transform / convert / compile | Color washes through — object changes nature |
| **Spin** | A | Execute / run / compute | Rotation accelerates — energy spirals, output radiates |
| **Stretch** | B | Extend / scale / deploy | Lines extend outward — reach grows, domain expands |
| **Twist** | (sharp) | Refactor / restructure | Object reshapes — same material, new form |

### Drafts (Compositions)

A draft is a sequence of threads. The engine composes the visual effect
by playing each thread's base animation in sequence with overlap.

**Critical: decouple initiation from resolution.** Complex tool calls
(`npm install`) can take 10+ seconds. If the visual spell completes in
1.2s, the visual disconnects from the computation. The draft has three
phases:

1. **Initiation** (0-1.2s): Agent plays the opening threads (Weave →
   Spin → Stretch). Aura flares, distaff glows, environment reacts.
2. **Execution State** (until server responds): Agent remains in a
   "casting state" — subtle looping animation of the final thread
   (e.g., energy slowly spiraling). The distaff pulses. This can last
   indefinitely.
3. **Resolution** (0.8s): When the server returns success/failure:
   - Success: closing animation plays — object materializes fully,
     light radiates outward, aura brightens.
   - Error: threads snap — sparks fly, aura flickers red, agent recoils.

This keeps the visual synchronized with the actual computation time.

```typescript
type Thread = "open" | "close" | "weave" | "unweave" | "dye" | "spin" | "stretch" | "twist";
type Draft = Thread[];

// Tool calls map to draft compositions
const TOOL_DRAFTS: Record<string, Draft> = {
  "read_file":      ["open"],
  "write_file":     ["weave"],
  "execute_bash":   ["spin"],
  "search_web":     ["open", "stretch"],
  "npm_install":    ["weave", "spin", "stretch"],
  "git_push":       ["spin", "stretch", "open"],
  "git_revert":     ["twist", "spin_reverse"],  // reverse = unwind
  "delete_file":    ["unweave"],
  "compile":        ["dye", "spin"],
  "refactor":       ["twist"],
  "list_directory": ["open", "open"],           // deeper access
  "grep_search":    ["open", "stretch", "dye"], // reach + transform result
};
```

### Reversibility (Loom's Core Mechanic)

Playing a draft backward **undoes** the spell. This maps directly to
computation:

| Forward Spell | Reverse Spell | Computation |
|---|---|---|
| Weave (create file) | Unweave (delete file) | `touch` / `rm` |
| Open (read) | Close (seal) | `cat` / `chmod 000` |
| Spin (execute) | Reverse Spin (halt) | `node script.js` / `kill -9` |
| Stretch (deploy) | Reverse Stretch (retract) | `docker up` / `docker down` |
| Dye (compile) | Reverse Dye (decompile) | `tsc` / source maps |
| Twist (refactor) | Reverse Twist (un-refactor) | `git commit` / `git revert` |

When an agent runs `git revert`, the engine plays a **mirrored reversal
effect** — not a time-reversed playback of the original particle system
(which would require storing large history buffers).

Instead, spawn a new effect that mirrors the forward effect:
- Forward Spin: Energy spirals inward, then radiates outward.
- Reverse Spin: Energy rushes inward from the periphery, then spirals
  down into the distaff.

This achieves the visual narrative of "undoing" without the CPU cost of
state history. The reversal is a new draft manifestation, not a rewind.

### The Distaff (Agent's Instrument)

In Loom, the distaff is the magical instrument. In AgentHeights:

- **The distaff = the agent's connected tools and capabilities**
- An agent with no MCP tools has a small, quiet distaff — basic drafts only
- An agent with GitHub MCP, browser tool, API keys has a **richer instrument** — more threads available, more complex drafts
- Connecting a new MCP server visibly grows the distaff — a new thread glows with potential
- The distaff is rendered as a physical object the agent holds — their wand/staff, visible in the diorama

### Learning Drafts

- New agents start with basic threads (Weave, Spin, Open — file I/O + execution)
- First successful use of a new tool → brief cinematic where the tool's pattern inscribes itself on the distaff
- Agent handoffs → inheriting agent's learned drafts (visual ritual)
- User connecting an MCP server → ceremony where a new thread is inscribed

### Thread Visual Effects

Each thread has a **base particle pattern + light behavior + shape morph**.
The engine composes them with temporal overlap (~200ms stagger):

```
Weave:   Two streams of light cross and interlace → object materializes
Unweave: Object's filaments separate and scatter → dissolves
Open:    Surface splits along a seam → reveals interior / portal
Close:   Surfaces fold together → seam seals
Dye:     Color wave propagates through object → nature changes
Spin:    Energy spirals inward then radiates outward → execution result
Stretch: Lines extend from agent outward → reach grows
Twist:   Object rotates and reshapes → same material, new form
```

The agent's **aura color** (determined by their primary language) tints
all thread effects. Python = blue threads, Rust = orange, TypeScript =
blue-white. Same draft, different aesthetic per agent.

### Implementation (`threads.ts` + `spell-library.ts`)

```typescript
// threads.ts — fundamental force definitions
interface ThreadEffect {
  particles: ParticlePattern;    // spawn pattern for particles
  light: LightBehavior;          // temporary light source behavior
  duration: number;              // base duration in ms
  shape: ShapeMorph;             // how affected objects transform
}

const THREAD_EFFECTS: Record<Thread, ThreadEffect> = { ... };

// spell-library.ts — tool → draft mapping + manifestation
function manifestDraft(
  draft: Draft,
  position: Hex,
  agent: AgentState,
  engine: Engine,
): void {
  for (let i = 0; i < draft.length; i++) {
    const thread = draft[i];
    const delay = i * 200; // 200ms stagger between threads
    engine.tweens.delay(delay, () => {
      spawnThreadEffect(thread, position, agent.auraColor, agent.instrument);
    });
  }
}
```

---

## 12. The Domain System (Workspace as Physical Space)

### Design Philosophy

Each agent's workspace directory (`ag/workspace/<name>/`) IS their domain
in the virtual world. The engine watches the filesystem (via server
events) and manifests changes in real-time. The domain grows and shrinks
with the workspace.

### File → Object Mapping

| Filesystem Entity | Domain Representation |
|---|---|
| `package.json` | Foundation keystone — the domain's anchor |
| `src/` directory | Inner sanctum — where real work happens (a room) |
| `node_modules/` | Garden of summoned creatures (each package = small entity) |
| `.git/` | Vault of runes — history inscribed on walls |
| `README.md` | Signpost at domain entrance |
| Test files | Training dummies / practice targets |
| Config files | Control panels / levers |
| Large files | Towering structures |
| Empty directories | Unfurnished rooms (potential) |
| Symlinks | Portals to other domains |

### Domain Growth

The domain starts as a single hex tile (the agent's desk). As the agent
works:

- **File created** → new object materializes (Weave thread effect)
- **File deleted** → object dissolves (Unweave thread effect)
- **Directory created** → new room boundary grows (walls extend outward)
- **File modified** → object glows briefly (Dye thread effect)
- **Large codebase** → domain sprawls into a laboratory complex
- **Clean workspace** → domain is tidy, minimal, elegant
- **Messy workspace** → domain is cluttered, chaotic, alive

### Domain Visualization

- Each domain is a cluster of hex tiles around the agent's desk
- Objects sit on tiles — files are glowing documents, directories are
  room boundaries (visible as translucent walls)
- The domain's size is proportional to workspace file count
- The domain's complexity (directory depth) determines verticality —
  deep nested structures create towers
- Other agents can visit a domain (walk to it) and see the workspace
  made physical

### Domain Summarization (Scaling)

Real workspaces can contain hundreds of files. Rendering every file as
a physical object would overwhelm the scene and the GPU.

- **Depth limits:** Only render the first 2-3 levels of directory depth
  as physical rooms. Deeper structures are represented as "towers"
  (vertical elevation) rather than explorable rooms.
- **node_modules abstraction:** Do not render every package as a
  creature. Render the directory as a "summoning circle" with a counter
  (e.g., "247 summoned"). Expand individual packages only when inspected.
- **File size capping:** Cap the physical size of any single domain
  object to prevent a 100MB log file from becoming a skyscraper that
  blocks the camera. Max object height = 3 tiles. Beyond that, show a
  size indicator instead of scaling further.
- **Batched updates:** Domain layout changes are batched — the server
  sends a `domain_layout` message at most once per 2 seconds per agent,
  not on every file write.

### Implementation (`domain.ts`)

```typescript
interface DomainObject {
  id: string;              // file path
  type: "file" | "directory" | "symlink";
  position: Hex;           // position in domain
  size: number;            // file size → object scale
  modifiedAt: number;      // last modification time
  glowIntensity: number;   // fades after modification
}

class DomainManager {
  private domains: Map<string, Domain>;  // agentId → Domain

  // Called when server reports filesystem changes
  onFileEvent(agentId: string, event: FileEvent): void;

  // Render domains that are visible on screen
  render(engine: Engine, camera: Camera): void;
}
```

---

## 13. World Mutation Protocol

### Design Philosophy

The server already streams agent tool calls and results via WebSocket.
The engine interprets these as **world mutations** — structured events
that manifest as visual changes. This is the bridge between computation
and the symbolic realm.

### Message Types

Extended `ServerMsg` types added to the existing protocol:

```typescript
type WorldMutationMsg =
  | { type: "spell"; agentId: string; tool: string; draft: Draft;
      position: { q: number; r: number }; result: "success" | "error" }
  | { type: "domain_update"; agentId: string; event: FileEvent;
      path: string; fileType: "file" | "directory" }
  | { type: "aura_change"; agentId: string; language: string;
      intensity: number; pulse: "smooth" | "rapid" | "chaotic" }
  | { type: "distaff_growth"; agentId: string; newThread: Thread;
      toolName: string }
  | { type: "domain_layout"; agentId: string; files: FileNode[] };
```

### Server-Side Integration

The server already processes tool calls via the Cline SDK. For each tool
call event, it emits a `spell` mutation. For filesystem changes detected
in the agent's workspace, it emits `domain_update` mutations. The
mapping from tool name to draft is defined in a shared module so both
server and client agree on the semantics.

### Engine-Side Handling

```typescript
// In the scene's update loop
function handleMutation(msg: WorldMutationMsg): void {
  switch (msg.type) {
    case "spell":
      spellLibrary.manifestDraft(msg.draft, msg.position, agent, engine);
      if (msg.result === "error") spawnErrorEffect(msg.position);
      break;
    case "domain_update":
      domainManager.onFileEvent(msg.agentId, msg.event, msg.path);
      break;
    case "aura_change":
      agent.setAura(msg.language, msg.intensity, msg.pulse);
      break;
    case "distaff_growth":
      agent.learnThread(msg.newThread, msg.toolName);
      break;
    case "domain_layout":
      domainManager.setLayout(msg.agentId, msg.files);
      break;
  }
}
```

---

## 14. Package Changes

### Remove from `package.json`
```
- "phaser": "^3.x.x"
```

### Add to `package.json`
```
+ "gl-matrix": "^3.4.3"
```

### Net dependency change
- Phaser: ~1.1MB minified (~380KB gzipped)
- gl-matrix: ~45KB minified (~15KB gzipped)
- **Savings: ~365KB gzipped**

---

## 15. Success Metrics

| Metric | Current (Phaser) | Target (HexStage) |
|---|---|---|
| Engine bundle (gzipped) | ~380KB | <20KB |
| Spectator → signup conversion | unknown | measure + improve |
| First paint time | ~2-3s (load Phaser) | <500ms |
| 60fps with 50 sprites + postfx | yes (Phaser) | yes (engine) |
| Visual uniqueness | "looks like a Phaser game" | "looks like AgentHeights" |
| Screenshot shareability | low (flat 2D) | high (diorama + bloom + DOF) |
| Agent work legibility | text logs only | visible spells + domains |
| World builds itself | no (fixed tilemap) | yes (agent-authored domains) |

---

## 16. Timeline Summary

| Phase | Weeks | Deliverable | Conversion Impact |
|---|---|---|---|
| 1. Engine Core + Spectator | 1-2 | Beautiful spectator link with diorama camera, **tween engine** | Shareability, first impression |
| 2. Agents + Thread System | 3-4 | Agents casting visible spells, aura system, distaff | Spectator → signup rate |
| 3. Full Gameplay + Domains | 5-6 | Playable game, agent domains growing with work | Signup → engagement rate |
| 4. World & Combat | 7-8 | Elevated hex terrain, expeditions, biome magic | Session length, retention |
| 5. Multiplayer & Polish | 9-10 | Feature parity, Phaser removed, A/B test | Final conversion validation |
| 6. Domain Depth + Spell Polish | 11-12 | Full file→object mapping, reversibility, learning drafts | Long-term retention, virality |

Total: 12 weeks. Spectator link shippable in week 2. Full replacement in week 10. Domain + spell depth in weeks 11-12.
