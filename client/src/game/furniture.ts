/**
 * Procedural Office Furniture Renderer
 *
 * Generates high-fidelity furniture sprites at runtime and overlays them
 * on top of the Tiled map's furniture layer, replacing the simple tile shapes
 * with detailed, shaded, properly proportioned office furniture.
 */

import Phaser from "phaser";

const TILE_PX = 64;

interface FurnitureType {
  tileIds: number[];
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

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

/* ---------- furniture drawing functions ---------- */

/** Desk surface — left half (tile 17) */
function drawDeskLeft(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;
  const topY = s * 0.25;
  const h = s * 0.35;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.72, s * 0.48, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk leg (right side — shared with right half)
  ctx.fillStyle = shade(0x3a3a40, -10);
  ctx.fillRect(s * 0.46, s * 0.55, 4, s * 0.2);
  ctx.fillStyle = shade(0x3a3a40, -30);
  ctx.fillRect(s * 0.46, s * 0.72, 6, 3);

  // desk surface — laminated wood with bevel
  const surfaceGrad = linearGrad(ctx, 0, topY, 0, topY + h, [
    [0, shade(0x8a7a6a, 20)],
    [0.3, shade(0x7a6a5a, 0)],
    [0.7, shade(0x6a5a4a, -10)],
    [1, shade(0x5a4a3a, -25)],
  ]);
  ctx.fillStyle = surfaceGrad;
  roundRect(ctx, 2, topY, s - 2, h, 4);
  ctx.fill();

  // front panel — darker wood side covering lower tile
  const panelGrad = linearGrad(ctx, 0, topY + h, 0, s * 0.95, [
    [0, shade(0x5a4a3a, -5)],
    [0.5, shade(0x4a3a2a, -15)],
    [1, shade(0x3a2a1a, -25)],
  ]);
  ctx.fillStyle = panelGrad;
  roundRect(ctx, 2, topY + h, s - 2, s * 0.35, 4);
  ctx.fill();

  // surface texture — subtle wood grain lines
  ctx.strokeStyle = hexRGBA(0x4a3a2a, 0.15);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    const y = topY + 4 + i * (h / 6);
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.bezierCurveTo(s * 0.3, y + 1, s * 0.6, y - 1, s - 4, y + 0.5);
    ctx.stroke();
  }

  // top edge bevel highlight
  ctx.strokeStyle = hexRGBA(0xaa9a8a, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4, topY + 1);
  ctx.lineTo(s - 4, topY + 1);
  ctx.stroke();

  // front edge — darker shadow line
  ctx.strokeStyle = hexRGBA(0x3a2a1a, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, topY + h - 1);
  ctx.lineTo(s - 2, topY + h - 1);
  ctx.stroke();

  // cable hole
  ctx.beginPath();
  ctx.ellipse(s * 0.3, topY + h * 0.5, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexRGBA(0x1a1a1a, 0.7);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x2a2a2a, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Desk surface — right half (tile 18) */
function drawDeskRight(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;
  const topY = s * 0.25;
  const h = s * 0.35;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.72, s * 0.48, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk leg (left side)
  ctx.fillStyle = shade(0x3a3a40, -10);
  ctx.fillRect(s * 0.08, s * 0.55, 4, s * 0.2);
  ctx.fillStyle = shade(0x3a3a40, -30);
  ctx.fillRect(s * 0.06, s * 0.72, 6, 3);

  // desk surface
  const surfaceGrad = linearGrad(ctx, 0, topY, 0, topY + h, [
    [0, shade(0x8a7a6a, 20)],
    [0.3, shade(0x7a6a5a, 0)],
    [0.7, shade(0x6a5a4a, -10)],
    [1, shade(0x5a4a3a, -25)],
  ]);
  ctx.fillStyle = surfaceGrad;
  roundRect(ctx, 0, topY, s - 2, h, 4);
  ctx.fill();

  // front panel — darker wood side covering lower tile
  const panelGrad = linearGrad(ctx, 0, topY + h, 0, s * 0.95, [
    [0, shade(0x5a4a3a, -5)],
    [0.5, shade(0x4a3a2a, -15)],
    [1, shade(0x3a2a1a, -25)],
  ]);
  ctx.fillStyle = panelGrad;
  roundRect(ctx, 0, topY + h, s - 2, s * 0.35, 4);
  ctx.fill();

  // wood grain
  ctx.strokeStyle = hexRGBA(0x4a3a2a, 0.15);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    const y = topY + 4 + i * (h / 6);
    ctx.beginPath();
    ctx.moveTo(2, y + 0.5);
    ctx.bezierCurveTo(s * 0.3, y - 1, s * 0.6, y + 1, s - 6, y);
    ctx.stroke();
  }

  // top edge bevel
  ctx.strokeStyle = hexRGBA(0xaa9a8a, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4, topY + 1);
  ctx.lineTo(s - 4, topY + 1);
  ctx.stroke();

  // front edge shadow
  ctx.strokeStyle = hexRGBA(0x3a2a1a, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, topY + h - 1);
  ctx.lineTo(s - 2, topY + h - 1);
  ctx.stroke();
}

/** Office chair (tile 19) */
function drawOfficeChair(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.28, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5-star wheel base
  ctx.fillStyle = shade(0x2a2a30, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, s * 0.78);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, s * 0.12);
    ctx.lineTo(3, s * 0.12);
    ctx.closePath();
    ctx.fill();
    // wheel
    ctx.beginPath();
    ctx.arc(0, s * 0.13, 3, 0, Math.PI * 2);
    ctx.fillStyle = shade(0x1a1a20, 0);
    ctx.fill();
    ctx.fillStyle = shade(0x2a2a30, 0);
    ctx.restore();
  }

  // center column
  const colGrad = linearGrad(ctx, cx - 4, 0, cx + 4, 0, [
    [0, shade(0x1a1a20, -10)],
    [0.5, shade(0x3a3a40, 10)],
    [1, shade(0x1a1a20, -10)],
  ]);
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - 4, s * 0.5, 8, s * 0.28);

  // seat — cushioned
  const seatGrad = linearGrad(ctx, 0, s * 0.38, 0, s * 0.52, [
    [0, shade(0x3a4a5a, 20)],
    [0.5, shade(0x2a3a4a, 0)],
    [1, shade(0x1a2a3a, -15)],
  ]);
  ctx.fillStyle = seatGrad;
  roundRect(ctx, cx - s * 0.18, s * 0.38, s * 0.36, s * 0.14, 6);
  ctx.fill();
  // seat stitching line
  ctx.strokeStyle = hexRGBA(0x4a5a6a, 0.4);
  ctx.lineWidth = 0.8;
  roundRect(ctx, cx - s * 0.15, s * 0.4, s * 0.3, s * 0.1, 4);
  ctx.stroke();

  // backrest — ergonomic
  const backGrad = linearGrad(ctx, 0, s * 0.1, 0, s * 0.38, [
    [0, shade(0x3a4a5a, 25)],
    [0.5, shade(0x2a3a4a, 5)],
    [1, shade(0x1a2a3a, -10)],
  ]);
  ctx.fillStyle = backGrad;
  roundRect(ctx, cx - s * 0.16, s * 0.08, s * 0.32, s * 0.32, 8);
  ctx.fill();
  // backrest stitching
  ctx.strokeStyle = hexRGBA(0x4a5a6a, 0.3);
  ctx.lineWidth = 0.8;
  roundRect(ctx, cx - s * 0.13, s * 0.11, s * 0.26, s * 0.26, 6);
  ctx.stroke();
  // lumbar curve highlight
  ctx.fillStyle = hexRGBA(0x4a5a6a, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.28, s * 0.1, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // armrests
  ctx.fillStyle = shade(0x2a3a4a, -5);
  roundRect(ctx, cx - s * 0.22, s * 0.36, s * 0.05, s * 0.12, 3);
  ctx.fill();
  roundRect(ctx, cx + s * 0.17, s * 0.36, s * 0.05, s * 0.12, 3);
  ctx.fill();
}

/** Office chair facing up toward desk — rear view (assigned seat) */
function drawOfficeChairUp(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.26, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5-star wheel base at bottom (same as front — symmetrical)
  ctx.fillStyle = shade(0x2a2a30, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, s * 0.8);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, s * 0.1);
    ctx.lineTo(3, s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, s * 0.11, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = shade(0x1a1a20, 0);
    ctx.fill();
    ctx.fillStyle = shade(0x2a2a30, 0);
    ctx.restore();
  }

  // center column — short, mostly hidden behind seat
  const colGrad = linearGrad(ctx, cx - 3, 0, cx + 3, 0, [
    [0, shade(0x1a1a20, -10)],
    [0.5, shade(0x3a3a40, 10)],
    [1, shade(0x1a1a20, -10)],
  ]);
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - 3, s * 0.62, 6, s * 0.2);

  // seat — only the front edge visible peeking out below the backrest
  const seatGrad = linearGrad(ctx, 0, s * 0.54, 0, s * 0.66, [
    [0, shade(0x2a3a4a, 5)],
    [0.5, shade(0x1a2a3a, -5)],
    [1, shade(0x1a2a3a, -15)],
  ]);
  ctx.fillStyle = seatGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, s * 0.54);
  ctx.lineTo(cx + s * 0.14, s * 0.54);
  ctx.lineTo(cx + s * 0.16, s * 0.66);
  ctx.lineTo(cx - s * 0.16, s * 0.66);
  ctx.closePath();
  ctx.fill();

  // back of backrest — the dominant feature, showing rear surface
  // slightly narrower at top (ergonomic flare), wider at bottom
  const backGrad = linearGrad(ctx, 0, s * 0.08, 0, s * 0.58, [
    [0, shade(0x2a3a4a, 10)],
    [0.3, shade(0x2a3a4a, 0)],
    [0.7, shade(0x1a2a3a, -8)],
    [1, shade(0x1a2a3a, -18)],
  ]);
  ctx.fillStyle = backGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.13, s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.16, s * 0.08, cx - s * 0.15, s * 0.12);
  ctx.lineTo(cx - s * 0.17, s * 0.52);
  ctx.quadraticCurveTo(cx - s * 0.17, s * 0.58, cx - s * 0.13, s * 0.58);
  ctx.lineTo(cx + s * 0.13, s * 0.58);
  ctx.quadraticCurveTo(cx + s * 0.17, s * 0.58, cx + s * 0.17, s * 0.52);
  ctx.lineTo(cx + s * 0.15, s * 0.12);
  ctx.quadraticCurveTo(cx + s * 0.16, s * 0.08, cx + s * 0.13, s * 0.1);
  ctx.quadraticCurveTo(cx, s * 0.06, cx - s * 0.13, s * 0.1);
  ctx.closePath();
  ctx.fill();

  // rear seam — vertical stitch line down the middle of the back
  ctx.strokeStyle = hexRGBA(0x4a5a6a, 0.2);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.14);
  ctx.lineTo(cx, s * 0.52);
  ctx.stroke();

  // subtle horizontal support lines on backrest
  ctx.strokeStyle = hexRGBA(0x4a5a6a, 0.12);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) {
    const y = s * 0.2 + i * s * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.14, y);
    ctx.quadraticCurveTo(cx, y + 1, cx + s * 0.14, y);
    ctx.stroke();
  }

  // top edge highlight — catches light from above
  ctx.fillStyle = hexRGBA(0x5a6a7a, 0.25);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, s * 0.1);
  ctx.quadraticCurveTo(cx, s * 0.07, cx + s * 0.12, s * 0.1);
  ctx.lineTo(cx + s * 0.11, s * 0.14);
  ctx.quadraticCurveTo(cx, s * 0.11, cx - s * 0.11, s * 0.14);
  ctx.closePath();
  ctx.fill();

  // armrest tops — just the tips visible on either side of the backrest
  ctx.fillStyle = shade(0x2a3a4a, -8);
  roundRect(ctx, cx - s * 0.2, s * 0.36, s * 0.04, s * 0.08, 2);
  ctx.fill();
  roundRect(ctx, cx + s * 0.16, s * 0.36, s * 0.04, s * 0.08, 2);
  ctx.fill();
}

/** Office chair facing left — side view (Yuki's chair) */
function drawOfficeChairLeft(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.28, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5-star wheel base
  ctx.fillStyle = shade(0x2a2a30, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, s * 0.78);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, s * 0.12);
    ctx.lineTo(3, s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, s * 0.13, 3, 0, Math.PI * 2);
    ctx.fillStyle = shade(0x1a1a20, 0);
    ctx.fill();
    ctx.fillStyle = shade(0x2a2a30, 0);
    ctx.restore();
  }

  // center column
  const colGrad = linearGrad(ctx, cx - 4, 0, cx + 4, 0, [
    [0, shade(0x1a1a20, -10)],
    [0.5, shade(0x3a3a40, 10)],
    [1, shade(0x1a1a20, -10)],
  ]);
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - 4, s * 0.5, 8, s * 0.28);

  // seat — viewed from side, narrower
  const seatGrad = linearGrad(ctx, 0, s * 0.38, 0, s * 0.52, [
    [0, shade(0x3a4a5a, 20)],
    [0.5, shade(0x2a3a4a, 0)],
    [1, shade(0x1a2a3a, -15)],
  ]);
  ctx.fillStyle = seatGrad;
  roundRect(ctx, cx - s * 0.14, s * 0.38, s * 0.28, s * 0.14, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a5a6a, 0.4);
  ctx.lineWidth = 0.8;
  roundRect(ctx, cx - s * 0.11, s * 0.4, s * 0.22, s * 0.1, 4);
  ctx.stroke();

  // backrest — on right side (chair faces left)
  const backGrad = linearGrad(ctx, s * 0.55, 0, s * 0.92, 0, [
    [0, shade(0x3a4a5a, 25)],
    [0.5, shade(0x2a3a4a, 5)],
    [1, shade(0x1a2a3a, -10)],
  ]);
  ctx.fillStyle = backGrad;
  roundRect(ctx, s * 0.55, s * 0.08, s * 0.32, s * 0.34, 8);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a5a6a, 0.3);
  ctx.lineWidth = 0.8;
  roundRect(ctx, s * 0.58, s * 0.11, s * 0.26, s * 0.28, 6);
  ctx.stroke();
  ctx.fillStyle = hexRGBA(0x4a5a6a, 0.15);
  ctx.beginPath();
  ctx.ellipse(s * 0.71, s * 0.25, s * 0.04, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // armrest (left side only visible from this angle)
  ctx.fillStyle = shade(0x2a3a4a, -5);
  roundRect(ctx, cx - s * 0.18, s * 0.36, s * 0.05, s * 0.12, 3);
  ctx.fill();
}

/** Small plant (tile 20) */
function drawSmallPlant(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.82, s * 0.2, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // pot — ceramic with gradient
  const potGrad = linearGrad(ctx, cx - s * 0.16, 0, cx + s * 0.16, 0, [
    [0, shade(0x8a6a4a, -20)],
    [0.5, shade(0xaa8a6a, 10)],
    [1, shade(0x8a6a4a, -20)],
  ]);
  ctx.fillStyle = potGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, s * 0.6);
  ctx.lineTo(cx - s * 0.1, s * 0.82);
  ctx.lineTo(cx + s * 0.1, s * 0.82);
  ctx.lineTo(cx + s * 0.14, s * 0.6);
  ctx.closePath();
  ctx.fill();
  // pot rim
  ctx.fillStyle = shade(0xaa8a6a, 15);
  roundRect(ctx, cx - s * 0.16, s * 0.57, s * 0.32, s * 0.05, 2);
  ctx.fill();
  // pot texture
  ctx.strokeStyle = hexRGBA(0x6a4a2a, 0.3);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, s * 0.65);
  ctx.lineTo(cx + s * 0.12, s * 0.65);
  ctx.stroke();

  // soil
  ctx.fillStyle = hexRGBA(0x3a2a1a, 0.8);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.59, s * 0.12, s * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();

  // leaves — layered, organic
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const len = s * 0.18 + Math.random() * 6;
    const lx = cx + Math.cos(a) * s * 0.05;
    const ly = s * 0.58 + Math.sin(a) * s * 0.03;
    const tipX = cx + Math.cos(a) * len;
    const tipY = ly - Math.abs(Math.sin(a)) * len * 0.5 - s * 0.05;

    const leafGrad = linearGrad(ctx, lx, ly, tipX, tipY, [
      [0, shade(0x3a6a2a, 10)],
      [0.5, shade(0x2a5a1a, 0)],
      [1, shade(0x1a4a0a, -15)],
    ]);
    ctx.fillStyle = leafGrad;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(
      lx + Math.cos(a + 0.5) * len * 0.6,
      ly - len * 0.4,
      tipX, tipY,
    );
    ctx.quadraticCurveTo(
      lx + Math.cos(a - 0.5) * len * 0.6,
      ly - len * 0.3,
      lx, ly,
    );
    ctx.fill();
    // leaf vein
    ctx.strokeStyle = hexRGBA(0x4a8a3a, 0.3);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
}

/** Wall decoration / framed picture (tile 21) */
function drawWallPicture(ctx: CanvasRenderingContext2D, s: number): void {
  // frame — dark wood
  const frameGrad = linearGrad(ctx, 0, 0, s, s, [
    [0, shade(0x5a4a3a, 10)],
    [0.5, shade(0x4a3a2a, 0)],
    [1, shade(0x3a2a1a, -15)],
  ]);
  ctx.fillStyle = frameGrad;
  roundRect(ctx, s * 0.15, s * 0.15, s * 0.7, s * 0.5, 3);
  ctx.fill();

  // inner frame bevel
  ctx.strokeStyle = hexRGBA(0x6a5a4a, 0.5);
  ctx.lineWidth = 1.5;
  roundRect(ctx, s * 0.15, s * 0.15, s * 0.7, s * 0.5, 3);
  ctx.stroke();

  // matting
  ctx.fillStyle = hexRGBA(0xeae8e0, 0.9);
  roundRect(ctx, s * 0.19, s * 0.19, s * 0.62, s * 0.42, 2);
  ctx.fill();

  // artwork — abstract landscape
  // sky
  const skyGrad = linearGrad(ctx, 0, s * 0.2, 0, s * 0.38, [
    [0, rgba(180, 200, 220, 0.9)],
    [1, rgba(220, 230, 240, 0.9)],
  ]);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(s * 0.22, s * 0.22, s * 0.56, s * 0.16);

  // mountains
  ctx.fillStyle = rgba(80, 90, 100, 0.85);
  ctx.beginPath();
  ctx.moveTo(s * 0.22, s * 0.38);
  ctx.lineTo(s * 0.35, s * 0.28);
  ctx.lineTo(s * 0.45, s * 0.35);
  ctx.lineTo(s * 0.55, s * 0.26);
  ctx.lineTo(s * 0.7, s * 0.36);
  ctx.lineTo(s * 0.78, s * 0.38);
  ctx.closePath();
  ctx.fill();

  // ground
  ctx.fillStyle = rgba(120, 100, 70, 0.8);
  ctx.fillRect(s * 0.22, s * 0.38, s * 0.56, s * 0.2);

  // glass reflection
  ctx.fillStyle = hexRGBA(0xffffff, 0.08);
  ctx.beginPath();
  ctx.moveTo(s * 0.2, s * 0.17);
  ctx.lineTo(s * 0.4, s * 0.17);
  ctx.lineTo(s * 0.2, s * 0.5);
  ctx.lineTo(s * 0.15, s * 0.5);
  ctx.closePath();
  ctx.fill();
}

/** Window on wall (tile 22) */
function drawWindow(ctx: CanvasRenderingContext2D, s: number): void {
  // outer frame
  ctx.fillStyle = shade(0x4a4a50, -10);
  roundRect(ctx, s * 0.08, s * 0.1, s * 0.84, s * 0.6, 4);
  ctx.fill();

  // frame highlight
  ctx.strokeStyle = hexRGBA(0x6a6a70, 0.5);
  ctx.lineWidth = 1.5;
  roundRect(ctx, s * 0.08, s * 0.1, s * 0.84, s * 0.6, 4);
  ctx.stroke();

  // glass — sky gradient
  const glassGrad = linearGrad(ctx, 0, s * 0.12, 0, s * 0.68, [
    [0, rgba(140, 180, 220, 0.9)],
    [0.5, rgba(180, 210, 240, 0.85)],
    [1, rgba(200, 220, 240, 0.8)],
  ]);
  ctx.fillStyle = glassGrad;
  ctx.fillRect(s * 0.12, s * 0.14, s * 0.76, s * 0.52);

  // cross frame — mullions
  ctx.fillStyle = shade(0x4a4a50, 0);
  ctx.fillRect(s * 0.49, s * 0.14, 3, s * 0.52);
  ctx.fillRect(s * 0.12, s * 0.39, s * 0.76, 3);

  // distant skyline silhouette
  ctx.fillStyle = hexRGBA(0x6a7a8a, 0.3);
  ctx.fillRect(s * 0.14, s * 0.3, s * 0.1, s * 0.08);
  ctx.fillRect(s * 0.26, s * 0.25, s * 0.08, s * 0.13);
  ctx.fillRect(s * 0.36, s * 0.28, s * 0.06, s * 0.1);
  ctx.fillRect(s * 0.55, s * 0.26, s * 0.07, s * 0.12);
  ctx.fillRect(s * 0.64, s * 0.3, s * 0.09, s * 0.08);
  ctx.fillRect(s * 0.75, s * 0.27, s * 0.06, s * 0.11);

  // glass reflection — diagonal streak
  ctx.fillStyle = hexRGBA(0xffffff, 0.1);
  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.16);
  ctx.lineTo(s * 0.3, s * 0.16);
  ctx.lineTo(s * 0.15, s * 0.4);
  ctx.lineTo(s * 0.15, s * 0.3);
  ctx.closePath();
  ctx.fill();

  // windowsill
  ctx.fillStyle = shade(0x5a5a60, 5);
  roundRect(ctx, s * 0.06, s * 0.68, s * 0.88, s * 0.06, 2);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x7a7a80, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Coffee machine — top half (tile 23) */
function drawCoffeeMachineTop(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // machine body — metallic
  const bodyGrad = linearGrad(ctx, cx - s * 0.2, 0, cx + s * 0.2, 0, [
    [0, shade(0x3a3a40, -15)],
    [0.3, shade(0x5a5a60, 15)],
    [0.7, shade(0x4a4a50, 5)],
    [1, shade(0x2a2a30, -20)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, cx - s * 0.2, s * 0.05, s * 0.4, s * 0.5, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x1a1a20, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // top panel — display screen
  ctx.fillStyle = hexRGBA(0x0a0a12, 0.9);
  roundRect(ctx, cx - s * 0.12, s * 0.1, s * 0.24, s * 0.12, 3);
  ctx.fill();
  // display glow
  ctx.fillStyle = hexRGBA(0x44ff88, 0.6);
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("●●●", cx, s * 0.18);

  // button row
  for (let i = 0; i < 3; i++) {
    const bx = cx - s * 0.1 + i * s * 0.1;
    ctx.beginPath();
    ctx.arc(bx, s * 0.3, 4, 0, Math.PI * 2);
    ctx.fillStyle = shade(0x2a2a30, 0);
    ctx.fill();
    ctx.strokeStyle = hexRGBA(0x6a6a70, 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
    // button LED
    ctx.beginPath();
    ctx.arc(bx, s * 0.3, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? hexRGBA(0x44ff44, 0.8) : hexRGBA(0xff4444, 0.5);
    ctx.fill();
  }

  // spout area
  ctx.fillStyle = shade(0x2a2a30, -10);
  roundRect(ctx, cx - s * 0.08, s * 0.38, s * 0.16, s * 0.12, 3);
  ctx.fill();
  // spout nozzles
  ctx.fillStyle = shade(0x1a1a20, 0);
  ctx.fillRect(cx - 5, s * 0.42, 3, 6);
  ctx.fillRect(cx + 2, s * 0.42, 3, 6);

  // brand label
  ctx.fillStyle = hexRGBA(0x8a8a90, 0.5);
  ctx.font = "bold 6px sans-serif";
  ctx.fillText("BREW", cx, s * 0.52);
}

/** Coffee machine — bottom half / cup tray (tile 24) */
function drawCoffeeMachineBottom(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // drip tray
  const trayGrad = linearGrad(ctx, 0, s * 0.05, 0, s * 0.25, [
    [0, shade(0x4a4a50, 10)],
    [1, shade(0x2a2a30, -10)],
  ]);
  ctx.fillStyle = trayGrad;
  roundRect(ctx, cx - s * 0.18, s * 0.05, s * 0.36, s * 0.1, 3);
  ctx.fill();
  // tray grate
  ctx.strokeStyle = hexRGBA(0x1a1a20, 0.6);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    const x = cx - s * 0.15 + i * (s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, s * 0.07);
    ctx.lineTo(x, s * 0.13);
    ctx.stroke();
  }

  // coffee cup
  const cupGrad = linearGrad(ctx, cx - s * 0.08, 0, cx + s * 0.08, 0, [
    [0, shade(0xeeeeee, -10)],
    [0.5, shade(0xffffff, 0)],
    [1, shade(0xdddddd, -15)],
  ]);
  ctx.fillStyle = cupGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.07, s * 0.2);
  ctx.lineTo(cx - s * 0.05, s * 0.42);
  ctx.lineTo(cx + s * 0.05, s * 0.42);
  ctx.lineTo(cx + s * 0.07, s * 0.2);
  ctx.closePath();
  ctx.fill();
  // cup rim
  ctx.strokeStyle = hexRGBA(0x999999, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.2, s * 0.07, s * 0.02, 0, 0, Math.PI * 2);
  ctx.stroke();
  // coffee inside
  ctx.fillStyle = hexRGBA(0x3a1a0a, 0.85);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.21, s * 0.06, s * 0.015, 0, 0, Math.PI * 2);
  ctx.fill();
  // crema
  ctx.fillStyle = hexRGBA(0x6a3a1a, 0.4);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.21, s * 0.04, s * 0.008, 0, 0, Math.PI * 2);
  ctx.fill();

  // cup handle
  ctx.strokeStyle = shade(0xdddddd, -10);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx + s * 0.09, s * 0.3, s * 0.04, -1, 1);
  ctx.stroke();

  // steam
  ctx.strokeStyle = hexRGBA(0xffffff, 0.2);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - 4 + i * 4, s * 0.18);
    ctx.quadraticCurveTo(cx - 6 + i * 4, s * 0.1, cx - 3 + i * 4, s * 0.04);
    ctx.stroke();
  }
}

/** Water cooler / kitchen counter item (tile 25) */
function drawWaterCooler(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.22, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // water jug — translucent blue
  const jugGrad = linearGrad(ctx, cx - s * 0.15, 0, cx + s * 0.15, 0, [
    [0, rgba(120, 180, 220, 0.5)],
    [0.5, rgba(160, 200, 230, 0.6)],
    [1, rgba(120, 180, 220, 0.5)],
  ]);
  ctx.fillStyle = jugGrad;
  roundRect(ctx, cx - s * 0.14, s * 0.05, s * 0.28, s * 0.3, 8);
  ctx.fill();
  // jug neck
  ctx.fillStyle = rgba(140, 190, 220, 0.5);
  ctx.fillRect(cx - s * 0.06, s * 0.02, s * 0.12, s * 0.05);
  // water level
  ctx.fillStyle = rgba(100, 170, 210, 0.4);
  ctx.fillRect(cx - s * 0.12, s * 0.2, s * 0.24, s * 0.13);
  // jug highlight
  ctx.fillStyle = hexRGBA(0xffffff, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.07, s * 0.15, s * 0.03, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // cooler body
  const bodyGrad = linearGrad(ctx, cx - s * 0.16, 0, cx + s * 0.16, 0, [
    [0, shade(0xcccccc, -15)],
    [0.5, shade(0xeeeeee, 5)],
    [1, shade(0xcccccc, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, cx - s * 0.16, s * 0.35, s * 0.32, s * 0.5, 5);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x999999, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();

  // tap area
  ctx.fillStyle = shade(0xaaaaaa, -10);
  roundRect(ctx, cx - s * 0.1, s * 0.4, s * 0.2, s * 0.1, 3);
  ctx.fill();
  // taps — red and blue
  ctx.beginPath();
  ctx.arc(cx - s * 0.04, s * 0.45, 4, 0, Math.PI * 2);
  ctx.fillStyle = shade(0xcc3333, 10);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x882222, 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + s * 0.04, s * 0.45, 4, 0, Math.PI * 2);
  ctx.fillStyle = shade(0x3333cc, 10);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x222288, 0.5);
  ctx.stroke();
  // drip tray
  ctx.fillStyle = shade(0xbbbbbb, -5);
  roundRect(ctx, cx - s * 0.1, s * 0.55, s * 0.2, s * 0.04, 2);
  ctx.fill();

  // cup dispenser
  ctx.fillStyle = shade(0xdddddd, 0);
  roundRect(ctx, cx - s * 0.05, s * 0.65, s * 0.1, s * 0.15, 2);
  ctx.fill();
  // stacked cups
  ctx.strokeStyle = hexRGBA(0x888888, 0.4);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.03, s * 0.68 + i * 3);
    ctx.lineTo(cx + s * 0.03, s * 0.68 + i * 3);
    ctx.stroke();
  }
}

/** Kitchen counter (tile 26) */
function drawKitchenCounter(ctx: CanvasRenderingContext2D, s: number): void {
  // counter base
  const baseGrad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.85, [
    [0, shade(0x6a6a72, 10)],
    [0.5, shade(0x5a5a62, 0)],
    [1, shade(0x4a4a52, -15)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, 2, s * 0.3, s - 4, s * 0.55, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a42, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // countertop — granite look
  const topGrad = linearGrad(ctx, 0, s * 0.2, 0, s * 0.32, [
    [0, shade(0x3a3a3a, 15)],
    [0.5, shade(0x2a2a2a, 5)],
    [1, shade(0x1a1a1a, -5)],
  ]);
  ctx.fillStyle = topGrad;
  roundRect(ctx, 0, s * 0.2, s, s * 0.12, 2);
  ctx.fill();
  // granite speckles
  ctx.fillStyle = hexRGBA(0x5a5a5a, 0.3);
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * s, s * 0.22 + Math.random() * s * 0.08, 0.8 + Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }
  // countertop edge highlight
  ctx.strokeStyle = hexRGBA(0x5a5a5a, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.21);
  ctx.lineTo(s, s * 0.21);
  ctx.stroke();

  // cabinet doors
  ctx.fillStyle = shade(0x5a5a62, -5);
  roundRect(ctx, s * 0.08, s * 0.4, s * 0.35, s * 0.35, 3);
  ctx.fill();
  roundRect(ctx, s * 0.53, s * 0.4, s * 0.35, s * 0.35, 3);
  ctx.fill();
  // cabinet handles
  ctx.fillStyle = shade(0x8a8a92, 10);
  ctx.fillRect(s * 0.38, s * 0.52, 3, 10);
  ctx.fillRect(s * 0.55, s * 0.52, 3, 10);
}

/** Kitchen sink (tile 27) */
function drawKitchenSink(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // counter base (same as counter)
  const baseGrad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.85, [
    [0, shade(0x6a6a72, 10)],
    [0.5, shade(0x5a5a62, 0)],
    [1, shade(0x4a4a52, -15)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, 2, s * 0.3, s - 4, s * 0.55, 3);
  ctx.fill();

  // countertop
  ctx.fillStyle = shade(0x2a2a2a, 5);
  roundRect(ctx, 0, s * 0.2, s, s * 0.12, 2);
  ctx.fill();

  // sink basin — stainless steel
  const sinkGrad = linearGrad(ctx, cx - s * 0.15, s * 0.22, cx + s * 0.15, s * 0.32, [
    [0, shade(0x9a9aa0, 10)],
    [0.5, shade(0xbabac0, 20)],
    [1, shade(0x8a8a90, -5)],
  ]);
  ctx.fillStyle = sinkGrad;
  roundRect(ctx, cx - s * 0.15, s * 0.22, s * 0.3, s * 0.1, 4);
  ctx.fill();
  // basin depth
  ctx.fillStyle = hexRGBA(0x3a3a40, 0.5);
  roundRect(ctx, cx - s * 0.13, s * 0.24, s * 0.26, s * 0.06, 3);
  ctx.fill();
  // sink rim
  ctx.strokeStyle = hexRGBA(0x6a6a70, 0.5);
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - s * 0.15, s * 0.22, s * 0.3, s * 0.1, 4);
  ctx.stroke();

  // faucet
  ctx.strokeStyle = shade(0xaaaab0, 5);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.2);
  ctx.lineTo(cx, s * 0.12);
  ctx.lineTo(cx + s * 0.08, s * 0.12);
  ctx.lineTo(cx + s * 0.08, s * 0.18);
  ctx.stroke();
  // faucet handle
  ctx.fillStyle = shade(0x888890, 0);
  ctx.beginPath();
  ctx.arc(cx - s * 0.03, s * 0.16, 3, 0, Math.PI * 2);
  ctx.fill();

  // water drop
  ctx.fillStyle = hexRGBA(0x6699cc, 0.5);
  ctx.beginPath();
  ctx.arc(cx + s * 0.08, s * 0.2, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Kitchen item / microwave (tile 28) */
function drawMicrowave(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.78, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  const bodyGrad = linearGrad(ctx, 0, s * 0.15, 0, s * 0.7, [
    [0, shade(0x9a9a9e, 10)],
    [0.5, shade(0x7a7a7e, 0)],
    [1, shade(0x5a5a5e, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, s * 0.1, s * 0.15, s * 0.8, s * 0.55, 5);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a4a4e, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // door window
  ctx.fillStyle = hexRGBA(0x1a1a22, 0.85);
  roundRect(ctx, s * 0.15, s * 0.22, s * 0.45, s * 0.4, 3);
  ctx.fill();
  // window grid
  ctx.strokeStyle = hexRGBA(0x3a3a42, 0.4);
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.15, s * 0.22 + i * (s * 0.1));
    ctx.lineTo(s * 0.6, s * 0.22 + i * (s * 0.1));
    ctx.stroke();
  }
  // interior glow
  ctx.fillStyle = hexRGBA(0xffaa44, 0.1);
  ctx.fillRect(s * 0.17, s * 0.24, s * 0.41, s * 0.36);

  // control panel
  ctx.fillStyle = shade(0x3a3a40, 0);
  roundRect(ctx, s * 0.65, s * 0.22, s * 0.2, s * 0.4, 2);
  ctx.fill();
  // digital display
  ctx.fillStyle = hexRGBA(0x00ff44, 0.6);
  ctx.font = "bold 7px monospace";
  ctx.textAlign = "center";
  ctx.fillText("0:00", s * 0.75, s * 0.3);
  // buttons
  ctx.fillStyle = shade(0x5a5a60, 0);
  for (let i = 0; i < 6; i++) {
    const bx = s * 0.69 + (i % 2) * s * 0.08;
    const by = s * 0.38 + Math.floor(i / 2) * s * 0.07;
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // handle
  ctx.fillStyle = shade(0x4a4a50, -5);
  roundRect(ctx, s * 0.6, s * 0.25, 4, s * 0.35, 2);
  ctx.fill();
}

/** Sofa — left half (tile 29) */
function drawSofaLeft(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.48, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // base
  const baseGrad = linearGrad(ctx, 0, s * 0.4, 0, s * 0.8, [
    [0, shade(0x4a5a6a, 10)],
    [0.5, shade(0x3a4a5a, 0)],
    [1, shade(0x2a3a4a, -15)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, 0, s * 0.4, s, s * 0.4, 6);
  ctx.fill();

  // seat cushion
  const cushionGrad = linearGrad(ctx, 0, s * 0.35, 0, s * 0.55, [
    [0, shade(0x5a6a7a, 20)],
    [0.5, shade(0x4a5a6a, 5)],
    [1, shade(0x3a4a5a, -10)],
  ]);
  ctx.fillStyle = cushionGrad;
  roundRect(ctx, 2, s * 0.35, s - 2, s * 0.2, 8);
  ctx.fill();
  // cushion stitching
  ctx.strokeStyle = hexRGBA(0x6a7a8a, 0.3);
  ctx.lineWidth = 0.8;
  roundRect(ctx, 5, s * 0.38, s - 8, s * 0.14, 6);
  ctx.stroke();
  // cushion tufting
  ctx.fillStyle = hexRGBA(0x2a3a4a, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.45, 2, 0, Math.PI * 2);
  ctx.fill();

  // backrest
  const backGrad = linearGrad(ctx, 0, s * 0.1, 0, s * 0.38, [
    [0, shade(0x5a6a7a, 25)],
    [0.5, shade(0x4a5a6a, 10)],
    [1, shade(0x3a4a5a, -5)],
  ]);
  ctx.fillStyle = backGrad;
  roundRect(ctx, 0, s * 0.1, s, s * 0.28, 8);
  ctx.fill();
  // back stitching
  ctx.strokeStyle = hexRGBA(0x6a7a8a, 0.3);
  ctx.lineWidth = 0.8;
  roundRect(ctx, 3, s * 0.13, s - 6, s * 0.22, 6);
  ctx.stroke();

  // left armrest
  ctx.fillStyle = shade(0x3a4a5a, 5);
  roundRect(ctx, 0, s * 0.15, s * 0.12, s * 0.55, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x5a6a7a, 0.3);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // legs
  ctx.fillStyle = shade(0x2a2a30, -5);
  ctx.fillRect(s * 0.05, s * 0.78, 5, s * 0.08);
}

/** Sofa — right half (tile 30) */
function drawSofaRight(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.48, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // base
  const baseGrad = linearGrad(ctx, 0, s * 0.4, 0, s * 0.8, [
    [0, shade(0x4a5a6a, 10)],
    [0.5, shade(0x3a4a5a, 0)],
    [1, shade(0x2a3a4a, -15)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, 0, s * 0.4, s, s * 0.4, 6);
  ctx.fill();

  // seat cushion
  const cushionGrad = linearGrad(ctx, 0, s * 0.35, 0, s * 0.55, [
    [0, shade(0x5a6a7a, 20)],
    [0.5, shade(0x4a5a6a, 5)],
    [1, shade(0x3a4a5a, -10)],
  ]);
  ctx.fillStyle = cushionGrad;
  roundRect(ctx, 0, s * 0.35, s - 2, s * 0.2, 8);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x6a7a8a, 0.3);
  ctx.lineWidth = 0.8;
  roundRect(ctx, 3, s * 0.38, s - 8, s * 0.14, 6);
  ctx.stroke();
  ctx.fillStyle = hexRGBA(0x2a3a4a, 0.3);
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.45, 2, 0, Math.PI * 2);
  ctx.fill();

  // backrest
  const backGrad = linearGrad(ctx, 0, s * 0.1, 0, s * 0.38, [
    [0, shade(0x5a6a7a, 25)],
    [0.5, shade(0x4a5a6a, 10)],
    [1, shade(0x3a4a5a, -5)],
  ]);
  ctx.fillStyle = backGrad;
  roundRect(ctx, 0, s * 0.1, s, s * 0.28, 8);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x6a7a8a, 0.3);
  ctx.lineWidth = 0.8;
  roundRect(ctx, 3, s * 0.13, s - 6, s * 0.22, 6);
  ctx.stroke();

  // right armrest
  ctx.fillStyle = shade(0x3a4a5a, 5);
  roundRect(ctx, s * 0.88, s * 0.15, s * 0.12, s * 0.55, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x5a6a7a, 0.3);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // legs
  ctx.fillStyle = shade(0x2a2a30, -5);
  ctx.fillRect(s * 0.9, s * 0.78, 5, s * 0.08);
}

/** Large plant (tile 31) */
function drawLargePlant(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.25, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // pot — larger, tapered
  const potGrad = linearGrad(ctx, cx - s * 0.2, 0, cx + s * 0.2, 0, [
    [0, shade(0x7a5a3a, -20)],
    [0.5, shade(0x9a7a5a, 10)],
    [1, shade(0x7a5a3a, -20)],
  ]);
  ctx.fillStyle = potGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.18, s * 0.62);
  ctx.lineTo(cx - s * 0.14, s * 0.86);
  ctx.lineTo(cx + s * 0.14, s * 0.86);
  ctx.lineTo(cx + s * 0.18, s * 0.62);
  ctx.closePath();
  ctx.fill();
  // pot rim
  ctx.fillStyle = shade(0x9a7a5a, 15);
  roundRect(ctx, cx - s * 0.2, s * 0.58, s * 0.4, s * 0.06, 2);
  ctx.fill();
  // pot texture lines
  ctx.strokeStyle = hexRGBA(0x5a3a1a, 0.3);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.16, s * 0.68 + i * s * 0.06);
    ctx.lineTo(cx + s * 0.16, s * 0.68 + i * s * 0.06);
    ctx.stroke();
  }

  // soil
  ctx.fillStyle = hexRGBA(0x3a2a1a, 0.85);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.6, s * 0.16, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // tall leaves — dracaena-like
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.25;
    const len = s * 0.25 + Math.abs(i - 4) * 3 + Math.random() * 4;
    const baseX = cx + (i - 4) * 2;
    const baseY = s * 0.6;
    const tipX = baseX + Math.cos(a) * len;
    const tipY = baseY + Math.sin(a) * len;

    const leafGrad = linearGrad(ctx, baseX, baseY, tipX, tipY, [
      [0, shade(0x4a8a3a, 15)],
      [0.5, shade(0x3a6a2a, 0)],
      [1, shade(0x2a5a1a, -15)],
    ]);
    ctx.fillStyle = leafGrad;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(
      baseX + Math.cos(a + 0.3) * len * 0.7,
      baseY + Math.sin(a + 0.3) * len * 0.7,
      tipX, tipY,
    );
    ctx.quadraticCurveTo(
      baseX + Math.cos(a - 0.3) * len * 0.7,
      baseY + Math.sin(a - 0.3) * len * 0.7,
      baseX, baseY,
    );
    ctx.fill();
    // central vein
    ctx.strokeStyle = hexRGBA(0x5a9a4a, 0.25);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(
      baseX + Math.cos(a) * len * 0.5,
      baseY + Math.sin(a) * len * 0.5,
      tipX, tipY,
    );
    ctx.stroke();
  }
}

/** Toaster / kitchen appliance (tile 32) */
function drawToaster(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.72, s * 0.22, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // body — chrome
  const bodyGrad = linearGrad(ctx, cx - s * 0.15, s * 0.3, cx + s * 0.15, s * 0.7, [
    [0, shade(0xaaaaae, 15)],
    [0.3, shade(0xccccce, 20)],
    [0.7, shade(0x99999c, 0)],
    [1, shade(0x77777a, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, cx - s * 0.15, s * 0.3, s * 0.3, s * 0.4, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x666668, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();

  // toast slots
  ctx.fillStyle = hexRGBA(0x1a1a1e, 0.9);
  roundRect(ctx, cx - s * 0.1, s * 0.32, s * 0.07, s * 0.08, 2);
  ctx.fill();
  roundRect(ctx, cx + s * 0.03, s * 0.32, s * 0.07, s * 0.08, 2);
  ctx.fill();
  // slot interior glow
  ctx.fillStyle = hexRGBA(0xff6622, 0.15);
  ctx.fillRect(cx - s * 0.09, s * 0.34, s * 0.05, s * 0.04);
  ctx.fillRect(cx + s * 0.04, s * 0.34, s * 0.05, s * 0.04);

  // control dial
  ctx.beginPath();
  ctx.arc(cx, s * 0.52, 5, 0, Math.PI * 2);
  ctx.fillStyle = shade(0x333335, 0);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x666668, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  // dial indicator
  ctx.strokeStyle = hexRGBA(0xeeeeff, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.52);
  ctx.lineTo(cx + 3, s * 0.49);
  ctx.stroke();

  // lever
  ctx.fillStyle = shade(0x444446, 0);
  roundRect(ctx, cx + s * 0.08, s * 0.35, 4, s * 0.1, 2);
  ctx.fill();
  ctx.fillStyle = shade(0x666668, 10);
  ctx.fillRect(cx + s * 0.08, s * 0.35, 4, 3);

  // crumb tray line
  ctx.strokeStyle = hexRGBA(0x555556, 0.4);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, s * 0.65);
  ctx.lineTo(cx + s * 0.12, s * 0.65);
  ctx.stroke();

  // chrome reflection
  ctx.fillStyle = hexRGBA(0xffffff, 0.15);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, s * 0.33);
  ctx.lineTo(cx - s * 0.05, s * 0.33);
  ctx.lineTo(cx - s * 0.1, s * 0.6);
  ctx.lineTo(cx - s * 0.13, s * 0.6);
  ctx.closePath();
  ctx.fill();
}

/** Desk monitor (tile 33) */
function drawDeskMonitor(ctx: CanvasRenderingContext2D, s: number, lit: boolean = false): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.82, s * 0.22, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // stand base
  ctx.fillStyle = shade(0x2a2a30, 0);
  roundRect(ctx, cx - s * 0.12, s * 0.75, s * 0.24, s * 0.06, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a4a50, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();

  // stand neck
  const neckGrad = linearGrad(ctx, cx - 3, 0, cx + 3, 0, [
    [0, shade(0x1a1a20, -5)],
    [0.5, shade(0x3a3a40, 10)],
    [1, shade(0x1a1a20, -5)],
  ]);
  ctx.fillStyle = neckGrad;
  ctx.fillRect(cx - 3, s * 0.5, 6, s * 0.28);

  // monitor body — slim bezel
  const bezelGrad = linearGrad(ctx, 0, s * 0.1, 0, s * 0.55, [
    [0, shade(0x2a2a30, 5)],
    [0.5, shade(0x1a1a20, 0)],
    [1, shade(0x0a0a10, -10)],
  ]);
  ctx.fillStyle = bezelGrad;
  roundRect(ctx, s * 0.12, s * 0.08, s * 0.76, s * 0.46, 4);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a40, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // screen
  if (lit) {
    ctx.fillStyle = hexRGBA(0xaaccff, 0.5);
  } else {
    ctx.fillStyle = hexRGBA(0x0a0a14, 0.95);
  }
  roundRect(ctx, s * 0.15, s * 0.11, s * 0.7, s * 0.4, 2);
  ctx.fill();

  if (!lit) {
    // screen content — code editor look
    ctx.fillStyle = hexRGBA(0x4488cc, 0.15);
    ctx.fillRect(s * 0.17, s * 0.13, s * 0.66, s * 0.36);
    // code lines
    const lineColors = [0x4a9acd, 0xcc8844, 0x88cc66, 0x666688];
    for (let i = 0; i < 8; i++) {
      const ly = s * 0.15 + i * (s * 0.045);
      const indent = (i % 3) * s * 0.04;
      const lineW = s * (0.15 + Math.random() * 0.3);
      ctx.fillStyle = hexRGBA(lineColors[i % lineColors.length], 0.5);
      ctx.fillRect(s * 0.19 + indent, ly, lineW, 2);
    }
  }

  // screen glow
  if (lit) {
    ctx.fillStyle = hexRGBA(0xffffff, 0.1);
  } else {
    ctx.fillStyle = hexRGBA(0x4488ff, 0.05);
  }
  roundRect(ctx, s * 0.15, s * 0.11, s * 0.7, s * 0.4, 2);
  ctx.fill();

  // power LED
  ctx.beginPath();
  ctx.arc(s * 0.82, s * 0.52, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = hexRGBA(0x44ff44, 0.7);
  ctx.fill();

  // brand text
  ctx.fillStyle = hexRGBA(0x5a5a60, 0.5);
  ctx.font = "bold 5px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SYNC", cx, s * 0.54);
}

/* ---------- furniture type registry ---------- */

const FURNITURE_TYPES: FurnitureType[] = [
  { tileIds: [17], draw: drawDeskLeft },
  { tileIds: [18], draw: drawDeskRight },
  { tileIds: [19], draw: drawOfficeChair },
  { tileIds: [20], draw: drawSmallPlant },
  { tileIds: [21], draw: drawWallPicture },
  { tileIds: [22], draw: drawWindow },
  { tileIds: [23], draw: drawCoffeeMachineTop },
  { tileIds: [24], draw: drawCoffeeMachineBottom },
  { tileIds: [25], draw: drawWaterCooler },
  { tileIds: [26], draw: drawKitchenCounter },
  { tileIds: [27], draw: drawKitchenSink },
  { tileIds: [28], draw: drawMicrowave },
  { tileIds: [29], draw: drawSofaLeft },
  { tileIds: [30], draw: drawSofaRight },
  { tileIds: [31], draw: drawLargePlant },
  { tileIds: [32], draw: drawToaster },
  { tileIds: [33], draw: drawOfficeChairLeft },
];

export const CHAIR_TEX_DOWN = "chair-down";
export const CHAIR_TEX_UP = "chair-up";
export const CHAIR_TEX_LEFT = "chair-left";
export const MONITOR_TEX = "monitor-proc";

const CHAIR_TILE_IDS = new Set([19, 33]);

/**
 * Generate furniture textures and overlay them on the furniture layer.
 * Call after the Tiled map furniture layer is created.
 */
export function upgradeFurniture(scene: Phaser.Scene, furnitureLayer: Phaser.Tilemaps.TilemapLayer): void {
  const tex = scene.textures;
  const map = furnitureLayer.tilemap;

  // Generate canvas textures for each furniture type
  for (const ft of FURNITURE_TYPES) {
    for (const tileId of ft.tileIds) {
      const key = `furniture-${tileId}`;
      if (tex.exists(key)) continue;

      const canvasTex = tex.createCanvas(key, TILE_PX, TILE_PX);
      if (!canvasTex) continue;
      const ctx = canvasTex.getContext();
      ctx.clearRect(0, 0, TILE_PX, TILE_PX);
      ft.draw(ctx, TILE_PX);
      canvasTex.refresh();
    }
  }

  // Generate chair direction textures
  const chairDraws: Array<[string, (ctx: CanvasRenderingContext2D, s: number) => void]> = [
    [CHAIR_TEX_DOWN, drawOfficeChair],
    [CHAIR_TEX_UP, drawOfficeChairUp],
    [CHAIR_TEX_LEFT, drawOfficeChairLeft],
  ];
  for (const [key, drawFn] of chairDraws) {
    if (tex.exists(key)) continue;
    const canvasTex = tex.createCanvas(key, TILE_PX, TILE_PX);
    if (!canvasTex) continue;
    const ctx = canvasTex.getContext();
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    drawFn(ctx, TILE_PX);
    canvasTex.refresh();
  }

  // Generate procedural monitor texture (2 frames: off / on)
  if (!tex.exists(MONITOR_TEX)) {
    const canvasTex = tex.createCanvas(MONITOR_TEX, TILE_PX * 2, TILE_PX);
    if (canvasTex) {
      const ctx = canvasTex.getContext();
      ctx.clearRect(0, 0, TILE_PX, TILE_PX);
      drawDeskMonitor(ctx, TILE_PX, false);
      ctx.save();
      ctx.translate(TILE_PX, 0);
      drawDeskMonitor(ctx, TILE_PX, true);
      ctx.restore();
      canvasTex.refresh();
      const texture = tex.get(MONITOR_TEX);
      texture.add("0", 0, 0, 0, TILE_PX, TILE_PX);
      texture.add("1", 0, TILE_PX, 0, TILE_PX, TILE_PX);
    }
  }

  // Iterate through furniture layer and overlay enhanced sprites
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = furnitureLayer.getTileAt(x, y);
      if (!tile) continue;
      const tileId = tile.index;

      // Skip chair tiles — scene manages them as separate sprites
      if (CHAIR_TILE_IDS.has(tileId)) {
        tile.alpha = 0;
        continue;
      }

      const key = `furniture-${tileId}`;
      if (!tex.exists(key)) continue;

      // Hide the underlying tile to prevent double rendering
      tile.alpha = 0;

      const px = x * TILE_PX;
      const py = y * TILE_PX;
      const sprite = scene.add.sprite(px, py, key);
      sprite.setOrigin(0, 0);
      sprite.setDepth(furnitureLayer.depth + 0.1);
    }
  }
}
