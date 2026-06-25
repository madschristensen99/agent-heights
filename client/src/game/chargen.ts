/**
 * Runtime character sprite generator — draws smooth, anti-aliased characters
 * using Canvas2D primitives at 2x resolution for a modern look.
 */
import type Phaser from "phaser";
import {
  type CharAppearance,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  PANTS_COLORS, ACCESSORIES,
} from "../../../shared/types";

/** Resolution multiplier — logical coords are 64×96, rendered at 2x for crisp smooth output. */
const SHEET_SCALE = 2;

// ------------------------------------------------------------------- palette

export interface CharPalette {
  skin: string;
  hair: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  tie?: string;
  eyeColor?: string;
  hairStyle: string;
  accessory: string;
}

export function mix(hex1: string, hex2: string, t: number): string {
  const r = Math.round(parseInt(hex1.slice(1, 3), 16) + (parseInt(hex2.slice(1, 3), 16) - parseInt(hex1.slice(1, 3), 16)) * t);
  const g = Math.round(parseInt(hex1.slice(3, 5), 16) + (parseInt(hex2.slice(3, 5), 16) - parseInt(hex1.slice(3, 5), 16)) * t);
  const b = Math.round(parseInt(hex1.slice(5, 7), 16) + (parseInt(hex2.slice(5, 7), 16) - parseInt(hex1.slice(5, 7), 16)) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function appearanceToPalette(ap: CharAppearance): CharPalette {
  return {
    skin: SKIN_TONES[ap.skin % SKIN_TONES.length],
    hair: HAIR_COLORS[ap.hair % HAIR_COLORS.length],
    shirt: SHIRT_COLORS[ap.shirt % SHIRT_COLORS.length],
    shirtShade: mix(SHIRT_COLORS[ap.shirt % SHIRT_COLORS.length], "#000000", 0.2),
    pants: PANTS_COLORS[ap.pants % PANTS_COLORS.length],
    hairStyle: HAIR_STYLES[ap.hairStyle % HAIR_STYLES.length],
    accessory: ACCESSORIES[ap.accessory % ACCESSORIES.length],
  };
}

// ------------------------------------------------------------- canvas sheet

class CanvasSheet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  clip: { x: number; y: number; w: number; h: number } | null = null;

  constructor(
    public w: number,
    public h: number,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w * SHEET_SCALE;
    this.canvas.height = h * SHEET_SCALE;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.scale(SHEET_SCALE, SHEET_SCALE);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  private saveClip(): void {
    if (this.clip) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(this.clip.x, this.clip.y, this.clip.w, this.clip.h);
      this.ctx.clip();
    }
  }

  private restoreClip(): void {
    if (this.clip) this.ctx.restore();
  }

  set(x: number, y: number, hex: string): void {
    x = Math.round(x);
    y = Math.round(y);
    this.saveClip();
    this.ctx.fillStyle = hex;
    this.ctx.fillRect(x, y, 1, 1);
    this.restoreClip();
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    this.saveClip();
    this.ctx.fillStyle = hex;
    this.ctx.fillRect(x, y, w, h);
    this.restoreClip();
  }

  flipH(x: number, y: number, w: number, h: number): void {
    const px = x * SHEET_SCALE;
    const py = y * SHEET_SCALE;
    const pw = w * SHEET_SCALE;
    const ph = h * SHEET_SCALE;
    const tmp = document.createElement("canvas");
    tmp.width = pw;
    tmp.height = ph;
    const tctx = tmp.getContext("2d")!;
    tctx.drawImage(this.canvas, px, py, pw, ph, 0, 0, pw, ph);
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(px, py, pw, ph);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(tmp, -px - pw, py);
    this.ctx.restore();
  }

  setAlpha(x: number, y: number, hex: string, a: number): void {
    x = Math.round(x);
    y = Math.round(y);
    this.saveClip();
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = hex;
    this.ctx.fillRect(x, y, 1, 1);
    this.ctx.globalAlpha = 1;
    this.restoreClip();
  }

  fillCircle(cx: number, cy: number, r: number, hex: string): void {
    if (r <= 0) { this.set(cx, cy, hex); return; }
    this.saveClip();
    this.ctx.fillStyle = hex;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.restoreClip();
  }

  fillCircleAlpha(cx: number, cy: number, r: number, hex: string, a: number): void {
    if (r <= 0) { this.setAlpha(cx, cy, hex, a); return; }
    this.saveClip();
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = hex;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
    this.restoreClip();
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, hex: string): void {
    if (rx <= 0 || ry <= 0) { this.set(cx, cy, hex); return; }
    this.saveClip();
    this.ctx.fillStyle = hex;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.restoreClip();
  }

  line(x0: number, y0: number, x1: number, y1: number, hex: string): void {
    this.saveClip();
    this.ctx.strokeStyle = hex;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x0 + 0.5, y0 + 0.5);
    this.ctx.lineTo(x1 + 0.5, y1 + 0.5);
    this.ctx.stroke();
    this.restoreClip();
  }

  lineThick(x0: number, y0: number, x1: number, y1: number, hex: string, thick: number): void {
    this.saveClip();
    this.ctx.strokeStyle = hex;
    this.ctx.lineWidth = thick;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.stroke();
    this.ctx.lineCap = "butt";
    this.restoreClip();
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, hex: string): void {
    this.saveClip();
    this.ctx.fillStyle = hex;
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.closePath();
    this.ctx.fill();
    this.restoreClip();
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, r: number, hex: string): void {
    r = Math.min(r, w / 2, h / 2);
    this.saveClip();
    this.ctx.fillStyle = hex;
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.arcTo(x + w, y, x + w, y + r, r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.arcTo(x, y + h, x, y + h - r, r);
    this.ctx.lineTo(x, y + r);
    this.ctx.arcTo(x, y, x + r, y, r);
    this.ctx.closePath();
    this.ctx.fill();
    this.restoreClip();
  }

  blurEdges(x: number, y: number, w: number, h: number, hex: string, a: number): void {
    this.saveClip();
    this.ctx.globalAlpha = a;
    this.ctx.strokeStyle = hex;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.ctx.globalAlpha = 1;
    this.restoreClip();
  }

  toCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}

// --------------------------------------------------------------- draw char

const CW = 64;
const CH = 96;
const SHOE = "#3a3548";
const OUTLINE = "#2e2640";

type Dir = "down" | "left" | "right" | "up";
const DIRS: Dir[] = ["down", "left", "right", "up"];

function drawChar(s: CanvasSheet, ox: number, oy: number, pal: CharPalette, dir: Dir, pose: number): void {
  const mirror = dir === "left";
  const d: Dir = mirror ? "right" : dir;

  const isIdle = pose === 6;
  const isBlink = pose === 7;
  const stepping = pose === 1 || pose === 3 || pose === 5;
  const bodyBob = isIdle ? -1 : (stepping ? 1 : 0);
  const headBob = isIdle ? -1 : (stepping ? 2 : (pose === 2 || pose === 4 ? 1 : 0));
  const headSway = pose === 1 ? -1 : pose === 3 ? 1 : pose === 4 ? -1 : 0;
  const armSwingL = pose === 1 ? -1 : pose === 3 ? 1 : pose === 4 ? -1 : 0;
  const armSwingR = pose === 1 ? 1 : pose === 3 ? -1 : pose === 4 ? 1 : 0;
  const armSwing = pose === 1 ? 2 : pose === 3 ? -2 : pose === 4 ? 2 : 0;
  const hairBounce = stepping ? 1 : 0;
  const breathing = isIdle;
  const eyesClosed = isBlink;
  const eyeColor = pal.eyeColor ?? "#2a2040";

  const skinLi = mix(pal.skin, "#ffffff", 0.30);
  const skinMid = mix(pal.skin, "#ffffff", 0.10);
  const skinDk = mix(pal.skin, "#000000", 0.20);
  const skinRim = mix(pal.skin, "#ffffff", 0.45);
  const hairLi = mix(pal.hair, "#ffffff", 0.28);
  const hairMid = mix(pal.hair, "#ffffff", 0.10);
  const hairDk = mix(pal.hair, "#000000", 0.25);
  const hairRim = mix(pal.hair, "#ffffff", 0.50);
  const shirtLi = mix(pal.shirt, "#ffffff", 0.22);
  const shirtMid = mix(pal.shirt, "#ffffff", 0.08);
  const shirtDk = pal.shirtShade;
  const pantsLi = mix(pal.pants, "#ffffff", 0.15);
  const pantsMid = mix(pal.pants, "#ffffff", 0.05);
  const pantsDk = mix(pal.pants, "#000000", 0.22);
  const blush = mix(pal.skin, "#ff88aa", 0.35);
  const shoeLi = mix(SHOE, "#ffffff", 0.18);
  const shoeMid = mix(SHOE, "#ffffff", 0.06);
  const shoeDk = mix(SHOE, "#000000", 0.25);

  const hx = (x: number) => ox + x + headSway;
  const hy = (y: number) => oy + y + headBob;
  const bx = (x: number) => ox + x;
  const by = (y: number) => oy + y + bodyBob;
  const lx = (x: number) => ox + x;
  const ly = (y: number) => oy + y;

  const el = (cx: number, cy: number, rx: number, ry: number, c: string) => s.fillEllipse(cx, cy, rx, ry, c);
  const ci = (cx: number, cy: number, r: number, c: string) => s.fillCircle(cx, cy, r, c);
  const rr = (x: number, y: number, w: number, h: number, r: number, c: string) => s.fillRoundedRect(x, y, w, h, r, c);
  const ciO = (cx: number, cy: number, r: number, fill: string) => {
    s.fillCircle(cx, cy, r + 1, OUTLINE);
    s.fillCircle(cx, cy, r, fill);
  };
  const elO = (cx: number, cy: number, rx: number, ry: number, fill: string) => {
    s.fillEllipse(cx, cy, rx + 1, ry + 1, OUTLINE);
    s.fillEllipse(cx, cy, rx, ry, fill);
  };
  const rrO = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    s.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, r + 1, OUTLINE);
    s.fillRoundedRect(x, y, w, h, r, fill);
  };

  // ===== HAIR STYLES =====
  const drawHairDown = () => {
    const hs = pal.hairStyle;
    const hb = hairBounce;
    if (hs === "bald") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(32), hy(15), 10, 2, skinDk);
    } else if (hs === "balding") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(17), hy(18), 4, 5 + hb, pal.hair); el(hx(47), hy(18), 4, 5 + hb, pal.hair);
      el(hx(32), hy(14), 6, 3, pal.hair);
      s.set(hx(27), hy(15), pal.skin); s.set(hx(37), hy(15), pal.skin);
      el(hx(32), hy(16), 4, 1, hairDk);
      el(hx(28), hy(12), 3, 2, hairLi); el(hx(36), hy(12), 3, 2, hairMid);
    } else if (hs === "spiky") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(32 + i * 6); s.set(sx, hy(4 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(5 + Math.abs(i) * 2), pal.hair); s.set(sx - 1, hy(6 + Math.abs(i) * 2), pal.hair); }
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair);
      s.set(hx(24), hy(14), pal.hair); s.set(hx(30), hy(13), pal.hair); s.set(hx(34), hy(13), pal.hair); s.set(hx(40), hy(14), pal.hair);
      el(hx(28), hy(8), 6, 3, hairLi); el(hx(34), hy(10), 7, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "long") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(14), hy(22), 5, 16 + hb, pal.hair); el(hx(50), hy(22), 5, 16 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(26), hy(10), 4, 2, hairRim); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); el(hx(14), hy(28), 3, 8, hairDk); el(hx(50), hy(28), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(32), hy(14), 15, 4, pal.hair);
      el(hx(18), hy(18), 3, 5, pal.hair); el(hx(46), hy(18), 3, 5, pal.hair);
      el(hx(28), hy(12), 6, 2, hairLi); el(hx(34), hy(13), 6, 2, hairMid); el(hx(43), hy(16), 3, 5, hairDk);
    } else if (hs === "ponytail") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(17), hy(18), 4, 7, pal.hair);
      el(hx(50), hy(15), 3, 8 + hb, pal.hair); s.set(hx(52), hy(17 + hb), pal.hair); s.set(hx(53), hy(20 + hb), pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
      el(hx(51), hy(14), 2, 3, hairLi);
    } else if (hs === "swept") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      el(hx(36), hy(15), 10, 3, pal.hair);
      rr(hx(25), hy(16), 20, 2, 3, pal.hair);
      s.set(hx(24), hy(15), pal.skin); s.set(hx(25), hy(14), pal.skin);
      s.set(hx(22), hy(13), pal.hair); s.set(hx(23), hy(12), pal.hair);
      el(hx(26), hy(9), 6, 3, hairLi); el(hx(32), hy(11), 7, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "curly") {
      el(hx(32), hy(12), 16, 5, pal.hair);
      ci(hx(22), hy(8), 4, pal.hair); ci(hx(32), hy(6), 5, pal.hair); ci(hx(42), hy(8), 4, pal.hair);
      el(hx(16), hy(19), 5, 8 + hb, pal.hair); el(hx(48), hy(19), 5, 8 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); ci(hx(25), hy(15), 3, pal.hair); ci(hx(39), hy(15), 3, pal.hair);
      ci(hx(26), hy(8), 2, hairLi); ci(hx(34), hy(7), 2, hairRim); el(hx(38), hy(10), 4, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "bun") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      ci(hx(32), hy(4), 5, pal.hair); ci(hx(32), hy(4), 3, hairMid);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
      ci(hx(30), hy(3), 2, hairRim);
    } else {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(17), hy(18), 4, 7 + hb, pal.hair); el(hx(47), hy(18), 4, 7 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(26), hy(10), 4, 2, hairRim); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); s.set(hx(44), hy(14), hairDk); s.set(hx(45), hy(18), hairDk);
    }
  };

  const drawHairUp = () => {
    const hs = pal.hairStyle;
    const hb = hairBounce;
    if (hs === "bald") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(32), hy(18), 14, 3, skinDk);
    } else if (hs === "balding") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(18), hy(20), 4, 8, pal.hair); el(hx(46), hy(20), 4, 8, pal.hair);
      el(hx(32), hy(27), 10, 5, pal.hair);
      el(hx(32), hy(16), 6, 2, pal.hair);
      el(hx(28), hy(14), 3, 2, hairLi); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "spiky") {
      el(hx(32), hy(17), 16, 14, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(32 + i * 6); s.set(sx, hy(8 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(9 + Math.abs(i) * 2), pal.hair); }
      el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "long") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(18), hy(24), 5, 16 + hb, pal.hair); el(hx(46), hy(24), 5, 16 + hb, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
      el(hx(18), hy(30), 3, 8, hairDk); el(hx(46), hy(30), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(32), hy(18), 15, 10, pal.hair); el(hx(32), hy(27), 14, 5, pal.hair);
      el(hx(28), hy(13), 6, 2, hairLi); el(hx(34), hy(14), 6, 2, hairMid); el(hx(40), hy(20), 4, 7, hairDk);
    } else if (hs === "ponytail") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(48), hy(20), 4, 10 + hb, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "swept") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "curly") {
      el(hx(32), hy(17), 16, 14, pal.hair);
      ci(hx(22), hy(12), 4, pal.hair); ci(hx(32), hy(10), 5, pal.hair); ci(hx(42), hy(12), 4, pal.hair);
      el(hx(32), hy(27), 14, 7, pal.hair);
      ci(hx(26), hy(12), 2, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "bun") {
      el(hx(32), hy(17), 16, 14, pal.hair); ci(hx(32), hy(8), 5, pal.hair); ci(hx(32), hy(8), 3, hairMid);
      el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(26), hy(12), 3, 2, hairRim); el(hx(34), hy(13), 8, 4, hairMid);
      el(hx(40), hy(20), 5, 9, hairDk); rr(hx(23), hy(29), 18, 4, 3, hairDk);
      s.set(hx(42), hy(18), hairDk); s.set(hx(43), hy(22), hairDk); s.set(hx(44), hy(25), hairDk);
    }
  };

  const drawHairRight = () => {
    const hs = pal.hairStyle;
    const hb = hairBounce;
    if (hs === "bald") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(32), hy(15), 10, 2, skinDk);
    } else if (hs === "balding") {
      ci(hx(32), hy(18), 16, pal.skin);
      el(hx(19), hy(21), 5, 7 + hb, pal.hair);
      el(hx(32), hy(15), 6, 2, pal.hair);
      s.set(hx(28), hy(16), pal.skin);
      el(hx(26), hy(10), 3, 2, hairLi); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "spiky") {
      el(hx(30), hy(13), 16, 5, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(30 + i * 5); s.set(sx, hy(4 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(5 + Math.abs(i) * 2), pal.hair); }
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(8), 5, 2, hairLi); el(hx(32), hy(10), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "long") {
      el(hx(30), hy(13), 16, 5, pal.hair);
      el(hx(17), hy(21), 5, 14 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
      el(hx(17), hy(28), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(30), hy(14), 15, 4, pal.hair); el(hx(20), hy(21), 4, 7, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      el(hx(26), hy(11), 5, 2, hairLi); el(hx(32), hy(13), 5, 2, hairMid); el(hx(21), hy(19), 3, 7, hairDk);
    } else if (hs === "ponytail") {
      el(hx(30), hy(13), 16, 5, pal.hair);
      el(hx(16), hy(18), 4, 10 + hb, pal.hair); s.set(hx(15), hy(20 + hb), pal.hair); s.set(hx(15), hy(22 + hb), pal.hair);
      el(hx(19), hy(21), 5, 9, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "swept") {
      el(hx(30), hy(13), 16, 5, pal.hair); el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(36), hy(16), 10, 2, pal.hair); rr(hx(27), hy(16), 18, 2, 3, pal.hair);
      s.set(hx(26), hy(15), pal.skin);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "curly") {
      el(hx(30), hy(12), 16, 5, pal.hair);
      ci(hx(24), hy(8), 4, pal.hair); ci(hx(32), hy(6), 5, pal.hair); ci(hx(38), hy(8), 4, pal.hair);
      el(hx(18), hy(21), 5, 10 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); ci(hx(28), hy(16), 3, pal.hair);
      ci(hx(26), hy(8), 2, hairLi); el(hx(32), hy(10), 5, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "bun") {
      el(hx(30), hy(13), 16, 5, pal.hair); ci(hx(28), hy(5), 5, pal.hair); ci(hx(28), hy(5), 3, hairMid);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else {
      el(hx(30), hy(13), 16, 5, pal.hair); el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(24), hy(10), 3, 2, hairRim); el(hx(32), hy(11), 6, 3, hairMid);
      el(hx(21), hy(19), 4, 9, hairDk); s.set(hx(22), hy(17), hairDk); s.set(hx(23), hy(15), hairDk);
    }
  };

  // ===== ACCESSORIES =====
  const drawAccessory = (dir2: Dir) => {
    const ac = pal.accessory;
    if (ac === "glasses") {
      const gc = mix(pal.shirt, "#000000", 0.3);
      if (dir2 === "down") {
        s.rect(hx(24), hy(21), 6, 1, gc); s.rect(hx(24), hy(25), 6, 1, gc); s.rect(hx(24), hy(21), 1, 5, gc); s.rect(hx(29), hy(21), 1, 5, gc);
        s.rect(hx(33), hy(21), 6, 1, gc); s.rect(hx(33), hy(25), 6, 1, gc); s.rect(hx(33), hy(21), 1, 5, gc); s.rect(hx(38), hy(21), 1, 5, gc);
        s.rect(hx(30), hy(23), 3, 1, gc);
      } else if (dir2 === "right") {
        s.rect(hx(34), hy(21), 6, 1, gc); s.rect(hx(34), hy(25), 6, 1, gc); s.rect(hx(34), hy(21), 1, 5, gc); s.rect(hx(39), hy(21), 1, 5, gc);
      }
    } else if (ac === "headband") {
      const hc = pal.shirt;
      if (dir2 === "down") { rr(hx(19), hy(13), 26, 3, 1, hc); s.set(hx(20), hy(12), hc); s.set(hx(44), hy(12), hc); }
      else if (dir2 === "up") { rr(hx(18), hy(13), 28, 3, 1, hc); }
      else if (dir2 === "right") { rr(hx(22), hy(13), 22, 3, 1, hc); }
    } else if (ac === "earrings") {
      const ec = "#ffd700";
      if (dir2 === "down") { s.set(hx(18), hy(28), ec); s.set(hx(46), hy(28), ec); }
      else if (dir2 === "right") { s.set(hx(28), hy(27), ec); }
    }
  };

  // ===== ROUNDED CHIBI (64x96) — detailed, crisp edges =====

  if (d === "down") {
    ci(hx(32), hy(18), 17, OUTLINE);
    el(hx(32), hy(22), 13, 12, pal.skin);
    drawHairDown();
    s.set(hx(32), hy(19), pal.skin);
    el(hx(26), hy(20), 3, 8, skinLi);
    el(hx(27), hy(19), 2, 3, skinRim);
    el(hx(38), hy(22), 3, 8, skinMid);
    el(hx(40), hy(24), 3, 6, skinDk);
    el(hx(32), hy(32), 10, 2, skinDk);
    s.set(hx(26), hy(19), hairDk);
    s.set(hx(27), hy(19), hairDk);
    s.set(hx(36), hy(19), hairDk);
    s.set(hx(37), hy(19), hairDk);
    if (eyesClosed) {
      rr(hx(26), hy(23), 4, 2, 2, eyeColor);
      rr(hx(34), hy(23), 4, 2, 2, eyeColor);
    } else {
      el(hx(28), hy(23), 2, 4, eyeColor);
      el(hx(36), hy(23), 2, 4, eyeColor);
      s.set(hx(27), hy(22), "#ffffff");
      s.set(hx(35), hy(22), "#ffffff");
    }
    s.set(hx(31), hy(29), skinDk);
    s.set(hx(32), hy(30), skinDk);
    s.set(hx(33), hy(30), skinDk);
    s.set(hx(34), hy(29), skinDk);
    ci(hx(24), hy(27), 2, blush);
    ci(hx(40), hy(27), 2, blush);
    drawAccessory("down");

    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), OUTLINE);
    s.set(bx(34), by(34), OUTLINE);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    const tw = breathing ? 24 : 22;
    const tx = breathing ? 20 : 21;
    rrO(bx(tx), by(38), tw, 18, 5, pal.shirt);
    rr(bx(tx + 2), by(38), tw - 4, 3, 3, shirtLi);
    rr(bx(tx + 4), by(38), tw - 8, 2, 2, shirtMid);
    rr(bx(tx), by(38), 2, 18, 2, shirtLi);
    rr(bx(tx + 3), by(38), 2, 18, 2, shirtMid);
    rr(bx(tx + tw - 2), by(38), 2, 18, 2, shirtDk);
    rr(bx(tx), by(52), tw, 4, 3, shirtDk);
    rr(bx(tx + 4), by(38), tw - 8, 2, 1, shirtLi);
    s.set(bx(tx + 5), by(40), shirtDk);
    s.set(bx(tx + tw - 6), by(40), shirtDk);
    if (pal.tie) {
      rr(bx(30), by(40), 4, 7, 2, pal.tie);
      rr(bx(28), by(45), 8, 2, 1, pal.tie);
      rr(bx(30), by(47), 4, 2, 1, pal.tie);
    }
    s.rect(bx(tx), by(55), tw, 1, pantsDk);
    s.set(bx(31), by(42), shirtDk);
    s.set(bx(31), by(46), shirtDk);
    s.set(bx(31), by(50), shirtDk);

    elO(bx(17 + armSwingL), by(45), 4, 7, pal.shirt);
    el(bx(16 + armSwingL), by(43), 2, 3, shirtLi);
    el(bx(17 + armSwingL), by(44), 2, 4, shirtMid);
    elO(bx(45 + armSwingR), by(45), 4, 7, pal.shirt);
    el(bx(46 + armSwingR), by(48), 2, 3, shirtDk);
    ciO(bx(17 + armSwingL), by(53), 3, pal.skin);
    s.set(bx(16 + armSwingL), by(52), skinLi);
    ciO(bx(45 + armSwingR), by(53), 3, pal.skin);
    s.set(bx(46 + armSwingR), by(54), skinDk);

    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const fx = leftUp ? 33 : 23;
      const rx2 = leftUp ? 23 : 33;
      rrO(lx(fx), ly(58), 8, 14, 3, pal.pants);
      rr(lx(fx), ly(58), 2, 14, 2, pantsLi);
      rr(lx(fx + 3), ly(58), 2, 14, 2, pantsMid);
      elO(lx(fx + 4), ly(74), 6, 4, SHOE);
      s.set(lx(fx + 2), ly(73), shoeLi);
      s.set(lx(fx + 3), ly(73), shoeMid);
      s.set(lx(fx + 6), ly(76), shoeDk);
      rrO(lx(rx2), ly(60), 8, 10, 3, pal.pants);
      elO(lx(rx2 + 4), ly(72), 6, 4, SHOE);
      s.set(lx(rx2 + 2), ly(71), shoeLi);
    } else {
      rrO(lx(23), ly(58), 8, 14, 3, pal.pants);
      rrO(lx(33), ly(58), 8, 14, 3, pal.pants);
      rr(lx(23), ly(58), 2, 14, 2, pantsLi);
      rr(lx(23) + 3, ly(58), 2, 14, 2, pantsMid);
      rr(lx(33), ly(58), 2, 14, 2, pantsLi);
      rr(lx(33) + 3, ly(58), 2, 14, 2, pantsMid);
      elO(lx(27), ly(74), 6, 4, SHOE);
      elO(lx(37), ly(74), 6, 4, SHOE);
      s.set(lx(25), ly(73), shoeLi);
      s.set(lx(26), ly(73), shoeMid);
      s.set(lx(35), ly(73), shoeLi);
      s.set(lx(36), ly(73), shoeMid);
      s.set(lx(29), ly(76), shoeDk);
      s.set(lx(39), ly(76), shoeDk);
    }

  } else if (d === "up") {
    ci(hx(32), hy(18), 17, OUTLINE);
    drawHairUp();
    drawAccessory("up");

    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), OUTLINE);
    s.set(bx(34), by(34), OUTLINE);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    rrO(bx(21), by(38), 22, 18, 5, pal.shirt);
    rr(bx(23), by(38), 18, 3, 3, shirtLi);
    rr(bx(25), by(38), 14, 2, 2, shirtMid);
    rr(bx(21), by(38), 2, 18, 2, shirtLi);
    rr(bx(23), by(38), 2, 18, 2, shirtMid);
    rr(bx(40), by(38), 2, 18, 2, shirtDk);
    rr(bx(21), by(52), 22, 4, 3, shirtDk);
    s.set(bx(31), by(40), shirtDk);
    s.set(bx(32), by(42), shirtDk);
    s.set(bx(31), by(44), shirtDk);
    s.rect(bx(21), by(55), 22, 1, pantsDk);

    elO(bx(17 + armSwingL), by(45), 4, 7, pal.shirt);
    elO(bx(45 + armSwingR), by(45), 4, 7, pal.shirt);
    el(bx(16 + armSwingL), by(43), 2, 3, shirtLi);
    el(bx(17 + armSwingL), by(44), 2, 4, shirtMid);
    el(bx(46 + armSwingR), by(48), 2, 3, shirtDk);
    ciO(bx(17 + armSwingL), by(53), 3, pal.skin);
    ciO(bx(45 + armSwingR), by(53), 3, pal.skin);
    s.set(bx(46 + armSwingR), by(54), skinDk);

    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const fx = leftUp ? 33 : 23;
      const rx2 = leftUp ? 23 : 33;
      rrO(lx(fx), ly(58), 8, 14, 3, pal.pants);
      rr(lx(fx), ly(58), 2, 14, 2, pantsLi);
      rr(lx(fx + 3), ly(58), 2, 14, 2, pantsMid);
      elO(lx(fx + 4), ly(74), 6, 4, SHOE);
      s.set(lx(fx + 2), ly(73), shoeLi);
      s.set(lx(fx + 3), ly(73), shoeMid);
      s.set(lx(fx + 6), ly(76), shoeDk);
      rrO(lx(rx2), ly(60), 8, 10, 3, pal.pants);
      elO(lx(rx2 + 4), ly(72), 6, 4, SHOE);
      s.set(lx(rx2 + 2), ly(71), shoeLi);
    } else {
      rrO(lx(23), ly(58), 8, 14, 3, pal.pants);
      rrO(lx(33), ly(58), 8, 14, 3, pal.pants);
      rr(lx(23), ly(58), 2, 14, 2, pantsLi);
      rr(lx(23) + 3, ly(58), 2, 14, 2, pantsMid);
      rr(lx(33), ly(58), 2, 14, 2, pantsLi);
      rr(lx(33) + 3, ly(58), 2, 14, 2, pantsMid);
      elO(lx(27), ly(74), 6, 4, SHOE);
      elO(lx(37), ly(74), 6, 4, SHOE);
      s.set(lx(25), ly(73), shoeLi);
      s.set(lx(26), ly(73), shoeMid);
      s.set(lx(35), ly(73), shoeLi);
      s.set(lx(36), ly(73), shoeMid);
      s.set(lx(29), ly(76), shoeDk);
      s.set(lx(39), ly(76), shoeDk);
    }

  } else {
    ci(hx(32), hy(18), 17, OUTLINE);
    el(hx(35), hy(24), 11, 9, pal.skin);
    drawHairRight();
    s.set(hx(32), hy(19), pal.skin);
    s.set(hx(28), hy(24), skinDk);
    s.set(hx(28), hy(25), pal.skin);
    s.set(hx(28), hy(26), skinDk);
    el(hx(31), hy(22), 3, 6, skinLi);
    el(hx(30), hy(21), 2, 3, skinRim);
    el(hx(38), hy(24), 3, 5, skinMid);
    el(hx(41), hy(26), 2, 4, skinDk);
    el(hx(36), hy(31), 8, 2, skinDk);
    s.set(hx(37), hy(19), hairDk);
    s.set(hx(38), hy(19), hairDk);
    if (eyesClosed) {
      rr(hx(36), hy(23), 4, 2, 2, eyeColor);
    } else {
      el(hx(38), hy(23), 2, 4, eyeColor);
      s.set(hx(37), hy(22), "#ffffff");
    }
    s.set(hx(45), hy(25), skinDk);
    s.set(hx(46), hy(25), skinDk);
    s.set(hx(46), hy(24), skinLi);
    s.set(hx(40), hy(29), skinDk);
    s.set(hx(41), hy(30), skinDk);
    s.set(hx(42), hy(30), skinDk);
    s.set(hx(43), hy(29), skinDk);
    ci(hx(32), hy(27), 2, blush);
    drawAccessory("right");

    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), OUTLINE);
    s.set(bx(34), by(34), OUTLINE);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    rrO(bx(23), by(38), 18, 18, 5, pal.shirt);
    rr(bx(25), by(38), 14, 3, 3, shirtLi);
    rr(bx(27), by(38), 10, 2, 2, shirtMid);
    rr(bx(23), by(38), 2, 18, 2, shirtLi);
    rr(bx(25), by(38), 2, 18, 2, shirtMid);
    rr(bx(37), by(38), 2, 18, 2, shirtDk);
    rr(bx(23), by(52), 18, 4, 3, shirtDk);
    s.set(bx(25), by(40), shirtDk);
    s.set(bx(26), by(41), shirtDk);
    s.rect(bx(23), by(55), 18, 1, pantsDk);

    elO(bx(37 + armSwing), by(45), 4, 8, pal.shirt);
    el(bx(36 + armSwing), by(43), 2, 3, shirtLi);
    el(bx(37 + armSwing), by(44), 2, 4, shirtMid);
    ciO(bx(37 + armSwing), by(54), 3, pal.skin);
    s.set(bx(36 + armSwing), by(53), skinLi);
    s.set(bx(38 + armSwing), by(55), skinDk);

    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const frontX = leftUp ? 29 : 25;
      const backX = leftUp ? 25 : 29;
      rrO(lx(frontX), ly(58), 8, 14, 3, pal.pants);
      rr(lx(frontX), ly(58), 2, 14, 2, pantsLi);
      rr(lx(frontX) + 3, ly(58), 2, 14, 2, pantsMid);
      elO(lx(frontX + 4), ly(74), 6, 4, SHOE);
      s.set(lx(frontX + 2), ly(73), shoeLi);
      s.set(lx(frontX + 3), ly(73), shoeMid);
      s.set(lx(frontX + 6), ly(76), shoeDk);
      rrO(lx(backX), ly(60), 8, 10, 3, pantsDk);
      elO(lx(backX + 4), ly(72), 6, 4, shoeDk);
    } else {
      rrO(lx(25), ly(58), 8, 14, 3, pal.pants);
      rrO(lx(33), ly(58), 8, 14, 3, pantsDk);
      rr(lx(25), ly(58), 2, 14, 2, pantsLi);
      rr(lx(25) + 3, ly(58), 2, 14, 2, pantsMid);
      elO(lx(29), ly(74), 6, 4, SHOE);
      elO(lx(37), ly(74), 6, 4, shoeDk);
      s.set(lx(27), ly(73), shoeLi);
      s.set(lx(28), ly(73), shoeMid);
      s.set(lx(31), ly(76), shoeDk);
    }
  }

  if (mirror) s.flipH(ox, oy, CW, CH);
}

function buildCharSheet(pal: CharPalette): CanvasSheet {
  const cols = 8;
  const s = new CanvasSheet(CW * cols, CH * DIRS.length);
  DIRS.forEach((dir, row) => {
    for (let pose = 0; pose < cols; pose++) {
      drawChar(s, pose * CW, row * CH, pal, dir, pose);
    }
  });
  return s;
}

// --------------------------------------------------------- public API

export const CHAR_FRAME_W = CW * SHEET_SCALE;
export const CHAR_FRAME_H = CH * SHEET_SCALE;
export const CHAR_FRAMES_PER_ROW = 8;

/**
 * Generate a full character spritesheet and register it as a Phaser texture.
 * If the texture key already exists, it is replaced.
 */
export function generateCharTexture(scene: Phaser.Scene, key: string, ap: CharAppearance): void {
  const pal = appearanceToPalette(ap);
  const sheet = buildCharSheet(pal);
  const canvas = sheet.toCanvas();

  if (scene.textures.exists(key)) {
    scene.textures.remove(key);
  }
  const tex = scene.textures.addCanvas(key, canvas);
  if (tex) {
    const cols = CHAR_FRAMES_PER_ROW;
    const rows = DIRS.length;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tex.add(row * cols + col, 0, col * CHAR_FRAME_W, row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H);
      }
    }
  }
}

/**
 * Generate a preview canvas (single down-facing idle frame) for the DOM.
 * Returns a data URL suitable for use as a CSS background-image.
 */
export function generateCharPreviewDataURL(ap: CharAppearance, scale = 3): string {
  const pal = appearanceToPalette(ap);
  const s = new CanvasSheet(CW, CH);
  drawChar(s, 0, 0, pal, "down", 6); // idle pose

  const canvas = document.createElement("canvas");
  canvas.width = CHAR_FRAME_W * scale;
  canvas.height = CHAR_FRAME_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;

  const srcCanvas = s.toCanvas();
  ctx.drawImage(srcCanvas, 0, 0, CHAR_FRAME_W, CHAR_FRAME_H, 0, 0, CHAR_FRAME_W * scale, CHAR_FRAME_H * scale);
  return canvas.toDataURL();
}

/**
 * Generate a full spritesheet data URL (for hire modal thumbnail-style preview).
 */
export function generateCharSheetDataURL(ap: CharAppearance, scale = 1): string {
  const pal = appearanceToPalette(ap);
  const sheet = buildCharSheet(pal);
  if (scale === 1) return sheet.toCanvas().toDataURL();
  const canvas = document.createElement("canvas");
  canvas.width = sheet.canvas.width * scale;
  canvas.height = sheet.canvas.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sheet.toCanvas(), 0, 0, sheet.canvas.width, sheet.canvas.height, 0, 0, sheet.canvas.width * scale, sheet.canvas.height * scale);
  return canvas.toDataURL();
}
