/**
 * Engine-native character sprite generator.
 * Uses the shared drawChar logic + PixelSheet (framework-agnostic)
 * and registers results with the engine's TextureAtlas.
 */
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
  DIRS,
  CW,
  CH,
} from "../../../shared/char-draw";
import type { TextureAtlas } from "../engine/texture-atlas";

export type { CharPalette };
export { CW as CHAR_FRAME_W, CH as CHAR_FRAME_H };
export const CHAR_FRAMES_PER_ROW = 8;
export const CHAR_DIRS = DIRS.length;

// ------------------------------------------------------------- pixel surface

class PixelSheet implements DrawSurface {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  clip: { x: number; y: number; w: number; h: number } | null = null;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  private inClip(x: number, y: number): boolean {
    if (!this.clip) return true;
    return x >= this.clip.x && x < this.clip.x + this.clip.w &&
           y >= this.clip.y && y < this.clip.y + this.clip.h;
  }

  set(x: number, y: number, hex: string): void {
    x = Math.round(x); y = Math.round(y);
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
          const t = d[a + c]; d[a + c] = d[b + c]; d[b + c] = t;
        }
      }
    }
  }

  setAlpha(x: number, y: number, hex: string, a: number): void {
    x = Math.round(x); y = Math.round(y);
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
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    if (r <= 0) { this.set(cx, cy, hex); return; }
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      this.rect(cx - w, cy + y, w * 2 + 1, 1, hex);
    }
  }

  fillCircleAlpha(cx: number, cy: number, r: number, hex: string, a: number): void {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    if (r <= 0) { this.setAlpha(cx, cy, hex, a); return; }
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -w; x <= w; x++) this.setAlpha(cx + x, cy + y, hex, a);
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, hex: string): void {
    cx = Math.round(cx); cy = Math.round(cy); rx = Math.round(rx); ry = Math.round(ry);
    if (rx <= 0 || ry <= 0) { this.set(cx, cy, hex); return; }
    for (let y = -ry; y <= ry; y++) {
      const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      this.rect(cx - w, cy + y, w * 2 + 1, 1, hex);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, hex: string): void {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
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
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
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
      const t1 = (y - ay) / totalH;
      const t2 = y < by ? (y - ay) / (by - ay || 1) : (y - by) / (cy - by || 1);
      const lx = Math.round(ax + (cx - ax) * t1);
      const rx2 = y < by ? Math.round(ax + (bx - ax) * t2) : Math.round(bx + (cx - bx) * t2);
      this.rect(Math.min(lx, rx2), y, Math.abs(lx - rx2) + 1, 1, hex);
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

// --------------------------------------------------------------- public API

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

function buildCharSheet(pal: CharPalette): PixelSheet {
  const cols = CHAR_FRAMES_PER_ROW;
  const s = new PixelSheet(CW * cols, CH * DIRS.length);
  DIRS.forEach((dir, row) => {
    for (let pose = 0; pose < cols; pose++) {
      sharedDrawChar(s, pose * CW, row * CH, pal, dir, pose);
    }
  });
  return s;
}

export interface CharSpriteHandle {
  atlasKey: string;
  /** UV coordinates for each frame: [dir][pose] = {u, v, w, h} */
  frames: { u: number; v: number; w: number; h: number }[][];
  frameW: number;
  frameH: number;
}

/**
 * Generate a full character spritesheet (8 poses × 4 directions = 32 frames)
 * and register each frame as a sub-region in the engine's TextureAtlas.
 * Returns a handle with UV coordinates for every frame.
 */
export function generateCharSprite(
  atlas: TextureAtlas,
  key: string,
  ap: CharAppearance,
): CharSpriteHandle | null {
  const pal = appearanceToPalette(ap);
  const sheet = buildCharSheet(pal);
  const canvas = sheet.toCanvas();
  console.log("[chargen] sheet canvas:", canvas.width, "x", canvas.height);

  const frames: { u: number; v: number; w: number; h: number }[][] = [];

  for (let dir = 0; dir < DIRS.length; dir++) {
    frames[dir] = [];
    for (let pose = 0; pose < CHAR_FRAMES_PER_ROW; pose++) {
      const frameKey = `${key}:${dir}:${pose}`;
      const region = atlas.addSubRegion(
        frameKey,
        canvas,
        pose * CW,
        dir * CH,
        CW,
        CH,
      );
      if (!region) return null;
      frames[dir][pose] = {
        u: region.u,
        v: region.v,
        w: region.w,
        h: region.h,
      };
    }
  }

  return {
    atlasKey: key,
    frames,
    frameW: CW,
    frameH: CH,
  };
}

/**
 * Generate a single-frame character sprite (e.g. for portraits, previews).
 */
export function generateCharPreviewCanvas(ap: CharAppearance, scale = 1): HTMLCanvasElement {
  const pal = appearanceToPalette(ap);
  const s = new PixelSheet(CW, CH);
  sharedDrawChar(s, 0, 0, pal, "down", 6);

  const srcCanvas = s.toCanvas();
  if (scale === 1) return srcCanvas;

  const canvas = document.createElement("canvas");
  canvas.width = CW * scale;
  canvas.height = CH * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcCanvas, 0, 0, CW, CH, 0, 0, CW * scale, CH * scale);
  return canvas;
}

/**
 * Generate a preview data URL for DOM usage (auth screen, hire modal, etc.)
 */
export function generateCharPreviewDataURL(ap: CharAppearance, scale = 3): string {
  return generateCharPreviewCanvas(ap, scale).toDataURL();
}
