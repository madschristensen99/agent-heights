/**
 * Old South — procedural tileset generator.
 *
 * Generates Canvas2D textures for the Old South plantation tileset:
 * - Tile 0: manicured grass (garden floor)
 * - Tile 1: white column wall
 * - Tile 2: hedge obstacle
 * - Tile 3: fountain obstacle
 * - Tile 4: bench obstacle
 * - Tile 5: spectral soldier (hostile)
 * - Tile 6: wooden door
 * - Tile 7: pine needles (pine forest floor)
 * - Tile 9: lava (infernal)
 * - Tile 11: fire (infernal hostile)
 * - Tile 12: scorched earth (battlefield floor)
 * - Tile 13: cannon (battlefield obstacle)
 * - Tile 20: wooden fence (cotton field obstacle)
 * - Tile 21: murky water (bayou)
 * - Tile 22: cotton row (cotton field obstacle)
 * - Tile 24: fallen log (pine forest obstacle)
 * - Tile 28: scarecrow (garden obstacle)
 * - Tile 37: trench (battlefield obstacle)
 *
 * Called from boot.ts when the old-south theme is active.
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

/** Tile 0: manicured grass (garden) */
function drawGrassTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, shade(0x5a8a3a, 0));
  grad.addColorStop(0.5, shade(0x6a9a4a, 5));
  grad.addColorStop(1, shade(0x4a7a2a, -5));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // grass blades
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0x3a6a2a, 0.2 + Math.random() * 0.2);
    ctx.fillRect(x, y, 1, 2);
  }
  // manicured lines
  ctx.strokeStyle = hexRGBA(0x3a6a2a, 0.1);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.25 + i * s * 0.25);
    ctx.lineTo(s, s * 0.25 + i * s * 0.25);
    ctx.stroke();
  }
}

/** Tile 1: white column wall */
function drawColumnWall(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0xe8e4d8, 0);
  ctx.fillRect(0, 0, s, s);
  // columns
  const colW = s * 0.2;
  for (let i = 0; i < 4; i++) {
    const x = i * (colW + 2);
    const grad = ctx.createLinearGradient(x, 0, x + colW, 0);
    grad.addColorStop(0, shade(0xd8d4c8, -5));
    grad.addColorStop(0.5, shade(0xf0ece0, 8));
    grad.addColorStop(1, shade(0xd8d4c8, -5));
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, colW, s);
    // fluting lines
    ctx.strokeStyle = hexRGBA(0xc8c4b8, 0.3);
    ctx.lineWidth = 0.5;
    for (let j = 1; j < 3; j++) {
      ctx.beginPath();
      ctx.moveTo(x + j * colW / 3, 0);
      ctx.lineTo(x + j * colW / 3, s);
      ctx.stroke();
    }
  }
  // base molding
  ctx.fillStyle = shade(0xd0ccc0, 0);
  ctx.fillRect(0, s - 4, s, 4);
  ctx.fillRect(0, 0, s, 3);
}

/** Tile 6: wooden door */
function drawWoodenDoor(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  // door frame
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.fillRect(s * 0.2, s * 0.1, s * 0.6, s * 0.8);
  // door panels
  ctx.fillStyle = shade(0x8a6a3a, 0);
  ctx.fillRect(s * 0.22, s * 0.12, s * 0.56, s * 0.76);
  // panel insets
  ctx.strokeStyle = hexRGBA(0x5a3a1a, 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(s * 0.26, s * 0.18, s * 0.48, s * 0.28);
  ctx.strokeRect(s * 0.26, s * 0.52, s * 0.48, s * 0.28);
  // handle
  ctx.fillStyle = shade(0xd4a838, 0);
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.5, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 2: hedge obstacle */
function drawHedgeTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  ctx.fillStyle = shade(0x3a6a2a, 0);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.4, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.45, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.4, 10, 0, Math.PI * 2);
  ctx.fill();
  // highlights
  ctx.fillStyle = hexRGBA(0x5a8a3a, 0.4);
  ctx.beginPath();
  ctx.arc(s * 0.28, s * 0.38, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.53, s * 0.42, 6, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 3: fountain obstacle */
function drawFountainTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  const cx = s * 0.5;
  const cy = s * 0.5;
  // basin
  ctx.fillStyle = shade(0x8a8a7a, 0);
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();
  // water
  ctx.fillStyle = hexRGBA(0x5a9ad5, 0.5);
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  // center pillar
  ctx.fillStyle = shade(0x8a8a7a, 0);
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  // water splash
  ctx.fillStyle = hexRGBA(0x8abad5, 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 4: bench obstacle */
function drawBenchTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  ctx.fillStyle = shade(0x8a6a3a, 0);
  ctx.fillRect(s * 0.2, s * 0.45, s * 0.6, 4);
  // legs
  ctx.fillRect(s * 0.22, s * 0.49, 3, s * 0.2);
  ctx.fillRect(s * 0.75, s * 0.49, 3, s * 0.2);
  // back slats
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.fillRect(s * 0.22, s * 0.3, 2, s * 0.15);
  ctx.fillRect(s * 0.5, s * 0.3, 2, s * 0.15);
  ctx.fillRect(s * 0.76, s * 0.3, 2, s * 0.15);
}

/** Tile 5: spectral soldier (hostile) */
function drawSpectralSoldierTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  // ghostly figure
  ctx.fillStyle = hexRGBA(0xaaccee, 0.3);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.4, 8, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.28, 5, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = hexRGBA(0x4a8a4a, 0.5);
  ctx.beginPath();
  ctx.arc(s * 0.48, s * 0.27, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.52, s * 0.27, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // wispy bottom
  ctx.fillStyle = hexRGBA(0xaaccee, 0.15);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.6, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 7: pine needles (pine forest floor) */
function drawPineNeedleTile(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0x5a4a2a, 0);
  ctx.fillRect(0, 0, s, s);
  // needles
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0x4a3a1a, 0.2 + Math.random() * 0.3);
    ctx.fillRect(x, y, 1, 2);
  }
  // pine cones
  ctx.fillStyle = hexRGBA(0x3a2a0a, 0.4);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.4, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 9: lava (infernal) */
function drawLavaTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, rgba(255, 100, 20, 0.9));
  grad.addColorStop(0.5, rgba(255, 160, 30, 0.85));
  grad.addColorStop(1, rgba(200, 40, 10, 0.8));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = hexRGBA(0x3a2a1a, 0.3);
  ctx.fillRect(s * 0.1, s * 0.3, s * 0.2, 4);
  ctx.fillRect(s * 0.6, s * 0.6, s * 0.2, 4);
}

/** Tile 11: fire (infernal hostile) */
function drawFireTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  ctx.fillStyle = hexRGBA(0xff6a2a, 0.5);
  ctx.beginPath();
  ctx.moveTo(s * 0.35, s);
  ctx.lineTo(s * 0.4, s * 0.2);
  ctx.lineTo(s * 0.5, s * 0.1);
  ctx.lineTo(s * 0.6, s * 0.2);
  ctx.lineTo(s * 0.65, s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hexRGBA(0xffaa3a, 0.3);
  ctx.beginPath();
  ctx.moveTo(s * 0.42, s);
  ctx.lineTo(s * 0.47, s * 0.3);
  ctx.lineTo(s * 0.53, s * 0.3);
  ctx.lineTo(s * 0.58, s);
  ctx.closePath();
  ctx.fill();
}

/** Tile 12: scorched earth (battlefield) */
function drawScorchedTile(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = shade(0x4a3a2a, 0);
  ctx.fillRect(0, 0, s, s);
  // scorch marks
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = hexRGBA(0x2a1a0a, 0.3 + Math.random() * 0.3);
    ctx.fillRect(x, y, 2, 2);
  }
  // cracks
  ctx.strokeStyle = hexRGBA(0x2a1a0a, 0.4);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.3);
  ctx.lineTo(s * 0.5, s * 0.5);
  ctx.lineTo(s * 0.9, s * 0.4);
  ctx.stroke();
  // bone fragment
  ctx.fillStyle = hexRGBA(0xd8c8a8, 0.3);
  ctx.fillRect(s * 0.3, s * 0.7, 6, 2);
}

/** Tile 13: cannon (battlefield obstacle) */
function drawCannonTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawScorchedTile(ctx, s);
  // cannon barrel
  ctx.fillStyle = shade(0x2a2a2a, 0);
  ctx.save();
  ctx.translate(s * 0.5, s * 0.5);
  ctx.rotate(-0.2);
  ctx.fillRect(-s * 0.25, -4, s * 0.4, 8);
  ctx.restore();
  // wheels
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.6, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.6, 6, 0, Math.PI * 2);
  ctx.fill();
  // wheel spokes
  ctx.strokeStyle = hexRGBA(0x4a3a1a, 0.5);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.6, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.6, 3, 0, Math.PI * 2);
  ctx.stroke();
}

/** Tile 20: wooden fence (cotton field obstacle) */
function drawFenceTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  // fence rails
  ctx.fillStyle = shade(0x8a6a3a, 0);
  ctx.fillRect(s * 0.1, s * 0.4, s * 0.8, 3);
  ctx.fillRect(s * 0.1, s * 0.55, s * 0.8, 3);
  // posts
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.fillRect(s * 0.15, s * 0.3, 4, s * 0.35);
  ctx.fillRect(s * 0.5, s * 0.3, 4, s * 0.35);
  ctx.fillRect(s * 0.8, s * 0.3, 4, s * 0.35);
}

/** Tile 21: murky water (bayou) */
function drawMurkyWaterTile(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, rgba(50, 70, 40, 0.9));
  grad.addColorStop(1, rgba(30, 50, 25, 0.95));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // ripples
  ctx.strokeStyle = hexRGBA(0x6a8a5a, 0.2);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(s * 0.3 + i * s * 0.2, s * 0.5, s * 0.1 + i * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // lily pad
  ctx.fillStyle = hexRGBA(0x3a6a2a, 0.5);
  ctx.beginPath();
  ctx.ellipse(s * 0.6, s * 0.4, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 22: cotton row (cotton field obstacle) */
function drawCottonRowTile(ctx: CanvasRenderingContext2D, s: number): void {
  // tilled soil
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.fillRect(0, 0, s, s);
  // row
  ctx.fillStyle = shade(0x4a3a1a, 0);
  ctx.fillRect(s * 0.3, 0, s * 0.4, s);
  // cotton plants
  ctx.fillStyle = shade(0x3a7a3a, 0);
  ctx.fillRect(s * 0.35, s * 0.1, 4, s * 0.15);
  ctx.fillRect(s * 0.55, s * 0.1, 4, s * 0.15);
  ctx.fillRect(s * 0.35, s * 0.5, 4, s * 0.15);
  ctx.fillRect(s * 0.55, s * 0.5, 4, s * 0.15);
  // cotton bolls
  ctx.fillStyle = shade(0xf0ece4, 0);
  ctx.beginPath();
  ctx.arc(s * 0.37, s * 0.15, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.57, s * 0.15, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.37, s * 0.55, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.57, s * 0.55, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 24: fallen log (pine forest obstacle) */
function drawFallenLogTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawPineNeedleTile(ctx, s);
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.save();
  ctx.translate(s * 0.5, s * 0.5);
  ctx.rotate(0.4);
  ctx.fillRect(-s * 0.3, -5, s * 0.6, 10);
  ctx.restore();
  // bark texture
  ctx.strokeStyle = hexRGBA(0x4a3a1a, 0.4);
  ctx.lineWidth = 0.5;
  ctx.save();
  ctx.translate(s * 0.5, s * 0.5);
  ctx.rotate(0.4);
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, i * 2);
    ctx.lineTo(s * 0.28, i * 2);
    ctx.stroke();
  }
  ctx.restore();
  // moss
  ctx.fillStyle = hexRGBA(0x5a7a4a, 0.3);
  ctx.beginPath();
  ctx.ellipse(s * 0.4, s * 0.45, 4, 3, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 28: scarecrow (garden obstacle) */
function drawScarecrowTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawGrassTile(ctx, s);
  // post
  ctx.fillStyle = shade(0x6a4a2a, 0);
  ctx.fillRect(s * 0.48, s * 0.3, 4, s * 0.5);
  // crossbar
  ctx.fillRect(s * 0.3, s * 0.4, s * 0.4, 3);
  // head
  ctx.fillStyle = shade(0xc8a838, 0);
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.25, 6, 0, Math.PI * 2);
  ctx.fill();
  // straw hair
  ctx.strokeStyle = hexRGBA(0xa88828, 0.5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.45 + i * 3, s * 0.22);
    ctx.lineTo(s * 0.43 + i * 3, s * 0.3);
    ctx.stroke();
  }
  // eyes
  ctx.fillStyle = shade(0x2a2a2a, 0);
  ctx.fillRect(s * 0.47, s * 0.24, 2, 2);
  ctx.fillRect(s * 0.52, s * 0.24, 2, 2);
  // shirt
  ctx.fillStyle = hexRGBA(0x8a4a4a, 0.6);
  ctx.fillRect(s * 0.35, s * 0.35, s * 0.3, s * 0.2);
}

/** Tile 37: trench (battlefield obstacle) */
function drawTrenchTile(ctx: CanvasRenderingContext2D, s: number): void {
  drawScorchedTile(ctx, s);
  // trench
  ctx.fillStyle = shade(0x1a1a0a, 0);
  ctx.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.4);
  // sandbag edges
  ctx.fillStyle = hexRGBA(0x8a7a5a, 0.5);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(s * 0.25 + i * s * 0.15, s * 0.3, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.25 + i * s * 0.15, s * 0.7, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // dark interior
  ctx.fillStyle = hexRGBA(0x0a0a00, 0.5);
  ctx.fillRect(s * 0.25, s * 0.35, s * 0.5, s * 0.3);
}

/* ---------- tileset generation ---------- */

const SOUTH_TILES: Record<number, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  0: drawGrassTile,
  1: drawColumnWall,
  2: drawHedgeTile,
  3: drawFountainTile,
  4: drawBenchTile,
  5: drawSpectralSoldierTile,
  6: drawWoodenDoor,
  7: drawPineNeedleTile,
  9: drawLavaTile,
  11: drawFireTile,
  12: drawScorchedTile,
  13: drawCannonTile,
  20: drawFenceTile,
  21: drawMurkyWaterTile,
  22: drawCottonRowTile,
  24: drawFallenLogTile,
  28: drawScarecrowTile,
  37: drawTrenchTile,
};

export function generateSouthTileset(scene: Phaser.Scene, key = "south-tileset"): void {
  const tileIds = Object.keys(SOUTH_TILES).map(Number).sort((a, b) => a - b);
  const maxId = Math.max(...tileIds);
  const cols = 8;
  const rows = Math.ceil((maxId + 1) / cols);
  const atlasW = cols * TILE_PX;
  const atlasH = rows * TILE_PX;

  const canvasTex = scene.textures.createCanvas(key, atlasW, atlasH);
  if (!canvasTex) {
    console.error("[south-tiles] Failed to create canvas texture");
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
    SOUTH_TILES[tileId](ctx, TILE_PX);
    ctx.restore();
  }

  canvasTex.refresh();
  console.log(`[south-tiles] Generated tileset with ${tileIds.length} tiles (${atlasW}x${atlasH})`);
}

export function generateSouthWorldTiles(scene: Phaser.Scene): void {
  const biomes = ["garden", "cotton_field", "pine_forest", "bayou", "battlefield", "infernal"];
  const VARIANTS = 4;
  const frameSize = TILE_PX;
  const sheetW = frameSize * VARIANTS;
  const sheetH = frameSize * biomes.length;

  const canvasTex = scene.textures.createCanvas("world-tiles-theme", sheetW, sheetH);
  if (!canvasTex) {
    console.error("[south-tiles] Failed to create world tiles canvas texture");
    return;
  }
  const ctx = canvasTex.getContext();

  const drawers: ((ctx: CanvasRenderingContext2D, s: number) => void)[] = [
    drawGrassTile,        // garden
    drawCottonRowTile,    // cotton_field
    drawPineNeedleTile,   // pine_forest
    drawMurkyWaterTile,   // bayou
    drawScorchedTile,     // battlefield
    drawLavaTile,         // infernal
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

  console.log(`[south-tiles] Generated world tiles spritesheet with ${biomes.length} biomes × ${VARIANTS} variants = ${biomes.length * VARIANTS} frames`);
}
