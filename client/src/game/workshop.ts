/**
 * MCP Forge Furniture
 *
 * Procedurally drawn furniture for the break room's transformation into
 * the MCP Forge — a workshop where agents build, test, and register
 * their own MCP servers. Replaces the old Expedition Workshop.
 *
 * Pieces are multi-tile (2×2, 2×1, 1×2) for visual impact — clearly
 * recognizable server racks, terminals, and forge equipment.
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

/* ---------- forge furniture drawing functions ---------- */

/**
 * Forge station — 2×2 tiles (128×128px)
 * Large server rack with a holographic MCP server floating above it,
 * tool registration display on the rack surface, and glowing emitters.
 */
function drawForgeStation(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // ── holographic MCP server projection (top half) ──
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

  // holographic server box — floating cube
  const srvY = s * 0.35;
  const srvW = 40;
  const srvH = 48;

  // server body — translucent cube
  ctx.fillStyle = hexRGBA(0x66ccff, 0.3);
  roundRect(ctx, cx - srvW / 2, srvY - srvH / 2, srvW, srvH, 4);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x88ddff, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // server LED strips — vertical rows of blinking lights
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 6; row++) {
      const lx = cx - srvW / 2 + 6 + col * 10;
      const ly = srvY - srvH / 2 + 6 + row * 7;
      const on = (col + row) % 3 === 0;
      ctx.fillStyle = on ? hexRGBA(0x44ff44, 0.7) : hexRGBA(0x44aaff, 0.3);
      ctx.fillRect(lx, ly, 4, 3);
    }
  }

  // "MCP" label on server
  ctx.fillStyle = hexRGBA(0xaaffff, 0.6);
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("MCP", cx, srvY + srvH / 2 - 4);

  // tool badges orbiting the server
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + 0.3;
    const ox = cx + Math.cos(angle) * 28;
    const oy = srvY + Math.sin(angle) * 22;
    ctx.fillStyle = hexRGBA(0xffdd44, 0.5);
    ctx.beginPath();
    ctx.arc(ox, oy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexRGBA(0xffdd44, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, srvY);
    ctx.lineTo(ox, oy);
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

  // ── server rack base (bottom half) ──
  const rackY = s * 1.05;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, h - 8, s * 0.85, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // rack base — dark metal
  const baseGrad = linearGrad(ctx, 0, rackY, 0, h - 4, [
    [0, shade(0x2a3a4a, 15)],
    [0.5, shade(0x1a2a3a, 0)],
    [1, shade(0x0a1a2a, -15)],
  ]);
  ctx.fillStyle = baseGrad;
  roundRect(ctx, s * 0.2, rackY, w - s * 0.4, h - rackY - 8, 6);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a5a7a, 0.4);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // rack legs
  ctx.fillStyle = shade(0x1a1a20, 0);
  ctx.fillRect(s * 0.3, h - 16, 8, 12);
  ctx.fillRect(w - s * 0.3 - 8, h - 16, 8, 12);

  // rack surface — dark metallic with grid
  const surfGrad = linearGrad(ctx, 0, rackY, 0, rackY + s * 0.3, [
    [0, shade(0x3a5a7a, 20)],
    [0.5, shade(0x2a4a6a, 5)],
    [1, shade(0x1a3a5a, -10)],
  ]);
  ctx.fillStyle = surfGrad;
  roundRect(ctx, s * 0.15, rackY, w - s * 0.3, s * 0.28, 4);
  ctx.fill();

  // grid lines
  ctx.strokeStyle = hexRGBA(0x4a7aaa, 0.25);
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 8; i++) {
    const gx = s * 0.15 + i * ((w - s * 0.3) / 8);
    ctx.beginPath();
    ctx.moveTo(gx, rackY + 4);
    ctx.lineTo(gx, rackY + s * 0.26);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const gy = rackY + i * (s * 0.28 / 4);
    ctx.beginPath();
    ctx.moveTo(s * 0.2, gy);
    ctx.lineTo(w - s * 0.2, gy);
    ctx.stroke();
  }

  // data flow lines — from center outward
  ctx.strokeStyle = hexRGBA(0xaaffff, 0.6);
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, rackY + s * 0.14);
  ctx.lineTo(cx + s * 0.35, rackY + s * 0.06);
  ctx.stroke();
  ctx.setLineDash([]);

  // registered tool marker — gold dot
  ctx.fillStyle = hexRGBA(0xffdd44, 0.7);
  ctx.beginPath();
  ctx.arc(cx + s * 0.35, rackY + s * 0.06, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0xffdd44, 0.3);
  ctx.beginPath();
  ctx.arc(cx + s * 0.35, rackY + s * 0.06, 8, 0, Math.PI * 2);
  ctx.fill();

  // forge icon — anvil shape at center
  ctx.fillStyle = hexRGBA(0x44aaff, 0.6);
  ctx.beginPath();
  ctx.arc(cx, rackY + s * 0.14, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexRGBA(0x88ddff, 0.3);
  ctx.beginPath();
  ctx.arc(cx, rackY + s * 0.14, 12, 0, Math.PI * 2);
  ctx.fill();

  // status indicators — green checkmarks
  for (let i = 0; i < 2; i++) {
    const tx = cx + s * (0.12 + i * 0.1);
    const ty = rackY + s * (0.1 - i * 0.02);
    ctx.strokeStyle = hexRGBA(0x44ff44, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx - 3, ty);
    ctx.lineTo(tx - 1, ty + 2);
    ctx.lineTo(tx + 3, ty - 2);
    ctx.stroke();
  }
}

/**
 * Code terminal — 2×1 tiles (128×64px)
 * Wide desk with dual monitors showing code, keyboard, and MCP SDK docs.
 */
function drawCodeTerminal(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, s * 0.9, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk legs
  ctx.fillStyle = shade(0x2a2a30, 0);
  ctx.fillRect(s * 0.15, s * 0.5, 6, s * 0.42);
  ctx.fillRect(w - s * 0.15 - 6, s * 0.5, 6, s * 0.42);
  ctx.fillRect(s * 0.15, s * 0.72, w - s * 0.3, 4);

  // desk surface — dark metallic
  const surfGrad = linearGrad(ctx, 0, s * 0.3, 0, s * 0.52, [
    [0, shade(0x3a3a4a, 20)],
    [0.5, shade(0x2a2a3a, 5)],
    [1, shade(0x1a1a2a, -15)],
  ]);
  ctx.fillStyle = surfGrad;
  roundRect(ctx, s * 0.08, s * 0.3, w - s * 0.16, s * 0.22, 4);
  ctx.fill();

  // ── left monitor — code editor ──
  const mon1X = s * 0.12;
  const mon1W = s * 0.55;
  const mon1H = s * 0.28;
  const mon1Y = s * 0.04;

  ctx.fillStyle = shade(0x1a1a20, 5);
  roundRect(ctx, mon1X, mon1Y, mon1W, mon1H, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a40, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // screen — dark with code
  ctx.fillStyle = hexRGBA(0x0a0a14, 0.92);
  roundRect(ctx, mon1X + 3, mon1Y + 3, mon1W - 6, mon1H - 6, 2);
  ctx.fill();

  // code lines — syntax highlighted
  const codeColors = [0x4a9a5a, 0x4a8aaa, 0xaa8a4a, 0x4a9a5a, 0x8a6aaa, 0x4a9a5a, 0xaa6a6a];
  for (let i = 0; i < 7; i++) {
    const ly = mon1Y + 6 + i * 3;
    const lineLen = (mon1W - 12) * (0.3 + (i * 37 % 60) / 100);
    ctx.fillStyle = hexRGBA(codeColors[i % codeColors.length], 0.6);
    ctx.fillRect(mon1X + 6, ly, lineLen, 1.5);
  }

  // ── right monitor — MCP SDK docs ──
  const mon2X = cx + s * 0.1;
  const mon2W = s * 0.55;
  const mon2H = s * 0.28;
  const mon2Y = s * 0.04;

  ctx.fillStyle = shade(0x1a1a20, 5);
  roundRect(ctx, mon2X, mon2Y, mon2W, mon2H, 3);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a40, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = hexRGBA(0x0a0a14, 0.92);
  roundRect(ctx, mon2X + 3, mon2Y + 3, mon2W - 6, mon2H - 6, 2);
  ctx.fill();

  // doc content — headers and paragraphs
  ctx.fillStyle = hexRGBA(0x44aaff, 0.6);
  ctx.fillRect(mon2X + 6, mon2Y + 6, mon2W * 0.4, 2);
  ctx.fillStyle = hexRGBA(0x888888, 0.5);
  for (let i = 0; i < 5; i++) {
    const ly = mon2Y + 12 + i * 3;
    const lineLen = (mon2W - 12) * (0.5 + (i * 29 % 40) / 100);
    ctx.fillRect(mon2X + 6, ly, lineLen, 1.5);
  }

  // power LEDs on both monitors
  for (const mx of [mon1X + mon1W - 5, mon2X + mon2W - 5]) {
    ctx.fillStyle = hexRGBA(0x44ff44, 0.7);
    ctx.beginPath();
    ctx.arc(mx, mon1Y + mon1H - 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── keyboard ──
  ctx.fillStyle = shade(0x2a2a30, 5);
  roundRect(ctx, cx - s * 0.25, s * 0.34, s * 0.5, s * 0.08, 2);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a4a50, 0.4);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // key grid
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 10; col++) {
      ctx.fillStyle = hexRGBA(0x3a3a40, 0.5);
      ctx.fillRect(cx - s * 0.23 + col * (s * 0.046), s * 0.36 + row * (s * 0.02), s * 0.035, s * 0.014);
    }
  }

  // ── coffee mug ──
  ctx.fillStyle = hexRGBA(0x4a6a8a, 0.6);
  ctx.beginPath();
  ctx.arc(w - s * 0.2, s * 0.4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a6a8a, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w - s * 0.17, s * 0.4, 3, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // steam
  ctx.strokeStyle = hexRGBA(0xaaaaaa, 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w - s * 0.2, s * 0.33);
  ctx.bezierCurveTo(w - s * 0.19, s * 0.3, w - s * 0.21, s * 0.28, w - s * 0.2, s * 0.25);
  ctx.stroke();
}

/**
 * Tool rack — 1×2 tiles (64×128px)
 * Tall rack holding MCP tool libraries, with glowing connectors and cables.
 */
function drawToolRack(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, s * 0.32, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // rack body — tall industrial metal shelving
  const bodyGrad = linearGrad(ctx, cx - s * 0.28, 0, cx + s * 0.28, 0, [
    [0, shade(0x2a3a4a, -10)],
    [0.3, shade(0x3a5a6a, 15)],
    [0.7, shade(0x2a4a5a, 0)],
    [1, shade(0x1a2a3a, -20)],
  ]);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, s * 0.25);
  ctx.lineTo(cx - s * 0.28, h - 12);
  ctx.lineTo(cx + s * 0.28, h - 12);
  ctx.lineTo(cx + s * 0.22, s * 0.25);
  ctx.closePath();
  ctx.fill();

  // shelf dividers — 3 shelves
  ctx.strokeStyle = hexRGBA(0x3a5a7a, 0.5);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const sy = s * 0.35 + i * s * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.24, sy);
    ctx.lineTo(cx + s * 0.24, sy);
    ctx.stroke();
  }

  // rack rim
  ctx.fillStyle = shade(0x2a4a5a, 8);
  roundRect(ctx, cx - s * 0.26, s * 0.22, s * 0.52, s * 0.06, 3);
  ctx.fill();

  // ── MCP tool modules on shelves ──
  const toolColors = [0x4a9a6a, 0x4a6aaa, 0xaa6a4a, 0x6a4aaa, 0x4aaa8a, 0xaa4a6a];
  for (let shelf = 0; shelf < 3; shelf++) {
    const sy = s * 0.3 + shelf * s * 0.22;
    for (let slot = 0; slot < 3; slot++) {
      const sx = cx - s * 0.18 + slot * s * 0.13;
      const color = toolColors[(shelf * 3 + slot) % toolColors.length];
      // tool module — small box with glowing connector
      ctx.fillStyle = hexRGBA(color, 0.5);
      roundRect(ctx, sx, sy, s * 0.1, s * 0.14, 2);
      ctx.fill();
      ctx.strokeStyle = hexRGBA(color, 0.3);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // glowing connector LED
      ctx.fillStyle = hexRGBA(0x44ff44, 0.6);
      ctx.beginPath();
      ctx.arc(sx + s * 0.05, sy + 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // cable from top shelf to side — data connection
  ctx.strokeStyle = hexRGBA(0x44aaff, 0.4);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.2, s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.3, s * 0.5, cx + s * 0.15, s * 0.7, cx + s * 0.22, s * 0.85);
  ctx.stroke();
  ctx.setLineDash([]);

  // warning stripes at bottom
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? hexRGBA(0xffaa00, 0.5) : hexRGBA(0x1a1a1a, 0.6);
    ctx.fillRect(cx - s * 0.26 + i * (s * 0.14), h - 20, s * 0.14, 8);
  }
}

/**
 * Status monitor — 1×1 tile (64×64px)
 * Wall-mounted monitor showing MCP server status and tool counts.
 */
function drawStatusMonitor(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // wall mount bracket
  ctx.fillStyle = shade(0x3a3a40, -5);
  ctx.fillRect(cx - 4, 0, 8, s * 0.08);

  // monitor body — dark frame
  const bodyGrad = linearGrad(ctx, 0, s * 0.08, 0, s * 0.72, [
    [0, shade(0x2a2a30, 15)],
    [0.5, shade(0x1a1a20, 0)],
    [1, shade(0x0a0a10, -15)],
  ]);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, s * 0.06, s * 0.08, w - s * 0.12, s * 0.64, 5);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x3a3a40, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // screen — dark with status grid
  ctx.fillStyle = hexRGBA(0x0a0a14, 0.92);
  roundRect(ctx, s * 0.12, s * 0.14, w - s * 0.24, s * 0.5, 3);
  ctx.fill();

  // header bar
  ctx.fillStyle = hexRGBA(0x44aaff, 0.5);
  ctx.fillRect(s * 0.14, s * 0.16, w - s * 0.28, 2);

  // server status rows — green/yellow/red dots with lines
  const statusColors = [0x44ff44, 0x44ff44, 0xffaa44, 0x44ff44, 0xff4444];
  for (let i = 0; i < 5; i++) {
    const ry = s * 0.22 + i * (s * 0.07);
    // status dot
    ctx.fillStyle = hexRGBA(statusColors[i], 0.7);
    ctx.beginPath();
    ctx.arc(s * 0.17, ry, 2, 0, Math.PI * 2);
    ctx.fill();
    // server name line
    ctx.fillStyle = hexRGBA(0x888888, 0.5);
    ctx.fillRect(s * 0.22, ry - 1, s * 0.2, 1.5);
    // tool count bar
    ctx.fillStyle = hexRGBA(0x44aaff, 0.4);
    ctx.fillRect(s * 0.22, ry + 1.5, s * 0.15 + (i * 7 % 10), 1);
  }

  // bottom status bar
  ctx.fillStyle = hexRGBA(0x44ff44, 0.6);
  ctx.fillRect(s * 0.14, s * 0.58, s * 0.3, 2);
  ctx.fillStyle = hexRGBA(0x888888, 0.4);
  ctx.font = "bold 6px monospace";
  ctx.textAlign = "center";
  ctx.fillText("MCP STATUS", cx, s * 0.64);

  // power LED
  ctx.fillStyle = hexRGBA(0x44ff44, 0.7);
  ctx.beginPath();
  ctx.arc(w - s * 0.1, s * 0.68, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // antenna — small
  ctx.strokeStyle = shade(0x2a2a20, 0);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.08);
  ctx.lineTo(cx + s * 0.1, 0);
  ctx.stroke();
  ctx.fillStyle = hexRGBA(0x44aaff, 0.7);
  ctx.beginPath();
  ctx.arc(cx + s * 0.1, 0, 2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Blueprint desk — 2×1 tiles (128×64px)
 * Wide desk with big monitor showing MCP server architecture diagrams,
 * design documents, and tool schemas.
 */
function drawBlueprintDesk(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const s = TILE_PX;

  // shadow
  ctx.fillStyle = hexRGBA(0x000000, 0.18);
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, s, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk surface
  const deskGrad = linearGrad(ctx, 0, s * 0.4, 0, s * 0.65, [
    [0, shade(0x3a3a4a, 15)],
    [0.5, shade(0x2a2a3a, 0)],
    [1, shade(0x1a1a2a, -15)],
  ]);
  ctx.fillStyle = deskGrad;
  roundRect(ctx, s * 0.04, s * 0.4, w - s * 0.08, s * 0.25, 4);
  ctx.fill();
  // desk front panel
  ctx.fillStyle = shade(0x1a1a2a, -5);
  roundRect(ctx, s * 0.04, s * 0.62, w - s * 0.08, s * 0.2, 4);
  ctx.fill();

  // ── big architecture monitor (right side) ──
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

  // architecture diagram — boxes and connections
  // central server box
  ctx.fillStyle = hexRGBA(0x44aaff, 0.4);
  roundRect(ctx, monX + monW * 0.35, monY + monH * 0.3, 16, 12, 2);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x44aaff, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();

  // connected tool boxes
  for (let i = 0; i < 3; i++) {
    const tx = monX + 8 + i * (monW * 0.25);
    const ty = monY + monH * 0.65;
    ctx.fillStyle = hexRGBA(0xffdd44, 0.35);
    roundRect(ctx, tx, ty, 12, 8, 2);
    ctx.fill();
    // connection line to central box
    ctx.strokeStyle = hexRGBA(0x88ddff, 0.4);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(monX + monW * 0.43, monY + monH * 0.42);
    ctx.lineTo(tx + 6, ty);
    ctx.stroke();
  }

  // data flow arrows
  ctx.strokeStyle = hexRGBA(0x44ff66, 0.5);
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(monX + 8, monY + monH * 0.2);
  ctx.lineTo(monX + monW * 0.35, monY + monH * 0.35);
  ctx.stroke();
  ctx.setLineDash([]);

  // schema lines — JSON-like structure
  const schemaColors = [0x44ff66, 0x44ddff, 0xffaa44, 0x44ff66, 0xff66aa];
  for (let i = 0; i < 5; i++) {
    const ly = monY + monH - 18 + i * 3;
    ctx.fillStyle = hexRGBA(schemaColors[i % schemaColors.length], 0.5);
    ctx.fillRect(monX + 6, ly, monW * (0.3 + (i % 3) * 0.15), 1.5);
  }

  // tool count bar chart
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

  // ── blueprint document (left side) ──
  const bpX = cx - s * 0.4;
  const bpY = s * 0.1;
  const bpW = s * 0.5;
  const bpH = s * 0.28;

  // blueprint paper — blue background
  ctx.fillStyle = hexRGBA(0x1a3a5a, 0.7);
  roundRect(ctx, bpX, bpY, bpW, bpH, 2);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x4a7aaa, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // blueprint grid
  ctx.strokeStyle = hexRGBA(0x4a7aaa, 0.2);
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 6; i++) {
    const gx = bpX + i * (bpW / 6);
    ctx.beginPath();
    ctx.moveTo(gx, bpY + 2);
    ctx.lineTo(gx, bpY + bpH - 2);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const gy = bpY + i * (bpH / 4);
    ctx.beginPath();
    ctx.moveTo(bpX + 2, gy);
    ctx.lineTo(bpX + bpW - 2, gy);
    ctx.stroke();
  }

  // blueprint content — server architecture sketch
  ctx.strokeStyle = hexRGBA(0x88ddff, 0.6);
  ctx.lineWidth = 1.2;
  // central box
  ctx.strokeRect(bpX + bpW * 0.3, bpY + bpH * 0.3, bpW * 0.4, bpH * 0.25);
  // connection lines
  ctx.beginPath();
  ctx.moveTo(bpX + bpW * 0.1, bpY + bpH * 0.15);
  ctx.lineTo(bpX + bpW * 0.3, bpY + bpH * 0.35);
  ctx.moveTo(bpX + bpW * 0.9, bpY + bpH * 0.15);
  ctx.lineTo(bpX + bpW * 0.7, bpY + bpH * 0.35);
  ctx.moveTo(bpX + bpW * 0.5, bpY + bpH * 0.55);
  ctx.lineTo(bpX + bpW * 0.5, bpY + bpH * 0.8);
  ctx.stroke();
  // small boxes at endpoints
  ctx.strokeRect(bpX + bpW * 0.05, bpY + bpH * 0.08, bpW * 0.15, bpH * 0.12);
  ctx.strokeRect(bpX + bpW * 0.8, bpY + bpH * 0.08, bpW * 0.15, bpH * 0.12);
  ctx.strokeRect(bpX + bpW * 0.35, bpY + bpH * 0.75, bpW * 0.3, bpH * 0.15);

  // ── MCP SDK reference book on desk ──
  ctx.fillStyle = hexRGBA(0x4a6a8a, 0.6);
  roundRect(ctx, cx - s * 0.05, s * 0.4, s * 0.12, s * 0.06, 1);
  ctx.fill();
  ctx.strokeStyle = hexRGBA(0x6a8aaa, 0.4);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // book label
  ctx.fillStyle = hexRGBA(0xaaccff, 0.5);
  ctx.font = "bold 4px monospace";
  ctx.textAlign = "center";
  ctx.fillText("SDK", cx + s * 0.01, s * 0.44);
}

/* ---------- texture generation ---------- */

export const WORKSHOP_TEX_WAR_TABLE = "workshop-forge-station";
export const WORKSHOP_TEX_SCRAP_BIN = "workshop-tool-rack";
export const WORKSHOP_TEX_TELEMETRY_RADIO = "workshop-status-monitor";
export const WORKSHOP_TEX_WORKBENCH = "workshop-code-terminal";
export const WORKSHOP_TEX_RESEARCH_STATION = "workshop-blueprint-desk";

interface WorkshopPiece {
  key: string;
  texW: number;
  texH: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const WORKSHOP_PIECES: WorkshopPiece[] = [
  { key: WORKSHOP_TEX_WAR_TABLE, texW: TILE_PX * 2, texH: TILE_PX * 2, draw: drawForgeStation },
  { key: WORKSHOP_TEX_WORKBENCH, texW: TILE_PX * 2, texH: TILE_PX, draw: drawCodeTerminal },
  { key: WORKSHOP_TEX_SCRAP_BIN, texW: TILE_PX, texH: TILE_PX * 2, draw: drawToolRack },
  { key: WORKSHOP_TEX_TELEMETRY_RADIO, texW: TILE_PX, texH: TILE_PX, draw: drawStatusMonitor },
  { key: WORKSHOP_TEX_RESEARCH_STATION, texW: TILE_PX * 2, texH: TILE_PX, draw: drawBlueprintDesk },
];

/** Tile coordinates (top-left) and pixel dimensions for each workshop piece.
 *  Layout — distinct zones with walking space between them:
 *
 *    y=13:  [sofa] [sofa] .     .     .     .     .      [plant]
 *    y=14:  [research 2×1] .   [war table 2×2   ] [radio]
 *    y=15:  [plant] .         [war table 2×2   ] .      .
 *    y=16:  .     .           .     .     .     .      .
 *    y=17:  .     .           .     .     .     .      [scrap 1×2]
 *    y=18:  [workbench 2×1]   .     .     .     .      [scrap 1×2]
 */
export const WORKSHOP_LAYOUT: Record<string, { tile: { x: number; y: number }; w: number; h: number }> = {
  [WORKSHOP_TEX_RESEARCH_STATION]: { tile: { x: 22, y: 14 }, w: TILE_PX * 2, h: TILE_PX },
  [WORKSHOP_TEX_WAR_TABLE]: { tile: { x: 25, y: 14 }, w: TILE_PX * 2, h: TILE_PX * 2 },
  [WORKSHOP_TEX_TELEMETRY_RADIO]: { tile: { x: 28, y: 14 }, w: TILE_PX, h: TILE_PX },
  [WORKSHOP_TEX_WORKBENCH]: { tile: { x: 23, y: 18 }, w: TILE_PX * 2, h: TILE_PX },
  [WORKSHOP_TEX_SCRAP_BIN]: { tile: { x: 28, y: 17 }, w: TILE_PX, h: TILE_PX * 2 },
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
