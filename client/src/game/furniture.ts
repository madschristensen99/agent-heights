/**
 * Procedural Office Furniture Renderer
 *
 * Generates high-fidelity furniture sprites at runtime and overlays them
 * on top of the Tiled map's furniture layer, replacing the simple tile shapes
 * with detailed, shaded, properly proportioned office furniture.
 */

import Phaser from "phaser";
import {
  AI_FURNITURE_TEXTURES,
  AI_FURNITURE_CHAIRS,
  AI_FURNITURE_MONITORS,
  AI_FURNITURE_MONITORS_SIDE,
} from "./ai-tiles";
import type { WorldTheme } from "../../../shared/types";

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

/** Desk surface — left half (tile 17) — modern white laminate */
function drawDeskLeft(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;
  const topY = s * 0.22;
  const h = s * 0.38;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.18);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.74, s * 0.48, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk leg (right side — shared with right half) — brushed aluminum
  const legGrad = linearGrad(ctx, s * 0.44, 0, s * 0.52, 0, [
    [0, shade(0x8a8a90, -10)],
    [0.5, shade(0xc0c0c8, 15)],
    [1, shade(0x6a6a70, -15)],
  ]);
  ctx.fillStyle = legGrad;
  ctx.fillRect(s * 0.46, s * 0.55, 5, s * 0.2);
  ctx.fillStyle = shade(0x4a4a50, -10);
  ctx.fillRect(s * 0.45, s * 0.73, 7, 3);

  // desk surface — modern white laminate with subtle warm tint
  const surfaceGrad = linearGrad(ctx, 0, topY, 0, topY + h, [
    [0, shade(0xf4f4f6, 8)],
    [0.3, shade(0xe8e8ec, 0)],
    [0.7, shade(0xd8d8dc, -8)],
    [1, shade(0xc8c8cc, -18)],
  ]);
  ctx.fillStyle = surfaceGrad;
  roundRect(ctx, 2, topY, s - 2, h, 4);
  ctx.fill();

  // ambient occlusion — subtle darkening at edges
  ctx.fillStyle = hexRGBA(0x000000, 0.06);
  ctx.fillRect(2, topY, 3, h);
  ctx.fillRect(s - 5, topY, 3, h);

  // front panel — matte charcoal with metallic trim
  const panelGrad = linearGrad(ctx, 0, topY + h, 0, s * 0.97, [
    [0, shade(0x3a3a42, 5)],
    [0.4, shade(0x2e2e36, 0)],
    [1, shade(0x222228, -10)],
  ]);
  ctx.fillStyle = panelGrad;
  roundRect(ctx, 2, topY + h, s - 2, s * 0.37, 4);
  ctx.fill();

  // metallic trim line at panel top
  const trimGrad = linearGrad(ctx, 0, 0, s, 0, [
    [0, hexRGBA(0x888890, 0.3)],
    [0.5, hexRGBA(0xc8c8d0, 0.6)],
    [1, hexRGBA(0x888890, 0.3)],
  ]);
  ctx.fillStyle = trimGrad;
  ctx.fillRect(2, topY + h, s - 2, 1.5);

  // cable management cutout on front panel
  ctx.fillStyle = hexRGBA(0x1a1a1e, 0.8);
  roundRect(ctx, s * 0.35, s * 0.68, s * 0.2, s * 0.04, 2);
  ctx.fill();

  // surface texture — subtle matte finish noise lines
  ctx.strokeStyle = hexRGBA(0xc0c0c8, 0.08);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) {
    const y = topY + 5 + i * (h / 5);
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.lineTo(s - 4, y + 0.3);
    ctx.stroke();
  }

  // top edge bevel highlight — bright white
  ctx.strokeStyle = hexRGBA(0xffffff, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4, topY + 1);
  ctx.lineTo(s - 4, topY + 1);
  ctx.stroke();

  // front edge shadow line
  ctx.strokeStyle = hexRGBA(0x1a1a20, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, topY + h - 0.5);
  ctx.lineTo(s - 2, topY + h - 0.5);
  ctx.stroke();

}

/** Desk surface — right half (tile 18) — modern white laminate */
function drawDeskRight(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;
  const topY = s * 0.22;
  const h = s * 0.38;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.18);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.74, s * 0.48, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk leg (left side) — brushed aluminum
  const legGrad = linearGrad(ctx, s * 0.06, 0, s * 0.14, 0, [
    [0, shade(0x6a6a70, -15)],
    [0.5, shade(0xc0c0c8, 15)],
    [1, shade(0x8a8a90, -10)],
  ]);
  ctx.fillStyle = legGrad;
  ctx.fillRect(s * 0.08, s * 0.55, 5, s * 0.2);
  ctx.fillStyle = shade(0x4a4a50, -10);
  ctx.fillRect(s * 0.07, s * 0.73, 7, 3);

  // desk surface — modern white laminate matching left half
  const surfaceGrad = linearGrad(ctx, 0, topY, 0, topY + h, [
    [0, shade(0xf4f4f6, 8)],
    [0.3, shade(0xe8e8ec, 0)],
    [0.7, shade(0xd8d8dc, -8)],
    [1, shade(0xc8c8cc, -18)],
  ]);
  ctx.fillStyle = surfaceGrad;
  roundRect(ctx, 0, topY, s - 2, h, 4);
  ctx.fill();

  // ambient occlusion
  ctx.fillStyle = hexRGBA(0x000000, 0.06);
  ctx.fillRect(0, topY, 3, h);
  ctx.fillRect(s - 5, topY, 3, h);

  // front panel — matte charcoal matching left half
  const panelGrad = linearGrad(ctx, 0, topY + h, 0, s * 0.97, [
    [0, shade(0x3a3a42, 5)],
    [0.4, shade(0x2e2e36, 0)],
    [1, shade(0x222228, -10)],
  ]);
  ctx.fillStyle = panelGrad;
  roundRect(ctx, 0, topY + h, s - 2, s * 0.37, 4);
  ctx.fill();

  // metallic trim line at panel top
  const trimGrad = linearGrad(ctx, 0, 0, s, 0, [
    [0, hexRGBA(0x888890, 0.3)],
    [0.5, hexRGBA(0xc8c8d0, 0.6)],
    [1, hexRGBA(0x888890, 0.3)],
  ]);
  ctx.fillStyle = trimGrad;
  ctx.fillRect(0, topY + h, s - 2, 1.5);

  // surface texture — subtle matte finish
  ctx.strokeStyle = hexRGBA(0xc0c0c8, 0.08);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) {
    const y = topY + 5 + i * (h / 5);
    ctx.beginPath();
    ctx.moveTo(2, y);
    ctx.lineTo(s - 4, y + 0.3);
    ctx.stroke();
  }

  // top edge bevel highlight
  ctx.strokeStyle = hexRGBA(0xffffff, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2, topY + 1);
  ctx.lineTo(s - 4, topY + 1);
  ctx.stroke();

  // front edge shadow line
  ctx.strokeStyle = hexRGBA(0x1a1a20, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, topY + h - 0.5);
  ctx.lineTo(s - 2, topY + h - 0.5);
  ctx.stroke();

}

/** Office chair (tile 19) — premium executive with mesh back and chrome base */
function drawOfficeChair(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.28, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5-star wheel base — chrome/polished
  const chromeGrad = linearGrad(ctx, -3, 0, 3, 0, [
    [0, shade(0x6a6a70, -15)],
    [0.5, shade(0xc0c0c8, 20)],
    [1, shade(0x6a6a70, -15)],
  ]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, s * 0.78);
    ctx.rotate(a);
    ctx.fillStyle = chromeGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, s * 0.12);
    ctx.lineTo(3, s * 0.12);
    ctx.closePath();
    ctx.fill();
    // wheel — dark rubber
    ctx.beginPath();
    ctx.arc(0, s * 0.13, 3, 0, Math.PI * 2);
    ctx.fillStyle = shade(0x1a1a20, 0);
    ctx.fill();
    ctx.restore();
  }

  // center column — polished chrome
  const colGrad = linearGrad(ctx, cx - 4, 0, cx + 4, 0, [
    [0, shade(0x5a5a60, -10)],
    [0.5, shade(0xb0b0b8, 20)],
    [1, shade(0x5a5a60, -10)],
  ]);
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - 4, s * 0.5, 8, s * 0.28);

  // seat — charcoal cushion with subtle sheen
  const seatGrad = linearGrad(ctx, 0, s * 0.38, 0, s * 0.52, [
    [0, shade(0x3a3a42, 15)],
    [0.5, shade(0x2a2a32, 0)],
    [1, shade(0x1a1a22, -15)],
  ]);
  ctx.fillStyle = seatGrad;
  roundRect(ctx, cx - s * 0.18, s * 0.38, s * 0.36, s * 0.14, 6);
  ctx.fill();
  // seat cushion seam
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.4);
  ctx.lineWidth = 0.8;
  roundRect(ctx, cx - s * 0.15, s * 0.4, s * 0.3, s * 0.1, 4);
  ctx.stroke();
  // seat highlight
  ctx.fillStyle = hexRGBA(0x5a5a62, 0.15);
  ctx.fillRect(cx - s * 0.14, s * 0.39, s * 0.28, 2);

  // backrest — charcoal mesh with headrest
  const backGrad = linearGrad(ctx, 0, s * 0.06, 0, s * 0.38, [
    [0, shade(0x3a3a42, 20)],
    [0.5, shade(0x2a2a32, 5)],
    [1, shade(0x1a1a22, -12)],
  ]);
  ctx.fillStyle = backGrad;
  roundRect(ctx, cx - s * 0.16, s * 0.06, s * 0.32, s * 0.34, 8);
  ctx.fill();

  // headrest — small bump at top
  ctx.fillStyle = shade(0x2a2a32, 10);
  roundRect(ctx, cx - s * 0.12, s * 0.04, s * 0.24, s * 0.06, 6);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.fillRect(cx - s * 0.10, s * 0.05, s * 0.20, 1.5);

  // mesh weave pattern — horizontal lines
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    const y = s * 0.12 + i * s * 0.04;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.14, y);
    ctx.lineTo(cx + s * 0.14, y);
    ctx.stroke();
  }
  // mesh weave — vertical lines (interleaved)
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.12);
  for (let i = 0; i < 5; i++) {
    const x = cx - s * 0.12 + i * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(x, s * 0.12);
    ctx.lineTo(x, s * 0.36);
    ctx.stroke();
  }

  // lumbar curve highlight
  ctx.fillStyle = hexRGBA(0x5a5a62, 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.28, s * 0.1, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // armrests — with padding detail
  ctx.fillStyle = shade(0x2a2a32, -5);
  roundRect(ctx, cx - s * 0.22, s * 0.36, s * 0.05, s * 0.12, 3);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.fillRect(cx - s * 0.21, s * 0.37, s * 0.03, s * 0.08);
  roundRect(ctx, cx + s * 0.17, s * 0.36, s * 0.05, s * 0.12, 3);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.fillRect(cx + s * 0.18, s * 0.37, s * 0.03, s * 0.08);
}

/** Office chair facing up toward desk — rear view (assigned seat) — premium executive */
function drawOfficeChairUp(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.26, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5-star wheel base — chrome
  const chromeGrad = linearGrad(ctx, -3, 0, 3, 0, [
    [0, shade(0x5a5a60, -15)],
    [0.5, shade(0xb0b0b8, 20)],
    [1, shade(0x5a5a60, -15)],
  ]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, s * 0.8);
    ctx.rotate(a);
    ctx.fillStyle = chromeGrad;
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
    ctx.restore();
  }

  // center column — polished chrome
  const colGrad = linearGrad(ctx, cx - 3, 0, cx + 3, 0, [
    [0, shade(0x5a5a60, -10)],
    [0.5, shade(0xb0b0b8, 20)],
    [1, shade(0x5a5a60, -10)],
  ]);
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - 3, s * 0.62, 6, s * 0.2);

  // seat — charcoal, front edge visible
  const seatGrad = linearGrad(ctx, 0, s * 0.54, 0, s * 0.66, [
    [0, shade(0x2a2a32, 5)],
    [0.5, shade(0x1a1a22, -5)],
    [1, shade(0x12121a, -15)],
  ]);
  ctx.fillStyle = seatGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, s * 0.54);
  ctx.lineTo(cx + s * 0.14, s * 0.54);
  ctx.lineTo(cx + s * 0.16, s * 0.66);
  ctx.lineTo(cx - s * 0.16, s * 0.66);
  ctx.closePath();
  ctx.fill();

  // back of backrest — charcoal mesh, ergonomic flare
  const backGrad = linearGrad(ctx, 0, s * 0.06, 0, s * 0.58, [
    [0, shade(0x2a2a32, 10)],
    [0.3, shade(0x2a2a32, 0)],
    [0.7, shade(0x1a1a22, -8)],
    [1, shade(0x12121a, -18)],
  ]);
  ctx.fillStyle = backGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.13, s * 0.08);
  ctx.quadraticCurveTo(cx - s * 0.16, s * 0.06, cx - s * 0.15, s * 0.10);
  ctx.lineTo(cx - s * 0.17, s * 0.52);
  ctx.quadraticCurveTo(cx - s * 0.17, s * 0.58, cx - s * 0.13, s * 0.58);
  ctx.lineTo(cx + s * 0.13, s * 0.58);
  ctx.quadraticCurveTo(cx + s * 0.17, s * 0.58, cx + s * 0.17, s * 0.52);
  ctx.lineTo(cx + s * 0.15, s * 0.10);
  ctx.quadraticCurveTo(cx + s * 0.16, s * 0.06, cx + s * 0.13, s * 0.08);
  ctx.quadraticCurveTo(cx, s * 0.04, cx - s * 0.13, s * 0.08);
  ctx.closePath();
  ctx.fill();

  // headrest bump at top
  ctx.fillStyle = shade(0x2a2a32, 8);
  roundRect(ctx, cx - s * 0.10, s * 0.04, s * 0.20, s * 0.05, 5);
  ctx.fill();

  // rear seam — vertical center line
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.12);
  ctx.lineTo(cx, s * 0.52);
  ctx.stroke();

  // mesh weave pattern — horizontal lines on rear
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.15);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const y = s * 0.16 + i * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.14, y);
    ctx.quadraticCurveTo(cx, y + 1, cx + s * 0.14, y);
    ctx.stroke();
  }

  // top edge highlight
  ctx.fillStyle = hexRGBA(0x5a5a62, 0.2);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.12, s * 0.08);
  ctx.quadraticCurveTo(cx, s * 0.05, cx + s * 0.12, s * 0.08);
  ctx.lineTo(cx + s * 0.11, s * 0.12);
  ctx.quadraticCurveTo(cx, s * 0.09, cx - s * 0.11, s * 0.12);
  ctx.closePath();
  ctx.fill();

  // armrest tops — tips visible on either side
  ctx.fillStyle = shade(0x2a2a32, -8);
  roundRect(ctx, cx - s * 0.2, s * 0.36, s * 0.04, s * 0.08, 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.fillRect(cx - s * 0.19, s * 0.37, s * 0.02, s * 0.05);
  roundRect(ctx, cx + s * 0.16, s * 0.36, s * 0.04, s * 0.08, 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.fillRect(cx + s * 0.17, s * 0.37, s * 0.02, s * 0.05);
}

/** Office chair facing left — side view (Office Manager's chair) — premium executive */
function drawOfficeChairLeft(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.28, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5-star wheel base — chrome
  const chromeGrad = linearGrad(ctx, -3, 0, 3, 0, [
    [0, shade(0x5a5a60, -15)],
    [0.5, shade(0xb0b0b8, 20)],
    [1, shade(0x5a5a60, -15)],
  ]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, s * 0.78);
    ctx.rotate(a);
    ctx.fillStyle = chromeGrad;
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
    ctx.restore();
  }

  // center column — polished chrome
  const colGrad = linearGrad(ctx, cx - 4, 0, cx + 4, 0, [
    [0, shade(0x5a5a60, -10)],
    [0.5, shade(0xb0b0b8, 20)],
    [1, shade(0x5a5a60, -10)],
  ]);
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - 4, s * 0.5, 8, s * 0.28);

  // seat — charcoal, side view
  const seatGrad = linearGrad(ctx, 0, s * 0.38, 0, s * 0.52, [
    [0, shade(0x3a3a42, 15)],
    [0.5, shade(0x2a2a32, 0)],
    [1, shade(0x1a1a22, -15)],
  ]);
  ctx.fillStyle = seatGrad;
  roundRect(ctx, cx - s * 0.14, s * 0.38, s * 0.28, s * 0.14, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.4);
  ctx.lineWidth = 0.8;
  roundRect(ctx, cx - s * 0.11, s * 0.4, s * 0.22, s * 0.1, 4);
  ctx.stroke();

  // backrest — on right side (chair faces left), charcoal mesh
  const backGrad = linearGrad(ctx, s * 0.55, 0, s * 0.92, 0, [
    [0, shade(0x3a3a42, 20)],
    [0.5, shade(0x2a2a32, 5)],
    [1, shade(0x1a1a22, -10)],
  ]);
  ctx.fillStyle = backGrad;
  roundRect(ctx, s * 0.55, s * 0.06, s * 0.32, s * 0.36, 8);
  ctx.fill();

  // headrest bump
  ctx.fillStyle = shade(0x2a2a32, 10);
  roundRect(ctx, s * 0.57, s * 0.04, s * 0.28, s * 0.05, 5);
  ctx.fill();

  // mesh weave pattern — horizontal lines
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const y = s * 0.12 + i * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(s * 0.57, y);
    ctx.lineTo(s * 0.85, y);
    ctx.stroke();
  }

  // lumbar curve highlight
  ctx.fillStyle = hexRGBA(0x5a5a62, 0.12);
  ctx.beginPath();
  ctx.ellipse(s * 0.71, s * 0.25, s * 0.04, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // armrest (left side only visible) with padding detail
  ctx.fillStyle = shade(0x2a2a32, -5);
  roundRect(ctx, cx - s * 0.18, s * 0.36, s * 0.05, s * 0.12, 3);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.fillRect(cx - s * 0.17, s * 0.37, s * 0.03, s * 0.08);
}

/** Filing cabinet (tile 20) */
function drawFilingCabinet(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.22, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // cabinet body — grey metal with gradient
  const bodyGrad = linearGrad(ctx, cx - s * 0.2, 0, cx + s * 0.2, 0, [
    [0, shade(0x6a7078, -20)],
    [0.5, shade(0x8a9098, 10)],
    [1, shade(0x6a7078, -20)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, cx - s * 0.2, s * 0.1, s * 0.4, s * 0.78, 3);
  ctx.fill();

  // top edge highlight
  ctx.fillStyle = shade(0x8a9098, 20);
  roundRect(ctx, cx - s * 0.2, s * 0.1, s * 0.4, s * 0.04, 2);
  ctx.fill();

  // drawer divider lines
  ctx.strokeStyle = hexRGBA(0x4a5058, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.18, s * 0.5);
  ctx.lineTo(cx + s * 0.18, s * 0.5);
  ctx.stroke();

  // drawer handles — two small drawer pulls
  ctx.fillStyle = shade(0x4a5058, -10);
  for (const dy of [s * 0.3, s * 0.68]) {
    roundRect(ctx, cx - s * 0.06, dy, s * 0.12, s * 0.03, 1);
    ctx.fill();
  }

  // label slots
  ctx.fillStyle = hexRGBA(0xeeeeee, 0.8);
  for (const dy of [s * 0.2, s * 0.56]) {
    roundRect(ctx, cx - s * 0.08, dy, s * 0.16, s * 0.04, 1);
    ctx.fill();
  }
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

/** Side-view desk — top tile (desk surface on left, front panel on right facing the Office Manager) */
function drawDeskSideTop(ctx: CanvasRenderingContext2D, s: number): void {
  const surfaceW = s * 0.7;
  const panelX = surfaceW;
  const panelW = s - surfaceW;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.beginPath();
  ctx.ellipse(s * 0.35, s * 0.92, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk surface — left portion (top-down view, the working area)
  const surfGrad = linearGrad(ctx, 0, 0, 0, s, [
    [0, shade(0xf4f6f8, 5)],
    [0.5, shade(0xe4e6e8, 0)],
    [1, shade(0xd4d6d8, -5)],
  ]);
  ctx.fillStyle = surfGrad;
  ctx.fillRect(0, 0, surfaceW, s);
  // left edge highlight (facing entrance)
  ctx.fillStyle = hexRGBA(0xffffff, 0.3);
  ctx.fillRect(0, 0, 2, s);
  // top edge
  ctx.fillStyle = hexRGBA(0xb8babc, 0.5);
  ctx.fillRect(0, 0, surfaceW, 2);
  // subtle monitor glow reflection on desk surface
  ctx.fillStyle = hexRGBA(0x88bbff, 0.04);
  ctx.fillRect(0, s * 0.3, surfaceW, s * 0.4);

  // front panel — right portion (facing the Office Manager who sits on the right)
  const panelGrad = linearGrad(ctx, panelX, 0, s, 0, [
    [0, shade(0x3a3a42, 5)],
    [0.5, shade(0x2e2e36, 0)],
    [1, shade(0x222228, -10)],
  ]);
  ctx.fillStyle = panelGrad;
  ctx.fillRect(panelX, 0, panelW, s);
  // metallic trim at panel left edge
  ctx.fillStyle = hexRGBA(0xc8c8d0, 0.4);
  ctx.fillRect(panelX, 0, 1.5, s);
  // panel right edge
  ctx.fillStyle = shade(0x1a1a20, -10);
  ctx.fillRect(s - 2, 0, 2, s);
  // panel top edge
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.5);
  ctx.fillRect(panelX, 0, panelW, 2);

  // cable hole on desk surface
  ctx.beginPath();
  ctx.ellipse(s * 0.35, s * 0.15, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexRGBA(0x1a1a1a, 0.6);
  ctx.fill();
}

/** Side-view desk — bottom tile (surface continuation + front panel + items + legs) */
function drawDeskSideBottom(ctx: CanvasRenderingContext2D, s: number): void {
  const surfaceW = s * 0.7;
  const panelX = surfaceW;
  const panelW = s - surfaceW;

  // desk surface continuation
  const surfGrad = linearGrad(ctx, 0, 0, 0, s, [
    [0, shade(0xf4f6f8, 5)],
    [0.5, shade(0xe4e6e8, 0)],
    [1, shade(0xd4d6d8, -5)],
  ]);
  ctx.fillStyle = surfGrad;
  ctx.fillRect(0, 0, surfaceW, s);
  ctx.fillStyle = hexRGBA(0xffffff, 0.2);
  ctx.fillRect(0, 0, 1, s);
  // subtle monitor glow reflection
  ctx.fillStyle = hexRGBA(0x88bbff, 0.04);
  ctx.fillRect(0, s * 0.3, surfaceW, s * 0.4);

  // front panel continuation — matte charcoal matching front desk
  const panelGrad = linearGrad(ctx, panelX, 0, s, 0, [
    [0, shade(0x3a3a42, 5)],
    [0.5, shade(0x2e2e36, 0)],
    [1, shade(0x222228, -10)],
  ]);
  ctx.fillStyle = panelGrad;
  ctx.fillRect(panelX, 0, panelW, s);
  // metallic trim
  ctx.fillStyle = hexRGBA(0xc8c8d0, 0.4);
  ctx.fillRect(panelX, 0, 1.5, s);
  ctx.fillStyle = shade(0x1a1a20, -10);
  ctx.fillRect(s - 2, 0, 2, s);

  // bottom edge
  ctx.fillStyle = shade(0x1a1a20, -10);
  ctx.fillRect(0, s - 2, s, 2);

  // desk legs under surface — brushed aluminum
  const legGrad = linearGrad(ctx, s * 0.04, 0, s * 0.12, 0, [
    [0, shade(0x6a6a70, -15)],
    [0.5, shade(0xb0b0b8, 10)],
    [1, shade(0x6a6a70, -10)],
  ]);
  ctx.fillStyle = legGrad;
  ctx.fillRect(s * 0.06, s * 0.85, 6, s * 0.12);
  ctx.fillRect(s * 0.56, s * 0.85, 6, s * 0.12);
  ctx.fillStyle = shade(0x3a3a40, -5);
  ctx.fillRect(s * 0.06, s * 0.95, 10, 3);
  ctx.fillRect(s * 0.56, s * 0.95, 10, 3);
}

/** Mirrored side-view desk — top tile (front panel on left, desk surface on right, chair on left facing right) */
function drawDeskSideTopMirror(ctx: CanvasRenderingContext2D, s: number): void {
  const panelW = s * 0.3;
  const surfaceX = panelW;
  const surfaceW = s - panelW;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.12);
  ctx.beginPath();
  ctx.ellipse(s * 0.65, s * 0.92, s * 0.3, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // front panel — left portion (matte charcoal matching front desk)
  const panelGrad = linearGrad(ctx, 0, 0, panelW, 0, [
    [0, shade(0x222228, -10)],
    [0.5, shade(0x2e2e36, 0)],
    [1, shade(0x3a3a42, 5)],
  ]);
  ctx.fillStyle = panelGrad;
  ctx.fillRect(0, 0, panelW, s);
  // metallic trim at panel right edge (transition to surface)
  ctx.fillStyle = hexRGBA(0xc8c8d0, 0.4);
  ctx.fillRect(panelW - 1.5, 0, 1.5, s);
  // panel left edge
  ctx.fillStyle = shade(0x1a1a20, -10);
  ctx.fillRect(0, 0, 2, s);
  // panel top edge
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.5);
  ctx.fillRect(0, 0, panelW, 2);

  // desk surface — right portion (top-down view, the working area)
  const surfGrad = linearGrad(ctx, 0, 0, 0, s, [
    [0, shade(0xf4f6f8, 5)],
    [0.5, shade(0xe4e6e8, 0)],
    [1, shade(0xd4d6d8, -5)],
  ]);
  ctx.fillStyle = surfGrad;
  ctx.fillRect(surfaceX, 0, surfaceW, s);
  // right edge highlight (facing entrance)
  ctx.fillStyle = hexRGBA(0xffffff, 0.3);
  ctx.fillRect(s - 2, 0, 2, s);
  // top edge
  ctx.fillStyle = hexRGBA(0xb8babc, 0.5);
  ctx.fillRect(surfaceX, 0, surfaceW, 2);
  // subtle monitor glow reflection on desk surface
  ctx.fillStyle = hexRGBA(0x88bbff, 0.04);
  ctx.fillRect(surfaceX, s * 0.3, surfaceW, s * 0.4);

  // cable hole on desk surface
  ctx.beginPath();
  ctx.ellipse(s * 0.65, s * 0.15, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexRGBA(0x1a1a1a, 0.6);
  ctx.fill();
}

/** Mirrored side-view desk — bottom tile (front panel + surface continuation + items + legs) */
function drawDeskSideBottomMirror(ctx: CanvasRenderingContext2D, s: number): void {
  const panelW = s * 0.3;
  const surfaceX = panelW;
  const surfaceW = s - panelW;

  // front panel continuation — matte charcoal
  const panelGrad = linearGrad(ctx, 0, 0, panelW, 0, [
    [0, shade(0x222228, -10)],
    [0.5, shade(0x2e2e36, 0)],
    [1, shade(0x3a3a42, 5)],
  ]);
  ctx.fillStyle = panelGrad;
  ctx.fillRect(0, 0, panelW, s);
  // metallic trim
  ctx.fillStyle = hexRGBA(0xc8c8d0, 0.4);
  ctx.fillRect(panelW - 1.5, 0, 1.5, s);
  ctx.fillStyle = shade(0x1a1a20, -10);
  ctx.fillRect(0, 0, 2, s);

  // desk surface continuation
  const surfGrad = linearGrad(ctx, 0, 0, 0, s, [
    [0, shade(0xf4f6f8, 5)],
    [0.5, shade(0xe4e6e8, 0)],
    [1, shade(0xd4d6d8, -5)],
  ]);
  ctx.fillStyle = surfGrad;
  ctx.fillRect(surfaceX, 0, surfaceW, s);
  ctx.fillStyle = hexRGBA(0xffffff, 0.2);
  ctx.fillRect(s - 1, 0, 1, s);
  // subtle monitor glow reflection
  ctx.fillStyle = hexRGBA(0x88bbff, 0.04);
  ctx.fillRect(surfaceX, s * 0.3, surfaceW, s * 0.4);

  // bottom edge
  ctx.fillStyle = shade(0x1a1a20, -10);
  ctx.fillRect(0, s - 2, s, 2);

  // desk legs under surface — brushed aluminum
  const legGrad = linearGrad(ctx, s * 0.36, 0, s * 0.44, 0, [
    [0, shade(0x6a6a70, -15)],
    [0.5, shade(0xb0b0b8, 10)],
    [1, shade(0x6a6a70, -10)],
  ]);
  ctx.fillStyle = legGrad;
  ctx.fillRect(s * 0.38, s * 0.85, 6, s * 0.12);
  ctx.fillRect(s * 0.88, s * 0.85, 6, s * 0.12);
  ctx.fillStyle = shade(0x3a3a40, -5);
  ctx.fillRect(s * 0.38, s * 0.95, 10, 3);
  ctx.fillRect(s * 0.88, s * 0.95, 10, 3);
}

/** Office chair facing right — side view (Hermes's chair, mirrored) — premium executive */
function drawOfficeChairRight(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s * 0.5;

  // contact shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.85, s * 0.28, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // 5-star wheel base — chrome
  const chromeGrad = linearGrad(ctx, -3, 0, 3, 0, [
    [0, shade(0x5a5a60, -15)],
    [0.5, shade(0xb0b0b8, 20)],
    [1, shade(0x5a5a60, -15)],
  ]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    ctx.save();
    ctx.translate(cx, s * 0.78);
    ctx.rotate(a);
    ctx.fillStyle = chromeGrad;
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
    ctx.restore();
  }

  // center column — polished chrome
  const colGrad = linearGrad(ctx, cx - 4, 0, cx + 4, 0, [
    [0, shade(0x5a5a60, -10)],
    [0.5, shade(0xb0b0b8, 20)],
    [1, shade(0x5a5a60, -10)],
  ]);
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - 4, s * 0.5, 8, s * 0.28);

  // seat — charcoal, side view
  const seatGrad = linearGrad(ctx, 0, s * 0.38, 0, s * 0.52, [
    [0, shade(0x3a3a42, 15)],
    [0.5, shade(0x2a2a32, 0)],
    [1, shade(0x1a1a22, -15)],
  ]);
  ctx.fillStyle = seatGrad;
  roundRect(ctx, cx - s * 0.14, s * 0.38, s * 0.28, s * 0.14, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.4);
  ctx.lineWidth = 0.8;
  roundRect(ctx, cx - s * 0.11, s * 0.4, s * 0.22, s * 0.1, 4);
  ctx.stroke();

  // backrest — on left side (chair faces right), charcoal mesh
  const backGrad = linearGrad(ctx, s * 0.08, 0, s * 0.45, 0, [
    [0, shade(0x1a1a22, -10)],
    [0.5, shade(0x2a2a32, 5)],
    [1, shade(0x3a3a42, 20)],
  ]);
  ctx.fillStyle = backGrad;
  roundRect(ctx, s * 0.08, s * 0.06, s * 0.32, s * 0.36, 8);
  ctx.fill();

  // headrest bump
  ctx.fillStyle = shade(0x2a2a32, 10);
  roundRect(ctx, s * 0.10, s * 0.04, s * 0.28, s * 0.05, 5);
  ctx.fill();

  // mesh weave pattern — horizontal lines
  ctx.strokeStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const y = s * 0.12 + i * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(s * 0.10, y);
    ctx.lineTo(s * 0.38, y);
    ctx.stroke();
  }

  // lumbar curve highlight
  ctx.fillStyle = hexRGBA(0x5a5a62, 0.12);
  ctx.beginPath();
  ctx.ellipse(s * 0.25, s * 0.25, s * 0.04, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // armrest (right side only visible) with padding detail
  ctx.fillStyle = shade(0x2a2a32, -5);
  roundRect(ctx, cx + s * 0.13, s * 0.36, s * 0.05, s * 0.12, 3);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x4a4a52, 0.2);
  ctx.fillRect(cx + s * 0.14, s * 0.37, s * 0.03, s * 0.08);
}

/** Side-view monitor — thin profile seen from the side, screen faces right toward the Office Manager */
function drawDeskMonitorSide(ctx: CanvasRenderingContext2D, s: number, lit: boolean = false): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.88, s * 0.12, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // stand base — brushed aluminum
  const baseGrad = linearGrad(ctx, cx - s * 0.08, 0, cx + s * 0.08, 0, [
    [0, shade(0x808898, -10)],
    [0.5, shade(0xc0c8d0, 15)],
    [1, shade(0x808898, -10)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, cx - s * 0.08, s * 0.8, s * 0.16, s * 0.05, 2);
  ctx.fill();

  // stand neck — short, polished
  const neckGrad = linearGrad(ctx, cx - 2, 0, cx + 2, 0, [
    [0, shade(0x808898, -5)],
    [0.5, shade(0xd0d8e0, 15)],
    [1, shade(0x808898, -5)],
  ]);
  ctx.fillStyle = neckGrad;
  ctx.fillRect(cx - 2, s * 0.62, 4, s * 0.2);

  // monitor body — ultra-thin profile, modern IPS panel
  // Slight taper at top (curved back hint)
  const bezelGrad = linearGrad(ctx, 0, s * 0.15, 0, s * 0.62, [
    [0, shade(0x2a2a30, 10)],
    [0.5, shade(0x1a1a20, 0)],
    [1, shade(0x12121a, -10)],
  ]);
  ctx.fillStyle = bezelGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 5, s * 0.15);
  ctx.lineTo(cx + 5, s * 0.15);
  ctx.lineTo(cx + 7, s * 0.62);
  ctx.lineTo(cx - 7, s * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a44, 0.5);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // screen edge glow — on the RIGHT side (facing the Office Manager)
  if (lit) {
    // bright blue-white glow strip
    ctx.fillStyle = hexRGBA(0xaaccff, 0.7);
    ctx.fillRect(cx + 4, s * 0.18, 2.5, s * 0.41);
    // soft bloom
    ctx.fillStyle = hexRGBA(0x88bbff, 0.15);
    ctx.fillRect(cx + 3, s * 0.16, 5, s * 0.45);
  } else {
    ctx.fillStyle = hexRGBA(0x1a2a3a, 0.8);
    ctx.fillRect(cx + 4, s * 0.18, 2, s * 0.41);
  }

  // power LED — subtle, on back
  ctx.beginPath();
  ctx.arc(cx - 4, s * 0.58, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = hexRGBA(0x44ff66, 0.6);
  ctx.fill();
}

/** Desk monitor (tile 33) — modern ultrawide IPS with thin white bezels */
function drawDeskMonitor(ctx: CanvasRenderingContext2D, s: number, lit: boolean = false): void {
  const cx = s * 0.5;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.82, s * 0.22, s * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // stand base — brushed aluminum disc
  const baseGrad = linearGrad(ctx, cx - s * 0.12, 0, cx + s * 0.12, 0, [
    [0, shade(0x808898, -10)],
    [0.5, shade(0xc8d0d8, 15)],
    [1, shade(0x808898, -10)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, cx - s * 0.12, s * 0.75, s * 0.24, s * 0.06, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x606870, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // stand neck — polished metal
  const neckGrad = linearGrad(ctx, cx - 3, 0, cx + 3, 0, [
    [0, shade(0x707880, -5)],
    [0.5, shade(0xd0d8e0, 20)],
    [1, shade(0x707880, -5)],
  ]);
  ctx.fillStyle = neckGrad;
  ctx.fillRect(cx - 3, s * 0.5, 6, s * 0.28);

  // monitor body — ultra-thin bezel, white premium frame
  const bezelGrad = linearGrad(ctx, 0, s * 0.08, 0, s * 0.55, [
    [0, shade(0xf0f0f4, 5)],
    [0.5, shade(0xe0e0e8, 0)],
    [1, shade(0xd0d0d8, -5)],
  ]);
  ctx.fillStyle = bezelGrad;
  roundRect(ctx, s * 0.08, s * 0.06, s * 0.84, s * 0.48, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0xb0b0b8, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();

  // screen — nearly edge-to-edge, very thin bezels (centered in frame)
  const screenX = s * 0.12;
  const screenY = s * 0.08;
  const screenW = s * 0.76;
  const screenH = s * 0.44;
  if (lit) {
    ctx.fillStyle = hexRGBA(0xaaccff, 0.5);
  } else {
    ctx.fillStyle = hexRGBA(0x1a2a3a, 0.95);
  }
  roundRect(ctx, screenX, screenY, screenW, screenH, 2);
  ctx.fill();

  if (!lit) {
    // screen content — realistic IDE layout
    // dark editor background
    ctx.fillStyle = hexRGBA(0x1e1e2e, 0.9);
    ctx.fillRect(screenX + 1, screenY + 1, screenW - 2, screenH - 2);

    // sidebar — file tree
    ctx.fillStyle = hexRGBA(0x181828, 0.8);
    ctx.fillRect(screenX + 1, screenY + 1, s * 0.1, screenH - 2);
    // file tree items
    ctx.fillStyle = hexRGBA(0x88aacc, 0.4);
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(screenX + 3, screenY + 3 + i * s * 0.06, s * 0.06, 1.5);
    }
    ctx.fillStyle = hexRGBA(0x66bb88, 0.3);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(screenX + 5, screenY + 5 + i * s * 0.06, s * 0.04, 1.5);
    }

    // code area — syntax highlighted lines
    const lineColors = [0x6699cc, 0xcc8844, 0x66bb44, 0x8866bb, 0x6699cc, 0xcc8844, 0x66bb44];
    for (let i = 0; i < 7; i++) {
      const ly = screenY + 3 + i * (s * 0.055);
      const indent = (i % 3) * s * 0.03;
      const lineW = s * (0.12 + ((i * 7) % 5) * 0.04);
      ctx.fillStyle = hexRGBA(lineColors[i % lineColors.length], 0.55);
      ctx.fillRect(screenX + s * 0.12 + indent, ly, lineW, 1.8);
    }

    // terminal strip at bottom
    ctx.fillStyle = hexRGBA(0x0a0a14, 0.7);
    ctx.fillRect(screenX + 1, screenY + screenH - s * 0.08, screenW - 2, s * 0.07);
    ctx.fillStyle = hexRGBA(0x44ff66, 0.4);
    ctx.fillRect(screenX + 3, screenY + screenH - s * 0.06, s * 0.15, 1.5);
    ctx.fillStyle = hexRGBA(0x44ddaa, 0.3);
    ctx.fillRect(screenX + 3, screenY + screenH - s * 0.04, s * 0.1, 1.5);
  }

  // screen glow / reflection
  if (lit) {
    // bright blue-white glow
    ctx.fillStyle = hexRGBA(0xffffff, 0.15);
    roundRect(ctx, screenX, screenY, screenW, screenH, 2);
    ctx.fill();
    // subtle diagonal sheen
    ctx.fillStyle = hexRGBA(0xffffff, 0.06);
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + s * 0.2, screenY);
    ctx.lineTo(screenX, screenY + s * 0.15);
    ctx.closePath();
    ctx.fill();
  } else {
    // subtle reflection on dark screen
    ctx.fillStyle = hexRGBA(0x88bbff, 0.06);
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + s * 0.25, screenY);
    ctx.lineTo(screenX, screenY + s * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // bottom bezel LED bar — subtle modern indicator
  ctx.fillStyle = hexRGBA(0x44ff66, 0.5);
  ctx.fillRect(cx - 4, s * 0.53, 8, 1);

  // power LED
  ctx.beginPath();
  ctx.arc(s * 0.84, s * 0.52, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = hexRGBA(0x44ff66, 0.7);
  ctx.fill();
}

/* ---------- server room furniture ---------- */

function drawServerRack(ctx: CanvasRenderingContext2D, s: number): void {
  // tall dark metal server rack cabinet
  const bodyGrad = linearGrad(ctx, s * 0.05, 0, s * 0.95, 0, [
    [0, shade(0x2a2a35, 15)],
    [0.3, shade(0x1a1a22, 0)],
    [0.7, shade(0x12121a, -5)],
    [1, shade(0x08080e, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, s * 0.05, s * 0.02, s * 0.9, s * 0.96, 2);
  ctx.fill();

  // frame edges
  ctx.strokeStyle = hexRGBA(0x3a3a48, 0.7);
  ctx.lineWidth = 1.5;
  roundRect(ctx, s * 0.05, s * 0.02, s * 0.9, s * 0.96, 2);
  ctx.stroke();

  // top vent strip
  ctx.fillStyle = hexRGBA(0x050508, 0.9);
  ctx.fillRect(s * 0.08, s * 0.04, s * 0.84, s * 0.03);
  for (let i = 0; i < 12; i++) {
    ctx.fillRect(s * 0.08 + i * s * 0.07, s * 0.04, s * 0.04, s * 0.03);
  }

  // rack units (1U each) — 7 units
  const unitH = s * 0.1;
  const startY = s * 0.09;
  for (let i = 0; i < 7; i++) {
    const y = startY + i * unitH;
    // unit faceplate
    ctx.fillStyle = hexRGBA(0x16161e, 0.95);
    ctx.fillRect(s * 0.08, y, s * 0.84, unitH - 1.5);
    // unit border
    ctx.strokeStyle = hexRGBA(0x2a2a35, 0.5);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(s * 0.08, y, s * 0.84, unitH - 1.5);

    // vent grille pattern on left side
    ctx.fillStyle = hexRGBA(0x08080e, 0.8);
    for (let j = 0; j < 6; j++) {
      ctx.fillRect(s * 0.1 + j * s * 0.06, y + 2, s * 0.04, unitH - 5);
    }

    // LED indicators on right side — blinking activity lights
    const ledColors = [0x44ff44, 0x44ddff, 0xffaa44, 0x44ff44, 0xff4444, 0x44ddff, 0x44ff44];
    // green power LED
    ctx.beginPath();
    ctx.arc(s * 0.82, y + unitH * 0.35, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = hexRGBA(0x44ff44, 0.9);
    ctx.fill();
    // activity LED
    ctx.beginPath();
    ctx.arc(s * 0.88, y + unitH * 0.35, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = hexRGBA(ledColors[i % ledColors.length], 0.8);
    ctx.fill();
    // small status LED
    ctx.beginPath();
    ctx.arc(s * 0.82, y + unitH * 0.7, 1, 0, Math.PI * 2);
    ctx.fillStyle = hexRGBA(0xffaa44, 0.6);
    ctx.fill();
  }

  // cable management at bottom
  ctx.fillStyle = hexRGBA(0x08080e, 0.7);
  ctx.fillRect(s * 0.08, s * 0.82, s * 0.84, s * 0.12);
  // cables
  const cableColors = [0x444466, 0x664444, 0x446644, 0x666644];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = hexRGBA(cableColors[i % cableColors.length], 0.6);
    ctx.fillRect(s * 0.12 + i * s * 0.15, s * 0.84, s * 0.08, s * 0.08);
  }

  // rack label strip
  ctx.fillStyle = hexRGBA(0x44ddff, 0.15);
  ctx.fillRect(s * 0.08, s * 0.06, s * 0.84, s * 0.015);
}

function drawServerScreen(ctx: CanvasRenderingContext2D, s: number): void {
  // matching dark cabinet frame (same as server rack)
  const bodyGrad = linearGrad(ctx, s * 0.05, 0, s * 0.95, 0, [
    [0, shade(0x2a2a35, 15)],
    [0.3, shade(0x1a1a22, 0)],
    [0.7, shade(0x12121a, -5)],
    [1, shade(0x08080e, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, s * 0.05, s * 0.02, s * 0.9, s * 0.96, 2);
  ctx.fill();

  ctx.strokeStyle = hexRGBA(0x3a3a48, 0.7);
  ctx.lineWidth = 1.5;
  roundRect(ctx, s * 0.05, s * 0.02, s * 0.9, s * 0.96, 2);
  ctx.stroke();

  // large monitoring display — fills most of the cabinet
  ctx.fillStyle = hexRGBA(0x050508, 0.95);
  roundRect(ctx, s * 0.08, s * 0.05, s * 0.84, s * 0.72, 2);
  ctx.fill();

  // screen bezel highlight
  ctx.strokeStyle = hexRGBA(0x2a3040, 0.5);
  ctx.lineWidth = 1;
  roundRect(ctx, s * 0.08, s * 0.05, s * 0.84, s * 0.72, 2);
  ctx.stroke();

  // terminal log lines (top half)
  const logColors = [0x44ff66, 0x44ddaa, 0x66ff88, 0x44aaff, 0x44ff66, 0xffaa44];
  for (let i = 0; i < 6; i++) {
    const ly = s * 0.08 + i * s * 0.04;
    ctx.fillStyle = hexRGBA(logColors[i % logColors.length], 0.5);
    ctx.fillRect(s * 0.11, ly, s * (0.15 + (i % 3) * 0.18), 1.5);
  }

  // bar graph (bottom half of screen)
  const barY = s * 0.38;
  const barH = s * 0.35;
  ctx.fillStyle = hexRGBA(0x0a0a14, 0.8);
  ctx.fillRect(s * 0.11, barY, s * 0.78, barH);
  // bars
  const barWidths = [0.5, 0.7, 0.3, 0.85, 0.6, 0.45, 0.75];
  const barColors = [0x44ff66, 0x44ddff, 0xffaa44, 0x44ff66, 0x44ddff, 0xffaa44, 0x44ff66];
  for (let i = 0; i < 7; i++) {
    const bx = s * 0.13 + i * s * 0.1;
    const bh = barH * barWidths[i];
    ctx.fillStyle = hexRGBA(barColors[i % barColors.length], 0.6);
    ctx.fillRect(bx, barY + barH - bh, s * 0.07, bh);
  }

  // scanline glow
  ctx.fillStyle = hexRGBA(0x44ff66, 0.03);
  roundRect(ctx, s * 0.08, s * 0.05, s * 0.84, s * 0.72, 2);
  ctx.fill();

  // status LEDs at bottom of cabinet
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(s * 0.15 + i * s * 0.08, s * 0.88, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = hexRGBA(i === 3 ? 0xff4444 : 0x44ff44, 0.8);
    ctx.fill();
  }

  // label strip
  ctx.fillStyle = hexRGBA(0x44ddff, 0.1);
  ctx.fillRect(s * 0.08, s * 0.82, s * 0.84, s * 0.01);
  ctx.fillStyle = hexRGBA(0x44ddff, 0.3);
  ctx.font = "bold 4px monospace";
  ctx.textAlign = "left";
  ctx.fillText("MONITOR", s * 0.1, s * 0.93);
}

/* ---------- industrial chimney ---------- */

function drawChimney(ctx: CanvasRenderingContext2D, s: number): void {

  // brick base — wide industrial footing
  const baseGrad = linearGrad(ctx, s * 0.05, s * 0.6, s * 0.95, s * 0.95, [
    [0, shade(0x5a4030, 10)],
    [0.5, shade(0x4a3328, 0)],
    [1, shade(0x3a2820, -10)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, s * 0.05, s * 0.6, s * 0.9, s * 0.35, 2);
  ctx.fill();

  // brick texture lines
  ctx.strokeStyle = hexRGBA(0x2a1a12, 0.4);
  ctx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    const y = s * 0.64 + row * s * 0.08;
    ctx.beginPath();
    ctx.moveTo(s * 0.07, y);
    ctx.lineTo(s * 0.93, y);
    ctx.stroke();
    // staggered vertical mortar lines
    const offset = row % 2 === 0 ? 0 : s * 0.08;
    for (let bx = 0; bx < 6; bx++) {
      const x = s * 0.1 + offset + bx * s * 0.14;
      if (x < s * 0.93) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + s * 0.08);
        ctx.stroke();
      }
    }
  }

  // chimney stack — tapered tall column
  const stackGrad = linearGrad(ctx, s * 0.28, 0, s * 0.72, 0, [
    [0, shade(0x4a3828, 15)],
    [0.5, shade(0x3a2a1e, 0)],
    [1, shade(0x2a1e14, -10)],
  ]);
  ctx.fillStyle = stackGrad;
  ctx.beginPath();
  ctx.moveTo(s * 0.28, s * 0.62);
  ctx.lineTo(s * 0.72, s * 0.62);
  ctx.lineTo(s * 0.66, s * 0.02);
  ctx.lineTo(s * 0.34, s * 0.02);
  ctx.closePath();
  ctx.fill();

  // vertical brick lines on stack
  ctx.strokeStyle = hexRGBA(0x2a1a12, 0.3);
  for (let row = 0; row < 8; row++) {
    const y = s * 0.06 + row * s * 0.07;
    const taperL = s * 0.34 + (row / 8) * s * 0.06;
    const taperR = s * 0.66 - (row / 8) * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(taperL, y);
    ctx.lineTo(taperR, y);
    ctx.stroke();
    const offset = row % 2 === 0 ? 0 : s * 0.04;
    for (let bx = 0; bx < 4; bx++) {
      const x = taperL + offset + bx * (taperR - taperL) / 4;
      if (x < taperR) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + s * 0.07);
        ctx.stroke();
      }
    }
  }

  // rim at top of stack
  ctx.fillStyle = shade(0x2a1e14, -5);
  ctx.fillRect(s * 0.32, s * 0.0, s * 0.36, s * 0.04);
  ctx.strokeStyle = hexRGBA(0x5a4030, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(s * 0.32, s * 0.0, s * 0.36, s * 0.04);

  // dark opening at top (where smoke comes out)
  ctx.fillStyle = hexRGBA(0x0a0608, 0.9);
  ctx.fillRect(s * 0.35, s * 0.0, s * 0.3, s * 0.025);

  // subtle heat shimmer hint at opening
  ctx.fillStyle = hexRGBA(0xff6600, 0.06);
  ctx.fillRect(s * 0.36, s * 0.0, s * 0.28, s * 0.02);
}

/* ---------- furniture type registry ---------- */

const FURNITURE_TYPES: FurnitureType[] = [
  { tileIds: [17], draw: drawDeskLeft },
  { tileIds: [18], draw: drawDeskRight },
  { tileIds: [19], draw: drawOfficeChair },
  { tileIds: [20], draw: drawFilingCabinet },
  { tileIds: [21, 11], draw: drawWallPicture },
  { tileIds: [10], draw: drawWindow },
  { tileIds: [22], draw: drawSmallPlant },
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
  { tileIds: [38], draw: drawDeskSideTop },
  { tileIds: [39], draw: drawDeskSideBottom },
  { tileIds: [40], draw: drawDeskSideTopMirror },
  { tileIds: [41], draw: drawDeskSideBottomMirror },
  { tileIds: [42], draw: drawOfficeChairRight },
  { tileIds: [35], draw: drawServerRack },
  { tileIds: [36], draw: drawServerScreen },
  { tileIds: [37], draw: drawChimney },
];

/**
 * Custom furniture drawing functions registered by a world theme.
 * A `furniture-theme.ts` file on the branch can register functions here
 * via `registerThemeFurniture()`.
 */
const themeFurnitureDraws = new Map<number, (ctx: CanvasRenderingContext2D, size: number) => void>();

/** Register a custom drawing function for a tile ID (used by theme furniture). */
export function registerThemeFurniture(tileId: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): void {
  themeFurnitureDraws.set(tileId, draw);
}

/** Clear all registered theme furniture (called on scene shutdown). */
export function clearThemeFurniture(): void {
  themeFurnitureDraws.clear();
}

/** Remove cached furniture canvas textures so they regenerate with new theme draws. */
export function clearThemeFurnitureTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  for (let tileId = 17; tileId <= 42; tileId++) {
    const key = `furniture-${tileId}`;
    if (tex.exists(key)) tex.remove(key);
  }
}

/**
 * Get the effective furniture types for the current context.
 * If a theme is active, theme-registered draws override base draws.
 */
function getEffectiveFurnitureTypes(): FurnitureType[] {
  if (themeFurnitureDraws.size === 0) return FURNITURE_TYPES;
  // Build a merged list: base types with theme overrides applied
  const result: FurnitureType[] = [];
  for (const ft of FURNITURE_TYPES) {
    const overriddenTileIds = ft.tileIds.filter((id) => themeFurnitureDraws.has(id));
    const baseTileIds = ft.tileIds.filter((id) => !themeFurnitureDraws.has(id));
    if (baseTileIds.length > 0) {
      result.push({ tileIds: baseTileIds, draw: ft.draw });
    }
    for (const id of overriddenTileIds) {
      result.push({ tileIds: [id], draw: themeFurnitureDraws.get(id)! });
    }
  }
  // Add any theme-registered tile IDs not in the base set
  for (const [tileId, draw] of themeFurnitureDraws) {
    if (!FURNITURE_TYPES.some((ft) => ft.tileIds.includes(tileId))) {
      result.push({ tileIds: [tileId], draw });
    }
  }
  return result;
}

export const CHAIR_TEX_DOWN = "chair-down";
export const CHAIR_TEX_UP = "chair-up";
export const CHAIR_TEX_LEFT = "chair-left";
export const CHAIR_TEX_RIGHT = "chair-right";
export const MONITOR_TEX = "monitor-proc";
export const MONITOR_SIDE_TEX = "monitor-side-proc";

/**
 * Resolve the effective chair texture key, preferring AI-generated textures
 * when they have been loaded. Falls back to procedural canvas keys.
 */
export function resolveChairTex(scene: Phaser.Scene, proceduralKey: string): string {
  const aiKey = AI_FURNITURE_CHAIRS[proceduralKey];
  if (aiKey && scene.textures.exists(aiKey)) return aiKey;
  return proceduralKey;
}

const CHAIR_TILE_IDS = new Set([19, 33, 42]);

/**
 * Generate furniture textures and overlay them on the furniture layer.
 * Call after the Tiled map furniture layer is created.
 */
export function upgradeFurniture(scene: Phaser.Scene, furnitureLayer: Phaser.Tilemaps.TilemapLayer, theme?: WorldTheme | null): void {
  const tex = scene.textures;
  const map = furnitureLayer.tilemap;
  const effectiveTypes = getEffectiveFurnitureTypes();
  // Build a set of tile IDs that the theme overrides with spritesheet frames
  const themeTileIds = new Set<number>();
  if (theme) {
    for (const tileIdStr of Object.keys(theme.furniture)) {
      themeTileIds.add(Number(tileIdStr));
    }
  }
  const hasThemeSpritesheet = theme && tex.exists("furniture-theme");
  const isProceduralTier = theme?.assets?.assetTier === "procedural";

  // Generate canvas textures for each furniture type (procedural fallback)
  for (const ft of effectiveTypes) {
    for (const tileId of ft.tileIds) {
      const key = `furniture-${tileId}`;
      if (tex.exists(key)) continue;

      // If a theme spritesheet exists for this tile ID, use it instead
      if (hasThemeSpritesheet && themeTileIds.has(tileId)) continue;

      // If an AI-generated texture exists for this tile ID, skip procedural generation
      // (but not for procedural-tier themes — they should use their own drawings)
      if (!isProceduralTier) {
        const aiKey = AI_FURNITURE_TEXTURES[tileId];
        if (aiKey && tex.exists(aiKey)) continue;
      }

      // Fall back to procedural canvas drawing
      const canvasTex = tex.createCanvas(key, TILE_PX, TILE_PX);
      if (!canvasTex) continue;
      const ctx = canvasTex.getContext();
      ctx.clearRect(0, 0, TILE_PX, TILE_PX);
      ft.draw(ctx, TILE_PX);
      canvasTex.refresh();
    }
  }

  // Generate chair direction textures (procedural fallback)
  const chairDraws: Array<[string, (ctx: CanvasRenderingContext2D, s: number) => void]> = [
    [CHAIR_TEX_DOWN, drawOfficeChair],
    [CHAIR_TEX_UP, drawOfficeChairUp],
    [CHAIR_TEX_LEFT, drawOfficeChairLeft],
    [CHAIR_TEX_RIGHT, drawOfficeChairRight],
  ];
  for (const [key, drawFn] of chairDraws) {
    if (tex.exists(key)) continue;

    // Use AI chair texture if available — skip procedural generation
    const aiChairKey = AI_FURNITURE_CHAIRS[key];
    if (aiChairKey && tex.exists(aiChairKey)) continue;

    // Fall back to procedural canvas drawing
    const canvasTex = tex.createCanvas(key, TILE_PX, TILE_PX);
    if (!canvasTex) continue;
    const ctx = canvasTex.getContext();
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    drawFn(ctx, TILE_PX);
    canvasTex.refresh();
  }

  // Generate procedural monitor texture (3 frames: off / on / black)
  // Force regenerate if old 2-frame version exists without frame "2"
  // Skip if AI monitor textures are available
  const aiMonOff = AI_FURNITURE_MONITORS.off;
  const aiMonLit = AI_FURNITURE_MONITORS.lit;
  const aiMonBlack = AI_FURNITURE_MONITORS.black;
  const hasAiMonitors = !!(aiMonOff && tex.exists(aiMonOff) && aiMonLit && tex.exists(aiMonLit) && aiMonBlack && tex.exists(aiMonBlack));

  if (hasAiMonitors) {
    // Build a spritesheet from 3 separate AI monitor textures
    if (tex.exists(MONITOR_TEX) && !tex.get(MONITOR_TEX).has("2")) {
      tex.remove(MONITOR_TEX);
    }
    if (!tex.exists(MONITOR_TEX)) {
      const canvasTex = tex.createCanvas(MONITOR_TEX, TILE_PX * 3, TILE_PX);
      if (canvasTex) {
        const ctx = canvasTex.getContext();
        for (const [frameKey, slot] of [[aiMonOff, 0], [aiMonLit, 1], [aiMonBlack, 2]] as const) {
          const sourceImg = tex.get(frameKey).getSourceImage() as HTMLImageElement;
          ctx.drawImage(sourceImg, slot * TILE_PX, 0, TILE_PX, TILE_PX);
        }
        canvasTex.refresh();
        const texture = tex.get(MONITOR_TEX);
        texture.add("0", 0, 0, 0, TILE_PX, TILE_PX);
        texture.add("1", 0, TILE_PX, 0, TILE_PX, TILE_PX);
        texture.add("2", 0, TILE_PX * 2, 0, TILE_PX, TILE_PX);
      }
    }
  } else {
    if (tex.exists(MONITOR_TEX) && !tex.get(MONITOR_TEX).has("2")) {
      tex.remove(MONITOR_TEX);
    }
    if (!tex.exists(MONITOR_TEX)) {
      const canvasTex = tex.createCanvas(MONITOR_TEX, TILE_PX * 3, TILE_PX);
      if (canvasTex) {
        const ctx = canvasTex.getContext();
        // Frame 0: off — code editor look (idle agent)
        ctx.clearRect(0, 0, TILE_PX, TILE_PX);
        drawDeskMonitor(ctx, TILE_PX, false);
        // Frame 1: on — lit blue (legacy, kept for compatibility)
        ctx.save();
        ctx.translate(TILE_PX, 0);
        drawDeskMonitor(ctx, TILE_PX, true);
        ctx.restore();
        // Frame 2: black — unassigned desk (no agent)
        ctx.save();
        ctx.translate(TILE_PX * 2, 0);
        drawDeskMonitor(ctx, TILE_PX, false);
        ctx.restore();
        // Overwrite frame 2 screen area with pure black
        ctx.save();
        ctx.translate(TILE_PX * 2, 0);
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(TILE_PX * 0.15, TILE_PX * 0.11, TILE_PX * 0.7, TILE_PX * 0.4);
        // No power LED on unassigned
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.beginPath();
        ctx.arc(TILE_PX * 0.82, TILE_PX * 0.52, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        canvasTex.refresh();
        const texture = tex.get(MONITOR_TEX);
        texture.add("0", 0, 0, 0, TILE_PX, TILE_PX);
        texture.add("1", 0, TILE_PX, 0, TILE_PX, TILE_PX);
        texture.add("2", 0, TILE_PX * 2, 0, TILE_PX, TILE_PX);
      }
    }
  }

  // Generate side-view monitor texture (2 frames: off / on)
  // Skip if AI side monitor textures are available
  const aiMonSideOff = AI_FURNITURE_MONITORS_SIDE.off;
  const aiMonSideLit = AI_FURNITURE_MONITORS_SIDE.lit;
  const hasAiSideMonitors = !!(aiMonSideOff && tex.exists(aiMonSideOff) && aiMonSideLit && tex.exists(aiMonSideLit));

  if (hasAiSideMonitors) {
    if (!tex.exists(MONITOR_SIDE_TEX)) {
      const canvasTex = tex.createCanvas(MONITOR_SIDE_TEX, TILE_PX * 2, TILE_PX);
      if (canvasTex) {
        const ctx = canvasTex.getContext();
        const offImg = tex.get(aiMonSideOff).getSourceImage() as HTMLImageElement;
        const litImg = tex.get(aiMonSideLit).getSourceImage() as HTMLImageElement;
        ctx.drawImage(offImg, 0, 0, TILE_PX, TILE_PX);
        ctx.drawImage(litImg, TILE_PX, 0, TILE_PX, TILE_PX);
        canvasTex.refresh();
        const texture = tex.get(MONITOR_SIDE_TEX);
        texture.add("0", 0, 0, 0, TILE_PX, TILE_PX);
        texture.add("1", 0, TILE_PX, 0, TILE_PX, TILE_PX);
      }
    }
  } else {
    if (!tex.exists(MONITOR_SIDE_TEX)) {
      const canvasTex = tex.createCanvas(MONITOR_SIDE_TEX, TILE_PX * 2, TILE_PX);
      if (canvasTex) {
        const ctx = canvasTex.getContext();
        ctx.clearRect(0, 0, TILE_PX, TILE_PX);
        drawDeskMonitorSide(ctx, TILE_PX, false);
        ctx.save();
        ctx.translate(TILE_PX, 0);
        drawDeskMonitorSide(ctx, TILE_PX, true);
        ctx.restore();
        canvasTex.refresh();
        const texture = tex.get(MONITOR_SIDE_TEX);
        texture.add("0", 0, 0, 0, TILE_PX, TILE_PX);
        texture.add("1", 0, TILE_PX, 0, TILE_PX, TILE_PX);
      }
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

      // Use theme spritesheet frame if available, then AI texture (non-procedural only), then procedural fallback
      const themeKey = (hasThemeSpritesheet && themeTileIds.has(tileId)) ? "furniture-theme" : null;
      const aiKey = isProceduralTier ? null : AI_FURNITURE_TEXTURES[tileId];
      let key: string | null = null;
      let themeFrame: number | undefined;
      if (themeKey && tex.exists(themeKey)) {
        key = themeKey;
        // Use tileId as the frame index (theme spritesheet frames correspond to tile IDs)
        themeFrame = tileId;
      } else if (aiKey && tex.exists(aiKey)) {
        key = aiKey;
      } else {
        key = `furniture-${tileId}`;
      }
      if (!key || !tex.exists(key)) continue;

      // Hide the underlying tile to prevent double rendering
      tile.alpha = 0;

      const px = x * TILE_PX;
      const py = y * TILE_PX;
      const sprite = scene.add.sprite(px, py, key, themeFrame);
      sprite.setOrigin(0, 0);

      // AI sprites are 128x128 — scale down to fit tile grid.
      // Per-tile-ID overrides for visual fit.
      const scaleMap: Record<number, { w: number; h: number; ox?: number; oy?: number }> = {
        25: { w: 48, h: 48, ox: 8, oy: 8 },   // water cooler — smaller, centered
        28: { w: 56, h: 56, ox: 4, oy: 4 },   // microwave — full-ish size, centered
        27: { w: 60, h: 60, ox: 2, oy: 2 },   // kitchen sink — bigger
        29: { w: 56, h: 56, ox: 4, oy: 4 },   // sofa left — slightly smaller
        30: { w: 56, h: 56, ox: 4, oy: 4 },   // sofa right — slightly smaller
        26: { w: 160, h: 160, ox: -48, oy: -48 }, // kitchen counter — bigger, spans ~2.5 tiles
        22: { w: 48, h: 48, ox: 8, oy: 8 },   // small plant — smaller
        31: { w: 56, h: 56, ox: 4, oy: 4 },   // large plant — slightly smaller
        32: { w: 48, h: 48, ox: 8, oy: 8 },   // toaster — smaller
        23: { w: 56, h: 56, ox: 4, oy: 4 },   // coffee machine top
        24: { w: 56, h: 56, ox: 4, oy: 4 },   // coffee machine bottom
      };
      const isAi = aiKey && tex.exists(aiKey) && !themeKey;
      if (isAi) {
        const cfg = scaleMap[tileId] ?? { w: TILE_PX, h: TILE_PX };
        sprite.setDisplaySize(cfg.w, cfg.h);
        if (cfg.ox) sprite.x += cfg.ox;
        if (cfg.oy) sprite.y += cfg.oy;
      }

      // Server racks and screens: shift up half a tile for visual fit
      if (tileId === 35 || tileId === 36) {
        sprite.y -= TILE_PX / 2;
      }
      sprite.setDepth(furnitureLayer.depth + 0.1);
    }
  }
}
