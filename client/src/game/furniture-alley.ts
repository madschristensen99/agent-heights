/**
 * Erics Alley — procedural furniture drawing functions.
 *
 * Each function draws a single 64×64 tile using Canvas2D, matching the
 * signature (ctx, size) used by the base furniture system.  Functions are
 * registered via registerThemeFurniture() at module load so the scene
 * picks them up automatically when the alley theme is active.
 */

import { registerThemeFurniture } from "./furniture";

/* ---------- color helpers (duplicated from furniture.ts — not exported there) ---------- */

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

/* ---------- alley palette ---------- */

const CARDBOARD = 0xb8905a;
const CARDBOARD_DARK = 0x8a6a3a;
const METAL = 0x6a7078;
const METAL_DARK = 0x3a4048;
const RUST = 0x8a4a2a;
const CRATE_WOOD = 0x9a7a4a;
const CRATE_DARK = 0x6a5a3a;
const BARREL = 0x3a3a3a;
const FIRE_GLOW = 0xff6a2a;
const TAGGED = 0x9a3a5a;

/* ---------- drawing functions ---------- */

/** Cardboard box station — left half (tile 17, replaces desk left) */
function drawCardboardStationLeft(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // box body — cardboard brown
  const boxGrad = linearGrad(ctx, 0, s * 0.2, 0, s * 0.85, [
    [0, shade(CARDBOARD, 10)],
    [0.5, shade(CARDBOARD, 0)],
    [1, shade(CARDBOARD_DARK, -10)],
  ]);
  ctx.fillStyle = boxGrad;
  ctx.fillRect(s * 0.02, s * 0.22, s * 0.96, s * 0.64);

  // cardboard flap lines
  ctx.strokeStyle = hexRGBA(CARDBOARD_DARK, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.02, s * 0.22);
  ctx.lineTo(s * 0.5, s * 0.35);
  ctx.lineTo(s * 0.98, s * 0.22);
  ctx.stroke();

  // tape strip across top
  ctx.fillStyle = hexRGBA(0xd4c8a0, 0.5);
  ctx.fillRect(s * 0.3, s * 0.18, s * 0.4, s * 0.06);

  // spray-painted monitor screen on box surface
  ctx.fillStyle = hexRGBA(0x1a1a1e, 0.8);
  roundRect(ctx, s * 0.15, s * 0.38, s * 0.7, s * 0.32, 3);
  ctx.fill();

  // screen glow — faint green
  ctx.fillStyle = hexRGBA(0x2aff8a, 0.12);
  roundRect(ctx, s * 0.17, s * 0.4, s * 0.66, s * 0.28, 2);
  ctx.fill();

  // spray-painted text lines on screen
  ctx.strokeStyle = hexRGBA(0x2aff8a, 0.35);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = s * 0.44 + i * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, y);
    ctx.lineTo(s * 0.2 + (i % 2 === 0 ? s * 0.5 : s * 0.35), y);
    ctx.stroke();
  }

  // graffiti tag on side
  ctx.fillStyle = hexRGBA(TAGGED, 0.5);
  ctx.font = "bold 7px sans-serif";
  ctx.fillText("AH", s * 0.08, s * 0.78);

  // front edge shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.fillRect(s * 0.02, s * 0.8, s * 0.96, s * 0.06);
}

/** Cardboard box station — right half (tile 18, replaces desk right) */
function drawCardboardStationRight(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // box body
  const boxGrad = linearGrad(ctx, 0, s * 0.2, 0, s * 0.85, [
    [0, shade(CARDBOARD, 10)],
    [0.5, shade(CARDBOARD, 0)],
    [1, shade(CARDBOARD_DARK, -10)],
  ]);
  ctx.fillStyle = boxGrad;
  ctx.fillRect(s * 0.02, s * 0.22, s * 0.96, s * 0.64);

  // flap lines — mirrored
  ctx.strokeStyle = hexRGBA(CARDBOARD_DARK, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.02, s * 0.22);
  ctx.lineTo(s * 0.5, s * 0.35);
  ctx.lineTo(s * 0.98, s * 0.22);
  ctx.stroke();

  // tape strip
  ctx.fillStyle = hexRGBA(0xd4c8a0, 0.5);
  ctx.fillRect(s * 0.3, s * 0.18, s * 0.4, s * 0.06);

  // scattered papers / sticky notes
  ctx.fillStyle = hexRGBA(0xeae0c0, 0.7);
  ctx.save();
  ctx.translate(s * 0.6, s * 0.5);
  ctx.rotate(0.15);
  roundRect(ctx, -s * 0.08, -s * 0.05, s * 0.16, s * 0.1, 1);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = hexRGBA(0xe0d4b0, 0.6);
  ctx.save();
  ctx.translate(s * 0.35, s * 0.62);
  ctx.rotate(-0.1);
  roundRect(ctx, -s * 0.06, -s * 0.04, s * 0.12, s * 0.08, 1);
  ctx.fill();
  ctx.restore();

  // coffee stain
  ctx.fillStyle = hexRGBA(0x6a4a2a, 0.25);
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.72, s * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // front edge shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.fillRect(s * 0.02, s * 0.8, s * 0.96, s * 0.06);
}

/** Crate / wooden crate as chair (tile 19, replaces office chair) */
function drawCrateStool(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.86, s * 0.26, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // crate body — weathered wood
  const woodGrad = linearGrad(ctx, cx - s * 0.22, 0, cx + s * 0.22, 0, [
    [0, shade(CRATE_DARK, -10)],
    [0.5, shade(CRATE_WOOD, 10)],
    [1, shade(CRATE_DARK, -10)],
  ]);
  ctx.fillStyle = woodGrad;
  roundRect(ctx, cx - s * 0.22, s * 0.3, s * 0.44, s * 0.52, 3);
  ctx.fill();

  // wood plank lines
  ctx.strokeStyle = hexRGBA(CRATE_DARK, 0.5);
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const y = s * 0.3 + i * s * 0.17;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, y);
    ctx.lineTo(cx + s * 0.2, y);
    ctx.stroke();
  }

  // metal corner brackets
  ctx.fillStyle = shade(METAL_DARK, 0);
  for (const [bx, by] of [[cx - s * 0.22, s * 0.3], [cx + s * 0.16, s * 0.3], [cx - s * 0.22, s * 0.76], [cx + s * 0.16, s * 0.76]]) {
    ctx.fillRect(bx, by, s * 0.06, s * 0.06);
  }

  // top edge — open crate lip
  ctx.fillStyle = shade(CRATE_DARK, -15);
  roundRect(ctx, cx - s * 0.22, s * 0.26, s * 0.44, s * 0.06, 2);
  ctx.fill();

  // graffiti scratch
  ctx.strokeStyle = hexRGBA(0xaa8a5a, 0.3);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, s * 0.5);
  ctx.lineTo(cx + s * 0.1, s * 0.55);
  ctx.stroke();
}

/** Dumpster as filing cabinet (tile 20, replaces filing cabinet) */
function drawDumpster(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.3);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.89, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // dumpster body — dark green metal
  const bodyGrad = linearGrad(ctx, cx - s * 0.28, 0, cx + s * 0.28, 0, [
    [0, shade(0x2a4a2a, -15)],
    [0.5, shade(0x3a6a3a, 10)],
    [1, shade(0x2a4a2a, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, cx - s * 0.28, s * 0.15, s * 0.56, s * 0.72, 4);
  ctx.fill();

  // rust streaks
  ctx.fillStyle = hexRGBA(RUST, 0.3);
  ctx.fillRect(cx - s * 0.2, s * 0.2, s * 0.04, s * 0.5);
  ctx.fillRect(cx + s * 0.1, s * 0.25, s * 0.03, s * 0.4);

  // lid — slightly open
  ctx.fillStyle = shade(0x2a4a2a, 5);
  roundRect(ctx, cx - s * 0.3, s * 0.08, s * 0.6, s * 0.1, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x1a3a1a, 0.6);
  ctx.lineWidth = 1;
  roundRect(ctx, cx - s * 0.3, s * 0.08, s * 0.6, s * 0.1, 3);
  ctx.stroke();

  // lid hinge
  ctx.fillStyle = shade(METAL_DARK, 0);
  ctx.fillRect(cx - s * 0.28, s * 0.12, s * 0.04, s * 0.04);
  ctx.fillRect(cx + s * 0.24, s * 0.12, s * 0.04, s * 0.04);

  // front panel rivets
  ctx.fillStyle = shade(METAL, 10);
  for (const ry of [s * 0.25, s * 0.75]) {
    ctx.beginPath();
    ctx.arc(cx - s * 0.22, ry, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + s * 0.22, ry, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // graffiti tag
  ctx.fillStyle = hexRGBA(TAGGED, 0.6);
  ctx.font = "bold 8px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TRASH", cx, s * 0.55);
  ctx.textAlign = "left";
}

/** Weed patch — small plant (tile 21, replaces wall picture / small plant) */
function drawWeedPatch(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // crack in pavement
  ctx.strokeStyle = hexRGBA(0x1a1a1e, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.85);
  ctx.lineTo(s * 0.3, s * 0.7);
  ctx.lineTo(s * 0.5, s * 0.75);
  ctx.lineTo(s * 0.8, s * 0.65);
  ctx.stroke();

  // shadow at base
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.78, s * 0.15, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // weeds — scraggly green stems through crack
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.3;
    const len = s * 0.12 + (i % 2) * s * 0.06;
    const bx = cx + (i - 2.5) * s * 0.04;
    const by = s * 0.76;
    const tx = bx + Math.cos(a) * len;
    const ty = by + Math.sin(a) * len;

    ctx.strokeStyle = hexRGBA(0x3a5a2a, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + Math.cos(a + 0.3) * len * 0.5, by + Math.sin(a + 0.3) * len * 0.5, tx, ty);
    ctx.stroke();

    // small leaf
    ctx.fillStyle = hexRGBA(0x4a6a3a, 0.6);
    ctx.beginPath();
    ctx.ellipse(tx, ty, 2, 1, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Alley window — barred (tile 22, replaces window) */
function drawAlleyWindow(ctx: CanvasRenderingContext2D, s: number): void {
  // frame — dirty metal
  ctx.fillStyle = shade(METAL_DARK, -10);
  roundRect(ctx, s * 0.08, s * 0.1, s * 0.84, s * 0.6, 3);
  ctx.fill();

  // glass — dark, grimy
  const glassGrad = linearGrad(ctx, 0, s * 0.12, 0, s * 0.68, [
    [0, rgba(40, 45, 55, 0.9)],
    [0.5, rgba(55, 60, 70, 0.85)],
    [1, rgba(30, 35, 40, 0.9)],
  ]);
  ctx.fillStyle = glassGrad;
  ctx.fillRect(s * 0.12, s * 0.14, s * 0.76, s * 0.52);

  // dim light from inside
  ctx.fillStyle = hexRGBA(0xffaa44, 0.08);
  ctx.fillRect(s * 0.12, s * 0.14, s * 0.76, s * 0.2);

  // security bars — vertical
  ctx.fillStyle = shade(METAL_DARK, 0);
  for (let i = 0; i < 4; i++) {
    const x = s * 0.18 + i * s * 0.2;
    ctx.fillRect(x, s * 0.12, 3, s * 0.54);
  }
  // horizontal bar
  ctx.fillRect(s * 0.12, s * 0.39, s * 0.76, 3);

  // grime drips on glass
  ctx.fillStyle = hexRGBA(0x2a2a2e, 0.3);
  ctx.fillRect(s * 0.2, s * 0.3, 2, s * 0.2);
  ctx.fillRect(s * 0.5, s * 0.25, 2, s * 0.15);
  ctx.fillRect(s * 0.7, s * 0.35, 2, s * 0.18);

  // broken glass crack
  ctx.strokeStyle = hexRGBA(0xffffff, 0.15);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(s * 0.4, s * 0.2);
  ctx.lineTo(s * 0.45, s * 0.35);
  ctx.lineTo(s * 0.38, s * 0.5);
  ctx.stroke();

  // sill — concrete
  ctx.fillStyle = shade(0x5a5a5e, 0);
  roundRect(ctx, s * 0.06, s * 0.68, s * 0.88, s * 0.06, 2);
  ctx.fill();
}

/** Barrel fire — top half (tile 23, replaces coffee machine top) */
function drawBarrelFireTop(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // barrel rim
  ctx.fillStyle = shade(BARREL, 10);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.12, s * 0.26, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // barrel interior — dark
  ctx.fillStyle = hexRGBA(0x1a1a1e, 0.9);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.12, s * 0.22, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // flames — orange/yellow
  const flameGrad = linearGrad(ctx, 0, s * 0.05, 0, s * 0.5, [
    [0, rgba(255, 220, 80, 0.9)],
    [0.4, rgba(255, 140, 30, 0.8)],
    [1, rgba(200, 60, 20, 0.4)],
  ]);
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.15, s * 0.12);
  ctx.quadraticCurveTo(cx - s * 0.1, s * 0.0, cx - s * 0.05, s * 0.08);
  ctx.quadraticCurveTo(cx, s * -0.02, cx + s * 0.05, s * 0.06);
  ctx.quadraticCurveTo(cx + s * 0.1, s * 0.0, cx + s * 0.15, s * 0.12);
  ctx.closePath();
  ctx.fill();

  // inner flame — brighter
  ctx.fillStyle = hexRGBA(0xffdd66, 0.6);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.08, s * 0.12);
  ctx.quadraticCurveTo(cx - s * 0.04, s * 0.04, cx, s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.04, s * 0.04, cx + s * 0.08, s * 0.12);
  ctx.closePath();
  ctx.fill();

  // sparks
  ctx.fillStyle = hexRGBA(0xffaa44, 0.5);
  ctx.beginPath();
  ctx.arc(cx - s * 0.12, s * 0.02, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.1, s * 0.05, 1, 0, Math.PI * 2);
  ctx.fill();

  // glow halo
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.08);
  ctx.beginPath();
  ctx.arc(cx, s * 0.15, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** Barrel fire — bottom half / barrel body (tile 24, replaces coffee machine bottom) */
function drawBarrelFireBottom(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.3);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.26, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // barrel body — dark metal
  const barrelGrad = linearGrad(ctx, cx - s * 0.24, 0, cx + s * 0.24, 0, [
    [0, shade(BARREL, -20)],
    [0.5, shade(0x4a4a4e, 10)],
    [1, shade(BARREL, -20)],
  ]);
  ctx.fillStyle = barrelGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.24, s * 0.05);
  ctx.lineTo(cx - s * 0.26, s * 0.82);
  ctx.lineTo(cx + s * 0.26, s * 0.82);
  ctx.lineTo(cx + s * 0.24, s * 0.05);
  ctx.closePath();
  ctx.fill();

  // barrel rings — two metal bands
  ctx.strokeStyle = hexRGBA(0x2a2a2e, 0.7);
  ctx.lineWidth = 2;
  for (const ry of [s * 0.25, s * 0.6]) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.25, ry);
    ctx.lineTo(cx + s * 0.25, ry);
    ctx.stroke();
  }

  // rust patches
  ctx.fillStyle = hexRGBA(RUST, 0.35);
  ctx.beginPath();
  ctx.arc(cx - s * 0.15, s * 0.4, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.12, s * 0.7, s * 0.04, 0, Math.PI * 2);
  ctx.fill();

  // glow at top from fire
  ctx.fillStyle = hexRGBA(FIRE_GLOW, 0.1);
  ctx.fillRect(cx - s * 0.24, s * 0.05, s * 0.48, s * 0.1);
}

/** Shopping cart as water cooler (tile 25, replaces water cooler) */
function drawShoppingCart(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.86, s * 0.24, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // cart basket — wire grid
  ctx.strokeStyle = shade(METAL, 5);
  ctx.lineWidth = 1.5;
  // vertical wires
  for (let i = 0; i <= 6; i++) {
    const x = cx - s * 0.2 + i * (s * 0.067);
    ctx.beginPath();
    ctx.moveTo(x, s * 0.25);
    ctx.lineTo(x, s * 0.65);
    ctx.stroke();
  }
  // horizontal wires
  for (let i = 0; i <= 4; i++) {
    const y = s * 0.25 + i * (s * 0.1);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, y);
    ctx.lineTo(cx + s * 0.2, y);
    ctx.stroke();
  }

  // cart frame — thicker
  ctx.strokeStyle = shade(METAL, 10);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, s * 0.25);
  ctx.lineTo(cx - s * 0.2, s * 0.65);
  ctx.lineTo(cx + s * 0.2, s * 0.65);
  ctx.lineTo(cx + s * 0.2, s * 0.25);
  ctx.stroke();

  // handle
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, s * 0.25);
  ctx.lineTo(cx - s * 0.28, s * 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.2, s * 0.25);
  ctx.lineTo(cx + s * 0.28, s * 0.15);
  ctx.stroke();

  // wheels
  ctx.fillStyle = shade(0x1a1a1e, 0);
  ctx.beginPath();
  ctx.arc(cx - s * 0.16, s * 0.78, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.16, s * 0.78, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(METAL, 15);
  ctx.beginPath();
  ctx.arc(cx - s * 0.16, s * 0.78, s * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.16, s * 0.78, s * 0.02, 0, Math.PI * 2);
  ctx.fill();

  // random item in cart — can
  ctx.fillStyle = hexRGBA(0xcc4444, 0.7);
  ctx.fillRect(cx - s * 0.05, s * 0.35, s * 0.1, s * 0.12);
}

/** Alley counter — plywood on cinderblocks (tile 26, replaces kitchen counter) */
function drawAlleyCounter(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.9, s * 0.3, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // cinderblock legs
  ctx.fillStyle = shade(0x5a5a5e, 0);
  ctx.fillRect(s * 0.1, s * 0.55, s * 0.12, s * 0.32);
  ctx.fillRect(s * 0.78, s * 0.55, s * 0.12, s * 0.32);
  // block texture
  ctx.strokeStyle = hexRGBA(0x3a3a3e, 0.5);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(s * 0.1, s * 0.55, s * 0.12, s * 0.16);
  ctx.strokeRect(s * 0.1, s * 0.71, s * 0.12, s * 0.16);
  ctx.strokeRect(s * 0.78, s * 0.55, s * 0.12, s * 0.16);
  ctx.strokeRect(s * 0.78, s * 0.71, s * 0.12, s * 0.16);

  // plywood top
  const plyGrad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.58, [
    [0, shade(0xaa8a5a, 10)],
    [0.5, shade(0x9a7a4a, 0)],
    [1, shade(0x7a5a3a, -10)],
  ]);
  ctx.fillStyle = plyGrad;
  roundRect(ctx, s * 0.06, s * 0.3, s * 0.88, s * 0.28, 2);
  ctx.fill();

  // wood grain
  ctx.strokeStyle = hexRGBA(0x7a5a3a, 0.3);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 5; i++) {
    const y = s * 0.33 + i * s * 0.05;
    ctx.beginPath();
    ctx.moveTo(s * 0.08, y);
    ctx.lineTo(s * 0.92, y);
    ctx.stroke();
  }

  // stains
  ctx.fillStyle = hexRGBA(0x4a3a1a, 0.2);
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.42, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.7, s * 0.5, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

/** Puddle (tile 27, replaces kitchen sink) */
function drawPuddle(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // puddle body — oily water
  const puddleGrad = linearGrad(ctx, cx - s * 0.25, s * 0.5, cx + s * 0.25, s * 0.8, [
    [0, rgba(40, 45, 55, 0.7)],
    [0.5, rgba(60, 65, 80, 0.6)],
    [1, rgba(30, 35, 45, 0.7)],
  ]);
  ctx.fillStyle = puddleGrad;
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.65, s * 0.28, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // oil slick — rainbow
  ctx.fillStyle = hexRGBA(0x6a4aaa, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.08, s * 0.62, s * 0.12, s * 0.06, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a8aaa, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.06, s * 0.68, s * 0.1, s * 0.05, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0xaa6a4a, 0.1);
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.1, s * 0.63, s * 0.08, s * 0.04, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // reflection highlight
  ctx.fillStyle = hexRGBA(0xffffff, 0.06);
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.05, s * 0.6, s * 0.1, s * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();

  // crack in pavement around puddle
  ctx.strokeStyle = hexRGBA(0x1a1a1e, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.5);
  ctx.lineTo(s * 0.25, s * 0.55);
  ctx.lineTo(s * 0.2, s * 0.8);
  ctx.stroke();
}

/** Trash can — metal (tile 28, replaces microwave) */
function drawTrashCan(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.87, s * 0.2, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // can body — dented metal
  const canGrad = linearGrad(ctx, cx - s * 0.18, 0, cx + s * 0.18, 0, [
    [0, shade(METAL_DARK, -10)],
    [0.5, shade(METAL, 10)],
    [1, shade(METAL_DARK, -10)],
  ]);
  ctx.fillStyle = canGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.18, s * 0.15);
  ctx.lineTo(cx - s * 0.16, s * 0.82);
  ctx.lineTo(cx + s * 0.16, s * 0.82);
  ctx.lineTo(cx + s * 0.18, s * 0.15);
  ctx.closePath();
  ctx.fill();

  // rim
  ctx.fillStyle = shade(METAL, 15);
  roundRect(ctx, cx - s * 0.2, s * 0.12, s * 0.4, s * 0.05, 2);
  ctx.fill();

  // dent
  ctx.fillStyle = hexRGBA(0x2a2a2e, 0.3);
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.08, s * 0.5, s * 0.04, s * 0.08, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // rust streaks
  ctx.fillStyle = hexRGBA(RUST, 0.25);
  ctx.fillRect(cx - s * 0.1, s * 0.2, s * 0.02, s * 0.3);
  ctx.fillRect(cx + s * 0.06, s * 0.3, s * 0.015, s * 0.25);

  // trash overflowing — crumpled paper
  ctx.fillStyle = hexRGBA(0xeae0c0, 0.6);
  ctx.beginPath();
  ctx.arc(cx - s * 0.06, s * 0.1, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0xd4c8a0, 0.5);
  ctx.beginPath();
  ctx.arc(cx + s * 0.08, s * 0.08, s * 0.03, 0, Math.PI * 2);
  ctx.fill();

  // vertical ridges
  ctx.strokeStyle = hexRGBA(0x2a2a2e, 0.3);
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 4; i++) {
    const x = cx - s * 0.14 + i * s * 0.07;
    ctx.beginPath();
    ctx.moveTo(x, s * 0.18);
    ctx.lineTo(x, s * 0.8);
    ctx.stroke();
  }
}

/** Mattress — left half (tile 29, replaces sofa left) */
function drawMattressLeft(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // mattress body — stained
  const matGrad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.8, [
    [0, shade(0x8a8a7a, 5)],
    [0.5, shade(0x7a7a6a, 0)],
    [1, shade(0x6a6a5a, -10)],
  ]);
  ctx.fillStyle = matGrad;
  roundRect(ctx, s * 0.02, s * 0.3, s * 0.98, s * 0.5, 6);
  ctx.fill();

  // tufting buttons
  ctx.fillStyle = hexRGBA(0x5a5a4a, 0.5);
  for (const [bx, by] of [[s * 0.2, s * 0.42], [s * 0.4, s * 0.42], [s * 0.2, s * 0.6], [s * 0.4, s * 0.6]]) {
    ctx.beginPath();
    ctx.arc(bx, by, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // stain
  ctx.fillStyle = hexRGBA(0x5a4a2a, 0.2);
  ctx.beginPath();
  ctx.ellipse(s * 0.3, s * 0.55, s * 0.08, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // piping edge
  ctx.strokeStyle = hexRGBA(0x5a5a4a, 0.4);
  ctx.lineWidth = 1;
  roundRect(ctx, s * 0.02, s * 0.3, s * 0.98, s * 0.5, 6);
  ctx.stroke();
}

/** Mattress — right half (tile 30, replaces sofa right) */
function drawMattressRight(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // mattress body
  const matGrad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.8, [
    [0, shade(0x8a8a7a, 5)],
    [0.5, shade(0x7a7a6a, 0)],
    [1, shade(0x6a6a5a, -10)],
  ]);
  ctx.fillStyle = matGrad;
  roundRect(ctx, s * 0.02, s * 0.3, s * 0.98, s * 0.5, 6);
  ctx.fill();

  // tufting buttons
  ctx.fillStyle = hexRGBA(0x5a5a4a, 0.5);
  for (const [bx, by] of [[s * 0.6, s * 0.42], [s * 0.8, s * 0.42], [s * 0.6, s * 0.6], [s * 0.8, s * 0.6]]) {
    ctx.beginPath();
    ctx.arc(bx, by, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // pillow — lumpy
  ctx.fillStyle = hexRGBA(0xcacaba, 0.5);
  ctx.beginPath();
  ctx.ellipse(s * 0.75, s * 0.4, s * 0.1, s * 0.06, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // stain
  ctx.fillStyle = hexRGBA(0x4a3a1a, 0.15);
  ctx.beginPath();
  ctx.ellipse(s * 0.6, s * 0.65, s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // piping edge
  ctx.strokeStyle = hexRGBA(0x5a5a4a, 0.4);
  ctx.lineWidth = 1;
  roundRect(ctx, s * 0.02, s * 0.3, s * 0.98, s * 0.5, 6);
  ctx.stroke();
}

/** Dead plant — brown and wilted (tile 31, replaces large plant) */
function drawDeadPlant(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.82, s * 0.18, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // pot — cracked terracotta
  const potGrad = linearGrad(ctx, cx - s * 0.14, 0, cx + s * 0.14, 0, [
    [0, shade(0x8a5a3a, -15)],
    [0.5, shade(0xaa6a4a, 5)],
    [1, shade(0x8a5a3a, -15)],
  ]);
  ctx.fillStyle = potGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, s * 0.6);
  ctx.lineTo(cx - s * 0.1, s * 0.82);
  ctx.lineTo(cx + s * 0.1, s * 0.82);
  ctx.lineTo(cx + s * 0.12, s * 0.6);
  ctx.closePath();
  ctx.fill();

  // crack in pot
  ctx.strokeStyle = hexRGBA(0x3a2a1a, 0.6);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.05, s * 0.62);
  ctx.lineTo(cx - s * 0.08, s * 0.75);
  ctx.stroke();

  // dead stems — brown, drooping
  ctx.strokeStyle = hexRGBA(0x6a5a2a, 0.7);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.4;
    const bx = cx + (i - 2) * s * 0.04;
    const by = s * 0.6;
    const len = s * 0.2 + (i % 2) * s * 0.05;
    const tx = bx + Math.cos(a) * len * 0.7;
    const ty = by + Math.sin(a) * len + s * 0.05; // droop down
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.4, by - len * 0.1, tx, ty);
    ctx.stroke();
  }

  // dead leaves — brown
  ctx.fillStyle = hexRGBA(0x5a4a1a, 0.5);
  for (let i = 0; i < 4; i++) {
    const x = cx + (i - 1.5) * s * 0.06;
    const y = s * 0.45 + (i % 2) * s * 0.05;
    ctx.beginPath();
    ctx.ellipse(x, y, 3, 1.5, i * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Spray paint can (tile 32, replaces toaster) */
function drawSprayPaintCan(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.86, s * 0.12, s * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();

  // can body
  const canGrad = linearGrad(ctx, cx - s * 0.1, 0, cx + s * 0.1, 0, [
    [0, shade(0x9a3a5a, -15)],
    [0.5, shade(0xba4a6a, 10)],
    [1, shade(0x9a3a5a, -15)],
  ]);
  ctx.fillStyle = canGrad;
  roundRect(ctx, cx - s * 0.1, s * 0.2, s * 0.2, s * 0.62, 3);
  ctx.fill();

  // can top — chrome
  ctx.fillStyle = shade(METAL, 10);
  roundRect(ctx, cx - s * 0.08, s * 0.15, s * 0.16, s * 0.06, 2);
  ctx.fill();

  // nozzle
  ctx.fillStyle = shade(METAL_DARK, 0);
  ctx.fillRect(cx - s * 0.02, s * 0.08, s * 0.04, s * 0.08);
  // spray tip
  ctx.fillStyle = shade(0x1a1a1e, 0);
  ctx.fillRect(cx - s * 0.01, s * 0.06, s * 0.02, s * 0.04);

  // label band
  ctx.fillStyle = hexRGBA(0xffffff, 0.7);
  ctx.fillRect(cx - s * 0.09, s * 0.4, s * 0.18, s * 0.15);
  ctx.fillStyle = hexRGBA(0x1a1a1e, 0.8);
  ctx.font = "bold 6px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PAINT", cx, s * 0.49);
  ctx.textAlign = "left";

  // color dot on label
  ctx.fillStyle = hexRGBA(0xff4a8a, 0.8);
  ctx.beginPath();
  ctx.arc(cx, s * 0.53, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Fuse box as server rack (tile 35, replaces server rack) */
function drawFuseBox(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.9, s * 0.24, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // metal cabinet
  const cabGrad = linearGrad(ctx, cx - s * 0.2, 0, cx + s * 0.2, 0, [
    [0, shade(METAL_DARK, -15)],
    [0.5, shade(METAL, 5)],
    [1, shade(METAL_DARK, -15)],
  ]);
  ctx.fillStyle = cabGrad;
  roundRect(ctx, cx - s * 0.2, s * 0.05, s * 0.4, s * 0.85, 3);
  ctx.fill();

  // rust
  ctx.fillStyle = hexRGBA(RUST, 0.2);
  ctx.fillRect(cx - s * 0.18, s * 0.1, s * 0.04, s * 0.3);
  ctx.fillRect(cx + s * 0.1, s * 0.5, s * 0.03, s * 0.2);

  // breaker switches — rows
  for (let row = 0; row < 4; row++) {
    const ry = s * 0.15 + row * s * 0.18;
    // row background
    ctx.fillStyle = hexRGBA(0x1a1a1e, 0.6);
    ctx.fillRect(cx - s * 0.16, ry, s * 0.32, s * 0.12);

    // breakers
    for (let col = 0; col < 4; col++) {
      const bx = cx - s * 0.14 + col * s * 0.08;
      const on = (row + col) % 3 !== 0;
      ctx.fillStyle = on ? hexRGBA(0x4aff88, 0.5) : hexRGBA(0x4a4a4e, 0.8);
      ctx.fillRect(bx, ry + s * 0.02, s * 0.05, s * 0.08);
      // switch lever
      ctx.fillStyle = shade(0x2a2a2e, 0);
      ctx.fillRect(bx + s * 0.015, ry + (on ? s * 0.02 : s * 0.06), s * 0.02, s * 0.03);
    }
  }

  // warning sticker
  ctx.fillStyle = hexRGBA(0xffaa00, 0.6);
  roundRect(ctx, cx - s * 0.06, s * 0.82, s * 0.12, s * 0.05, 1);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x1a1a1e, 0.8);
  ctx.font = "bold 5px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HV", cx, s * 0.86);
  ctx.textAlign = "left";
}

/** Fuse box screen — gauges (tile 36, replaces server screen) */
function drawFuseBoxScreen(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // screen background
  ctx.fillStyle = hexRGBA(0x0a0a12, 0.9);
  roundRect(ctx, cx - s * 0.18, s * 0.1, s * 0.36, s * 0.7, 3);
  ctx.fill();

  // screen border
  ctx.strokeStyle = hexRGBA(METAL_DARK, 0.6);
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - s * 0.18, s * 0.1, s * 0.36, s * 0.7, 3);
  ctx.stroke();

  // analog gauges — two
  for (let i = 0; i < 2; i++) {
    const gx = cx + (i === 0 ? -s * 0.08 : s * 0.08);
    const gy = s * 0.32;

    // gauge face
    ctx.fillStyle = hexRGBA(0xeae8e0, 0.7);
    ctx.beginPath();
    ctx.arc(gx, gy, s * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // gauge needle
    ctx.strokeStyle = hexRGBA(0xcc2222, 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    const angle = -Math.PI / 2 + (i === 0 ? 0.6 : -0.3);
    ctx.lineTo(gx + Math.cos(angle) * s * 0.05, gy + Math.sin(angle) * s * 0.05);
    ctx.stroke();

    // gauge center
    ctx.fillStyle = hexRGBA(0x1a1a1e, 0.8);
    ctx.beginPath();
    ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // LED row
  for (let i = 0; i < 5; i++) {
    const lx = cx - s * 0.12 + i * s * 0.06;
    ctx.fillStyle = i < 3 ? hexRGBA(0x4aff44, 0.6) : hexRGBA(0x4a4a4e, 0.5);
    ctx.beginPath();
    ctx.arc(lx, s * 0.55, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // warning text
  ctx.fillStyle = hexRGBA(0xffaa00, 0.5);
  ctx.font = "bold 5px monospace";
  ctx.textAlign = "center";
  ctx.fillText("LOAD OK", cx, s * 0.7);
  ctx.textAlign = "left";
}

/** Steam vent (tile 37, replaces chimney) */
function drawSteamVent(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // vent base — metal grate
  ctx.fillStyle = shade(METAL_DARK, -5);
  roundRect(ctx, cx - s * 0.2, s * 0.6, s * 0.4, s * 0.25, 3);
  ctx.fill();

  // grate slats
  ctx.strokeStyle = hexRGBA(0x1a1a1e, 0.7);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const x = cx - s * 0.16 + i * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(x, s * 0.62);
    ctx.lineTo(x, s * 0.83);
    ctx.stroke();
  }

  // rust around vent
  ctx.fillStyle = hexRGBA(RUST, 0.25);
  ctx.beginPath();
  ctx.arc(cx - s * 0.15, s * 0.7, s * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.14, s * 0.78, s * 0.025, 0, Math.PI * 2);
  ctx.fill();

  // steam clouds — rising
  for (let i = 0; i < 4; i++) {
    const sx = cx + (i - 1.5) * s * 0.08;
    const sy = s * 0.5 - i * s * 0.08;
    const r = s * 0.06 + i * s * 0.01;
    ctx.fillStyle = hexRGBA(0xcccccc, 0.15 - i * 0.02);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // heat shimmer
  ctx.fillStyle = hexRGBA(0xff6a2a, 0.05);
  ctx.beginPath();
  ctx.arc(cx, s * 0.58, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- registration ---------- */

export function registerAlleyFurniture(): void {
  registerThemeFurniture(17, drawCardboardStationLeft);
  registerThemeFurniture(18, drawCardboardStationRight);
  registerThemeFurniture(19, drawCrateStool);
  registerThemeFurniture(20, drawDumpster);
  registerThemeFurniture(21, drawWeedPatch);
  registerThemeFurniture(22, drawAlleyWindow);
  registerThemeFurniture(23, drawBarrelFireTop);
  registerThemeFurniture(24, drawBarrelFireBottom);
  registerThemeFurniture(25, drawShoppingCart);
  registerThemeFurniture(26, drawAlleyCounter);
  registerThemeFurniture(27, drawPuddle);
  registerThemeFurniture(28, drawTrashCan);
  registerThemeFurniture(29, drawMattressLeft);
  registerThemeFurniture(30, drawMattressRight);
  registerThemeFurniture(31, drawDeadPlant);
  registerThemeFurniture(32, drawSprayPaintCan);
  registerThemeFurniture(35, drawFuseBox);
  registerThemeFurniture(36, drawFuseBoxScreen);
  registerThemeFurniture(37, drawSteamVent);
}

// Auto-register on import
registerAlleyFurniture();
