/**
 * Erics Alley — procedural tileset generator.
 *
 * Generates Canvas2D textures for the alley office tileset:
 * - Tile 0: cracked pavement (floor)
 * - Tile 1: brick wall
 * - Tile 2: dumpster obstacle
 * - Tile 3: crate obstacle
 * - Tile 4: trash pile obstacle
 * - Tile 6: manhole cover (door)
 * - Tile 8: asphalt with pothole
 * - Tile 9: lava crack
 * - Tile 10: crystal growth
 * - Tile 11: void rift
 * - Tile 12: ruin rubble
 * - Tile 13: castle/concrete debris
 *
 * Called from boot.ts when the alley theme is active.
 */

import Phaser from "phaser";

const TILE_PX = 64;

/* ---------- color helpers ---------- */

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

function shade(hex: number, amt: number): string {
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + amt));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (hex & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function hexRGBA(hex: number, a: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- tile drawing functions ---------- */

/** Tile 0: cracked pavement — dark concrete with cracks and oil stains */
function drawCrackedPavement(ctx: CanvasRenderingContext2D, s: number): void {
  // base
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, shade(0x3a3a3e, 0));
  grad.addColorStop(0.5, shade(0x42424a, 5));
  grad.addColorStop(1, shade(0x3a3a3e, -5));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);

  // noise speckles
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0x2a2a2e, 0.3 + Math.random() * 0.2);
    ctx.fillRect(x, y, 1, 1);
  }

  // cracks
  ctx.strokeStyle = hexRGBA(0x1a1a1e, 0.6);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.15);
  ctx.lineTo(s * 0.3, s * 0.4);
  ctx.lineTo(s * 0.25, s * 0.7);
  ctx.lineTo(s * 0.5, s * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.6, s * 0.1);
  ctx.lineTo(s * 0.7, s * 0.35);
  ctx.lineTo(s * 0.85, s * 0.55);
  ctx.stroke();

  // oil stain
  ctx.fillStyle = hexRGBA(0x1a1a1e, 0.2);
  ctx.beginPath();
  ctx.ellipse(s * 0.7, s * 0.6, s * 0.08, s * 0.05, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // subtle highlight
  ctx.fillStyle = hexRGBA(0x6a6a6e, 0.06);
  ctx.fillRect(0, 0, s, s * 0.3);
}

/** Tile 1: brick wall — red-brown bricks with mortar */
function drawBrickWall(ctx: CanvasRenderingContext2D, s: number): void {
  // mortar background
  ctx.fillStyle = shade(0x3a3a36, 0);
  ctx.fillRect(0, 0, s, s);

  const brickW = s * 0.28;
  const brickH = s * 0.14;
  const mortar = 2;

  for (let row = 0; row < 6; row++) {
    const y = row * (brickH + mortar);
    const offset = (row % 2) * (brickW / 2);
    for (let col = -1; col < 4; col++) {
      const x = col * (brickW + mortar) + offset;
      // brick color varies
      const variant = (row + col) % 3;
      const base = variant === 0 ? 0x7a4a3a : variant === 1 ? 0x6a3a2a : 0x8a5a4a;
      const grad = ctx.createLinearGradient(x, y, x, y + brickH);
      grad.addColorStop(0, shade(base, 8));
      grad.addColorStop(1, shade(base, -8));
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, brickW, brickH);

      // brick texture
      ctx.fillStyle = hexRGBA(0x4a2a1a, 0.15);
      ctx.fillRect(x + 2, y + 2, brickW - 4, 1);
    }
  }

  // grime at bottom
  ctx.fillStyle = hexRGBA(0x2a2a1e, 0.3);
  ctx.fillRect(0, s * 0.85, s, s * 0.15);

  // graffiti tag
  ctx.fillStyle = hexRGBA(0x9a3a5a, 0.4);
  ctx.font = "bold 8px sans-serif";
  ctx.fillText("AH", s * 0.35, s * 0.3);
}

/** Tile 6: manhole cover — metal circle with grid pattern */
function drawManholeCover(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;
  const cy = s * 0.5;
  const r = s * 0.38;

  // pavement around
  drawCrackedPavement(ctx, s);

  // manhole rim
  ctx.fillStyle = shade(0x2a2a2e, 0);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fill();

  // cover — dark metal
  const coverGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, r);
  coverGrad.addColorStop(0, shade(0x5a5a5e, 10));
  coverGrad.addColorStop(1, shade(0x2a2a2e, -10));
  ctx.fillStyle = coverGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // grid pattern on cover
  ctx.strokeStyle = hexRGBA(0x1a1a1e, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }

  // rust spots
  ctx.fillStyle = hexRGBA(0x8a4a2a, 0.3);
  ctx.beginPath();
  ctx.arc(cx - s * 0.1, cy + s * 0.08, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 8: asphalt with pothole */
function drawAsphaltPothole(ctx: CanvasRenderingContext2D, s: number): void {
  // base asphalt
  ctx.fillStyle = shade(0x2a2a2e, 0);
  ctx.fillRect(0, 0, s, s);

  // texture
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0x1a1a1e, 0.3 + Math.random() * 0.2);
    ctx.fillRect(x, y, 1, 1);
  }

  // pothole
  ctx.fillStyle = hexRGBA(0x0a0a0e, 0.8);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.55, s * 0.15, s * 0.1, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a4a4e, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.55, s * 0.15, s * 0.1, 0.2, 0, Math.PI * 2);
  ctx.stroke();

  // cracks radiating
  ctx.strokeStyle = hexRGBA(0x1a1a1e, 0.5);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(s * 0.5 + Math.cos(a) * s * 0.15, s * 0.55 + Math.sin(a) * s * 0.1);
    ctx.lineTo(s * 0.5 + Math.cos(a) * s * 0.3, s * 0.55 + Math.sin(a) * s * 0.2);
    ctx.stroke();
  }
}

/** Tile 9: lava crack — for hellmouth biome */
function drawLavaCrack(ctx: CanvasRenderingContext2D, s: number): void {
  // dark base
  ctx.fillStyle = shade(0x1a1a1e, 0);
  ctx.fillRect(0, 0, s, s);

  // lava crack
  const lavaGrad = ctx.createLinearGradient(0, s * 0.3, 0, s * 0.7);
  lavaGrad.addColorStop(0, rgba(255, 100, 20, 0.9));
  lavaGrad.addColorStop(0.5, rgba(255, 180, 40, 0.8));
  lavaGrad.addColorStop(1, rgba(200, 40, 10, 0.7));
  ctx.fillStyle = lavaGrad;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.5);
  ctx.lineTo(s * 0.25, s * 0.35);
  ctx.lineTo(s * 0.4, s * 0.55);
  ctx.lineTo(s * 0.55, s * 0.4);
  ctx.lineTo(s * 0.7, s * 0.6);
  ctx.lineTo(s * 0.9, s * 0.45);
  ctx.lineWidth = 6;
  ctx.strokeStyle = lavaGrad;
  ctx.stroke();

  // glow
  ctx.fillStyle = hexRGBA(0xff6a2a, 0.1);
  ctx.fillRect(0, 0, s, s);
}

/** Tile 2: dumpster obstacle (world tile) */
function drawDumpsterTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawCrackedPavement(ctx, s);
  // small dumpster silhouette
  ctx.fillStyle = shade(0x2a4a2a, 0);
  ctx.fillRect(s * 0.15, s * 0.25, s * 0.7, s * 0.55);
  ctx.fillStyle = shade(0x3a5a3a, 5);
  ctx.fillRect(s * 0.15, s * 0.2, s * 0.7, s * 0.08);
}

/** Tile 3: crate obstacle (world tile) */
function drawCrateTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawCrackedPavement(ctx, s);
  ctx.fillStyle = shade(0x9a7a4a, 0);
  ctx.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.5);
  ctx.strokeStyle = hexRGBA(0x6a5a3a, 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(s * 0.2, s * 0.3, s * 0.6, s * 0.5);
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.55);
  ctx.lineTo(s * 0.8, s * 0.55);
  ctx.stroke();
}

/** Tile 4: trash pile obstacle (world tile) */
function drawTrashPileTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawCrackedPavement(ctx, s);
  // scattered trash
  ctx.fillStyle = hexRGBA(0x6a5a3a, 0.6);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.6, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x8a7a5a, 0.5);
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.55, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x5a4a2a, 0.5);
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.65, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 10: crystal growth — for undercity biome */
function drawCrystalTile(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0x2a2a3e, 0);
  ctx.fillRect(0, 0, s, s);
  // crystals
  ctx.fillStyle = hexRGBA(0x6a8aff, 0.5);
  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.8);
  ctx.lineTo(s * 0.35, s * 0.4);
  ctx.lineTo(s * 0.4, s * 0.8);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x8aaaff, 0.4);
  ctx.beginPath();
  ctx.moveTo(s * 0.55, s * 0.85);
  ctx.lineTo(s * 0.6, s * 0.5);
  ctx.lineTo(s * 0.65, s * 0.85);
  ctx.fill();
}

/** Tile 11: void rift — for hellmouth biome */
function drawVoidRiftTile(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0x0a0a0e, 0);
  ctx.fillRect(0, 0, s, s);
  // purple rift
  ctx.fillStyle = hexRGBA(0x6a2aaa, 0.4);
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.1);
  ctx.lineTo(s * 0.5, s * 0.9);
  ctx.lineTo(s * 0.8, s * 0.1);
  ctx.fill();
}

/** Tile 12: ruin rubble — for abandoned biome */
function drawRubbleTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawCrackedPavement(ctx, s);
  ctx.fillStyle = shade(0x5a5a5e, 0);
  ctx.fillRect(s * 0.15, s * 0.5, s * 0.2, s * 0.2);
  ctx.fillRect(s * 0.5, s * 0.55, s * 0.25, s * 0.15);
  ctx.fillStyle = shade(0x4a4a4e, -5);
  ctx.fillRect(s * 0.4, s * 0.65, s * 0.15, s * 0.1);
}

/** Tile 13: concrete debris — for abandoned/undercity */
function drawDebrisTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawCrackedPavement(ctx, s);
  ctx.fillStyle = shade(0x6a6a6e, 0);
  ctx.beginPath();
  ctx.arc(s * 0.4, s * 0.55, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(0x5a5a5e, -5);
  ctx.beginPath();
  ctx.arc(s * 0.65, s * 0.6, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 20: water (sewer biome) */
function drawSewerWaterTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, rgba(30, 40, 30, 0.9));
  grad.addColorStop(1, rgba(20, 30, 20, 0.95));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // ripples
  ctx.strokeStyle = hexRGBA(0x4a6a4a, 0.3);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(s * 0.3 + i * s * 0.2, s * 0.5, s * 0.1 + i * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Tile 21: deep water (sewer biome) */
function drawDeepSewerTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, rgba(20, 25, 20, 0.95));
  grad.addColorStop(1, rgba(10, 15, 10, 0.98));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // bubbles
  ctx.fillStyle = hexRGBA(0x3a5a3a, 0.2);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.6, s * 0.6, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- tileset generation ---------- */

const ALLEY_TILES: Record<number, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  0: drawCrackedPavement,
  1: drawBrickWall,
  2: drawDumpsterTile,
  3: drawCrateTile,
  4: drawTrashPileTile,
  6: drawManholeCover,
  8: drawAsphaltPothole,
  9: drawLavaCrack,
  10: drawCrystalTile,
  11: drawVoidRiftTile,
  12: drawRubbleTile,
  13: drawDebrisTile,
  20: drawSewerWaterTile,
  21: drawDeepSewerTile,
};

/**
 * Generate the alley tileset as a Phaser canvas texture.
 * Creates a single image texture with tiles arranged in a grid.
 * The grid is 8 tiles wide (512px) with as many rows as needed.
 */
export function generateAlleyTileset(scene: Phaser.Scene, key = "alley-tileset"): void {
  const tileIds = Object.keys(ALLEY_TILES).map(Number).sort((a, b) => a - b);
  const maxId = Math.max(...tileIds);
  const cols = 8;
  const rows = Math.ceil((maxId + 1) / cols);
  const atlasW = cols * TILE_PX;
  const atlasH = rows * TILE_PX;

  const canvasTex = scene.textures.createCanvas(key, atlasW, atlasH);
  if (!canvasTex) {
    console.error("[alley-tiles] Failed to create canvas texture");
    return;
  }
  const ctx = canvasTex.getContext();

  // Clear
  ctx.clearRect(0, 0, atlasW, atlasH);

  // Draw each tile into its grid position
  for (const tileId of tileIds) {
    const col = tileId % cols;
    const row = Math.floor(tileId / cols);
    const px = col * TILE_PX;
    const py = row * TILE_PX;

    ctx.save();
    ctx.translate(px, py);
    // Draw into a clipped 64x64 region
    ctx.beginPath();
    ctx.rect(0, 0, TILE_PX, TILE_PX);
    ctx.clip();
    ALLEY_TILES[tileId](ctx, TILE_PX);
    ctx.restore();
  }

  canvasTex.refresh();
  console.log(`[alley-tiles] Generated tileset with ${tileIds.length} tiles (${atlasW}x${atlasH})`);
}

/**
 * Generate the world tile spritesheet for the 6 alley biomes.
 * Each biome gets one 64x64 frame in the spritesheet.
 * Frame indices match the biome order in worldgen.biomes.
 */
export function generateAlleyWorldTiles(scene: Phaser.Scene): void {
  const biomes = ["alley", "street", "abandoned", "undercity", "sewer", "hellmouth"];
  const VARIANTS = 4;
  const frameSize = TILE_PX;
  const sheetW = frameSize * VARIANTS;
  const sheetH = frameSize * biomes.length;

  const canvasTex = scene.textures.createCanvas("world-tiles-theme", sheetW, sheetH);
  if (!canvasTex) {
    console.error("[alley-tiles] Failed to create world tiles canvas texture");
    return;
  }
  const ctx = canvasTex.getContext();

  const drawers: ((ctx: CanvasRenderingContext2D, s: number) => void)[] = [
    drawCrackedPavement,   // alley
    drawAsphaltPothole,    // street
    drawRubbleTile,        // abandoned
    drawCrystalTile,       // undercity
    drawSewerWaterTile,    // sewer
    drawLavaCrack,         // hellmouth
  ];

  for (let biome = 0; biome < drawers.length; biome++) {
    for (let v = 0; v < VARIANTS; v++) {
      ctx.save();
      ctx.translate(v * frameSize, biome * frameSize);
      ctx.beginPath();
      ctx.rect(0, 0, frameSize, frameSize);
      ctx.clip();
      drawers[biome](ctx, frameSize);
      // Variant overlay: subtle tint shift + extra noise speckles for visual variety
      const tintShift = (v - 1.5) * 6;
      ctx.fillStyle = `rgba(${tintShift > 0 ? tintShift : 0},${tintShift > 0 ? tintShift : 0},${tintShift > 0 ? tintShift : 0},${0.04})`;
      ctx.fillRect(0, 0, frameSize, frameSize);
      if (tintShift < 0) {
        ctx.fillStyle = `rgba(0,0,0,${Math.abs(tintShift) * 0.0015})`;
        ctx.fillRect(0, 0, frameSize, frameSize);
      }
      for (let n = 0; n < 8 + v * 4; n++) {
        ctx.fillStyle = `rgba(${20 + Math.random() * 30},${20 + Math.random() * 30},${20 + Math.random() * 30},${0.08 + Math.random() * 0.1})`;
        ctx.fillRect(Math.random() * frameSize, Math.random() * frameSize, 1, 1);
      }
      ctx.restore();
    }
  }

  canvasTex.refresh();

  // Register individual frames so Phaser's Texture.get(frameIndex) works
  for (let b = 0; b < biomes.length; b++) {
    for (let v = 0; v < VARIANTS; v++) {
      canvasTex.add(b * VARIANTS + v, 0, v * frameSize, b * frameSize, frameSize, frameSize);
    }
  }

  console.log(`[alley-tiles] Generated world tiles spritesheet with ${biomes.length} biomes × ${VARIANTS} variants = ${biomes.length * VARIANTS} frames`);
}
