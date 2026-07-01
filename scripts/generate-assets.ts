/**
 * Authors all pixel art for Agent HQ:
 *   client/public/assets/tilesets/office.png   - 64x64 office tileset (32 tiles)
 *   client/public/assets/tilesets/agenthq.png  - Agent HQ-theme recolor of the tileset
 *   client/public/assets/maps/office.json      - Tiled-format map (open it in Tiled!)
 *   client/public/assets/maps/agenthq.json     - Agent HQ-theme map (carpeted office layout)
 *   client/public/assets/characters/char-N.png - 64x96 4-dir walk sheets, 8 variants
 *   client/public/assets/characters/boss.png   - the player character
 *   client/public/assets/sprites/monitor.png   - 2-frame monitor (off/on)
 *   client/public/assets/sprites/bubble.png    - 3-frame thought bubble
 *
 * Run with: pnpm assets
 */
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "client", "public", "assets");

// ---------------------------------------------------------------- pixel sheet

class Sheet {
  png: PNG;
  /** Optional clip region — drawing outside this rect is discarded. */
  clip: { x: number; y: number; w: number; h: number } | null = null;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.png = new PNG({ width: w, height: h });
  }

  private inClip(x: number, y: number): boolean {
    if (!this.clip) return true;
    return x >= this.clip.x && x < this.clip.x + this.clip.w &&
           y >= this.clip.y && y < this.clip.y + this.clip.h;
  }

  set(x: number, y: number, hex: string): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (!this.inClip(x, y)) return;
    const i = (y * this.w + x) * 4;
    const d = this.png.data;
    d[i] = parseInt(hex.slice(1, 3), 16);
    d[i + 1] = parseInt(hex.slice(3, 5), 16);
    d[i + 2] = parseInt(hex.slice(5, 7), 16);
    d[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex);
  }

  /** Horizontally mirror a region in place (for left-facing frames). */
  flipH(x: number, y: number, w: number, h: number): void {
    const d = this.png.data;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = 0; xx < Math.floor(w / 2); xx++) {
        const a = (yy * this.w + x + xx) * 4;
        const b = (yy * this.w + x + w - 1 - xx) * 4;
        for (let c = 0; c < 4; c++) {
          const t = d[a + c];
          d[a + c] = d[b + c];
          d[b + c] = t;
        }
      }
    }
  }

  save(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, PNG.sync.write(this.png));
  }

  /** Save at 2x resolution using bilinear interpolation for smooth edges. */
  saveScaled(path: string, scale = 2): void {
    const src = this.png.data;
    const sw = this.w;
    const sh = this.h;
    const dw = sw * scale;
    const dh = sh * scale;
    const out = new PNG({ width: dw, height: dh });
    const dst = out.data;
    for (let y = 0; y < dh; y++) {
      const sy = y / scale;
      const y0 = Math.floor(sy);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fy = sy - y0;
      for (let x = 0; x < dw; x++) {
        const sx = x / scale;
        const x0 = Math.floor(sx);
        const x1 = Math.min(x0 + 1, sw - 1);
        const fx = sx - x0;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4;
        const i11 = (y1 * sw + x1) * 4;
        const di = (y * dw + x) * 4;
        for (let c = 0; c < 4; c++) {
          const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
          const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
          dst[di + c] = Math.round(top * (1 - fy) + bot * fy);
        }
      }
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, PNG.sync.write(out));
  }

  /** Set a pixel with alpha blending over the existing color. */
  setAlpha(x: number, y: number, hex: string, a: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (!this.inClip(x, y)) return;
    const i = (y * this.w + x) * 4;
    const d = this.png.data;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    d[i] = Math.round(d[i] * (1 - a) + r * a);
    d[i + 1] = Math.round(d[i + 1] * (1 - a) + g * a);
    d[i + 2] = Math.round(d[i + 2] * (1 - a) + b * a);
    // alpha channel stays 255 (opaque) since background is always filled
  }

  /** Filled circle using midpoint algorithm. */
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

  /** Filled circle with alpha blending. */
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

  /** Filled ellipse. */
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

  /** Bresenham line. */
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

  /** Thick Bresenham line. */
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

  /** Filled triangle. */
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, hex: string): void {
    // Sort vertices by y
    const pts = [[x0, y0], [x1, y1], [x2, y2]].sort((a, b) => a[1] - b[1]);
    const [ax, ay] = pts[0], [bx, by] = pts[1], [cx, cy] = pts[2];
    const totalH = cy - ay;
    if (totalH === 0) { this.set(ax, ay, hex); return; }
    for (let y = ay; y <= cy; y++) {
      const segH = y < by ? by - ay : cy - by;
      if (segH === 0) continue;
      let t1 = (y - ay) / totalH;
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

  /** Rounded rectangle. */
  fillRoundedRect(x: number, y: number, w: number, h: number, r: number, hex: string): void {
    r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
    this.rect(x + r, y, w - 2 * r, h, hex);
    this.rect(x, y + r, w, h - 2 * r, hex);
    this.fillCircle(x + r, y + r, r, hex);
    this.fillCircle(x + w - r - 1, y + r, r, hex);
    this.fillCircle(x + r, y + h - r - 1, r, hex);
    this.fillCircle(x + w - r - 1, y + h - r - 1, r, hex);
  }

  /** 1px alpha feather on the edges of a rectangular region (softens hard edges). */
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

  /** Nearest-neighbor 2x upscale, returns a new Sheet. */
  upscale2x(): Sheet {
    const out = new Sheet(this.w * 2, this.h * 2);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const src = (y * this.w + x) * 4;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const dst = ((y * 2 + dy) * out.w + (x * 2 + dx)) * 4;
            for (let c = 0; c < 4; c++) out.png.data[dst + c] = this.png.data[src + c];
          }
        }
      }
    }
    return out;
  }

  /** Nearest-neighbor upscale, for eyeballing the art. */
  preview(path: string, scale = 4): void {
    const out = new PNG({ width: this.w * scale, height: this.h * scale });
    for (let y = 0; y < this.h * scale; y++) {
      for (let x = 0; x < this.w * scale; x++) {
        const src = ((Math.floor(y / scale) * this.w) + Math.floor(x / scale)) * 4;
        const dst = (y * out.width + x) * 4;
        for (let c = 0; c < 4; c++) out.data[dst + c] = this.png.data[src + c];
      }
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, PNG.sync.write(out));
  }
}

// ------------------------------------------------------------------- tileset

const T = 64;

// Tile ids (Tiled GID = id + 1)
export const TILE = {
  WOOD_A: 0, WOOD_B: 1, CARPET_A: 2, CARPET_B: 3, RUG: 4, TILE_A: 5, TILE_B: 6, DOORMAT: 7,
  WALL_TOP: 8, WALL_FACE: 9, WINDOW: 10, WB_L: 11, WB_R: 12, DOOR: 13, POSTER: 14, CLOCK: 15,
  DESK_L: 16, DESK_R: 17, CHAIR: 18, FILING: 19, TRASH: 20, PLANT: 21, SHELF_T: 22, SHELF_B: 23,
  COUNTER: 24, FRIDGE: 25, COFFEE: 26, COOLER: 27, SOFA_L: 28, SOFA_R: 29, PAPERS: 30, VENDING: 31,
  CHAIR_LEFT: 32,
  SERVER_RACK: 34, SERVER_SCREEN: 35, CHIMNEY: 36,
  DESK_SIDE_TOP: 37, DESK_SIDE_BOTTOM: 38,
  DESK_SIDE_TOP_MIRROR: 39, DESK_SIDE_BOTTOM_MIRROR: 40, CHAIR_RIGHT: 41,
  RED_CARPET_A: 42, RED_CARPET_B: 43,
  LOGO_00: 44, LOGO_01: 45, LOGO_02: 46, LOGO_03: 47, LOGO_04: 48, LOGO_05: 49, LOGO_06: 50, LOGO_07: 51, LOGO_08: 52, LOGO_09: 53,
  LOGO_10: 54, LOGO_11: 55, LOGO_12: 56, LOGO_13: 57, LOGO_14: 58, LOGO_15: 59, LOGO_16: 60, LOGO_17: 61, LOGO_18: 62, LOGO_19: 63,
  LOGO_20: 64, LOGO_21: 65, LOGO_22: 66, LOGO_23: 67, LOGO_24: 68, LOGO_25: 69, LOGO_26: 70, LOGO_27: 71, LOGO_28: 72, LOGO_29: 73,
  LOGO_30: 74, LOGO_31: 75, LOGO_32: 76, LOGO_33: 77, LOGO_34: 78, LOGO_35: 79, LOGO_36: 80, LOGO_37: 81, LOGO_38: 82, LOGO_39: 83,
  LOGO_40: 84, LOGO_41: 85, LOGO_42: 86, LOGO_43: 87, LOGO_44: 88, LOGO_45: 89, LOGO_46: 90, LOGO_47: 91, LOGO_48: 92, LOGO_49: 93,
} as const;

const SOLID_TILES = [
  TILE.WALL_TOP, TILE.WALL_FACE, TILE.WINDOW, TILE.WB_L, TILE.WB_R, TILE.DOOR, TILE.POSTER,
  TILE.CLOCK, TILE.DESK_L, TILE.DESK_R, TILE.FILING, TILE.TRASH, TILE.PLANT, TILE.SHELF_T,
  TILE.SHELF_B, TILE.COUNTER, TILE.FRIDGE, TILE.COFFEE, TILE.COOLER, TILE.SOFA_L, TILE.SOFA_R,
  TILE.VENDING, TILE.DESK_SIDE_TOP, TILE.DESK_SIDE_BOTTOM,
  TILE.DESK_SIDE_TOP_MIRROR, TILE.DESK_SIDE_BOTTOM_MIRROR,
  TILE.SERVER_RACK, TILE.SERVER_SCREEN,
];

type TileDrawer = (s: Sheet, ox: number, oy: number) => void;

// Vertical gradient helper
function vGrad(s: Sheet, ox: number, oy: number, w: number, h: number, top: string, bot: string): void {
  for (let y = 0; y < h; y++) {
    const c = mix(top, bot, y / (h - 1));
    s.rect(ox, oy + y, w, 1, c);
  }
}

// Pseudo-random noise dots
function noise(s: Sheet, ox: number, oy: number, w: number, h: number, color: string, density: number): void {
  let seed = ox * 73 + oy * 31;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if ((seed & 0xffff) / 0xffff < density) s.set(ox + x, oy + y, color);
    }
  }
}

/** 5-tone shading palette: highlight, light, base, dark, shadow */
interface Shade5 { hi: string; li: string; base: string; dk: string; sh: string; }

function shade5(base: string): Shade5 {
  return {
    hi: mix(base, "#ffffff", 0.25),
    li: mix(base, "#ffffff", 0.10),
    base,
    dk: mix(base, "#000000", 0.12),
    sh: mix(base, "#000000", 0.25),
  };
}

/** Horizontal gradient. */
function hGrad(s: Sheet, ox: number, oy: number, w: number, h: number, left: string, right: string): void {
  for (let x = 0; x < w; x++) {
    const c = mix(left, right, x / (w - 1));
    s.rect(ox + x, oy, 1, h, c);
  }
}

/** Radial gradient (approximate — concentric rings). */
function rGrad(s: Sheet, cx: number, cy: number, r: number, inner: string, outer: string): void {
  for (let rr = r; rr >= 0; rr--) {
    const c = mix(inner, outer, 1 - rr / r);
    s.fillCircleAlpha(cx, cy, rr, c, 1);
  }
}

/** Noise with alpha blending (softer texture). */
function noiseAlpha(s: Sheet, ox: number, oy: number, w: number, h: number, color: string, density: number, a: number): void {
  let seed = ox * 73 + oy * 31;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if ((seed & 0xffff) / 0xffff < density) s.setAlpha(ox + x, oy + y, color, a);
    }
  }
}

function woodTile(shade: string, line: string): TileDrawer {
  return (s, ox, oy) => {
    const p = shade5(shade);
    vGrad(s, ox, oy, T, T, p.hi, p.dk);
    // plank seams with bevel
    for (const y of [16, 32, 48]) {
      s.rect(ox, oy + y, T, 2, p.sh);
      s.rect(ox, oy + y + 2, T, 1, p.hi);
      s.rect(ox, oy + y - 1, T, 1, p.li);
    }
    // wood grain streaks — longer, with slight curve
    let seed = ox * 17;
    for (let i = 0; i < 50; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const gx = (seed >> 8) % T;
      const gy = (seed >> 16) % T;
      const len = 3 + (seed % 8);
      s.rect(ox + gx, oy + gy, len, 1, mix(shade, "#000", 0.05));
      if ((seed & 3) === 0) s.set(ox + gx + len, oy + gy, p.dk);
    }
    // occasional grain knot — small dark circle
    seed = (ox * 31 + 7) & 0x7fffffff;
    if ((seed & 7) < 3) {
      const kx = 10 + (seed >> 4) % 44;
      const ky = 4 + (seed >> 12) % 56;
      s.fillCircle(ox + kx, oy + ky, 2, p.dk);
      s.set(ox + kx, oy + ky, p.sh);
    }
    // seam highlights
    for (const y of [18, 34, 50]) s.rect(ox, oy + y, T, 1, mix(p.li, shade, 0.5));
    // soft edge feather
    s.blurEdges(ox, oy, T, T, p.dk, 0.15);
  };
}

function carpetTile(base: string, dot: string): TileDrawer {
  return (s, ox, oy) => {
    const p = shade5(base);
    s.rect(ox, oy, T, T, p.base);
    vGrad(s, ox, oy, T, T, p.li, p.dk);
    // diamond pattern with highlight + shadow
    for (let y = 2; y < T; y += 8) {
      for (let x = ((y / 8) % 2) * 4 + 2; x < T; x += 8) {
        s.set(ox + x, oy + y, dot);
        s.set(ox + x + 1, oy + y, dot);
        s.set(ox + x, oy + y + 1, dot);
        s.set(ox + x, oy + y - 1, p.dk);
        s.set(ox + x + 2, oy + y, p.li);
      }
    }
    // fiber texture — denser, with alpha for softer look
    noiseAlpha(s, ox, oy, T, T, p.dk, 0.12, 0.4);
    noiseAlpha(s, ox, oy, T, T, p.hi, 0.06, 0.3);
    // soft edge feather
    s.blurEdges(ox, oy, T, T, p.dk, 0.1);
  };
}

function kitchenTile(base: string, grout: string): TileDrawer {
  return (s, ox, oy) => {
    const p = shade5(base);
    const gp = shade5(grout);
    s.rect(ox, oy, T, T, p.base);
    // 2x2 sub-tiles with 5-tone shading
    for (const [sx, sy] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
      vGrad(s, ox + sx + 1, oy + sy + 1, 30, 30, p.hi, p.dk);
      // beveled edge
      s.rect(ox + sx + 1, oy + sy + 1, 30, 1, p.hi);
      s.rect(ox + sx + 1, oy + sy + 1, 1, 30, p.li);
      s.rect(ox + sx + 30, oy + sy + 1, 1, 30, p.dk);
      s.rect(ox + sx + 1, oy + sy + 30, 30, 1, p.sh);
    }
    // grout lines with depth
    s.rect(ox, oy + 30, T, 4, gp.base);
    s.rect(ox, oy + 30, T, 1, gp.dk);
    s.rect(ox, oy + 33, T, 1, gp.li);
    s.rect(ox + 30, oy, 4, T, gp.base);
    s.rect(ox + 30, oy, 1, T, gp.dk);
    s.rect(ox + 33, oy, 1, T, gp.li);
    // glossy diagonal highlights
    for (const [sx, sy] of [[4, 4], [36, 4], [4, 36], [36, 36]]) {
      s.line(ox + sx, oy + sy, ox + sx + 8, oy + sy + 4, mix(p.hi, "#ffffff", 0.4));
      s.line(ox + sx + 1, oy + sy + 1, ox + sx + 6, oy + sy + 3, "#ffffff");
    }
    // soft edge feather
    s.blurEdges(ox, oy, T, T, p.dk, 0.1);
  };
}

const drawers: Record<number, TileDrawer> = {
  [TILE.WOOD_A]: woodTile("#c8a070", "#a67e4e"),
  [TILE.WOOD_B]: woodTile("#bc9464", "#9c7242"),
  [TILE.CARPET_A]: carpetTile("#909caa", "#7a8694"),
  [TILE.CARPET_B]: carpetTile("#8a96a2", "#74808e"),
  [TILE.RED_CARPET_A]: carpetTile("#b05050", "#8a3c3c"),
  [TILE.RED_CARPET_B]: carpetTile("#a44848", "#7e3434"),
  [TILE.RUG]: (s, ox, oy) => {
    const p = shade5("#8e4242");
    const bp = shade5("#6a3030");
    const ip = shade5("#b85a5a");
    s.rect(ox, oy, T, T, p.base);
    // border with bevel
    s.rect(ox, oy, T, 4, bp.base);
    s.rect(ox, oy, T, 1, bp.hi);
    s.rect(ox, oy + 3, T, 1, bp.sh);
    s.rect(ox, oy + 60, T, 4, bp.base);
    s.rect(ox, oy + 60, T, 1, bp.li);
    s.rect(ox, oy + 63, T, 1, bp.sh);
    s.rect(ox, oy, 4, T, bp.base);
    s.rect(ox, oy, 1, T, bp.hi);
    s.rect(ox + 3, oy, 1, T, bp.sh);
    s.rect(ox + 60, oy, 4, T, bp.base);
    s.rect(ox + 60, oy, 1, T, bp.li);
    s.rect(ox + 63, oy, 1, T, bp.sh);
    // inner panel with radial gradient
    vGrad(s, ox + 8, oy + 8, 48, 48, ip.hi, ip.dk);
    s.rect(ox + 8, oy + 8, 48, 1, ip.hi);
    s.rect(ox + 8, oy + 8, 1, 48, ip.li);
    // diamond medallion with highlight
    for (let y = 0; y < 14; y++) {
      const w = y < 7 ? y * 2 + 2 : (14 - y) * 2;
      s.rect(ox + 32 - w / 2, oy + 25 + y, w, 1, ip.base);
    }
    for (let y = 0; y < 10; y++) {
      const w = y < 5 ? y * 2 : (10 - y) * 2;
      s.rect(ox + 32 - w / 2, oy + 27 + y, w, 1, ip.li);
    }
    s.fillCircle(ox + 32, oy + 32, 2, p.dk);
    s.set(ox + 31, oy + 31, p.sh);
    // border texture
    noiseAlpha(s, ox, oy, T, 4, bp.sh, 0.15, 0.5);
    noiseAlpha(s, ox, oy + 60, T, 4, bp.sh, 0.15, 0.5);
    // fringe tassels
    for (let i = 0; i < 6; i++) {
      s.set(ox + 6 + i * 10, oy + 1, bp.hi);
      s.set(ox + 6 + i * 10, oy + 62, bp.dk);
    }
  },
  [TILE.TILE_A]: kitchenTile("#dae0d8", "#b0b8b0"),
  [TILE.TILE_B]: kitchenTile("#ced4cc", "#a4aca4"),
  [TILE.DOORMAT]: (s, ox, oy) => {
    const p = shade5("#7a6a42");
    const lp = shade5("#928050");
    s.rect(ox, oy, T, T, p.base);
    // border with bevel
    s.rect(ox, oy, T, 3, p.sh);
    s.rect(ox, oy, T, 1, p.dk);
    s.rect(ox, oy + 61, T, 3, p.sh);
    s.rect(ox, oy + 63, T, 1, p.dk);
    s.rect(ox, oy, 3, T, p.sh);
    s.rect(ox, oy, 1, T, p.dk);
    s.rect(ox + 61, oy, 3, T, p.sh);
    s.rect(ox + 63, oy, 1, T, p.dk);
    // ridge texture with highlight + shadow
    for (let y = 6; y < 58; y += 5) {
      s.rect(ox + 4, oy + y, 56, 2, lp.base);
      s.rect(ox + 4, oy + y, 56, 1, lp.li);
      s.rect(ox + 4, oy + y + 2, 56, 1, p.dk);
    }
    noiseAlpha(s, ox + 4, oy + 4, 56, 56, p.sh, 0.12, 0.4);
    noiseAlpha(s, ox + 4, oy + 4, 56, 56, p.hi, 0.06, 0.3);
  },
  [TILE.WALL_TOP]: (s, ox, oy) => {
    const p = shade5("#4a4f57");
    vGrad(s, ox, oy, T, T, p.li, p.dk);
    // subtle texture
    noiseAlpha(s, ox, oy, T, T, p.dk, 0.06, 0.4);
    // top highlight
    s.rect(ox, oy, T, 2, p.hi);
    // bottom shadow with gradient
    vGrad(s, ox, oy + 54, T, 10, p.dk, p.sh);
    s.rect(ox, oy + 58, T, 6, p.sh);
    // brick texture — subtle horizontal lines
    for (const y of [20, 40]) {
      s.rect(ox, oy + y, T, 1, p.dk);
      s.set(ox + 16, oy + y, p.sh);
      s.set(ox + 48, oy + y, p.sh);
    }
  },
  [TILE.WALL_FACE]: (s, ox, oy) => {
    const p = shade5("#c8cdd3");
    vGrad(s, ox, oy, T, T, p.li, p.dk);
    // panel seam with bevel
    s.rect(ox + 31, oy + 4, 1, 52, p.dk);
    s.rect(ox + 32, oy + 4, 1, 52, p.li);
    // top edge highlight
    s.rect(ox, oy, T, 3, p.hi);
    s.rect(ox, oy, T, 1, mix(p.hi, "#fff", 0.3));
    // bottom baseboard with 5-tone bevel
    s.rect(ox, oy + 50, T, 14, p.dk);
    s.rect(ox, oy + 50, T, 2, p.sh);
    s.rect(ox, oy + 52, T, 1, p.hi);
    s.rect(ox, oy + 62, T, 2, p.li);
    // baseboard texture
    noiseAlpha(s, ox, oy + 52, T, 10, p.sh, 0.08, 0.3);
  },
  [TILE.WINDOW]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    const fp = shade5("#6a7280");
    // frame with bevel
    s.rect(ox + 4, oy + 6, 56, 40, fp.base);
    s.rect(ox + 4, oy + 6, 56, 2, fp.hi);
    s.rect(ox + 4, oy + 6, 2, 40, fp.li);
    s.rect(ox + 58, oy + 6, 2, 40, fp.dk);
    s.rect(ox + 4, oy + 44, 56, 2, fp.sh);
    // sky gradient — richer with horizon glow
    vGrad(s, ox + 8, oy + 10, 48, 32, "#c8e4f8", "#5a8fb8");
    // distant hills
    s.fillCircle(ox + 16, oy + 38, 10, mix("#5a8fb8", "#3a6a98", 0.5));
    s.fillCircle(ox + 40, oy + 38, 12, mix("#5a8fb8", "#3a6a98", 0.4));
    // clouds — softer with alpha
    s.fillCircleAlpha(ox + 14, oy + 15, 5, "#ffffff", 0.9);
    s.fillCircleAlpha(ox + 18, oy + 15, 4, "#ffffff", 0.8);
    s.fillCircleAlpha(ox + 38, oy + 19, 4, "#e8f0f8", 0.7);
    s.fillCircleAlpha(ox + 42, oy + 18, 3, "#e8f0f8", 0.6);
    // cross frame with bevel
    s.rect(ox + 8, oy + 25, 48, 3, fp.base);
    s.rect(ox + 8, oy + 25, 48, 1, fp.li);
    s.rect(ox + 8, oy + 27, 48, 1, fp.dk);
    s.rect(ox + 30, oy + 10, 3, 32, fp.base);
    s.rect(ox + 30, oy + 10, 1, 32, fp.li);
    s.rect(ox + 32, oy + 10, 1, 32, fp.dk);
    // glass reflection — diagonal streak
    s.line(ox + 10, oy + 12, ox + 22, oy + 24, mix("#ffffff", "#b8d8f0", 0.3));
    s.line(ox + 11, oy + 12, ox + 20, oy + 21, mix("#ffffff", "#b8d8f0", 0.2));
  },
  [TILE.WB_L]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    s.rect(ox + 6, oy + 6, 56, 40, "#7a8088");
    s.rect(ox + 8, oy + 8, 52, 36, "#f4f4f8");
    // chart bars
    s.rect(ox + 12, oy + 20, 8, 16, "#d65d5d");
    s.rect(ox + 22, oy + 16, 8, 20, "#4f6b8f");
    s.rect(ox + 32, oy + 24, 8, 12, "#3a9a4e");
    s.rect(ox + 42, oy + 18, 8, 18, "#c9852c");
    // axis line
    s.rect(ox + 10, oy + 36, 44, 1, "#949aa4");
    // screen highlight
    s.rect(ox + 8, oy + 8, 52, 1, "#ffffff");
    s.rect(ox + 8, oy + 8, 1, 36, "#ffffff");
  },
  [TILE.WB_R]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    s.rect(ox + 2, oy + 6, 56, 40, "#7a8088");
    s.rect(ox + 4, oy + 8, 52, 36, "#f4f4f8");
    // task list lines
    s.rect(ox + 8, oy + 14, 40, 2, "#3a9a4e");
    s.rect(ox + 8, oy + 20, 32, 2, "#33373d");
    s.rect(ox + 8, oy + 26, 36, 2, "#d65d5d");
    s.rect(ox + 8, oy + 32, 28, 2, "#33373d");
    // checkboxes
    s.rect(ox + 8, oy + 14, 2, 2, "#ffffff");
    s.rect(ox + 8, oy + 20, 2, 2, "#ffffff");
    s.rect(ox + 8, oy + 26, 2, 2, "#ffffff");
    // screen highlight
    s.rect(ox + 4, oy + 8, 52, 1, "#ffffff");
    s.rect(ox + 4, oy + 8, 1, 36, "#ffffff");
  },
  [TILE.DOOR]: (s, ox, oy) => {
    const fp = shade5("#4a4f57");
    const dp = shade5("#7a5230");
    const pp = shade5("#6a4220");
    s.rect(ox, oy, T, T, fp.base);
    // frame bevel
    s.rect(ox, oy, T, 2, fp.hi);
    s.rect(ox, oy + 62, T, 2, fp.sh);
    // door body with gradient
    vGrad(s, ox + 6, oy + 4, 52, 58, dp.hi, dp.dk);
    // door edge bevel
    s.rect(ox + 6, oy + 4, 2, 58, dp.li);
    s.rect(ox + 56, oy + 4, 2, 58, dp.dk);
    s.rect(ox + 6, oy + 4, 52, 1, dp.hi);
    s.rect(ox + 6, oy + 61, 52, 1, dp.sh);
    // panels with beveled insets
    s.rect(ox + 12, oy + 10, 40, 20, pp.base);
    s.rect(ox + 12, oy + 10, 40, 2, pp.hi);
    s.rect(ox + 12, oy + 10, 2, 20, pp.li);
    s.rect(ox + 50, oy + 10, 2, 20, pp.dk);
    s.rect(ox + 12, oy + 28, 40, 2, pp.sh);
    s.rect(ox + 12, oy + 34, 40, 18, pp.base);
    s.rect(ox + 12, oy + 34, 40, 2, pp.hi);
    s.rect(ox + 12, oy + 34, 2, 18, pp.li);
    s.rect(ox + 50, oy + 34, 2, 18, pp.dk);
    s.rect(ox + 12, oy + 50, 40, 2, pp.sh);
    // doorknob — circular with shine
    s.fillCircle(ox + 52, oy + 34, 3, "#e0b84a");
    s.fillCircle(ox + 51, oy + 33, 2, "#f0d060");
    s.set(ox + 51, oy + 33, "#fff8d0");
    s.set(ox + 53, oy + 35, "#c8a030");
    // wood grain on door
    noiseAlpha(s, ox + 8, oy + 6, 48, 56, dp.sh, 0.04, 0.3);
  },
  [TILE.POSTER]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    const pp = shade5("#e8e2c8");
    s.rect(ox + 10, oy + 6, 44, 44, pp.base);
    s.rect(ox + 10, oy + 6, 44, 2, pp.hi);
    s.rect(ox + 10, oy + 6, 2, 44, pp.li);
    s.rect(ox + 52, oy + 6, 2, 44, pp.dk);
    s.rect(ox + 10, oy + 48, 44, 2, pp.sh);
    // poster content — sky scene
    vGrad(s, ox + 14, oy + 10, 36, 16, "#5aadde", "#3a7cb5");
    // sun
    s.fillCircle(ox + 40, oy + 16, 4, "#ffe880");
    s.fillCircleAlpha(ox + 40, oy + 16, 5, "#ffe880", 0.3);
    // mountains
    s.fillTriangle(ox + 14, oy + 26, ox + 26, oy + 14, ox + 38, oy + 26, "#2a5a8a");
    s.fillTriangle(ox + 28, oy + 26, ox + 38, oy + 16, ox + 50, oy + 26, "#3a6a9a");
    // text lines
    s.rect(ox + 14, oy + 30, 28, 2, "#33373d");
    s.rect(ox + 14, oy + 35, 22, 2, "#33373d");
    s.rect(ox + 14, oy + 40, 32, 2, "#33373d");
    // frame edge with bevel
    s.rect(ox + 10, oy + 6, 44, 1, pp.li);
    s.rect(ox + 10, oy + 6, 1, 44, pp.li);
    s.rect(ox + 53, oy + 7, 1, 43, pp.dk);
    s.rect(ox + 11, oy + 49, 42, 1, pp.dk);
  },
  [TILE.CLOCK]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    const fp = shade5("#2a2e38");
    // frame — circular with bevel
    s.fillCircle(ox + 32, oy + 22, 15, fp.base);
    s.fillCircle(ox + 32, oy + 22, 15, fp.dk);
    s.fillCircle(ox + 31, oy + 21, 14, fp.li);
    // face with radial gradient
    s.fillCircle(ox + 32, oy + 22, 12, "#f8f8fc");
    rGrad(s, ox + 32, oy + 22, 12, "#ffffff", "#e0e0e8");
    // tick marks — thicker at 12/3/6/9
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const r1 = i % 3 === 0 ? 9 : 10;
      const r2 = 11;
      const x1 = 32 + Math.cos(a) * r1;
      const y1 = 22 + Math.sin(a) * r1;
      const x2 = 32 + Math.cos(a) * r2;
      const y2 = 22 + Math.sin(a) * r2;
      const col = i % 3 === 0 ? "#555" : "#888";
      s.lineThick(ox + x1, oy + y1, ox + x2, oy + y2, col, i % 3 === 0 ? 2 : 1);
    }
    // hands
    s.lineThick(ox + 32, oy + 22, ox + 32, oy + 14, "#2a2e38", 2);
    s.lineThick(ox + 32, oy + 22, ox + 40, oy + 22, "#d65d5d", 2);
    // center dot
    s.fillCircle(ox + 32, oy + 22, 2, "#2a2e38");
    s.set(ox + 31, oy + 21, "#4a4e58");
    // glass highlight — curved
    s.line(ox + 24, oy + 14, ox + 28, oy + 12, "#ffffff");
    s.line(ox + 25, oy + 16, ox + 27, oy + 14, mix("#ffffff", "#e0e0e8", 0.4));
  },
  [TILE.DESK_L]: (s, ox, oy) => {
    const tp = shade5("#a87242");
    const sp = shade5("#7c5230");
    // desk surface with 5-tone
    vGrad(s, ox + 2, oy, 60, 44, tp.hi, tp.dk);
    s.rect(ox + 2, oy, 60, 2, tp.hi);
    s.rect(ox + 2, oy, 60, 1, mix(tp.hi, "#fff", 0.2));
    // side panel
    vGrad(s, ox + 2, oy + 44, 60, 16, sp.base, sp.sh);
    s.rect(ox + 2, oy + 44, 60, 2, sp.dk);
    s.rect(ox + 2, oy + 58, 60, 2, sp.sh);
    // left edge bevel
    s.rect(ox + 2, oy, 2, 60, sp.sh);
    s.rect(ox + 4, oy, 1, 44, tp.li);
    // drawer with beveled inset
    s.rect(ox + 8, oy + 22, 48, 16, tp.dk);
    s.rect(ox + 8, oy + 22, 48, 1, tp.sh);
    s.rect(ox + 8, oy + 22, 1, 16, tp.sh);
    s.rect(ox + 55, oy + 22, 1, 16, tp.li);
    s.rect(ox + 8, oy + 37, 48, 1, tp.li);
    s.rect(ox + 24, oy + 30, 16, 2, sp.sh);
    // drawer handle — rounded with shine
    s.fillRoundedRect(ox + 28, oy + 26, 8, 3, 1, sp.sh);
    s.rect(ox + 28, oy + 26, 8, 1, sp.li);
    // wood grain
    noiseAlpha(s, ox + 4, oy + 2, 56, 40, tp.sh, 0.04, 0.3);
  },
  [TILE.DESK_R]: (s, ox, oy) => {
    const tp = shade5("#a87242");
    const sp = shade5("#7c5230");
    vGrad(s, ox, oy, 60, 44, tp.hi, tp.dk);
    s.rect(ox, oy, 60, 2, tp.hi);
    s.rect(ox, oy, 60, 1, mix(tp.hi, "#fff", 0.2));
    vGrad(s, ox, oy + 44, 60, 16, sp.base, sp.sh);
    s.rect(ox, oy + 44, 60, 2, sp.dk);
    s.rect(ox, oy + 58, 60, 2, sp.sh);
    s.rect(ox + 58, oy, 2, 60, sp.sh);
    s.rect(ox + 57, oy, 1, 44, tp.dk);
    // papers with shadow
    s.rect(ox + 5, oy + 11, 20, 24, mix("#f0ece0", "#000", 0.08));
    s.rect(ox + 6, oy + 10, 20, 24, "#f0ece0");
    s.rect(ox + 6, oy + 10, 20, 2, "#ffffff");
    s.rect(ox + 10, oy + 16, 12, 1, "#a8a090");
    s.rect(ox + 10, oy + 20, 10, 1, "#a8a090");
    s.rect(ox + 10, oy + 24, 12, 1, "#a8a090");
    // mug — rounded with shine
    s.fillRoundedRect(ox + 36, oy + 14, 12, 16, 2, "#d65d5d");
    s.rect(ox + 36, oy + 14, 12, 2, "#e87878");
    s.rect(ox + 37, oy + 15, 3, 8, mix("#e87878", "#fff", 0.3));
    s.rect(ox + 48, oy + 18, 4, 8, "#d65d5d");
    s.rect(ox + 40, oy + 18, 4, 8, "#b84444");
    // wood grain
    noiseAlpha(s, ox + 2, oy + 2, 56, 40, tp.sh, 0.04, 0.3);
  },
  [TILE.CHAIR]: (s, ox, oy) => {
    const bp = shade5("#3c4458");
    const sp = shade5("#2e3547");
    // backrest with 5-tone
    vGrad(s, ox + 14, oy + 8, 36, 28, bp.hi, bp.dk);
    s.rect(ox + 14, oy + 8, 36, 2, bp.hi);
    s.rect(ox + 14, oy + 8, 2, 28, bp.li);
    s.rect(ox + 48, oy + 8, 2, 28, bp.dk);
    s.rect(ox + 14, oy + 34, 36, 2, bp.sh);
    // backrest detail — padded seam
    s.rect(ox + 18, oy + 20, 28, 2, bp.dk);
    s.rect(ox + 18, oy + 22, 28, 1, bp.sh);
    // seat with bevel
    vGrad(s, ox + 10, oy + 36, 44, 12, sp.li, sp.dk);
    s.rect(ox + 10, oy + 36, 44, 2, sp.hi);
    s.rect(ox + 10, oy + 46, 44, 2, sp.sh);
    // legs
    s.rect(ox + 26, oy + 48, 4, 8, sp.sh);
    s.rect(ox + 14, oy + 48, 4, 6, sp.sh);
    s.rect(ox + 46, oy + 48, 4, 6, sp.sh);
    // castor wheels
    s.fillCircle(ox + 16, oy + 56, 2, sp.dk);
    s.fillCircle(ox + 48, oy + 56, 2, sp.dk);
  },
  [TILE.CHAIR_LEFT]: (s, ox, oy) => {
    const bp = shade5("#3c4458");
    const sp = shade5("#2e3547");
    // backrest on the right side (facing left) with 5-tone
    vGrad(s, ox + 28, oy + 8, 28, 36, bp.hi, bp.dk);
    s.rect(ox + 28, oy + 8, 28, 2, bp.hi);
    s.rect(ox + 28, oy + 8, 2, 36, bp.li);
    s.rect(ox + 54, oy + 8, 2, 36, bp.dk);
    s.rect(ox + 28, oy + 42, 28, 2, bp.sh);
    // backrest detail — padded seam (vertical)
    s.rect(ox + 40, oy + 12, 2, 28, bp.dk);
    s.rect(ox + 42, oy + 12, 1, 28, bp.sh);
    // seat with bevel
    vGrad(s, ox + 8, oy + 26, 28, 44, sp.li, sp.dk);
    s.rect(ox + 8, oy + 26, 28, 2, sp.hi);
    s.rect(ox + 8, oy + 68, 28, 2, sp.sh);
    // legs
    s.rect(ox + 8, oy + 26, 8, 4, sp.sh);
    s.rect(ox + 8, oy + 38, 8, 6, sp.sh);
    s.rect(ox + 8, oy + 52, 8, 6, sp.sh);
    // castor wheels
    s.fillCircle(ox + 10, oy + 28, 2, sp.dk);
    s.fillCircle(ox + 10, oy + 56, 2, sp.dk);
  },
  [TILE.FILING]: (s, ox, oy) => {
    const p = shade5("#7a8498");
    // body with 5-tone
    vGrad(s, ox + 6, oy + 4, 52, 56, p.hi, p.dk);
    s.rect(ox + 6, oy + 4, 52, 2, p.hi);
    s.rect(ox + 6, oy + 4, 2, 56, p.li);
    s.rect(ox + 56, oy + 4, 2, 56, p.dk);
    s.rect(ox + 6, oy + 58, 52, 2, p.sh);
    // drawer divisions with bevel
    s.rect(ox + 8, oy + 22, 48, 2, p.dk);
    s.rect(ox + 8, oy + 24, 48, 1, p.li);
    s.rect(ox + 8, oy + 44, 48, 2, p.dk);
    s.rect(ox + 8, oy + 46, 48, 1, p.li);
    // drawer insets with 5-tone
    vGrad(s, ox + 10, oy + 8, 44, 12, p.li, p.dk);
    vGrad(s, ox + 10, oy + 26, 44, 16, p.dk, p.li);
    vGrad(s, ox + 10, oy + 48, 44, 10, p.li, p.dk);
    // handles — rounded with shine
    s.fillRoundedRect(ox + 24, oy + 18, 16, 3, 1, p.sh);
    s.rect(ox + 24, oy + 18, 16, 1, p.dk);
    s.fillRoundedRect(ox + 24, oy + 40, 16, 3, 1, p.sh);
    s.rect(ox + 24, oy + 40, 16, 1, p.dk);
    // label tabs with bevel
    s.rect(ox + 12, oy + 10, 8, 4, "#e8e4d0");
    s.rect(ox + 12, oy + 10, 8, 1, "#ffffff");
    s.rect(ox + 12, oy + 32, 8, 4, "#e8e4d0");
    s.rect(ox + 12, oy + 32, 8, 1, "#ffffff");
    s.rect(ox + 12, oy + 52, 8, 4, "#e8e4d0");
    s.rect(ox + 12, oy + 52, 8, 1, "#ffffff");
  },
  [TILE.TRASH]: (s, ox, oy) => {
    const p = shade5("#4a5260");
    // body — tapered with 5-tone
    vGrad(s, ox + 16, oy + 20, 32, 40, p.hi, p.dk);
    // rim with bevel
    s.rect(ox + 14, oy + 16, 36, 4, p.li);
    s.rect(ox + 14, oy + 16, 36, 2, p.hi);
    s.rect(ox + 14, oy + 19, 36, 1, p.dk);
    // paper sticking out with shadow
    s.rect(ox + 23, oy + 9, 12, 10, mix("#e8e4d0", "#000", 0.08));
    s.rect(ox + 24, oy + 8, 12, 10, "#e8e4d0");
    s.rect(ox + 26, oy + 6, 8, 6, "#f0ece0");
    s.rect(ox + 26, oy + 6, 8, 1, "#ffffff");
    // ridges with highlight
    for (const x of [22, 30, 38, 44]) {
      s.rect(ox + x, oy + 24, 2, 32, p.dk);
      s.rect(ox + x + 2, oy + 24, 1, 32, p.li);
    }
    // floor shadow
    s.fillEllipse(ox + 32, oy + 61, 20, 3, mix(p.sh, "#000", 0.2));
  },
  [TILE.PLANT]: (s, ox, oy) => {
    const pp = shade5("#8a4b2d");
    const leaf1 = "#2f7d3f";
    const leaf2 = "#3a9a4e";
    const leaf3 = "#49b85f";
    const leafHi = "#5dca70";
    // pot with 5-tone bevel
    vGrad(s, ox + 20, oy + 40, 24, 20, pp.hi, pp.dk);
    s.rect(ox + 18, oy + 40, 28, 4, pp.li);
    s.rect(ox + 18, oy + 40, 28, 2, pp.hi);
    s.rect(ox + 18, oy + 43, 28, 1, pp.dk);
    s.rect(ox + 20, oy + 58, 24, 2, pp.sh);
    // leaves — circular clusters for organic look
    s.fillCircle(ox + 32, oy + 28, 12, leaf1);
    s.fillCircle(ox + 22, oy + 28, 8, leaf2);
    s.fillCircle(ox + 42, oy + 28, 8, leaf2);
    s.fillCircle(ox + 32, oy + 14, 8, leaf3);
    s.fillCircle(ox + 24, oy + 20, 6, leaf3);
    s.fillCircle(ox + 42, oy + 20, 6, leaf3);
    // leaf highlights
    s.fillCircle(ox + 30, oy + 12, 3, leafHi);
    s.fillCircle(ox + 22, oy + 26, 3, leaf3);
    s.fillCircle(ox + 40, oy + 26, 3, leaf3);
    // leaf shadows
    s.fillCircleAlpha(ox + 36, oy + 32, 5, mix(leaf1, "#000", 0.15), 0.6);
    s.fillCircleAlpha(ox + 24, oy + 34, 4, mix(leaf1, "#000", 0.12), 0.5);
    // pot shadow on floor
    s.fillEllipse(ox + 32, oy + 61, 16, 3, mix(pp.sh, "#000", 0.15));
  },
  [TILE.SHELF_T]: (s, ox, oy) => {
    const p = shade5("#6e4a2c");
    // frame with 5-tone
    vGrad(s, ox + 2, oy, 60, 64, p.hi, p.dk);
    s.rect(ox + 2, oy, 60, 2, p.hi);
    s.rect(ox + 2, oy, 2, 64, p.li);
    s.rect(ox + 60, oy, 2, 64, p.dk);
    // shelf interiors with shadow
    s.rect(ox + 6, oy + 6, 52, 20, p.sh);
    s.rect(ox + 6, oy + 34, 52, 20, p.sh);
    s.rect(ox + 6, oy + 6, 52, 1, p.dk);
    s.rect(ox + 6, oy + 34, 52, 1, p.dk);
    // books row 1 with bevel + shine
    const books1 = ["#d65d5d", "#4f9dde", "#3a9a4e", "#c9852c", "#5b7d9e", "#d65db1", "#36b5b0"];
    books1.forEach((c, i) => {
      const bx = ox + 8 + i * 7;
      s.rect(bx, oy + 10, 6, 14, c);
      s.rect(bx, oy + 10, 6, 2, mix(c, "#fff", 0.25));
      s.rect(bx, oy + 10, 1, 14, mix(c, "#fff", 0.12));
      s.rect(bx + 5, oy + 10, 1, 14, mix(c, "#000", 0.15));
    });
    // books row 2
    const books2 = ["#36b5b0", "#c9852c", "#d65db1", "#4f6b8f", "#d65d5d", "#3a9a4e", "#5b7d9e"];
    books2.forEach((c, i) => {
      const bx = ox + 8 + i * 7;
      s.rect(bx, oy + 38, 6, 14, c);
      s.rect(bx, oy + 38, 6, 2, mix(c, "#fff", 0.25));
      s.rect(bx, oy + 38, 1, 14, mix(c, "#fff", 0.12));
      s.rect(bx + 5, oy + 38, 1, 14, mix(c, "#000", 0.15));
    });
    // shelf divider with bevel
    s.rect(ox + 6, oy + 28, 52, 6, p.base);
    s.rect(ox + 6, oy + 28, 52, 1, p.hi);
    s.rect(ox + 6, oy + 33, 52, 1, p.sh);
  },
  [TILE.SHELF_B]: (s, ox, oy) => {
    const p = shade5("#6e4a2c");
    vGrad(s, ox + 2, oy, 60, 56, p.hi, p.dk);
    s.rect(ox + 2, oy, 60, 2, p.hi);
    s.rect(ox + 2, oy, 2, 56, p.li);
    s.rect(ox + 60, oy, 2, 56, p.dk);
    // top shelf interior
    s.rect(ox + 6, oy + 4, 52, 20, p.sh);
    s.rect(ox + 6, oy + 4, 52, 1, p.dk);
    // books with bevel
    const books = ["#4f9dde", "#d65d5d", "#e8e4d0", "#3a9a4e", "#7d8597", "#c9852c", "#d65db1"];
    books.forEach((c, i) => {
      const bx = ox + 8 + i * 7;
      s.rect(bx, oy + 8, 6, 14, c);
      s.rect(bx, oy + 8, 6, 2, mix(c, "#fff", 0.25));
      s.rect(bx, oy + 8, 1, 14, mix(c, "#fff", 0.12));
      s.rect(bx + 5, oy + 8, 1, 14, mix(c, "#000", 0.15));
    });
    // bottom panel
    vGrad(s, ox + 2, oy + 28, 60, 28, p.dk, p.sh);
    s.rect(ox + 2, oy + 28, 60, 2, p.dk);
    s.rect(ox + 2, oy + 28, 60, 1, p.sh);
    // items on bottom shelf with bevel
    s.fillRoundedRect(ox + 10, oy + 34, 12, 12, 1, "#d65d5d");
    s.rect(ox + 10, oy + 34, 12, 2, "#e87878");
    s.fillRoundedRect(ox + 26, oy + 36, 8, 10, 1, "#4f9dde");
    s.rect(ox + 26, oy + 36, 8, 2, mix("#4f9dde", "#fff", 0.2));
    s.rect(ox + 38, oy + 34, 16, 12, "#e8e4d0");
    s.rect(ox + 38, oy + 34, 16, 2, "#ffffff");
    s.rect(ox + 38, oy + 34, 1, 12, mix("#e8e4d0", "#fff", 0.2));
  },
  [TILE.COUNTER]: (s, ox, oy) => {
    const tp = shade5("#d4dad8");
    const cp = shade5("#6a4828");
    // countertop with 5-tone
    vGrad(s, ox, oy, T, 24, tp.hi, tp.dk);
    s.rect(ox, oy, T, 3, tp.hi);
    s.rect(ox, oy, T, 1, mix(tp.hi, "#fff", 0.2));
    s.rect(ox, oy + 22, T, 2, tp.sh);
    // cabinet with 5-tone
    vGrad(s, ox, oy + 24, T, 36, cp.li, cp.sh);
    s.rect(ox, oy + 24, T, 2, cp.dk);
    s.rect(ox, oy + 58, T, 2, cp.sh);
    // cabinet door bevel
    s.rect(ox + 28, oy + 32, 2, 24, cp.dk);
    s.rect(ox + 28, oy + 32, 1, 24, cp.sh);
    s.rect(ox + 30, oy + 32, 1, 24, cp.li);
    s.rect(ox + 18, oy + 40, 8, 2, cp.dk);
    s.rect(ox + 34, oy + 40, 8, 2, cp.dk);
    // handles — rounded
    s.fillRoundedRect(ox + 22, oy + 38, 4, 2, 1, cp.sh);
    s.fillRoundedRect(ox + 38, oy + 38, 4, 2, 1, cp.sh);
  },
  [TILE.FRIDGE]: (s, ox, oy) => {
    const p = shade5("#c4cdd4");
    vGrad(s, ox + 6, oy, 52, 60, p.hi, p.dk);
    s.rect(ox + 6, oy, 52, 2, p.hi);
    s.rect(ox + 6, oy, 2, 60, p.li);
    s.rect(ox + 56, oy, 2, 60, p.dk);
    s.rect(ox + 6, oy + 58, 52, 2, p.sh);
    // door seam with bevel
    s.rect(ox + 8, oy + 24, 48, 1, p.dk);
    s.rect(ox + 8, oy + 25, 48, 1, p.li);
    // handles — rounded with shine
    s.fillRoundedRect(ox + 48, oy + 6, 3, 10, 1, p.sh);
    s.rect(ox + 48, oy + 6, 3, 1, p.dk);
    s.fillRoundedRect(ox + 48, oy + 30, 3, 16, 1, p.sh);
    s.rect(ox + 48, oy + 30, 3, 1, p.dk);
    // glossy highlight streak
    s.rect(ox + 10, oy + 4, 3, 52, mix(p.hi, "#fff", 0.15));
    s.rect(ox + 11, oy + 4, 1, 52, mix(p.hi, "#fff", 0.25));
  },
  [TILE.COFFEE]: (s, ox, oy) => {
    drawers[TILE.COUNTER]!(s, ox, oy);
    const p = shade5("#8e2828");
    vGrad(s, ox + 16, oy, 32, 24, p.hi, p.dk);
    s.rect(ox + 16, oy, 32, 2, p.hi);
    s.rect(ox + 16, oy, 2, 24, p.li);
    s.rect(ox + 46, oy, 2, 24, p.dk);
    // spout with depth
    s.fillRoundedRect(ox + 24, oy + 8, 16, 12, 2, "#1a1e28");
    s.rect(ox + 24, oy + 8, 16, 1, "#2a2e38");
    s.rect(ox + 28, oy + 12, 8, 4, "#0a0e18");
    s.fillCircle(ox + 32, oy + 14, 1, "#e0b84a");
    // steam — softer with alpha
    s.fillCircleAlpha(ox + 28, oy - 2, 2, "#e8e8e8", 0.6);
    s.fillCircleAlpha(ox + 32, oy - 4, 2, "#d8d8d8", 0.5);
    s.fillCircleAlpha(ox + 36, oy - 2, 2, "#e0e0e0", 0.5);
    s.fillCircleAlpha(ox + 34, oy - 6, 1, "#d0d0d0", 0.4);
  },
  [TILE.COOLER]: (s, ox, oy) => {
    const p = shade5("#d8dee4");
    // base with 5-tone
    vGrad(s, ox + 16, oy + 28, 32, 32, p.hi, p.dk);
    s.rect(ox + 16, oy + 28, 32, 2, p.hi);
    s.rect(ox + 16, oy + 58, 32, 2, p.sh);
    // water jug — rounded with radial gradient
    s.fillRoundedRect(ox + 20, oy + 4, 24, 24, 3, "#a8d2ec");
    rGrad(s, ox + 32, oy + 16, 12, "#c8e2f8", "#5a9cc8");
    s.rect(ox + 20, oy + 4, 24, 3, mix("#a8d2ec", "#fff", 0.3));
    s.rect(ox + 24, oy + 8, 4, 12, mix("#a8d2ec", "#fff", 0.25));
    // spouts with bevel
    s.fillRoundedRect(ox + 24, oy + 36, 8, 8, 1, "#4f9dde");
    s.rect(ox + 24, oy + 36, 8, 2, mix("#4f9dde", "#fff", 0.2));
    s.fillRoundedRect(ox + 36, oy + 36, 4, 8, 1, "#d65d5d");
    s.rect(ox + 36, oy + 36, 4, 2, mix("#d65d5d", "#fff", 0.2));
  },
  [TILE.SOFA_L]: (s, ox, oy) => {
    const p = shade5("#4a6888");
    const ap = shade5("#384e6c");
    // back + seat with 5-tone
    vGrad(s, ox + 4, oy + 16, 60, 32, p.hi, p.dk);
    s.rect(ox + 4, oy + 16, 60, 3, p.hi);
    // arm with 5-tone
    vGrad(s, ox + 4, oy + 8, 16, 40, ap.li, ap.sh);
    s.rect(ox + 4, oy + 8, 16, 3, ap.hi);
    s.rect(ox + 4, oy + 8, 2, 40, ap.li);
    s.rect(ox + 18, oy + 8, 2, 40, ap.dk);
    // base
    s.rect(ox + 4, oy + 48, 60, 12, p.sh);
    s.rect(ox + 4, oy + 48, 60, 2, p.dk);
    // cushion seam with bevel
    s.rect(ox + 32, oy + 24, 2, 20, p.dk);
    s.rect(ox + 34, oy + 24, 1, 20, p.li);
    // cushion highlights
    s.rect(ox + 20, oy + 24, 12, 2, p.hi);
    s.rect(ox + 36, oy + 24, 24, 2, p.hi);
  },
  [TILE.SOFA_R]: (s, ox, oy) => {
    const p = shade5("#4a6888");
    const ap = shade5("#384e6c");
    vGrad(s, ox, oy + 16, 60, 32, p.hi, p.dk);
    s.rect(ox, oy + 16, 60, 3, p.hi);
    vGrad(s, ox + 44, oy + 8, 16, 40, ap.li, ap.sh);
    s.rect(ox + 44, oy + 8, 16, 3, ap.hi);
    s.rect(ox + 44, oy + 8, 2, 40, ap.li);
    s.rect(ox + 58, oy + 8, 2, 40, ap.dk);
    s.rect(ox, oy + 48, 60, 12, p.sh);
    s.rect(ox, oy + 48, 60, 2, p.dk);
    s.rect(ox + 30, oy + 24, 2, 20, p.dk);
    s.rect(ox + 32, oy + 24, 1, 20, p.li);
    s.rect(ox + 4, oy + 24, 24, 2, p.hi);
    s.rect(ox + 34, oy + 24, 20, 2, p.hi);
  },
  [TILE.PAPERS]: (s, ox, oy) => {
    // paper 1 with shadow
    s.rect(ox + 9, oy + 15, 24, 28, mix("#f0ece0", "#000", 0.08));
    s.rect(ox + 10, oy + 14, 24, 28, "#f0ece0");
    s.rect(ox + 10, oy + 14, 24, 3, "#ffffff");
    s.rect(ox + 10, oy + 14, 1, 28, mix("#f0ece0", "#fff", 0.2));
    s.rect(ox + 14, oy + 22, 16, 1, "#a8a090");
    s.rect(ox + 14, oy + 26, 14, 1, "#a8a090");
    s.rect(ox + 14, oy + 30, 16, 1, "#a8a090");
    s.rect(ox + 14, oy + 34, 12, 1, "#a8a090");
    // paper 2 (offset) with shadow
    s.rect(ox + 29, oy + 23, 24, 28, mix("#e0d8c0", "#000", 0.08));
    s.rect(ox + 30, oy + 22, 24, 28, "#e0d8c0");
    s.rect(ox + 30, oy + 22, 24, 3, "#f0e8d0");
    s.rect(ox + 30, oy + 22, 1, 28, mix("#e0d8c0", "#fff", 0.15));
    s.rect(ox + 34, oy + 30, 16, 1, "#989080");
    s.rect(ox + 34, oy + 34, 14, 1, "#989080");
    s.rect(ox + 34, oy + 38, 16, 1, "#989080");
  },
  [TILE.VENDING]: vendingTile("#8e2828", "#a83838"),
  [TILE.DESK_SIDE_TOP]: (s, ox, oy) => {
    const tp = shade5("#f4f6f8");
    const sp = shade5("#c3c8cd");
    // desk surface — left portion (top-down view, the working area)
    vGrad(s, ox, oy, 44, 64, tp.hi, tp.dk);
    // left edge highlight (facing entrance)
    s.rect(ox, oy, 3, 64, tp.hi);
    s.rect(ox, oy, 1, 64, mix(tp.hi, "#fff", 0.3));
    // front panel — right portion (facing Yuki on the right)
    vGrad(s, ox + 44, oy, 18, 64, sp.li, sp.sh);
    s.rect(ox + 44, oy, 2, 64, sp.dk);
    s.rect(ox + 60, oy, 2, 64, sp.sh);
    // top edge
    s.rect(ox, oy, 64, 2, sp.sh);
    // cable hole on desk surface
    s.fillCircle(ox + 22, oy + 10, 3, "#1a1a1a");
  },
  [TILE.DESK_SIDE_BOTTOM]: (s, ox, oy) => {
    const tp = shade5("#f4f6f8");
    const sp = shade5("#c3c8cd");
    // desk surface continuation
    vGrad(s, ox, oy, 44, 64, tp.hi, tp.dk);
    s.rect(ox, oy, 1, 64, mix(tp.hi, "#fff", 0.2));
    // front panel continuation
    vGrad(s, ox + 44, oy, 18, 64, sp.li, sp.sh);
    s.rect(ox + 44, oy, 2, 64, sp.dk);
    s.rect(ox + 60, oy, 2, 64, sp.sh);
    // papers with shadow
    s.rect(ox + 5, oy + 11, 20, 24, mix("#f7f8fa", "#000", 0.08));
    s.rect(ox + 6, oy + 10, 20, 24, "#f7f8fa");
    s.rect(ox + 6, oy + 10, 20, 3, "#ffffff");
    s.rect(ox + 10, oy + 18, 12, 1, "#9aa0a8");
    s.rect(ox + 10, oy + 22, 10, 1, "#9aa0a8");
    // mug
    s.fillRoundedRect(ox + 26, oy + 14, 12, 12, 2, "#3a6f57");
    s.rect(ox + 26, oy + 14, 12, 2, mix("#3a6f57", "#fff", 0.15));
    s.rect(ox + 27, oy + 15, 3, 6, mix("#3a6f57", "#fff", 0.25));
    s.rect(ox + 38, oy + 18, 4, 6, "#3a6f57");
    // bottom edge
    s.rect(ox, oy + 60, 64, 2, sp.sh);
    // desk legs
    s.rect(ox + 4, oy + 54, 6, 8, sp.dk);
    s.rect(ox + 36, oy + 54, 6, 8, sp.dk);
  },
  [TILE.DESK_SIDE_TOP_MIRROR]: (s, ox, oy) => {
    const tp = shade5("#f4f6f8");
    const sp = shade5("#c3c8cd");
    // front panel — left portion (facing Hermes on the left)
    vGrad(s, ox + 2, oy, 18, 64, sp.li, sp.sh);
    s.rect(ox + 18, oy, 2, 64, sp.dk);
    s.rect(ox + 2, oy, 2, 64, sp.sh);
    // desk surface — right portion (top-down view, the working area)
    vGrad(s, ox + 20, oy, 44, 64, tp.hi, tp.dk);
    // right edge highlight (facing entrance)
    s.rect(ox + 61, oy, 3, 64, tp.hi);
    s.rect(ox + 63, oy, 1, 64, mix(tp.hi, "#fff", 0.3));
    // top edge
    s.rect(ox, oy, 64, 2, sp.sh);
    // cable hole on desk surface
    s.fillCircle(ox + 42, oy + 10, 3, "#1a1a1a");
  },
  [TILE.DESK_SIDE_BOTTOM_MIRROR]: (s, ox, oy) => {
    const tp = shade5("#f4f6f8");
    const sp = shade5("#c3c8cd");
    // front panel continuation
    vGrad(s, ox + 2, oy, 18, 64, sp.li, sp.sh);
    s.rect(ox + 18, oy, 2, 64, sp.dk);
    s.rect(ox + 2, oy, 2, 64, sp.sh);
    // desk surface continuation
    vGrad(s, ox + 20, oy, 44, 64, tp.hi, tp.dk);
    s.rect(ox + 63, oy, 1, 64, mix(tp.hi, "#fff", 0.2));
    // papers with shadow
    s.rect(ox + 39, oy + 11, 20, 24, mix("#f7f8fa", "#000", 0.08));
    s.rect(ox + 38, oy + 10, 20, 24, "#f7f8fa");
    s.rect(ox + 38, oy + 10, 20, 3, "#ffffff");
    s.rect(ox + 42, oy + 18, 12, 1, "#9aa0a8");
    s.rect(ox + 44, oy + 22, 10, 1, "#9aa0a8");
    // mug
    s.fillRoundedRect(ox + 26, oy + 14, 12, 12, 2, "#3a6f57");
    s.rect(ox + 26, oy + 14, 12, 2, mix("#3a6f57", "#fff", 0.15));
    s.rect(ox + 34, oy + 15, 3, 6, mix("#3a6f57", "#fff", 0.25));
    s.rect(ox + 22, oy + 18, 4, 6, "#3a6f57");
    // bottom edge
    s.rect(ox, oy + 60, 64, 2, sp.sh);
    // desk legs
    s.rect(ox + 54, oy + 54, 6, 8, sp.dk);
    s.rect(ox + 22, oy + 54, 6, 8, sp.dk);
  },
  [TILE.CHAIR_RIGHT]: (s, ox, oy) => {
    const bp = shade5("#3c4458");
    const sp = shade5("#2e3547");
    // backrest on the left side (facing right) with 5-tone
    vGrad(s, ox + 8, oy + 8, 28, 36, bp.hi, bp.dk);
    s.rect(ox + 8, oy + 8, 28, 2, bp.hi);
    s.rect(ox + 8, oy + 8, 2, 36, bp.dk);
    s.rect(ox + 34, oy + 8, 2, 36, bp.li);
    s.rect(ox + 8, oy + 42, 28, 2, bp.sh);
    // backrest detail — padded seam (vertical)
    s.rect(ox + 22, oy + 12, 2, 28, bp.dk);
    s.rect(ox + 21, oy + 12, 1, 28, bp.sh);
    // seat with bevel
    vGrad(s, ox + 28, oy + 26, 28, 44, sp.li, sp.dk);
    s.rect(ox + 28, oy + 26, 28, 2, sp.hi);
    s.rect(ox + 28, oy + 68, 28, 2, sp.sh);
    // legs
    s.rect(ox + 48, oy + 26, 8, 4, sp.sh);
    s.rect(ox + 48, oy + 38, 8, 6, sp.sh);
    s.rect(ox + 48, oy + 52, 8, 6, sp.sh);
    // castor wheels
    s.fillCircle(ox + 54, oy + 28, 2, sp.dk);
    s.fillCircle(ox + 54, oy + 56, 2, sp.dk);
  },
  [TILE.SERVER_RACK]: (s, ox, oy) => {
    const p = shade5("#1a1a22");
    // tall dark metal cabinet
    vGrad(s, ox + 2, oy, 60, 64, p.li, p.dk);
    s.rect(ox + 2, oy, 60, 2, p.hi);
    s.rect(ox + 2, oy, 2, 64, p.li);
    s.rect(ox + 60, oy, 2, 64, p.dk);
    s.rect(ox + 2, oy + 62, 60, 2, p.sh);
    // rack unit slots (1U each) with ventilation
    for (let i = 0; i < 6; i++) {
      const y = oy + 4 + i * 10;
      // slot border
      s.rect(ox + 5, y, 54, 8, "#0a0a12");
      s.rect(ox + 5, y, 54, 1, p.dk);
      s.rect(ox + 5, y + 7, 54, 1, p.sh);
      // vent grille
      s.rect(ox + 8, y + 2, 40, 4, "#050508");
      for (let v = 0; v < 8; v++) {
        s.rect(ox + 8 + v * 5, y + 2, 3, 4, "#12121a");
      }
      // LED indicators
      s.rect(ox + 52, y + 2, 2, 2, i % 2 === 0 ? "#3dff7a" : "#ffaa3d");
      s.rect(ox + 55, y + 2, 2, 2, "#3dff7a");
      s.rect(ox + 52, y + 5, 2, 1, "#ff4444");
    }
  },
  [TILE.SERVER_SCREEN]: (s, ox, oy) => {
    const p = shade5("#1a1a22");
    // matching cabinet frame
    vGrad(s, ox + 2, oy, 60, 64, p.li, p.dk);
    s.rect(ox + 2, oy, 60, 2, p.hi);
    s.rect(ox + 2, oy, 2, 64, p.li);
    s.rect(ox + 60, oy, 2, 64, p.dk);
    s.rect(ox + 2, oy + 62, 60, 2, p.sh);
    // large monitoring screen
    vGrad(s, ox + 6, oy + 4, 52, 56, "#080a12", "#121620");
    s.rect(ox + 6, oy + 4, 52, 1, "#2a3040");
    s.rect(ox + 6, oy + 4, 1, 56, "#2a3040");
    // terminal text lines
    s.rect(ox + 10, oy + 10, 36, 1, "#3dff7a");
    s.rect(ox + 10, oy + 16, 28, 1, "#3dff7a");
    s.rect(ox + 10, oy + 22, 40, 1, "#3dff7a");
    s.rect(ox + 10, oy + 28, 24, 1, "#3dff7a");
    s.rect(ox + 10, oy + 34, 32, 1, "#3dff7a");
    s.rect(ox + 10, oy + 40, 20, 1, "#ffaa3d");
    s.rect(ox + 10, oy + 46, 36, 1, "#3dff7a");
    s.rect(ox + 10, oy + 52, 28, 1, "#3dff7a");
    // status bar at bottom
    s.rect(ox + 6, oy + 56, 52, 4, "#0a0a14");
    s.rect(ox + 8, oy + 57, 12, 2, "#3dff7a");
    s.rect(ox + 22, oy + 57, 8, 2, "#ffaa3d");
  },
  [TILE.CHIMNEY]: (s, ox, oy) => {
    const p = shade5("#4a3828");
    // brick base
    vGrad(s, ox, oy, 64, 64, p.li, p.dk);
    s.rect(ox, oy, 64, 2, p.hi);
    // brick pattern
    for (let r = 0; r < 8; r++) {
      const y = oy + r * 8;
      const offset = r % 2 === 0 ? 0 : 16;
      for (let c = 0; c < 5; c++) {
        s.rect(ox + offset + c * 16, y, 14, 7, mix(p.base, "#000", 0.1));
        s.rect(ox + offset + c * 16, y, 14, 1, p.sh);
      }
    }
    // inner darkness
    s.rect(ox + 20, oy + 4, 24, 56, "#1a0a0a");
    s.rect(ox + 22, oy + 6, 20, 52, "#0a0505");
  },
};

function vendingTile(body: string, bodyLight: string): TileDrawer {
  return (s, ox, oy) => {
    const p = shade5(body);
    vGrad(s, ox + 6, oy, 52, 60, p.hi, p.dk);
    s.rect(ox + 6, oy, 52, 2, p.hi);
    s.rect(ox + 6, oy, 2, 60, p.li);
    s.rect(ox + 56, oy, 2, 60, p.dk);
    s.rect(ox + 6, oy + 58, 52, 2, p.sh);
    // glass front with depth
    vGrad(s, ox + 10, oy + 8, 28, 32, "#181c24", "#282c34");
    s.rect(ox + 10, oy + 8, 28, 2, "#2a3040");
    s.rect(ox + 10, oy + 8, 1, 32, "#2a3040");
    s.rect(ox + 37, oy + 8, 1, 32, "#0a0e14");
    // snacks grid with bevel
    const snacks = ["#e0b84a", "#d65d5d", "#4f9dde", "#3a9a4e", "#c9852c", "#d65db1"];
    snacks.forEach((c, i) => {
      const sx = ox + 12 + (i % 3) * 8;
      const sy = oy + 12 + Math.floor(i / 3) * 12;
      s.rect(sx, sy, 6, 8, c);
      s.rect(sx, sy, 6, 2, mix(c, "#fff", 0.25));
      s.rect(sx, sy, 1, 8, mix(c, "#fff", 0.12));
      s.rect(sx + 5, sy, 1, 8, mix(c, "#000", 0.15));
      s.rect(sx, sy + 7, 6, 1, mix(c, "#000", 0.2));
    });
    // glass reflection — diagonal
    s.line(ox + 12, oy + 10, ox + 18, oy + 38, mix("#ffffff", "#3a4050", 0.12));
    s.line(ox + 13, oy + 10, ox + 19, oy + 38, mix("#ffffff", "#3a4050", 0.08));
    // coin panel with bevel
    s.rect(ox + 42, oy + 8, 14, 16, "#e8eaec");
    s.rect(ox + 42, oy + 8, 14, 2, "#f4f6f8");
    s.rect(ox + 42, oy + 8, 1, 16, "#f4f6f8");
    s.rect(ox + 55, oy + 8, 1, 16, "#c8ccd0");
    s.rect(ox + 42, oy + 22, 14, 2, "#c8ccd0");
    s.rect(ox + 44, oy + 12, 10, 2, "#33373d");
    s.rect(ox + 44, oy + 16, 10, 2, "#33373d");
    s.rect(ox + 44, oy + 20, 6, 2, "#d65d5d");
    // dispense slot with depth
    s.fillRoundedRect(ox + 10, oy + 44, 28, 8, 1, "#181c24");
    s.rect(ox + 10, oy + 44, 28, 1, "#282c34");
    s.rect(ox + 10, oy + 51, 28, 1, "#0a0e14");
  };
}

// Agent HQ theme: blue carpet everywhere, classic office styling with branded floor logo.

// 5×7 pixel bitmap font (same as generate-og-image.ts)
const PIXEL_FONT: Record<string, string[]> = {
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01111","10000","10000","10000","10000","10000","01111"],
  D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01111","10000","10000","10011","10001","10001","01111"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  J: ["00111","00010","00010","00010","00010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","11011","10001"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","10001","01010","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
};

function pixelFontWidth(text: string, scale: number): number {
  return text.length * (5 + 1) * scale - scale;
}

function drawPixelText(s: Sheet, text: string, startX: number, startY: number, scale: number, hex: string): void {
  let x = startX;
  for (const ch of text.toUpperCase()) {
    const glyph = PIXEL_FONT[ch] ?? PIXEL_FONT[" "];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === "1") {
          s.rect(x + gx * scale, startY + gy * scale, scale, scale, hex);
        }
      }
    }
    x += (5 + 1) * scale;
  }
}

// Agent HQ logo — drawn as a 10×5 tile grid (640×320px), sublimated into the carpet.
// No plate background; green pixel text + accent line blend directly onto the floor.
const LOGO_W = 640; // 10 * 64
const LOGO_H = 320; // 5 * 64

function drawAgentHQLogo(s: Sheet, ox: number, oy: number): void {
  const cx = ox + LOGO_W / 2;
  const cy = oy + LOGO_H / 2 + 16; // shifted down slightly

  const accent = "#58c866";
  const accentDk = "#3a8848";

  // --- "AGENT HQ HQ" in pixel font ---
  const title = "AGENT HQ HQ";
  const titleScale = 9; // 12 chars × (5+1)*9 - 9 = 639px, fits in 640px canvas
  const titleW = pixelFontWidth(title, titleScale);
  const titleX = Math.round(cx - titleW / 2);
  const titleY = Math.round(cy - 63 / 2) - 12; // shift up for accent line below

  // Shadow (offset by 4px, very dark, barely visible)
  drawPixelTextAlpha(s, title, titleX + 4, titleY + 4, titleScale, "#0a0e14", 0.15);
  // Main text — bright green, very transparent so carpet dominates
  drawPixelTextAlpha(s, title, titleX, titleY, titleScale, accent, 0.3);

  // Accent line below text
  const lineY = titleY + 7 * titleScale + 16;
  const lineW = Math.min(titleW + 60, LOGO_W - 80);
  const lineX = Math.round(cx - lineW / 2);
  for (let x = lineX; x < lineX + lineW; x++) {
    s.setAlpha(x, lineY, accent, 0.25);
    s.setAlpha(x, lineY + 1, accent, 0.25);
    s.setAlpha(x, lineY + 2, accentDk, 0.2);
  }

  // Small decorative dots flanking the accent line
  for (let i = 0; i < 4; i++) {
    s.setAlpha(lineX - 10 - i * 5, lineY + 1, accent, 0.2);
    s.setAlpha(lineX + lineW + 6 + i * 5, lineY + 1, accent, 0.2);
  }
}

// Alpha-blended version of drawPixelText
function drawPixelTextAlpha(s: Sheet, text: string, startX: number, startY: number, scale: number, hex: string, alpha: number): void {
  let x = startX;
  for (const ch of text.toUpperCase()) {
    const glyph = PIXEL_FONT[ch] ?? PIXEL_FONT[" "];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === "1") {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              s.setAlpha(x + gx * scale + dx, startY + gy * scale + dy, hex, alpha);
            }
          }
        }
      }
    }
    x += (5 + 1) * scale;
  }
}

// Create a logo fragment drawer for tile (row, col) in the 10×5 grid.
function logoFragment(row: number, col: number): TileDrawer {
  const carpetA = carpetTile("#4a6a8a", "#3a5a7a");
  const carpetB = carpetTile("#446484", "#365474");
  return (s, ox, oy) => {
    // Draw carpet base first so alpha-blended text has something to blend onto
    const checker = (col + row) % 2 === 0 ? carpetA : carpetB;
    checker(s, ox, oy);
    // Now draw the logo fragment on top
    const baseX = ox - col * T;
    const baseY = oy - row * T;
    s.clip = { x: ox, y: oy, w: T, h: T };
    drawAgentHQLogo(s, baseX, baseY);
    s.clip = null;
  };
}

const agenthqDrawers: Record<number, TileDrawer> = {
  ...drawers,
  [TILE.CARPET_A]: carpetTile("#4a6a8a", "#3a5a7a"),
  [TILE.CARPET_B]: carpetTile("#446484", "#365474"),
  [TILE.LOGO_00]: logoFragment(0, 0),
  [TILE.LOGO_01]: logoFragment(0, 1),
  [TILE.LOGO_02]: logoFragment(0, 2),
  [TILE.LOGO_03]: logoFragment(0, 3),
  [TILE.LOGO_04]: logoFragment(0, 4),
  [TILE.LOGO_05]: logoFragment(0, 5),
  [TILE.LOGO_06]: logoFragment(0, 6),
  [TILE.LOGO_07]: logoFragment(0, 7),
  [TILE.LOGO_08]: logoFragment(0, 8),
  [TILE.LOGO_09]: logoFragment(0, 9),
  [TILE.LOGO_10]: logoFragment(1, 0),
  [TILE.LOGO_11]: logoFragment(1, 1),
  [TILE.LOGO_12]: logoFragment(1, 2),
  [TILE.LOGO_13]: logoFragment(1, 3),
  [TILE.LOGO_14]: logoFragment(1, 4),
  [TILE.LOGO_15]: logoFragment(1, 5),
  [TILE.LOGO_16]: logoFragment(1, 6),
  [TILE.LOGO_17]: logoFragment(1, 7),
  [TILE.LOGO_18]: logoFragment(1, 8),
  [TILE.LOGO_19]: logoFragment(1, 9),
  [TILE.LOGO_20]: logoFragment(2, 0),
  [TILE.LOGO_21]: logoFragment(2, 1),
  [TILE.LOGO_22]: logoFragment(2, 2),
  [TILE.LOGO_23]: logoFragment(2, 3),
  [TILE.LOGO_24]: logoFragment(2, 4),
  [TILE.LOGO_25]: logoFragment(2, 5),
  [TILE.LOGO_26]: logoFragment(2, 6),
  [TILE.LOGO_27]: logoFragment(2, 7),
  [TILE.LOGO_28]: logoFragment(2, 8),
  [TILE.LOGO_29]: logoFragment(2, 9),
  [TILE.LOGO_30]: logoFragment(3, 0),
  [TILE.LOGO_31]: logoFragment(3, 1),
  [TILE.LOGO_32]: logoFragment(3, 2),
  [TILE.LOGO_33]: logoFragment(3, 3),
  [TILE.LOGO_34]: logoFragment(3, 4),
  [TILE.LOGO_35]: logoFragment(3, 5),
  [TILE.LOGO_36]: logoFragment(3, 6),
  [TILE.LOGO_37]: logoFragment(3, 7),
  [TILE.LOGO_38]: logoFragment(3, 8),
  [TILE.LOGO_39]: logoFragment(3, 9),
  [TILE.LOGO_40]: logoFragment(4, 0),
  [TILE.LOGO_41]: logoFragment(4, 1),
  [TILE.LOGO_42]: logoFragment(4, 2),
  [TILE.LOGO_43]: logoFragment(4, 3),
  [TILE.LOGO_44]: logoFragment(4, 4),
  [TILE.LOGO_45]: logoFragment(4, 5),
  [TILE.LOGO_46]: logoFragment(4, 6),
  [TILE.LOGO_47]: logoFragment(4, 7),
  [TILE.LOGO_48]: logoFragment(4, 8),
  [TILE.LOGO_49]: logoFragment(4, 9),
};

function buildTileset(set: Record<number, TileDrawer>): Sheet {
  const cols = 8;
  const rows = 12;
  const s = new Sheet(cols * T, rows * T);
  for (let id = 0; id < 96; id++) {
    const drawer = set[id];
    if (drawer) drawer(s, (id % cols) * T, Math.floor(id / cols) * T);
  }
  return s;
}

// ---------------------------------------------------------------- characters

interface CharPalette {
  skin: string;
  hair: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  tie?: string;
  eyeColor?: string;
  hairStyle: string;
  accessory: string;
  headFeature?: string;
  beard?: string;
  bodyType?: "normal" | "fat";
}

function mix(hex1: string, hex2: string, t: number): string {
  const r = Math.round(parseInt(hex1.slice(1, 3), 16) + (parseInt(hex2.slice(1, 3), 16) - parseInt(hex1.slice(1, 3), 16)) * t);
  const g = Math.round(parseInt(hex1.slice(3, 5), 16) + (parseInt(hex2.slice(3, 5), 16) - parseInt(hex1.slice(3, 5), 16)) * t);
  const b = Math.round(parseInt(hex1.slice(5, 7), 16) + (parseInt(hex2.slice(5, 7), 16) - parseInt(hex1.slice(5, 7), 16)) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const CHAR_PALETTES: CharPalette[] = [
  { skin: "#f2c39b", hair: "#2b1d0e", shirt: "#e05d5d", shirtShade: "#b84444", pants: "#2f3e5c", hairStyle: "short",    accessory: "none" },
  { skin: "#d9a066", hair: "#5a3825", shirt: "#4f9dde", shirtShade: "#3a7cb5", pants: "#454545", hairStyle: "spiky",    accessory: "glasses" },
  { skin: "#a06a42", hair: "#15100a", shirt: "#53b86b", shirtShade: "#3d9152", pants: "#5c4a2f", hairStyle: "buzz",     accessory: "none" },
  { skin: "#ffdbac", hair: "#c9a227", shirt: "#c9852c", shirtShade: "#a06a1f", pants: "#3a5a40", hairStyle: "long",     accessory: "earrings" },
  { skin: "#f2c39b", hair: "#9e2b2b", shirt: "#5b7d9e", shirtShade: "#46627d", pants: "#3e4a5c", hairStyle: "swept",    accessory: "headband" },
  { skin: "#8d5524", hair: "#2b1d0e", shirt: "#36b5b0", shirtShade: "#28908c", pants: "#2f3e5c", hairStyle: "ponytail", accessory: "none" },
  { skin: "#d9a066", hair: "#e8e8e8", shirt: "#d65db1", shirtShade: "#ab4489", pants: "#454545", hairStyle: "curly",    accessory: "glasses" },
  { skin: "#ffdbac", hair: "#3f7d4e", shirt: "#7d8597", shirtShade: "#616877", pants: "#23283a", hairStyle: "bun",      accessory: "earrings" },
];

const BOSS_PALETTE: CharPalette = {
  skin: "#f2c39b", hair: "#2b1d0e", shirt: "#2e3547", shirtShade: "#23283a", pants: "#1b1f2e", tie: "#9e2b2b", hairStyle: "swept", accessory: "none", headFeature: "none", beard: "none",
};

const YUKI_PALETTE: CharPalette = {
  skin: "#f2c39b", hair: "#1a1a2a", shirt: "#c44a4a", shirtShade: "#a83a3a", pants: "#c44a4a", eyeColor: "#3a9a4e", hairStyle: "ponytail", accessory: "headband", headFeature: "none", beard: "none",
};

const HERMES_PALETTE: CharPalette = {
  skin: "#e8c5a0", hair: "#3a2a1a", shirt: "#4a5a3a", shirtShade: "#3a4a2a", pants: "#2a2a3a", eyeColor: "#6a8a3a", hairStyle: "balding", accessory: "glasses", headFeature: "none", beard: "full_beard", bodyType: "fat",
};

const CW = 64;
const CH = 96;
const SHOE = "#3a3548";
const OUTLINE = "#2e2640";

type Dir = "down" | "left" | "right" | "up";
const DIRS: Dir[] = ["down", "left", "right", "up"]; // sheet row order

function drawChar(s: Sheet, ox: number, oy: number, pal: CharPalette, dir: Dir, pose: number): void {
  const mirror = dir === "left";
  const d: Dir = mirror ? "right" : dir;
  const isFat = pal.bodyType === "fat";

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

  // Offset helpers
  const hx = (x: number) => ox + x + headSway;
  const hy = (y: number) => oy + y + headBob;
  const bx = (x: number) => ox + x;
  const by = (y: number) => oy + y + bodyBob;
  const lx = (x: number) => ox + x;
  const ly = (y: number) => oy + y;

  // Solid shape helpers — no alpha, crisp edges
  const el = (cx: number, cy: number, rx: number, ry: number, c: string) => s.fillEllipse(cx, cy, rx, ry, c);
  const ci = (cx: number, cy: number, r: number, c: string) => s.fillCircle(cx, cy, r, c);
  const rr = (x: number, y: number, w: number, h: number, r: number, c: string) => s.fillRoundedRect(x, y, w, h, r, c);
  // Outlined circle: solid outline ring + fill on top
  const ciO = (cx: number, cy: number, r: number, fill: string) => {
    s.fillCircle(cx, cy, r + 1, OUTLINE);
    s.fillCircle(cx, cy, r, fill);
  };
  // Outlined ellipse
  const elO = (cx: number, cy: number, rx: number, ry: number, fill: string) => {
    s.fillEllipse(cx, cy, rx + 1, ry + 1, OUTLINE);
    s.fillEllipse(cx, cy, rx, ry, fill);
  };
  // Outlined rounded rect
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
      el(hx(32), hy(9), 16, 9, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(32 + i * 6); s.set(sx, hy(4 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(5 + Math.abs(i) * 2), pal.hair); s.set(sx - 1, hy(6 + Math.abs(i) * 2), pal.hair); }
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair);
      s.set(hx(24), hy(14), pal.hair); s.set(hx(30), hy(13), pal.hair); s.set(hx(34), hy(13), pal.hair); s.set(hx(40), hy(14), pal.hair);
      el(hx(28), hy(8), 6, 3, hairLi); el(hx(34), hy(10), 7, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "long") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(14), hy(22), 5, 16 + hb, pal.hair); el(hx(50), hy(22), 5, 16 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(26), hy(10), 4, 2, hairRim); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); el(hx(14), hy(28), 3, 8, hairDk); el(hx(50), hy(28), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(32), hy(10), 15, 8, pal.hair);
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
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      el(hx(36), hy(15), 10, 3, pal.hair);
      rr(hx(25), hy(16), 20, 2, 3, pal.hair);
      s.set(hx(24), hy(15), pal.skin); s.set(hx(25), hy(14), pal.skin);
      s.set(hx(22), hy(13), pal.hair); s.set(hx(23), hy(12), pal.hair);
      el(hx(26), hy(9), 6, 3, hairLi); el(hx(32), hy(11), 7, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "curly") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      ci(hx(22), hy(8), 4, pal.hair); ci(hx(32), hy(6), 5, pal.hair); ci(hx(42), hy(8), 4, pal.hair);
      el(hx(19), hy(19), 3, 8 + hb, pal.hair); el(hx(45), hy(19), 3, 8 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); ci(hx(25), hy(15), 3, pal.hair); ci(hx(39), hy(15), 3, pal.hair);
      ci(hx(26), hy(8), 2, hairLi); ci(hx(34), hy(7), 2, hairRim); el(hx(38), hy(10), 4, 3, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "bun") {
      el(hx(32), hy(9), 16, 9, pal.hair);
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
      el(hx(32), hy(13), 17, 13, pal.hair);
      ci(hx(18), hy(10), 4, pal.hair); ci(hx(46), hy(10), 4, pal.hair);
      ci(hx(22), hy(5), 4, pal.hair); ci(hx(42), hy(5), 4, pal.hair);
      ci(hx(32), hy(2), 4, pal.hair);
      ci(hx(15), hy(16), 4, pal.hair); ci(hx(49), hy(16), 4, pal.hair);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      ci(hx(26), hy(8), 3, hairLi); ci(hx(36), hy(10), 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "braids") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(14), hy(22), 4, 18 + hb, pal.hair); el(hx(50), hy(22), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) { s.set(hx(14), hy(24 + i * 4), hairDk); s.set(hx(50), hy(24 + i * 4), hairDk); }
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "pigtails") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      ci(hx(15), hy(20), 4, pal.hair); ci(hx(49), hy(20), 4, pal.hair);
      ci(hx(15), hy(20), 2, hairMid); ci(hx(49), hy(20), 2, hairMid);
      el(hx(19), hy(18), 3, 7 + hb, pal.hair); el(hx(45), hy(18), 3, 7 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else if (hs === "bob") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      el(hx(14), hy(22), 5, 12 + hb, pal.hair); el(hx(50), hy(22), 5, 12 + hb, pal.hair);
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid);
      el(hx(43), hy(16), 4, 7, hairDk); el(hx(14), hy(28), 3, 6, hairDk); el(hx(50), hy(28), 3, 6, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(32), hy(9), 16, 9, pal.hair);
      for (const lx of [14, 20, 26, 38, 44, 50]) { el(hx(lx), hy(20), 3, 16 + hb, pal.hair); }
      for (const lx of [14, 20, 26, 38, 44, 50]) { for (let i = 0; i < 3; i++) s.set(hx(lx), hy(23 + i * 5), hairDk); }
      el(hx(32), hy(14), 15, 4, pal.hair); rr(hx(21), hy(16), 22, 2, 3, pal.hair);
      el(hx(28), hy(9), 7, 3, hairLi); el(hx(34), hy(11), 8, 4, hairMid); el(hx(43), hy(16), 4, 7, hairDk);
    } else {
      el(hx(32), hy(9), 16, 9, pal.hair);
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
      el(hx(32), hy(15), 17, 15, pal.hair);
      ci(hx(18), hy(12), 4, pal.hair); ci(hx(46), hy(12), 4, pal.hair);
      ci(hx(22), hy(7), 4, pal.hair); ci(hx(42), hy(7), 4, pal.hair);
      ci(hx(32), hy(4), 4, pal.hair);
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
      el(hx(33), hy(9), 18, 9, pal.hair);
      for (let i = -2; i <= 2; i++) { const sx = hx(30 + i * 5); s.set(sx, hy(4 + Math.abs(i) * 2), pal.hair); s.set(sx + 1, hy(5 + Math.abs(i) * 2), pal.hair); }
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(8), 5, 2, hairLi); el(hx(32), hy(10), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "long") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(17), hy(21), 5, 14 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
      el(hx(17), hy(28), 3, 8, hairDk);
    } else if (hs === "buzz") {
      el(hx(33), hy(10), 17, 8, pal.hair); el(hx(20), hy(21), 4, 7, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      el(hx(26), hy(11), 5, 2, hairLi); el(hx(32), hy(13), 5, 2, hairMid); el(hx(21), hy(19), 3, 7, hairDk);
    } else if (hs === "ponytail") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(16), hy(18), 4, 10 + hb, pal.hair); s.set(hx(15), hy(20 + hb), pal.hair); s.set(hx(15), hy(22 + hb), pal.hair);
      el(hx(19), hy(21), 5, 9, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(5), 5, 2, hairLi); el(hx(32), hy(8), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "swept") {
      el(hx(33), hy(9), 18, 9, pal.hair); el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(36), hy(16), 10, 2, pal.hair); rr(hx(27), hy(16), 18, 2, 3, pal.hair);
      s.set(hx(26), hy(15), pal.skin);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "curly") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      ci(hx(24), hy(8), 4, pal.hair); ci(hx(32), hy(6), 5, pal.hair); ci(hx(38), hy(8), 4, pal.hair);
      el(hx(18), hy(21), 5, 10 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); ci(hx(28), hy(16), 3, pal.hair);
      ci(hx(26), hy(8), 2, hairLi); el(hx(32), hy(10), 5, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "bun") {
      el(hx(33), hy(9), 18, 9, pal.hair); ci(hx(28), hy(5), 5, pal.hair); ci(hx(28), hy(5), 3, hairMid);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "mohawk") {
      s.rect(hx(30), hy(2), 4, 18, pal.hair);
      s.set(hx(29), hy(0), pal.hair); s.set(hx(30), hy(0), pal.hair); s.set(hx(31), hy(0), pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      s.set(hx(30), hy(6), hairLi); s.set(hx(31), hy(10), hairMid);
    } else if (hs === "afro") {
      el(hx(32), hy(13), 15, 13, pal.hair);
      ci(hx(20), hy(10), 4, pal.hair); ci(hx(44), hy(10), 4, pal.hair);
      ci(hx(24), hy(5), 4, pal.hair); ci(hx(40), hy(5), 4, pal.hair);
      ci(hx(32), hy(2), 4, pal.hair);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair);
      ci(hx(28), hy(8), 3, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "braids") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(17), hy(21), 4, 18 + hb, pal.hair);
      for (let i = 0; i < 4; i++) s.set(hx(17), hy(23 + i * 4), hairDk);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "pigtails") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      ci(hx(16), hy(20), 4, pal.hair); ci(hx(16), hy(20), 2, hairMid);
      el(hx(19), hy(21), 5, 9 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else if (hs === "bob") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      el(hx(17), hy(21), 5, 12 + hb, pal.hair);
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
      el(hx(17), hy(28), 3, 6, hairDk);
    } else if (hs === "dreadlocks") {
      el(hx(33), hy(9), 18, 9, pal.hair);
      for (const bx of [17, 23, 29]) { el(hx(bx), hy(20), 3, 16 + hb, pal.hair); }
      for (const bx of [17, 23, 29]) { for (let i = 0; i < 3; i++) s.set(hx(bx), hy(23 + i * 5), hairDk); }
      el(hx(32), hy(16), 13, 2, pal.hair); rr(hx(25), hy(16), 18, 2, 3, pal.hair);
      el(hx(26), hy(9), 5, 2, hairLi); el(hx(32), hy(11), 6, 3, hairMid); el(hx(21), hy(19), 4, 9, hairDk);
    } else {
      el(hx(33), hy(9), 18, 9, pal.hair); el(hx(19), hy(21), 5, 9 + hb, pal.hair);
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

  // ===== HEAD FEATURES =====
  const drawHeadFeature = (dir2: Dir) => {
    const hf = pal.headFeature ?? "none";
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
        s.line(hx(27), hy(8), hx(24), hy(0), pal.hair);
        s.set(hx(24), hy(0), tip); s.set(hx(23), hy(1), tip);
        s.line(hx(37), hy(8), hx(40), hy(0), pal.hair);
        s.set(hx(40), hy(0), tip); s.set(hx(41), hy(1), tip);
      } else if (dir2 === "up") {
        s.line(hx(27), hy(8), hx(24), hy(0), pal.hair);
        s.set(hx(24), hy(0), tip);
        s.line(hx(37), hy(8), hx(40), hy(0), pal.hair);
        s.set(hx(40), hy(0), tip);
      } else if (dir2 === "right") {
        s.line(hx(37), hy(8), hx(40), hy(0), pal.hair);
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

  // ===== BEARD =====
  const drawBeard = (dir2: Dir) => {
    const bd = pal.beard ?? "none";
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
    // ---- HEAD: round dome with outline ----
    ciO(hx(32), hy(18), 17, pal.skin);
    // Face
    el(hx(32), hy(22), 13, 12, pal.skin);
    // Hair (per-style)
    drawHairDown();
    drawHeadFeature("down");
    s.set(hx(32), hy(19), pal.skin);
    // Face 3-tone: rim light on left, mid on right, shadow on far right
    el(hx(26), hy(24), 3, 5, skinLi);
    el(hx(27), hy(21), 2, 2, skinRim);
    el(hx(38), hy(25), 3, 5, skinMid);
    el(hx(40), hy(24), 3, 6, skinDk);
    // Chin shadow
    el(hx(32), hy(32), 10, 2, skinDk);
    // Eyebrows
    s.set(hx(26), hy(19), hairDk);
    s.set(hx(27), hy(19), hairDk);
    s.set(hx(36), hy(19), hairDk);
    s.set(hx(37), hy(19), hairDk);
    // Eyes — small, not starry
    if (eyesClosed) {
      rr(hx(26), hy(23), 4, 2, 2, eyeColor);
      rr(hx(34), hy(23), 4, 2, 2, eyeColor);
    } else {
      el(hx(28), hy(23), 2, 4, eyeColor);
      el(hx(36), hy(23), 2, 4, eyeColor);
      s.set(hx(27), hy(22), "#ffffff");
      s.set(hx(35), hy(22), "#ffffff");
    }
    // Mouth
    s.set(hx(31), hy(29), skinDk);
    s.set(hx(32), hy(30), skinDk);
    s.set(hx(33), hy(30), skinDk);
    s.set(hx(34), hy(29), skinDk);
    // Blush
    ci(hx(24), hy(27), 2, blush);
    ci(hx(40), hy(27), 2, blush);
    // Accessory
    drawAccessory("down");
    drawBeard("down");

    // ---- NECK ----
    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), OUTLINE);
    s.set(bx(34), by(34), OUTLINE);
    // Neck shadow
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    // ---- TORSO: compact with 3D shading ----
    const tw = isFat ? (breathing ? 30 : 28) : (breathing ? 24 : 22);
    const tx = isFat ? (breathing ? 17 : 18) : (breathing ? 20 : 21);
    rrO(bx(tx), by(38), tw, 18, 5, pal.shirt);
    // 3-tone shirt: highlight, mid, shadow
    rr(bx(tx + 2), by(38), tw - 4, 3, 3, shirtLi);
    rr(bx(tx + 4), by(38), tw - 8, 2, 2, shirtMid);
    rr(bx(tx), by(38), 2, 18, 2, shirtLi);
    rr(bx(tx + 3), by(38), 2, 18, 2, shirtMid);
    rr(bx(tx + tw - 2), by(38), 2, 18, 2, shirtDk);
    rr(bx(tx), by(52), tw, 4, 3, shirtDk);
    // Collar
    rr(bx(tx + 4), by(38), tw - 8, 2, 1, shirtLi);
    s.set(bx(tx + 5), by(40), shirtDk);
    s.set(bx(tx + tw - 6), by(40), shirtDk);
    if (pal.tie) {
      rr(bx(30), by(40), 4, 7, 2, pal.tie);
      rr(bx(28), by(45), 8, 2, 1, pal.tie);
      rr(bx(30), by(47), 4, 2, 1, pal.tie);
    }
    // Belt line between shirt and pants
    s.rect(bx(tx), by(55), tw, 1, pantsDk);
    // Shirt buttons
    s.set(bx(31), by(42), shirtDk);
    s.set(bx(31), by(46), shirtDk);
    s.set(bx(31), by(50), shirtDk);

    // ---- ARMS: stubby with 3D shading ----
    const armLX = isFat ? 14 : 17;
    const armRX = isFat ? 48 : 45;
    elO(bx(armLX + armSwingL), by(45), 4, 7, pal.shirt);
    el(bx(armLX - 1 + armSwingL), by(43), 2, 3, shirtLi);
    el(bx(armLX + armSwingL), by(44), 2, 4, shirtMid);
    elO(bx(armRX + armSwingR), by(45), 4, 7, pal.shirt);
    el(bx(armRX + 1 + armSwingR), by(48), 2, 3, shirtDk);
    // Hands
    ciO(bx(armLX + armSwingL), by(53), 3, pal.skin);
    s.set(bx(armLX - 1 + armSwingL), by(52), skinLi);
    ciO(bx(armRX + armSwingR), by(53), 3, pal.skin);
    s.set(bx(armRX + 1 + armSwingR), by(54), skinDk);

    // ---- LEGS & SHOES with 3D shading ----
    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const fx = leftUp ? 33 : 23;
      const rx2 = leftUp ? 23 : 33;
      rrO(lx(fx), ly(58), 8, 14, 3, pal.pants);
      rr(lx(fx), ly(58), 2, 14, 2, pantsLi);
      rr(lx(fx + 3), ly(58), 2, 14, 2, pantsMid);
      // Shoe — 3-tone
      elO(lx(fx + 4), ly(74), 6, 4, SHOE);
      s.set(lx(fx + 2), ly(73), shoeLi);
      s.set(lx(fx + 3), ly(73), shoeMid);
      s.set(lx(fx + 6), ly(76), shoeDk);
      // Lifted leg
      rrO(lx(rx2), ly(60), 8, 10, 3, pal.pants);
      elO(lx(rx2 + 4), ly(72), 6, 4, SHOE);
      s.set(lx(rx2 + 2), ly(71), shoeLi);
    } else {
      const legLX = isFat ? 21 : 23;
      const legRX = isFat ? 35 : 33;
      const legW = isFat ? 9 : 8;
      rrO(lx(legLX), ly(58), legW, 14, 3, pal.pants);
      rrO(lx(legRX), ly(58), legW, 14, 3, pal.pants);
      rr(lx(legLX), ly(58), 2, 14, 2, pantsLi);
      rr(lx(legLX) + 3, ly(58), 2, 14, 2, pantsMid);
      rr(lx(legRX), ly(58), 2, 14, 2, pantsLi);
      rr(lx(legRX) + 3, ly(58), 2, 14, 2, pantsMid);
      // Shoes — 3-tone
      elO(lx(legLX + 4), ly(74), 6, 4, SHOE);
      elO(lx(legRX + 4), ly(74), 6, 4, SHOE);
      s.set(lx(legLX + 2), ly(73), shoeLi);
      s.set(lx(legLX + 3), ly(73), shoeMid);
      s.set(lx(legRX + 2), ly(73), shoeLi);
      s.set(lx(legRX + 3), ly(73), shoeMid);
      s.set(lx(legLX + 6), ly(76), shoeDk);
      s.set(lx(legRX + 6), ly(76), shoeDk);
    }

  } else if (d === "up") {
    // ---- HEAD: all hair, with outline ----
    ciO(hx(32), hy(18), 17, pal.hair);
    drawHairUp();
    drawHeadFeature("up");
    // Accessory
    drawAccessory("up");

    // ---- NECK ----
    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), OUTLINE);
    s.set(bx(34), by(34), OUTLINE);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    // ---- TORSO (back) — 3-tone ----
    const utw = isFat ? 28 : 22;
    const utx = isFat ? 18 : 21;
    rrO(bx(utx), by(38), utw, 18, 5, pal.shirt);
    rr(bx(utx + 2), by(38), utw - 4, 3, 3, shirtLi);
    rr(bx(utx + 4), by(38), utw - 8, 2, 2, shirtMid);
    rr(bx(utx), by(38), 2, 18, 2, shirtLi);
    rr(bx(utx + 2), by(38), 2, 18, 2, shirtMid);
    rr(bx(utx + utw - 2), by(38), 2, 18, 2, shirtDk);
    rr(bx(utx), by(52), utw, 4, 3, shirtDk);
    // Back seam
    s.set(bx(31), by(40), shirtDk);
    s.set(bx(32), by(42), shirtDk);
    s.set(bx(31), by(44), shirtDk);
    // Belt line
    s.rect(bx(utx), by(55), utw, 1, pantsDk);

    // ---- ARMS — 3-tone ----
    const uarmLX = isFat ? 14 : 17;
    const uarmRX = isFat ? 48 : 45;
    elO(bx(uarmLX + armSwingL), by(45), 4, 7, pal.shirt);
    elO(bx(uarmRX + armSwingR), by(45), 4, 7, pal.shirt);
    el(bx(uarmLX - 1 + armSwingL), by(43), 2, 3, shirtLi);
    el(bx(uarmLX + armSwingL), by(44), 2, 4, shirtMid);
    el(bx(uarmRX + 1 + armSwingR), by(48), 2, 3, shirtDk);
    ciO(bx(uarmLX + armSwingL), by(53), 3, pal.skin);
    ciO(bx(uarmRX + armSwingR), by(53), 3, pal.skin);
    s.set(bx(uarmRX + 1 + armSwingR), by(54), skinDk);

    // ---- LEGS & SHOES — 3-tone ----
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
    // ---- RIGHT PROFILE ----
    ciO(hx(32), hy(18), 17, pal.skin);
    // Face
    el(hx(35), hy(24), 11, 9, pal.skin);
    // Hair (per-style)
    drawHairRight();
    drawHeadFeature("right");
    s.set(hx(32), hy(19), pal.skin);
    // Ear
    s.set(hx(28), hy(24), skinDk);
    s.set(hx(28), hy(25), pal.skin);
    s.set(hx(28), hy(26), skinDk);
    // Face 3-tone: rim light, mid, shadow
    el(hx(31), hy(24), 3, 4, skinLi);
    el(hx(30), hy(21), 2, 3, skinRim);
    el(hx(38), hy(24), 3, 5, skinMid);
    el(hx(41), hy(26), 2, 4, skinDk);
    // Chin/jaw shadow
    el(hx(36), hy(31), 8, 2, skinDk);
    // Eyebrow
    s.set(hx(37), hy(19), hairDk);
    s.set(hx(38), hy(19), hairDk);
    // Eye — small
    if (eyesClosed) {
      rr(hx(36), hy(23), 4, 2, 2, eyeColor);
    } else {
      el(hx(38), hy(23), 2, 4, eyeColor);
      s.set(hx(37), hy(22), "#ffffff");
    }
    // Nose
    s.set(hx(45), hy(25), skinDk);
    s.set(hx(46), hy(25), skinDk);
    s.set(hx(46), hy(24), skinLi);
    // Mouth
    s.set(hx(40), hy(29), skinDk);
    s.set(hx(41), hy(30), skinDk);
    s.set(hx(42), hy(30), skinDk);
    s.set(hx(43), hy(29), skinDk);
    // Blush
    ci(hx(32), hy(27), 2, blush);
    // Accessory
    drawAccessory("right");
    drawBeard("right");

    // ---- NECK ----
    rr(bx(29), by(34), 6, 4, 2, skinDk);
    s.set(bx(29), by(34), OUTLINE);
    s.set(bx(34), by(34), OUTLINE);
    s.set(bx(30), by(36), skinDk);
    s.set(bx(31), by(36), skinDk);
    s.set(bx(32), by(36), skinDk);
    s.set(bx(33), by(36), skinDk);

    // ---- TORSO (profile) — 3-tone ----
    const rtw = isFat ? 22 : 18;
    const rtx = isFat ? 21 : 23;
    rrO(bx(rtx), by(38), rtw, 18, 5, pal.shirt);
    rr(bx(rtx + 2), by(38), rtw - 4, 3, 3, shirtLi);
    rr(bx(rtx + 4), by(38), rtw - 8, 2, 2, shirtMid);
    rr(bx(rtx), by(38), 2, 18, 2, shirtLi);
    rr(bx(rtx + 2), by(38), 2, 18, 2, shirtMid);
    rr(bx(rtx + rtw - 2), by(38), 2, 18, 2, shirtDk);
    rr(bx(rtx), by(52), rtw, 4, 3, shirtDk);
    // Collar
    s.set(bx(rtx + 2), by(40), shirtDk);
    s.set(bx(rtx + 3), by(41), shirtDk);
    // Belt line
    s.rect(bx(rtx), by(55), rtw, 1, pantsDk);

    // ---- ARM — 3-tone ----
    const rarmX = isFat ? 35 : 37;
    elO(bx(rarmX + armSwing), by(45), 4, 8, pal.shirt);
    el(bx(rarmX - 1 + armSwing), by(43), 2, 3, shirtLi);
    el(bx(rarmX + armSwing), by(44), 2, 4, shirtMid);
    ciO(bx(rarmX + armSwing), by(54), 3, pal.skin);
    s.set(bx(rarmX - 1 + armSwing), by(53), skinLi);
    s.set(bx(rarmX + 1 + armSwing), by(55), skinDk);

    // ---- LEGS (profile) — 3-tone ----
    const rlegW = isFat ? 10 : 8;
    if (stepping) {
      const leftUp = pose === 1 || pose === 5;
      const frontX = leftUp ? 29 : 25;
      const backX = leftUp ? 25 : 29;
      rrO(lx(frontX), ly(58), rlegW, 14, 3, pal.pants);
      rr(lx(frontX), ly(58), 2, 14, 2, pantsLi);
      rr(lx(frontX) + 3, ly(58), 2, 14, 2, pantsMid);
      elO(lx(frontX + 4), ly(74), 6, 4, SHOE);
      s.set(lx(frontX + 2), ly(73), shoeLi);
      s.set(lx(frontX + 3), ly(73), shoeMid);
      s.set(lx(frontX + 6), ly(76), shoeDk);
      // Back leg darker
      rrO(lx(backX), ly(60), rlegW, 10, 3, pantsDk);
      elO(lx(backX + 4), ly(72), 6, 4, shoeDk);
    } else {
      rrO(lx(25), ly(58), rlegW, 14, 3, pal.pants);
      rrO(lx(33), ly(58), rlegW, 14, 3, pantsDk);
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

function buildCharSheet(pal: CharPalette): Sheet {
  const cols = 8;
  const s = new Sheet(CW * cols, CH * DIRS.length);
  DIRS.forEach((dir, row) => {
    for (let pose = 0; pose < cols; pose++) {
      drawChar(s, pose * CW, row * CH, pal, dir, pose);
    }
  });
  return s;
}

// ------------------------------------------------------------- small sprites

function buildMonitor(): Sheet {
  const s = new Sheet(128, 64);
  for (let f = 0; f < 2; f++) {
    const ox = f * 64;
    // monitor body
    vGrad(s, ox + 8, 4, 48, 36, "#2a2638", "#1a1628");
    s.rect(ox + 8, 4, 48, 2, "#3a3648");
    // screen
    vGrad(s, ox + 12, 8, 40, 28, f === 0 ? "#0a0e18" : "#1a3a28", f === 0 ? "#050810" : "#0a2a18");
    if (f === 1) {
      // code lines on screen
      s.rect(ox + 16, 12, 24, 2, "#2a8a5a");
      s.rect(ox + 16, 18, 32, 2, "#2a8a5a");
      s.rect(ox + 16, 24, 20, 2, "#2a8a5a");
      s.rect(ox + 16, 30, 28, 2, "#2a8a5a");
      // glow
      s.rect(ox + 12, 8, 40, 1, "#4affa8");
    }
    // stand
    s.rect(ox + 28, 40, 8, 8, "#2a2638");
    s.rect(ox + 20, 48, 24, 4, "#2a2638");
    s.rect(ox + 20, 48, 24, 1, "#3a3648");
  }
  return s;
}

function buildBubble(): Sheet {
  const s = new Sheet(192, 64);
  for (let f = 0; f < 3; f++) {
    const ox = f * 64;
    s.rect(ox + 8, 4, 48, 32, "#f5f1e3");
    s.rect(ox + 4, 8, 56, 24, "#f5f1e3");
    s.rect(ox + 12, 36, 12, 8, "#f5f1e3");
    s.rect(ox + 8, 44, 8, 8, "#f5f1e3");
    s.rect(ox + 8, 4, 48, 2, "#ffffff");
    for (let dt = 0; dt <= f; dt++) s.rect(ox + 16 + dt * 12, 16, 8, 8, "#33373d");
  }
  return s;
}

// ----------------------------------------------------------------- the map

const MAP_W = 30;
const MAP_H = 20;

type Plot = (x: number, y: number, id: number) => void;

interface MapTheme {
  /** Tileset name inside the map JSON and the .png/.json filenames. */
  tileset: string;
  /** Desk top-left tiles; index order == deskIndex assigned by the server. */
  desks: Array<[number, number]>;
  /** Yuki's desk top-left tile (placed separately from regular desks). */
  yukiDesk?: [number, number];
  /** Hermes agent desk top-left tile (mirrored side desk, chair on left). */
  hermesDesk?: [number, number];
  /** Floors, walls and decor — desks, chairs and points are common. */
  paint(G: Plot, W: Plot, F: Plot): void;
}

const CLASSIC: MapTheme = {
  tileset: "office",
  desks: [
    [3, 4], [8, 4], [13, 4], [18, 4],
    [3, 10], [8, 10], [13, 10], [18, 10],
  ],
  yukiDesk: [25, 9],
  hermesDesk: [2, 16],
  paint(G, W, F) {
    // --- floors with distinct zones ---
    // Main work area: wood floor
    for (let y = 1; y <= 12; y++) {
      for (let x = 1; x <= 20; x++) {
        G(x, y, (x + y) % 2 === 0 ? TILE.WOOD_A : TILE.WOOD_B);
      }
    }
    // Lobby / entrance area: tile floor
    for (let y = 13; y <= 18; y++) {
      for (let x = 1; x <= 20; x++) {
        G(x, y, (x + y) % 2 === 0 ? TILE.TILE_A : TILE.TILE_B);
      }
    }
    // Break room (top right): tile floor
    for (let y = 1; y <= 6; y++) {
      for (let x = 22; x <= 28; x++) G(x, y, (x + y) % 2 === 0 ? TILE.TILE_A : TILE.TILE_B);
    }
    // Meeting corner (bottom right): carpet
    for (let y = 13; y <= 18; y++) {
      for (let x = 22; x <= 28; x++) G(x, y, (x + y) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
    }
    // Central aisle accent (carpet runner between work rows)
    for (let y = 7; y <= 9; y++) {
      for (let x = 1; x <= 20; x++) G(x, y, TILE.CARPET_A);
    }
    for (let y = 7; y <= 9; y++) {
      G(0 + 1, y, TILE.CARPET_B);
      G(20, y, TILE.CARPET_B);
    }
    // Meeting rug
    for (let y = 14; y <= 16; y++) for (let x = 23; x <= 26; x++) G(x, y, TILE.RUG);
    // Doormat
    G(14, 18, TILE.DOORMAT);
    G(15, 18, TILE.DOORMAT);

    // --- walls ---
    for (let x = 0; x < MAP_W; x++) {
      W(x, 0, TILE.WALL_TOP);
      W(x, MAP_H - 1, TILE.WALL_TOP);
    }
    for (let y = 0; y < MAP_H; y++) {
      W(0, y, TILE.WALL_TOP);
      W(MAP_W - 1, y, TILE.WALL_TOP);
    }
    // North wall face with decorations
    for (let x = 1; x < MAP_W - 1; x++) W(x, 1, TILE.WALL_FACE);
    for (const wx of [3, 4, 8, 9, 13, 14, 26, 27]) W(wx, 1, TILE.WINDOW);
    W(16, 1, TILE.WB_L);
    W(17, 1, TILE.WB_R);
    W(6, 1, TILE.CLOCK);
    W(19, 1, TILE.POSTER);
    W(24, 1, TILE.POSTER);
    // Door in the south wall
    W(14, MAP_H - 1, TILE.DOOR);
    W(15, MAP_H - 1, TILE.DOOR);
    // Break room divider wall (partial — leaves an opening at y=5)
    for (let y = 2; y <= 3; y++) W(21, y, TILE.WALL_TOP);
    W(21, 4, TILE.WALL_FACE);
    G(21, 5, (21 + 5) % 2 === 0 ? TILE.TILE_A : TILE.TILE_B);
    // Meeting corner partial wall
    W(21, 14, TILE.WALL_TOP);
    W(21, 15, TILE.WALL_FACE);

    // --- Mail room (bottom-left, x=1-10, y=13-17) ---
    // East wall with opening at y=15 (entrance from lobby)
    W(11, 13, TILE.WALL_TOP);
    W(11, 14, TILE.WALL_FACE);
    W(11, 16, TILE.WALL_FACE);
    W(11, 17, TILE.WALL_TOP);
    // North wall (along y=12 — reuse the existing wall at y=12 area)
    // The lobby tile floor already covers this area; the wall at x=1-10, y=12
    // is the boundary between work area and mail room
    for (let x = 1; x <= 10; x++) W(x, 12, TILE.WALL_TOP);
    // Re-open the passage from the work area to the lobby at x=14-15 (the aisle)
    // by carving back the wall tiles we just placed at the aisle position
    G(14, 12, (14 + 12) % 2 === 0 ? TILE.WOOD_A : TILE.WOOD_B);
    G(15, 12, (15 + 12) % 2 === 0 ? TILE.WOOD_A : TILE.WOOD_B);
    // Mail room floor — distinct tile to set it apart from lobby
    for (let y = 13; y <= 17; y++) {
      for (let x = 1; x <= 10; x++) G(x, y, (x + y) % 2 === 0 ? TILE.TILE_A : TILE.TILE_B);
    }

    // --- Yuki's office (right side, between break room and meeting corner) ---
    // Floor — red carpet
    for (let y = 8; y <= 11; y++) {
      for (let x = 22; x <= 27; x++) G(x, y, (x + y) % 2 === 0 ? TILE.RED_CARPET_A : TILE.RED_CARPET_B);
    }
    // Entrance floor (3-tile opening at y=8,9,10) — grey carpet top two, wood bottom
    G(21, 8, (21 + 8) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
    G(21, 9, (21 + 9) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
    G(21, 10, (21 + 10) % 2 === 0 ? TILE.WOOD_A : TILE.WOOD_B);
    // North wall
    for (let x = 22; x <= 27; x++) W(x, 7, TILE.WALL_TOP);
    // South wall
    for (let x = 22; x <= 27; x++) W(x, 12, TILE.WALL_TOP);
    // West wall with 3-tile opening at y=8,9,10
    for (let y = 6; y <= 7; y++) W(21, y, TILE.WALL_TOP);
    W(21, 11, TILE.WALL_FACE);
    W(21, 12, TILE.WALL_FACE);
    W(21, 13, TILE.WALL_TOP);

    // --- furniture ---
    // Filing cabinets
    F(20, 3, TILE.FILING);
    F(20, 4, TILE.FILING);
    // Plants scattered organically
    F(1, 9, TILE.PLANT);
    F(20, 2, TILE.PLANT);
    F(28, 7, TILE.PLANT);
    F(27, 13, TILE.PLANT);
    // Break room
    F(22, 2, TILE.COUNTER);
    F(23, 2, TILE.COFFEE);
    F(24, 2, TILE.COUNTER);
    F(26, 2, TILE.FRIDGE);
    F(28, 4, TILE.COOLER);
    F(27, 6, TILE.TRASH);
    // Meeting corner
    F(23, 13, TILE.SOFA_L);
    F(24, 13, TILE.SOFA_R);
    F(22, 15, TILE.PAPERS);
    F(26, 16, TILE.PLANT);
    // Lobby clutter
    F(19, 17, TILE.TRASH);
    // Yuki's office decor
    F(27, 11, TILE.PLANT);
    F(22, 11, TILE.FILING);
    // Server room (inside mail room, bottom-left corner)
    F(5, 17, TILE.SERVER_RACK);
    F(5, 18, TILE.SERVER_RACK);
    F(6, 17, TILE.SERVER_RACK);
    F(6, 18, TILE.SERVER_RACK);
    F(7, 17, TILE.SERVER_SCREEN);
    F(7, 18, TILE.SERVER_SCREEN);
    // Mail room — filing cabinets for archived messages
    F(10, 16, TILE.FILING);
    F(10, 17, TILE.FILING);
  },
};

// Agent HQ theme: same layout as classic but the entire floor is blue carpet.
const AGENTHQ: MapTheme = {
  tileset: "agenthq",
  desks: [
    [3, 4], [8, 4], [13, 4], [18, 4],
    [3, 10], [8, 10], [13, 10], [18, 10],
  ],
  yukiDesk: [25, 9],
  hermesDesk: [2, 16],
  paint(G, W, F) {
    // --- floors: all carpet ---
    for (let y = 1; y <= 18; y++) {
      for (let x = 1; x <= 28; x++) {
        G(x, y, (x + y) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
      }
    }
    // Agent HQ logo — 10×5 tile grid sublimated into the carpet, centered in work area
    G(5, 5, TILE.LOGO_00);
    G(6, 5, TILE.LOGO_01);
    G(7, 5, TILE.LOGO_02);
    G(8, 5, TILE.LOGO_03);
    G(9, 5, TILE.LOGO_04);
    G(10, 5, TILE.LOGO_05);
    G(11, 5, TILE.LOGO_06);
    G(12, 5, TILE.LOGO_07);
    G(13, 5, TILE.LOGO_08);
    G(14, 5, TILE.LOGO_09);
    G(5, 6, TILE.LOGO_10);
    G(6, 6, TILE.LOGO_11);
    G(7, 6, TILE.LOGO_12);
    G(8, 6, TILE.LOGO_13);
    G(9, 6, TILE.LOGO_14);
    G(10, 6, TILE.LOGO_15);
    G(11, 6, TILE.LOGO_16);
    G(12, 6, TILE.LOGO_17);
    G(13, 6, TILE.LOGO_18);
    G(14, 6, TILE.LOGO_19);
    G(5, 7, TILE.LOGO_20);
    G(6, 7, TILE.LOGO_21);
    G(7, 7, TILE.LOGO_22);
    G(8, 7, TILE.LOGO_23);
    G(9, 7, TILE.LOGO_24);
    G(10, 7, TILE.LOGO_25);
    G(11, 7, TILE.LOGO_26);
    G(12, 7, TILE.LOGO_27);
    G(13, 7, TILE.LOGO_28);
    G(14, 7, TILE.LOGO_29);
    G(5, 8, TILE.LOGO_30);
    G(6, 8, TILE.LOGO_31);
    G(7, 8, TILE.LOGO_32);
    G(8, 8, TILE.LOGO_33);
    G(9, 8, TILE.LOGO_34);
    G(10, 8, TILE.LOGO_35);
    G(11, 8, TILE.LOGO_36);
    G(12, 8, TILE.LOGO_37);
    G(13, 8, TILE.LOGO_38);
    G(14, 8, TILE.LOGO_39);
    G(5, 9, TILE.LOGO_40);
    G(6, 9, TILE.LOGO_41);
    G(7, 9, TILE.LOGO_42);
    G(8, 9, TILE.LOGO_43);
    G(9, 9, TILE.LOGO_44);
    G(10, 9, TILE.LOGO_45);
    G(11, 9, TILE.LOGO_46);
    G(12, 9, TILE.LOGO_47);
    G(13, 9, TILE.LOGO_48);
    G(14, 9, TILE.LOGO_49);
    // Doormat
    G(14, 18, TILE.DOORMAT);
    G(15, 18, TILE.DOORMAT);

    // --- walls ---
    for (let x = 0; x < MAP_W; x++) {
      W(x, 0, TILE.WALL_TOP);
      W(x, MAP_H - 1, TILE.WALL_TOP);
    }
    for (let y = 0; y < MAP_H; y++) {
      W(0, y, TILE.WALL_TOP);
      W(MAP_W - 1, y, TILE.WALL_TOP);
    }
    // North wall face with decorations
    for (let x = 1; x < MAP_W - 1; x++) W(x, 1, TILE.WALL_FACE);
    for (const wx of [3, 4, 8, 9, 13, 14, 26, 27]) W(wx, 1, TILE.WINDOW);
    W(16, 1, TILE.WB_L);
    W(17, 1, TILE.WB_R);
    W(6, 1, TILE.CLOCK);
    W(19, 1, TILE.POSTER);
    W(24, 1, TILE.POSTER);
    // Door in the south wall
    W(14, MAP_H - 1, TILE.DOOR);
    W(15, MAP_H - 1, TILE.DOOR);
    // Break room divider wall (partial — leaves an opening at y=5)
    for (let y = 2; y <= 3; y++) W(21, y, TILE.WALL_TOP);
    W(21, 4, TILE.WALL_FACE);
    G(21, 5, (21 + 5) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
    // Meeting corner partial wall
    W(21, 14, TILE.WALL_TOP);
    W(21, 15, TILE.WALL_FACE);

    // --- Mail room (bottom-left, x=1-10, y=13-17) ---
    // East wall with opening at y=15 (entrance from lobby)
    W(11, 13, TILE.WALL_TOP);
    W(11, 14, TILE.WALL_FACE);
    W(11, 16, TILE.WALL_FACE);
    W(11, 17, TILE.WALL_TOP);
    // North wall (along y=12 — boundary between work area and mail room)
    for (let x = 1; x <= 10; x++) W(x, 12, TILE.WALL_TOP);
    // Re-open the passage from the work area to the lobby at x=14-15 (the aisle)
    G(14, 12, (14 + 12) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
    G(15, 12, (15 + 12) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);

    // --- Yuki's office (right side, between break room and meeting corner) ---
    // North wall
    for (let x = 22; x <= 27; x++) W(x, 7, TILE.WALL_TOP);
    // South wall
    for (let x = 22; x <= 27; x++) W(x, 12, TILE.WALL_TOP);
    // West wall with 3-tile opening at y=8,9,10
    for (let y = 6; y <= 7; y++) W(21, y, TILE.WALL_TOP);
    W(21, 11, TILE.WALL_FACE);
    W(21, 12, TILE.WALL_FACE);
    W(21, 13, TILE.WALL_TOP);

    // --- furniture ---
    // Filing cabinets
    F(20, 3, TILE.FILING);
    F(20, 4, TILE.FILING);
    // Plants scattered organically
    F(1, 9, TILE.PLANT);
    F(20, 2, TILE.PLANT);
    F(28, 7, TILE.PLANT);
    F(27, 13, TILE.PLANT);
    // Break room
    F(22, 2, TILE.COUNTER);
    F(23, 2, TILE.COFFEE);
    F(24, 2, TILE.COUNTER);
    F(26, 2, TILE.FRIDGE);
    F(28, 4, TILE.COOLER);
    F(27, 6, TILE.TRASH);
    // Meeting corner
    F(23, 13, TILE.SOFA_L);
    F(24, 13, TILE.SOFA_R);
    F(22, 15, TILE.PAPERS);
    F(26, 16, TILE.PLANT);
    // Lobby clutter
    F(19, 17, TILE.TRASH);
    // Yuki's office decor
    F(27, 11, TILE.PLANT);
    F(22, 11, TILE.FILING);
    // Server room (inside mail room, bottom-left corner)
    F(5, 17, TILE.SERVER_RACK);
    F(5, 18, TILE.SERVER_RACK);
    F(6, 17, TILE.SERVER_RACK);
    F(6, 18, TILE.SERVER_RACK);
    F(7, 17, TILE.SERVER_SCREEN);
    F(7, 18, TILE.SERVER_SCREEN);
    // Mail room — filing cabinets for archived messages
    F(10, 16, TILE.FILING);
    F(10, 17, TILE.FILING);
  },
};

function buildMap(theme: MapTheme): object {
  const ground = new Array(MAP_W * MAP_H).fill(0);
  const walls = new Array(MAP_W * MAP_H).fill(0);
  const furniture = new Array(MAP_W * MAP_H).fill(0);

  const G: Plot = (x, y, id) => (ground[y * MAP_W + x] = id + 1);
  const W: Plot = (x, y, id) => (walls[y * MAP_W + x] = id + 1);
  const F: Plot = (x, y, id) => (furniture[y * MAP_W + x] = id + 1);

  theme.paint(G, W, F);

  // desks + chairs
  for (const [dx, dy] of theme.desks) {
    F(dx, dy, TILE.DESK_L);
    F(dx + 1, dy, TILE.DESK_R);
    F(dx, dy + 1, TILE.CHAIR);
  }

  // Yuki's desk — vertical (facing left toward entrance), chair on the right
  if (theme.yukiDesk) {
    const [ydx, ydy] = theme.yukiDesk;
    F(ydx, ydy, TILE.DESK_SIDE_TOP);
    F(ydx, ydy + 1, TILE.DESK_SIDE_BOTTOM);
    F(ydx + 1, ydy, TILE.CHAIR_LEFT);
  }

  // Hermes desk — mirrored vertical (facing right), chair on the left
  if (theme.hermesDesk) {
    const [hdx, hdy] = theme.hermesDesk;
    F(hdx, hdy, TILE.DESK_SIDE_TOP_MIRROR);
    F(hdx, hdy + 1, TILE.DESK_SIDE_BOTTOM_MIRROR);
    F(hdx - 1, hdy, TILE.CHAIR_RIGHT);
  }

  // --- object layer ---
  const objects: object[] = [];
  let oid = 1;
  const point = (name: string, tx: number, ty: number) => ({
    id: oid++,
    name,
    point: true,
    rotation: 0,
    type: "",
    visible: true,
    x: (tx + 0.5) * T,
    y: (ty + 0.5) * T,
  });
  objects.push(point("spawn", 14, 16));
  theme.desks.forEach(([dx, dy], i) => {
    objects.push(point(`seat-${i}`, dx, dy + 1));
    objects.push(point(`monitor-${i}`, dx, dy));
  });
  if (theme.yukiDesk) {
    const [ydx, ydy] = theme.yukiDesk;
    objects.push(point("yuki-seat", ydx + 1, ydy));
    objects.push(point("yuki-desk", ydx, ydy));
    objects.push(point("yuki-monitor", ydx, ydy));
  }
  if (theme.hermesDesk) {
    const [hdx, hdy] = theme.hermesDesk;
    objects.push(point("hermes-seat", hdx - 1, hdy));
    objects.push(point("hermes-desk", hdx, hdy));
    objects.push(point("hermes-monitor", hdx, hdy));
  }

  const tileLayer = (id: number, name: string, data: number[]) => ({
    id,
    name,
    type: "tilelayer",
    width: MAP_W,
    height: MAP_H,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data,
  });

  return {
    compressionlevel: -1,
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width: MAP_W,
    height: MAP_H,
    tilewidth: T,
    tileheight: T,
    nextlayerid: 5,
    nextobjectid: oid,
    layers: [
      tileLayer(1, "Ground", ground),
      tileLayer(2, "Walls", walls),
      tileLayer(3, "Furniture", furniture),
      {
        id: 4,
        name: "Points",
        type: "objectgroup",
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        draworder: "topdown",
        objects,
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: theme.tileset,
        image: `../tilesets/${theme.tileset}.png`,
        imagewidth: 512,
        imageheight: 768,
        tilewidth: T,
        tileheight: T,
        tilecount: 94,
        columns: 8,
        margin: 0,
        spacing: 0,
        tiles: SOLID_TILES.map((id) => ({
          id,
          properties: [{ name: "solid", type: "bool", value: true }],
        })),
      },
    ],
  };
}

// ------------------------------------------------------------- world tiles

const WT = 64; // world tile size
const WORLD_COLS = 8;

type WorldTileDrawer = (s: Sheet, ox: number, oy: number, seed: number) => void;

function worldGrass(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#4a8a3a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // grass blades — small lines
  let st = seed;
  for (let i = 0; i < 40; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const gx = (st >> 8) % WT;
    const gy = (st >> 16) % WT;
    s.line(ox + gx, oy + gy, ox + gx, oy + gy - 2, p.hi);
    s.set(ox + gx, oy + gy + 1, p.dk);
  }
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.08, 0.3);
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.1);
}

function worldWall(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#6a6a72");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // brick pattern
  for (let y = 0; y < WT; y += 16) {
    s.rect(ox, oy + y, WT, 2, p.dk);
    s.rect(ox, oy + y + 2, WT, 1, p.li);
    const offset = (y / 16) % 2 === 0 ? 0 : 16;
    for (let x = offset; x < WT; x += 32) {
      s.rect(ox + x, oy + y, 2, 16, p.dk);
      s.rect(ox + x + 2, oy + y, 1, 16, p.li);
    }
  }
  s.rect(ox, oy, WT, 2, p.hi);
  s.rect(ox, oy + WT - 2, WT, 2, p.sh);
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.04, 0.3);
}

function worldTree(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#4a8a3a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.08, 0.3);
  // trunk
  const tp = shade5("#5a3a20");
  s.rect(ox + 28, oy + 36, 8, 20, tp.base);
  s.rect(ox + 28, oy + 36, 8, 2, tp.hi);
  s.rect(ox + 28, oy + 36, 1, 20, tp.li);
  s.rect(ox + 35, oy + 36, 1, 20, tp.dk);
  // foliage — layered circles
  s.fillCircle(ox + 32, oy + 22, 16, p.dk);
  s.fillCircle(ox + 28, oy + 18, 14, p.base);
  s.fillCircle(ox + 36, oy + 20, 12, p.li);
  s.fillCircle(ox + 30, oy + 14, 8, p.hi);
  s.fillCircle(ox + 38, oy + 16, 6, p.hi);
  // shadow under tree
  s.fillEllipse(ox + 32, oy + 56, 14, 3, mix(p.sh, "#000", 0.2));
}

function worldRock(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#7a7a82");
  s.rect(ox, oy, WT, WT, mix(p.base, "#4a8a3a", 0.3));
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.06, 0.3);
  // rock body — irregular with circles
  s.fillCircle(ox + 32, oy + 36, 18, p.dk);
  s.fillCircle(ox + 28, oy + 32, 16, p.base);
  s.fillCircle(ox + 34, oy + 30, 12, p.li);
  s.fillCircle(ox + 26, oy + 28, 6, p.hi);
  // cracks
  s.line(ox + 24, oy + 38, ox + 30, oy + 44, p.sh);
  s.line(ox + 36, oy + 34, ox + 42, oy + 40, p.sh);
  // ground shadow
  s.fillEllipse(ox + 32, oy + 56, 16, 3, mix(p.sh, "#000", 0.15));
}

function worldFlower(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#4a8a3a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.08, 0.3);
  // stem
  s.line(ox + 32, oy + 48, ox + 32, oy + 28, "#3a6a2a");
  // leaf
  s.fillEllipse(ox + 28, oy + 40, 5, 3, "#3a9a4e");
  // petals — 5 circles
  const petalColors = ["#e8c84a", "#ff8a4a", "#e85a8a", "#b04ae8", "#4ab8e8"];
  const pc = petalColors[seed % petalColors.length];
  const fp = shade5(pc);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    s.fillCircle(ox + 32 + Math.cos(a) * 6, oy + 24 + Math.sin(a) * 6, 4, fp.base);
  }
  s.fillCircle(ox + 32, oy + 24, 3, fp.hi);
  s.fillCircle(ox + 32, oy + 24, 2, "#ffe880");
}

function worldAcid(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#8ae83a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.hi, p.dk);
  // bubbles
  let st = seed;
  for (let i = 0; i < 12; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const bx = (st >> 8) % WT;
    const by = (st >> 16) % WT;
    const br = 1 + (st % 3);
    s.fillCircle(ox + bx, oy + by, br, p.hi);
    s.set(ox + bx, oy + by - 1, "#ffffff");
  }
  // toxic swirls
  s.fillCircleAlpha(ox + 20, oy + 30, 8, mix(p.hi, "#ffffff", 0.3), 0.3);
  s.fillCircleAlpha(ox + 44, oy + 40, 6, mix(p.hi, "#ffffff", 0.2), 0.25);
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.1);
}

function worldPath(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#a89060");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // pebbles
  let st = seed;
  for (let i = 0; i < 20; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const px = (st >> 8) % WT;
    const py = (st >> 16) % WT;
    s.fillCircle(ox + px, oy + py, 1 + (st % 2), p.dk);
    s.set(ox + px, oy + py - 1, p.li);
  }
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.06, 0.3);
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.1);
}

function worldSand(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#e8d890");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // dune ripples
  for (let y = 8; y < WT; y += 12) {
    s.rect(ox, oy + y, WT, 1, p.li);
    s.rect(ox, oy + y + 1, WT, 1, p.dk);
  }
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.08, 0.3);
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.1);
}

function worldSnow(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#e8e8f0");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.hi, p.li);
  // sparkles
  let st = seed;
  for (let i = 0; i < 15; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const sx = (st >> 8) % WT;
    const sy = (st >> 16) % WT;
    s.set(ox + sx, oy + sy, "#ffffff");
  }
  // drifts
  s.fillEllipse(ox + 16, oy + 50, 12, 3, p.li);
  s.fillEllipse(ox + 44, oy + 54, 10, 2, p.li);
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.08);
}

function worldLava(s: Sheet, ox: number, oy: number, seed: number): void {
  // dark scorched border
  s.rect(ox, oy, WT, WT, "#1a0202");
  // bright lava body — glowing red-orange
  rGrad(s, ox + 32, oy + 32, 30, "#ff6010", "#c01800");
  rGrad(s, ox + 32, oy + 32, 20, "#ff9020", "#e83800");
  rGrad(s, ox + 32, oy + 32, 10, "#ffc040", "#ff6010");
  // dark crust around edges
  let st = seed;
  for (let i = 0; i < 16; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const cx = (st >> 8) % WT;
    const cy = (st >> 16) % WT;
    if (Math.hypot(cx - 32, cy - 32) > 18) {
      s.fillCircleAlpha(ox + cx, oy + cy, 2 + (st % 3), "#1a0202", 0.6);
    }
  }
  // a few bright glowing cracks
  st = seed;
  for (let i = 0; i < 5; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const x0 = (st >> 8) % WT;
    const y0 = (st >> 16) % WT;
    const x1 = x0 + ((st >> 4) % 20) - 10;
    const y1 = y0 + ((st >> 12) % 20) - 10;
    s.lineThick(ox + x0, oy + y0, ox + x1, oy + y1, "#ffb030", 2);
    s.line(ox + x0, oy + y0, ox + x1, oy + y1, "#ffe060");
  }
}

function worldCrystal(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#8a4ae8");
  s.rect(ox, oy, WT, WT, mix(p.base, "#1a1a2a", 0.5));
  // crystal clusters — triangles
  s.fillTriangle(ox + 24, oy + 50, ox + 20, oy + 30, ox + 28, oy + 30, p.dk);
  s.fillTriangle(ox + 20, oy + 30, ox + 24, oy + 18, ox + 28, oy + 30, p.base);
  s.fillTriangle(ox + 22, oy + 28, ox + 24, oy + 22, ox + 26, oy + 28, p.hi);
  s.fillTriangle(ox + 40, oy + 50, ox + 36, oy + 34, ox + 44, oy + 34, p.dk);
  s.fillTriangle(ox + 36, oy + 34, ox + 40, oy + 24, ox + 44, oy + 34, p.base);
  s.fillTriangle(ox + 38, oy + 32, ox + 40, oy + 27, ox + 42, oy + 32, p.hi);
  // sparkle
  s.set(ox + 24, oy + 22, "#ffffff");
  s.set(ox + 40, oy + 27, "#ffffff");
  // glow
  s.fillCircleAlpha(ox + 32, oy + 36, 20, mix(p.hi, "#ffffff", 0.2), 0.15);
}

function worldVoid(s: Sheet, ox: number, oy: number, seed: number): void {
  // pure void — consuming darkness
  s.rect(ox, oy, WT, WT, "#000000");
  // deep purple-black gradient from center
  rGrad(s, ox + 32, oy + 32, 30, "#0a0218", "#000000");
  rGrad(s, ox + 32, oy + 32, 20, "#1a0428", "#000000");
  // swirling tentacle-like wisps
  let st = seed;
  for (let i = 0; i < 6; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const angle = (i / 6) * Math.PI * 2 + (st % 100) / 100 * 0.5;
    const len = 16 + (st % 12);
    for (let r = 0; r < len; r++) {
      const spiral = angle + r * 0.15;
      const px = 32 + Math.cos(spiral) * r;
      const py = 32 + Math.sin(spiral) * r;
      const alpha = 0.4 * (1 - r / len);
      s.setAlpha(ox + Math.round(px), oy + Math.round(py), "#4a1a6a", alpha);
    }
  }
  // eerie glowing eyes in the darkness
  st = seed;
  for (let i = 0; i < 3; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const ex = 10 + (st >> 8) % 44;
    const ey = 10 + (st >> 16) % 44;
    // eye glow
    s.fillCircleAlpha(ox + ex, oy + ey, 3, "#aa44ff", 0.3);
    s.fillCircle(ox + ex, oy + ey, 1, "#dd88ff");
    s.set(ox + ex, oy + ey, "#ffffff");
  }
  // central maw — a consuming purple-black hole
  s.fillCircleAlpha(ox + 32, oy + 32, 10, "#2a0a4a", 0.5);
  s.fillCircleAlpha(ox + 32, oy + 32, 6, "#000000", 0.8);
  // faint purple stars
  st = seed;
  for (let i = 0; i < 8; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const sx = (st >> 8) % WT;
    const sy = (st >> 16) % WT;
    const distFromCenter = Math.hypot(sx - 32, sy - 32);
    if (distFromCenter > 14) {
      s.setAlpha(ox + sx, oy + sy, "#8844cc", 0.6);
    }
  }
  // dark consuming edges
  s.blurEdges(ox, oy, WT, WT, "#000000", 0.2);
}

function worldRuin(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#8a8278");
  s.rect(ox, oy, WT, WT, mix(p.base, "#4a8a3a", 0.3));
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.06, 0.3);
  // broken pillar
  s.rect(ox + 24, oy + 20, 16, 36, p.base);
  s.rect(ox + 24, oy + 20, 16, 2, p.hi);
  s.rect(ox + 24, oy + 20, 2, 36, p.li);
  s.rect(ox + 38, oy + 20, 2, 36, p.dk);
  // cracks
  s.line(ox + 28, oy + 28, ox + 32, oy + 40, p.sh);
  s.line(ox + 34, oy + 24, ox + 30, oy + 36, p.sh);
  // broken top
  s.fillTriangle(ox + 24, oy + 20, ox + 40, oy + 20, ox + 36, oy + 14, p.dk);
  // base
  s.rect(ox + 20, oy + 54, 24, 6, p.dk);
  s.rect(ox + 20, oy + 54, 24, 1, p.li);
  // ground shadow
  s.fillEllipse(ox + 32, oy + 60, 16, 3, mix(p.sh, "#000", 0.15));
}

function worldCastle(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#9a8a7a");
  s.rect(ox, oy, WT, WT, mix(p.base, "#4a8a3a", 0.2));
  // tower
  s.rect(ox + 20, oy + 8, 24, 48, p.base);
  vGrad(s, ox + 20, oy + 8, 24, 48, p.li, p.dk);
  s.rect(ox + 20, oy + 8, 24, 2, p.hi);
  s.rect(ox + 20, oy + 8, 2, 48, p.li);
  s.rect(ox + 42, oy + 8, 2, 48, p.dk);
  // battlements
  for (let x = 20; x < 44; x += 6) {
    s.rect(ox + x, oy + 4, 4, 6, p.base);
    s.rect(ox + x, oy + 4, 4, 1, p.hi);
  }
  // door
  s.fillRoundedRect(ox + 28, oy + 36, 8, 20, 2, p.sh);
  s.rect(ox + 28, oy + 36, 8, 1, p.dk);
  // window
  s.rect(ox + 30, oy + 16, 4, 6, "#1a1a2a");
  s.rect(ox + 30, oy + 16, 4, 1, p.dk);
  // flag
  s.line(ox + 32, oy + 0, ox + 32, oy + 8, p.sh);
  s.fillTriangle(ox + 32, oy + 0, ox + 40, oy + 2, ox + 32, oy + 4, "#d65d5d");
}

function worldFairway(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#5aa84a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // manicured grass — very short blades
  let st = seed;
  for (let i = 0; i < 25; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const gx = (st >> 8) % WT;
    const gy = (st >> 16) % WT;
    s.set(ox + gx, oy + gy, p.hi);
    s.set(ox + gx, oy + gy + 1, p.dk);
  }
  // mowing stripes
  for (let y = 0; y < WT; y += 8) {
    if ((y / 8) % 2 === 0) s.rect(ox, oy + y, WT, 8, mix(p.base, p.li, 0.15));
  }
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.08);
}

function worldTeeBox(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#6ab84a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // mowing stripes — tighter than fairway
  for (let y = 0; y < WT; y += 4) {
    if ((y / 4) % 2 === 0) s.rect(ox, oy + y, WT, 4, mix(p.base, p.li, 0.2));
  }
  // mat border — darker frame
  s.rect(ox + 4, oy + 4, WT - 8, WT - 8, mix(p.base, p.dk, 0.2));
  s.rect(ox + 5, oy + 5, WT - 10, WT - 10, p.base);
  // inner border line — white marking
  s.rect(ox + 6, oy + 6, WT - 12, 1, "#ffffff");
  s.rect(ox + 6, oy + WT - 7, WT - 12, 1, "#ffffff");
  s.rect(ox + 6, oy + 6, 1, WT - 12, "#ffffff");
  s.rect(ox + WT - 7, oy + 6, 1, WT - 12, "#ffffff");
  // tee markers — red-capped posts on left and right
  for (const side of [0, 1]) {
    const px = side === 0 ? ox + 10 : ox + WT - 11;
    // post
    s.line(px, oy + 16, px, oy + 48, "#e0e0e0");
    s.set(px - 1, oy + 16, "#ffffff");
    // red cap
    s.fillCircle(px, oy + 16, 2, "#dd2222");
    s.set(px, oy + 15, "#ff4444");
  }
  // center tee mark
  s.fillCircle(ox + 32, oy + 32, 2, mix(p.li, "#ffffff", 0.3));
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.08);
}

function worldGolfFlag(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#5aa84a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // pole
  s.line(ox + 32, oy + 8, ox + 32, oy + 56, "#e0e0e0");
  s.set(ox + 31, oy + 8, "#ffffff");
  // flag
  s.fillTriangle(ox + 32, oy + 8, ox + 48, oy + 12, ox + 32, oy + 18, "#d65d5d");
  s.fillTriangle(ox + 32, oy + 8, ox + 46, oy + 11, ox + 32, oy + 16, "#e87878");
  // hole
  s.fillCircle(ox + 32, oy + 56, 3, "#0a0a14");
  s.fillCircle(ox + 32, oy + 55, 2, "#1a1a24");
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.06, 0.3);
}

function worldSandTrap(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#e8d890");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  // sand ripples — curved
  for (let y = 12; y < WT; y += 10) {
    for (let x = 0; x < WT; x += 2) {
      const wave = Math.sin(x * 0.15 + seed) * 2;
      s.set(ox + x, oy + y + Math.round(wave), p.li);
      s.set(ox + x, oy + y + 1 + Math.round(wave), p.dk);
    }
  }
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.1, 0.3);
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.1);
}

function worldPond(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#4a9ab8");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.hi, p.dk);
  // lily pads
  s.fillCircle(ox + 16, oy + 20, 5, "#3a8a4a");
  s.fillCircle(ox + 14, oy + 19, 3, "#4a9a5a");
  s.fillCircle(ox + 46, oy + 40, 4, "#3a8a4a");
  // ripples
  s.fillCircleAlpha(ox + 32, oy + 32, 10, p.hi, 0.2);
  s.fillCircleAlpha(ox + 32, oy + 32, 14, p.li, 0.15);
  // shimmer
  let st = seed;
  for (let i = 0; i < 8; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    s.set(ox + (st >> 8) % WT, oy + (st >> 16) % WT, p.hi);
  }
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.1);
}

function worldBench(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#5a8a3a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.06, 0.3);
  // bench
  const wp = shade5("#6a4a2a");
  // seat
  s.rect(ox + 12, oy + 30, 40, 6, wp.base);
  s.rect(ox + 12, oy + 30, 40, 1, wp.hi);
  s.rect(ox + 12, oy + 35, 40, 1, wp.sh);
  // back
  s.rect(ox + 12, oy + 18, 40, 4, wp.base);
  s.rect(ox + 12, oy + 18, 40, 1, wp.hi);
  // legs
  s.rect(ox + 14, oy + 36, 4, 16, wp.dk);
  s.rect(ox + 46, oy + 36, 4, 16, wp.dk);
  // shadow
  s.fillEllipse(ox + 32, oy + 54, 22, 3, mix(p.sh, "#000", 0.15));
}

function worldHedge(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#3a7a2a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.06, 0.3);
  // hedge — dense circles
  s.fillCircle(ox + 16, oy + 32, 12, p.dk);
  s.fillCircle(ox + 32, oy + 28, 14, p.base);
  s.fillCircle(ox + 48, oy + 32, 12, p.dk);
  s.fillCircle(ox + 24, oy + 24, 10, p.li);
  s.fillCircle(ox + 40, oy + 24, 10, p.li);
  s.fillCircle(ox + 28, oy + 18, 6, p.hi);
  s.fillCircle(ox + 38, oy + 18, 6, p.hi);
  // texture
  let st = seed;
  for (let i = 0; i < 30; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const lx = 8 + (st >> 8) % 48;
    const ly = 16 + (st >> 16) % 32;
    s.set(ox + lx, oy + ly, p.hi);
  }
  // shadow
  s.fillEllipse(ox + 32, oy + 56, 24, 3, mix(p.sh, "#000", 0.15));
}

function worldBush(s: Sheet, ox: number, oy: number, seed: number): void {
  const p = shade5("#4a8a3a");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.li, p.dk);
  noiseAlpha(s, ox, oy, WT, WT, p.dk, 0.08, 0.3);
  // bush — organic circles
  s.fillCircle(ox + 32, oy + 40, 14, p.dk);
  s.fillCircle(ox + 26, oy + 36, 10, p.base);
  s.fillCircle(ox + 38, oy + 36, 10, p.base);
  s.fillCircle(ox + 30, oy + 30, 8, p.li);
  s.fillCircle(ox + 36, oy + 32, 6, p.li);
  s.fillCircle(ox + 28, oy + 28, 4, p.hi);
  // berries
  s.set(ox + 24, oy + 34, "#d65d5d");
  s.set(ox + 40, oy + 34, "#d65d5d");
  s.set(ox + 32, oy + 28, "#e8c84a");
  // shadow
  s.fillEllipse(ox + 32, oy + 56, 16, 3, mix(p.sh, "#000", 0.15));
}

function worldWater(s: Sheet, ox: number, oy: number, seed: number, frame: number): void {
  const p = shade5("#3a7ab8");
  s.rect(ox, oy, WT, WT, p.base);
  vGrad(s, ox, oy, WT, WT, p.hi, p.dk);
  // wave streaks — animated offset
  const off = frame * 4;
  for (let y = 8; y < WT; y += 12) {
    for (let x = 0; x < WT; x += 2) {
      const wave = Math.sin((x + off) * 0.2 + seed) * 2;
      s.set(ox + x, oy + y + Math.round(wave), p.hi);
    }
  }
  // shimmer dots
  let st = seed + frame * 31;
  for (let i = 0; i < 6; i++) {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    const sx = (st >> 8) % WT;
    const sy = (st >> 16) % WT;
    s.set(ox + sx, oy + sy, "#ffffff");
    s.set(ox + sx + 1, oy + sy, p.hi);
  }
  // deeper waves
  for (let y = 20; y < WT; y += 16) {
    for (let x = 0; x < WT; x += 3) {
      const wave = Math.sin((x + off + 8) * 0.15 + seed) * 3;
      s.setAlpha(ox + x, oy + y + Math.round(wave), p.dk, 0.4);
    }
  }
  s.blurEdges(ox, oy, WT, WT, p.dk, 0.1);
}

const worldDrawers: WorldTileDrawer[] = [
  worldGrass,   // 0 GRASS
  worldWall,    // 1 WALL
  worldTree,    // 2 TREE
  worldRock,    // 3 ROCK
  worldFlower,  // 4 FLOWER
  worldAcid,    // 5 ACID
  worldPath,    // 6 PATH
  worldSand,    // 7 SAND
  worldSnow,    // 8 SNOW
  worldLava,    // 9 LAVA
  worldCrystal, // 10 CRYSTAL
  worldVoid,    // 11 VOID
  worldRuin,    // 12 RUIN
  worldCastle,  // 13 CASTLE
  worldFairway, // 14 FAIRWAY
  worldGolfFlag,// 15 GOLF_FLAG
  worldSandTrap,// 16 SAND_TRAP
  worldPond,    // 17 POND
  worldBench,   // 18 BENCH
  worldHedge,   // 19 HEDGE
  worldBush,    // 20 BUSH
  (s, ox, oy, seed) => worldWater(s, ox, oy, seed, 0), // 21 WATER frame 0
  (s, ox, oy, seed) => worldWater(s, ox, oy, seed, 1), // 22 WATER frame 1
  (s, ox, oy, seed) => worldWater(s, ox, oy, seed, 2), // 23 WATER frame 2
];

function buildWorldTileset(): Sheet {
  const cols = WORLD_COLS;
  const rows = Math.ceil(worldDrawers.length / cols);
  const s = new Sheet(cols * WT, rows * WT);
  for (let i = 0; i < worldDrawers.length; i++) {
    const drawer = worldDrawers[i];
    const ox = (i % cols) * WT;
    const oy = Math.floor(i / cols) * WT;
    s.clip = { x: ox, y: oy, w: WT, h: WT };
    drawer(s, ox, oy, i * 137 + 42);
    s.clip = null;
  }
  return s;
}

// -------------------------------------------------------------------- main

const PREVIEWS = join(ROOT, "scripts", "previews");

const tileset = buildTileset(drawers);
tileset.save(join(ASSETS, "tilesets", "office.png"));
tileset.preview(join(PREVIEWS, "tileset.png"), 2);

const agenthqTileset = buildTileset(agenthqDrawers);
agenthqTileset.save(join(ASSETS, "tilesets", "agenthq.png"));
agenthqTileset.preview(join(PREVIEWS, "tileset-agenthq.png"), 2);

CHAR_PALETTES.forEach((pal, i) => {
  const sheet = buildCharSheet(pal);
  sheet.save(join(ASSETS, "characters", `char-${i}.png`));
  if (i === 0) sheet.preview(join(PREVIEWS, "char-0.png"), 6);
});
buildCharSheet(BOSS_PALETTE).save(join(ASSETS, "characters", "boss.png"));
buildCharSheet(YUKI_PALETTE).save(join(ASSETS, "characters", "char-yuki.png"));
buildCharSheet(HERMES_PALETTE).save(join(ASSETS, "characters", "char-hermes.png"));

const worldTileset = buildWorldTileset();
worldTileset.save(join(ASSETS, "tilesets", "world.png"));
worldTileset.preview(join(PREVIEWS, "tileset-world.png"), 2);

buildMonitor().save(join(ASSETS, "sprites", "monitor.png"));
buildBubble().save(join(ASSETS, "sprites", "bubble.png"));

mkdirSync(join(ASSETS, "maps"), { recursive: true });
writeFileSync(join(ASSETS, "maps", "office.json"), JSON.stringify(buildMap(CLASSIC)));
writeFileSync(join(ASSETS, "maps", "agenthq.json"), JSON.stringify(buildMap(AGENTHQ)));

console.log("assets written to", ASSETS);
