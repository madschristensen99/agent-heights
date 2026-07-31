/**
 * Runtime character sprite generator — draws pixel-art characters using
 * raw ImageData manipulation. Drawing logic is shared with the asset
 * generator via shared/char-draw.ts.
 */
import type Phaser from "phaser";
import {
  type CharAppearance,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS,
  PANTS_COLORS, ACCESSORIES, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
} from "../../../shared/types";
import {
  drawChar as sharedDrawChar,
  mix,
  type CharPalette,
  type DrawSurface,
  type CharTextureProvider,
  DIRS,
  CW,
  CH,
} from "../../../shared/char-draw";

export type { CharPalette };

/** Module-level texture provider — populated by boot.ts from AI textures. */
let charTexProvider: CharTextureProvider | undefined;

/** Set the AI texture provider for character generation (called from boot.ts). */
export function setCharTextureProvider(provider: CharTextureProvider | undefined): void {
  charTexProvider = provider;
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

class PixelSheet implements DrawSurface {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  clip: { x: number; y: number; w: number; h: number } | null = null;
  texProvider?: CharTextureProvider;

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

  texturedRect(x: number, y: number, w: number, h: number, _hex: string, tex: keyof CharTextureProvider): void {
    const texData = this.texProvider?.[tex];
    if (!texData) return;
    const tw = texData.width;
    const th = texData.height;
    const td = texData.data;
    const d = this.data;
    const blendAlpha = 0.35;

    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const px = Math.round(x + xx);
        const py = Math.round(y + yy);
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        if (!this.inClip(px, py)) continue;

        const di = (py * this.width + px) * 4;
        if (d[di + 3] === 0) continue;

        const tx = xx % tw;
        const ty = yy % th;
        const ti = (ty * tw + tx) * 4;

        const tr = td[ti];
        const tg = td[ti + 1];
        const tb = td[ti + 2];

        const lum = (tr + tg + tb) / (3 * 255);
        const delta = (lum - 0.5) * 2 * blendAlpha;

        d[di] = Math.max(0, Math.min(255, Math.round(d[di] + delta * 255)));
        d[di + 1] = Math.max(0, Math.min(255, Math.round(d[di + 1] + delta * 255)));
        d[di + 2] = Math.max(0, Math.min(255, Math.round(d[di + 2] + delta * 255)));
      }
    }
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
// drawChar is now imported from shared/char-draw.ts

function buildCharSheet(pal: CharPalette): PixelSheet {
  const cols = 8;
  const s = new PixelSheet(CW * cols, CH * DIRS.length);
  s.texProvider = charTexProvider;
  DIRS.forEach((dir, row) => {
    for (let pose = 0; pose < cols; pose++) {
      sharedDrawChar(s, pose * CW, row * CH, pal, dir, pose);
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
  s.texProvider = charTexProvider;
  sharedDrawChar(s, 0, 0, pal, "down", 6); // idle pose

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
