/**
 * Procedural Texture Generation System
 *
 * Generates high-fidelity sprites at runtime using Phaser's CanvasTexture API.
 * No external image files needed — everything is drawn programmatically with
 * gradients, shading, outlines, and multiple layers of detail.
 *
 * Categories:
 * - Creature sprites (6 types, one per hostility level, with walk/attack/death frames)
 * - Beast sprites (5 unique boss designs with idle/attack/death frames)
 * - Projectile sprites (stone with rotation frames)
 * - Effect textures (impact, spark, dust, shockwave, recruit beam)
 * - UI textures (health bar segments, compass, minimap, damage number fonts)
 */

import Phaser from "phaser";

export const SPRITE_SCALE = 2; // render at 2x for crispness

type RGB = { r: number; g: number; b: number };

/** Create a canvas texture, throwing if creation fails. */
function createCanvasTexture(tex: Phaser.Textures.TextureManager, key: string, w: number, h: number): Phaser.Textures.CanvasTexture {
  const ct = tex.createCanvas(key, w, h);
  if (!ct) throw new Error(`Failed to create canvas texture: ${key}`);
  return ct;
}

/** Register individual frames on a canvas texture so Phaser's animation system can use them. */
function registerFrames(tex: Phaser.Textures.Texture, frameCount: number, frameSize: number): void {
  for (let f = 0; f < frameCount; f++) {
    tex.add(f, 0, f * frameSize, 0, frameSize, frameSize);
  }
}

function hexToRgb(hex: number): RGB {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function rgbToHex(r: number, g: number, b: number): number {
  return ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff);
}

function lighten(color: number, amount: number): number {
  const { r, g, b } = hexToRgb(color);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function darken(color: number, amount: number): number {
  const { r, g, b } = hexToRgb(color);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function rgba(color: number, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Draw a radial gradient circle on a canvas context. */
function radialGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  innerColor: number,
  outerColor: number,
  innerAlpha = 1,
  outerAlpha = 0,
): void {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, rgba(innerColor, innerAlpha));
  grad.addColorStop(1, rgba(outerColor, outerAlpha));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a glowing eye. */
function drawEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: number,
  glow: boolean = true,
): void {
  if (glow) {
    radialGradient(ctx, cx, cy, radius * 2.5, color, color, 0.4, 0);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = rgba(color, 1);
  ctx.fill();
  // pupil
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = rgba(0x000000, 0.6);
  ctx.fill();
  // shine
  ctx.beginPath();
  ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = rgba(0xffffff, 0.8);
  ctx.fill();
}

/** Draw a tapered limb (leg, arm) with shading. */
function drawLimb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  widthTop: number,
  widthBottom: number,
  color: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len;
  const ny = dx / len;

  ctx.beginPath();
  ctx.moveTo(x1 + nx * widthTop, y1 + ny * widthTop);
  ctx.lineTo(x2 + nx * widthBottom, y2 + ny * widthBottom);
  ctx.lineTo(x2 - nx * widthBottom, y2 - ny * widthBottom);
  ctx.lineTo(x1 - nx * widthTop, y1 - ny * widthTop);
  ctx.closePath();

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const grad = ctx.createLinearGradient(midX + nx * widthTop, midY + ny * widthTop, midX - nx * widthTop, midY - ny * widthTop);
  grad.addColorStop(0, rgba(lighten(color, 0.25), 1));
  grad.addColorStop(0.5, rgba(color, 1));
  grad.addColorStop(1, rgba(darken(color, 0.4), 1));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = rgba(darken(color, 0.5), 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Draw a textured scale pattern on a region. */
function drawScales(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  rows: number = 4,
): void {
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.3;
  for (let row = 0; row < rows; row++) {
    const y = cy - ry + (row / rows) * ry * 2;
    const offset = row % 2 === 0 ? 0 : rx / rows;
    for (let col = 0; col < rows * 2; col++) {
      const x = cx - rx + (col / (rows * 2)) * rx * 2 + offset;
      ctx.beginPath();
      ctx.ellipse(x, y, rx / rows * 0.8, ry / rows * 0.6, 0, 0, Math.PI);
      ctx.fillStyle = rgba(row % 2 === 0 ? lighten(color, 0.15) : darken(color, 0.15), 1);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Draw a fur texture using small radiating lines. */
function drawFur(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  density: number = 40,
): void {
  ctx.save();
  ctx.strokeStyle = rgba(darken(color, 0.2), 0.4);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < density; i++) {
    const angle = (i / density) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * rx * 0.7;
    const y1 = cy + Math.sin(angle) * ry * 0.7;
    const x2 = cx + Math.cos(angle) * rx * 1.05;
    const y2 = cy + Math.sin(angle) * ry * 1.05 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a crackled stone texture. */
function drawCracks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  count: number = 5,
): void {
  ctx.save();
  ctx.strokeStyle = rgba(darken(color, 0.5), 0.5);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sx = cx + Math.cos(a) * rx * 0.3;
    const sy = cy + Math.sin(a) * ry * 0.3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let x = sx, y = sy;
    for (let j = 0; j < 4; j++) {
      x += (Math.random() - 0.5) * 8;
      y += (Math.random() - 0.5) * 8;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a glowing rune/symbol on a surface. */
function drawRune(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: number,
  seed: number = 0,
): void {
  ctx.save();
  ctx.strokeStyle = rgba(color, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // deterministic pseudo-random rune based on seed
  const r = (n: number) => ((Math.sin(seed * 999 + n * 777) + 1) / 2);
  ctx.moveTo(cx - size * r(1), cy - size * r(2));
  ctx.lineTo(cx + size * r(3), cy - size * r(4));
  ctx.lineTo(cx + size * r(5), cy + size * r(6));
  ctx.lineTo(cx - size * r(7), cy + size * r(8));
  ctx.closePath();
  ctx.stroke();
  // inner glow
  radialGradient(ctx, cx, cy, size * 0.5, color, color, 0.3, 0);
  ctx.restore();
}

/** Draw a drop shadow beneath a creature. */
function drawGroundShadow(ctx: CanvasRenderingContext2D, cx: number, groundY: number, width: number): void {
  ctx.save();
  const grad = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, width);
  grad.addColorStop(0, rgba(0x000000, 0.35));
  grad.addColorStop(1, rgba(0x000000, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, groundY, width, width * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// CREATURE SPRITES — 6 types, 4 frames each (idle, walk1, walk2, attack)
// ============================================================

interface CreatureDesign {
  name: string;
  baseColor: number;
  accentColor: number;
  eyeColor: number;
  size: number;
  draw: (ctx: CanvasRenderingContext2D, frame: number, size: number, colors: CreatureDesign) => void;
}

const CREATURE_DESIGNS: CreatureDesign[] = [
  // Hostility 0: Slime — gelatinous blob with internal organs visible
  {
    name: "slime",
    baseColor: 0x4a8a4a,
    accentColor: 0x6aaa6a,
    eyeColor: 0xff3322,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const wobble = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? 5 : 0;
      const sqish = frame === 1 ? 0.92 : frame === 2 ? 1.08 : frame === 3 ? 0.85 : 1;

      drawGroundShadow(ctx, cx, groundY, s * 0.35);

      // outer membrane — semi-transparent with thick edge
      ctx.save();
      const grad = ctx.createRadialGradient(cx - 6, s * 0.35, 2, cx, s * 0.55, s * 0.45);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.5), 0.75));
      grad.addColorStop(0.5, rgba(c.baseColor, 0.7));
      grad.addColorStop(0.85, rgba(darken(c.baseColor, 0.2), 0.65));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 0.85));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.6 + wobble, s * 0.38 * sqish, s * 0.32 / sqish, 0, 0, Math.PI * 2);
      ctx.fill();

      // membrane outline — glossy
      ctx.strokeStyle = rgba(lighten(c.baseColor, 0.4), 0.6);
      ctx.lineWidth = 2;
      ctx.stroke();

      // internal nucleus — darker core visible through membrane
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.58 + wobble, s * 0.15, s * 0.12, 0, 0, Math.PI * 2);
      const coreGrad = ctx.createRadialGradient(cx - 2, s * 0.55 + wobble, 0, cx, s * 0.58 + wobble, s * 0.15);
      coreGrad.addColorStop(0, rgba(darken(c.baseColor, 0.3), 0.6));
      coreGrad.addColorStop(1, rgba(darken(c.baseColor, 0.5), 0.3));
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // floating particles inside slime
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + frame * 0.3;
        const r = s * 0.2 + Math.sin(frame + i) * 3;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, s * 0.55 + wobble + Math.sin(a) * r * 0.7, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(lighten(c.accentColor, 0.3), 0.5);
        ctx.fill();
      }

      // top highlight — glossy wet look
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.1, s * 0.38 + wobble, s * 0.12, s * 0.05, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0xffffff, 0.35);
      ctx.fill();

      // secondary smaller highlight
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.12, s * 0.35 + wobble, s * 0.04, s * 0.02, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0xffffff, 0.5);
      ctx.fill();

      // eyes — on the surface, looking forward
      const eyeY = s * 0.5 + wobble;
      drawEye(ctx, cx - s * 0.1, eyeY, 4.5, c.eyeColor);
      drawEye(ctx, cx + s * 0.1, eyeY, 4.5, c.eyeColor);

      // mouth — simple curve on surface
      ctx.beginPath();
      ctx.arc(cx, s * 0.62 + wobble, s * 0.06, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.6), 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // attack frame — dripping pseudopod
      if (frame === 3) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.25, s * 0.55 + wobble);
        ctx.quadraticCurveTo(cx + s * 0.4, s * 0.5, cx + s * 0.45, s * 0.65);
        ctx.quadraticCurveTo(cx + s * 0.35, s * 0.6, cx + s * 0.25, s * 0.6 + wobble);
        ctx.fillStyle = rgba(c.baseColor, 0.7);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  // Hostility 1: Wolf — quadruped predator with fur, fangs, and muscular build
  {
    name: "wolf",
    baseColor: 0x5a4a3a,
    accentColor: 0x7a6a5a,
    eyeColor: 0xff3322,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const legPhase = frame === 1 ? 4 : frame === 2 ? -4 : frame === 3 ? 0 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.4);

      // --- hind leg (far side, darker) ---
      drawLimb(ctx, cx - s * 0.15, s * 0.55, cx - s * 0.18 + legPhase, groundY - 2, 5, 3, darken(c.baseColor, 0.3));

      // --- tail — bushy, curved ---
      ctx.save();
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.28, s * 0.5);
      ctx.quadraticCurveTo(cx - s * 0.42, s * 0.38 + legPhase * 0.5, cx - s * 0.38, s * 0.22 + legPhase);
      ctx.stroke();
      // tail fur tip
      ctx.strokeStyle = rgba(lighten(c.accentColor, 0.2), 0.8);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.37, s * 0.26 + legPhase);
      ctx.lineTo(cx - s * 0.39, s * 0.2 + legPhase);
      ctx.stroke();
      ctx.restore();

      // --- body — muscular torso ---
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, s * 0.4, 0, s * 0.65);
      bodyGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.25), 1));
      bodyGrad.addColorStop(0.5, rgba(c.baseColor, 1));
      bodyGrad.addColorStop(1, rgba(darken(c.baseColor, 0.35), 1));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.52, s * 0.32, s * 0.18, -0.05, 0, Math.PI * 2);
      ctx.fill();
      // back ridge — darker spine line
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.4), 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.25, s * 0.42);
      ctx.quadraticCurveTo(cx, s * 0.38, cx + s * 0.2, s * 0.43);
      ctx.stroke();
      ctx.restore();

      // fur texture on body
      drawFur(ctx, cx, s * 0.5, s * 0.28, s * 0.14, c.baseColor, 30);

      // --- front leg (near side) ---
      drawLimb(ctx, cx + s * 0.12, s * 0.55, cx + s * 0.15 - legPhase, groundY - 2, 5, 3, c.baseColor);
      // paw
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.15 - legPhase, groundY - 1, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(darken(c.baseColor, 0.4), 1);
      ctx.fill();

      // --- hind leg (near side) ---
      drawLimb(ctx, cx - s * 0.08, s * 0.55, cx - s * 0.05 + legPhase, groundY - 2, 5, 3, c.baseColor);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.05 + legPhase, groundY - 1, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(darken(c.baseColor, 0.4), 1);
      ctx.fill();

      // --- head — snout with jaw ---
      const hx = cx + s * 0.28;
      const hy = s * 0.42;
      ctx.save();
      // skull shape
      const headGrad = ctx.createRadialGradient(hx - 3, hy - 4, 0, hx, hy, s * 0.16);
      headGrad.addColorStop(0, rgba(lighten(c.accentColor, 0.2), 1));
      headGrad.addColorStop(0.6, rgba(c.accentColor, 1));
      headGrad.addColorStop(1, rgba(darken(c.accentColor, 0.3), 1));
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(hx, hy, s * 0.14, s * 0.12, 0.1, 0, Math.PI * 2);
      ctx.fill();
      // snout — elongated
      ctx.beginPath();
      ctx.ellipse(hx + s * 0.1, hy + s * 0.04, s * 0.08, s * 0.06, 0.1, 0, Math.PI * 2);
      ctx.fillStyle = rgba(lighten(c.accentColor, 0.1), 1);
      ctx.fill();
      ctx.restore();

      // ears — triangular, alert
      ctx.fillStyle = rgba(darken(c.baseColor, 0.15), 1);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.06, hy - s * 0.08);
      ctx.lineTo(hx - s * 0.02, hy - s * 0.18);
      ctx.lineTo(hx + s * 0.04, hy - s * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.4), 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      // inner ear
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.03, hy - s * 0.1);
      ctx.lineTo(hx - s * 0.01, hy - s * 0.15);
      ctx.lineTo(hx + s * 0.02, hy - s * 0.1);
      ctx.closePath();
      ctx.fillStyle = rgba(0x884422, 0.6);
      ctx.fill();

      // eye — predatory, angled
      ctx.save();
      ctx.translate(hx + s * 0.02, hy - s * 0.02);
      ctx.rotate(0.3);
      drawEye(ctx, 0, 0, 3.5, c.eyeColor);
      ctx.restore();

      // nose
      ctx.beginPath();
      ctx.ellipse(hx + s * 0.17, hy + s * 0.05, 3, 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0x000000, 0.85);
      ctx.fill();
      // nose shine
      ctx.beginPath();
      ctx.arc(hx + s * 0.16, hy + s * 0.04, 1, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0xffffff, 0.4);
      ctx.fill();

      // fangs — visible when attacking
      if (frame === 3) {
        ctx.fillStyle = rgba(0xffffff, 0.9);
        ctx.beginPath();
        ctx.moveTo(hx + s * 0.1, hy + s * 0.08);
        ctx.lineTo(hx + s * 0.11, hy + s * 0.14);
        ctx.lineTo(hx + s * 0.13, hy + s * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hx + s * 0.14, hy + s * 0.08);
        ctx.lineTo(hx + s * 0.15, hy + s * 0.14);
        ctx.lineTo(hx + s * 0.17, hy + s * 0.08);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  // Hostility 2: Skeleton — bony undead with tattered remnants, visible joints
  {
    name: "skeleton",
    baseColor: 0xd0d0c8,
    accentColor: 0xb0b0a8,
    eyeColor: 0xff3322,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const sway = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? 4 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.25);

      // --- legs — bone structure ---
      // left leg
      drawLimb(ctx, cx - s * 0.06, s * 0.6, cx - s * 0.08 + sway, groundY, 4, 3, c.accentColor);
      // knee joint
      ctx.beginPath();
      ctx.arc(cx - s * 0.07 + sway, s * 0.74, 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.fill();
      drawLimb(ctx, cx - s * 0.07 + sway, s * 0.74, cx - s * 0.06 + sway, groundY, 3, 2.5, c.accentColor);
      // right leg
      drawLimb(ctx, cx + s * 0.06, s * 0.6, cx + s * 0.08 + sway, groundY, 4, 3, c.accentColor);
      ctx.beginPath();
      ctx.arc(cx + s * 0.07 + sway, s * 0.74, 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.fill();
      drawLimb(ctx, cx + s * 0.07 + sway, s * 0.74, cx + s * 0.06 + sway, groundY, 3, 2.5, c.accentColor);

      // --- pelvis ---
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.ellipse(cx + sway, s * 0.6, s * 0.1, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(darken(c.accentColor, 0.3), 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();

      // --- spine — vertebrae stack ---
      ctx.strokeStyle = rgba(c.accentColor, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + sway, s * 0.58);
      ctx.lineTo(cx + sway, s * 0.38);
      ctx.stroke();
      // vertebrae bumps
      for (let i = 0; i < 5; i++) {
        const vy = s * 0.56 - i * s * 0.04;
        ctx.beginPath();
        ctx.ellipse(cx - 3 + sway, vy, 2, 1.5, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 3 + sway, vy, 2, 1.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = rgba(c.baseColor, 1);
        ctx.fill();
      }

      // --- ribcage — curved ribs ---
      ctx.strokeStyle = rgba(c.accentColor, 0.9);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const ry = s * 0.42 + i * s * 0.04;
        ctx.beginPath();
        ctx.moveTo(cx - 3 + sway, ry);
        ctx.quadraticCurveTo(cx - s * 0.12 + sway, ry + 2, cx - s * 0.08 + sway, ry + s * 0.04);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 3 + sway, ry);
        ctx.quadraticCurveTo(cx + s * 0.12 + sway, ry + 2, cx + s * 0.08 + sway, ry + s * 0.04);
        ctx.stroke();
      }

      // --- tattered cloth around waist ---
      ctx.fillStyle = rgba(0x4a3a2a, 0.5);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.1 + sway, s * 0.58);
      ctx.lineTo(cx - s * 0.12 + sway, s * 0.7);
      ctx.lineTo(cx - s * 0.06 + sway, s * 0.66);
      ctx.lineTo(cx + sway, s * 0.72);
      ctx.lineTo(cx + s * 0.06 + sway, s * 0.66);
      ctx.lineTo(cx + s * 0.12 + sway, s * 0.7);
      ctx.lineTo(cx + s * 0.1 + sway, s * 0.58);
      ctx.closePath();
      ctx.fill();

      // --- arms — bony with joints ---
      const armSwing = frame === 1 ? 5 : frame === 2 ? -5 : frame === 3 ? 15 : 0;
      // left arm
      drawLimb(ctx, cx - s * 0.08 + sway, s * 0.4, cx - s * 0.18 + sway, s * 0.55 + armSwing * 0.3, 3, 2.5, c.accentColor);
      ctx.beginPath();
      ctx.arc(cx - s * 0.18 + sway, s * 0.55 + armSwing * 0.3, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.fill();
      drawLimb(ctx, cx - s * 0.18 + sway, s * 0.55 + armSwing * 0.3, cx - s * 0.22 + sway, s * 0.7 + armSwing, 2.5, 2, c.accentColor);
      // right arm
      drawLimb(ctx, cx + s * 0.08 + sway, s * 0.4, cx + s * 0.18 + sway, s * 0.55 - armSwing * 0.3, 3, 2.5, c.accentColor);
      ctx.beginPath();
      ctx.arc(cx + s * 0.18 + sway, s * 0.55 - armSwing * 0.3, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.fill();
      drawLimb(ctx, cx + s * 0.18 + sway, s * 0.55 - armSwing * 0.3, cx + s * 0.22 + sway, s * 0.7 - armSwing, 2.5, 2, c.accentColor);

      // --- skull ---
      const skx = cx + sway;
      const sky = s * 0.28;
      ctx.save();
      const skullGrad = ctx.createRadialGradient(skx - 4, sky - 5, 0, skx, sky, s * 0.16);
      skullGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      skullGrad.addColorStop(0.7, rgba(c.baseColor, 1));
      skullGrad.addColorStop(1, rgba(darken(c.baseColor, 0.25), 1));
      ctx.fillStyle = skullGrad;
      ctx.beginPath();
      ctx.ellipse(skx, sky, s * 0.13, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(darken(c.accentColor, 0.3), 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();

      // cranium suture line
      ctx.beginPath();
      ctx.moveTo(skx, sky - s * 0.12);
      ctx.quadraticCurveTo(skx + 2, sky - s * 0.05, skx, sky);
      ctx.stroke();

      // eye sockets — deep, dark
      ctx.beginPath();
      ctx.ellipse(skx - s * 0.05, sky - s * 0.02, s * 0.04, s * 0.05, 0, 0, Math.PI * 2);
      ctx.ellipse(skx + s * 0.05, sky - s * 0.02, s * 0.04, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0x000000, 0.9);
      ctx.fill();
      // glowing eyes in sockets
      drawEye(ctx, skx - s * 0.05, sky - s * 0.02, 3, c.eyeColor);
      drawEye(ctx, skx + s * 0.05, sky - s * 0.02, 3, c.eyeColor);

      // nasal cavity
      ctx.beginPath();
      ctx.moveTo(skx, sky + s * 0.04);
      ctx.lineTo(skx - s * 0.02, sky + s * 0.08);
      ctx.lineTo(skx + s * 0.02, sky + s * 0.08);
      ctx.closePath();
      ctx.fillStyle = rgba(0x000000, 0.8);
      ctx.fill();

      // teeth — individual
      ctx.fillStyle = rgba(c.baseColor, 1);
      for (let i = 0; i < 5; i++) {
        const tx = skx - s * 0.06 + i * s * 0.03;
        ctx.fillRect(tx, sky + s * 0.1, 2, 4);
      }
      // jaw line
      ctx.strokeStyle = rgba(darken(c.accentColor, 0.2), 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(skx - s * 0.08, sky + s * 0.1);
      ctx.lineTo(skx + s * 0.08, sky + s * 0.1);
      ctx.stroke();
      ctx.restore();
    },
  },
  // Hostility 3: Demon Imp — leathery wings, spaded tail, runic skin
  {
    name: "imp",
    baseColor: 0x8a2a2a,
    accentColor: 0xaa3a3a,
    eyeColor: 0xffaa00,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const bounce = frame === 1 ? -4 : frame === 2 ? 4 : frame === 3 ? -6 : 0;

      drawGroundShadow(ctx, cx, groundY - bounce, s * 0.28);

      // --- tail — spaded, whipping ---
      ctx.save();
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 1);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, s * 0.65 + bounce);
      ctx.quadraticCurveTo(cx - s * 0.15, s * 0.72 + bounce + frame * 2, cx - s * 0.22, s * 0.6 + bounce + frame * 3);
      ctx.stroke();
      // spade tip
      ctx.fillStyle = rgba(darken(c.baseColor, 0.3), 1);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22, s * 0.6 + bounce + frame * 3);
      ctx.lineTo(cx - s * 0.26, s * 0.56 + bounce + frame * 3);
      ctx.lineTo(cx - s * 0.18, s * 0.56 + bounce + frame * 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // --- wings — leathery with finger bones ---
      const wingFlap = frame === 3 ? -8 : Math.sin(frame * 2) * 4;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + side * s * 0.18, s * 0.42 + bounce);
        const wingGrad = ctx.createLinearGradient(0, 0, side * s * 0.25, s * 0.2);
        wingGrad.addColorStop(0, rgba(darken(c.baseColor, 0.2), 0.85));
        wingGrad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 0.6));
        ctx.fillStyle = wingGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // wing finger bones
        for (let i = 0; i < 4; i++) {
          const a = -0.6 + i * 0.3 + wingFlap * 0.01;
          const len = s * 0.22 - i * 2;
          ctx.lineTo(side * Math.cos(a) * len, Math.sin(a) * len);
        }
        ctx.quadraticCurveTo(side * s * 0.05, s * 0.2, 0, s * 0.05);
        ctx.closePath();
        ctx.fill();
        // wing bone lines
        ctx.strokeStyle = rgba(darken(c.baseColor, 0.5), 0.7);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
          const a = -0.6 + i * 0.3 + wingFlap * 0.01;
          const len = s * 0.22 - i * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(side * Math.cos(a) * len, Math.sin(a) * len);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --- body — compact, muscular ---
      ctx.save();
      const bodyGrad = ctx.createRadialGradient(cx - 4, s * 0.45 + bounce, 0, cx, s * 0.55 + bounce, s * 0.28);
      bodyGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.3), 1));
      bodyGrad.addColorStop(0.5, rgba(c.baseColor, 1));
      bodyGrad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 1));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.55 + bounce, s * 0.22, s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.5), 0.6);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // runic markings on chest
      drawRune(ctx, cx, s * 0.55 + bounce, 6, c.eyeColor, 3);

      // --- legs — hooved ---
      drawLimb(ctx, cx - s * 0.08, s * 0.7 + bounce, cx - s * 0.1, groundY, 4, 3, darken(c.baseColor, 0.2));
      drawLimb(ctx, cx + s * 0.08, s * 0.7 + bounce, cx + s * 0.1, groundY, 4, 3, darken(c.baseColor, 0.2));
      // hooves
      for (const hx of [cx - s * 0.1, cx + s * 0.1]) {
        ctx.beginPath();
        ctx.ellipse(hx, groundY, 4, 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0x000000, 0.8);
        ctx.fill();
      }

      // --- arms ---
      const armSwing = frame === 3 ? 12 : 0;
      drawLimb(ctx, cx - s * 0.15, s * 0.48 + bounce, cx - s * 0.22 - armSwing * 0.3, s * 0.65 + bounce + armSwing, 3.5, 2.5, c.baseColor);
      drawLimb(ctx, cx + s * 0.15, s * 0.48 + bounce, cx + s * 0.22 + armSwing * 0.3, s * 0.65 + bounce + armSwing, 3.5, 2.5, c.baseColor);
      // clawed hands
      if (frame === 3) {
        for (const side of [-1, 1]) {
          const hx = cx + side * (s * 0.22 + armSwing * 0.3);
          const hy = s * 0.65 + bounce + armSwing;
          ctx.fillStyle = rgba(0x000000, 0.9);
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(hx + i * 2 - 2, hy);
            ctx.lineTo(hx + i * 2 - 1, hy + 4);
            ctx.lineTo(hx + i * 2, hy);
            ctx.fill();
          }
        }
      }

      // --- head — with horns ---
      const hx = cx;
      const hy = s * 0.32 + bounce;
      ctx.save();
      const headGrad = ctx.createRadialGradient(hx - 3, hy - 4, 0, hx, hy, s * 0.14);
      headGrad.addColorStop(0, rgba(lighten(c.accentColor, 0.2), 1));
      headGrad.addColorStop(0.6, rgba(c.accentColor, 1));
      headGrad.addColorStop(1, rgba(darken(c.accentColor, 0.3), 1));
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(hx, hy, s * 0.13, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // horns — curved, ridged
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(hx + side * s * 0.08, hy - s * 0.05);
        ctx.fillStyle = rgba(darken(c.baseColor, 0.5), 1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * s * 0.08, -s * 0.12, side * s * 0.04, -s * 0.18);
        ctx.quadraticCurveTo(side * s * 0.02, -s * 0.1, -side * 2, 0);
        ctx.closePath();
        ctx.fill();
        // horn ridges
        ctx.strokeStyle = rgba(0x000000, 0.4);
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(side * 1, -i * 4 - 2);
          ctx.lineTo(side * s * 0.05 - side * i, -i * 4 - 4);
          ctx.stroke();
        }
        ctx.restore();
      }

      // eyes — angled, fierce
      drawEye(ctx, hx - s * 0.05, hy, 4, c.eyeColor);
      drawEye(ctx, hx + s * 0.05, hy, 4, c.eyeColor);

      // mouth — jagged teeth
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.06, hy + s * 0.06);
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(hx - s * 0.06 + i * s * 0.03, hy + s * 0.06 + (i % 2 === 0 ? 3 : 0));
      }
      ctx.strokeStyle = rgba(0x000000, 0.8);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // individual teeth
      ctx.fillStyle = rgba(0xeeeedd, 0.9);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(hx - s * 0.05 + i * s * 0.03, hy + s * 0.06, 2, 3);
      }
    },
  },
  // Hostility 4: Void Wraith — cloaked specter with ethereal tendrils and cosmic eyes
  {
    name: "wraith",
    baseColor: 0x2a1a3a,
    accentColor: 0x4a2a5a,
    eyeColor: 0xaa00ff,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const float = frame === 1 ? -3 : frame === 2 ? 3 : frame === 3 ? -5 : Math.sin(frame * 2) * 2;

      // void aura — dark energy field
      radialGradient(ctx, cx, s * 0.5 + float, s * 0.45, c.eyeColor, 0x000000, 0.12, 0);

      // --- ethereal tendrils — wispy bottom ---
      ctx.save();
      ctx.strokeStyle = rgba(c.baseColor, 0.7);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const tx = cx - s * 0.25 + i * s * 0.1;
        const wave = Math.sin(frame * 2 + i * 0.8) * 6;
        ctx.beginPath();
        ctx.moveTo(tx, s * 0.65 + float);
        ctx.quadraticCurveTo(tx + wave, s * 0.78 + float, tx + wave * 0.5, s * 0.9 + float);
        ctx.stroke();
        // tendril tip glow
        radialGradient(ctx, tx + wave * 0.5, s * 0.9 + float, 3, c.eyeColor, c.eyeColor, 0.4, 0);
      }
      ctx.restore();

      // --- cloak — tattered hood and shoulders ---
      ctx.save();
      const cloakGrad = ctx.createRadialGradient(cx - 5, s * 0.35 + float, 0, cx, s * 0.5 + float, s * 0.4);
      cloakGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 0.85));
      cloakGrad.addColorStop(0.5, rgba(c.baseColor, 0.8));
      cloakGrad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 0.3));
      ctx.fillStyle = cloakGrad;
      ctx.beginPath();
      // hood top
      ctx.moveTo(cx - s * 0.15, s * 0.25 + float);
      ctx.quadraticCurveTo(cx, s * 0.15 + float, cx + s * 0.15, s * 0.25 + float);
      // shoulders
      ctx.quadraticCurveTo(cx + s * 0.3, s * 0.35 + float, cx + s * 0.28, s * 0.55 + float);
      // tattered cloak edge
      ctx.lineTo(cx + s * 0.22, s * 0.7 + float);
      ctx.lineTo(cx + s * 0.15, s * 0.65 + float);
      ctx.lineTo(cx + s * 0.08, s * 0.72 + float);
      ctx.lineTo(cx, s * 0.66 + float);
      ctx.lineTo(cx - s * 0.08, s * 0.72 + float);
      ctx.lineTo(cx - s * 0.15, s * 0.65 + float);
      ctx.lineTo(cx - s * 0.22, s * 0.7 + float);
      ctx.lineTo(cx - s * 0.28, s * 0.55 + float);
      ctx.quadraticCurveTo(cx - s * 0.3, s * 0.35 + float, cx - s * 0.15, s * 0.25 + float);
      ctx.closePath();
      ctx.fill();

      // cloak inner shadow — depth inside hood
      ctx.fillStyle = rgba(0x000000, 0.5);
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.35 + float, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- cosmic eyes — multiple, floating in the void of the hood ---
      drawEye(ctx, cx - s * 0.06, s * 0.33 + float, 5, c.eyeColor);
      drawEye(ctx, cx + s * 0.06, s * 0.33 + float, 5, c.eyeColor);
      // third eye — smaller, higher
      drawEye(ctx, cx, s * 0.26 + float, 3, c.eyeColor);

      // --- floating void shards orbiting ---
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + frame * 0.4;
        const r = s * 0.35 + Math.sin(frame + i) * 4;
        const px = cx + Math.cos(a) * r;
        const py = s * 0.5 + float + Math.sin(a) * r * 0.6;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a + frame);
        ctx.fillStyle = rgba(c.eyeColor, 0.5);
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(2, 0);
        ctx.lineTo(0, 3);
        ctx.lineTo(-2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // --- skeletal hands emerging from cloak ---
      for (const side of [-1, 1]) {
        const hx = cx + side * s * 0.22;
        const hy = s * 0.5 + float;
        ctx.strokeStyle = rgba(0xddddcc, 0.7);
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + side * (i - 1.5) * 2, hy + 8);
          ctx.stroke();
        }
        // palm
        ctx.beginPath();
        ctx.arc(hx, hy, 3, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0xddddcc, 0.6);
        ctx.fill();
      }
    },
  },
  // Hostility 5: Fire Elemental — living inferno with obsidian core and magma cracks
  {
    name: "fire-elemental",
    baseColor: 0x1a0a0a,
    accentColor: 0x3a1a0a,
    eyeColor: 0xffff44,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const flicker = Math.sin(frame * 3) * 3;
      const groundY = s * 0.85;

      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      // --- outer flame aura ---
      radialGradient(ctx, cx, s * 0.5, s * 0.42, 0xff6600, 0x000000, 0.2, 0);

      // --- flame body — layered animated flames ---
      ctx.save();
      for (let layer = 0; layer < 3; layer++) {
        const layerAlpha = 0.7 - layer * 0.2;
        const flameGrad = ctx.createLinearGradient(0, s * 0.15, 0, s * 0.75);
        flameGrad.addColorStop(0, rgba(0xffff00, 0));
        flameGrad.addColorStop(0.2, rgba(0xffaa00, layerAlpha * 0.8));
        flameGrad.addColorStop(0.5, rgba(0xff6600, layerAlpha));
        flameGrad.addColorStop(0.8, rgba(0xff3300, layerAlpha * 0.9));
        flameGrad.addColorStop(1, rgba(0xff0000, layerAlpha * 0.7));
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        const baseW = s * 0.3 - layer * s * 0.05;
        const peakY = s * 0.15 + layer * s * 0.05 + flicker;
        ctx.moveTo(cx - baseW, s * 0.7);
        // left flame edge
        ctx.quadraticCurveTo(cx - baseW * 0.8, s * 0.4, cx - baseW * 0.3, s * 0.3 + flicker);
        ctx.quadraticCurveTo(cx - baseW * 0.1, s * 0.2, cx, peakY);
        // right flame edge
        ctx.quadraticCurveTo(cx + baseW * 0.1, s * 0.2, cx + baseW * 0.3, s * 0.3 + flicker);
        ctx.quadraticCurveTo(cx + baseW * 0.8, s * 0.4, cx + baseW, s * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // --- obsidian core — dark crystalline body ---
      ctx.save();
      const coreGrad = ctx.createRadialGradient(cx - 4, s * 0.45, 0, cx, s * 0.5, s * 0.22);
      coreGrad.addColorStop(0, rgba(0x4a2a1a, 1));
      coreGrad.addColorStop(0.5, rgba(c.baseColor, 1));
      coreGrad.addColorStop(1, rgba(0x000000, 1));
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      // jagged crystalline shape
      const corePts: [number, number][] = [
        [-18, 5], [-12, -15], [-5, -22], [5, -22], [12, -15], [18, 5], [15, 18], [0, 22], [-15, 18],
      ];
      for (let i = 0; i < corePts.length; i++) {
        const [px, py] = corePts[i];
        if (i === 0) ctx.moveTo(cx + px, s * 0.5 + py);
        else ctx.lineTo(cx + px, s * 0.5 + py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(0x000000, 0.8);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // --- magma cracks — glowing from within ---
      ctx.save();
      ctx.strokeStyle = rgba(0xff6600, 0.8);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 10, s * 0.42);
      ctx.lineTo(cx - 4, s * 0.5);
      ctx.lineTo(cx - 8, s * 0.58);
      ctx.moveTo(cx + 10, s * 0.42);
      ctx.lineTo(cx + 4, s * 0.5);
      ctx.lineTo(cx + 8, s * 0.58);
      ctx.moveTo(cx, s * 0.38);
      ctx.lineTo(cx, s * 0.62);
      ctx.stroke();
      // crack glow
      ctx.strokeStyle = rgba(0xffaa00, 0.4);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // --- eyes — blazing from the core ---
      drawEye(ctx, cx - s * 0.06, s * 0.45, 5, c.eyeColor);
      drawEye(ctx, cx + s * 0.06, s * 0.45, 5, c.eyeColor);

      // --- floating embers ---
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + frame * 0.5;
        const r = s * 0.3 + Math.sin(frame * 2 + i) * 5;
        const px = cx + Math.cos(a) * r;
        const py = s * 0.45 + Math.sin(a) * r * 0.7;
        const emberSize = 1.5 + Math.sin(frame + i) * 0.5;
        radialGradient(ctx, px, py, emberSize * 2, 0xffaa00, 0xff3300, 0.6, 0);
        ctx.beginPath();
        ctx.arc(px, py, emberSize, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0xffdd44, 0.8);
        ctx.fill();
      }

      // attack frame — fireball forming
      if (frame === 3) {
        radialGradient(ctx, cx, s * 0.3, 12, 0xffff00, 0xff3300, 0.7, 0);
        ctx.beginPath();
        ctx.arc(cx, s * 0.3, 8, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0xffff88, 0.8);
        ctx.fill();
      }
    },
  },
];

// ============================================================
// BEAST SPRITES — 5 unique boss designs, 4 frames each
// ============================================================

interface BeastDesign {
  name: string;
  baseColor: number;
  accentColor: number;
  eyeColor: number;
  radius: number;
  draw: (ctx: CanvasRenderingContext2D, frame: number, size: number, d: BeastDesign) => void;
}

const BEAST_DESIGNS: BeastDesign[] = [
  // Groveheart — Ancient Treant with gnarled bark, living leaves, and root claws
  {
    name: "groveheart",
    baseColor: 0x2a5a2a,
    accentColor: 0x4a8a3a,
    eyeColor: 0x88ff88,
    radius: 28,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const sway = Math.sin(frame * 1.5) * 3;
      const armSwing = frame === 3 ? 15 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.42);

      // --- root legs — spreading, clawed ---
      ctx.strokeStyle = rgba(0x3a2a1a, 1);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12, s * 0.78);
      ctx.quadraticCurveTo(cx - s * 0.2, s * 0.88, cx - s * 0.28, groundY);
      ctx.moveTo(cx + s * 0.12, s * 0.78);
      ctx.quadraticCurveTo(cx + s * 0.2, s * 0.88, cx + s * 0.28, groundY);
      ctx.stroke();
      // root claws
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + side * (s * 0.24 + i * 3), groundY - 2);
          ctx.lineTo(cx + side * (s * 0.26 + i * 3), groundY + 3);
          ctx.stroke();
        }
      }

      // --- trunk — tapered, textured bark ---
      ctx.save();
      const trunkGrad = ctx.createLinearGradient(cx - s * 0.15, 0, cx + s * 0.15, 0);
      trunkGrad.addColorStop(0, rgba(0x2a1a0a, 1));
      trunkGrad.addColorStop(0.3, rgba(0x4a3a2a, 1));
      trunkGrad.addColorStop(0.7, rgba(0x5a4a3a, 1));
      trunkGrad.addColorStop(1, rgba(0x3a2a1a, 1));
      ctx.fillStyle = trunkGrad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.14, s * 0.78);
      ctx.lineTo(cx - s * 0.1 + sway, s * 0.45);
      ctx.lineTo(cx + s * 0.1 + sway, s * 0.45);
      ctx.lineTo(cx + s * 0.14, s * 0.78);
      ctx.closePath();
      ctx.fill();
      // bark texture — vertical striations
      ctx.strokeStyle = rgba(0x2a1a0a, 0.6);
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const bx = cx - s * 0.1 + i * s * 0.05;
        ctx.beginPath();
        ctx.moveTo(bx, s * 0.45);
        ctx.lineTo(bx + sway * 0.3, s * 0.78);
        ctx.stroke();
      }
      // bark knots
      for (let i = 0; i < 3; i++) {
        const kx = cx - s * 0.06 + i * s * 0.06 + sway * 0.2;
        const ky = s * 0.55 + i * s * 0.08;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 3, 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0x1a0a00, 0.6);
        ctx.fill();
      }
      ctx.restore();

      // --- branch arms — gnarled, reaching ---
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.strokeStyle = rgba(0x4a3a2a, 1);
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx + side * s * 0.1 + sway, s * 0.5);
        ctx.quadraticCurveTo(
          cx + side * (s * 0.25 + armSwing * 0.3),
          s * 0.42 + side * armSwing * 0.2,
          cx + side * (s * 0.32 + armSwing * 0.5),
          s * 0.55 + armSwing * 0.3,
        );
        ctx.stroke();
        // twig fingers
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + side * (s * 0.32 + armSwing * 0.5), s * 0.55 + armSwing * 0.3);
          ctx.lineTo(cx + side * (s * 0.35 + armSwing * 0.5 + i * 2), s * 0.62 + armSwing * 0.3 + i * 3);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --- canopy — layered organic foliage masses ---
      for (let layer = 0; layer < 4; layer++) {
        const r = s * 0.32 - layer * s * 0.05;
        const cy = s * 0.28 - layer * s * 0.06 + sway;
        const lx = cx + (layer % 2 === 0 ? -s * 0.04 : s * 0.04);
        const color = layer % 2 === 0 ? d.baseColor : d.accentColor;
        ctx.save();
        const leafGrad = ctx.createRadialGradient(lx - r * 0.3, cy - r * 0.3, 0, lx, cy, r);
        leafGrad.addColorStop(0, rgba(lighten(color, 0.3), 1));
        leafGrad.addColorStop(0.6, rgba(color, 1));
        leafGrad.addColorStop(1, rgba(darken(color, 0.3), 1));
        ctx.fillStyle = leafGrad;
        // organic blob shape
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const rr = r * (0.85 + Math.sin(i * 1.7 + layer) * 0.15);
          const px = lx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * 0.85;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // individual leaf highlights
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + sway * 0.01;
        const r = s * 0.28;
        const lx = cx + Math.cos(a) * r;
        const ly = s * 0.25 + Math.sin(a) * r * 0.7;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 3, 1.5, a, 0, Math.PI * 2);
        ctx.fillStyle = rgba(lighten(d.accentColor, 0.3), 0.6);
        ctx.fill();
      }

      // --- face — carved into trunk ---
      // eye sockets — deep gouges
      ctx.fillStyle = rgba(0x000000, 0.6);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.06 + sway, s * 0.58, s * 0.04, s * 0.05, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.06 + sway, s * 0.58, s * 0.04, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      drawEye(ctx, cx - s * 0.06 + sway, s * 0.58, 4, d.eyeColor);
      drawEye(ctx, cx + s * 0.06 + sway, s * 0.58, 4, d.eyeColor);

      // gnarled mouth — twisted roots forming a grimace
      ctx.strokeStyle = rgba(0x1a0a00, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08 + sway, s * 0.7);
      ctx.quadraticCurveTo(cx - s * 0.04 + sway, s * 0.73, cx + sway, s * 0.7);
      ctx.quadraticCurveTo(cx + s * 0.04 + sway, s * 0.73, cx + s * 0.08 + sway, s * 0.7);
      ctx.stroke();
      // dripping sap
      ctx.fillStyle = rgba(0xaa8844, 0.6);
      ctx.beginPath();
      ctx.ellipse(cx + sway, s * 0.74, 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  // Stone Colossus — Ancient golem with runic inscriptions, moss, and crystalline eyes
  {
    name: "stone-colossus",
    baseColor: 0x6a6a72,
    accentColor: 0x8a8a92,
    eyeColor: 0xffaa00,
    radius: 36,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const stomp = frame === 1 ? 3 : frame === 2 ? -3 : 0;
      const armRaise = frame === 3 ? -10 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.45);

      // --- legs — massive stone pillars ---
      ctx.fillStyle = rgba(darken(d.baseColor, 0.15), 1);
      ctx.fillRect(cx - s * 0.2, s * 0.72 + stomp, s * 0.14, s * 0.2);
      ctx.fillRect(cx + s * 0.06, s * 0.72 + stomp, s * 0.14, s * 0.2);
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.4), 0.8);
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - s * 0.2, s * 0.72 + stomp, s * 0.14, s * 0.2);
      ctx.strokeRect(cx + s * 0.06, s * 0.72 + stomp, s * 0.14, s * 0.2);
      // block divisions on legs
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, s * 0.82 + stomp);
      ctx.lineTo(cx - s * 0.06, s * 0.82 + stomp);
      ctx.moveTo(cx + s * 0.06, s * 0.82 + stomp);
      ctx.lineTo(cx + s * 0.2, s * 0.82 + stomp);
      ctx.stroke();

      // --- torso — assembled stone blocks with mortar lines ---
      ctx.save();
      const torsoGrad = ctx.createLinearGradient(0, s * 0.35, 0, s * 0.72);
      torsoGrad.addColorStop(0, rgba(lighten(d.baseColor, 0.15), 1));
      torsoGrad.addColorStop(0.5, rgba(d.baseColor, 1));
      torsoGrad.addColorStop(1, rgba(darken(d.baseColor, 0.3), 1));
      ctx.fillStyle = torsoGrad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22, s * 0.72 + stomp);
      ctx.lineTo(cx - s * 0.18, s * 0.38 + stomp);
      ctx.lineTo(cx + s * 0.18, s * 0.38 + stomp);
      ctx.lineTo(cx + s * 0.22, s * 0.72 + stomp);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.4), 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
      // mortar lines — block divisions
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.5), 0.6);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, s * 0.5 + stomp);
      ctx.lineTo(cx + s * 0.2, s * 0.5 + stomp);
      ctx.moveTo(cx - s * 0.2, s * 0.6 + stomp);
      ctx.lineTo(cx + s * 0.2, s * 0.6 + stomp);
      ctx.moveTo(cx, s * 0.38 + stomp);
      ctx.lineTo(cx, s * 0.72 + stomp);
      ctx.stroke();
      ctx.restore();

      // moss patches on torso
      ctx.fillStyle = rgba(0x3a5a2a, 0.4);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.12, s * 0.65 + stomp, 6, 3, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.1, s * 0.55 + stomp, 5, 2.5, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // cracks
      drawCracks(ctx, cx, s * 0.55 + stomp, s * 0.15, s * 0.2, d.baseColor, 4);

      // runic inscription on chest
      drawRune(ctx, cx, s * 0.52 + stomp, 8, d.eyeColor, 7);

      // --- arms — massive stone forearms ---
      for (const side of [-1, 1]) {
        ctx.save();
        const ax = cx + side * s * 0.22;
        const ay = s * 0.42 + stomp + armRaise;
        ctx.fillStyle = rgba(darken(d.baseColor, 0.1), 1);
        ctx.fillRect(ax - s * 0.07, ay, s * 0.14, s * 0.32);
        ctx.strokeStyle = rgba(darken(d.baseColor, 0.4), 0.8);
        ctx.lineWidth = 2;
        ctx.strokeRect(ax - s * 0.07, ay, s * 0.14, s * 0.32);
        // forearm block division
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax - s * 0.07, ay + s * 0.16);
        ctx.lineTo(ax + s * 0.07, ay + s * 0.16);
        ctx.stroke();
        // fist — large block
        ctx.fillStyle = rgba(d.baseColor, 1);
        ctx.fillRect(ax - s * 0.08, ay + s * 0.3, s * 0.16, s * 0.1);
        ctx.strokeRect(ax - s * 0.08, ay + s * 0.3, s * 0.16, s * 0.1);
        ctx.restore();
      }

      // --- head — carved stone face ---
      ctx.save();
      const headGrad = ctx.createRadialGradient(cx - 4, s * 0.2 + stomp, 0, cx, s * 0.25 + stomp, s * 0.18);
      headGrad.addColorStop(0, rgba(lighten(d.baseColor, 0.2), 1));
      headGrad.addColorStop(0.7, rgba(d.baseColor, 1));
      headGrad.addColorStop(1, rgba(darken(d.baseColor, 0.3), 1));
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.14, s * 0.15 + stomp);
      ctx.lineTo(cx - s * 0.12, s * 0.35 + stomp);
      ctx.lineTo(cx + s * 0.12, s * 0.35 + stomp);
      ctx.lineTo(cx + s * 0.14, s * 0.15 + stomp);
      ctx.lineTo(cx + s * 0.08, s * 0.12 + stomp);
      ctx.lineTo(cx - s * 0.08, s * 0.12 + stomp);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.4), 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // brow ridge
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.4), 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.1, s * 0.22 + stomp);
      ctx.lineTo(cx + s * 0.1, s * 0.22 + stomp);
      ctx.stroke();

      // eyes — glowing crystalline
      radialGradient(ctx, cx - s * 0.06, s * 0.25 + stomp, 10, d.eyeColor, d.eyeColor, 0.5, 0);
      radialGradient(ctx, cx + s * 0.06, s * 0.25 + stomp, 10, d.eyeColor, d.eyeColor, 0.5, 0);
      drawEye(ctx, cx - s * 0.06, s * 0.25 + stomp, 5, d.eyeColor);
      drawEye(ctx, cx + s * 0.06, s * 0.25 + stomp, 5, d.eyeColor);

      // jaw — carved stone mouth
      ctx.fillStyle = rgba(0x000000, 0.5);
      ctx.fillRect(cx - s * 0.08, s * 0.3 + stomp, s * 0.16, 3);
      // individual stone teeth
      ctx.fillStyle = rgba(lighten(d.baseColor, 0.1), 1);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(cx - s * 0.07 + i * s * 0.04, s * 0.3 + stomp, 2, 4);
      }
    },
  },
  // Ash Wyrm — Serpentine dragon with scales, horned head, and tattered wings
  {
    name: "ash-wyrm",
    baseColor: 0x6a3a2a,
    accentColor: 0x8a5a3a,
    eyeColor: 0xff4400,
    radius: 30,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const slither = Math.sin(frame * 2) * 5;

      drawGroundShadow(ctx, cx, groundY, s * 0.4);

      // --- tail — tapering, coiled ---
      ctx.save();
      ctx.strokeStyle = rgba(d.baseColor, 1);
      ctx.lineWidth = s * 0.16;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.05, s * 0.65);
      ctx.bezierCurveTo(
        cx - s * 0.2, s * 0.7 + slither,
        cx - s * 0.35, s * 0.55 - slither,
        cx - s * 0.4, s * 0.45 + slither * 0.5,
      );
      ctx.stroke();
      // tail scales
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.2), 0.5);
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        const tx = cx - s * 0.05 - t * s * 0.35;
        const ty = s * 0.65 + Math.sin(t * 3 + frame * 2) * s * 0.1;
        ctx.beginPath();
        ctx.ellipse(tx, ty, 3, 2, t * 2, 0, Math.PI);
        ctx.stroke();
      }
      ctx.restore();

      // --- body — serpentine with scale texture ---
      ctx.save();
      ctx.strokeStyle = rgba(d.baseColor, 1);
      ctx.lineWidth = s * 0.22;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.05, s * 0.65);
      ctx.bezierCurveTo(
        cx + s * 0.1, s * 0.5 + slither,
        cx + s * 0.25, s * 0.6 - slither,
        cx + s * 0.45, s * 0.45 + slither * 0.5,
      );
      ctx.stroke();
      // belly — lighter underside
      ctx.strokeStyle = rgba(lighten(d.baseColor, 0.25), 0.6);
      ctx.lineWidth = s * 0.08;
      ctx.stroke();
      // scale texture
      drawScales(ctx, cx + s * 0.15, s * 0.52 + slither * 0.3, s * 0.15, s * 0.08, d.baseColor, 5);
      ctx.restore();

      // --- wing — tattered, membranous with visible bones ---
      const wingFlap = Math.sin(frame * 4) * s * 0.08;
      ctx.save();
      ctx.translate(cx + s * 0.2, s * 0.42 + slither);
      const wingGrad = ctx.createLinearGradient(0, 0, -s * 0.15, -s * 0.25);
      wingGrad.addColorStop(0, rgba(darken(d.baseColor, 0.2), 0.7));
      wingGrad.addColorStop(1, rgba(darken(d.baseColor, 0.4), 0.4));
      ctx.fillStyle = wingGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      // wing fingers
      const fingerAngles = [-1.2, -0.8, -0.4, -0.1];
      const fingerLens = [s * 0.22, s * 0.25, s * 0.2, s * 0.12];
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(Math.cos(fingerAngles[i]) * fingerLens[i], Math.sin(fingerAngles[i]) * fingerLens[i] - wingFlap);
      }
      ctx.quadraticCurveTo(-s * 0.05, -s * 0.05, 0, 0);
      ctx.closePath();
      ctx.fill();
      // wing bones
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.5), 0.8);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(fingerAngles[i]) * fingerLens[i], Math.sin(fingerAngles[i]) * fingerLens[i] - wingFlap);
        ctx.stroke();
      }
      // tattered edges
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.3), 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(fingerAngles[1]) * fingerLens[1] * 0.7, Math.sin(fingerAngles[1]) * fingerLens[1] * 0.7 - wingFlap * 0.7);
      ctx.lineTo(Math.cos(fingerAngles[1]) * fingerLens[1] * 0.5, Math.sin(fingerAngles[1]) * fingerLens[1] * 0.5 - wingFlap * 0.5 - 3);
      ctx.stroke();
      ctx.restore();

      // --- head — dragon skull with horns and snout ---
      const hx = cx + s * 0.5;
      const hy = s * 0.42 + slither * 0.5;
      ctx.save();
      const headGrad = ctx.createRadialGradient(hx - 4, hy - 4, 0, hx, hy, s * 0.14);
      headGrad.addColorStop(0, rgba(lighten(d.accentColor, 0.2), 1));
      headGrad.addColorStop(0.6, rgba(d.accentColor, 1));
      headGrad.addColorStop(1, rgba(darken(d.accentColor, 0.3), 1));
      ctx.fillStyle = headGrad;
      // skull shape — wedge
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.1, hy - s * 0.06);
      ctx.quadraticCurveTo(hx + s * 0.05, hy - s * 0.1, hx + s * 0.12, hy);
      ctx.quadraticCurveTo(hx + s * 0.05, hy + s * 0.06, hx - s * 0.08, hy + s * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.4), 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // horns — sweeping back
      ctx.fillStyle = rgba(darken(d.baseColor, 0.3), 1);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.06, hy - s * 0.06);
      ctx.quadraticCurveTo(hx - s * 0.12, hy - s * 0.18, hx - s * 0.08, hy - s * 0.22);
      ctx.quadraticCurveTo(hx - s * 0.04, hy - s * 0.12, hx - s * 0.02, hy - s * 0.04);
      ctx.closePath();
      ctx.fill();
      // horn ridges
      ctx.strokeStyle = rgba(0x000000, 0.4);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(hx - s * 0.05 + i, hy - s * 0.08 - i * 3);
        ctx.lineTo(hx - s * 0.09 + i, hy - s * 0.15 - i * 3);
        ctx.stroke();
      }

      // nostril
      ctx.beginPath();
      ctx.ellipse(hx + s * 0.1, hy, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0x000000, 0.7);
      ctx.fill();
      // smoke from nostril
      if (frame !== 0) {
        ctx.beginPath();
        ctx.arc(hx + s * 0.12, hy - 3, 2 + frame, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0x888888, 0.3);
        ctx.fill();
      }

      // eye — slit pupil, fierce
      drawEye(ctx, hx - s * 0.02, hy - s * 0.02, 4, d.eyeColor);

      // teeth — fangs
      ctx.fillStyle = rgba(0xeeeedd, 0.9);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(hx + s * 0.02 + i * 3, hy + s * 0.04);
        ctx.lineTo(hx + s * 0.03 + i * 3, hy + s * 0.08);
        ctx.lineTo(hx + s * 0.04 + i * 3, hy + s * 0.04);
        ctx.fill();
      }

      // ash particles drifting
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * s * 0.35;
        const px = cx + Math.cos(a) * r;
        const py = s * 0.5 + Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(px, py, 0.8 + Math.random(), 0, Math.PI * 2);
        ctx.fillStyle = rgba(0x999999, 0.3 + Math.random() * 0.2);
        ctx.fill();
      }
    },
  },
  // Void Leviathan — Cosmic horror with writhing tentacles, many eyes, and reality distortion
  {
    name: "void-leviathan",
    baseColor: 0x1a0a2a,
    accentColor: 0x3a1a4a,
    eyeColor: 0xaa00ff,
    radius: 42,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const pulse = Math.sin(frame * 2) * 4;

      // --- void distortion aura ---
      radialGradient(ctx, cx, s * 0.5, s * 0.48, d.eyeColor, 0x000000, 0.12, 0);
      // outer ring of dark energy
      ctx.save();
      ctx.strokeStyle = rgba(d.eyeColor, 0.15);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, s * 0.5, s * (0.35 + i * 0.05) + pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // --- tentacles — thick, writhing with suckers ---
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const wave = Math.sin(frame * 2 + i) * 8;
        const baseR = s * 0.12;
        const tipR = s * 0.4 + wave;
        const tx = cx + Math.cos(angle) * baseR;
        const ty = s * 0.5 + Math.sin(angle) * baseR;
        const ex = cx + Math.cos(angle) * tipR;
        const ey = s * 0.5 + Math.sin(angle) * tipR;

        // tentacle body — tapered with gradient
        ctx.save();
        const tentGrad = ctx.createLinearGradient(tx, ty, ex, ey);
        tentGrad.addColorStop(0, rgba(d.baseColor, 0.95));
        tentGrad.addColorStop(0.7, rgba(d.accentColor, 0.85));
        tentGrad.addColorStop(1, rgba(darken(d.baseColor, 0.3), 0.7));
        ctx.strokeStyle = tentGrad;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(
          (tx + ex) / 2 + Math.cos(angle + Math.PI / 2) * 12,
          (ty + ey) / 2 + Math.sin(angle + Math.PI / 2) * 12,
          ex, ey,
        );
        ctx.stroke();
        ctx.restore();

        // suckers along tentacle
        for (let j = 0; j < 3; j++) {
          const t = (j + 1) / 4;
          const sx = tx + (ex - tx) * t + Math.cos(angle + Math.PI / 2) * 12 * t * (1 - t) * 2;
          const sy = ty + (ey - ty) * t + Math.sin(angle + Math.PI / 2) * 12 * t * (1 - t) * 2;
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI * 2);
          ctx.fillStyle = rgba(darken(d.accentColor, 0.3), 0.8);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx, sy, 1, 0, Math.PI * 2);
          ctx.fillStyle = rgba(0x000000, 0.6);
          ctx.fill();
        }

        // tentacle tip — glowing
        radialGradient(ctx, ex, ey, 4, d.eyeColor, d.eyeColor, 0.5, 0);
      }

      // --- central body — pulsing mass ---
      ctx.save();
      const bodyGrad = ctx.createRadialGradient(cx - 5, s * 0.45, 0, cx, s * 0.5, s * 0.22 + pulse);
      bodyGrad.addColorStop(0, rgba(lighten(d.accentColor, 0.2), 0.95));
      bodyGrad.addColorStop(0.5, rgba(d.baseColor, 0.95));
      bodyGrad.addColorStop(1, rgba(0x000000, 0.9));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      // organic amorphous shape
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = (s * 0.18 + pulse) * (0.9 + Math.sin(i * 2.3 + frame) * 0.15);
        const px = cx + Math.cos(a) * r;
        const py = s * 0.5 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // --- many eyes — clustered, watching ---
      const eyePositions: [number, number, number][] = [
        [0.42, 0.42, 4], [0.58, 0.42, 4], [0.5, 0.36, 3],
        [0.38, 0.5, 3], [0.62, 0.5, 3],
        [0.44, 0.56, 2.5], [0.56, 0.56, 2.5], [0.5, 0.5, 3.5],
        [0.46, 0.46, 2], [0.54, 0.46, 2],
      ];
      for (const [ex, ey, er] of eyePositions) {
        drawEye(ctx, s * ex, s * ey, er, d.eyeColor);
      }

      // --- void shards floating around ---
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frame * 0.3;
        const r = s * 0.38 + Math.sin(frame + i) * 5;
        const px = cx + Math.cos(a) * r;
        const py = s * 0.5 + Math.sin(a) * r * 0.7;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a + frame * 0.5);
        ctx.fillStyle = rgba(d.eyeColor, 0.4);
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(3, 0);
        ctx.lineTo(0, 4);
        ctx.lineTo(-3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
  },
  // Infernal Sovereign — Demon king with crown of fire, armored body, and glowing chest core
  {
    name: "infernal-sovereign",
    baseColor: 0x2a0a0a,
    accentColor: 0x4a1a1a,
    eyeColor: 0xffff44,
    radius: 48,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const menace = Math.sin(frame * 1.5) * 3;
      const armRaise = frame === 3 ? -12 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.45);

      // --- fire aura ---
      radialGradient(ctx, cx, s * 0.5, s * 0.48, 0xff6600, 0x000000, 0.15, 0);

      // --- legs — armored, hoofed ---
      drawLimb(ctx, cx - s * 0.1, s * 0.7 + menace, cx - s * 0.12, groundY, 8, 5, d.baseColor);
      drawLimb(ctx, cx + s * 0.1, s * 0.7 + menace, cx + s * 0.12, groundY, 8, 5, d.baseColor);
      // hooves
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + side * s * 0.12, groundY, 6, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0x000000, 0.9);
        ctx.fill();
      }

      // --- body — armored torso with plates ---
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, s * 0.38, 0, s * 0.72);
      bodyGrad.addColorStop(0, rgba(lighten(d.accentColor, 0.15), 1));
      bodyGrad.addColorStop(0.5, rgba(d.baseColor, 1));
      bodyGrad.addColorStop(1, rgba(darken(d.baseColor, 0.3), 1));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08, s * 0.4 + menace);
      ctx.lineTo(cx - s * 0.2, s * 0.55 + menace);
      ctx.lineTo(cx - s * 0.18, s * 0.72 + menace);
      ctx.lineTo(cx + s * 0.18, s * 0.72 + menace);
      ctx.lineTo(cx + s * 0.2, s * 0.55 + menace);
      ctx.lineTo(cx + s * 0.08, s * 0.4 + menace);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.5), 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // armor plates — overlapping scales
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.4), 0.7);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const py = s * 0.48 + i * s * 0.08 + menace;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.16, py);
        ctx.quadraticCurveTo(cx, py + 3, cx + s * 0.16, py);
        ctx.stroke();
      }

      // chest — glowing magma core
      radialGradient(ctx, cx, s * 0.58 + menace, 10, 0xffaa00, 0xff0000, 0.7, 0);
      ctx.beginPath();
      ctx.arc(cx, s * 0.58 + menace, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0xffdd44, 0.8);
      ctx.fill();
      // core cracks radiating
      ctx.strokeStyle = rgba(0xff6600, 0.6);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, s * 0.58 + menace);
        ctx.lineTo(cx + Math.cos(a) * 10, s * 0.58 + menace + Math.sin(a) * 10);
        ctx.stroke();
      }

      // --- arms — muscular with spaulders ---
      for (const side of [-1, 1]) {
        const ax = cx + side * s * 0.22;
        const ay = s * 0.45 + menace + armRaise;
        // shoulder armor — spiked
        ctx.fillStyle = rgba(darken(d.accentColor, 0.2), 1);
        ctx.beginPath();
        ctx.arc(ax, ay, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(darken(d.baseColor, 0.5), 0.8);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // shoulder spike
        ctx.fillStyle = rgba(0x000000, 0.8);
        ctx.beginPath();
        ctx.moveTo(ax + side * 5, ay - 3);
        ctx.lineTo(ax + side * 10, ay - 8);
        ctx.lineTo(ax + side * 4, ay - 2);
        ctx.closePath();
        ctx.fill();

        // arm
        drawLimb(ctx, ax, ay + 4, ax + side * 3, s * 0.72 + menace, 6, 4, d.baseColor);

        // clawed hand
        const hy = s * 0.72 + menace;
        ctx.fillStyle = rgba(0x000000, 0.9);
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(ax + side * 3 + i * 2 - 3, hy);
          ctx.lineTo(ax + side * 3 + i * 2 - 2, hy + 6);
          ctx.lineTo(ax + side * 3 + i * 2 - 1, hy);
          ctx.fill();
        }
      }

      // --- head — horned demon face ---
      const hx = cx;
      const hy = s * 0.3 + menace;
      ctx.save();
      const headGrad = ctx.createRadialGradient(hx - 3, hy - 4, 0, hx, hy, s * 0.14);
      headGrad.addColorStop(0, rgba(lighten(d.accentColor, 0.2), 1));
      headGrad.addColorStop(0.6, rgba(d.accentColor, 1));
      headGrad.addColorStop(1, rgba(darken(d.accentColor, 0.3), 1));
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(hx, hy, s * 0.12, s * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.5), 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // horns — massive, sweeping, ridged
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.fillStyle = rgba(0x000000, 0.85);
        ctx.beginPath();
        ctx.moveTo(hx + side * s * 0.08, hy - s * 0.06);
        ctx.quadraticCurveTo(hx + side * s * 0.22, hy - s * 0.12, hx + side * s * 0.28, hy - s * 0.05);
        ctx.quadraticCurveTo(hx + side * s * 0.2, hy - s * 0.02, hx + side * s * 0.06, hy);
        ctx.closePath();
        ctx.fill();
        // horn ridges
        ctx.strokeStyle = rgba(darken(d.accentColor, 0.5), 0.6);
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(hx + side * (s * 0.1 + i * s * 0.04), hy - s * 0.04 - i * 2);
          ctx.lineTo(hx + side * (s * 0.12 + i * s * 0.04), hy - s * 0.08 - i * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // crown of fire — animated flames above horns
      for (let i = 0; i < 7; i++) {
        const fx = hx - s * 0.16 + i * s * 0.05;
        const fh = s * 0.1 + Math.sin(i + frame * 3) * s * 0.04;
        const grad = ctx.createLinearGradient(0, hy - s * 0.12 - fh + menace, 0, hy - s * 0.08 + menace);
        grad.addColorStop(0, rgba(0xffff00, 0));
        grad.addColorStop(0.3, rgba(0xff8800, 0.7));
        grad.addColorStop(0.7, rgba(0xff3300, 0.9));
        grad.addColorStop(1, rgba(0xff0000, 1));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(fx - 4, hy - s * 0.08 + menace);
        ctx.lineTo(fx, hy - s * 0.08 - fh + menace);
        ctx.lineTo(fx + 4, hy - s * 0.08 + menace);
        ctx.closePath();
        ctx.fill();
      }

      // eyes — blazing with power
      drawEye(ctx, hx - s * 0.05, hy, 5, d.eyeColor);
      drawEye(ctx, hx + s * 0.05, hy, 5, d.eyeColor);

      // mouth — jagged fangs
      ctx.fillStyle = rgba(0x000000, 0.7);
      ctx.fillRect(hx - s * 0.06, hy + s * 0.06, s * 0.12, 4);
      ctx.fillStyle = rgba(0xeeeedd, 0.9);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(hx - s * 0.05 + i * s * 0.03, hy + s * 0.06, 2, 4);
      }
    },
  },
];

// ============================================================
// PROJECTILE & EFFECT TEXTURES
// ============================================================

/** Generate a stone projectile texture with shading. */
function drawStoneTexture(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  // main body
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  grad.addColorStop(0, rgba(0xaaaab0, 1));
  grad.addColorStop(0.6, rgba(0x888890, 1));
  grad.addColorStop(1, rgba(0x444450, 1));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // outline
  ctx.strokeStyle = rgba(0x333338, 0.8);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // cracks
  ctx.strokeStyle = rgba(0x555558, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy);
  ctx.lineTo(cx + r * 0.3, cy - r * 0.3);
  ctx.moveTo(cx, cy + r * 0.5);
  ctx.lineTo(cx + r * 0.4, cy + r * 0.2);
  ctx.stroke();
}

// ============================================================
// MAIN TEXTURE GENERATION ENTRY POINT
// ============================================================

const CREATURE_FRAMES = 4; // idle, walk1, walk2, attack
const BEAST_FRAMES = 4; // idle, move1, move2, attack
const TEX_SIZE = 96;

/**
 * Generate all procedural textures and register them with the Phaser texture manager.
 * Call once during scene preload().
 */
export function generateAllTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;

  // --- Creature spritesheets ---
  for (let i = 0; i < CREATURE_DESIGNS.length; i++) {
    const design = CREATURE_DESIGNS[i];
    const key = `creature-${design.name}`;
    if (tex.exists(key)) continue;

    const sheetW = TEX_SIZE * CREATURE_FRAMES;
    const sheetH = TEX_SIZE;
    const canvasTex = createCanvasTexture(tex, key, sheetW, sheetH);
    const ctx = canvasTex.getContext();

    for (let f = 0; f < CREATURE_FRAMES; f++) {
      ctx.save();
      ctx.translate(f * TEX_SIZE, 0);
      design.draw(ctx, f, TEX_SIZE, design);
      ctx.restore();
    }
    canvasTex.refresh();
    registerFrames(tex.get(key)!, CREATURE_FRAMES, TEX_SIZE);
  }

  // --- Beast spritesheets ---
  for (let i = 0; i < BEAST_DESIGNS.length; i++) {
    const design = BEAST_DESIGNS[i];
    const key = `beast-${design.name}`;
    if (tex.exists(key)) continue;

    const sheetW = TEX_SIZE * BEAST_FRAMES;
    const sheetH = TEX_SIZE;
    const canvasTex = createCanvasTexture(tex, key, sheetW, sheetH);
    const ctx = canvasTex.getContext();

    for (let f = 0; f < BEAST_FRAMES; f++) {
      ctx.save();
      ctx.translate(f * TEX_SIZE, 0);
      design.draw(ctx, f, TEX_SIZE, design);
      ctx.restore();
    }
    canvasTex.refresh();
    registerFrames(tex.get(key)!, BEAST_FRAMES, TEX_SIZE);
  }

  // --- Stone projectile ---
  if (!tex.exists("stone-proj")) {
    const canvasTex = createCanvasTexture(tex, "stone-proj", 24, 24);
    drawStoneTexture(canvasTex.getContext(), 24);
    canvasTex.refresh();
  }

  // --- Spark particle ---
  if (!tex.exists("spark")) {
    const canvasTex = createCanvasTexture(tex, "spark", 16, 16);
    const ctx = canvasTex.getContext();
    radialGradient(ctx, 8, 8, 8, 0xffffff, 0xffffff, 1, 0);
    canvasTex.refresh();
  }

  // --- Dust particle ---
  if (!tex.exists("dust")) {
    const canvasTex = createCanvasTexture(tex, "dust", 16, 16);
    const ctx = canvasTex.getContext();
    radialGradient(ctx, 8, 8, 7, 0xccccaa, 0x886644, 0.6, 0);
    canvasTex.refresh();
  }

  // --- Shockwave ring ---
  if (!tex.exists("shockwave")) {
    const canvasTex = createCanvasTexture(tex, "shockwave", 64, 64);
    const ctx = canvasTex.getContext();
    ctx.strokeStyle = rgba(0xffffff, 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(0xffffff, 0.3);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();
    canvasTex.refresh();
  }

  // --- Recruit beam ---
  if (!tex.exists("recruit-beam")) {
    const canvasTex = createCanvasTexture(tex, "recruit-beam", 32, 96);
    const ctx = canvasTex.getContext();
    const grad = ctx.createLinearGradient(16, 0, 16, 96);
    grad.addColorStop(0, rgba(0x4cb866, 0));
    grad.addColorStop(0.5, rgba(0x4cb866, 0.6));
    grad.addColorStop(1, rgba(0x88ffaa, 0.9));
    ctx.fillStyle = grad;
    ctx.fillRect(10, 0, 12, 96);
    // sparkle
    radialGradient(ctx, 16, 48, 16, 0x88ffaa, 0x4cb866, 0.4, 0);
    canvasTex.refresh();
  }

  // --- Soft glow (for light sources) ---
  if (!tex.exists("soft-glow")) {
    const canvasTex = createCanvasTexture(tex, "soft-glow", 128, 128);
    const ctx = canvasTex.getContext();
    radialGradient(ctx, 64, 64, 64, 0xffffff, 0x000000, 0.5, 0);
    canvasTex.refresh();
  }

  // --- Fire glow ---
  if (!tex.exists("fire-glow")) {
    const canvasTex = createCanvasTexture(tex, "fire-glow", 128, 128);
    const ctx = canvasTex.getContext();
    radialGradient(ctx, 64, 64, 64, 0xff6600, 0xff0000, 0.4, 0);
    canvasTex.refresh();
  }

  // --- Void glow ---
  if (!tex.exists("void-glow")) {
    const canvasTex = createCanvasTexture(tex, "void-glow", 128, 128);
    const ctx = canvasTex.getContext();
    radialGradient(ctx, 64, 64, 64, 0xaa00ff, 0x000000, 0.3, 0);
    canvasTex.refresh();
  }

  // --- Ice crystal glow ---
  if (!tex.exists("crystal-glow")) {
    const canvasTex = createCanvasTexture(tex, "crystal-glow", 128, 128);
    const ctx = canvasTex.getContext();
    radialGradient(ctx, 64, 64, 64, 0x44aaff, 0x000033, 0.3, 0);
    canvasTex.refresh();
  }
}

/** Get the creature texture key for a hostility level. */
export function creatureKey(hostility: number): string {
  const idx = Math.min(hostility, CREATURE_DESIGNS.length - 1);
  return `creature-${CREATURE_DESIGNS[idx].name}`;
}

/** Get the creature design for a hostility level. */
export function creatureDesign(hostility: number): CreatureDesign {
  return CREATURE_DESIGNS[Math.min(hostility, CREATURE_DESIGNS.length - 1)];
}

/** Get the beast texture key by beast name. */
export function beastKey(name: string): string {
  const design = BEAST_DESIGNS.find((d) => d.name === name);
  if (design) return `beast-${design.name}`;
  // fallback: normalize name to design index
  const normalized = name.toLowerCase().replace(/\s+/g, "-");
  return `beast-${normalized}`;
}

/** Get the beast design by name. */
export function beastDesign(name: string): BeastDesign | undefined {
  return BEAST_DESIGNS.find((d) => d.name === name);
}

/** Map beast names from BEASTS array to design names. */
export function beastDesignName(beastName: string): string {
  const map: Record<string, string> = {
    "Groveheart": "groveheart",
    "Stone Colossus": "stone-colossus",
    "Ash Wyrm": "ash-wyrm",
    "Void Leviathan": "void-leviathan",
    "Infernal Sovereign": "infernal-sovereign",
  };
  return map[beastName] ?? "groveheart";
}

export const CREATURE_FRAME_COUNT = CREATURE_FRAMES;
export const BEAST_FRAME_COUNT = BEAST_FRAMES;
