/**
 * Old South — procedural furniture drawing functions.
 *
 * 19 Canvas2D drawing functions for the Old South plantation theme:
 * field plots, wooden stools, storage chests, cotton sprigs, shutter windows,
 * sweet tea pitchers, well pumps, rain barrels, smokehouse, cast iron stove,
 * porch swing, live oak, magnolia, horseshoe pit, smokehouse vent, brick chimney.
 *
 * Registered via registerThemeFurniture() on import.
 */

import { registerThemeFurniture } from "./furniture";

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function linearGrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  return g;
}

/* ---------- Old South color palette ---------- */

const WOOD = 0x8a6a3a;
const WOOD_DARK = 0x6a4a2a;
const WOOD_LIGHT = 0xa88a5a;
const WHITE_COLUMN = 0xe8e4d8;
const BRICK = 0x9a4a3a;
const BRICK_DARK = 0x7a3a2a;
const STONE = 0x8a8a7a;
const LEAF_GREEN = 0x3a7a3a;
const LEAF_DARK = 0x2a5a2a;
const COTTON_WHITE = 0xf0ece4;
const MAGNOLIA_CREAM = 0xf8f0e0;
const MOSS_GRAY = 0x8a9a7a;
const METAL = 0x8a8a8a;
const SWEET_TEA = 0xc8a838;
const STOVE_BLACK = 0x2a2a2a;
const SMOKE = 0x6a6a6a;

/* ---------- drawing functions ---------- */

/** Tile 17: Field plot left (desk left half — crop rows) */
function drawFieldPlotLeft(ctx: CanvasRenderingContext2D, s: number): void {
  // soil base
  const grad = linearGrad(ctx, 0, s * 0.2, 0, s * 0.8, [[0, shade(0x6a4a2a, 5)], [1, shade(0x4a3a1a, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, s * 0.2, s * 0.5, s * 0.6);
  // crop rows
  ctx.fillStyle = shade(LEAF_GREEN, 0);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(4 + i * 8, s * 0.3, 4, s * 0.4);
  }
  // cotton bolls
  ctx.fillStyle = shade(COTTON_WHITE, 0);
  ctx.beginPath();
  ctx.arc(6, s * 0.4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(14, s * 0.55, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(22, s * 0.45, 3, 0, Math.PI * 2);
  ctx.fill();
  // soil texture
  ctx.fillStyle = hexRGBA(0x3a2a0a, 0.2);
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(Math.random() * s * 0.5, s * 0.25 + Math.random() * s * 0.5, 1, 1);
  }
}

/** Tile 18: Field plot right (desk right half) */
function drawFieldPlotRight(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = linearGrad(ctx, s * 0.5, s * 0.2, s, s * 0.8, [[0, shade(0x6a4a2a, 5)], [1, shade(0x4a3a1a, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.5, s * 0.2, s * 0.5, s * 0.6);
  ctx.fillStyle = shade(LEAF_GREEN, 0);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(s * 0.52 + i * 8, s * 0.3, 4, s * 0.4);
  }
  ctx.fillStyle = shade(COTTON_WHITE, 0);
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.63, s * 0.35, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.71, s * 0.6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x3a2a0a, 0.2);
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(s * 0.5 + Math.random() * s * 0.5, s * 0.25 + Math.random() * s * 0.5, 1, 1);
  }
}

/** Tile 19: Wooden stool (chair) */
function drawWoodenStool(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  const cy = s * 0.5;
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 18, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // seat
  const grad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 14);
  grad.addColorStop(0, shade(WOOD_LIGHT, 5));
  grad.addColorStop(1, shade(WOOD_DARK, -5));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.fillStyle = shade(WOOD_DARK, 0);
  ctx.fillRect(cx - 10, cy, 3, 16);
  ctx.fillRect(cx + 7, cy, 3, 16);
  // crossbar
  ctx.fillRect(cx - 10, cy + 10, 20, 2);
}

/** Tile 20: Storage chest (filing cabinet) */
function drawStorageChest(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.fillRect(s * 0.15, s * 0.78, s * 0.7, 3);
  // body
  const grad = linearGrad(ctx, 0, s * 0.25, 0, s * 0.78, [[0, shade(WOOD, 8)], [1, shade(WOOD_DARK, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.15, s * 0.3, s * 0.7, s * 0.48);
  // lid
  ctx.fillStyle = shade(WOOD_LIGHT, 0);
  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.3);
  ctx.lineTo(s * 0.15, s * 0.22);
  ctx.lineTo(s * 0.85, s * 0.22);
  ctx.lineTo(s * 0.85, s * 0.3);
  ctx.closePath();
  ctx.fill();
  // iron bands
  ctx.fillStyle = shade(METAL, -15);
  ctx.fillRect(s * 0.15, s * 0.4, s * 0.7, 2);
  ctx.fillRect(s * 0.15, s * 0.65, s * 0.7, 2);
  // lock plate
  ctx.fillRect(s * 0.46, s * 0.35, s * 0.08, s * 0.08);
  // wood grain
  ctx.strokeStyle = hexRGBA(WOOD_DARK, 0.25);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.5);
  ctx.lineTo(s * 0.8, s * 0.5);
  ctx.stroke();
}

/** Tile 21: Cotton sprig (small plant) */
function drawCottonSprig(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  // stem
  ctx.strokeStyle = shade(LEAF_DARK, 0);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.85);
  ctx.lineTo(cx, s * 0.35);
  ctx.stroke();
  // leaves
  ctx.fillStyle = shade(LEAF_GREEN, 0);
  ctx.beginPath();
  ctx.ellipse(cx - 7, s * 0.6, 7, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 7, s * 0.65, 7, 3, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // cotton bolls
  ctx.fillStyle = shade(COTTON_WHITE, 0);
  ctx.beginPath();
  ctx.arc(cx, s * 0.35, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - 4, s * 0.42, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 4, s * 0.42, 3, 0, Math.PI * 2);
  ctx.fill();
  // boll husks
  ctx.strokeStyle = hexRGBA(0x8a7a4a, 0.5);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.35);
  ctx.lineTo(cx, s * 0.3);
  ctx.stroke();
}

/** Tile 22: Shutter window */
function drawShutterWindow(ctx: CanvasRenderingContext2D, s: number): void {
  // frame
  ctx.fillStyle = shade(WHITE_COLUMN, 0);
  ctx.fillRect(s * 0.1, s * 0.1, s * 0.8, 4);
  ctx.fillRect(s * 0.1, s * 0.8, s * 0.8, 4);
  ctx.fillRect(s * 0.1, s * 0.1, 4, s * 0.74);
  ctx.fillRect(s * 0.86, s * 0.1, 4, s * 0.74);
  // window pane — warm sky
  const grad = linearGrad(ctx, 0, s * 0.14, 0, s * 0.8, [[0, shade(0xb8d8e8, 0)], [1, shade(0xa8c8d8, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.14, s * 0.14, s * 0.72, s * 0.66);
  // cross mullion
  ctx.fillStyle = shade(WHITE_COLUMN, -5);
  ctx.fillRect(s * 0.14, s * 0.45, s * 0.72, 3);
  ctx.fillRect(s * 0.48, s * 0.14, 3, s * 0.66);
  // shutters (open, on sides)
  ctx.fillStyle = shade(WOOD_DARK, 0);
  ctx.fillRect(s * 0.05, s * 0.14, 5, s * 0.66);
  ctx.fillRect(s * 0.9, s * 0.14, 5, s * 0.66);
  // shutter slats
  ctx.strokeStyle = hexRGBA(WOOD, 0.5);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.05, s * 0.18 + i * s * 0.1);
    ctx.lineTo(s * 0.1, s * 0.18 + i * s * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.9, s * 0.18 + i * s * 0.1);
    ctx.lineTo(s * 0.95, s * 0.18 + i * s * 0.1);
    ctx.stroke();
  }
}

/** Tile 23: Sweet tea pitcher (coffee machine top) */
function drawSweetTeaPitcher(ctx: CanvasRenderingContext2D, s: number): void {
  // table surface
  ctx.fillStyle = shade(WOOD, 0);
  ctx.fillRect(s * 0.1, s * 0.4, s * 0.8, 4);
  // pitcher
  ctx.fillStyle = hexRGBA(SWEET_TEA, 0.7);
  roundRect(ctx, s * 0.3, s * 0.15, s * 0.3, s * 0.25, 4);
  ctx.fill();
  // pitcher rim
  ctx.fillStyle = hexRGBA(0xa88828, 0.5);
  ctx.fillRect(s * 0.3, s * 0.15, s * 0.3, 3);
  // spout
  ctx.fillStyle = hexRGBA(SWEET_TEA, 0.7);
  ctx.beginPath();
  ctx.moveTo(s * 0.6, s * 0.18);
  ctx.lineTo(s * 0.68, s * 0.15);
  ctx.lineTo(s * 0.6, s * 0.22);
  ctx.closePath();
  ctx.fill();
  // handle
  ctx.strokeStyle = hexRGBA(0xa88828, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.27, 6, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // ice cubes
  ctx.fillStyle = hexRGBA(0xf0f0f0, 0.3);
  ctx.fillRect(s * 0.36, s * 0.22, 4, 4);
  ctx.fillRect(s * 0.46, s * 0.28, 4, 4);
  // lemon slice
  ctx.fillStyle = hexRGBA(0xf8e838, 0.6);
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.2, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 24: Well pump (coffee machine bottom) */
function drawWellPump(ctx: CanvasRenderingContext2D, s: number): void {
  // stone base
  ctx.fillStyle = shade(STONE, 0);
  ctx.fillRect(s * 0.25, s * 0.5, s * 0.5, s * 0.3);
  // stone texture
  ctx.strokeStyle = hexRGBA(0x6a6a5a, 0.4);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.25, s * 0.6);
  ctx.lineTo(s * 0.75, s * 0.6);
  ctx.moveTo(s * 0.25, s * 0.7);
  ctx.lineTo(s * 0.75, s * 0.7);
  ctx.stroke();
  // pump post
  ctx.fillStyle = shade(METAL, -10);
  ctx.fillRect(s * 0.45, s * 0.15, 6, s * 0.35);
  // pump head
  ctx.fillStyle = shade(METAL, 0);
  ctx.fillRect(s * 0.35, s * 0.1, s * 0.25, s * 0.1);
  // handle
  ctx.fillStyle = shade(WOOD_DARK, 0);
  ctx.fillRect(s * 0.3, s * 0.12, s * 0.35, 4);
  // spout
  ctx.fillStyle = shade(METAL, -5);
  ctx.fillRect(s * 0.55, s * 0.15, 8, 4);
  // water stream
  ctx.fillStyle = hexRGBA(0x5a9ad5, 0.4);
  ctx.fillRect(s * 0.58, s * 0.2, 2, s * 0.15);
}

/** Tile 25: Rain barrel (water cooler) */
function drawRainBarrel(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.22, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // barrel
  const grad = linearGrad(ctx, cx - s * 0.2, 0, cx + s * 0.2, 0, [[0, shade(WOOD_DARK, -5)], [0.5, shade(WOOD, 10)], [1, shade(WOOD_DARK, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - s * 0.2, s * 0.25, s * 0.4, s * 0.55);
  // metal hoops
  ctx.fillStyle = shade(METAL, -10);
  ctx.fillRect(cx - s * 0.2, s * 0.35, s * 0.4, 2);
  ctx.fillRect(cx - s * 0.2, s * 0.65, s * 0.4, 2);
  // open top — water
  ctx.fillStyle = hexRGBA(0x5a9ad5, 0.4);
  ctx.fillRect(cx - s * 0.18, s * 0.23, s * 0.36, 4);
  // staves
  ctx.strokeStyle = hexRGBA(WOOD_DARK, 0.3);
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2 + i * s * 0.08, s * 0.25);
    ctx.lineTo(cx - s * 0.2 + i * s * 0.08, s * 0.8);
    ctx.stroke();
  }
}

/** Tile 26: Smokehouse (kitchen counter) */
function drawSmokehouse(ctx: CanvasRenderingContext2D, s: number): void {
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.fillRect(s * 0.1, s * 0.82, s * 0.8, 3);
  // building
  const grad = linearGrad(ctx, 0, s * 0.15, 0, s * 0.82, [[0, shade(WOOD, 0)], [1, shade(WOOD_DARK, -10)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.1, s * 0.2, s * 0.8, s * 0.62);
  // roof
  ctx.fillStyle = shade(WOOD_DARK, -5);
  ctx.beginPath();
  ctx.moveTo(s * 0.05, s * 0.2);
  ctx.lineTo(s * 0.5, s * 0.08);
  ctx.lineTo(s * 0.95, s * 0.2);
  ctx.closePath();
  ctx.fill();
  // door
  ctx.fillStyle = shade(0x2a1a0a, 0);
  ctx.fillRect(s * 0.4, s * 0.4, s * 0.2, s * 0.42);
  // smoke from roof
  ctx.fillStyle = hexRGBA(SMOKE, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.4, s * 0.06, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.02, 7, 0, Math.PI * 2);
  ctx.fill();
  // wood planks
  ctx.strokeStyle = hexRGBA(WOOD_DARK, 0.3);
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.1, s * 0.2 + i * s * 0.12);
    ctx.lineTo(s * 0.9, s * 0.2 + i * s * 0.12);
    ctx.stroke();
  }
}

/** Tile 27: Cast iron stove (microwave) */
function drawCastIronStove(ctx: CanvasRenderingContext2D, s: number): void {
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.fillRect(s * 0.15, s * 0.78, s * 0.7, 3);
  // body
  ctx.fillStyle = shade(STOVE_BLACK, 0);
  roundRect(ctx, s * 0.15, s * 0.2, s * 0.7, s * 0.58, 4);
  ctx.fill();
  // top surface
  ctx.fillStyle = shade(STOVE_BLACK, 10);
  ctx.fillRect(s * 0.15, s * 0.2, s * 0.7, 4);
  // burners
  ctx.fillStyle = shade(0x1a1a1a, 0);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.24, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.24, 5, 0, Math.PI * 2);
  ctx.fill();
  // burner glow
  ctx.fillStyle = hexRGBA(0xff6a2a, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.24, 3, 0, Math.PI * 2);
  ctx.fill();
  // oven door
  ctx.fillStyle = shade(0x1a1a1a, 0);
  ctx.fillRect(s * 0.25, s * 0.4, s * 0.5, s * 0.3);
  // handle
  ctx.fillStyle = shade(METAL, 0);
  ctx.fillRect(s * 0.35, s * 0.38, s * 0.3, 3);
  // pipe
  ctx.fillStyle = shade(STOVE_BLACK, -5);
  ctx.fillRect(s * 0.7, s * 0.05, 6, s * 0.15);
}

/** Tile 28: Porch swing left (sofa left) */
function drawPorchSwingLeft(ctx: CanvasRenderingContext2D, s: number): void {
  // chain
  ctx.strokeStyle = shade(METAL, -5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.8, 0);
  ctx.lineTo(s * 0.7, s * 0.2);
  ctx.stroke();
  // seat
  const grad = linearGrad(ctx, 0, s * 0.25, 0, s * 0.6, [[0, shade(WOOD_LIGHT, 0)], [1, shade(WOOD, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, s * 0.3, s * 0.7, s * 0.15);
  // back
  ctx.fillStyle = shade(WOOD, 0);
  ctx.fillRect(0, s * 0.15, s * 0.7, s * 0.15);
  // slats
  ctx.strokeStyle = hexRGBA(WOOD_DARK, 0.4);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.14, s * 0.15);
    ctx.lineTo(i * s * 0.14, s * 0.3);
    ctx.stroke();
  }
  // cushion
  ctx.fillStyle = hexRGBA(0x8a5a6a, 0.5);
  ctx.fillRect(4, s * 0.32, s * 0.6, s * 0.08);
}

/** Tile 29: Porch swing right (sofa right) */
function drawPorchSwingRight(ctx: CanvasRenderingContext2D, s: number): void {
  // chain
  ctx.strokeStyle = shade(METAL, -5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.2, 0);
  ctx.lineTo(s * 0.3, s * 0.2);
  ctx.stroke();
  // seat
  const grad = linearGrad(ctx, s * 0.3, s * 0.25, s, s * 0.6, [[0, shade(WOOD_LIGHT, 0)], [1, shade(WOOD, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.3, s * 0.3, s * 0.7, s * 0.15);
  // back
  ctx.fillStyle = shade(WOOD, 0);
  ctx.fillRect(s * 0.3, s * 0.15, s * 0.7, s * 0.15);
  // slats
  ctx.strokeStyle = hexRGBA(WOOD_DARK, 0.4);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.3 + i * s * 0.14, s * 0.15);
    ctx.lineTo(s * 0.3 + i * s * 0.14, s * 0.3);
    ctx.stroke();
  }
  ctx.fillStyle = hexRGBA(0x8a5a6a, 0.5);
  ctx.fillRect(s * 0.34, s * 0.32, s * 0.6, s * 0.08);
}

/** Tile 30: Live oak (large plant) */
function drawLiveOak(ctx: CanvasRenderingContext2D, s: number): void {
  // trunk
  ctx.fillStyle = shade(WOOD_DARK, -5);
  ctx.fillRect(s * 0.4, s * 0.4, 10, s * 0.45);
  // branches
  ctx.strokeStyle = shade(WOOD_DARK, 0);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.45, s * 0.4);
  ctx.lineTo(s * 0.2, s * 0.25);
  ctx.moveTo(s * 0.45, s * 0.4);
  ctx.lineTo(s * 0.8, s * 0.2);
  ctx.stroke();
  // canopy
  ctx.fillStyle = shade(LEAF_GREEN, 0);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.25, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.2, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.25, 14, 0, Math.PI * 2);
  ctx.fill();
  // Spanish moss
  ctx.fillStyle = hexRGBA(MOSS_GRAY, 0.4);
  ctx.beginPath();
  ctx.ellipse(s * 0.25, s * 0.35, 4, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.55, s * 0.3, 4, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.75, s * 0.35, 4, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 31: Magnolia tree */
function drawMagnoliaTree(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  // trunk
  ctx.fillStyle = shade(WOOD, 0);
  ctx.fillRect(cx - 4, s * 0.4, 8, s * 0.45);
  // leaves
  ctx.fillStyle = shade(LEAF_DARK, 5);
  ctx.beginPath();
  ctx.arc(cx, s * 0.3, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(LEAF_GREEN, 0);
  ctx.beginPath();
  ctx.arc(cx - 5, s * 0.25, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, s * 0.28, 10, 0, Math.PI * 2);
  ctx.fill();
  // magnolia flowers
  ctx.fillStyle = shade(MAGNOLIA_CREAM, 0);
  ctx.beginPath();
  ctx.arc(cx - 8, s * 0.22, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 8, s * 0.3, 5, 0, Math.PI * 2);
  ctx.fill();
  // flower centers
  ctx.fillStyle = hexRGBA(0xd8a838, 0.5);
  ctx.beginPath();
  ctx.arc(cx - 8, s * 0.22, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 8, s * 0.3, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 32: Horseshoe pit (toaster) */
function drawHorseshoePit(ctx: CanvasRenderingContext2D, s: number): void {
  // sand pit
  ctx.fillStyle = shade(0xd8c898, 0);
  ctx.fillRect(s * 0.15, s * 0.3, s * 0.7, s * 0.4);
  // pit border
  ctx.strokeStyle = shade(WOOD_DARK, 0);
  ctx.lineWidth = 2;
  ctx.strokeRect(s * 0.15, s * 0.3, s * 0.7, s * 0.4);
  // stake
  ctx.fillStyle = shade(WOOD, 0);
  ctx.fillRect(s * 0.48, s * 0.35, 4, s * 0.3);
  // horseshoes
  ctx.strokeStyle = shade(METAL, 0);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.55, 6, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.65, s * 0.5, 6, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}

/** Tile 35: Smokehouse vent (server rack) */
function drawSmokehouseVent(ctx: CanvasRenderingContext2D, s: number): void {
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.fillRect(s * 0.15, s * 0.82, s * 0.7, 3);
  // body
  const grad = linearGrad(ctx, s * 0.2, 0, s * 0.8, 0, [[0, shade(WOOD_DARK, -5)], [1, shade(WOOD, 5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.2, s * 0.1, s * 0.6, s * 0.72);
  // vents
  ctx.fillStyle = shade(0x1a1a1a, 0);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(s * 0.25, s * 0.2 + i * s * 0.15, s * 0.5, s * 0.08);
  }
  // smoke coming out
  ctx.fillStyle = hexRGBA(SMOKE, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.05, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.02, 5, 0, Math.PI * 2);
  ctx.fill();
  // wood planks
  ctx.strokeStyle = hexRGBA(WOOD_DARK, 0.3);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.5);
  ctx.lineTo(s * 0.8, s * 0.5);
  ctx.stroke();
}

/** Tile 36: Smokehouse screen (server screen) */
function drawSmokehouseScreen(ctx: CanvasRenderingContext2D, s: number): void {
  // dark vent background
  ctx.fillStyle = shade(0x1a1a1a, 0);
  ctx.fillRect(s * 0.2, s * 0.15, s * 0.6, s * 0.5);
  // smoke glow
  ctx.fillStyle = hexRGBA(SMOKE, 0.4);
  ctx.fillRect(s * 0.22, s * 0.17, s * 0.56, s * 0.46);
  // vent slats
  ctx.fillStyle = shade(WOOD_DARK, 0);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(s * 0.2, s * 0.2 + i * s * 0.09, s * 0.6, 2);
  }
  // status glow lines
  ctx.fillStyle = hexRGBA(0x4a8a4a, 0.15);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(s * 0.25, s * 0.25 + i * s * 0.1, s * 0.5, 1);
  }
}

/** Tile 37: Brick chimney */
function drawBrickChimney(ctx: CanvasRenderingContext2D, s: number): void {
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.fillRect(s * 0.2, s * 0.85, s * 0.6, 3);
  // chimney body
  const grad = linearGrad(ctx, 0, s * 0.1, 0, s * 0.85, [[0, shade(BRICK, 5)], [1, shade(BRICK_DARK, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.25, s * 0.1, s * 0.5, s * 0.75);
  // brick pattern
  ctx.strokeStyle = hexRGBA(0x5a2a1a, 0.5);
  ctx.lineWidth = 0.8;
  for (let row = 0; row < 8; row++) {
    const y = s * 0.12 + row * s * 0.09;
    ctx.beginPath();
    ctx.moveTo(s * 0.25, y);
    ctx.lineTo(s * 0.75, y);
    ctx.stroke();
    // offset bricks
    const offset = row % 2 === 0 ? 0 : s * 0.06;
    for (let col = 0; col < 3; col++) {
      const x = s * 0.25 + offset + col * s * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + s * 0.09);
      ctx.stroke();
    }
  }
  // cap
  ctx.fillStyle = shade(BRICK_DARK, -10);
  ctx.fillRect(s * 0.22, s * 0.08, s * 0.56, 4);
  // smoke
  ctx.fillStyle = hexRGBA(SMOKE, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.4, s * 0.04, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.01, 6, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- registration ---------- */

export function registerOldSouthFurniture(): void {
  registerThemeFurniture(17, drawFieldPlotLeft);
  registerThemeFurniture(18, drawFieldPlotRight);
  registerThemeFurniture(19, drawWoodenStool);
  registerThemeFurniture(20, drawStorageChest);
  registerThemeFurniture(21, drawCottonSprig);
  registerThemeFurniture(22, drawShutterWindow);
  registerThemeFurniture(23, drawSweetTeaPitcher);
  registerThemeFurniture(24, drawWellPump);
  registerThemeFurniture(25, drawRainBarrel);
  registerThemeFurniture(26, drawSmokehouse);
  registerThemeFurniture(27, drawCastIronStove);
  registerThemeFurniture(28, drawPorchSwingLeft);
  registerThemeFurniture(29, drawPorchSwingRight);
  registerThemeFurniture(30, drawLiveOak);
  registerThemeFurniture(31, drawMagnoliaTree);
  registerThemeFurniture(32, drawHorseshoePit);
  registerThemeFurniture(35, drawSmokehouseVent);
  registerThemeFurniture(36, drawSmokehouseScreen);
  registerThemeFurniture(37, drawBrickChimney);
}

// Auto-register on import
registerOldSouthFurniture();
