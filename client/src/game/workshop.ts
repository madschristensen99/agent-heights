/**
 * Expedition Workshop Furniture
 *
 * Procedurally drawn furniture for the break room's transformation into
 * the Expedition Workshop — a laboratory, armory, and factory rolled into one.
 * See docs/EXPEDITIONS.md §16 for the full design spec.
 *
 * Pieces are multi-tile (2×2, 2×1, 1×2) for visual impact — clearly
 * recognizable robots, holographic projections, and expedition gear.
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

/* ---------- workshop furniture drawing functions ---------- */

/**
 * War table — 2×2 tiles (128×128px)
 * Big tactical table with a large holographic robot hovering above it,
 * route map on the table surface, and glowing emitter.
 */
function drawWarTable(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX; // reference tile size for proportions

  // ── holographic robot projection (top half) ──
  // glowing cone from table to ceiling
  const holoGrad = ctx.createLinearGradient(cx, s * 1.0, cx, 0);
  holoGrad.addColorStop(0, hexRGBA(0x44aaff, 0.35));
  holoGrad.addColorStop(0.4, hexRGBA(0x44aaff, 0.12));
  holoGrad.addColorStop(1, hexRGBA(0x44aaff, 0));
  ctx.fillStyle = holoGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 6, s * 1.0);
  ctx.lineTo(cx + 6, s * 1.0);
  ctx.lineTo(cx + s * 0.45, 0);
  ctx.lineTo(cx - s * 0.45, 0);
  ctx.closePath();
  ctx.fill();

  // holographic robot — clearly visible silhouette
  const robotY = s * 0.35;
  const robotScale = 1.4;

  // robot body — rounded torso
  ctx.fillStyle = hexRGBA(0x66ccff, 0.35);
  roundRect(ctx, cx - 16 * robotScale, robotY - 8 * robotScale, 32 * robotScale, 24 * robotScale, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x88ddff, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // robot head — sphere
  ctx.fillStyle = hexRGBA(0x66ccff, 0.35);
  ctx.beginPath();
  ctx.arc(cx, robotY - 16 * robotScale, 10 * robotScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // robot eyes — two glowing optics
  ctx.fillStyle = hexRGBA(0xaaffff, 0.7);
  ctx.beginPath();
  ctx.arc(cx - 5 * robotScale, robotY - 17 * robotScale, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 5 * robotScale, robotY - 17 * robotScale, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // robot antenna
  ctx.strokeStyle = hexRGBA(0x88ddff, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, robotY - 26 * robotScale);
  ctx.lineTo(cx, robotY - 34 * robotScale);
  ctx.stroke();
  ctx.fillStyle = hexRGBA(0xff4444, 0.6);
  ctx.beginPath();
  ctx.arc(cx, robotY - 34 * robotScale, 2, 0, Math.PI * 2);
  ctx.fill();

  // robot arms — segmented
  for (const side of [-1, 1]) {
    ctx.strokeStyle = hexRGBA(0x88ddff, 0.45);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + side * 16 * robotScale, robotY - 4 * robotScale);
    ctx.lineTo(cx + side * 24 * robotScale, robotY + 6 * robotScale);
    ctx.lineTo(cx + side * 20 * robotScale, robotY + 16 * robotScale);
    ctx.stroke();
    // claw/hand
    ctx.fillStyle = hexRGBA(0x66ccff, 0.35);
    ctx.beginPath();
    ctx.arc(cx + side * 20 * robotScale, robotY + 16 * robotScale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // robot legs
  for (const side of [-1, 1]) {
    ctx.strokeStyle = hexRGBA(0x88ddff, 0.45);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + side * 8 * robotScale, robotY + 16 * robotScale);
    ctx.lineTo(cx + side * 10 * robotScale, robotY + 28 * robotScale);
    ctx.stroke();
  }

  // scan lines on hologram
  ctx.strokeStyle = hexRGBA(0x88ddff, 0.08);
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const ly = i * (s / 8);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.4, ly);
    ctx.lineTo(cx + s * 0.4, ly);
    ctx.stroke();
  }

  // ── table surface (bottom half) ──
  const tableY = s * 1.05;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, h - 8, s * 0.85, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // table base — heavy industrial
  const baseGrad = linearGrad(ctx, 0, tableY, 0, h - 4, [
    [0, shade(0x3a4a5a, 15)],
    [0.5, shade(0x2a3a4a, 0)],
    [1, shade(0x1a2a3a, -15)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, s * 0.2, tableY, w - s * 0.4, h - tableY - 8, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a5a6a, 0.4);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // table legs
  ctx.fillStyle = shade(0x1a1a20, 0);
  ctx.fillRect(s * 0.3, h - 16, 8, 12);
  ctx.fillRect(w - s * 0.3 - 8, h - 16, 8, 12);

  // table surface — dark metallic top with tactical grid
  const surfGrad = linearGrad(ctx, 0, tableY, 0, tableY + s * 0.3, [
    [0, shade(0x4a5a6a, 20)],
    [0.5, shade(0x3a4a5a, 5)],
    [1, shade(0x2a3a4a, -10)],
  ]);
  ctx.fillStyle = surfGrad;
  roundRect(ctx, s * 0.15, tableY, w - s * 0.3, s * 0.28, 4);
  ctx.fill();

  // tactical grid lines
  ctx.strokeStyle = hexRGBA(0x5a7a9a, 0.25);
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 8; i++) {
    const gx = s * 0.15 + i * ((w - s * 0.3) / 8);
    ctx.beginPath();
    ctx.moveTo(gx, tableY + 4);
    ctx.lineTo(gx, tableY + s * 0.26);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const gy = tableY + i * (s * 0.28 / 4);
    ctx.beginPath();
    ctx.moveTo(s * 0.2, gy);
    ctx.lineTo(w - s * 0.2, gy);
    ctx.stroke();
  }

  // route dotted line on table — from center to upper-right
  ctx.strokeStyle = hexRGBA(0xaaffff, 0.6);
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, tableY + s * 0.14);
  ctx.lineTo(cx + s * 0.35, tableY + s * 0.06);
  ctx.stroke();
  ctx.setLineDash([]);

  // destination marker — gold glowing dot
  ctx.fillStyle = hexRGBA(0xffdd44, 0.7);
  ctx.beginPath();
  ctx.arc(cx + s * 0.35, tableY + s * 0.06, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0xffdd44, 0.3);
  ctx.beginPath();
  ctx.arc(cx + s * 0.35, tableY + s * 0.06, 8, 0, Math.PI * 2);
  ctx.fill();

  // origin marker — office icon
  ctx.fillStyle = hexRGBA(0x44ff44, 0.6);
  ctx.fillRect(cx - 5, tableY + s * 0.12, 10, 8);
  ctx.strokeStyle = hexRGBA(0x44ff44, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 5, tableY + s * 0.12, 10, 8);

  // emitter glow on table center
  ctx.fillStyle = hexRGBA(0x44aaff, 0.6);
  ctx.beginPath();
  ctx.arc(cx, tableY + s * 0.14, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x88ddff, 0.3);
  ctx.beginPath();
  ctx.arc(cx, tableY + s * 0.14, 12, 0, Math.PI * 2);
  ctx.fill();

  // threat markers — red X's along route
  for (let i = 0; i < 2; i++) {
    const tx = cx + s * (0.12 + i * 0.1);
    const ty = tableY + s * (0.1 - i * 0.02);
    ctx.strokeStyle = hexRGBA(0xff4444, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx - 3, ty - 3);
    ctx.lineTo(tx + 3, ty + 3);
    ctx.moveTo(tx + 3, ty - 3);
    ctx.lineTo(tx - 3, ty + 3);
    ctx.stroke();
  }
}

/**
 * Robot workbench — 2×1 tiles (128×64px)
 * Wide workbench with a clearly visible robot being assembled on top.
 */
function drawWorkbench(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, s * 0.9, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // workbench legs
  ctx.fillStyle = shade(0x2a2a30, 0);
  ctx.fillRect(s * 0.15, s * 0.5, 6, s * 0.42);
  ctx.fillRect(w - s * 0.15 - 6, s * 0.5, 6, s * 0.42);
  // cross-brace
  ctx.fillRect(s * 0.15, s * 0.72, w - s * 0.3, 4);

  // workbench surface — thick wooden top
  const surfGrad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.52, [
    [0, shade(0x6a5a3a, 20)],
    [0.5, shade(0x5a4a2a, 5)],
    [1, shade(0x4a3a1a, -15)],
  ]);
  ctx.fillStyle = surfGrad;
  roundRect(ctx, s * 0.08, s * 0.3, w - s * 0.16, s * 0.22, 4);
  ctx.fill();
  // wood grain
  ctx.strokeStyle = hexRGBA(0x3a2a1a, 0.2);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 5; i++) {
    const ly = s * 0.33 + i * (s * 0.04);
    ctx.beginPath();
    ctx.moveTo(s * 0.12, ly);
    ctx.bezierCurveTo(s * 0.4, ly + 1, s * 0.8, ly - 1, w - s * 0.12, ly + 0.5);
    ctx.stroke();
  }

  // ── robot being assembled on bench ──
  const robotCx = cx;
  const robotBaseY = s * 0.3; // robot sits on bench surface

  // robot torso frame — clearly visible chassis
  ctx.fillStyle = shade(0x8a8a90, 15);
  roundRect(ctx, robotCx - 18, robotBaseY - 22, 36, 26, 4);
  ctx.fill();
  ctx.strokeStyle = shade(0x5a5a60, 0);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // chest panel — circuitry and power core
  ctx.fillStyle = hexRGBA(0x1a2a1a, 0.6);
  roundRect(ctx, robotCx - 14, robotBaseY - 18, 28, 18, 2);
  ctx.fill();
  // power core — glowing center
  ctx.fillStyle = hexRGBA(0x44ff44, 0.7);
  ctx.beginPath();
  ctx.arc(robotCx, robotBaseY - 9, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x88ff88, 0.4);
  ctx.beginPath();
  ctx.arc(robotCx, robotBaseY - 9, 8, 0, Math.PI * 2);
  ctx.fill();
  // circuit lines from core
  ctx.strokeStyle = hexRGBA(0x44ff44, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(robotCx, robotBaseY - 14);
  ctx.lineTo(robotCx, robotBaseY - 18);
  ctx.moveTo(robotCx - 8, robotBaseY - 9);
  ctx.lineTo(robotCx - 14, robotBaseY - 9);
  ctx.moveTo(robotCx + 8, robotBaseY - 9);
  ctx.lineTo(robotCx + 14, robotBaseY - 9);
  ctx.stroke();

  // robot head — big and clearly visible
  ctx.fillStyle = shade(0x9a9aa0, 18);
  ctx.beginPath();
  ctx.arc(robotCx, robotBaseY - 34, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(0x6a6a70, 0);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // robot eyes — large glowing visor
  ctx.fillStyle = hexRGBA(0x1a1a20, 0.8);
  roundRect(ctx, robotCx - 9, robotBaseY - 38, 18, 5, 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x44aaff, 0.8);
  ctx.fillRect(robotCx - 8, robotBaseY - 37, 7, 3);
  ctx.fillRect(robotCx + 1, robotBaseY - 37, 7, 3);

  // antenna
  ctx.strokeStyle = shade(0x5a5a60, 0);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(robotCx, robotBaseY - 46);
  ctx.lineTo(robotCx, robotBaseY - 54);
  ctx.stroke();
  ctx.fillStyle = hexRGBA(0xff4444, 0.7);
  ctx.beginPath();
  ctx.arc(robotCx, robotBaseY - 54, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // robot arm — lying on bench, detached
  ctx.fillStyle = shade(0x7a7a80, 10);
  roundRect(ctx, robotCx + 24, robotBaseY - 12, 18, 8, 3);
  ctx.fill();
  ctx.strokeStyle = shade(0x5a5a60, 0);
  ctx.lineWidth = 1;
  ctx.stroke();
  // arm joint
  ctx.fillStyle = shade(0x5a5a60, 5);
  ctx.beginPath();
  ctx.arc(robotCx + 42, robotBaseY - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  // claw
  ctx.fillStyle = shade(0x6a6a70, 0);
  roundRect(ctx, robotCx + 44, robotBaseY - 12, 8, 10, 2);
  ctx.fill();

  // robot leg — lying on bench, detached
  ctx.fillStyle = shade(0x7a7a80, 8);
  roundRect(ctx, robotCx - 42, robotBaseY - 10, 10, 18, 3);
  ctx.fill();
  ctx.strokeStyle = shade(0x5a5a60, 0);
  ctx.lineWidth = 1;
  ctx.stroke();
  // foot
  ctx.fillStyle = shade(0x5a5a60, 0);
  roundRect(ctx, robotCx - 44, robotBaseY + 4, 14, 6, 2);
  ctx.fill();

  // ── tools ──
  // wrench — big and visible
  ctx.strokeStyle = shade(0x4a4a50, 0);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.45);
  ctx.lineTo(s * 0.3, s * 0.38);
  ctx.stroke();
  ctx.fillStyle = shade(0x5a5a60, 0);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.38, 4, 0, Math.PI * 2);
  ctx.fill();

  // screwdriver
  ctx.strokeStyle = shade(0x4a8a4a, 0);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w - s * 0.2, s * 0.42);
  ctx.lineTo(w - s * 0.1, s * 0.36);
  ctx.stroke();

  // welding sparks — bright and visible
  for (let i = 0; i < 8; i++) {
    const sx = robotCx - 10 + (i * 17) % 24;
    const sy = robotBaseY - 6 + (i * 11) % 8;
    ctx.fillStyle = hexRGBA(i % 2 ? 0xffaa44 : 0xffdd66, 0.7);
    ctx.fillRect(sx, sy, 2, 2);
  }
  // spark glow
  ctx.fillStyle = hexRGBA(0xffaa44, 0.2);
  ctx.beginPath();
  ctx.arc(robotCx, robotBaseY - 4, 10, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Scrap recycling bin — 1×2 tiles (64×128px)
 * Tall industrial bin with visible scrap, recycling symbol, and overflow.
 */
function drawScrapBin(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, s * 0.32, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // bin body — tall industrial metal, tapered
  const bodyGrad = linearGrad(ctx, cx - s * 0.28, 0, cx + s * 0.28, 0, [
    [0, shade(0x4a5a4a, -10)],
    [0.3, shade(0x6a7a6a, 15)],
    [0.7, shade(0x5a6a5a, 0)],
    [1, shade(0x3a4a3a, -20)],
  ]);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, s * 0.25);
  ctx.lineTo(cx - s * 0.28, h - 12);
  ctx.lineTo(cx + s * 0.28, h - 12);
  ctx.lineTo(cx + s * 0.22, s * 0.25);
  ctx.closePath();
  ctx.fill();

  // panel seams
  ctx.strokeStyle = hexRGBA(0x3a4a3a, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.24, s * 0.55);
  ctx.lineTo(cx + s * 0.24, s * 0.55);
  ctx.stroke();

  // bin rim — thick
  ctx.fillStyle = shade(0x4a5a4a, 8);
  roundRect(ctx, cx - s * 0.26, s * 0.22, s * 0.52, s * 0.06, 3);
  ctx.fill();

  // bin interior — dark opening
  ctx.fillStyle = hexRGBA(0x0a0a08, 0.85);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.25, s * 0.22, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // scrap debris inside — metallic bits, robot parts
  const scrapColors = [0x8a8a8a, 0x6a6a6a, 0x9a7a4a, 0x7a6a5a, 0xaaaaaa, 0x5a7a5a];
  for (let i = 0; i < 14; i++) {
    const sx = cx - s * 0.18 + (i * 37) % (s * 0.36);
    const sy = s * 0.28 + (i * 23) % (s * 0.12);
    ctx.fillStyle = hexRGBA(scrapColors[i % scrapColors.length], 0.8);
    ctx.fillRect(sx, sy, 3 + (i % 2), 2 + (i % 3));
  }
  // a robot arm sticking out of the bin
  ctx.fillStyle = shade(0x7a7a80, 10);
  roundRect(ctx, cx + s * 0.05, s * 0.2, 12, 5, 2);
  ctx.fill();
  ctx.strokeStyle = shade(0x5a5a60, 0);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // robot eye lens in scrap
  ctx.fillStyle = hexRGBA(0x44aaff, 0.6);
  ctx.beginPath();
  ctx.arc(cx - s * 0.1, s * 0.32, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // recycling symbol — big and prominent
  ctx.strokeStyle = hexRGBA(0x4acb4a, 0.6);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, s * 0.75, 12, 0.3, Math.PI * 1.8);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = 0.3 + i * (Math.PI * 2 / 3);
    const ax = cx + Math.cos(a) * 12;
    const ay = s * 0.75 + Math.sin(a) * 12;
    ctx.fillStyle = hexRGBA(0x4acb4a, 0.6);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(a + 0.5) * 6, ay + Math.sin(a + 0.5) * 6);
    ctx.lineTo(ax + Math.cos(a - 0.3) * 4, ay + Math.sin(a - 0.3) * 4);
    ctx.closePath();
    ctx.fill();
  }

  // rust streaks
  ctx.strokeStyle = hexRGBA(0x8a5a3a, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.15, s * 0.35);
  ctx.lineTo(cx - s * 0.12, s * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.12, s * 0.3);
  ctx.lineTo(cx + s * 0.1, s * 0.6);
  ctx.stroke();

  // warning stripes at bottom
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? hexRGBA(0xffaa00, 0.5) : hexRGBA(0x1a1a1a, 0.6);
    ctx.fillRect(cx - s * 0.26 + i * (s * 0.14), h - 20, s * 0.14, 8);
  }
}

/**
 * Telemetry radio — 1×1 tile (64×64px) but drawn large
 * Wall-mounted field radio with big screen showing robot status.
 */
function drawTelemetryRadio(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // wall mount bracket
  ctx.fillStyle = shade(0x3a3a40, -5);
  ctx.fillRect(cx - 4, 0, 8, s * 0.08);

  // radio body — vintage military field radio, bigger
  const bodyGrad = linearGrad(ctx, 0, s * 0.08, 0, s * 0.72, [
    [0, shade(0x4a5a3a, 15)],
    [0.5, shade(0x3a4a2a, 0)],
    [1, shade(0x2a3a1a, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, s * 0.06, s * 0.08, w - s * 0.12, s * 0.64, 5);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x5a6a4a, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // speaker grille — horizontal slats
  ctx.fillStyle = hexRGBA(0x1a1a14, 0.85);
  roundRect(ctx, s * 0.12, s * 0.14, w - s * 0.24, s * 0.16, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x5a6a4a, 0.3);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    const ly = s * 0.17 + i * (s * 0.025);
    ctx.beginPath();
    ctx.moveTo(s * 0.14, ly);
    ctx.lineTo(w - s * 0.14, ly);
    ctx.stroke();
  }

  // signal screen — big CRT with robot status
  ctx.fillStyle = hexRGBA(0x0a0a08, 0.9);
  roundRect(ctx, s * 0.12, s * 0.34, w - s * 0.24, s * 0.26, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a30, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();

  // robot icon on screen
  ctx.fillStyle = hexRGBA(0x44ff44, 0.5);
  roundRect(ctx, cx - 5, s * 0.38, 10, 8, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, s * 0.36, 4, 0, Math.PI * 2);
  ctx.fill();
  // robot eyes on screen
  ctx.fillStyle = hexRGBA(0xaaffaa, 0.7);
  ctx.fillRect(cx - 3, s * 0.355, 2, 1.5);
  ctx.fillRect(cx + 1, s * 0.355, 2, 1.5);

  // signal waveform
  ctx.strokeStyle = hexRGBA(0x44ff44, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const px = s * 0.14 + i * ((w - s * 0.28) / 24);
    const py = s * 0.52 + Math.sin(i * 0.7) * 3;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // signal bars — bigger
  ctx.fillStyle = hexRGBA(0x44ff44, 0.6);
  for (let i = 0; i < 5; i++) {
    const bh = 3 + i * 2.5;
    ctx.fillRect(s * 0.14 + i * 5, s * 0.58 - bh, 4, bh);
  }

  // control knobs
  for (let i = 0; i < 2; i++) {
    const kx = s * 0.18 + i * (w - s * 0.36);
    const ky = s * 0.66;
    ctx.fillStyle = shade(0x2a2a20, 0);
    ctx.beginPath();
    ctx.arc(kx, ky, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexRGBA(0x5a5a4a, 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = hexRGBA(0xddddaa, 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(kx + 3, ky - 3);
    ctx.stroke();
  }

  // antenna — tall and prominent
  ctx.strokeStyle = shade(0x2a2a20, 0);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.08);
  ctx.lineTo(cx + s * 0.18, 0);
  ctx.stroke();
  ctx.fillStyle = hexRGBA(0xff4444, 0.8);
  ctx.beginPath();
  ctx.arc(cx + s * 0.18, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  // antenna glow
  ctx.fillStyle = hexRGBA(0xff4444, 0.3);
  ctx.beginPath();
  ctx.arc(cx + s * 0.18, 0, 6, 0, Math.PI * 2);
  ctx.fill();

  // bottom panel with LED switches
  ctx.fillStyle = shade(0x2a3a1a, -5);
  roundRect(ctx, s * 0.12, s * 0.72, w - s * 0.24, s * 0.06, 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i === 1 ? hexRGBA(0xff4444, 0.7) : hexRGBA(0x44ff44, 0.5);
    ctx.fillRect(s * 0.16 + i * (s * 0.1), s * 0.74, 5, 4);
  }
}

/**
 * Research station — 2×1 tiles (128×64px)
 * Wide desk with big monitor showing biome data, microscope, and samples.
 */
function drawResearchStation(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.18);
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, s, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk surface
  const deskGrad = linearGrad(ctx, 0, s * 0.4, 0, s * 0.65, [
    [0, shade(0x7a7a8a, 15)],
    [0.5, shade(0x6a6a7a, 0)],
    [1, shade(0x5a5a6a, -15)],
  ]);
  ctx.fillStyle = deskGrad;
  roundRect(ctx, s * 0.04, s * 0.4, w - s * 0.08, s * 0.25, 4);
  ctx.fill();
  // desk front panel
  ctx.fillStyle = shade(0x4a4a5a, -5);
  roundRect(ctx, s * 0.04, s * 0.62, w - s * 0.08, s * 0.2, 4);
  ctx.fill();

  // ── big research monitor (right side) ──
  const monX = cx + s * 0.15;
  const monW = s * 0.7;
  const monH = s * 0.34;
  const monY = s * 0.06;

  // monitor frame
  ctx.fillStyle = shade(0x2a2a30, 5);
  roundRect(ctx, monX, monY, monW, monH, 4);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a40, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // screen
  ctx.fillStyle = hexRGBA(0x0a0a14, 0.92);
  roundRect(ctx, monX + 4, monY + 4, monW - 8, monH - 8, 2);
  ctx.fill();

  // biome map on screen — colored regions
  ctx.fillStyle = hexRGBA(0x2a5a2a, 0.5);
  ctx.beginPath();
  ctx.ellipse(monX + monW * 0.3, monY + monH * 0.4, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x5a4a2a, 0.5);
  ctx.beginPath();
  ctx.ellipse(monX + monW * 0.6, monY + monH * 0.5, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a2a4a, 0.5);
  ctx.beginPath();
  ctx.ellipse(monX + monW * 0.8, monY + monH * 0.3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // expedition route on map
  ctx.strokeStyle = hexRGBA(0xffdd44, 0.6);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(monX + 8, monY + monH * 0.7);
  ctx.lineTo(monX + monW * 0.6, monY + monH * 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // data readout lines
  const dataColors = [0x44ff66, 0x44ddff, 0xffaa44, 0x44ff66, 0xff66aa];
  for (let i = 0; i < 5; i++) {
    const ly = monY + monH - 18 + i * 3;
    ctx.fillStyle = hexRGBA(dataColors[i % dataColors.length], 0.5);
    ctx.fillRect(monX + 6, ly, monW * (0.3 + (i % 3) * 0.15), 1.5);
  }

  // knowledge bar chart
  ctx.fillStyle = hexRGBA(0x44aaff, 0.5);
  for (let i = 0; i < 5; i++) {
    const bh = 4 + i * 3.5;
    ctx.fillRect(monX + 8 + i * 6, monY + monH - 4 - bh, 4, bh);
  }

  // power LED
  ctx.fillStyle = hexRGBA(0x44ff44, 0.7);
  ctx.beginPath();
  ctx.arc(monX + monW - 6, monY + monH - 5, 2, 0, Math.PI * 2);
  ctx.fill();

  // monitor stand
  ctx.fillStyle = shade(0x2a2a30, 0);
  ctx.fillRect(monX + monW * 0.4, monY + monH, 5, s * 0.06);
  ctx.fillRect(monX + monW * 0.25, monY + monH + s * 0.05, monW * 0.5, 4);

  // ── microscope (left side) ──
  const micX = cx - s * 0.35;
  // base
  ctx.fillStyle = shade(0x2a2a30, 0);
  roundRect(ctx, micX - 8, s * 0.3, 16, 8, 2);
  ctx.fill();
  // arm
  ctx.fillStyle = shade(0x3a3a40, 5);
  ctx.fillRect(micX - 2, s * 0.12, 5, s * 0.2);
  // eyepiece
  ctx.fillStyle = shade(0x1a1a20, 0);
  roundRect(ctx, micX - 5, s * 0.06, 10, 8, 2);
  ctx.fill();
  // lens — glowing
  ctx.fillStyle = hexRGBA(0x44aaff, 0.4);
  ctx.beginPath();
  ctx.arc(micX, s * 0.3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x88ddff, 0.2);
  ctx.beginPath();
  ctx.arc(micX, s * 0.3, 7, 0, Math.PI * 2);
  ctx.fill();
  // stage
  ctx.fillStyle = shade(0x5a5a60, 0);
  ctx.fillRect(micX - 6, s * 0.26, 12, 2);

  // ── sample jars on desk ──
  for (let i = 0; i < 3; i++) {
    const jx = cx - s * 0.1 + i * 12;
    const jy = s * 0.34;
    // jar glass
    const jarColors = [0x4a8a4a, 0x8a4a4a, 0x4a4a8a];
    ctx.fillStyle = hexRGBA(jarColors[i], 0.35);
    roundRect(ctx, jx, jy, 8, 10, 1);
    ctx.fill();
    ctx.strokeStyle = hexRGBA(jarColors[i] + 0x202020, 0.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // lid
    ctx.fillStyle = shade(0x5a5a50, 0);
    ctx.fillRect(jx - 1, jy - 2, 10, 3);
    // glow inside
    ctx.fillStyle = hexRGBA(jarColors[i], 0.2);
    ctx.beginPath();
    ctx.arc(jx + 4, jy + 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // open field report book
  ctx.fillStyle = "#f0f0e8";
  roundRect(ctx, cx + s * 0.05, s * 0.4, s * 0.12, s * 0.06, 1);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x9a9a90, 0.4);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.11, s * 0.4);
  ctx.lineTo(cx + s * 0.11, s * 0.46);
  ctx.stroke();
  // text lines
  ctx.fillStyle = hexRGBA(0x6a6a70, 0.4);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(cx + s * 0.07, s * 0.41 + i * 2, s * 0.03, 0.8);
    ctx.fillRect(cx + s * 0.12, s * 0.41 + i * 2, s * 0.03, 0.8);
  }
}

/* ---------- texture generation ---------- */

export const WORKSHOP_TEX_WAR_TABLE = "workshop-war-table";
export const WORKSHOP_TEX_SCRAP_BIN = "workshop-scrap-bin";
export const WORKSHOP_TEX_TELEMETRY_RADIO = "workshop-telemetry-radio";
export const WORKSHOP_TEX_WORKBENCH = "workshop-workbench";
export const WORKSHOP_TEX_RESEARCH_STATION = "workshop-research-station";

interface WorkshopPiece {
  key: string;
  texW: number;
  texH: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const WORKSHOP_PIECES: WorkshopPiece[] = [
  { key: WORKSHOP_TEX_WAR_TABLE, texW: TILE_PX * 2, texH: TILE_PX * 2, draw: drawWarTable },
  { key: WORKSHOP_TEX_WORKBENCH, texW: TILE_PX * 2, texH: TILE_PX, draw: drawWorkbench },
  { key: WORKSHOP_TEX_SCRAP_BIN, texW: TILE_PX, texH: TILE_PX * 2, draw: drawScrapBin },
  { key: WORKSHOP_TEX_TELEMETRY_RADIO, texW: TILE_PX, texH: TILE_PX, draw: drawTelemetryRadio },
  { key: WORKSHOP_TEX_RESEARCH_STATION, texW: TILE_PX * 2, texH: TILE_PX, draw: drawResearchStation },
];

/** Tile coordinates (top-left) and pixel dimensions for each workshop piece.
 *  Layout — distinct zones with walking space between them:
 *
 *    y=13:  [sofa] [sofa] .     .     .     .     [plant] .
 *    y=14:  [research 2×1] .   [war table 2×2   ] [radio]
 *    y=15:  [plant] .         [war table 2×2   ] .      .
 *    y=16:  .     .           .     [plant] .   [scrap 1×2]
 *    y=17:  [workbench 2×1]   .     .     .     [scrap 1×2]
 */
export const WORKSHOP_LAYOUT: Record<string, { tile: { x: number; y: number }; w: number; h: number }> = {
  [WORKSHOP_TEX_RESEARCH_STATION]: { tile: { x: 22, y: 14 }, w: TILE_PX * 2, h: TILE_PX },
  [WORKSHOP_TEX_WAR_TABLE]: { tile: { x: 25, y: 14 }, w: TILE_PX * 2, h: TILE_PX * 2 },
  [WORKSHOP_TEX_TELEMETRY_RADIO]: { tile: { x: 28, y: 14 }, w: TILE_PX, h: TILE_PX },
  [WORKSHOP_TEX_WORKBENCH]: { tile: { x: 23, y: 17 }, w: TILE_PX * 2, h: TILE_PX },
  [WORKSHOP_TEX_SCRAP_BIN]: { tile: { x: 27, y: 16 }, w: TILE_PX, h: TILE_PX * 2 },
};

/**
 * Generate all workshop furniture textures and place them as sprites
 * in the break room. Call after upgradeFurniture().
 */
export function upgradeWorkshop(scene: Phaser.Scene): Phaser.GameObjects.Sprite[] {
  const tex = scene.textures;
  const sprites: Phaser.GameObjects.Sprite[] = [];

  for (const piece of WORKSHOP_PIECES) {
    if (!tex.exists(piece.key)) {
      const canvasTex = tex.createCanvas(piece.key, piece.texW, piece.texH);
      if (!canvasTex) continue;
      const ctx = canvasTex.getContext();
      ctx.clearRect(0, 0, piece.texW, piece.texH);
      piece.draw(ctx, piece.texW, piece.texH);
      canvasTex.refresh();
    }

    const layout = WORKSHOP_LAYOUT[piece.key];
    if (!layout) continue;

    const px = layout.tile.x * TILE_PX;
    const py = layout.tile.y * TILE_PX;
    const sprite = scene.add.sprite(px, py, piece.key);
    sprite.setOrigin(0, 0);
    sprite.setDepth(5 + py + 0.2);
    sprites.push(sprite);
  }

  return sprites;
}
