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
import { AI_ITEM_TEXTURES, AI_CREATURE_TEXTURES } from "./ai-tiles";

export const SPRITE_SCALE = 1; // no pixel-art upscaling — smooth rendering

type RGB = { r: number; g: number; b: number };

/** Check if an AI-generated texture exists for a procedural item key, return AI key or null. */
function aiItemKey(tex: Phaser.Textures.TextureManager, procKey: string): string | null {
  const aiKey = AI_ITEM_TEXTURES[procKey];
  if (aiKey && tex.exists(aiKey)) return aiKey;
  return null;
}

/** Check if AI-generated per-frame textures exist for a creature spritesheet key, return array of keys or null. */
function aiCreatureKey(tex: Phaser.Textures.TextureManager, procKey: string): string[] | null {
  const aiKeys = AI_CREATURE_TEXTURES[procKey];
  if (aiKeys && aiKeys.every((k) => tex.exists(k))) return aiKeys;
  return null;
}

/**
 * Build a spritesheet from per-frame AI sprites by drawing each into its frame slot.
 * Each frame contains a distinct image (idle, walk1, walk2, attack) for animation.
 */
function buildAiSpritesheet(
  tex: Phaser.Textures.TextureManager,
  sheetKey: string,
  aiKeys: string[],
  frameCount: number,
  frameSize: number,
): void {
  if (tex.exists(sheetKey)) return;
  const canvasTex = createCanvasTexture(tex, sheetKey, frameSize * frameCount, frameSize);
  const ctx = canvasTex.getContext();
  for (let f = 0; f < frameCount; f++) {
    const sourceImg = tex.get(aiKeys[f]).getSourceImage() as HTMLImageElement;
    ctx.drawImage(sourceImg, f * frameSize, 0, frameSize, frameSize);
  }
  canvasTex.refresh();
  registerFrames(tex.get(sheetKey)!, frameCount, frameSize);
}

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

/** Draw a soft drop shadow beneath a creature. */
function drawGroundShadow(ctx: CanvasRenderingContext2D, cx: number, groundY: number, width: number): void {
  ctx.save();
  ctx.filter = "blur(3px)";
  const grad = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, width * 1.2);
  grad.addColorStop(0, rgba(0x000000, 0.3));
  grad.addColorStop(0.5, rgba(0x000000, 0.15));
  grad.addColorStop(1, rgba(0x000000, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, groundY, width * 1.2, width * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
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
  // Slug — slow garden pest, drops slug_slime
  {
    name: "slug",
    baseColor: 0x6a8a4a,
    accentColor: 0x8aaa6a,
    eyeColor: 0x222222,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.82;
      const squish = frame === 1 ? 0.9 : frame === 2 ? 1.1 : frame === 3 ? 0.8 : 1;
      const stretch = frame === 1 ? 1.1 : frame === 2 ? 0.95 : 1;

      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      // slime trail behind slug
      ctx.save();
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.3), 0.25);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.25, groundY - 2, s * 0.2, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.15, groundY - 1, s * 0.15, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // body — elongated oval, semi-glossy
      ctx.save();
      const bodyW = s * 0.4 * stretch;
      const bodyH = s * 0.22 * squish;
      const bodyY = s * 0.6;
      const grad = ctx.createRadialGradient(cx - 4, bodyY - 4, 2, cx, bodyY, bodyW);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.3), 0.95));
      grad.addColorStop(0.6, rgba(c.baseColor, 0.9));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.25), 0.95));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, bodyY, bodyW, bodyH, 0, 0, Math.PI * 2);
      ctx.fill();

      // glossy highlight on top
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.08, bodyY - bodyH * 0.5, s * 0.12, s * 0.04, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0xffffff, 0.3);
      ctx.fill();

      // mantle — raised bump on the back (head area)
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.1, bodyY - bodyH * 0.3, s * 0.14, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.15), 0.9);
      ctx.fill();

      // eyestalks — two thin stalks with eyes on top
      const stalkWave = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? 5 : 0;
      const stalkBaseX = cx + s * 0.18;
      const stalkBaseY = bodyY - bodyH * 0.3;
      // left stalk
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(stalkBaseX - 4, stalkBaseY);
      ctx.quadraticCurveTo(stalkBaseX - 5, stalkBaseY - s * 0.12 + stalkWave, stalkBaseX - 4, stalkBaseY - s * 0.15 + stalkWave);
      ctx.stroke();
      // right stalk
      ctx.beginPath();
      ctx.moveTo(stalkBaseX + 4, stalkBaseY);
      ctx.quadraticCurveTo(stalkBaseX + 5, stalkBaseY - s * 0.12 - stalkWave, stalkBaseX + 4, stalkBaseY - s * 0.15 - stalkWave);
      ctx.stroke();
      // eyes — dark dots on stalks
      ctx.fillStyle = rgba(c.eyeColor, 1);
      ctx.beginPath();
      ctx.arc(stalkBaseX - 4, stalkBaseY - s * 0.15 + stalkWave, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(stalkBaseX + 4, stalkBaseY - s * 0.15 - stalkWave, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // eye shine
      ctx.fillStyle = rgba(0xffffff, 0.6);
      ctx.beginPath();
      ctx.arc(stalkBaseX - 3.5, stalkBaseY - s * 0.15 + stalkWave - 0.5, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(stalkBaseX + 4.5, stalkBaseY - s * 0.15 - stalkWave - 0.5, 0.8, 0, Math.PI * 2);
      ctx.fill();

      // attack frame — rearing up, mouth open
      if (frame === 3) {
        ctx.beginPath();
        ctx.arc(stalkBaseX, stalkBaseY + 2, s * 0.04, 0, Math.PI);
        ctx.fillStyle = rgba(0x441111, 0.8);
        ctx.fill();
      }

      ctx.restore();
    },
  },
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
// FRIENDLY CREATURE SPRITES — 4 cute types, 4 frames each (idle, walk1, walk2, hop)
// ============================================================

interface FriendlyDesign {
  name: string;
  baseColor: number;
  accentColor: number;
  eyeColor: number;
  size: number;
  draw: (ctx: CanvasRenderingContext2D, frame: number, size: number, colors: FriendlyDesign) => void;
}

const FRIENDLY_DESIGNS: FriendlyDesign[] = [
  // Unicorn — white horse body with golden horn and pastel rainbow mane
  {
    name: "unicorn",
    baseColor: 0xfefefe,
    accentColor: 0xffccff,
    eyeColor: 0x6644aa,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const legPhase = frame === 1 ? 4 : frame === 2 ? -4 : frame === 3 ? -8 : 0;
      const hop = frame === 3 ? -6 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.4);

      // legs — 4 slender horse legs
      drawLimb(ctx, cx - s * 0.15, s * 0.55 + hop, cx - s * 0.18 + legPhase, groundY - 2, 4, 2.5, darken(c.baseColor, 0.1));
      drawLimb(ctx, cx + s * 0.12, s * 0.55 + hop, cx + s * 0.15 - legPhase, groundY - 2, 4, 2.5, darken(c.baseColor, 0.1));
      drawLimb(ctx, cx - s * 0.05, s * 0.55 + hop, cx - s * 0.02 + legPhase, groundY - 2, 4, 2.5, c.baseColor);
      drawLimb(ctx, cx + s * 0.22, s * 0.55 + hop, cx + s * 0.25 - legPhase, groundY - 2, 4, 2.5, c.baseColor);

      // body — horse torso, elongated and slim
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, s * 0.4 + hop, 0, s * 0.56 + hop);
      bodyGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.05), 1));
      bodyGrad.addColorStop(0.5, rgba(c.baseColor, 1));
      bodyGrad.addColorStop(1, rgba(darken(c.baseColor, 0.12), 1));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.5 + hop, s * 0.34, s * 0.11, -0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // tail — flowing rainbow strands
      ctx.save();
      ctx.lineCap = "round";
      const tailColors = [0xff9999, 0xffcc99, 0xccffcc, 0xccccff, 0xffccff];
      for (let i = 0; i < tailColors.length; i++) {
        ctx.strokeStyle = rgba(tailColors[i], 0.7);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.28, s * 0.48 + hop);
        ctx.quadraticCurveTo(cx - s * 0.4, s * 0.42 + hop + i * 1.5, cx - s * 0.38 + legPhase * 0.3, s * 0.3 + hop + i * 2);
        ctx.stroke();
      }
      ctx.restore();

      // neck — connects body to head, angled forward like a real horse
      ctx.save();
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.08, s * 0.45 + hop);
      ctx.quadraticCurveTo(cx + s * 0.18, s * 0.36 + hop, cx + s * 0.26, s * 0.34 + hop);
      ctx.lineTo(cx + s * 0.32, s * 0.4 + hop);
      ctx.quadraticCurveTo(cx + s * 0.22, s * 0.46 + hop, cx + s * 0.12, s * 0.52 + hop);
      ctx.closePath();
      ctx.fill();
      // neck shading
      ctx.fillStyle = rgba(darken(c.baseColor, 0.08), 0.5);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.08, s * 0.45 + hop);
      ctx.quadraticCurveTo(cx + s * 0.18, s * 0.36 + hop, cx + s * 0.26, s * 0.34 + hop);
      ctx.lineTo(cx + s * 0.22, s * 0.37 + hop);
      ctx.quadraticCurveTo(cx + s * 0.14, s * 0.4 + hop, cx + s * 0.1, s * 0.48 + hop);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // head — horse-shaped: longer muzzle, rounded forehead, proper proportions
      const hx = cx + s * 0.3;
      const hy = s * 0.33 + hop;
      ctx.save();
      const headGrad = ctx.createLinearGradient(hx, hy - s * 0.08, hx, hy + s * 0.08);
      headGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.08), 1));
      headGrad.addColorStop(0.6, rgba(c.baseColor, 1));
      headGrad.addColorStop(1, rgba(darken(c.baseColor, 0.08), 1));
      ctx.fillStyle = headGrad;
      // horse head shape — rounded poll (forehead) flowing into tapered muzzle
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.04, hy - s * 0.06);
      ctx.quadraticCurveTo(hx + s * 0.02, hy - s * 0.1, hx + s * 0.08, hy - s * 0.07);
      ctx.quadraticCurveTo(hx + s * 0.14, hy - s * 0.03, hx + s * 0.16, hy + s * 0.02);
      ctx.quadraticCurveTo(hx + s * 0.18, hy + s * 0.06, hx + s * 0.14, hy + s * 0.08);
      ctx.quadraticCurveTo(hx + s * 0.08, hy + s * 0.09, hx + s * 0.02, hy + s * 0.07);
      ctx.quadraticCurveTo(hx - s * 0.02, hy + s * 0.04, hx - s * 0.04, hy - s * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // nostril — small dark dot on muzzle
      ctx.fillStyle = rgba(darken(c.baseColor, 0.3), 0.5);
      ctx.beginPath();
      ctx.arc(hx + s * 0.12, hy + s * 0.05, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // mouth — gentle smile line
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx + s * 0.1, hy + s * 0.07, s * 0.03, 0.3, Math.PI - 0.3);
      ctx.stroke();

      // ears — horse ears: curved cones, not sharp triangles
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.02, hy - s * 0.07);
      ctx.quadraticCurveTo(hx - s * 0.04, hy - s * 0.14, hx - s * 0.01, hy - s * 0.12);
      ctx.quadraticCurveTo(hx + s * 0.01, hy - s * 0.1, hx + s * 0.02, hy - s * 0.07);
      ctx.fill();
      // ear inner
      ctx.fillStyle = rgba(c.accentColor, 0.5);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.01, hy - s * 0.08);
      ctx.quadraticCurveTo(hx - s * 0.02, hy - s * 0.12, hx, hy - s * 0.11);
      ctx.quadraticCurveTo(hx + s * 0.005, hy - s * 0.09, hx + s * 0.005, hy - s * 0.08);
      ctx.fill();
      // second ear (far side, slightly offset)
      ctx.fillStyle = rgba(darken(c.baseColor, 0.06), 1);
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.04, hy - s * 0.06);
      ctx.quadraticCurveTo(hx + s * 0.03, hy - s * 0.12, hx + s * 0.07, hy - s * 0.1);
      ctx.quadraticCurveTo(hx + s * 0.08, hy - s * 0.08, hx + s * 0.06, hy - s * 0.06);
      ctx.fill();

      // horn — golden, rising from forehead between the ears
      ctx.save();
      ctx.strokeStyle = rgba(0xffdd44, 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.02, hy - s * 0.1);
      ctx.lineTo(hx + s * 0.05, hy - s * 0.24);
      ctx.stroke();
      // spiral ridges
      ctx.strokeStyle = rgba(0xffaa00, 0.6);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        ctx.beginPath();
        ctx.moveTo(hx + s * 0.02 + (s * 0.03) * t, hy - s * 0.1 - (s * 0.14) * t);
        ctx.lineTo(hx + s * 0.04 + (s * 0.02) * t, hy - s * 0.11 - (s * 0.14) * t);
        ctx.stroke();
      }
      // horn shine
      ctx.fillStyle = rgba(0xffffaa, 0.5);
      ctx.beginPath();
      ctx.arc(hx + s * 0.035, hy - s * 0.2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // mane — pastel rainbow flowing down the neck
      ctx.save();
      const maneColors = [0xffb3ff, 0xb3ddff, 0xb3ffb3, 0xffddb3];
      for (let i = 0; i < maneColors.length; i++) {
        ctx.fillStyle = rgba(maneColors[i], 0.75);
        ctx.beginPath();
        ctx.ellipse(cx + s * 0.14 - i * s * 0.02, s * 0.38 + hop + i * s * 0.025, s * 0.04, s * 0.025, 0.5 + i * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      // forelock — small tuft between ears
      ctx.fillStyle = rgba(maneColors[0], 0.7);
      ctx.beginPath();
      ctx.ellipse(hx + s * 0.01, hy - s * 0.08, s * 0.03, s * 0.02, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // eye — simple cute dot (no glowing pupil, just a warm eye with sparkle)
      ctx.fillStyle = rgba(c.eyeColor, 1);
      ctx.beginPath();
      ctx.arc(hx + s * 0.05, hy + s * 0.01, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(0x000000, 0.5);
      ctx.beginPath();
      ctx.arc(hx + s * 0.05, hy + s * 0.01, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // eye sparkle
      ctx.fillStyle = rgba(0xffffff, 0.9);
      ctx.beginPath();
      ctx.arc(hx + s * 0.055, hy + s * 0.003, 0.8, 0, Math.PI * 2);
      ctx.fill();

      // sparkles around unicorn
      if (frame === 0 || frame === 3) {
        for (let i = 0; i < 3; i++) {
          const sa = (i / 3) * Math.PI * 2 + frame * 0.5;
          const sr = s * 0.35;
          ctx.fillStyle = rgba(0xffffaa, 0.6);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(sa) * sr, s * 0.4 + hop + Math.sin(sa) * sr * 0.5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  // Fairy Bunny — fluffy round bunny with tiny wings and sparkle trail
  {
    name: "fairy-bunny",
    baseColor: 0xfff5ee,
    accentColor: 0xffb3d9,
    eyeColor: 0x66ddaa,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const hop = frame === 3 ? -10 : frame === 1 ? -2 : 0;
      const earWiggle = frame === 1 ? 2 : frame === 2 ? -2 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      // tiny wings — translucent fairy wings
      ctx.save();
      const wingFlap = frame === 1 ? 6 : frame === 2 ? -4 : frame === 3 ? 8 : 2;
      ctx.fillStyle = rgba(c.accentColor, 0.35);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.2, s * 0.42 + hop, s * 0.12, s * 0.08, -0.3 + wingFlap * 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.2, s * 0.42 + hop, s * 0.12, s * 0.08, 0.3 - wingFlap * 0.02, 0, Math.PI * 2);
      ctx.fill();
      // wing shimmer
      ctx.strokeStyle = rgba(0xffffff, 0.4);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.2, s * 0.42 + hop, s * 0.12, s * 0.08, -0.3 + wingFlap * 0.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.2, s * 0.42 + hop, s * 0.12, s * 0.08, 0.3 - wingFlap * 0.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // body — round and fluffy
      ctx.save();
      const bodyGrad = ctx.createRadialGradient(cx - 4, s * 0.55 + hop, 2, cx, s * 0.6 + hop, s * 0.3);
      bodyGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.08), 1));
      bodyGrad.addColorStop(0.7, rgba(c.baseColor, 1));
      bodyGrad.addColorStop(1, rgba(darken(c.baseColor, 0.1), 1));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.62 + hop, s * 0.22, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // feet — small round paws
      ctx.fillStyle = rgba(darken(c.baseColor, 0.08), 1);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.1, groundY - 3, s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.1, groundY - 3, s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();

      // head — round
      const hy = s * 0.42 + hop;
      ctx.save();
      const headGrad = ctx.createRadialGradient(cx - 3, hy - 3, 0, cx, hy, s * 0.18);
      headGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.1), 1));
      headGrad.addColorStop(0.7, rgba(c.baseColor, 1));
      headGrad.addColorStop(1, rgba(darken(c.baseColor, 0.08), 1));
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(cx, hy, s * 0.16, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ears — long and floppy with pink inner
      ctx.save();
      ctx.fillStyle = rgba(c.baseColor, 1);
      // left ear
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.08 + earWiggle, hy - s * 0.18, s * 0.04, s * 0.12, -0.1 + earWiggle * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(c.accentColor, 0.6);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.08 + earWiggle, hy - s * 0.18, s * 0.02, s * 0.08, -0.1 + earWiggle * 0.03, 0, Math.PI * 2);
      ctx.fill();
      // right ear
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.08 - earWiggle, hy - s * 0.18, s * 0.04, s * 0.12, 0.1 - earWiggle * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(c.accentColor, 0.6);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.08 - earWiggle, hy - s * 0.18, s * 0.02, s * 0.08, 0.1 - earWiggle * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // eyes — simple cute dots with sparkle
      ctx.fillStyle = rgba(0x2a2a3a, 1);
      ctx.beginPath();
      ctx.arc(cx - s * 0.06, hy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.06, hy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(0xffffff, 0.9);
      ctx.beginPath();
      ctx.arc(cx - s * 0.05, hy - s * 0.01, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.07, hy - s * 0.01, 1, 0, Math.PI * 2);
      ctx.fill();

      // nose — tiny pink
      ctx.fillStyle = rgba(c.accentColor, 1);
      ctx.beginPath();
      ctx.arc(cx, hy + s * 0.05, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // cheek blush
      ctx.fillStyle = rgba(0xffaaaa, 0.3);
      ctx.beginPath();
      ctx.arc(cx - s * 0.1, hy + s * 0.03, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.1, hy + s * 0.03, s * 0.03, 0, Math.PI * 2);
      ctx.fill();

      // sparkles
      if (frame === 0 || frame === 3) {
        for (let i = 0; i < 4; i++) {
          const sa = (i / 4) * Math.PI * 2 + frame * 0.4;
          const sr = s * 0.3;
          ctx.fillStyle = rgba(0xffeeff, 0.5);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(sa) * sr, s * 0.5 + hop + Math.sin(sa) * sr * 0.6, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  // Baby Dragon — small round dragon with big eyes and tiny wings
  {
    name: "baby-dragon",
    baseColor: 0x6dd4b0,
    accentColor: 0xa0ffd0,
    eyeColor: 0xffaa44,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const hop = frame === 3 ? -5 : 0;
      const wobble = frame === 1 ? 2 : frame === 2 ? -2 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      // tiny wings
      ctx.save();
      const wingFlap = frame === 1 ? 5 : frame === 2 ? -3 : frame === 3 ? 7 : 1;
      ctx.fillStyle = rgba(lighten(c.accentColor, 0.1), 0.6);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12, s * 0.45 + hop);
      ctx.quadraticCurveTo(cx - s * 0.28, s * 0.3 + hop - wingFlap, cx - s * 0.2, s * 0.2 + hop);
      ctx.quadraticCurveTo(cx - s * 0.15, s * 0.3 + hop, cx - s * 0.08, s * 0.4 + hop);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.12, s * 0.45 + hop);
      ctx.quadraticCurveTo(cx + s * 0.28, s * 0.3 + hop - wingFlap, cx + s * 0.2, s * 0.2 + hop);
      ctx.quadraticCurveTo(cx + s * 0.15, s * 0.3 + hop, cx + s * 0.08, s * 0.4 + hop);
      ctx.fill();
      ctx.restore();

      // body — round and chubby
      ctx.save();
      const bodyGrad = ctx.createRadialGradient(cx - 4, s * 0.5 + hop, 2, cx, s * 0.58 + hop, s * 0.28);
      bodyGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      bodyGrad.addColorStop(0.5, rgba(c.baseColor, 1));
      bodyGrad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 1));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.58 + hop + wobble, s * 0.22, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // belly — lighter patch
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.3), 0.6);
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.62 + hop + wobble, s * 0.12, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      // feet — small claws
      ctx.fillStyle = rgba(darken(c.baseColor, 0.3), 1);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.1, groundY - 2, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.1, groundY - 2, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();

      // tail — small curl
      ctx.save();
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, s * 0.55 + hop);
      ctx.quadraticCurveTo(cx - s * 0.3, s * 0.5 + hop, cx - s * 0.28 + wobble, s * 0.38 + hop);
      ctx.stroke();
      // tail tip
      ctx.fillStyle = rgba(c.accentColor, 0.8);
      ctx.beginPath();
      ctx.arc(cx - s * 0.28 + wobble, s * 0.38 + hop, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // head — big and round
      const hy = s * 0.38 + hop;
      ctx.save();
      const headGrad = ctx.createRadialGradient(cx - 3, hy - 3, 0, cx, hy, s * 0.18);
      headGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.25), 1));
      headGrad.addColorStop(0.6, rgba(c.baseColor, 1));
      headGrad.addColorStop(1, rgba(darken(c.baseColor, 0.15), 1));
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(cx, hy, s * 0.17, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // snout
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.15), 1);
      ctx.beginPath();
      ctx.ellipse(cx, hy + s * 0.06, s * 0.08, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();

      // nostrils
      ctx.fillStyle = rgba(darken(c.baseColor, 0.4), 0.5);
      ctx.beginPath();
      ctx.arc(cx - s * 0.03, hy + s * 0.05, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.03, hy + s * 0.05, 1, 0, Math.PI * 2);
      ctx.fill();

      // eyes — simple cute dots with sparkle
      ctx.fillStyle = rgba(0x2a2a3a, 1);
      ctx.beginPath();
      ctx.arc(cx - s * 0.07, hy - s * 0.02, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.07, hy - s * 0.02, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(0xffffff, 0.9);
      ctx.beginPath();
      ctx.arc(cx - s * 0.06, hy - s * 0.03, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.08, hy - s * 0.03, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // tiny horns / nubs on head
      ctx.fillStyle = rgba(darken(c.accentColor, 0.1), 0.8);
      ctx.beginPath();
      ctx.arc(cx - s * 0.08, hy - s * 0.12, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s * 0.08, hy - s * 0.12, 2, 0, Math.PI * 2);
      ctx.fill();

      // little smile
      ctx.beginPath();
      ctx.arc(cx, hy + s * 0.08, s * 0.04, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.4), 0.6);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    },
  },
  // Crystal Fox — shimmering fox with crystalline fur
  {
    name: "crystal-fox",
    baseColor: 0x88ccff,
    accentColor: 0xddffff,
    eyeColor: 0x66ffcc,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const legPhase = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? -6 : 0;
      const hop = frame === 3 ? -4 : 0;

      drawGroundShadow(ctx, cx, groundY, s * 0.35);

      // legs
      drawLimb(ctx, cx - s * 0.12, s * 0.55 + hop, cx - s * 0.14 + legPhase, groundY - 2, 4, 2.5, darken(c.baseColor, 0.15));
      drawLimb(ctx, cx + s * 0.1, s * 0.55 + hop, cx + s * 0.12 - legPhase, groundY - 2, 4, 2.5, darken(c.baseColor, 0.15));
      drawLimb(ctx, cx - s * 0.02, s * 0.55 + hop, cx + legPhase, groundY - 2, 4, 2.5, c.baseColor);
      drawLimb(ctx, cx + s * 0.18, s * 0.55 + hop, cx + s * 0.2 - legPhase, groundY - 2, 4, 2.5, c.baseColor);

      // body
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, s * 0.38 + hop, 0, s * 0.6 + hop);
      bodyGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.15), 1));
      bodyGrad.addColorStop(0.5, rgba(c.baseColor, 1));
      bodyGrad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 1));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.5 + hop, s * 0.26, s * 0.15, -0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // crystal fur facets — shimmering triangles
      ctx.save();
      ctx.strokeStyle = rgba(c.accentColor, 0.4);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * s * 0.15;
        const y1 = s * 0.5 + hop + Math.sin(a) * s * 0.08;
        const x2 = cx + Math.cos(a) * s * 0.22;
        const y2 = s * 0.5 + hop + Math.sin(a) * s * 0.12;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      // tail — big bushy crystal tail
      ctx.save();
      const tailGrad = ctx.createRadialGradient(cx - s * 0.35, s * 0.35 + hop, 0, cx - s * 0.35, s * 0.35 + hop, s * 0.15);
      tailGrad.addColorStop(0, rgba(c.accentColor, 0.9));
      tailGrad.addColorStop(0.6, rgba(c.baseColor, 0.8));
      tailGrad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 0.5));
      ctx.fillStyle = tailGrad;
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.32 + legPhase * 0.2, s * 0.38 + hop, s * 0.1, s * 0.14, 0.4, 0, Math.PI * 2);
      ctx.fill();
      // tail tip — bright crystal
      ctx.fillStyle = rgba(c.accentColor, 0.8);
      ctx.beginPath();
      ctx.arc(cx - s * 0.38 + legPhase * 0.2, s * 0.28 + hop, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // head
      const hx = cx + s * 0.25;
      const hy = s * 0.4 + hop;
      ctx.save();
      const headGrad = ctx.createRadialGradient(hx - 3, hy - 3, 0, hx, hy, s * 0.14);
      headGrad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      headGrad.addColorStop(0.6, rgba(c.baseColor, 1));
      headGrad.addColorStop(1, rgba(darken(c.baseColor, 0.15), 1));
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(hx, hy, s * 0.12, s * 0.1, 0.05, 0, Math.PI * 2);
      ctx.fill();
      // snout — pointed fox
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.05, hy - s * 0.02);
      ctx.lineTo(hx + s * 0.14, hy + s * 0.04);
      ctx.lineTo(hx + s * 0.05, hy + s * 0.06);
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.fill();
      ctx.restore();

      // ears — pointy crystal ears
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.05, hy - s * 0.08);
      ctx.lineTo(hx - s * 0.07, hy - s * 0.2);
      ctx.lineTo(hx - s * 0.01, hy - s * 0.1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.03, hy - s * 0.08);
      ctx.lineTo(hx + s * 0.01, hy - s * 0.2);
      ctx.lineTo(hx + s * 0.07, hy - s * 0.1);
      ctx.fill();
      // inner ear — crystal
      ctx.fillStyle = rgba(c.accentColor, 0.6);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.05, hy - s * 0.1);
      ctx.lineTo(hx - s * 0.06, hy - s * 0.17);
      ctx.lineTo(hx - s * 0.02, hy - s * 0.11);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.03, hy - s * 0.1);
      ctx.lineTo(hx + s * 0.02, hy - s * 0.17);
      ctx.lineTo(hx + s * 0.06, hy - s * 0.11);
      ctx.fill();

      // eyes — simple cute dot with sparkle
      ctx.fillStyle = rgba(0x2a2a3a, 1);
      ctx.beginPath();
      ctx.arc(hx + s * 0.02, hy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(0xffffff, 0.9);
      ctx.beginPath();
      ctx.arc(hx + s * 0.03, hy - s * 0.01, 1, 0, Math.PI * 2);
      ctx.fill();

      // crystal shimmer particles
      if (frame === 0 || frame === 3) {
        for (let i = 0; i < 3; i++) {
          const sa = (i / 3) * Math.PI * 2 + frame * 0.3;
          const sr = s * 0.3;
          ctx.fillStyle = rgba(c.accentColor, 0.5);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(sa) * sr, s * 0.45 + hop + Math.sin(sa) * sr * 0.5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
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
// GOLF TEXTURES
// ============================================================

/** Draw an axe lying diagonally on the ground. */
function drawAxe(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const handleLen = size * 0.5;
  const angle = Math.PI / 4; // diagonal from top-left to bottom-right

  // shadow
  ctx.save();
  ctx.translate(cx + 2, cy + 4);
  ctx.rotate(angle);
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.fillRect(-handleLen / 2, -3, handleLen, 6);
  ctx.restore();

  // handle — wooden brown gradient
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const handleGrad = ctx.createLinearGradient(0, -3, 0, 3);
  handleGrad.addColorStop(0, rgba(0x8b5a2b, 1));
  handleGrad.addColorStop(0.5, rgba(0x6b4a1b, 1));
  handleGrad.addColorStop(1, rgba(0x4b3a0b, 1));
  ctx.fillStyle = handleGrad;
  ctx.beginPath();
  ctx.rect(-handleLen / 2, -2.5, handleLen, 5);
  ctx.fill();
  ctx.strokeStyle = rgba(0x3b2a0b, 0.6);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // axe head — steel blade at the top end
  const headX = handleLen / 2;
  ctx.fillStyle = rgba(0xaaaaaa, 1);
  ctx.beginPath();
  ctx.moveTo(headX - 2, -2);
  ctx.lineTo(headX + 10, -8);
  ctx.lineTo(headX + 12, 0);
  ctx.lineTo(headX + 10, 8);
  ctx.lineTo(headX - 2, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(0x555555, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();
  // blade highlight
  ctx.fillStyle = rgba(0xdddddd, 0.5);
  ctx.beginPath();
  ctx.moveTo(headX + 1, -1);
  ctx.lineTo(headX + 8, -5);
  ctx.lineTo(headX + 9, -1);
  ctx.lineTo(headX + 1, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Draw a decorative fountain frame — large multi-tile stone basin with animated water.
 *  @param frame   Animation frame index (0..totalFrames-1)
 *  @param totalFrames  Total number of animation frames */
function drawFountainFrame(ctx: CanvasRenderingContext2D, size: number, frame: number, totalFrames: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const t = frame / totalFrames; // 0..1 animation phase

  // ── Outer stone plaza ring (subtle paving around basin) ──
  const plazaR = size * 0.46;
  ctx.fillStyle = rgba(0x998877, 0.25);
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.02, plazaR, 0, Math.PI * 2);
  ctx.fill();

  // plaza stone segments
  ctx.strokeStyle = rgba(0x7a6a5a, 0.3);
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.34, cy + size * 0.02 + Math.sin(a) * size * 0.34);
    ctx.lineTo(cx + Math.cos(a) * plazaR, cy + size * 0.02 + Math.sin(a) * plazaR);
    ctx.stroke();
  }

  // ── Outer stone basin — wide tiered circular base ──
  const basinR = size * 0.40;
  const basinY = cy + size * 0.03;

  // basin shadow
  ctx.fillStyle = rgba(0x444455, 0.3);
  ctx.beginPath();
  ctx.ellipse(cx, basinY + size * 0.04, basinR, basinR * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();

  // basin outer ring (thick stone)
  ctx.fillStyle = rgba(0x9a9aab, 1);
  ctx.beginPath();
  ctx.arc(cx, basinY, basinR, 0, Math.PI * 2);
  ctx.fill();

  // basin top edge highlight
  ctx.strokeStyle = rgba(0xb8b8cc, 0.7);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, basinY, basinR - 1, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();

  // basin outer rim shadow
  ctx.strokeStyle = rgba(0x6a6a7a, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, basinY, basinR, 0, Math.PI * 2);
  ctx.stroke();

  // basin inner edge (where water meets stone)
  const innerR = size * 0.33;
  ctx.fillStyle = rgba(0x7a7a8a, 0.6);
  ctx.beginPath();
  ctx.arc(cx, basinY, innerR + 3, 0, Math.PI * 2);
  ctx.fill();

  // ── Inner water pool ──
  const waterR = innerR;
  const waterGrad = ctx.createRadialGradient(cx, basinY - size * 0.02, 2, cx, basinY, waterR);
  waterGrad.addColorStop(0, rgba(0x99ddff, 0.92));
  waterGrad.addColorStop(0.4, rgba(0x5599cc, 0.88));
  waterGrad.addColorStop(0.8, rgba(0x336699, 0.85));
  waterGrad.addColorStop(1, rgba(0x224477, 0.8));
  ctx.fillStyle = waterGrad;
  ctx.beginPath();
  ctx.arc(cx, basinY, waterR, 0, Math.PI * 2);
  ctx.fill();

  // ── Animated water ripples — concentric circles expanding outward ──
  for (let i = 0; i < 4; i++) {
    const phase = (t + i / 4) % 1;
    const r = waterR * (0.15 + phase * 0.75);
    const alpha = (1 - phase) * 0.35;
    ctx.strokeStyle = rgba(0xaaeeff, alpha);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, basinY, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Central pillar — tiered stone column ──
  const pillarW = size * 0.07;
  const pillarBaseH = size * 0.06;
  const pillarH = size * 0.22;
  const pillarTopY = basinY - pillarH;

  // pillar base (wider)
  ctx.fillStyle = rgba(0x888899, 1);
  ctx.beginPath();
  ctx.ellipse(cx, basinY, pillarW * 1.4, pillarBaseH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // pillar shaft
  ctx.fillStyle = rgba(0x9a9aab, 1);
  ctx.fillRect(cx - pillarW / 2, pillarTopY, pillarW, pillarH);
  // pillar left shading
  ctx.fillStyle = rgba(0x777788, 0.5);
  ctx.fillRect(cx - pillarW / 2, pillarTopY, pillarW * 0.3, pillarH);
  // pillar right highlight
  ctx.fillStyle = rgba(0xbbbbcc, 0.3);
  ctx.fillRect(cx + pillarW * 0.3, pillarTopY, pillarW * 0.2, pillarH);

  // pillar capital (wider top)
  ctx.fillStyle = rgba(0xaaaabb, 1);
  ctx.beginPath();
  ctx.ellipse(cx, pillarTopY, pillarW * 1.0, pillarW * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(0x777788, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Water spout — animated jet from pillar top ──
  const spoutPhase = t;
  const spoutHeight = size * 0.10 + Math.sin(spoutPhase * Math.PI * 2) * size * 0.03;
  const spoutTopY = pillarTopY - spoutHeight;

  // water column (translucent blue)
  const colGrad = ctx.createLinearGradient(cx, pillarTopY, cx, spoutTopY);
  colGrad.addColorStop(0, rgba(0x88ccff, 0.7));
  colGrad.addColorStop(1, rgba(0xddffff, 0.5));
  ctx.fillStyle = colGrad;
  ctx.beginPath();
  ctx.moveTo(cx - pillarW * 0.3, pillarTopY);
  ctx.quadraticCurveTo(cx - pillarW * 0.15, spoutTopY + spoutHeight * 0.3, cx - 1, spoutTopY);
  ctx.lineTo(cx + 1, spoutTopY);
  ctx.quadraticCurveTo(cx + pillarW * 0.15, spoutTopY + spoutHeight * 0.3, cx + pillarW * 0.3, pillarTopY);
  ctx.closePath();
  ctx.fill();

  // spout glow
  radialGradient(ctx, cx, spoutTopY, size * 0.10, 0xddffff, 0x4499dd, 0.6, 0);

  // spout tip splash
  ctx.fillStyle = rgba(0xeeffff, 0.8);
  ctx.beginPath();
  ctx.arc(cx, spoutTopY, size * 0.025 + Math.sin(t * Math.PI * 2) * 2, 0, Math.PI * 2);
  ctx.fill();

  // ── Splash droplets — animated falling particles around spout ──
  const numDrops = 10;
  for (let i = 0; i < numDrops; i++) {
    const dropPhase = (t + i / numDrops) % 1;
    const angle = (i / numDrops) * Math.PI * 2 + t * 0.5;
    const dist = size * 0.04 + dropPhase * size * 0.08;
    const dropY = spoutTopY + dropPhase * (basinY - spoutTopY) * 0.8;
    const dropX = cx + Math.cos(angle) * dist;
    const dropAlpha = (1 - dropPhase) * 0.7;
    const dropSize = 2 + (1 - dropPhase) * 1.5;
    ctx.fillStyle = rgba(0xaaeeff, dropAlpha);
    ctx.beginPath();
    ctx.arc(dropX, dropY, dropSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Water cascading over basin rim — animated streams ──
  for (let i = 0; i < 3; i++) {
    const cascadeAngle = (i / 3) * Math.PI * 2 + t * 0.3;
    const cascadePhase = (t * 2 + i * 0.33) % 1;
    const startX = cx + Math.cos(cascadeAngle) * waterR * 0.9;
    const startY = basinY + Math.sin(cascadeAngle) * waterR * 0.9;
    const endX = cx + Math.cos(cascadeAngle) * basinR;
    const endY = basinY + Math.sin(cascadeAngle) * basinR;
    const cascadeAlpha = Math.sin(cascadePhase * Math.PI) * 0.4;
    ctx.strokeStyle = rgba(0x99ccff, cascadeAlpha);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // ── Water surface highlights — shifting specular reflections ──
  const highlightOffset = Math.sin(t * Math.PI * 2) * waterR * 0.15;
  ctx.fillStyle = rgba(0xffffff, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx - waterR * 0.3 + highlightOffset, basinY - waterR * 0.1, waterR * 0.35, waterR * 0.12, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = rgba(0xffffff, 0.15);
  ctx.beginPath();
  ctx.ellipse(cx + waterR * 0.2 - highlightOffset * 0.5, basinY + waterR * 0.15, waterR * 0.2, waterR * 0.06, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a big tree — taller and wider than the regular tree tile. */
function drawBigTree(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;

  // trunk — wider and taller than normal tree
  const trunkW = size * 0.14;
  const trunkH = size * 0.35;
  const trunkX = cx - trunkW / 2;
  const trunkY = cy + size * 0.05;
  ctx.fillStyle = rgba(0x4a3a1a, 1);
  ctx.fillRect(trunkX, trunkY, trunkW, trunkH);
  // trunk shading
  ctx.fillStyle = rgba(0x3a2a0a, 0.4);
  ctx.fillRect(trunkX, trunkY, trunkW * 0.3, trunkH);

  // canopy — layered circles for a fuller look
  const canopyR = size * 0.32;
  const canopyY = cy - size * 0.1;

  // dark base layer
  ctx.fillStyle = rgba(0x2a5a1a, 1);
  ctx.beginPath();
  ctx.arc(cx, canopyY, canopyR, 0, Math.PI * 2);
  ctx.fill();

  // mid layer — slightly offset
  ctx.fillStyle = rgba(0x3a7a2a, 1);
  ctx.beginPath();
  ctx.arc(cx - canopyR * 0.2, canopyY - canopyR * 0.15, canopyR * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + canopyR * 0.2, canopyY - canopyR * 0.1, canopyR * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // highlight layer
  ctx.fillStyle = rgba(0x4a9a3a, 1);
  ctx.beginPath();
  ctx.arc(cx - canopyR * 0.15, canopyY - canopyR * 0.3, canopyR * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // top highlight
  ctx.fillStyle = rgba(0x6abb4a, 0.6);
  ctx.beginPath();
  ctx.arc(cx - canopyR * 0.2, canopyY - canopyR * 0.4, canopyR * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // outline
  ctx.strokeStyle = rgba(0x1a3a0a, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, canopyY, canopyR, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw a big rock — larger and more detailed than the regular rock tile. */
function drawBigRock(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.7, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // main boulder — dark base
  ctx.fillStyle = rgba(0x6a6a6a, 1);
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + r * 0.3);
  ctx.lineTo(cx - r * 0.7, cy - r * 0.5);
  ctx.lineTo(cx - r * 0.2, cy - r * 0.8);
  ctx.lineTo(cx + r * 0.4, cy - r * 0.7);
  ctx.lineTo(cx + r * 0.9, cy - r * 0.2);
  ctx.lineTo(cx + r, cy + r * 0.3);
  ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
  ctx.lineTo(cx - r * 0.5, cy + r * 0.6);
  ctx.closePath();
  ctx.fill();

  // mid-tone facet
  ctx.fillStyle = rgba(0x8a8a8a, 1);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy - r * 0.5);
  ctx.lineTo(cx - r * 0.2, cy - r * 0.8);
  ctx.lineTo(cx + r * 0.1, cy - r * 0.3);
  ctx.lineTo(cx - r * 0.3, cy - r * 0.1);
  ctx.closePath();
  ctx.fill();

  // highlight facet
  ctx.fillStyle = rgba(0xaaaaaa, 1);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.2, cy - r * 0.8);
  ctx.lineTo(cx + r * 0.4, cy - r * 0.7);
  ctx.lineTo(cx + r * 0.2, cy - r * 0.4);
  ctx.lineTo(cx + r * 0.1, cy - r * 0.3);
  ctx.closePath();
  ctx.fill();

  // cracks
  ctx.strokeStyle = rgba(0x4a4a4a, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.3, cy - r * 0.1);
  ctx.lineTo(cx + r * 0.1, cy + r * 0.2);
  ctx.lineTo(cx + r * 0.3, cy + r * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.1, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.3, cy - r * 0.1);
  ctx.stroke();

  // moss patches
  ctx.fillStyle = rgba(0x4a6a2a, 0.5);
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.4, cy + r * 0.4, r * 0.25, r * 0.12, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.5, cy + r * 0.3, r * 0.18, r * 0.1, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a palm tree — friendly, tropical, with a curved trunk and fronds. */
function drawPalmTree(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.35, size * 0.18, size * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // trunk — curved, tapering
  ctx.strokeStyle = rgba(0x8a6a3a, 1);
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.quadraticCurveTo(cx - size * 0.05, cy - size * 0.1, cx + size * 0.02, cy - size * 0.25);
  ctx.stroke();

  // trunk segments
  ctx.strokeStyle = rgba(0x6a4a2a, 0.5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const sy = cy + size * 0.3 - t * size * 0.5;
    const sx = cx - size * 0.05 * t + size * 0.02 * t;
    ctx.beginPath();
    ctx.moveTo(sx - size * 0.04, sy);
    ctx.lineTo(sx + size * 0.04, sy);
    ctx.stroke();
  }

  // fronds — 6-7 radiating from the top
  const frondLen = size * 0.22;
  const topX = cx + size * 0.02;
  const topY = cy - size * 0.25;
  const frondColors = [0x3a8a3a, 0x2a7a2a, 0x4a9a4a];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const droop = 0.15;
    const ex = topX + Math.cos(angle) * frondLen;
    const ey = topY + Math.sin(angle) * frondLen + frondLen * droop;
    ctx.strokeStyle = rgba(frondColors[i % 3], 1);
    ctx.lineWidth = size * 0.04;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(angle) * frondLen * 0.5,
      topY + Math.sin(angle) * frondLen * 0.5 - frondLen * 0.1,
      ex, ey
    );
    ctx.stroke();

    // small leaflets
    ctx.fillStyle = rgba(frondColors[(i + 1) % 3], 0.7);
    for (let j = 1; j <= 3; j++) {
      const lt = j / 4;
      const lx = topX + Math.cos(angle) * frondLen * lt;
      const ly = topY + Math.sin(angle) * frondLen * lt + frondLen * droop * lt;
      ctx.beginPath();
      ctx.ellipse(lx, ly, size * 0.025, size * 0.015, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // coconuts
  ctx.fillStyle = rgba(0x4a3a1a, 1);
  ctx.beginPath();
  ctx.arc(topX - size * 0.04, topY + size * 0.04, size * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(topX + size * 0.04, topY + size * 0.04, size * 0.03, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a mystic tree — dark, gnarled, intimidating with glowing eyes. */
function drawMysticTree(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.35);
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.35, size * 0.2, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // trunk — thick, gnarled, dark
  const trunkW = size * 0.12;
  ctx.fillStyle = rgba(0x2a1a1a, 1);
  ctx.beginPath();
  ctx.moveTo(cx - trunkW / 2, cy + size * 0.3);
  ctx.lineTo(cx - trunkW / 2 - size * 0.03, cy - size * 0.1);
  ctx.lineTo(cx - trunkW / 3, cy - size * 0.2);
  ctx.lineTo(cx + trunkW / 3, cy - size * 0.2);
  ctx.lineTo(cx + trunkW / 2 + size * 0.03, cy - size * 0.1);
  ctx.lineTo(cx + trunkW / 2, cy + size * 0.3);
  ctx.closePath();
  ctx.fill();

  // trunk texture — bark lines
  ctx.strokeStyle = rgba(0x1a0a0a, 0.6);
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * trunkW * 0.3, cy + size * 0.25);
    ctx.lineTo(cx + i * trunkW * 0.3 + size * 0.02, cy - size * 0.15);
    ctx.stroke();
  }

  // canopy — dark, twisted, layered
  const canopyR = size * 0.28;
  const canopyY = cy - size * 0.22;

  // dark base
  ctx.fillStyle = rgba(0x1a2a1a, 1);
  ctx.beginPath();
  ctx.arc(cx, canopyY, canopyR, 0, Math.PI * 2);
  ctx.fill();

  // twisted branches
  ctx.strokeStyle = rgba(0x2a1a1a, 1);
  ctx.lineWidth = size * 0.03;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, canopyY);
    ctx.quadraticCurveTo(
      cx + Math.cos(angle) * canopyR * 0.6,
      canopyY + Math.sin(angle) * canopyR * 0.6 - canopyR * 0.2,
      cx + Math.cos(angle) * canopyR * 1.1,
      canopyY + Math.sin(angle) * canopyR * 1.1
    );
    ctx.stroke();
  }

  // mid layer — slightly lighter
  ctx.fillStyle = rgba(0x2a4a2a, 0.8);
  ctx.beginPath();
  ctx.arc(cx - canopyR * 0.2, canopyY - canopyR * 0.15, canopyR * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + canopyR * 0.2, canopyY - canopyR * 0.1, canopyR * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // glowing eyes — two eerie spots in the canopy
  const eyeY = canopyY - canopyR * 0.1;
  const eyeOffset = canopyR * 0.2;
  ctx.fillStyle = rgba(0xff4400, 0.9);
  ctx.beginPath();
  ctx.arc(cx - eyeOffset, eyeY, size * 0.025, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeOffset, eyeY, size * 0.025, 0, Math.PI * 2);
  ctx.fill();

  // eye glow
  ctx.fillStyle = rgba(0xff6600, 0.3);
  ctx.beginPath();
  ctx.arc(cx - eyeOffset, eyeY, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeOffset, eyeY, size * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // hanging tendrils/moss
  ctx.strokeStyle = rgba(0x1a3a1a, 0.5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const tx = cx - canopyR * 0.6 + i * canopyR * 0.4;
    ctx.beginPath();
    ctx.moveTo(tx, canopyY + canopyR * 0.3);
    ctx.lineTo(tx + size * 0.01, canopyY + canopyR * 0.6);
    ctx.stroke();
  }
}

/** Draw a golf club lying diagonally on the ground. */
function drawGolfClub(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const shaftLen = size * 0.55;
  const angle = -Math.PI / 4; // diagonal from bottom-left to top-right

  // shadow
  ctx.save();
  ctx.translate(cx + 2, cy + 4);
  ctx.rotate(angle);
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.fillRect(-shaftLen / 2, -3, shaftLen, 6);
  ctx.restore();

  // shaft — steel gradient
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const shaftGrad = ctx.createLinearGradient(0, -3, 0, 3);
  shaftGrad.addColorStop(0, rgba(0xcccccc, 1));
  shaftGrad.addColorStop(0.5, rgba(0x888888, 1));
  shaftGrad.addColorStop(1, rgba(0x555555, 1));
  ctx.fillStyle = shaftGrad;
  ctx.beginPath();
  ctx.rect(-shaftLen / 2, -2.5, shaftLen, 5);
  ctx.fill();
  ctx.strokeStyle = rgba(0x444444, 0.6);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // grip — dark rubber at the top end
  const gripLen = shaftLen * 0.22;
  ctx.fillStyle = rgba(0x2a1a0a, 1);
  ctx.fillRect(shaftLen / 2 - gripLen, -3, gripLen, 6);
  // grip texture lines
  ctx.strokeStyle = rgba(0x1a0a00, 0.5);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const gx = shaftLen / 2 - gripLen + (i + 1) * (gripLen / 6);
    ctx.beginPath();
    ctx.moveTo(gx, -3);
    ctx.lineTo(gx, 3);
    ctx.stroke();
  }

  // club head — iron at the bottom end
  const headX = -shaftLen / 2;
  ctx.fillStyle = rgba(0x999999, 1);
  ctx.beginPath();
  ctx.moveTo(headX, -2);
  ctx.lineTo(headX - 8, -5);
  ctx.lineTo(headX - 10, 2);
  ctx.lineTo(headX - 6, 6);
  ctx.lineTo(headX, 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(0x555555, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();
  // highlight on club head
  ctx.fillStyle = rgba(0xcccccc, 0.5);
  ctx.beginPath();
  ctx.moveTo(headX - 1, -1);
  ctx.lineTo(headX - 6, -3);
  ctx.lineTo(headX - 7, 0);
  ctx.lineTo(headX - 1, 1);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Draw a golf bag with club heads poking out. */
function drawGolfBag(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const bagW = size * 0.35;
  const bagH = size * 0.45;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + bagH / 2 + 4, bagW * 0.6, bagW * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // club heads poking out the top (3 clubs)
  const clubColors = [0x88cc88, 0xcc8888, 0x8888cc];
  for (let i = 0; i < 3; i++) {
    const clubX = cx - bagW * 0.25 + i * bagW * 0.25;
    const clubTopY = cy - bagH / 2 - size * 0.12;
    ctx.strokeStyle = rgba(clubColors[i], 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clubX, cy - bagH / 2 + 2);
    ctx.lineTo(clubX - 3, clubTopY);
    ctx.stroke();
    // small club head
    ctx.fillStyle = rgba(clubColors[i], 1);
    ctx.beginPath();
    ctx.arc(clubX - 3, clubTopY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // bag body — leather gradient
  const bagGrad = ctx.createLinearGradient(cx - bagW / 2, 0, cx + bagW / 2, 0);
  bagGrad.addColorStop(0, rgba(0x4a3a2a, 1));
  bagGrad.addColorStop(0.5, rgba(0x6a5a3a, 1));
  bagGrad.addColorStop(1, rgba(0x4a3a2a, 1));
  ctx.fillStyle = bagGrad;
  ctx.beginPath();
  ctx.roundRect(cx - bagW / 2, cy - bagH / 2, bagW, bagH, 4);
  ctx.fill();
  ctx.strokeStyle = rgba(0x2a1a0a, 0.8);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // bag strap
  ctx.strokeStyle = rgba(0x3a2a1a, 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - bagW / 2 + 3, cy - bagH / 2 + 4);
  ctx.lineTo(cx + bagW / 2 - 3, cy - bagH / 2 + 4);
  ctx.stroke();

  // pocket
  ctx.fillStyle = rgba(0x3a2a1a, 0.8);
  ctx.beginPath();
  ctx.roundRect(cx - bagW * 0.3, cy + bagH * 0.1, bagW * 0.6, bagH * 0.3, 2);
  ctx.fill();
  ctx.strokeStyle = rgba(0x2a1a0a, 0.6);
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** Draw a golf ball with dimples. */
function drawGolfBall(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.16;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + r + 2, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // ball — radial gradient for 3D look
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  grad.addColorStop(0, rgba(0xffffff, 1));
  grad.addColorStop(0.7, rgba(0xeeeeee, 1));
  grad.addColorStop(1, rgba(0xcccccc, 1));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // outline
  ctx.strokeStyle = rgba(0xaaaaaa, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // dimples
  ctx.fillStyle = rgba(0xdddddd, 0.6);
  const dimpleR = r * 0.12;
  const dimples = [
    [-r * 0.4, -r * 0.3], [r * 0.3, -r * 0.4], [0, -r * 0.5],
    [-r * 0.5, r * 0.1], [r * 0.5, r * 0.1], [-r * 0.2, r * 0.3],
    [r * 0.2, r * 0.3], [0, r * 0.1], [r * 0.1, -r * 0.1],
  ];
  for (const [dx, dy] of dimples) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, dimpleR, 0, Math.PI * 2);
    ctx.fill();
  }

  // shine
  ctx.fillStyle = rgba(0xffffff, 0.7);
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a tee box — a distinct rectangular mat with tee markers. */
function drawTeeBox(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const matW = size * 0.7;
  const matH = size * 0.5;
  const matX = cx - matW / 2;
  const matY = cy - matH / 2;

  // mat base — slightly raised, lighter fairway green
  const matGrad = ctx.createLinearGradient(matX, matY, matX, matY + matH);
  matGrad.addColorStop(0, rgba(0x7ec85a, 1));
  matGrad.addColorStop(0.5, rgba(0x6ab84a, 1));
  matGrad.addColorStop(1, rgba(0x5aa83a, 1));
  ctx.fillStyle = matGrad;
  ctx.fillRect(matX, matY, matW, matH);

  // mat border — darker outline
  ctx.strokeStyle = rgba(0x3a7a2a, 0.8);
  ctx.lineWidth = 2;
  ctx.strokeRect(matX, matY, matW, matH);

  // inner border line — tee box marking
  ctx.strokeStyle = rgba(0xffffff, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(matX + 3, matY + 3, matW - 6, matH - 6);

  // tee markers — two small posts on either side
  for (const side of [-1, 1]) {
    const px = cx + side * (matW / 2 - 4);
    // post shadow
    ctx.fillStyle = rgba(0x000000, 0.2);
    ctx.beginPath();
    ctx.ellipse(px + 1, matY + matH - 2, 3, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // post
    ctx.fillStyle = rgba(0xeeeeee, 0.9);
    ctx.fillRect(px - 1.5, matY + 2, 3, matH - 4);
    // post cap — red
    ctx.fillStyle = rgba(0xdd2222, 1);
    ctx.beginPath();
    ctx.arc(px, matY + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // "TEE" text indicator — small dots forming a tee symbol in center
  ctx.fillStyle = rgba(0xffffff, 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a leprechaun — small green-clothed figure with a hat. */
function drawLeprechaun(ctx: CanvasRenderingContext2D, size: number, frame = 0): void {
  const cx = size / 2;
  const cy = size / 2;
  const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
  const armWave = frame === 3 ? 4 : 0;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + size * 0.2, size * 0.18, size * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs — small, animated
  ctx.fillStyle = rgba(0x1a4a1a, 1);
  ctx.fillRect(cx - size * 0.06, cy + size * 0.14, size * 0.04, size * 0.08 + legPhase);
  ctx.fillRect(cx + size * 0.02, cy + size * 0.14, size * 0.04, size * 0.08 - legPhase);

  // body — green coat
  ctx.fillStyle = rgba(0x2a8a2a, 1);
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.05, size * 0.14, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // coat shading
  ctx.fillStyle = rgba(0x1a6a1a, 0.5);
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.04, cy + size * 0.05, size * 0.1, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // belt — black with gold buckle
  ctx.fillStyle = rgba(0x1a1a1a, 1);
  ctx.fillRect(cx - size * 0.12, cy + size * 0.08, size * 0.24, size * 0.04);
  ctx.fillStyle = rgba(0xffdd00, 1);
  ctx.fillRect(cx - size * 0.02, cy + size * 0.08, size * 0.04, size * 0.04);

  // arms — green sleeves, wave when fleeing
  ctx.fillStyle = rgba(0x2a8a2a, 1);
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.13, cy + size * 0.04 - armWave, size * 0.04, size * 0.08, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.13, cy + size * 0.04 - armWave, size * 0.04, size * 0.08, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // head — skin tone
  ctx.fillStyle = rgba(0xddaa77, 1);
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.08, size * 0.09, 0, Math.PI * 2);
  ctx.fill();

  // beard — orange
  ctx.fillStyle = rgba(0xcc6622, 1);
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.02, size * 0.08, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  ctx.fillStyle = rgba(0x000000, 0.8);
  ctx.beginPath();
  ctx.arc(cx - size * 0.03, cy - size * 0.09, 1.2, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.03, cy - size * 0.09, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // hat — classic leprechaun top hat
  ctx.fillStyle = rgba(0x1a6a1a, 1);
  // brim
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.14, size * 0.12, size * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  // top
  ctx.fillRect(cx - size * 0.06, cy - size * 0.24, size * 0.12, size * 0.1);
  // hat band — gold
  ctx.fillStyle = rgba(0xffaa00, 1);
  ctx.fillRect(cx - size * 0.06, cy - size * 0.16, size * 0.12, size * 0.03);
  // buckle on band
  ctx.fillStyle = rgba(0xffdd00, 1);
  ctx.fillRect(cx - size * 0.015, cy - size * 0.16, size * 0.03, size * 0.03);

  // frame 3 (flee): motion lines behind
  if (frame === 3) {
    ctx.strokeStyle = rgba(0xffffff, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, cy);
    ctx.lineTo(cx - size * 0.12, cy);
    ctx.moveTo(cx - size * 0.22, cy + size * 0.06);
    ctx.lineTo(cx - size * 0.14, cy + size * 0.06);
    ctx.stroke();
  }
}

// ============================================================
// LAKE SHORE TEXTURE — sandy shore with reeds
// ============================================================

/** Draw a lake shore tile — sand with patches of grass and water reeds. */
function drawLakeShore(ctx: CanvasRenderingContext2D, size: number): void {
  // sandy base
  ctx.fillStyle = rgba(0xd4c488, 1);
  ctx.fillRect(0, 0, size, size);
  // sand texture — small dots
  ctx.fillStyle = rgba(0xc4b478, 0.5);
  for (let i = 0; i < 12; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  // grass patches — darker green tufts
  ctx.fillStyle = rgba(0x5a8a3a, 0.7);
  for (let i = 0; i < 4; i++) {
    const gx = Math.random() * size;
    const gy = Math.random() * size;
    ctx.beginPath();
    ctx.ellipse(gx, gy, 3, 1.5, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // reeds — tall thin lines near water edge (bottom of tile)
  ctx.strokeStyle = rgba(0x4a7a2a, 0.8);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const rx = size * 0.15 + (i / 5) * size * 0.7;
    const ry = size * 0.7 + Math.random() * size * 0.2;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + (Math.random() - 0.5) * 3, ry - 6 - Math.random() * 4);
    ctx.stroke();
  }
  // water edge — subtle blue tint at bottom
  const grad = ctx.createLinearGradient(0, size * 0.8, 0, size);
  grad.addColorStop(0, "rgba(40,80,110,0)");
  grad.addColorStop(1, "rgba(40,80,110,0.3)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, size * 0.8, size, size * 0.2);
}

// ============================================================
// CAMPFIRE TEXTURE — cozy fire for cabin cooking
// ============================================================

/** Draw a campfire — stones around a glowing fire. 2 frames for flicker. */
function drawCampfire(ctx: CanvasRenderingContext2D, size: number, frame = 0): void {
  const cx = size / 2;
  const cy = size / 2;
  // stone ring
  ctx.fillStyle = rgba(0x888888, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sx = cx + Math.cos(a) * size * 0.28;
    const sy = cy + Math.sin(a) * size * 0.22 + size * 0.05;
    ctx.beginPath();
    ctx.ellipse(sx, sy, size * 0.06, size * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // fire glow — orange/red
  const flicker = frame === 0 ? 1 : 0.85;
  ctx.fillStyle = rgba(0xff6600, 0.7 * flicker);
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.18, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // inner flame — yellow
  ctx.fillStyle = rgba(0xffdd44, 0.8 * flicker);
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.02, size * 0.1, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // flame tips — animated
  ctx.fillStyle = rgba(0xff8800, 0.6 * flicker);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.06, cy - size * 0.04);
  ctx.lineTo(cx, cy - size * 0.14 - (frame === 0 ? 2 : 0));
  ctx.lineTo(cx + size * 0.06, cy - size * 0.04);
  ctx.closePath();
  ctx.fill();
  // logs — brown crossed
  ctx.strokeStyle = rgba(0x6a4a2a, 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.12, cy + size * 0.04);
  ctx.lineTo(cx + size * 0.12, cy + size * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.1, cy + size * 0.08);
  ctx.lineTo(cx + size * 0.1, cy + size * 0.08);
  ctx.stroke();
}

// ============================================================
// VOID RIFT TEXTURE — ominous purple tear in reality
// ============================================================

/** Draw a void rift — jagged purple tear with glowing edges. */
function drawVoidRift(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  // outer glow — dark purple
  ctx.fillStyle = rgba(0x220044, 0.6);
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.45, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  // rift body — deep void
  ctx.fillStyle = rgba(0x110022, 0.9);
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.35, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // jagged edges — purple
  ctx.strokeStyle = rgba(0xaa00ff, 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.35, size * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  // inner glow — bright purple
  ctx.strokeStyle = rgba(0xddaaff, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.25, size * 0.14, 0, 0, Math.PI * 2);
  ctx.stroke();
  // crack lines — radiating from center
  ctx.strokeStyle = rgba(0xcc88ff, 0.4);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * size * 0.4, cy + Math.sin(a) * size * 0.25);
    ctx.stroke();
  }
}

// ============================================================
// CABIN TEXTURES — wooden cabin tiles for lake-side building
// ============================================================

/** Draw a cabin wall tile — horizontal log construction. */
function drawCabinWall(ctx: CanvasRenderingContext2D, size: number): void {
  // base wood color
  ctx.fillStyle = rgba(0x8b6f47, 1);
  ctx.fillRect(0, 0, size, size);
  // horizontal log lines
  ctx.strokeStyle = rgba(0x6b5237, 0.8);
  ctx.lineWidth = 1;
  const logH = size / 4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * logH);
    ctx.lineTo(size, i * logH);
    ctx.stroke();
  }
  // log end circles on left and right
  ctx.fillStyle = rgba(0xa08560, 0.6);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(2, i * logH + logH / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size - 2, i * logH + logH / 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // subtle wood grain
  ctx.strokeStyle = rgba(0x7a5f3a, 0.3);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * logH + logH * 0.3);
    ctx.lineTo(size, i * logH + logH * 0.3);
    ctx.stroke();
  }
}

/** Draw a cabin door tile — wooden door with handle. */
function drawCabinDoor(ctx: CanvasRenderingContext2D, size: number): void {
  // wall background
  drawCabinWall(ctx, size);
  // door — darker wood, centered
  const dw = size * 0.5;
  const dh = size * 0.8;
  const dx = (size - dw) / 2;
  const dy = size - dh;
  ctx.fillStyle = rgba(0x5a4a2f, 1);
  ctx.fillRect(dx, dy, dw, dh);
  // door frame
  ctx.strokeStyle = rgba(0x3a2a15, 1);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(dx, dy, dw, dh);
  // vertical planks
  ctx.strokeStyle = rgba(0x4a3a20, 0.6);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(dx + dw / 2, dy);
  ctx.lineTo(dx + dw / 2, dy + dh);
  ctx.stroke();
  // door handle
  ctx.fillStyle = rgba(0xddaa44, 1);
  ctx.beginPath();
  ctx.arc(dx + dw * 0.75, dy + dh * 0.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a cabin window tile — glowing warm window. */
function drawCabinWindow(ctx: CanvasRenderingContext2D, size: number): void {
  // wall background
  drawCabinWall(ctx, size);
  // window — warm glow
  const ww = size * 0.4;
  const wh = size * 0.4;
  const wx = (size - ww) / 2;
  const wy = (size - wh) / 2;
  // window glow
  ctx.fillStyle = rgba(0xffdd88, 0.85);
  ctx.fillRect(wx, wy, ww, wh);
  // window frame
  ctx.strokeStyle = rgba(0x3a2a15, 1);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(wx, wy, ww, wh);
  // cross mullions
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();
}

/** Draw a cabin roof tile — dark shingled roof. */
function drawCabinRoof(ctx: CanvasRenderingContext2D, size: number): void {
  // base roof color — dark brown
  ctx.fillStyle = rgba(0x4a3520, 1);
  ctx.fillRect(0, 0, size, size);
  // shingle rows
  const shingleH = size / 5;
  for (let i = 0; i < 5; i++) {
    const y = i * shingleH;
    ctx.fillStyle = rgba(i % 2 === 0 ? 0x5a4030 : 0x3a2515, 0.7);
    ctx.fillRect(0, y, size, shingleH);
    // shingle dividers
    ctx.strokeStyle = rgba(0x2a1a08, 0.5);
    ctx.lineWidth = 0.5;
    const offset = i % 2 === 0 ? 0 : shingleH / 2;
    for (let x = offset; x < size; x += shingleH) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + shingleH);
      ctx.stroke();
    }
  }
  // roof edge highlight
  ctx.strokeStyle = rgba(0x6a5040, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();
}

// ============================================================
// WIFE NPC — cabin companion sprite
// ============================================================

/** Draw a wife NPC — simple woman with dress and hair, 2 frames (idle, walk). */
function drawWife(ctx: CanvasRenderingContext2D, size: number, frame = 0): void {
  const cx = size / 2;
  const cy = size / 2;
  const legPhase = frame === 1 ? 1.5 : 0;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + size * 0.2, size * 0.14, size * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs — simple, animated
  ctx.fillStyle = rgba(0xddaa77, 1);
  ctx.fillRect(cx - size * 0.05, cy + size * 0.1, size * 0.04, size * 0.08 + legPhase);
  ctx.fillRect(cx + size * 0.01, cy + size * 0.1, size * 0.04, size * 0.08 - legPhase);

  // dress — blue, triangular
  ctx.fillStyle = rgba(0x4488cc, 1);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.04, cy - size * 0.02);
  ctx.lineTo(cx - size * 0.14, cy + size * 0.14);
  ctx.lineTo(cx + size * 0.14, cy + size * 0.14);
  ctx.lineTo(cx + size * 0.04, cy - size * 0.02);
  ctx.closePath();
  ctx.fill();
  // dress shading
  ctx.fillStyle = rgba(0x336699, 0.4);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.04, cy - size * 0.02);
  ctx.lineTo(cx - size * 0.14, cy + size * 0.14);
  ctx.lineTo(cx, cy + size * 0.14);
  ctx.closePath();
  ctx.fill();

  // arms — simple
  ctx.fillStyle = rgba(0xddaa77, 1);
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.08, cy + size * 0.02, size * 0.025, size * 0.06, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.08, cy + size * 0.02, size * 0.025, size * 0.06, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // head — skin tone
  ctx.fillStyle = rgba(0xeebb88, 1);
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.08, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // hair — brown, flowing
  ctx.fillStyle = rgba(0x885533, 1);
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.1, size * 0.09, Math.PI, Math.PI * 2);
  ctx.fill();
  // hair sides
  ctx.fillRect(cx - size * 0.08, cy - size * 0.1, size * 0.04, size * 0.08);
  ctx.fillRect(cx + size * 0.04, cy - size * 0.1, size * 0.04, size * 0.08);

  // eyes
  ctx.fillStyle = rgba(0x000000, 0.8);
  ctx.beginPath();
  ctx.arc(cx - size * 0.025, cy - size * 0.08, 1, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.025, cy - size * 0.08, 1, 0, Math.PI * 2);
  ctx.fill();

  // smile
  ctx.strokeStyle = rgba(0x884422, 0.7);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.05, size * 0.02, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

// ============================================================
// TENNIS TEXTURES
// ============================================================

/** Draw a tennis court tile — blue-green hard court surface (US Open style).
 *  Seamless: flat color so adjacent tiles form one continuous court. */
function drawTennisCourt(ctx: CanvasRenderingContext2D, size: number): void {
  // court surface — flat blue-green, no gradient so tiles blend seamlessly
  ctx.fillStyle = rgba(0x2e80b8, 1);
  ctx.fillRect(0, 0, size, size);

  // subtle texture — faint noise dots for acrylic court feel
  ctx.fillStyle = rgba(0x4098d0, 0.1);
  for (let i = 0; i < 12; i++) {
    const nx = (i * 37 + 13) % size;
    const ny = (i * 53 + 7) % size;
    ctx.fillRect(nx, ny, 2, 2);
  }
  ctx.fillStyle = rgba(0x1a6090, 0.08);
  for (let i = 0; i < 8; i++) {
    const nx = (i * 61 + 23) % size;
    const ny = (i * 43 + 29) % size;
    ctx.fillRect(nx, ny, 1, 1);
  }
}

/** Draw a tennis wall tile — seamless brick/concrete back wall.
 *  Flat color + brick mortar lines that continue across tile boundaries. */
function drawTennisWall(ctx: CanvasRenderingContext2D, size: number): void {
  // wall base — flat concrete gray, no per-tile gradient
  ctx.fillStyle = rgba(0x787878, 1);
  ctx.fillRect(0, 0, size, size);

  // brick texture — rows of bricks with mortar lines
  // Use a brick width that divides evenly into size so vertical lines
  // align across adjacent tiles (seamless tiling).
  ctx.strokeStyle = rgba(0x555555, 0.5);
  ctx.lineWidth = 0.8;
  const brickH = size / 8; // 8 rows, divides evenly
  const brickW = size / 4; // 4 bricks per row, divides evenly
  for (let row = 0; row < 8; row++) {
    const y = row * brickH;
    // horizontal mortar line
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    // vertical mortar lines — offset every other row by half a brick
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let bx = offset; bx < size; bx += brickW) {
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx, y + brickH);
      ctx.stroke();
    }
  }
}

/** Draw a tennis racket lying diagonally on the ground. */
function drawTennisRacket(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const frameR = size * 0.28;
  const angle = -Math.PI / 5;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.2);
  ctx.beginPath();
  ctx.ellipse(2, 4, frameR * 1.1, frameR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // handle — dark grip
  const handleLen = size * 0.22;
  ctx.fillStyle = rgba(0x2a1a0a, 1);
  ctx.fillRect(frameR, -3, handleLen, 6);
  // grip texture lines
  ctx.strokeStyle = rgba(0x1a0a00, 0.5);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    const gx = frameR + (i + 1) * (handleLen / 7);
    ctx.beginPath();
    ctx.moveTo(gx, -3);
    ctx.lineTo(gx, 3);
    ctx.stroke();
  }

  // frame head — elliptical racket head
  ctx.strokeStyle = rgba(0xcc3333, 1);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, frameR, frameR * 0.75, 0, 0, Math.PI * 2);
  ctx.stroke();
  // inner frame highlight
  ctx.strokeStyle = rgba(0xee5555, 0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, frameR - 2, frameR * 0.75 - 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // strings — grid pattern inside the frame
  ctx.strokeStyle = rgba(0xeeeedd, 0.6);
  ctx.lineWidth = 0.5;
  const stringCount = 7;
  for (let i = 0; i <= stringCount; i++) {
    const t = (i / stringCount) * 2 - 1;
    // vertical strings
    const sx = t * (frameR - 1);
    const sy = Math.sqrt(1 - t * t) * (frameR * 0.75 - 1);
    ctx.beginPath();
    ctx.moveTo(sx, -sy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    // horizontal strings
    const hx = Math.sqrt(1 - t * t) * (frameR - 1);
    const hy = t * (frameR * 0.75 - 1);
    ctx.beginPath();
    ctx.moveTo(-hx, hy);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  }

  ctx.restore();
}

/** Draw a tennis ball — fluorescent yellow-green with seam line. */
function drawTennisBall(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.18;

  // shadow
  ctx.fillStyle = rgba(0x000000, 0.25);
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + r + 2, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // ball — radial gradient for 3D look (tennis ball yellow-green)
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  grad.addColorStop(0, rgba(0xeeff44, 1));
  grad.addColorStop(0.6, rgba(0xccdd22, 1));
  grad.addColorStop(1, rgba(0xaabb11, 1));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // outline
  ctx.strokeStyle = rgba(0x889900, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();

  // seam — curved white line characteristic of tennis balls
  ctx.strokeStyle = rgba(0xffffff, 0.9);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, -Math.PI * 0.7, -Math.PI * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + r * 0.3, cy, r * 0.85, Math.PI * 0.3, Math.PI * 0.7);
  ctx.stroke();

  // shine
  ctx.fillStyle = rgba(0xffffff, 0.5);
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a tennis net tile — seamless mesh netting (no posts).
 *  Mesh fills the full tile so adjacent net tiles form one continuous net.
 *  Posts are not drawn here; they would only make sense on edge tiles. */
function drawTennisNet(ctx: CanvasRenderingContext2D, size: number): void {
  const netH = size * 0.5;
  const ny = (size - netH) / 2;

  // net mesh — grid of thin lines spanning the full tile width
  ctx.strokeStyle = rgba(0xdddddd, 0.5);
  ctx.lineWidth = 0.5;
  const meshCols = 8;
  const meshRows = 5;
  for (let i = 0; i <= meshCols; i++) {
    const x = (i / meshCols) * size;
    ctx.beginPath();
    ctx.moveTo(x, ny + 1);
    ctx.lineTo(x, ny + netH - 1);
    ctx.stroke();
  }
  for (let i = 0; i <= meshRows; i++) {
    const y = ny + 1 + (i / meshRows) * (netH - 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // top band — white tape across full width
  ctx.fillStyle = rgba(0xffffff, 0.8);
  ctx.fillRect(0, ny, size, 2);
}

// ============================================================
// EMOTE ICONS — pixel-art style spritesheet for agent emote bubbles
// ============================================================

const EMOTE_FRAME_SIZE = 32;
const EMOTE_FRAMES = 8; // lightbulb, coffee, zzz, clipboard, chat, thought, check, exclamation

/** Draw a pixel-art lightbulb icon. */
function drawEmoteLightbulb(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  // bulb (yellow circle)
  ctx.fillStyle = "#f5d042";
  ctx.beginPath();
  ctx.arc(16 * u, 13 * u, 7 * u, 0, Math.PI * 2);
  ctx.fill();
  // highlight
  ctx.fillStyle = "#fff6b0";
  ctx.beginPath();
  ctx.arc(13 * u, 10 * u, 2.5 * u, 0, Math.PI * 2);
  ctx.fill();
  // base (gray)
  ctx.fillStyle = "#888";
  ctx.fillRect(13 * u, 19 * u, 6 * u, 3 * u);
  ctx.fillRect(14 * u, 22 * u, 4 * u, 2 * u);
  // outline
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(16 * u, 13 * u, 7 * u, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw a pixel-art coffee mug icon. */
function drawEmoteCoffee(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  // mug body
  ctx.fillStyle = "#d4a464";
  ctx.fillRect(9 * u, 12 * u, 12 * u, 12 * u);
  // handle
  ctx.strokeStyle = "#d4a464";
  ctx.lineWidth = 2.5 * u;
  ctx.beginPath();
  ctx.arc(23 * u, 18 * u, 3.5 * u, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // coffee surface
  ctx.fillStyle = "#5c3a1e";
  ctx.fillRect(10 * u, 13 * u, 10 * u, 2 * u);
  // steam
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(13 * u, 8 * u);
  ctx.quadraticCurveTo(15 * u, 6 * u, 13 * u, 4 * u);
  ctx.moveTo(18 * u, 8 * u);
  ctx.quadraticCurveTo(20 * u, 6 * u, 18 * u, 4 * u);
  ctx.stroke();
  // outline
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(9 * u, 12 * u, 12 * u, 12 * u);
}

/** Draw a pixel-art ZZZ sleep icon. */
function drawEmoteZzz(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  ctx.fillStyle = "#7a8caa";
  ctx.font = `bold ${10 * u}px 'M PLUS Rounded 1c', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Z", 10 * u, 22 * u);
  ctx.fillStyle = "#9aabc4";
  ctx.font = `bold ${8 * u}px 'M PLUS Rounded 1c', sans-serif`;
  ctx.fillText("z", 18 * u, 14 * u);
  ctx.fillStyle = "#bacae0";
  ctx.font = `bold ${6 * u}px 'M PLUS Rounded 1c', sans-serif`;
  ctx.fillText("z", 24 * u, 8 * u);
}

/** Draw a pixel-art clipboard icon. */
function drawEmoteClipboard(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  // board
  ctx.fillStyle = "#c4a878";
  ctx.fillRect(8 * u, 8 * u, 16 * u, 20 * u);
  // clip
  ctx.fillStyle = "#999";
  ctx.fillRect(12 * u, 6 * u, 8 * u, 4 * u);
  // paper
  ctx.fillStyle = "#fff";
  ctx.fillRect(10 * u, 12 * u, 12 * u, 14 * u);
  // lines on paper
  ctx.fillStyle = "#4a8cd4";
  ctx.fillRect(12 * u, 14 * u, 8 * u, 1.5 * u);
  ctx.fillRect(12 * u, 17 * u, 8 * u, 1.5 * u);
  ctx.fillRect(12 * u, 20 * u, 6 * u, 1.5 * u);
  // outline
  ctx.strokeStyle = "#8a7a5a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(8 * u, 8 * u, 16 * u, 20 * u);
}

/** Draw a pixel-art chat bubble icon. */
function drawEmoteChat(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  // bubble
  ctx.fillStyle = "#4a9cd8";
  ctx.beginPath();
  ctx.roundRect(6 * u, 6 * u, 20 * u, 16 * u, 4 * u);
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(10 * u, 22 * u);
  ctx.lineTo(8 * u, 27 * u);
  ctx.lineTo(14 * u, 22 * u);
  ctx.fill();
  // dots
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(12 * u, 14 * u, 2 * u, 0, Math.PI * 2);
  ctx.arc(18 * u, 14 * u, 2 * u, 0, Math.PI * 2);
  ctx.fill();
  // outline
  ctx.strokeStyle = "#2a7ab8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(6 * u, 6 * u, 20 * u, 16 * u, 4 * u);
  ctx.stroke();
}

/** Draw a pixel-art thought bubble icon. */
function drawEmoteThought(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  // main cloud
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(14 * u, 14 * u, 6 * u, 0, Math.PI * 2);
  ctx.arc(20 * u, 12 * u, 5 * u, 0, Math.PI * 2);
  ctx.arc(22 * u, 17 * u, 4 * u, 0, Math.PI * 2);
  ctx.arc(13 * u, 19 * u, 4 * u, 0, Math.PI * 2);
  ctx.fill();
  // small bubbles
  ctx.beginPath();
  ctx.arc(9 * u, 24 * u, 2.5 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6 * u, 28 * u, 1.5 * u, 0, Math.PI * 2);
  ctx.fill();
  // outline
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(14 * u, 14 * u, 6 * u, 0, Math.PI * 2);
  ctx.arc(20 * u, 12 * u, 5 * u, 0, Math.PI * 2);
  ctx.arc(22 * u, 17 * u, 4 * u, 0, Math.PI * 2);
  ctx.arc(13 * u, 19 * u, 4 * u, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw a pixel-art checkmark icon. */
function drawEmoteCheck(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  // green circle
  ctx.fillStyle = "#4cb866";
  ctx.beginPath();
  ctx.arc(16 * u, 16 * u, 11 * u, 0, Math.PI * 2);
  ctx.fill();
  // check
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3 * u;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10 * u, 16 * u);
  ctx.lineTo(14 * u, 20 * u);
  ctx.lineTo(22 * u, 11 * u);
  ctx.stroke();
  // outline
  ctx.strokeStyle = "#2a8848";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(16 * u, 16 * u, 11 * u, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw a pixel-art exclamation icon. */
function drawEmoteExclamation(ctx: CanvasRenderingContext2D, s: number): void {
  const u = s / 32;
  // red circle
  ctx.fillStyle = "#e05858";
  ctx.beginPath();
  ctx.arc(16 * u, 16 * u, 11 * u, 0, Math.PI * 2);
  ctx.fill();
  // exclamation
  ctx.fillStyle = "#fff";
  ctx.fillRect(14.5 * u, 8 * u, 3 * u, 10 * u);
  ctx.beginPath();
  ctx.arc(16 * u, 22 * u, 1.8 * u, 0, Math.PI * 2);
  ctx.fill();
  // outline
  ctx.strokeStyle = "#b03838";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(16 * u, 16 * u, 11 * u, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw the full emote spritesheet with all icons. */
function drawEmoteSheet(ctx: CanvasRenderingContext2D, frameSize: number): void {
  const drawers = [
    drawEmoteLightbulb,
    drawEmoteCoffee,
    drawEmoteZzz,
    drawEmoteClipboard,
    drawEmoteChat,
    drawEmoteThought,
    drawEmoteCheck,
    drawEmoteExclamation,
  ];
  for (let i = 0; i < drawers.length; i++) {
    ctx.save();
    ctx.translate(i * frameSize, 0);
    // transparent background — only draw the icon
    drawers[i](ctx, frameSize);
    ctx.restore();
  }
}

/** Draw an interior wall tile with pseudo-3D depth — top highlight, bottom shadow,
 *  edge shading, and wainscot trim. If an AI base image is provided, it is drawn
 *  first for detail, then shading is overlaid on top. Seamless left/right edges. */
function drawInteriorWall(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: number,
  topColor: number,
  bottomColor: number,
  accentColor: number,
  aiBase?: HTMLImageElement,
): void {
  // Base layer — AI texture for detail, or gradient fallback
  if (aiBase) {
    ctx.drawImage(aiBase, 0, 0, size, size);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, rgba(topColor, 1));
    grad.addColorStop(0.15, rgba(baseColor, 1));
    grad.addColorStop(0.85, rgba(baseColor, 1));
    grad.addColorStop(1, rgba(bottomColor, 1));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  // Vertical shading overlay — lighter at top, darker at bottom (multiply-style)
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, rgba(topColor, 0.15));
  grad.addColorStop(0.5, rgba(baseColor, 0));
  grad.addColorStop(1, rgba(bottomColor, 0.25));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Top edge highlight — simulates light catching the wall cap
  ctx.fillStyle = rgba(topColor, 0.4);
  ctx.fillRect(0, 0, size, 2);
  ctx.fillStyle = rgba(topColor, 0.2);
  ctx.fillRect(0, 2, size, 2);

  // Bottom edge shadow — where wall meets floor
  ctx.fillStyle = rgba(bottomColor, 0.5);
  ctx.fillRect(0, size - 4, size, 4);
  ctx.fillStyle = rgba(0x000000, 0.2);
  ctx.fillRect(0, size - 2, size, 2);

  // Left/right edge shadows — gives the wall thickness/angle
  ctx.fillStyle = rgba(0x000000, 0.15);
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(size - 2, 0, 2, size);

  // Wainscot line — horizontal trim at ~70% height for architectural detail
  const trimY = Math.floor(size * 0.7);
  ctx.fillStyle = rgba(accentColor, 0.3);
  ctx.fillRect(0, trimY, size, 1);
  ctx.fillStyle = rgba(topColor, 0.15);
  ctx.fillRect(0, trimY - 1, size, 1);

  // Below wainscot — slightly darker band
  ctx.fillStyle = rgba(bottomColor, 0.08);
  ctx.fillRect(0, trimY + 1, size, size - trimY - 5);
}

// ============================================================
// DOG NPC — yellow lab, 4 frames (idle, walk1, walk2, fetch)
// ============================================================

function drawDog(ctx: CanvasRenderingContext2D, frame: number, s: number): void {
  const cx = s * 0.5;
  const groundY = s * 0.85;
  const legPhase = frame === 1 ? 3 : frame === 2 ? -3 : 0;
  const tailWag = frame === 1 ? 8 : frame === 2 ? -8 : frame === 3 ? 12 : 0;
  const earFloppy = frame === 3 ? 3 : 0;

  drawGroundShadow(ctx, cx, groundY, s * 0.35);

  // --- hind leg (far, darker) ---
  drawLimb(ctx, cx - s * 0.12, s * 0.55, cx - s * 0.14 + legPhase, groundY - 2, 5, 3, 0xd4b860);

  // --- tail — short and thick, wagging ---
  ctx.save();
  ctx.strokeStyle = rgba(0xe8d080, 1);
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, s * 0.45);
  ctx.quadraticCurveTo(cx - s * 0.28, s * 0.38 + tailWag * 0.3, cx - s * 0.26, s * 0.28 + tailWag);
  ctx.stroke();
  ctx.restore();

  // --- body — pale yellow, stocky build ---
  ctx.save();
  const bodyGrad = ctx.createRadialGradient(cx - 3, s * 0.5, 2, cx, s * 0.55, s * 0.3);
  bodyGrad.addColorStop(0, rgba(0xf0d870, 1));
  bodyGrad.addColorStop(0.6, rgba(0xe8d080, 1));
  bodyGrad.addColorStop(1, rgba(0xd0b850, 1));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(cx, s * 0.55, s * 0.24, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- front leg (near) ---
  drawLimb(ctx, cx + s * 0.08, s * 0.6, cx + s * 0.1 - legPhase, groundY - 2, 5, 3, 0xe8d080);

  // --- head — rounded with snout ---
  ctx.save();
  const headX = cx + s * 0.2;
  const headY = s * 0.42;
  // head sphere — broad lab head
  ctx.fillStyle = rgba(0xf0d870, 1);
  ctx.beginPath();
  ctx.arc(headX, headY, s * 0.11, 0, Math.PI * 2);
  ctx.fill();
  // snout — broad blocky muzzle
  ctx.fillStyle = rgba(0xe8d080, 1);
  ctx.beginPath();
  ctx.ellipse(headX + s * 0.09, headY + s * 0.04, s * 0.07, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // nose
  ctx.fillStyle = rgba(0x222222, 1);
  ctx.beginPath();
  ctx.arc(headX + s * 0.12, headY + s * 0.01, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // eye
  ctx.fillStyle = rgba(0x222222, 1);
  ctx.beginPath();
  ctx.arc(headX + 2, headY - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  // eye shine
  ctx.fillStyle = rgba(0xffffff, 0.6);
  ctx.beginPath();
  ctx.arc(headX + 2.5, headY - 2.5, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // mouth — happy pant
  ctx.strokeStyle = rgba(0x222222, 0.8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(headX + s * 0.08, headY + s * 0.04, s * 0.025, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // ear — short, triangular, flopped forward
  ctx.fillStyle = rgba(0xd0b850, 1);
  ctx.beginPath();
  ctx.ellipse(headX - s * 0.05, headY + s * 0.02 + earFloppy, s * 0.045, s * 0.05, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- fetch frame: dog holding ball in mouth ---
  if (frame === 3) {
    ctx.fillStyle = rgba(0xccff44, 1);
    ctx.beginPath();
    ctx.arc(cx + s * 0.32, s * 0.45, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(0x88aa22, 0.5);
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

// ============================================================
// MAIN TEXTURE GENERATION ENTRY POINT
// ============================================================

const CREATURE_FRAMES = 4; // idle, walk1, walk2, attack
const BEAST_FRAMES = 4; // idle, move1, move2, attack
const TEX_SIZE = 128;

/** All procedural texture keys created by generateAllTextures, for force-removal. */
const ALL_PROC_KEYS = [
  "creature-slime", "creature-slug", "creature-wolf", "creature-skeleton", "creature-imp",
  "creature-wraith", "creature-fire-elemental",
  "beast-groveheart", "beast-stone-colossus", "beast-ash-wyrm",
  "beast-void-leviathan", "beast-infernal-sovereign",
  "friendly-unicorn", "friendly-fairy-bunny", "friendly-baby-dragon", "friendly-crystal-fox",
  "friendly-dog",
  "stone-proj", "spark", "dust", "shockwave", "recruit-beam", "slash-vfx", "crystal-arrow",
  "soft-glow", "fire-glow", "void-glow", "crystal-glow",
  "golf-club", "golf-ball", "axe", "net",
  "big-tree", "big-rock", "palm-tree", "mystic-tree", "tee-box", "leprechaun", "leprechaun-npc", "fountain-sheet",
  "cabin-wall", "cabin-door", "cabin-window", "cabin-roof",
  "lake-shore", "campfire", "void-rift",
  "wife-npc",
  "tennis-court", "tennis-wall", "tennis-racket", "tennis-ball", "tennis-net",
  "emote-icons",
  "interior-wall-0", "interior-wall-1", "interior-wall-2",
];

/**
 * Build an array of named generation steps for progressive loading.
 * Each step is a self-contained function that generates one category of textures.
 * Callers can spread these across frames to show a progress bar.
 */
export function getTextureGenerationSteps(scene: Phaser.Scene, force = false): Array<{ name: string; fn: () => void }> {
  const tex = scene.textures;
  if (force) {
    for (const key of ALL_PROC_KEYS) {
      if (tex.exists(key)) tex.remove(key);
    }
  }

  const steps: Array<{ name: string; fn: () => void }> = [];

  // --- Creature spritesheets ---
  steps.push({
    name: "Creatures",
    fn: () => {
      for (let i = 0; i < CREATURE_DESIGNS.length; i++) {
        const design = CREATURE_DESIGNS[i];
        const key = `creature-${design.name}`;
        if (tex.exists(key)) continue;

        // Use AI creature texture if available
        const aiKey = aiCreatureKey(tex, key);
        if (aiKey) {
          buildAiSpritesheet(tex, key, aiKey, CREATURE_FRAMES, TEX_SIZE);
          continue;
        }

        // Fall back to procedural canvas drawing
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
    },
  });

  // --- Beast spritesheets ---
  steps.push({
    name: "Beasts",
    fn: () => {
      for (let i = 0; i < BEAST_DESIGNS.length; i++) {
        const design = BEAST_DESIGNS[i];
        const key = `beast-${design.name}`;
        if (tex.exists(key)) continue;

        // Use AI beast texture if available
        const aiKey = aiCreatureKey(tex, key);
        if (aiKey) {
          buildAiSpritesheet(tex, key, aiKey, BEAST_FRAMES, TEX_SIZE);
          continue;
        }

        // Fall back to procedural canvas drawing
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
    },
  });

  // --- Friendly creature spritesheets ---
  steps.push({
    name: "Friendly creatures",
    fn: () => {
      for (let i = 0; i < FRIENDLY_DESIGNS.length; i++) {
        const design = FRIENDLY_DESIGNS[i];
        const key = `friendly-${design.name}`;
        if (tex.exists(key)) continue;

        // Use AI friendly creature texture if available
        const aiKey = aiCreatureKey(tex, key);
        if (aiKey) {
          buildAiSpritesheet(tex, key, aiKey, CREATURE_FRAMES, TEX_SIZE);
          continue;
        }

        // Fall back to procedural canvas drawing
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
    },
  });

  // --- Dog NPC spritesheet ---
  steps.push({
    name: "Dog NPC",
    fn: () => {
      const key = "friendly-dog";
      if (tex.exists(key)) return;

      const aiKey = aiCreatureKey(tex, key);
      if (aiKey) {
        buildAiSpritesheet(tex, key, aiKey, CREATURE_FRAMES, TEX_SIZE);
        return;
      }

      const sheetW = TEX_SIZE * CREATURE_FRAMES;
      const sheetH = TEX_SIZE;
      const canvasTex = createCanvasTexture(tex, key, sheetW, sheetH);
      const ctx = canvasTex.getContext();
      for (let f = 0; f < CREATURE_FRAMES; f++) {
        ctx.save();
        ctx.translate(f * TEX_SIZE, 0);
        drawDog(ctx, f, TEX_SIZE);
        ctx.restore();
      }
      canvasTex.refresh();
      registerFrames(tex.get(key)!, CREATURE_FRAMES, TEX_SIZE);
    },
  });

  // --- Effects & projectiles ---
  steps.push({
    name: "Effects",
    fn: () => {
      if (!tex.exists("stone-proj")) {
        const ct = createCanvasTexture(tex, "stone-proj", 24, 24);
        drawStoneTexture(ct.getContext(), 24);
        ct.refresh();
      }
      if (!tex.exists("spark")) {
        const ct = createCanvasTexture(tex, "spark", 32, 32);
        radialGradient(ct.getContext(), 16, 16, 16, 0xffffff, 0xffffff, 1, 0);
        ct.refresh();
      }
      if (!tex.exists("dust")) {
        const ct = createCanvasTexture(tex, "dust", 32, 32);
        radialGradient(ct.getContext(), 16, 16, 14, 0xccccaa, 0x886644, 0.6, 0);
        ct.refresh();
      }
      if (!tex.exists("shockwave")) {
        const ct = createCanvasTexture(tex, "shockwave", 96, 96);
        const ctx = ct.getContext();
        ctx.strokeStyle = rgba(0xffffff, 0.8);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(48, 48, 42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgba(0xffffff, 0.3);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(48, 48, 42, 0, Math.PI * 2);
        ctx.stroke();
        ct.refresh();
      }
      if (!tex.exists("recruit-beam")) {
        const ct = createCanvasTexture(tex, "recruit-beam", 32, 96);
        const ctx = ct.getContext();
        const grad = ctx.createLinearGradient(16, 0, 16, 96);
        grad.addColorStop(0, rgba(0x4cb866, 0));
        grad.addColorStop(0.5, rgba(0x4cb866, 0.6));
        grad.addColorStop(1, rgba(0x88ffaa, 0.9));
        ctx.fillStyle = grad;
        ctx.fillRect(10, 0, 12, 96);
        radialGradient(ctx, 16, 48, 16, 0x88ffaa, 0x4cb866, 0.4, 0);
        ct.refresh();
      }
      if (!tex.exists("slash-vfx")) {
        const ct = createCanvasTexture(tex, "slash-vfx", 64, 64);
        const ctx = ct.getContext();
        // Draw a crescent arc — thick at base, thinning toward the tip
        ctx.strokeStyle = rgba(0xffffff, 0.9);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 32, 28, -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
        // Inner brighter line
        ctx.strokeStyle = rgba(0xffffff, 0.5);
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.arc(0, 32, 28, -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
        ct.refresh();
      }
      if (!tex.exists("crystal-arrow")) {
        const ct = createCanvasTexture(tex, "crystal-arrow", 32, 12);
        const ctx = ct.getContext();
        // Arrow shaft
        ctx.fillStyle = rgba(0x44ffdd, 0.9);
        ctx.fillRect(2, 4, 24, 4);
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(26, 0);
        ctx.lineTo(32, 6);
        ctx.lineTo(26, 12);
        ctx.closePath();
        ctx.fill();
        // Fletching
        ctx.fillStyle = rgba(0x88ffee, 0.7);
        ctx.beginPath();
        ctx.moveTo(2, 4);
        ctx.lineTo(0, 0);
        ctx.lineTo(6, 4);
        ctx.lineTo(0, 8);
        ctx.lineTo(2, 8);
        ctx.closePath();
        ctx.fill();
        ct.refresh();
      }
    },
  });

  // --- Glows ---
  steps.push({
    name: "Light glows",
    fn: () => {
      if (!tex.exists("soft-glow")) {
        const ct = createCanvasTexture(tex, "soft-glow", 128, 128);
        radialGradient(ct.getContext(), 64, 64, 64, 0xffffff, 0x000000, 0.5, 0);
        ct.refresh();
      }
      if (!tex.exists("fire-glow")) {
        const ct = createCanvasTexture(tex, "fire-glow", 128, 128);
        radialGradient(ct.getContext(), 64, 64, 64, 0xff6600, 0xff0000, 0.4, 0);
        ct.refresh();
      }
      if (!tex.exists("void-glow")) {
        const ct = createCanvasTexture(tex, "void-glow", 128, 128);
        radialGradient(ct.getContext(), 64, 64, 64, 0xaa00ff, 0x000000, 0.3, 0);
        ct.refresh();
      }
      if (!tex.exists("crystal-glow")) {
        const ct = createCanvasTexture(tex, "crystal-glow", 128, 128);
        radialGradient(ct.getContext(), 64, 64, 64, 0x44aaff, 0x000033, 0.3, 0);
        ct.refresh();
      }
    },
  });

  // --- Items ---
  steps.push({
    name: "Items",
    fn: () => {
      if (!tex.exists("golf-club") && !aiItemKey(tex, "golf-club")) {
        const ct = createCanvasTexture(tex, "golf-club", 64, 64);
        drawGolfClub(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("golf-bag") && !aiItemKey(tex, "golf-bag")) {
        const ct = createCanvasTexture(tex, "golf-bag", 64, 64);
        drawGolfBag(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("golf-ball") && !aiItemKey(tex, "golf-ball")) {
        const ct = createCanvasTexture(tex, "golf-ball", 64, 64);
        drawGolfBall(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("axe") && !aiItemKey(tex, "axe")) {
        const ct = createCanvasTexture(tex, "axe", 64, 64);
        drawAxe(ct.getContext(), 64);
        ct.refresh();
      }
    },
  });

  // --- World objects ---
  steps.push({
    name: "World objects",
    fn: () => {
      if (!tex.exists("big-tree")) {
        const ct = createCanvasTexture(tex, "big-tree", 64, 64);
        drawBigTree(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("big-rock")) {
        const ct = createCanvasTexture(tex, "big-rock", 64, 64);
        drawBigRock(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("palm-tree")) {
        const ct = createCanvasTexture(tex, "palm-tree", 64, 64);
        drawPalmTree(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("mystic-tree")) {
        const ct = createCanvasTexture(tex, "mystic-tree", 64, 64);
        drawMysticTree(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("tee-box") && !aiItemKey(tex, "tee-box")) {
        const ct = createCanvasTexture(tex, "tee-box", 64, 64);
        drawTeeBox(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("leprechaun") && !aiItemKey(tex, "leprechaun")) {
        const ct = createCanvasTexture(tex, "leprechaun", 64, 64);
        drawLeprechaun(ct.getContext(), 64);
        ct.refresh();
      }
      // leprechaun NPC spritesheet — 4 frames for wandering animation
      if (!tex.exists("leprechaun-npc")) {
        const LEP_FRAMES = 4;
        const LEP_SIZE = 64;
        const ct = createCanvasTexture(tex, "leprechaun-npc", LEP_SIZE * LEP_FRAMES, LEP_SIZE);
        const ctx = ct.getContext();
        for (let f = 0; f < LEP_FRAMES; f++) {
          ctx.save();
          ctx.translate(f * LEP_SIZE, 0);
          drawLeprechaun(ctx, LEP_SIZE, f);
          ctx.restore();
        }
        ct.refresh();
        registerFrames(tex.get("leprechaun-npc")!, LEP_FRAMES, LEP_SIZE);
      }
      // cabin tiles — wall, door, window, roof
      if (!tex.exists("cabin-wall")) {
        const ct = createCanvasTexture(tex, "cabin-wall", 64, 64);
        drawCabinWall(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("cabin-door")) {
        const ct = createCanvasTexture(tex, "cabin-door", 64, 64);
        drawCabinDoor(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("cabin-window")) {
        const ct = createCanvasTexture(tex, "cabin-window", 64, 64);
        drawCabinWindow(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("cabin-roof")) {
        const ct = createCanvasTexture(tex, "cabin-roof", 64, 64);
        drawCabinRoof(ct.getContext(), 64);
        ct.refresh();
      }
      // lake shore tile
      if (!tex.exists("lake-shore")) {
        const ct = createCanvasTexture(tex, "lake-shore", 64, 64);
        drawLakeShore(ct.getContext(), 64);
        ct.refresh();
      }
      // campfire spritesheet — 2 frames for flicker animation
      if (!tex.exists("campfire")) {
        const CF_SIZE = 48;
        const CF_FRAMES = 2;
        const ct = createCanvasTexture(tex, "campfire", CF_SIZE * CF_FRAMES, CF_SIZE);
        const ctx = ct.getContext();
        for (let f = 0; f < CF_FRAMES; f++) {
          ctx.save();
          ctx.translate(f * CF_SIZE, 0);
          drawCampfire(ctx, CF_SIZE, f);
          ctx.restore();
        }
        ct.refresh();
        if (tex.get("campfire")) {
          const cfTex = tex.get("campfire")!;
          cfTex.add("campfire-0", 0, 0, 0, CF_SIZE, CF_SIZE);
          cfTex.add("campfire-1", 0, CF_SIZE, 0, CF_SIZE, CF_SIZE);
        }
      }
      // void rift texture
      if (!tex.exists("void-rift")) {
        const ct = createCanvasTexture(tex, "void-rift", 96, 64);
        drawVoidRift(ct.getContext(), 96);
        ct.refresh();
      }
      // wife NPC spritesheet — 2 frames (idle, walk)
      if (!tex.exists("wife-npc")) {
        const WIFE_FRAMES = 2;
        const WIFE_SIZE = 48;
        const ct = createCanvasTexture(tex, "wife-npc", WIFE_SIZE * WIFE_FRAMES, WIFE_SIZE);
        const ctx = ct.getContext();
        for (let f = 0; f < WIFE_FRAMES; f++) {
          ctx.save();
          ctx.translate(f * WIFE_SIZE, 0);
          drawWife(ctx, WIFE_SIZE, f);
          ctx.restore();
        }
        ct.refresh();
        registerFrames(tex.get("wife-npc")!, WIFE_FRAMES, WIFE_SIZE);
      }
      if (!tex.exists("fountain-sheet")) {
        const FOUNTAIN_FRAMES = 4;
        const FOUNTAIN_SIZE = 192; // 3x3 tiles at 64px each
        const ct = createCanvasTexture(tex, "fountain-sheet", FOUNTAIN_SIZE * FOUNTAIN_FRAMES, FOUNTAIN_SIZE);
        const ctx = ct.getContext();
        for (let f = 0; f < FOUNTAIN_FRAMES; f++) {
          ctx.save();
          ctx.translate(f * FOUNTAIN_SIZE, 0);
          drawFountainFrame(ctx, FOUNTAIN_SIZE, f, FOUNTAIN_FRAMES);
          ctx.restore();
        }
        ct.refresh();
        registerFrames(tex.get("fountain-sheet")!, FOUNTAIN_FRAMES, FOUNTAIN_SIZE);
      }
    },
  });

  // --- Tennis ---
  steps.push({
    name: "Tennis",
    fn: () => {
      if (!tex.exists("tennis-court") && !aiItemKey(tex, "tennis-court")) {
        const ct = createCanvasTexture(tex, "tennis-court", 64, 64);
        drawTennisCourt(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("tennis-wall") && !aiItemKey(tex, "tennis-wall")) {
        const ct = createCanvasTexture(tex, "tennis-wall", 64, 64);
        drawTennisWall(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("tennis-racket") && !aiItemKey(tex, "tennis-racket")) {
        const ct = createCanvasTexture(tex, "tennis-racket", 64, 64);
        drawTennisRacket(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("tennis-ball") && !aiItemKey(tex, "tennis-ball")) {
        const ct = createCanvasTexture(tex, "tennis-ball", 64, 64);
        drawTennisBall(ct.getContext(), 64);
        ct.refresh();
      }
      if (!tex.exists("tennis-net") && !aiItemKey(tex, "tennis-net")) {
        const ct = createCanvasTexture(tex, "tennis-net", 64, 64);
        drawTennisNet(ct.getContext(), 64);
        ct.refresh();
      }
    },
  });

  // --- Interior wall textures ---
  steps.push({
    name: "Interior walls",
    fn: () => {
      const wallSize = 64;
      const aiKeys = ["ai-office_wall_1", "ai-office_wall_2", "ai-office_wall_3"];
      const variants = [
        { key: "interior-wall-0", base: 0x8a7a6a, top: 0xa89a88, bottom: 0x5a4a3a, accent: 0x6a5a4a },
        { key: "interior-wall-1", base: 0x6a7a8a, top: 0x8a9aaa, bottom: 0x3a4a5a, accent: 0x4a5a6a },
        { key: "interior-wall-2", base: 0x7a8a6a, top: 0x9aaa8a, bottom: 0x4a5a3a, accent: 0x5a6a4a },
      ];
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (!tex.exists(v.key)) {
          const ct = createCanvasTexture(tex, v.key, wallSize, wallSize);
          let aiBase: HTMLImageElement | undefined;
          if (tex.exists(aiKeys[i])) {
            aiBase = tex.get(aiKeys[i]).getSourceImage() as HTMLImageElement;
          }
          drawInteriorWall(ct.getContext(), wallSize, v.base, v.top, v.bottom, v.accent, aiBase);
          ct.refresh();
        }
      }
    },
  });

  // --- Emote icons ---
  steps.push({
    name: "Emote icons",
    fn: () => {
      if (tex.exists("emote-icons")) return;
      const sheetW = EMOTE_FRAME_SIZE * EMOTE_FRAMES;
      const ct = createCanvasTexture(tex, "emote-icons", sheetW, EMOTE_FRAME_SIZE);
      drawEmoteSheet(ct.getContext(), EMOTE_FRAME_SIZE);
      ct.refresh();
      registerFrames(tex.get("emote-icons")!, EMOTE_FRAMES, EMOTE_FRAME_SIZE);
    },
  });

  return steps;
}

/**
 * Generate all procedural textures and register them with the Phaser texture manager.
 * @param force If true, remove existing textures before recreating (use when
 *   called from a different scene context to avoid stale WebGL bindings).
 */
export function generateAllTextures(scene: Phaser.Scene, force = false): void {
  const steps = getTextureGenerationSteps(scene, force);
  for (const step of steps) step.fn();
}

/** Get the creature texture key for a hostility level. */
export function creatureKey(hostility: number): string {
  const idx = Math.min(Math.floor(hostility), CREATURE_DESIGNS.length - 1);
  return `creature-${CREATURE_DESIGNS[idx].name}`;
}

/** Get the creature design for a hostility level. */
export function creatureDesign(hostility: number): CreatureDesign {
  return CREATURE_DESIGNS[Math.min(Math.floor(hostility), CREATURE_DESIGNS.length - 1)];
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

/** Get the friendly creature texture key by index. */
export function friendlyCreatureKey(index: number): string {
  const idx = ((index % FRIENDLY_DESIGNS.length) + FRIENDLY_DESIGNS.length) % FRIENDLY_DESIGNS.length;
  return `friendly-${FRIENDLY_DESIGNS[idx].name}`;
}

/** Number of friendly creature designs. */
export const FRIENDLY_CREATURE_COUNT = FRIENDLY_DESIGNS.length;
