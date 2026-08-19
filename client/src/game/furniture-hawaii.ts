/**
 * Hawaii — procedural furniture drawing functions.
 *
 * 19 Canvas2D drawing functions for the Hawaii beach pavilion theme:
 * tiki torch stations, surfboard desks, log stools, treasure chests,
 * hibiscus, ocean views, tiki bar, rain catchment, prep table,
 * lava rock grill, hammock, palm trees, plumeria, coconut grill,
 * tiki totem, volcano vent.
 *
 * Registered via registerThemeFurniture() on import.
 */

import { registerThemeFurniture } from "./furniture";

/* ---------- color helpers (duplicated from furniture.ts) ---------- */

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

/* ---------- Hawaii color palette ---------- */

const BAMBOO = 0x8a6a3a;
const BAMBOO_DARK = 0x6a4a2a;
const PALM_WOOD = 0x6a5a3a;
const PALM_DARK = 0x4a3a2a;
const LEAF_GREEN = 0x3a8a4a;
const LEAF_DARK = 0x2a6a3a;
const HIBISCUS_RED = 0xd63a4a;
const HIBISCUS_PINK = 0xe85a7a;
const PLUMERIA_WHITE = 0xf8f0e8;
const PLUMERIA_YELLOW = 0xf8d878;
const OCEAN_BLUE = 0x3a7ab5;
const OCEAN_LIGHT = 0x5a9ad5;
const TIKI_BROWN = 0x5a3a1a;
const TIKI_DARK = 0x3a2a0a;
const ROPE = 0xb8905a;
const METAL = 0x8a8a8a;
const LAVA_ROCK = 0x3a2a2a;
const FIRE_GLOW = 0xff8a3a;
const TREASURE_WOOD = 0x8a6a3a;
const TREASURE_DARK = 0x5a3a1a;
const GOLD = 0xd4a838;

/* ---------- drawing functions ---------- */

/** Tile 17: Tiki torch station left (surfboard workbench left half) */
function drawTorchStationLeft(ctx: CanvasRenderingContext2D, s: number): void {
  // surfboard desk surface
  const grad = linearGrad(ctx, 0, s * 0.2, 0, s * 0.5, [[0, shade(PALM_WOOD, 10)], [1, shade(PALM_DARK, -5)]]);
  ctx.fillStyle = grad;
  roundRect(ctx, 2, s * 0.22, s * 0.5 - 2, s * 0.28, 8);
  ctx.fill();
  // wood grain
  ctx.strokeStyle = hexRGBA(PALM_DARK, 0.3);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(4, s * 0.26 + i * 5);
    ctx.lineTo(s * 0.5 - 4, s * 0.26 + i * 5);
    ctx.stroke();
  }
  // tiki torch pole on left edge
  ctx.fillStyle = shade(BAMBOO, 0);
  ctx.fillRect(4, s * 0.05, 6, s * 0.2);
  ctx.fillStyle = shade(BAMBOO_DARK, 0);
  ctx.fillRect(4, s * 0.05, 2, s * 0.2);
  // torch flame holder
  ctx.fillStyle = shade(TIKI_BROWN, 0);
  ctx.fillRect(2, s * 0.02, 10, 6);
  // flame
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.6);
  ctx.beginPath();
  ctx.ellipse(7, s * 0.01, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.fillRect(2, s * 0.48, s * 0.5 - 2, 3);
}

/** Tile 18: Tiki torch station right (surfboard workbench right half) */
function drawTorchStationRight(ctx: CanvasRenderingContext2D, s: number): void {
  const grad = linearGrad(ctx, s * 0.5, s * 0.2, s, s * 0.5, [[0, shade(PALM_WOOD, 10)], [1, shade(PALM_DARK, -5)]]);
  ctx.fillStyle = grad;
  roundRect(ctx, s * 0.5, s * 0.22, s * 0.5 - 2, s * 0.28, 8);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(PALM_DARK, 0.3);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5 + 2, s * 0.26 + i * 5);
    ctx.lineTo(s - 4, s * 0.26 + i * 5);
    ctx.stroke();
  }
  // torch pole on right edge
  ctx.fillStyle = shade(BAMBOO, 0);
  ctx.fillRect(s - 10, s * 0.05, 6, s * 0.2);
  ctx.fillStyle = shade(BAMBOO_DARK, 0);
  ctx.fillRect(s - 6, s * 0.05, 2, s * 0.2);
  ctx.fillStyle = shade(TIKI_BROWN, 0);
  ctx.fillRect(s - 12, s * 0.02, 10, 6);
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.6);
  ctx.beginPath();
  ctx.ellipse(s - 7, s * 0.01, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.fillRect(s * 0.5, s * 0.48, s * 0.5 - 2, 3);
}

/** Tile 19: Log stool */
function drawLogStool(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  const cy = s * 0.55;
  const r = s * 0.22;
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, r + 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // log body
  const grad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, r);
  grad.addColorStop(0, shade(PALM_WOOD, 15));
  grad.addColorStop(1, shade(PALM_DARK, -10));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // tree rings
  ctx.strokeStyle = hexRGBA(PALM_DARK, 0.4);
  ctx.lineWidth = 0.8;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * (i / 5), 0, Math.PI * 2);
    ctx.stroke();
  }
  // center dot
  ctx.fillStyle = hexRGBA(PALM_DARK, 0.5);
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 20: Treasure chest (filing cabinet) */
function drawTreasureChest(ctx: CanvasRenderingContext2D, s: number): void {
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.fillRect(s * 0.15, s * 0.72, s * 0.7, 4);
  // chest body
  const grad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.72, [[0, shade(TREASURE_WOOD, 8)], [1, shade(TREASURE_DARK, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.15, s * 0.35, s * 0.7, s * 0.37);
  // lid (curved)
  ctx.fillStyle = shade(TREASURE_WOOD, 5);
  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.35);
  ctx.quadraticCurveTo(s * 0.5, s * 0.15, s * 0.85, s * 0.35);
  ctx.closePath();
  ctx.fill();
  // metal bands
  ctx.fillStyle = shade(METAL, -10);
  ctx.fillRect(s * 0.15, s * 0.45, s * 0.7, 3);
  ctx.fillRect(s * 0.15, s * 0.6, s * 0.7, 3);
  // lock
  ctx.fillStyle = shade(GOLD, 0);
  ctx.fillRect(s * 0.46, s * 0.4, s * 0.08, s * 0.1);
  ctx.fillStyle = shade(GOLD, -15);
  ctx.fillRect(s * 0.48, s * 0.42, s * 0.04, s * 0.06);
  // wood grain
  ctx.strokeStyle = hexRGBA(TREASURE_DARK, 0.3);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.5);
  ctx.lineTo(s * 0.8, s * 0.5);
  ctx.stroke();
}

/** Tile 21: Hibiscus (small plant) */
function drawHibiscus(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  const cy = s * 0.55;
  // stem
  ctx.strokeStyle = shade(LEAF_DARK, 0);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.85);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  // leaves
  ctx.fillStyle = shade(LEAF_GREEN, 0);
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy + 8, 8, 4, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy + 12, 8, 4, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // flower petals
  ctx.fillStyle = shade(HIBISCUS_RED, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 7, 4, a, 0, Math.PI * 2);
    ctx.fill();
  }
  // center
  ctx.fillStyle = shade(PLUMERIA_YELLOW, 0);
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  // stigma
  ctx.strokeStyle = hexRGBA(HIBISCUS_PINK, 0.8);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
    ctx.stroke();
  }
}

/** Tile 22: Ocean view (window) */
function drawOceanView(ctx: CanvasRenderingContext2D, s: number): void {
  // bamboo frame
  ctx.fillStyle = shade(BAMBOO, 0);
  ctx.fillRect(s * 0.1, s * 0.1, s * 0.8, 4);
  ctx.fillRect(s * 0.1, s * 0.8, s * 0.8, 4);
  ctx.fillRect(s * 0.1, s * 0.1, 4, s * 0.74);
  ctx.fillRect(s * 0.86, s * 0.1, 4, s * 0.74);
  // ocean gradient
  const grad = linearGrad(ctx, 0, s * 0.14, 0, s * 0.8, [[0, shade(OCEAN_LIGHT, 10)], [0.5, shade(OCEAN_BLUE, 0)], [1, shade(OCEAN_BLUE, -15)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.14, s * 0.14, s * 0.72, s * 0.66);
  // waves
  ctx.strokeStyle = hexRGBA(OCEAN_LIGHT, 0.4);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = s * 0.25 + i * s * 0.12;
    ctx.beginPath();
    for (let x = s * 0.14; x < s * 0.86; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.3) * 2);
    }
    ctx.stroke();
  }
  // sun reflection
  ctx.fillStyle = hexRGBA(0xffeeaa, 0.2);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.2, s * 0.1, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 23: Tiki bar top (coconut drink station) */
function drawTikiBarTop(ctx: CanvasRenderingContext2D, s: number): void {
  // bar counter
  const grad = linearGrad(ctx, 0, s * 0.15, 0, s * 0.5, [[0, shade(BAMBOO, 8)], [1, shade(BAMBOO_DARK, -5)]]);
  ctx.fillStyle = grad;
  roundRect(ctx, 4, s * 0.15, s - 8, s * 0.35, 4);
  ctx.fill();
  // bamboo segments
  ctx.strokeStyle = hexRGBA(BAMBOO_DARK, 0.4);
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s / 4, s * 0.15);
    ctx.lineTo(i * s / 4, s * 0.5);
    ctx.stroke();
  }
  // coconut shells on bar
  ctx.fillStyle = shade(TIKI_BROWN, 5);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.25, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.25, 6, 0, Math.PI * 2);
  ctx.fill();
  // straws
  ctx.strokeStyle = hexRGBA(0xff6a3a, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.25);
  ctx.lineTo(s * 0.32, s * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.7, s * 0.25);
  ctx.lineTo(s * 0.72, s * 0.12);
  ctx.stroke();
  // umbrella
  ctx.fillStyle = hexRGBA(HIBISCUS_PINK, 0.6);
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.1);
  ctx.lineTo(s * 0.45, s * 0.18);
  ctx.lineTo(s * 0.55, s * 0.18);
  ctx.closePath();
  ctx.fill();
}

/** Tile 24: Tiki bar bottom */
function drawTikiBarBottom(ctx: CanvasRenderingContext2D, s: number): void {
  // shelf
  ctx.fillStyle = shade(BAMBOO_DARK, 0);
  ctx.fillRect(4, s * 0.1, s - 8, 4);
  // bottles
  ctx.fillStyle = hexRGBA(0x4a8a4a, 0.7);
  ctx.fillRect(s * 0.15, s * 0.2, 6, s * 0.25);
  ctx.fillStyle = hexRGBA(0x8a4a2a, 0.7);
  ctx.fillRect(s * 0.3, s * 0.2, 6, s * 0.25);
  ctx.fillStyle = hexRGBA(0x4a4a8a, 0.7);
  ctx.fillRect(s * 0.45, s * 0.2, 6, s * 0.25);
  // bamboo legs
  ctx.fillStyle = shade(BAMBOO, 0);
  ctx.fillRect(6, s * 0.1, 5, s * 0.7);
  ctx.fillRect(s - 11, s * 0.1, 5, s * 0.7);
  // rope detail
  ctx.strokeStyle = hexRGBA(ROPE, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, s * 0.5);
  ctx.lineTo(s - 8, s * 0.5);
  ctx.stroke();
}

/** Tile 25: Rain catchment (water cooler) */
function drawRainCatchment(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // barrel body
  const grad = linearGrad(ctx, cx - s * 0.18, 0, cx + s * 0.18, 0, [[0, shade(BAMBOO_DARK, -5)], [0.5, shade(BAMBOO, 8)], [1, shade(BAMBOO_DARK, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - s * 0.18, s * 0.3, s * 0.36, s * 0.5);
  // metal bands
  ctx.fillStyle = shade(METAL, -10);
  ctx.fillRect(cx - s * 0.18, s * 0.38, s * 0.36, 2);
  ctx.fillRect(cx - s * 0.18, s * 0.65, s * 0.36, 2);
  // open top — water surface
  ctx.fillStyle = hexRGBA(OCEAN_LIGHT, 0.5);
  ctx.fillRect(cx - s * 0.16, s * 0.28, s * 0.32, 4);
  // spigot
  ctx.fillStyle = shade(METAL, 0);
  ctx.fillRect(cx + s * 0.15, s * 0.5, 6, 4);
  ctx.fillRect(cx + s * 0.2, s * 0.48, 2, 8);
  // water drop
  ctx.fillStyle = hexRGBA(OCEAN_BLUE, 0.6);
  ctx.beginPath();
  ctx.arc(cx + s * 0.22, s * 0.62, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 26: Prep table (kitchen counter) */
function drawPrepTable(ctx: CanvasRenderingContext2D, s: number): void {
  // table surface
  const grad = linearGrad(ctx, 0, s * 0.2, 0, s * 0.5, [[0, shade(BAMBOO, 10)], [1, shade(BAMBOO_DARK, -5)]]);
  ctx.fillStyle = grad;
  roundRect(ctx, 4, s * 0.2, s - 8, s * 0.3, 4);
  ctx.fill();
  // bamboo texture
  ctx.strokeStyle = hexRGBA(BAMBOO_DARK, 0.3);
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s / 5, s * 0.2);
    ctx.lineTo(i * s / 5, s * 0.5);
    ctx.stroke();
  }
  // fish on cutting board
  ctx.fillStyle = hexRGBA(0xd8a878, 0.7);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.35, s * 0.15, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // fish tail
  ctx.beginPath();
  ctx.moveTo(s * 0.35, s * 0.35);
  ctx.lineTo(s * 0.28, s * 0.31);
  ctx.lineTo(s * 0.28, s * 0.39);
  ctx.closePath();
  ctx.fill();
  // legs
  ctx.fillStyle = shade(BAMBOO_DARK, 0);
  ctx.fillRect(8, s * 0.5, 4, s * 0.3);
  ctx.fillRect(s - 12, s * 0.5, 4, s * 0.3);
}

/** Tile 27: Lava rock grill (microwave) */
function drawLavaRockGrill(ctx: CanvasRenderingContext2D, s: number): void {
  // base
  ctx.fillStyle = shade(LAVA_ROCK, 0);
  roundRect(ctx, s * 0.15, s * 0.25, s * 0.7, s * 0.45, 4);
  ctx.fill();
  // rocks
  ctx.fillStyle = shade(LAVA_ROCK, 10);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(s * 0.22 + i * s * 0.1, s * 0.35, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // glow between rocks
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.4);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(s * 0.27 + i * s * 0.1, s * 0.37, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // grill grate
  ctx.strokeStyle = shade(METAL, -5);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.3 + i * 4);
    ctx.lineTo(s * 0.8, s * 0.3 + i * 4);
    ctx.stroke();
  }
  // legs
  ctx.fillStyle = shade(LAVA_ROCK, -5);
  ctx.fillRect(s * 0.18, s * 0.7, 4, s * 0.15);
  ctx.fillRect(s * 0.78, s * 0.7, 4, s * 0.15);
}

/** Tile 28: Hammock left */
function drawHammockLeft(ctx: CanvasRenderingContext2D, s: number): void {
  // rope to post
  ctx.strokeStyle = shade(ROPE, 0);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.8, s * 0.1);
  ctx.lineTo(s * 0.5, s * 0.4);
  ctx.stroke();
  // hammock fabric
  const grad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.6, [[0, shade(0xc8d8e8, 0)], [1, shade(0xa8b8c8, -10)]]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.35);
  ctx.quadraticCurveTo(s * 0.25, s * 0.55, 0, s * 0.45);
  ctx.lineTo(0, s * 0.5);
  ctx.quadraticCurveTo(s * 0.25, s * 0.65, s * 0.5, s * 0.45);
  ctx.closePath();
  ctx.fill();
  // fabric stripes
  ctx.strokeStyle = hexRGBA(0x8a9aaa, 0.3);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.1 + i * s * 0.1, s * 0.4 + i * 2);
    ctx.lineTo(s * 0.1 + i * s * 0.1, s * 0.55 + i * 2);
    ctx.stroke();
  }
}

/** Tile 29: Hammock right */
function drawHammockRight(ctx: CanvasRenderingContext2D, s: number): void {
  // post
  ctx.fillStyle = shade(PALM_WOOD, 0);
  ctx.fillRect(s * 0.8, s * 0.05, 6, s * 0.8);
  ctx.fillStyle = shade(PALM_DARK, 0);
  ctx.fillRect(s * 0.8, s * 0.05, 2, s * 0.8);
  // rope
  ctx.strokeStyle = shade(ROPE, 0);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.83, s * 0.1);
  ctx.lineTo(s * 0.5, s * 0.4);
  ctx.stroke();
  // hammock fabric
  const grad = linearGrad(ctx, s * 0.5, s * 0.3, s, s * 0.6, [[0, shade(0xc8d8e8, 0)], [1, shade(0xa8b8c8, -10)]]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.35);
  ctx.quadraticCurveTo(s * 0.75, s * 0.55, s, s * 0.45);
  ctx.lineTo(s, s * 0.5);
  ctx.quadraticCurveTo(s * 0.75, s * 0.65, s * 0.5, s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x8a9aaa, 0.3);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.55 + i * s * 0.1, s * 0.4 + i * 2);
    ctx.lineTo(s * 0.55 + i * s * 0.1, s * 0.55 + i * 2);
    ctx.stroke();
  }
}

/** Tile 30: Palm tree (large plant) */
function drawPalmTree(ctx: CanvasRenderingContext2D, s: number): void {
  // trunk
  ctx.fillStyle = shade(PALM_WOOD, 0);
  ctx.fillRect(s * 0.42, s * 0.3, 8, s * 0.55);
  // trunk segments
  ctx.strokeStyle = hexRGBA(PALM_DARK, 0.4);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.42, s * 0.35 + i * s * 0.08);
    ctx.lineTo(s * 0.5, s * 0.35 + i * s * 0.08);
    ctx.stroke();
  }
  // fronds
  ctx.fillStyle = shade(LEAF_GREEN, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(s * 0.46, s * 0.3);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.15, s * 0.04, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // coconuts
  ctx.fillStyle = shade(TIKI_BROWN, 5);
  ctx.beginPath();
  ctx.arc(s * 0.4, s * 0.32, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.52, s * 0.34, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Tile 31: Plumeria (large plant variant) */
function drawPlumeria(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  // trunk
  ctx.strokeStyle = shade(PALM_DARK, 0);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.85);
  ctx.lineTo(cx, s * 0.4);
  ctx.stroke();
  // leaves
  ctx.fillStyle = shade(LEAF_GREEN, 5);
  ctx.beginPath();
  ctx.ellipse(cx - 12, s * 0.5, 12, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, s * 0.55, 12, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.35, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // flowers
  ctx.fillStyle = shade(PLUMERIA_WHITE, 0);
  for (let i = 0; i < 3; i++) {
    const fx = cx + (i - 1) * 10;
    const fy = s * 0.3 + i * 3;
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 4, 2.5, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shade(PLUMERIA_YELLOW, 0);
    ctx.beginPath();
    ctx.arc(fx, fy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(PLUMERIA_WHITE, 0);
  }
}

/** Tile 32: Coconut grill (toaster) */
function drawCoconutGrill(ctx: CanvasRenderingContext2D, s: number): void {
  // half coconut shell
  ctx.fillStyle = shade(TIKI_BROWN, 5);
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.55, s * 0.25, Math.PI, 0);
  ctx.fill();
  // inner
  ctx.fillStyle = shade(TIKI_DARK, 0);
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.55, s * 0.2, Math.PI, 0);
  ctx.fill();
  // hot coals
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.5);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(s * 0.32 + i * s * 0.08, s * 0.5, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // grill marks
  ctx.strokeStyle = shade(METAL, -5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.3 + i * s * 0.08, s * 0.4);
    ctx.lineTo(s * 0.3 + i * s * 0.08, s * 0.55);
    ctx.stroke();
  }
  // fiber texture on shell
  ctx.strokeStyle = hexRGBA(TIKI_DARK, 0.4);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.3 + i * s * 0.08, s * 0.55);
    ctx.lineTo(s * 0.3 + i * s * 0.08, s * 0.7);
    ctx.stroke();
  }
}

/** Tile 35: Tiki totem (server rack) */
function drawTikiTotem(ctx: CanvasRenderingContext2D, s: number): void {
  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.fillRect(s * 0.2, s * 0.82, s * 0.6, 3);
  // totem body
  const grad = linearGrad(ctx, s * 0.25, 0, s * 0.75, 0, [[0, shade(TIKI_BROWN, 5)], [1, shade(TIKI_DARK, -5)]]);
  ctx.fillStyle = grad;
  ctx.fillRect(s * 0.25, s * 0.1, s * 0.5, s * 0.72);
  // carvings — face 1 (top)
  ctx.fillStyle = shade(TIKI_DARK, -10);
  ctx.fillRect(s * 0.32, s * 0.15, s * 0.36, s * 0.25);
  // eyes
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.5);
  ctx.beginPath();
  ctx.arc(s * 0.38, s * 0.22, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.62, s * 0.22, 4, 0, Math.PI * 2);
  ctx.fill();
  // mouth
  ctx.fillStyle = shade(TIKI_DARK, -5);
  ctx.fillRect(s * 0.38, s * 0.3, s * 0.24, 4);
  // teeth
  ctx.fillStyle = shade(PLUMERIA_WHITE, 0);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(s * 0.4 + i * 5, s * 0.3, 2, 4);
  }
  // face 2 (bottom)
  ctx.fillStyle = shade(TIKI_DARK, -10);
  ctx.fillRect(s * 0.32, s * 0.5, s * 0.36, s * 0.25);
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.38, s * 0.57, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.62, s * 0.57, 3, 0, Math.PI * 2);
  ctx.fill();
  // brow lines
  ctx.strokeStyle = hexRGBA(TIKI_DARK, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.34, s * 0.18);
  ctx.lineTo(s * 0.42, s * 0.2);
  ctx.moveTo(s * 0.66, s * 0.18);
  ctx.lineTo(s * 0.58, s * 0.2);
  ctx.stroke();
}

/** Tile 36: Tiki totem eyes (server screen) */
function drawTikiTotemEyes(ctx: CanvasRenderingContext2D, s: number): void {
  // dark background
  ctx.fillStyle = shade(TIKI_DARK, -10);
  ctx.fillRect(s * 0.2, s * 0.15, s * 0.6, s * 0.5);
  // glowing eyes
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.7);
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.65, s * 0.3, 6, 0, Math.PI * 2);
  ctx.fill();
  // glow halos
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.15);
  ctx.beginPath();
  ctx.arc(s * 0.35, s * 0.3, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.65, s * 0.3, 12, 0, Math.PI * 2);
  ctx.fill();
  // scanline effect
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.06);
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(s * 0.22, s * 0.2 + i * 6, s * 0.56, 1);
  }
}

/** Tile 37: Volcano vent (chimney) */
function drawVolcanoVent(ctx: CanvasRenderingContext2D, s: number): void {
  // volcanic rock base
  ctx.fillStyle = shade(LAVA_ROCK, 0);
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.85);
  ctx.lineTo(s * 0.3, s * 0.3);
  ctx.lineTo(s * 0.7, s * 0.3);
  ctx.lineTo(s * 0.8, s * 0.85);
  ctx.closePath();
  ctx.fill();
  // crater opening
  ctx.fillStyle = shade(0x1a0a0a, 0);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.3, s * 0.2, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // lava glow
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.5);
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.3, s * 0.15, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  // smoke
  ctx.fillStyle = hexRGBA(0x4a4a4a, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.45, s * 0.18, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.55, s * 0.12, 8, 0, Math.PI * 2);
  ctx.fill();
  // rock texture
  ctx.fillStyle = shade(LAVA_ROCK, 10);
  ctx.fillRect(s * 0.25, s * 0.5, 4, 3);
  ctx.fillRect(s * 0.7, s * 0.6, 4, 3);
  ctx.fillRect(s * 0.4, s * 0.7, 4, 3);
}

/* ---------- registration ---------- */

export function registerHawaiiFurniture(): void {
  registerThemeFurniture(17, drawTorchStationLeft);
  registerThemeFurniture(18, drawTorchStationRight);
  registerThemeFurniture(19, drawLogStool);
  registerThemeFurniture(20, drawTreasureChest);
  registerThemeFurniture(21, drawHibiscus);
  registerThemeFurniture(22, drawOceanView);
  registerThemeFurniture(23, drawTikiBarTop);
  registerThemeFurniture(24, drawTikiBarBottom);
  registerThemeFurniture(25, drawRainCatchment);
  registerThemeFurniture(26, drawPrepTable);
  registerThemeFurniture(27, drawLavaRockGrill);
  registerThemeFurniture(28, drawHammockLeft);
  registerThemeFurniture(29, drawHammockRight);
  registerThemeFurniture(30, drawPalmTree);
  registerThemeFurniture(31, drawPlumeria);
  registerThemeFurniture(32, drawCoconutGrill);
  registerThemeFurniture(35, drawTikiTotem);
  registerThemeFurniture(36, drawTikiTotemEyes);
  registerThemeFurniture(37, drawVolcanoVent);
}
