/**
 * Runtime character sprite generator — draws pixel-art characters using
 * raw ImageData manipulation, matching the style of generate-assets.ts.
 */
import type Phaser from "phaser";
import {
  type CharAppearance,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  PANTS_COLORS, ACCESSORIES, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
} from "../../../shared/types";

// ------------------------------------------------------------------- palette

export interface CharPalette {
  skin: string;
  hair: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  tie?: string;
  eyeColor: string;
  hairStyle: string;
  accessory: string;
  headFeature: string;
  beard: string;
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
    eyeColor: EYE_COLORS[ap.eyeColor % EYE_COLORS.length],
    headFeature: HEAD_FEATURES[ap.headFeature % HEAD_FEATURES.length],
    beard: BEARD_STYLES[ap.beard % BEARD_STYLES.length],
  };
}

// ------------------------------------------------------------- canvas sheet

class PixelSheet {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  clip: { x: number; y: number; w: number; h: number } | null = null;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    // All pixels start transparent — only drawn pixels become opaque
  }

  private inClip(x: number, y: number): boolean {
    if (!this.clip) return true;
    return x >= this.clip.x && x < this.clip.x + this.clip.w &&
           y >= this.clip.y && y < this.clip.y + this.clip.h;
  }

  set(x: number, y: number, hex: string): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (!this.inClip(x, y)) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    d[i] = parseInt(hex.slice(1, 3), 16);
    d[i + 1] = parseInt(hex.slice(3, 5), 16);
    d[i + 2] = parseInt(hex.slice(5, 7), 16);
    d[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex);
  }

  flipH(x: number, y: number, w: number, h: number): void {
    const d = this.data;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = 0; xx < Math.floor(w / 2); xx++) {
        const a = (yy * this.width + x + xx) * 4;
        const b = (yy * this.width + x + w - 1 - xx) * 4;
        for (let c = 0; c < 4; c++) {
          const t = d[a + c];
          d[a + c] = d[b + c];
          d[b + c] = t;
        }
      }
    }
  }

  setAlpha(x: number, y: number, hex: string, a: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (!this.inClip(x, y)) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    d[i] = Math.round(d[i] * (1 - a) + r * a);
    d[i + 1] = Math.round(d[i + 1] * (1 - a) + g * a);
    d[i + 2] = Math.round(d[i + 2] * (1 - a) + b * a);
    d[i + 3] = 255;
  }

  fillCircle(cx: number, cy: number, r: number, hex: string): void {
    cx = Math.round(cx);
    cy = Math.round(cy);
    r = Math.round(r);
    if (r <= 0) { this.set(cx, cy, hex); return; }
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      this.rect(cx - w, cy + y, w * 2 + 1, 1, hex);
    }
  }

  fillCircleAlpha(cx: number, cy: number, r: number, hex: string, a: number): void {
    cx = Math.round(cx);
    cy = Math.round(cy);
    r = Math.round(r);
    if (r <= 0) { this.setAlpha(cx, cy, hex, a); return; }
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -w; x <= w; x++) this.setAlpha(cx + x, cy + y, hex, a);
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, hex: string): void {
    cx = Math.round(cx);
    cy = Math.round(cy);
    rx = Math.round(rx);
    ry = Math.round(ry);
    if (rx <= 0 || ry <= 0) { this.set(cx, cy, hex); return; }
    for (let y = -ry; y <= ry; y++) {
      const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      this.rect(cx - w, cy + y, w * 2 + 1, 1, hex);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, hex: string): void {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.set(x0, y0, hex);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  lineThick(x0: number, y0: number, x1: number, y1: number, hex: string, thick: number): void {
    const half = Math.floor(thick / 2);
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.rect(x0 - half, y0 - half, thick, thick, hex);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, hex: string): void {
    const pts = [[x0, y0], [x1, y1], [x2, y2]].sort((a, b) => a[1] - b[1]);
    const [ax, ay] = pts[0], [bx, by] = pts[1], [cx, cy] = pts[2];
    const totalH = cy - ay;
    if (totalH === 0) { this.set(ax, ay, hex); return; }
    for (let y = ay; y <= cy; y++) {
      const segH = y < by ? by - ay : cy - by;
      if (segH === 0) continue;
      const t1 = (y - ay) / totalH;
      let t2: number;
      if (y < by) {
        t2 = (y - ay) / (by - ay || 1);
      } else {
        t2 = (y - by) / (cy - by || 1);
      }
      const lx = Math.round(ax + (cx - ax) * t1);
      const rx2 = y < by
        ? Math.round(ax + (bx - ax) * t2)
        : Math.round(bx + (cx - bx) * t2);
      const lo = Math.min(lx, rx2);
      const hi = Math.max(lx, rx2);
      this.rect(lo, y, hi - lo + 1, 1, hex);
    }
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, r: number, hex: string): void {
    r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
    this.rect(x + r, y, w - 2 * r, h, hex);
    this.rect(x, y + r, w, h - 2 * r, hex);
    this.fillCircle(x + r, y + r, r, hex);
    this.fillCircle(x + w - r - 1, y + r, r, hex);
    this.fillCircle(x + r, y + h - r - 1, r, hex);
    this.fillCircle(x + w - r - 1, y + h - r - 1, r, hex);
  }

  blurEdges(x: number, y: number, w: number, h: number, hex: string, a: number): void {
    for (let xx = x; xx < x + w; xx++) {
      this.setAlpha(xx, y, hex, a);
      this.setAlpha(xx, y + h - 1, hex, a);
    }
    for (let yy = y; yy < y + h; yy++) {
      this.setAlpha(x, yy, hex, a);
      this.setAlpha(x + w - 1, yy, hex, a);
    }
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(this.width, this.height);
    imageData.data.set(this.data);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}

// --------------------------------------------------------------- draw char

const CW = 64;
const CH = 96;
const SHOE = "#3a3548";
const OUTLINE = "#2e2640";

type Dir = "down" | "left" | "right" | "up";
const DIRS: Dir[] = ["down", "left", "right", "up"];

function drawChar(s: PixelSheet, ox: number, oy: number, pal: CharPalette, dir: Dir, pose: number): void {
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
      el(hx(19), hy(18), 3, 5 + hb, pal.hair); el(hx(45), hy(18), 3, 5 + hb, pal.hair);
      el(hx(32), hy(14), 6, 3, pal.hair);
      s.set(hx(27), hy(15), pal.skin); s.set(hx(37), hy(15), pal.skin);
      el(hx(32), hy(16), 4, 1, hairDk);
      el(hx(28), hy(12), 3, 2, hairLi); el(hx(36), hy(12), 3, 2, hairMid);
    } else if (hs === "spiky") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(32 + i * 6); s.set(sx, hy(4 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(5 + Math.abs(i) * 2), pal.hair); s.set(sx - 1, hy(6 + Math.abs(i) * 2), pal.hair); }
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
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
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(19), hy(18), 3, 7, pal.hair);
      el(hx(50), hy(15), 3, 8 + hb, pal.hair); s.set(hx(52), hy(17 + hb), pal.hair); s.set(hx(53), hy(20 + hb), pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(6), 7, 3, hairLi); el(hx(34), hy(8), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
      el(hx(51), hy(14), 2, 3, hairLi);
    } else if (hs === "swept") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      el(hx(36), hy(15), 10, 3, pal.hair);
      rr(hx(25), hy(16), 20, 2, 3, pal.hair);
      s.set(hx(24), hy(15), pal.skin); s.set(hx(25), hy(14), pal.skin);
      s.set(hx(22), hy(13), pal.hair); s.set(hx(23), hy(12), pal.hair);
      el(hx(26), hy(9), 6, 3, hairLi); el(hx(32), hy(11), 7, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "curly") {
      el(hx(32), hy(12), 16, 5, pal.hair);
      ci(hx(22), hy(8), 4, pal.hair); ci(hx(32), hy(6), 5, pal.hair); ci(hx(42), hy(8), 4, pal.hair);
      el(hx(19), hy(19), 3, 8 + hb, pal.hair); el(hx(45), hy(19), 3, 8 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); ci(hx(25), hy(15), 3, pal.hair); ci(hx(39), hy(15), 3, pal.hair);
      ci(hx(26), hy(8), 2, hairLi); ci(hx(34), hy(7), 2, hairRim); el(hx(38), hy(10), 4, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "bun") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      ci(hx(32), hy(4), 5, pal.hair); ci(hx(32), hy(4), 3, hairMid);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
      ci(hx(30), hy(3), 2, hairRim);
    } else if (hs === "mohawk") {
      s.rect(hx(30), hy(2), 4, 14, pal.hair);
      s.set(hx(29), hy(0), pal.hair); s.set(hx(30), hy(0), pal.hair); s.set(hx(31), hy(0), pal.hair); s.set(hx(32), hy(0), pal.hair); s.set(hx(33), hy(0), pal.hair);
      s.set(hx(28), hy(4), pal.hair); s.set(hx(34), hy(4), pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair);
      s.set(hx(30), hy(4), hairLi); s.set(hx(31), hy(6), hairMid);
    } else if (hs === "afro") {
      ci(hx(32), hy(12), 18, pal.hair);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      ci(hx(26), hy(8), 3, hairLi); ci(hx(36), hy(10), 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "braids") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(14), hy(22), 4, 18 + hb, pal.hair); el(hx(50), hy(22), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) { s.set(hx(14), hy(24 + i * 4), hairDk); s.set(hx(50), hy(24 + i * 4), hairDk); }
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "pigtails") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      ci(hx(15), hy(20), 4, pal.hair); ci(hx(49), hy(20), 4, pal.hair);
      ci(hx(15), hy(20), 2, hairMid); ci(hx(49), hy(20), 2, hairMid);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "bob") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(14), hy(22), 5, 12 + hb, pal.hair); el(hx(50), hy(22), 5, 12 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); el(hx(14), hy(28), 3, 6, hairDk); el(hx(50), hy(28), 3, 6, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(32), hy(13), 16, 5, pal.hair);
      for (const lx of [14, 20, 26, 38, 44, 50]) { el(hx(lx), hy(20), 3, 16 + hb, pal.hair); }
      for (const lx of [14, 20, 26, 38, 44, 50]) { for (let i = 0; i < 3; i++) s.set(hx(lx), hy(23 + i * 5), hairDk); }
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else {
      el(hx(32), hy(13), 16, 5, pal.hair);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
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
    } else if (hs === "mohawk") {
      s.rect(hx(30), hy(6), 4, 22, pal.hair);
      s.set(hx(29), hy(4), pal.hair); s.set(hx(34), hy(4), pal.hair);
      el(hx(32), hy(27), 14, 7, pal.hair);
      s.set(hx(30), hy(8), hairLi); s.set(hx(31), hy(12), hairMid);
    } else if (hs === "afro") {
      ci(hx(32), hy(16), 18, pal.hair);
      el(hx(32), hy(27), 14, 7, pal.hair);
      ci(hx(26), hy(12), 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "braids") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(18), hy(24), 4, 18 + hb, pal.hair); el(hx(46), hy(24), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) { s.set(hx(18), hy(26 + i * 4), hairDk); s.set(hx(46), hy(26 + i * 4), hairDk); }
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "pigtails") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      ci(hx(16), hy(22), 4, pal.hair); ci(hx(48), hy(22), 4, pal.hair);
      ci(hx(16), hy(22), 2, hairMid); ci(hx(48), hy(22), 2, hairMid);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "bob") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      el(hx(18), hy(24), 5, 12 + hb, pal.hair); el(hx(46), hy(24), 5, 12 + hb, pal.hair);
      el(hx(28), hy(11), 7, 3, hairLi); el(hx(34), hy(13), 8, 4, hairMid); el(hx(40), hy(20), 5, 9, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(32), hy(17), 16, 14, pal.hair); el(hx(32), hy(27), 14, 7, pal.hair);
      for (const bx of [18, 24, 40, 46]) { el(hx(bx), hy(24), 3, 16 + hb, pal.hair); }
      for (const bx of [18, 24, 40, 46]) { for (let i = 0; i < 3; i++) s.set(hx(bx), hy(27 + i * 5), hairDk); }
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
      el(hx(30), hy(9), 16, 9, pal.hair);
      el(hx(16), hy(18), 4, 10 + hb, pal.hair); s.set(hx(15), hy(20 + hb), pal.hair); s.set(hx(15), hy(22 + hb), pal.hair);
      el(hx(19), hy(21), 5, 9, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(5), 5, 2, hairLi); el(hx(32), hy(8), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
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
    } else if (hs === "mohawk") {
      s.rect(hx(30), hy(2), 4, 18, pal.hair);
      s.set(hx(29), hy(0), pal.hair); s.set(hx(30), hy(0), pal.hair); s.set(hx(31), hy(0), pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      s.set(hx(30), hy(6), hairLi); s.set(hx(31), hy(10), hairMid);
    } else if (hs === "afro") {
      ci(hx(32), hy(12), 16, pal.hair);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      ci(hx(28), hy(8), 3, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "braids") {
      el(hx(30), hy(13), 16, 5, pal.hair);
      el(hx(17), hy(21), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) s.set(hx(17), hy(23 + i * 4), hairDk);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "pigtails") {
      el(hx(30), hy(13), 16, 5, pal.hair);
      ci(hx(16), hy(20), 4, pal.hair); ci(hx(16), hy(20), 2, hairMid);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "bob") {
      el(hx(30), hy(13), 16, 5, pal.hair);
      el(hx(17), hy(21), 5, 12 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
      el(hx(17), hy(28), 3, 6, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(30), hy(13), 16, 5, pal.hair);
      for (const bx of [17, 23, 29]) { el(hx(bx), hy(20), 3, 16 + hb, pal.hair); }
      for (const bx of [17, 23, 29]) { for (let i = 0; i < 3; i++) s.set(hx(bx), hy(23 + i * 5), hairDk); }
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
    } else if (ac === "cap") {
      const cc = mix(pal.shirt, "#000000", 0.1);
      if (dir2 === "down") {
        rr(hx(18), hy(8), 28, 6, 3, cc);
        s.rect(hx(18), hy(11), 28, 1, mix(cc, "#000", 0.2));
        s.rect(hx(38), hy(11), 14, 2, cc);
        s.set(hx(20), hy(8), mix(cc, "#fff", 0.2));
      } else if (dir2 === "up") {
        rr(hx(18), hy(8), 28, 6, 3, cc);
        s.rect(hx(18), hy(11), 28, 1, mix(cc, "#000", 0.2));
      } else if (dir2 === "right") {
        rr(hx(22), hy(8), 22, 6, 3, cc);
        s.rect(hx(22), hy(11), 22, 1, mix(cc, "#000", 0.2));
        s.rect(hx(38), hy(11), 12, 2, cc);
        s.set(hx(24), hy(8), mix(cc, "#fff", 0.2));
      }
    } else if (ac === "beanie") {
      const bc = mix(pal.shirt, "#000000", 0.05);
      if (dir2 === "down") {
        rr(hx(16), hy(6), 32, 10, 4, bc);
        s.rect(hx(16), hy(13), 32, 2, mix(bc, "#000", 0.2));
        s.set(hx(32), hy(4), mix(bc, "#fff", 0.3));
        s.set(hx(32), hy(5), mix(bc, "#fff", 0.15));
      } else if (dir2 === "up") {
        rr(hx(16), hy(6), 32, 10, 4, bc);
        s.rect(hx(16), hy(13), 32, 2, mix(bc, "#000", 0.2));
      } else if (dir2 === "right") {
        rr(hx(20), hy(6), 28, 10, 4, bc);
        s.rect(hx(20), hy(13), 28, 2, mix(bc, "#000", 0.2));
        s.set(hx(28), hy(4), mix(bc, "#fff", 0.3));
      }
    } else if (ac === "headphones") {
      const hc = "#3a3a44";
      const hcLi = "#5a5a64";
      if (dir2 === "down") {
        s.rect(hx(18), hy(6), 28, 2, hc);
        ci(hx(16), hy(20), 3, hc); ci(hx(16), hy(20), 2, hcLi);
        ci(hx(48), hy(20), 3, hc); ci(hx(48), hy(20), 2, hcLi);
      } else if (dir2 === "up") {
        s.rect(hx(18), hy(6), 28, 2, hc);
        ci(hx(16), hy(20), 3, hc); ci(hx(48), hy(20), 3, hc);
      } else if (dir2 === "right") {
        s.rect(hx(22), hy(6), 22, 2, hc);
        ci(hx(16), hy(20), 3, hc); ci(hx(16), hy(20), 2, hcLi);
      }
    }
  };

  // ===== HEAD FEATURES (ears, horns, antennae) =====
  const drawHeadFeature = (dir2: Dir) => {
    const hf = pal.headFeature;
    if (hf === "none") return;
    if (hf === "cat_ears") {
      const inner = mix(pal.hair, "#ffaaaa", 0.4);
      if (dir2 === "down") {
        s.fillTriangle(hx(22), hy(10), hx(17), hy(2), hx(27), hy(5), pal.hair);
        s.fillTriangle(hx(23), hy(9), hx(20), hy(5), hx(26), hy(6), inner);
        s.fillTriangle(hx(42), hy(10), hx(37), hy(5), hx(47), hy(2), pal.hair);
        s.fillTriangle(hx(41), hy(9), hx(38), hy(6), hx(44), hy(5), inner);
      } else if (dir2 === "up") {
        s.fillTriangle(hx(22), hy(10), hx(17), hy(2), hx(27), hy(5), pal.hair);
        s.fillTriangle(hx(42), hy(10), hx(37), hy(5), hx(47), hy(2), pal.hair);
      } else if (dir2 === "right") {
        s.fillTriangle(hx(42), hy(10), hx(37), hy(5), hx(47), hy(2), pal.hair);
        s.fillTriangle(hx(41), hy(9), hx(38), hy(6), hx(44), hy(5), inner);
      }
    } else if (hf === "horns") {
      if (dir2 === "down") {
        s.fillTriangle(hx(20), hy(10), hx(16), hy(0), hx(24), hy(6), "#6a5a4a");
        s.fillTriangle(hx(21), hy(9), hx(18), hy(3), hx(23), hy(7), "#8a7a6a");
        s.fillTriangle(hx(44), hy(10), hx(40), hy(6), hx(48), hy(0), "#6a5a4a");
        s.fillTriangle(hx(43), hy(9), hx(41), hy(7), hx(46), hy(3), "#8a7a6a");
      } else if (dir2 === "up") {
        s.fillTriangle(hx(20), hy(10), hx(16), hy(0), hx(24), hy(6), "#6a5a4a");
        s.fillTriangle(hx(44), hy(10), hx(40), hy(6), hx(48), hy(0), "#6a5a4a");
      } else if (dir2 === "right") {
        s.fillTriangle(hx(44), hy(10), hx(40), hy(6), hx(48), hy(0), "#6a5a4a");
        s.fillTriangle(hx(43), hy(9), hx(41), hy(7), hx(46), hy(3), "#8a7a6a");
      }
    } else if (hf === "antennae") {
      const tip = pal.eyeColor ?? "#00e5ff";
      if (dir2 === "down") {
        s.lineThick(hx(27), hy(8), hx(24), hy(0), pal.hair, 1);
        s.set(hx(24), hy(0), tip); s.set(hx(23), hy(1), tip);
        s.lineThick(hx(37), hy(8), hx(40), hy(0), pal.hair, 1);
        s.set(hx(40), hy(0), tip); s.set(hx(41), hy(1), tip);
      } else if (dir2 === "up") {
        s.lineThick(hx(27), hy(8), hx(24), hy(0), pal.hair, 1);
        s.set(hx(24), hy(0), tip);
        s.lineThick(hx(37), hy(8), hx(40), hy(0), pal.hair, 1);
        s.set(hx(40), hy(0), tip);
      } else if (dir2 === "right") {
        s.lineThick(hx(37), hy(8), hx(40), hy(0), pal.hair, 1);
        s.set(hx(40), hy(0), tip); s.set(hx(41), hy(1), tip);
      }
    } else if (hf === "elf_ears") {
      if (dir2 === "down") {
        s.fillTriangle(hx(15), hy(24), hx(11), hy(18), hx(17), hy(26), pal.skin);
        s.set(hx(14), hy(22), skinDk);
        s.fillTriangle(hx(49), hy(24), hx(53), hy(18), hx(47), hy(26), pal.skin);
        s.set(hx(50), hy(22), skinDk);
      } else if (dir2 === "up") {
        s.fillTriangle(hx(15), hy(24), hx(11), hy(18), hx(17), hy(26), pal.hair);
        s.fillTriangle(hx(49), hy(24), hx(53), hy(18), hx(47), hy(26), pal.hair);
      } else if (dir2 === "right") {
        s.fillTriangle(hx(49), hy(24), hx(53), hy(18), hx(47), hy(26), pal.skin);
        s.set(hx(50), hy(22), skinDk);
      }
    }
  };

  // ===== BEARD / FACIAL HAIR =====
  const drawBeard = (dir2: Dir) => {
    const bd = pal.beard;
    if (bd === "none") return;
    if (dir2 === "down") {
      if (bd === "stubble") {
        for (let i = 0; i < 8; i++) {
          const sx = 24 + (i * 2);
          s.set(hx(sx), hy(30 + (i % 2)), hairDk);
          s.set(hx(sx + 1), hy(31 + (i % 2)), hairDk);
        }
      } else if (bd === "mustache") {
        s.rect(hx(27), hy(27), 10, 2, pal.hair);
        s.set(hx(27), hy(28), hairDk); s.set(hx(36), hy(28), hairDk);
      } else if (bd === "goatee") {
        el(hx(32), hy(32), 4, 4, pal.hair);
        s.set(hx(30), hy(31), hairDk); s.set(hx(34), hy(31), hairDk);
        s.set(hx(32), hy(35), hairDk);
      } else if (bd === "full_beard") {
        el(hx(32), hy(31), 12, 6, pal.hair);
        el(hx(24), hy(29), 4, 5, pal.hair); el(hx(40), hy(29), 4, 5, pal.hair);
        el(hx(32), hy(33), 10, 3, hairDk);
        s.set(hx(26), hy(28), pal.hair); s.set(hx(38), hy(28), pal.hair);
      }
    } else if (dir2 === "right") {
      if (bd === "stubble") {
        for (let i = 0; i < 5; i++) {
          s.set(hx(38 + i), hy(30 + (i % 2)), hairDk);
        }
      } else if (bd === "mustache") {
        s.rect(hx(36), hy(27), 6, 2, pal.hair);
        s.set(hx(36), hy(28), hairDk);
      } else if (bd === "goatee") {
        el(hx(42), hy(32), 4, 4, pal.hair);
        s.set(hx(40), hy(31), hairDk); s.set(hx(44), hy(35), hairDk);
      } else if (bd === "full_beard") {
        el(hx(42), hy(31), 8, 6, pal.hair);
        el(hx(38), hy(29), 4, 5, pal.hair);
        el(hx(42), hy(33), 6, 3, hairDk);
        s.set(hx(40), hy(28), pal.hair);
      }
    }
  };

  // ===== ROUNDED CHIBI (64x96) — detailed, crisp edges =====

  if (d === "down") {
    ciO(hx(32), hy(18), 17, pal.skin);
    el(hx(32), hy(22), 13, 12, pal.skin);
    drawHairDown();
    drawHeadFeature("down");
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
    drawBeard("down");

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
    ciO(hx(32), hy(18), 17, pal.hair);
    drawHairUp();
    drawHeadFeature("up");
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
    ciO(hx(32), hy(18), 17, pal.skin);
    el(hx(35), hy(24), 11, 9, pal.skin);
    drawHairRight();
    drawHeadFeature("right");
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
    drawBeard("right");

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

function buildCharSheet(pal: CharPalette): PixelSheet {
  const cols = 8;
  const s = new PixelSheet(CW * cols, CH * DIRS.length);
  DIRS.forEach((dir, row) => {
    for (let pose = 0; pose < cols; pose++) {
      drawChar(s, pose * CW, row * CH, pal, dir, pose);
    }
  });
  return s;
}

// --------------------------------------------------------- public API

export const CHAR_FRAME_W = CW;
export const CHAR_FRAME_H = CH;
export const CHAR_FRAMES_PER_ROW = 8;

/**
 * Generate a full character spritesheet and register it as a Phaser texture.
 * If the texture key already exists, it is replaced.
 */
export function generateCharTexture(scene: Phaser.Scene, key: string, ap: CharAppearance): void {
  const pal = appearanceToPalette(ap);
  const sheet = buildCharSheet(pal);
  const canvas = sheet.toCanvas();

  // If the texture already exists as a CanvasTexture, redraw it in place.
  // This preserves the TextureSource so existing frame references and
  // animations stay valid — destroying/recreating the texture leaves stale
  // frame references that crash Phaser's renderer.
  if (scene.textures.exists(key)) {
    const existing = scene.textures.get(key);
    if (existing && typeof (existing as any).context !== "undefined") {
      const ctx = (existing as any).context as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, (existing as any).width, (existing as any).height);
      ctx.drawImage(canvas, 0, 0);
      (existing as any).refresh();
      return;
    }
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
  const s = new PixelSheet(CW, CH);
  drawChar(s, 0, 0, pal, "down", 6); // idle pose

  const canvas = document.createElement("canvas");
  canvas.width = CHAR_FRAME_W * scale;
  canvas.height = CHAR_FRAME_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

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
  const srcCanvas = sheet.toCanvas();
  const canvas = document.createElement("canvas");
  canvas.width = srcCanvas.width * scale;
  canvas.height = srcCanvas.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, srcCanvas.width * scale, srcCanvas.height * scale);
  return canvas.toDataURL();
}
