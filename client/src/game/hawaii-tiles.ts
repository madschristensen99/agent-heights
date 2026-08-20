/**
 * Hawaii — procedural tileset generator.
 *
 * Generates Canvas2D textures for the Hawaii beach pavilion tileset:
 * - Tile 0: white sand (floor)
 * - Tile 1: bamboo wall
 * - Tile 2: palm tree obstacle
 * - Tile 3: driftwood obstacle
 * - Tile 4: shells obstacle
 * - Tile 6: woven mat (door)
 * - Tile 7: volcanic rock
 * - Tile 8: dark stone (lava tubes)
 * - Tile 9: lava
 * - Tile 10: magma
 * - Tile 11: fire geyser
 * - Tile 12: coral
 * - Tile 13: sea anemone
 * - Tile 21: water (bayou/underwater)
 * - Tile 24: vine (jungle obstacle)
 * - Tile 37: steam vent
 * - Tile 39: bamboo stalk (jungle obstacle)
 *
 * Called from boot.ts when the hawaii theme is active.
 */

import Phaser from "phaser";

const TILE_PX = 64;

/* ---------- color helpers ---------- */

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

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- tile drawing functions ---------- */

/** Tile 0: white sand */
function drawSand(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, shade(0xe8d8a8, 0));
  grad.addColorStop(0.5, shade(0xf0e0b0, 5));
  grad.addColorStop(1, shade(0xe0d0a0, -5));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // grain texture
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0xd0c090, 0.2 + Math.random() * 0.2);
    ctx.fillRect(x, y, 1, 1);
  }
  // subtle ripple marks
  ctx.strokeStyle = hexRGBA(0xd8c898, 0.15);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    for (let x = 0; x < s; x += 4) {
      ctx.lineTo(x, s * 0.2 + i * s * 0.25 + Math.sin(x * 0.2) * 2);
    }
    ctx.stroke();
  }
}

/** Tile 1: bamboo wall */
function drawBambooWall(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.fillRect(0, 0, s, s);
  // vertical bamboo stalks
  const stalkW = s * 0.15;
  for (let i = 0; i < 6; i++) {
    const x = i * (stalkW + 2);
    const grad = ctx.createLinearGradient(x, 0, x + stalkW, 0);
    grad.addColorStop(0, shade(0x6a4a2a, -8));
    grad.addColorStop(0.5, shade(0x8a6a3a, 10));
    grad.addColorStop(1, shade(0x6a4a2a, -8));
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, stalkW, s);
    // segments
    ctx.strokeStyle = hexRGBA(0x4a3a1a, 0.5);
    ctx.lineWidth = 1;
    for (let j = 0; j < 5; j++) {
      ctx.beginPath();
      ctx.moveTo(x, j * s / 5);
      ctx.lineTo(x + stalkW, j * s / 5);
      ctx.stroke();
    }
  }
  // rope binding at top and bottom
  ctx.fillStyle = hexRGBA(0xb8905a, 0.4);
  ctx.fillRect(0, 0, s, 3);
  ctx.fillRect(0, s - 3, s, 3);
}

/** Tile 6: woven mat (door) */
function drawWovenMat(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  // mat
  ctx.fillStyle = shade(0x8a6a3a, 0);
  ctx.fillRect(s * 0.15, s * 0.15, s * 0.7, s * 0.7);
  // weave pattern
  ctx.strokeStyle = hexRGBA(0x6a4a2a, 0.4);
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.15, s * 0.15 + i * s * 0.09);
    ctx.lineTo(s * 0.85, s * 0.15 + i * s * 0.09);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.15 + i * s * 0.09, s * 0.15);
    ctx.lineTo(s * 0.15 + i * s * 0.09, s * 0.85);
    ctx.stroke();
  }
  // border
  ctx.strokeStyle = shade(0x6a4a2a, 0);
  ctx.lineWidth = 2;
  ctx.strokeRect(s * 0.15, s * 0.15, s * 0.7, s * 0.7);
}

/** Tile 2: palm tree obstacle */
function drawPalmTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  ctx.fillStyle = shade(0x6a5a3a, 0);
  ctx.fillRect(s * 0.45, s * 0.4, 6, s * 0.4);
  ctx.fillStyle = shade(0x3a8a4a, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.translate(s * 0.48, s * 0.4);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.12, s * 0.03, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Tile 3: driftwood obstacle */
function drawDriftwoodTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  ctx.fillStyle = shade(0xa89878, 0);
  ctx.save();
  ctx.translate(s * 0.5, s * 0.5);
  ctx.rotate(0.3);
  ctx.fillRect(-s * 0.3, -4, s * 0.6, 8);
  ctx.restore();
  // texture lines
  ctx.strokeStyle = hexRGBA(0x887858, 0.4);
  ctx.lineWidth = 0.5;
  ctx.save();
  ctx.translate(s * 0.5, s * 0.5);
  ctx.rotate(0.3);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, i * 2);
    ctx.lineTo(s * 0.28, i * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Tile 4: shells obstacle */
function drawShellsTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  ctx.fillStyle = hexRGBA(0xf0d8c0, 0.7);
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.55, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.6, s * 0.5, 4, 0, Math.PI * 2);
  ctx.fill();
  // shell ridges
  ctx.strokeStyle = hexRGBA(0xd8b898, 0.5);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.55, 3, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.6, s * 0.5, 2.5, 0, Math.PI);
  ctx.stroke();
}

/** Tile 7: volcanic rock */
function drawVolcanicRock(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0x3a2a2a, 0);
  ctx.fillRect(0, 0, s, s);
  // texture
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0x2a1a1a, 0.3 + Math.random() * 0.2);
    ctx.fillRect(x, y, 2, 2);
  }
  // cracks with glow
  ctx.strokeStyle = hexRGBA(0xff6a2a, 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.3);
  ctx.lineTo(s * 0.5, s * 0.5);
  ctx.lineTo(s * 0.8, s * 0.4);
  ctx.stroke();
}

/** Tile 8: dark stone (lava tubes) */
function drawDarkStone(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0x2a2a2e, 0);
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0x1a1a1e, 0.3 + Math.random() * 0.2);
    ctx.fillRect(x, y, 2, 2);
  }
  // stalactite drips
  ctx.fillStyle = hexRGBA(0x3a3a3e, 0.4);
  ctx.fillRect(s * 0.2, 0, 3, s * 0.15);
  ctx.fillRect(s * 0.6, 0, 3, s * 0.1);
}

/** Tile 9: lava */
function drawLavaTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, rgba(255, 100, 20, 0.9));
  grad.addColorStop(0.5, rgba(255, 160, 30, 0.85));
  grad.addColorStop(1, rgba(200, 40, 10, 0.8));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // crust
  ctx.fillStyle = hexRGBA(0x3a2a1a, 0.3);
  ctx.fillRect(s * 0.1, s * 0.3, s * 0.2, 4);
  ctx.fillRect(s * 0.6, s * 0.6, s * 0.2, 4);
  // glow
  ctx.fillStyle = hexRGBA(0xff8a3a, 0.1);
  ctx.fillRect(0, 0, s, s);
}

/** Tile 10: magma */
function drawMagmaTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createRadialGradient(s * 0.5, s * 0.5, 2, s * 0.5, s * 0.5, s * 0.5);
  grad.addColorStop(0, rgba(255, 200, 40, 0.95));
  grad.addColorStop(0.5, rgba(255, 100, 20, 0.9));
  grad.addColorStop(1, rgba(180, 30, 10, 0.85));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // bubbles
  ctx.fillStyle = hexRGBA(0xffee88, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.6, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 11: fire geyser */
function drawFireGeyserTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawVolcanicRock(ctx, s);
  // geyser
  ctx.fillStyle = hexRGBA(0xff6a2a, 0.6);
  ctx.beginPath();
  ctx.moveTo(s * 0.4, s);
  ctx.lineTo(s * 0.5, s * 0.1);
  ctx.lineTo(s * 0.6, s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hexRGBA(0xffaa3a, 0.4);
  ctx.beginPath();
  ctx.moveTo(s * 0.45, s);
  ctx.lineTo(s * 0.5, s * 0.2);
  ctx.lineTo(s * 0.55, s);
  ctx.closePath();
  ctx.fill();
}

/** Tile 12: coral */
function drawCoralTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  ctx.fillStyle = hexRGBA(0xe88a7a, 0.7);
  // branching coral
  ctx.fillRect(s * 0.3, s * 0.4, 4, s * 0.3);
  ctx.fillRect(s * 0.3, s * 0.4, s * 0.1, 4);
  ctx.fillRect(s * 0.5, s * 0.5, 4, s * 0.2);
  ctx.fillRect(s * 0.5, s * 0.5, s * 0.08, 4);
  // dots
  ctx.fillStyle = hexRGBA(0xd86a5a, 0.5);
  ctx.beginPath();
  ctx.arc(s * 0.32, s * 0.42, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.52, s * 0.52, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 13: sea anemone */
function drawAnemoneTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  const cx = s * 0.5;
  const cy = s * 0.55;
  // base
  ctx.fillStyle = hexRGBA(0x8a5a8a, 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  // tentacles
  ctx.strokeStyle = hexRGBA(0xaa7aaa, 0.5);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
    ctx.stroke();
  }
}

/** Tile 21: water (bayou/underwater) */
function drawWaterTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, rgba(40, 80, 120, 0.85));
  grad.addColorStop(1, rgba(20, 50, 90, 0.9));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // ripples
  ctx.strokeStyle = hexRGBA(0x5a9ad5, 0.3);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(s * 0.3 + i * s * 0.2, s * 0.5, s * 0.1 + i * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Tile 24: vine (jungle obstacle) */
function drawVineTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  ctx.strokeStyle = shade(0x2a6a3a, 0);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.3, 0);
  ctx.quadraticCurveTo(s * 0.5, s * 0.3, s * 0.4, s * 0.6);
  ctx.quadraticCurveTo(s * 0.3, s * 0.8, s * 0.5, s);
  ctx.stroke();
  // leaves
  ctx.fillStyle = shade(0x3a8a4a, 0);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.3, 5, 3, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.35, s * 0.7, 5, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 37: steam vent */
function drawSteamVentTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawVolcanicRock(ctx, s);
  // vent hole
  ctx.fillStyle = hexRGBA(0x1a1a1a, 0.8);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.5, s * 0.08, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  // steam
  ctx.fillStyle = hexRGBA(0xdddddd, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.48, s * 0.35, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.52, s * 0.25, 7, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 39: bamboo stalk (jungle obstacle) */
function drawBambooStalkTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawSand(ctx, s);
  ctx.fillStyle = shade(0x8a6a3a, 0);
  ctx.fillRect(s * 0.4, s * 0.1, s * 0.12, s * 0.8);
  ctx.strokeStyle = hexRGBA(0x6a4a2a, 0.5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.4, s * 0.15 + i * s * 0.16);
    ctx.lineTo(s * 0.52, s * 0.15 + i * s * 0.16);
    ctx.stroke();
  }
  // leaf
  ctx.fillStyle = shade(0x3a8a4a, 0);
  ctx.beginPath();
  ctx.ellipse(s * 0.55, s * 0.2, 8, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- tileset generation ---------- */

const HAWAII_TILES: Record<number, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  0: drawSand,
  1: drawBambooWall,
  2: drawPalmTile,
  3: drawDriftwoodTile,
  4: drawShellsTile,
  6: drawWovenMat,
  7: drawVolcanicRock,
  8: drawDarkStone,
  9: drawLavaTile,
  10: drawMagmaTile,
  11: drawFireGeyserTile,
  12: drawCoralTile,
  13: drawAnemoneTile,
  21: drawWaterTile,
  24: drawVineTile,
  37: drawSteamVentTile,
  39: drawBambooStalkTile,
};

export function generateHawaiiTileset(scene: Phaser.Scene, key = "hawaii-tileset"): void {
  const tileIds = Object.keys(HAWAII_TILES).map(Number).sort((a, b) => a - b);
  const maxId = Math.max(...tileIds);
  const cols = 8;
  const rows = Math.ceil((maxId + 1) / cols);
  const atlasW = cols * TILE_PX;
  const atlasH = rows * TILE_PX;

  const canvasTex = scene.textures.createCanvas(key, atlasW, atlasH);
  if (!canvasTex) {
    console.error("[hawaii-tiles] Failed to create canvas texture");
    return;
  }
  const ctx = canvasTex.getContext();
  ctx.clearRect(0, 0, atlasW, atlasH);

  for (const tileId of tileIds) {
    const col = tileId % cols;
    const row = Math.floor(tileId / cols);
    const px = col * TILE_PX;
    const py = row * TILE_PX;
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.rect(0, 0, TILE_PX, TILE_PX);
    ctx.clip();
    HAWAII_TILES[tileId](ctx, TILE_PX);
    ctx.restore();
  }

  canvasTex.refresh();
  console.log(`[hawaii-tiles] Generated tileset with ${tileIds.length} tiles (${atlasW}x${atlasH})`);
}

export function generateHawaiiWorldTiles(scene: Phaser.Scene): void {
  const biomes = ["beach", "jungle", "volcanic_ridge", "lava_tubes", "underwater_cave", "volcano_summit"];
  const VARIANTS = 4;
  const frameSize = TILE_PX;
  const sheetW = frameSize * VARIANTS;
  const sheetH = frameSize * biomes.length;

  const canvasTex = scene.textures.createCanvas("world-tiles-theme", sheetW, sheetH);
  if (!canvasTex) {
    console.error("[hawaii-tiles] Failed to create world tiles canvas texture");
    return;
  }
  const ctx = canvasTex.getContext();

  const drawers: ((ctx: CanvasRenderingContext2D, s: number) => void)[] = [
    drawSand,           // beach
    drawVineTile,       // jungle
    drawVolcanicRock,   // volcanic_ridge
    drawDarkStone,      // lava_tubes
    drawWaterTile,      // underwater_cave
    drawLavaTile,       // volcano_summit
  ];

  for (let biome = 0; biome < drawers.length; biome++) {
    for (let v = 0; v < VARIANTS; v++) {
      ctx.save();
      ctx.translate(v * frameSize, biome * frameSize);
      ctx.beginPath();
      ctx.rect(0, 0, frameSize, frameSize);
      ctx.clip();
      drawers[biome](ctx, frameSize);
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

  console.log(`[hawaii-tiles] Generated world tiles spritesheet with ${biomes.length} biomes × ${VARIANTS} variants = ${biomes.length * VARIANTS} frames`);
}
