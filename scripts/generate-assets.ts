/**
 * Authors all pixel art for Agent HQ:
 *   client/public/assets/tilesets/office.png   - 64x64 office tileset (32 tiles)
 *   client/public/assets/tilesets/lumon.png    - Lumon-theme recolor of the tileset
 *   client/public/assets/maps/office.json      - Tiled-format map (open it in Tiled!)
 *   client/public/assets/maps/lumon.json       - Lumon-theme map (severed floor layout)
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
  constructor(
    public w: number,
    public h: number,
  ) {
    this.png = new PNG({ width: w, height: h });
  }

  set(x: number, y: number, hex: string): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
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
} as const;

const SOLID_TILES = [
  TILE.WALL_TOP, TILE.WALL_FACE, TILE.WINDOW, TILE.WB_L, TILE.WB_R, TILE.DOOR, TILE.POSTER,
  TILE.CLOCK, TILE.DESK_L, TILE.DESK_R, TILE.FILING, TILE.TRASH, TILE.PLANT, TILE.SHELF_T,
  TILE.SHELF_B, TILE.COUNTER, TILE.FRIDGE, TILE.COFFEE, TILE.COOLER, TILE.SOFA_L, TILE.SOFA_R,
  TILE.VENDING,
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

function woodTile(shade: string, line: string): TileDrawer {
  return (s, ox, oy) => {
    const li = mix(shade, "#ffffff", 0.08);
    const dk = mix(shade, "#000000", 0.10);
    vGrad(s, ox, oy, T, T, li, dk);
    // plank seams
    for (const y of [16, 32, 48]) {
      s.rect(ox, oy + y, T, 2, mix(line, "#000", 0.15));
      s.rect(ox, oy + y + 2, T, 1, mix(li, "#ffffff", 0.15));
    }
    // wood grain streaks
    let seed = ox * 17;
    for (let i = 0; i < 40; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const gx = (seed >> 8) % T;
      const gy = (seed >> 16) % T;
      const len = 2 + (seed % 5);
      s.rect(ox + gx, oy + gy, len, 1, mix(shade, "#000", 0.04));
    }
    // seam highlights
    for (const y of [18, 34, 50]) s.rect(ox, oy + y, T, 1, mix(li, shade, 0.4));
  };
}

function carpetTile(base: string, dot: string): TileDrawer {
  return (s, ox, oy) => {
    const li = mix(base, "#ffffff", 0.04);
    const dk = mix(base, "#000000", 0.04);
    s.rect(ox, oy, T, T, base);
    // subtle gradient
    vGrad(s, ox, oy, T, T, li, dk);
    // diamond pattern
    for (let y = 2; y < T; y += 8) {
      for (let x = ((y / 8) % 2) * 4 + 2; x < T; x += 8) {
        s.set(ox + x, oy + y, dot);
        s.set(ox + x + 1, oy + y, dot);
        s.set(ox + x, oy + y + 1, dot);
      }
    }
    // fiber texture
    noise(s, ox, oy, T, T, mix(base, "#000", 0.06), 0.08);
  };
}

function kitchenTile(base: string, grout: string): TileDrawer {
  return (s, ox, oy) => {
    const li = mix(base, "#ffffff", 0.06);
    const dk = mix(base, "#000000", 0.06);
    s.rect(ox, oy, T, T, base);
    // 2x2 sub-tiles with soft shading
    for (const [sx, sy] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
      vGrad(s, ox + sx + 1, oy + sy + 1, 30, 30, li, dk);
    }
    // grout lines
    s.rect(ox, oy + 30, T, 4, grout);
    s.rect(ox + 30, oy, 4, T, grout);
    // glossy highlights
    for (const [sx, sy] of [[4, 4], [36, 4], [4, 36], [36, 36]]) {
      s.rect(ox + sx, oy + sy, 6, 2, mix(li, "#ffffff", 0.3));
      s.set(ox + sx, oy + sy + 2, mix(li, "#ffffff", 0.2));
    }
  };
}

const drawers: Record<number, TileDrawer> = {
  [TILE.WOOD_A]: woodTile("#c8a070", "#a67e4e"),
  [TILE.WOOD_B]: woodTile("#bc9464", "#9c7242"),
  [TILE.CARPET_A]: carpetTile("#909caa", "#7a8694"),
  [TILE.CARPET_B]: carpetTile("#8a96a2", "#74808e"),
  [TILE.RUG]: (s, ox, oy) => {
    const base = "#8e4242";
    const border = "#6a3030";
    const inner = "#b85a5a";
    const li = mix(inner, "#ffffff", 0.10);
    s.rect(ox, oy, T, T, base);
    // border
    s.rect(ox, oy, T, 4, border);
    s.rect(ox, oy + 60, T, 4, border);
    s.rect(ox, oy, 4, T, border);
    s.rect(ox + 60, oy, 4, T, border);
    // inner panel
    vGrad(s, ox + 8, oy + 8, 48, 48, li, mix(inner, "#000", 0.10));
    // diamond medallion
    for (let y = 0; y < 12; y++) {
      const w = y < 6 ? y * 2 + 2 : (12 - y) * 2;
      s.rect(ox + 32 - w / 2, oy + 26 + y, w, 1, inner);
    }
    s.rect(ox + 30, oy + 31, 4, 2, base);
    // border texture
    noise(s, ox, oy, T, 4, mix(border, "#000", 0.15), 0.15);
    noise(s, ox, oy + 60, T, 4, mix(border, "#000", 0.15), 0.15);
  },
  [TILE.TILE_A]: kitchenTile("#dae0d8", "#b0b8b0"),
  [TILE.TILE_B]: kitchenTile("#ced4cc", "#a4aca4"),
  [TILE.DOORMAT]: (s, ox, oy) => {
    const base = "#7a6a42";
    const line = "#928050";
    const dk = "#5e5030";
    s.rect(ox, oy, T, T, base);
    // border
    s.rect(ox, oy, T, 3, dk);
    s.rect(ox, oy + 61, T, 3, dk);
    s.rect(ox, oy, 3, T, dk);
    s.rect(ox + 61, oy, 3, T, dk);
    // ridge texture
    for (let y = 6; y < 58; y += 5) {
      s.rect(ox + 4, oy + y, 56, 2, line);
      s.rect(ox + 4, oy + y + 2, 56, 1, mix(base, "#000", 0.08));
    }
    noise(s, ox + 4, oy + 4, 56, 56, mix(base, "#000", 0.10), 0.12);
  },
  [TILE.WALL_TOP]: (s, ox, oy) => {
    vGrad(s, ox, oy, T, T, "#5a5f67", "#3a3f47");
    // subtle texture
    noise(s, ox, oy, T, T, "#4a4f57", 0.06);
    // bottom shadow
    s.rect(ox, oy + 58, T, 6, mix("#3a3f47", "#000", 0.15));
  },
  [TILE.WALL_FACE]: (s, ox, oy) => {
    const base = "#c8cdd3";
    const top = "#b4bac2";
    const bot = "#949aa4";
    vGrad(s, ox, oy, T, T, top, bot);
    // panel seam
    s.rect(ox + 31, oy + 4, 1, 56, mix(base, "#000", 0.06));
    s.rect(ox + 32, oy + 4, 1, 56, mix(base, "#fff", 0.04));
    // top edge highlight
    s.rect(ox, oy, T, 3, mix(top, "#fff", 0.08));
    // bottom baseboard
    s.rect(ox, oy + 52, T, 12, mix(bot, "#000", 0.08));
    s.rect(ox, oy + 52, T, 2, mix(bot, "#000", 0.15));
    s.rect(ox, oy + 62, T, 2, mix(bot, "#fff", 0.05));
  },
  [TILE.WINDOW]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    const frame = "#6a7280";
    const frameLi = mix(frame, "#fff", 0.12);
    // frame
    s.rect(ox + 4, oy + 6, 56, 40, frame);
    s.rect(ox + 4, oy + 6, 56, 2, frameLi);
    s.rect(ox + 4, oy + 6, 2, 40, frameLi);
    // sky gradient
    vGrad(s, ox + 8, oy + 10, 48, 32, "#b8d8f0", "#6a9fc8");
    // clouds
    s.rect(ox + 12, oy + 14, 8, 3, "#ffffff");
    s.rect(ox + 14, oy + 13, 4, 1, "#ffffff");
    s.rect(ox + 36, oy + 18, 6, 2, "#e8f0f8");
    s.rect(ox + 38, oy + 17, 2, 1, "#e8f0f8");
    // cross frame
    s.rect(ox + 8, oy + 25, 48, 2, frame);
    s.rect(ox + 30, oy + 10, 2, 32, frame);
    // frame highlights
    s.rect(ox + 4, oy + 6, 56, 1, frameLi);
    s.rect(ox + 4, oy + 6, 1, 40, frameLi);
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
    const frame = "#4a4f57";
    const door = "#7a5230";
    const doorLi = mix(door, "#fff", 0.08);
    const doorDk = mix(door, "#000", 0.15);
    const panel = "#6a4220";
    s.rect(ox, oy, T, T, frame);
    // door body with gradient
    vGrad(s, ox + 6, oy + 4, 52, 58, doorLi, doorDk);
    // door edge
    s.rect(ox + 6, oy + 4, 2, 58, doorLi);
    s.rect(ox + 56, oy + 4, 2, 58, doorDk);
    // panels
    s.rect(ox + 12, oy + 10, 40, 20, panel);
    s.rect(ox + 12, oy + 10, 40, 2, mix(panel, "#fff", 0.08));
    s.rect(ox + 12, oy + 10, 2, 20, mix(panel, "#fff", 0.06));
    s.rect(ox + 12, oy + 34, 40, 18, panel);
    s.rect(ox + 12, oy + 34, 40, 2, mix(panel, "#fff", 0.08));
    s.rect(ox + 12, oy + 34, 2, 18, mix(panel, "#fff", 0.06));
    // doorknob
    s.rect(ox + 50, oy + 32, 4, 4, "#e0b84a");
    s.rect(ox + 50, oy + 32, 4, 1, "#f0d060");
    s.set(ox + 51, oy + 33, "#c8a030");
  },
  [TILE.POSTER]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    s.rect(ox + 10, oy + 6, 44, 44, "#e8e2c8");
    s.rect(ox + 10, oy + 6, 44, 2, mix("#e8e2c8", "#fff", 0.15));
    // poster content
    vGrad(s, ox + 14, oy + 10, 36, 16, "#4f9dde", "#3a7cb5");
    s.rect(ox + 18, oy + 14, 8, 4, "#ffffff");
    s.rect(ox + 30, oy + 16, 6, 2, "#e8f0f8");
    // text lines
    s.rect(ox + 14, oy + 30, 28, 2, "#33373d");
    s.rect(ox + 14, oy + 35, 22, 2, "#33373d");
    s.rect(ox + 14, oy + 40, 32, 2, "#33373d");
    // frame edge
    s.rect(ox + 10, oy + 6, 44, 1, "#d0c8a8");
    s.rect(ox + 10, oy + 6, 1, 44, "#d0c8a8");
    s.rect(ox + 53, oy + 7, 1, 43, "#b8b098");
    s.rect(ox + 11, oy + 49, 42, 1, "#b8b098");
  },
  [TILE.CLOCK]: (s, ox, oy) => {
    drawers[TILE.WALL_FACE]!(s, ox, oy);
    // frame
    s.rect(ox + 18, oy + 8, 28, 28, "#2a2e38");
    s.rect(ox + 18, oy + 8, 28, 2, "#3a3e48");
    s.rect(ox + 18, oy + 8, 2, 28, "#3a3e48");
    // face
    vGrad(s, ox + 20, oy + 10, 24, 24, "#f8f8fc", "#e0e0e8");
    // tick marks
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x1 = 32 + Math.cos(a) * 10;
      const y1 = 22 + Math.sin(a) * 10;
      const x2 = 32 + Math.cos(a) * 11;
      const y2 = 22 + Math.sin(a) * 11;
      s.set(ox + Math.round(x1), oy + Math.round(y1), "#888");
      s.set(ox + Math.round(x2), oy + Math.round(y2), "#888");
    }
    // hands
    s.rect(ox + 31, oy + 14, 2, 8, "#2a2e38");
    s.rect(ox + 32, oy + 22, 8, 2, "#d65d5d");
    // center dot
    s.set(ox + 31, oy + 21, "#2a2e38");
    s.set(ox + 32, oy + 22, "#2a2e38");
    // glass highlight
    s.rect(ox + 22, oy + 12, 6, 2, "#ffffff");
  },
  [TILE.DESK_L]: (s, ox, oy) => {
    const top = "#a87242";
    const topLi = mix(top, "#fff", 0.10);
    const topDk = mix(top, "#000", 0.10);
    const side = "#7c5230";
    const sideDk = "#5c3a20";
    // desk surface
    vGrad(s, ox + 2, oy, 60, 44, topLi, topDk);
    // surface highlight
    s.rect(ox + 2, oy, 60, 2, mix(topLi, "#fff", 0.15));
    // side panel
    vGrad(s, ox + 2, oy + 44, 60, 16, side, sideDk);
    s.rect(ox + 2, oy + 44, 60, 2, sideDk);
    // left edge
    s.rect(ox + 2, oy, 2, 60, sideDk);
    // drawer
    s.rect(ox + 8, oy + 22, 48, 16, mix(top, "#000", 0.08));
    s.rect(ox + 8, oy + 22, 48, 2, sideDk);
    s.rect(ox + 24, oy + 30, 16, 2, sideDk);
    // drawer handle
    s.rect(ox + 28, oy + 26, 8, 3, "#5a3a20");
    s.rect(ox + 28, oy + 26, 8, 1, "#7a5a40");
    // wood grain
    noise(s, ox + 4, oy + 2, 56, 40, mix(top, "#000", 0.04), 0.06);
  },
  [TILE.DESK_R]: (s, ox, oy) => {
    const top = "#a87242";
    const topLi = mix(top, "#fff", 0.10);
    const topDk = mix(top, "#000", 0.10);
    const side = "#7c5230";
    const sideDk = "#5c3a20";
    vGrad(s, ox, oy, 60, 44, topLi, topDk);
    s.rect(ox, oy, 60, 2, mix(topLi, "#fff", 0.15));
    vGrad(s, ox, oy + 44, 60, 16, side, sideDk);
    s.rect(ox, oy + 44, 60, 2, sideDk);
    s.rect(ox + 58, oy, 2, 60, sideDk);
    // papers
    s.rect(ox + 6, oy + 10, 20, 24, "#f0ece0");
    s.rect(ox + 6, oy + 10, 20, 2, "#ffffff");
    s.rect(ox + 10, oy + 16, 12, 1, "#a8a090");
    s.rect(ox + 10, oy + 20, 10, 1, "#a8a090");
    s.rect(ox + 10, oy + 24, 12, 1, "#a8a090");
    // mug
    s.rect(ox + 36, oy + 14, 12, 16, "#d65d5d");
    s.rect(ox + 36, oy + 14, 12, 2, "#e87878");
    s.rect(ox + 48, oy + 18, 4, 8, "#d65d5d");
    s.rect(ox + 40, oy + 18, 4, 8, "#b84444");
    // wood grain
    noise(s, ox + 2, oy + 2, 56, 40, mix(top, "#000", 0.04), 0.06);
  },
  [TILE.CHAIR]: (s, ox, oy) => {
    const back = "#3c4458";
    const backLi = mix(back, "#fff", 0.10);
    const backDk = mix(back, "#000", 0.15);
    const seat = "#2e3547";
    const seatDk = "#23283a";
    // backrest
    vGrad(s, ox + 14, oy + 8, 36, 28, backLi, backDk);
    s.rect(ox + 14, oy + 8, 36, 2, mix(backLi, "#fff", 0.08));
    s.rect(ox + 14, oy + 8, 2, 28, mix(backLi, "#fff", 0.06));
    // backrest detail
    s.rect(ox + 18, oy + 20, 28, 2, backDk);
    // seat
    vGrad(s, ox + 10, oy + 36, 44, 12, seat, seatDk);
    s.rect(ox + 10, oy + 36, 44, 2, mix(seat, "#fff", 0.06));
    // legs
    s.rect(ox + 26, oy + 48, 4, 8, seatDk);
    s.rect(ox + 14, oy + 48, 4, 6, seatDk);
    s.rect(ox + 46, oy + 48, 4, 6, seatDk);
  },
  [TILE.FILING]: (s, ox, oy) => {
    const body = "#7a8498";
    const bodyLi = mix(body, "#fff", 0.10);
    const bodyDk = mix(body, "#000", 0.12);
    // body
    vGrad(s, ox + 6, oy + 4, 52, 56, bodyLi, bodyDk);
    s.rect(ox + 6, oy + 4, 52, 2, mix(bodyLi, "#fff", 0.08));
    s.rect(ox + 6, oy + 4, 2, 56, mix(bodyLi, "#fff", 0.06));
    // drawer divisions
    s.rect(ox + 8, oy + 22, 48, 2, bodyDk);
    s.rect(ox + 8, oy + 44, 48, 2, bodyDk);
    // drawer insets
    vGrad(s, ox + 10, oy + 8, 44, 12, mix(body, "#fff", 0.04), mix(body, "#000", 0.04));
    vGrad(s, ox + 10, oy + 26, 44, 16, mix(body, "#000", 0.04), mix(body, "#fff", 0.04));
    vGrad(s, ox + 10, oy + 48, 44, 10, mix(body, "#fff", 0.04), mix(body, "#000", 0.04));
    // handles
    s.rect(ox + 24, oy + 18, 16, 3, "#4a5468");
    s.rect(ox + 24, oy + 18, 16, 1, "#5a6478");
    s.rect(ox + 24, oy + 40, 16, 3, "#4a5468");
    s.rect(ox + 24, oy + 40, 16, 1, "#5a6478");
    // label tabs
    s.rect(ox + 12, oy + 10, 8, 4, "#e8e4d0");
    s.rect(ox + 12, oy + 32, 8, 4, "#e8e4d0");
    s.rect(ox + 12, oy + 52, 8, 4, "#e8e4d0");
  },
  [TILE.TRASH]: (s, ox, oy) => {
    const body = "#4a5260";
    const bodyLi = mix(body, "#fff", 0.08);
    const bodyDk = mix(body, "#000", 0.12);
    // body
    vGrad(s, ox + 16, oy + 20, 32, 40, bodyLi, bodyDk);
    // rim
    s.rect(ox + 14, oy + 16, 36, 4, mix(bodyLi, "#fff", 0.06));
    s.rect(ox + 14, oy + 16, 36, 2, mix(bodyLi, "#fff", 0.12));
    // paper sticking out
    s.rect(ox + 24, oy + 8, 12, 10, "#e8e4d0");
    s.rect(ox + 26, oy + 6, 8, 6, "#f0ece0");
    // ridges
    for (const x of [22, 30, 38, 44]) s.rect(ox + x, oy + 24, 2, 32, bodyDk);
    // floor shadow
    s.rect(ox + 14, oy + 58, 36, 3, mix(bodyDk, "#000", 0.20));
  },
  [TILE.PLANT]: (s, ox, oy) => {
    const pot = "#8a4b2d";
    const potLi = mix(pot, "#fff", 0.10);
    const potDk = mix(pot, "#000", 0.15);
    const leaf1 = "#2f7d3f";
    const leaf2 = "#3a9a4e";
    const leaf3 = "#49b85f";
    const leafHi = "#5dca70";
    // pot
    vGrad(s, ox + 20, oy + 40, 24, 20, potLi, potDk);
    s.rect(ox + 18, oy + 40, 28, 4, mix(potLi, "#fff", 0.08));
    s.rect(ox + 18, oy + 40, 28, 2, mix(potLi, "#fff", 0.12));
    // leaves — layered clusters
    s.rect(ox + 24, oy + 16, 16, 24, leaf1);
    s.rect(ox + 16, oy + 20, 12, 16, leaf2);
    s.rect(ox + 36, oy + 20, 12, 16, leaf2);
    s.rect(ox + 28, oy + 4, 8, 16, leaf3);
    s.rect(ox + 20, oy + 16, 6, 12, leaf3);
    s.rect(ox + 42, oy + 16, 6, 12, leaf3);
    // leaf highlights
    s.rect(ox + 28, oy + 6, 4, 8, leafHi);
    s.rect(ox + 24, oy + 18, 4, 6, leaf3);
    s.rect(ox + 38, oy + 22, 4, 4, leaf3);
    // leaf shadows
    s.rect(ox + 32, oy + 28, 4, 8, mix(leaf1, "#000", 0.10));
    s.rect(ox + 18, oy + 28, 4, 6, mix(leaf2, "#000", 0.10));
  },
  [TILE.SHELF_T]: (s, ox, oy) => {
    const wood = "#6e4a2c";
    const woodLi = mix(wood, "#fff", 0.08);
    const woodDk = mix(wood, "#000", 0.15);
    // frame
    vGrad(s, ox + 2, oy, 60, 64, woodLi, woodDk);
    s.rect(ox + 2, oy, 60, 2, mix(woodLi, "#fff", 0.08));
    s.rect(ox + 2, oy, 2, 64, mix(woodLi, "#fff", 0.06));
    s.rect(ox + 60, oy, 2, 64, woodDk);
    // shelf interiors
    s.rect(ox + 6, oy + 6, 52, 20, mix(wood, "#000", 0.25));
    s.rect(ox + 6, oy + 34, 52, 20, mix(wood, "#000", 0.25));
    // books row 1
    const books1 = ["#d65d5d", "#4f9dde", "#3a9a4e", "#c9852c", "#5b7d9e", "#d65db1", "#36b5b0"];
    books1.forEach((c, i) => {
      const bx = ox + 8 + i * 7;
      s.rect(bx, oy + 10, 6, 14, c);
      s.rect(bx, oy + 10, 6, 2, mix(c, "#fff", 0.20));
      s.rect(bx, oy + 10, 1, 14, mix(c, "#fff", 0.10));
    });
    // books row 2
    const books2 = ["#36b5b0", "#c9852c", "#d65db1", "#4f6b8f", "#d65d5d", "#3a9a4e", "#5b7d9e"];
    books2.forEach((c, i) => {
      const bx = ox + 8 + i * 7;
      s.rect(bx, oy + 38, 6, 14, c);
      s.rect(bx, oy + 38, 6, 2, mix(c, "#fff", 0.20));
      s.rect(bx, oy + 38, 1, 14, mix(c, "#fff", 0.10));
    });
    // shelf divider
    s.rect(ox + 6, oy + 28, 52, 6, wood);
    s.rect(ox + 6, oy + 28, 52, 2, mix(woodLi, "#fff", 0.06));
  },
  [TILE.SHELF_B]: (s, ox, oy) => {
    const wood = "#6e4a2c";
    const woodLi = mix(wood, "#fff", 0.08);
    const woodDk = mix(wood, "#000", 0.15);
    vGrad(s, ox + 2, oy, 60, 56, woodLi, woodDk);
    s.rect(ox + 2, oy, 60, 2, mix(woodLi, "#fff", 0.08));
    s.rect(ox + 2, oy, 2, 56, mix(woodLi, "#fff", 0.06));
    s.rect(ox + 60, oy, 2, 56, woodDk);
    // top shelf interior
    s.rect(ox + 6, oy + 4, 52, 20, mix(wood, "#000", 0.25));
    // books
    const books = ["#4f9dde", "#d65d5d", "#e8e4d0", "#3a9a4e", "#7d8597", "#c9852c", "#d65db1"];
    books.forEach((c, i) => {
      const bx = ox + 8 + i * 7;
      s.rect(bx, oy + 8, 6, 14, c);
      s.rect(bx, oy + 8, 6, 2, mix(c, "#fff", 0.20));
      s.rect(bx, oy + 8, 1, 14, mix(c, "#fff", 0.10));
    });
    // bottom panel
    vGrad(s, ox + 2, oy + 28, 60, 28, mix(wood, "#000", 0.10), woodDk);
    s.rect(ox + 2, oy + 28, 60, 2, woodDk);
    // items on bottom shelf
    s.rect(ox + 10, oy + 34, 12, 12, "#d65d5d");
    s.rect(ox + 10, oy + 34, 12, 2, "#e87878");
    s.rect(ox + 26, oy + 36, 8, 10, "#4f9dde");
    s.rect(ox + 38, oy + 34, 16, 12, "#e8e4d0");
    s.rect(ox + 38, oy + 34, 16, 2, "#ffffff");
  },
  [TILE.COUNTER]: (s, ox, oy) => {
    const top = "#d4dad8";
    const topLi = mix(top, "#fff", 0.08);
    const cab = "#6a4828";
    const cabLi = mix(cab, "#fff", 0.06);
    const cabDk = mix(cab, "#000", 0.12);
    // countertop
    vGrad(s, ox, oy, T, 24, topLi, mix(top, "#000", 0.06));
    s.rect(ox, oy, T, 3, mix(topLi, "#fff", 0.12));
    // cabinet
    vGrad(s, ox, oy + 24, T, 36, cabLi, cabDk);
    s.rect(ox, oy + 24, T, 2, cabDk);
    // cabinet door
    s.rect(ox + 28, oy + 32, 2, 24, cabDk);
    s.rect(ox + 18, oy + 40, 8, 2, cabDk);
    s.rect(ox + 34, oy + 40, 8, 2, cabDk);
    // handles
    s.rect(ox + 22, oy + 38, 4, 2, "#4e3414");
    s.rect(ox + 38, oy + 38, 4, 2, "#4e3414");
  },
  [TILE.FRIDGE]: (s, ox, oy) => {
    const body = "#c4cdd4";
    const bodyLi = mix(body, "#fff", 0.10);
    const bodyDk = mix(body, "#000", 0.10);
    vGrad(s, ox + 6, oy, 52, 60, bodyLi, bodyDk);
    s.rect(ox + 6, oy, 52, 2, mix(bodyLi, "#fff", 0.12));
    s.rect(ox + 6, oy, 2, 60, mix(bodyLi, "#fff", 0.08));
    s.rect(ox + 56, oy, 2, 60, bodyDk);
    // door seam
    s.rect(ox + 8, oy + 24, 48, 1, mix(body, "#000", 0.12));
    // handles
    s.rect(ox + 48, oy + 6, 3, 10, "#5a626e");
    s.rect(ox + 48, oy + 6, 3, 2, "#6a727e");
    s.rect(ox + 48, oy + 30, 3, 16, "#5a626e");
    s.rect(ox + 48, oy + 30, 3, 2, "#6a727e");
    // glossy highlight
    s.rect(ox + 10, oy + 4, 4, 52, mix(bodyLi, "#fff", 0.12));
  },
  [TILE.COFFEE]: (s, ox, oy) => {
    drawers[TILE.COUNTER]!(s, ox, oy);
    const body = "#8e2828";
    const bodyLi = mix(body, "#fff", 0.08);
    const bodyDk = mix(body, "#000", 0.15);
    vGrad(s, ox + 16, oy, 32, 24, bodyLi, bodyDk);
    s.rect(ox + 16, oy, 32, 2, mix(bodyLi, "#fff", 0.10));
    // spout
    s.rect(ox + 24, oy + 8, 16, 12, "#1a1e28");
    s.rect(ox + 28, oy + 12, 8, 4, "#0a0e18");
    s.set(ox + 30, oy + 14, "#e0b84a");
    // steam
    s.set(ox + 28, oy - 2, "#e8e8e8");
    s.set(ox + 30, oy - 4, "#d8d8d8");
    s.set(ox + 34, oy - 2, "#e0e0e0");
    s.set(ox + 36, oy - 4, "#d0d0d0");
  },
  [TILE.COOLER]: (s, ox, oy) => {
    const body = "#d8dee4";
    const bodyLi = mix(body, "#fff", 0.08);
    const bodyDk = mix(body, "#000", 0.10);
    // base
    vGrad(s, ox + 16, oy + 28, 32, 32, bodyLi, bodyDk);
    s.rect(ox + 16, oy + 28, 32, 2, mix(bodyLi, "#fff", 0.10));
    // water jug
    vGrad(s, ox + 20, oy + 4, 24, 24, "#a8d2ec", "#5a9cc8");
    s.rect(ox + 20, oy + 4, 24, 3, mix("#a8d2ec", "#fff", 0.30));
    s.rect(ox + 24, oy + 8, 6, 12, mix("#a8d2ec", "#fff", 0.20));
    // spouts
    s.rect(ox + 24, oy + 36, 8, 8, "#4f9dde");
    s.rect(ox + 24, oy + 36, 8, 2, mix("#4f9dde", "#fff", 0.20));
    s.rect(ox + 36, oy + 36, 4, 8, "#d65d5d");
    s.rect(ox + 36, oy + 36, 4, 2, mix("#d65d5d", "#fff", 0.20));
  },
  [TILE.SOFA_L]: (s, ox, oy) => {
    const body = "#4a6888";
    const bodyLi = mix(body, "#fff", 0.08);
    const bodyDk = mix(body, "#000", 0.12);
    const arm = "#384e6c";
    // back + seat
    vGrad(s, ox + 4, oy + 16, 60, 32, bodyLi, bodyDk);
    s.rect(ox + 4, oy + 16, 60, 3, mix(bodyLi, "#fff", 0.06));
    // arm
    vGrad(s, ox + 4, oy + 8, 16, 40, mix(arm, "#fff", 0.06), mix(arm, "#000", 0.10));
    s.rect(ox + 4, oy + 8, 16, 3, mix(arm, "#fff", 0.10));
    // base
    s.rect(ox + 4, oy + 48, 60, 12, mix(body, "#000", 0.15));
    s.rect(ox + 4, oy + 48, 60, 2, bodyDk);
    // cushion seam
    s.rect(ox + 32, oy + 24, 2, 20, bodyDk);
    // cushion highlights
    s.rect(ox + 20, oy + 24, 12, 2, mix(bodyLi, "#fff", 0.08));
    s.rect(ox + 36, oy + 24, 24, 2, mix(bodyLi, "#fff", 0.08));
  },
  [TILE.SOFA_R]: (s, ox, oy) => {
    const body = "#4a6888";
    const bodyLi = mix(body, "#fff", 0.08);
    const bodyDk = mix(body, "#000", 0.12);
    const arm = "#384e6c";
    vGrad(s, ox, oy + 16, 60, 32, bodyLi, bodyDk);
    s.rect(ox, oy + 16, 60, 3, mix(bodyLi, "#fff", 0.06));
    vGrad(s, ox + 44, oy + 8, 16, 40, mix(arm, "#fff", 0.06), mix(arm, "#000", 0.10));
    s.rect(ox + 44, oy + 8, 16, 3, mix(arm, "#fff", 0.10));
    s.rect(ox, oy + 48, 60, 12, mix(body, "#000", 0.15));
    s.rect(ox, oy + 48, 60, 2, bodyDk);
    s.rect(ox + 30, oy + 24, 2, 20, bodyDk);
    s.rect(ox + 4, oy + 24, 24, 2, mix(bodyLi, "#fff", 0.08));
    s.rect(ox + 34, oy + 24, 20, 2, mix(bodyLi, "#fff", 0.08));
  },
  [TILE.PAPERS]: (s, ox, oy) => {
    // paper 1
    s.rect(ox + 10, oy + 14, 24, 28, "#f0ece0");
    s.rect(ox + 10, oy + 14, 24, 3, "#ffffff");
    s.rect(ox + 14, oy + 22, 16, 1, "#a8a090");
    s.rect(ox + 14, oy + 26, 14, 1, "#a8a090");
    s.rect(ox + 14, oy + 30, 16, 1, "#a8a090");
    s.rect(ox + 14, oy + 34, 12, 1, "#a8a090");
    // paper 2 (offset)
    s.rect(ox + 30, oy + 22, 24, 28, "#e0d8c0");
    s.rect(ox + 30, oy + 22, 24, 3, "#f0e8d0");
    s.rect(ox + 34, oy + 30, 16, 1, "#989080");
    s.rect(ox + 34, oy + 34, 14, 1, "#989080");
    s.rect(ox + 34, oy + 38, 16, 1, "#989080");
    // shadows
    s.rect(ox + 10, oy + 40, 24, 2, mix("#f0ece0", "#000", 0.06));
    s.rect(ox + 30, oy + 48, 24, 2, mix("#e0d8c0", "#000", 0.06));
  },
  [TILE.VENDING]: vendingTile("#8e2828", "#a83838"),
};

function vendingTile(body: string, bodyLight: string): TileDrawer {
  return (s, ox, oy) => {
    const bodyDk = mix(body, "#000", 0.18);
    vGrad(s, ox + 6, oy, 52, 60, mix(body, "#fff", 0.06), bodyDk);
    s.rect(ox + 6, oy, 52, 2, mix(bodyLight, "#fff", 0.10));
    s.rect(ox + 6, oy, 2, 60, mix(body, "#fff", 0.06));
    s.rect(ox + 56, oy, 2, 60, bodyDk);
    // glass front
    vGrad(s, ox + 10, oy + 8, 28, 32, "#181c24", "#282c34");
    s.rect(ox + 10, oy + 8, 28, 2, "#2a3040");
    // snacks grid
    const snacks = ["#e0b84a", "#d65d5d", "#4f9dde", "#3a9a4e", "#c9852c", "#d65db1"];
    snacks.forEach((c, i) => {
      const sx = ox + 12 + (i % 3) * 8;
      const sy = oy + 12 + Math.floor(i / 3) * 12;
      s.rect(sx, sy, 6, 8, c);
      s.rect(sx, sy, 6, 2, mix(c, "#fff", 0.20));
      s.rect(sx, sy + 6, 6, 2, mix(c, "#000", 0.15));
    });
    // glass reflection
    s.rect(ox + 12, oy + 10, 4, 28, mix("#ffffff", "#3a4050", 0.15));
    // coin panel
    s.rect(ox + 42, oy + 8, 14, 16, "#e8eaec");
    s.rect(ox + 42, oy + 8, 14, 2, "#f4f6f8");
    s.rect(ox + 44, oy + 12, 10, 2, "#33373d");
    s.rect(ox + 44, oy + 16, 10, 2, "#33373d");
    s.rect(ox + 44, oy + 20, 6, 2, "#d65d5d");
    // dispense slot
    s.rect(ox + 10, oy + 44, 28, 8, "#181c24");
    s.rect(ox + 10, oy + 44, 28, 2, "#282c34");
  };
}

// Lumon theme: green carpet, white walls, white desks — the severed floor.

function lumonCounter(s: Sheet, ox: number, oy: number): void {
  vGrad(s, ox, oy, T, 24, "#f2f4f2", "#d4d8db");
  s.rect(ox, oy, T, 3, mix("#f2f4f2", "#fff", 0.10));
  vGrad(s, ox, oy + 24, T, 36, "#d4d8db", "#b3b8bd");
  s.rect(ox, oy + 24, T, 2, "#b3b8bd");
  s.rect(ox + 28, oy + 32, 2, 24, "#b3b8bd");
  s.rect(ox + 20, oy + 40, 8, 2, "#8e949a");
  s.rect(ox + 36, oy + 40, 8, 2, "#8e949a");
}

function lumonWallFace(s: Sheet, ox: number, oy: number): void {
  vGrad(s, ox, oy, T, T, "#f6f7f4", "#dfe1dd");
  s.rect(ox, oy, T, 3, mix("#f6f7f4", "#fff", 0.08));
  s.rect(ox + 31, oy + 4, 1, 52, "#e6e8e4");
  s.rect(ox, oy + 52, T, 12, "#ced2cf");
  s.rect(ox, oy + 52, T, 2, "#b8bcb9");
}

const lumonDrawers: Record<number, TileDrawer> = {
  ...drawers,
  [TILE.CARPET_A]: carpetTile("#5e8b50", "#537e46"),
  [TILE.CARPET_B]: carpetTile("#578349", "#4d7740"),
  [TILE.TILE_A]: kitchenTile("#e4e8e4", "#c4ccc4"),
  [TILE.TILE_B]: kitchenTile("#dbe0db", "#bac2ba"),
  [TILE.VENDING]: vendingTile("#3a6f57", "#4c8a6e"),
  [TILE.COUNTER]: lumonCounter,
  [TILE.COFFEE]: (s, ox, oy) => {
    lumonCounter(s, ox, oy);
    vGrad(s, ox + 16, oy, 32, 24, "#3a4458", "#1a2030");
    s.rect(ox + 16, oy, 32, 2, mix("#3a4458", "#fff", 0.08));
    s.rect(ox + 24, oy + 8, 16, 12, "#10141c");
    s.rect(ox + 28, oy + 12, 8, 4, "#080c14");
    s.set(ox + 30, oy + 14, "#e0b84a");
  },
  [TILE.WALL_TOP]: (s, ox, oy) => {
    vGrad(s, ox, oy, T, T, "#c4cacf", "#8e949a");
    noise(s, ox, oy, T, T, "#aeb4ba", 0.05);
    s.rect(ox, oy + 58, T, 6, mix("#8e949a", "#000", 0.12));
  },
  [TILE.WALL_FACE]: lumonWallFace,
  [TILE.CLOCK]: (s, ox, oy) => {
    lumonWallFace(s, ox, oy);
    s.rect(ox + 18, oy + 8, 28, 28, "#33373d");
    s.rect(ox + 18, oy + 8, 28, 2, "#454951");
    vGrad(s, ox + 20, oy + 10, 24, 24, "#f6f6fa", "#e0e0e4");
    s.rect(ox + 31, oy + 14, 2, 8, "#33373d");
    s.rect(ox + 32, oy + 22, 8, 2, "#d65d5d");
    s.set(ox + 31, oy + 21, "#33373d");
    s.set(ox + 32, oy + 22, "#33373d");
    s.rect(ox + 22, oy + 12, 6, 2, "#ffffff");
  },
  [TILE.POSTER]: (s, ox, oy) => {
    lumonWallFace(s, ox, oy);
    s.rect(ox + 10, oy + 6, 44, 44, "#2e3547");
    s.rect(ox + 10, oy + 6, 44, 2, mix("#2e3547", "#fff", 0.06));
    vGrad(s, ox + 12, oy + 8, 40, 40, "#d8d2b8", "#c0baa0");
    // portrait
    vGrad(s, ox + 22, oy + 14, 20, 16, "#f2c39b", "#d8a87a");
    s.rect(ox + 22, oy + 14, 20, 3, mix("#f2c39b", "#fff", 0.10));
    // suit
    vGrad(s, ox + 18, oy + 30, 28, 16, "#3a4458", "#23283a");
    s.rect(ox + 30, oy + 30, 4, 8, "#f2c39b");
  },
  [TILE.DOOR]: (s, ox, oy) => {
    s.rect(ox, oy, T, T, "#aeb4ba");
    vGrad(s, ox + 6, oy + 4, 52, 58, "#f0f2f4", "#d0d4d6");
    s.rect(ox + 6, oy + 4, 52, 2, mix("#f0f2f4", "#fff", 0.10));
    s.rect(ox + 6, oy + 4, 2, 58, mix("#f0f2f4", "#fff", 0.06));
    s.rect(ox + 56, oy + 4, 2, 58, "#c6cbd0");
    // panels
    s.rect(ox + 14, oy + 12, 36, 18, "#dde0e3");
    s.rect(ox + 14, oy + 12, 36, 2, mix("#dde0e3", "#fff", 0.08));
    s.rect(ox + 14, oy + 36, 36, 18, "#dde0e3");
    s.rect(ox + 14, oy + 36, 36, 2, mix("#dde0e3", "#fff", 0.08));
    // handle
    s.rect(ox + 50, oy + 32, 3, 4, "#5a626e");
    s.rect(ox + 50, oy + 32, 3, 1, "#6a727e");
  },
  [TILE.DOORMAT]: (s, ox, oy) => {
    const base = "#46683c";
    const line = "#527a45";
    const dk = "#395431";
    s.rect(ox, oy, T, T, base);
    s.rect(ox, oy, T, 3, dk);
    s.rect(ox, oy + 61, T, 3, dk);
    s.rect(ox, oy, 3, T, dk);
    s.rect(ox + 61, oy, 3, T, dk);
    for (let y = 6; y < 58; y += 5) {
      s.rect(ox + 4, oy + y, 56, 2, line);
      s.rect(ox + 4, oy + y + 2, 56, 1, mix(base, "#000", 0.08));
    }
    noise(s, ox + 4, oy + 4, 56, 56, mix(base, "#000", 0.10), 0.12);
  },
  [TILE.DESK_L]: (s, ox, oy) => {
    vGrad(s, ox + 2, oy, 60, 44, "#f4f6f8", "#d8dade");
    s.rect(ox + 2, oy, 60, 3, mix("#f4f6f8", "#fff", 0.10));
    vGrad(s, ox + 2, oy + 44, 60, 16, "#c3c8cd", "#aab0b6");
    s.rect(ox + 2, oy + 44, 60, 2, "#aab0b6");
    s.rect(ox + 2, oy, 2, 60, "#aab0b6");
  },
  [TILE.DESK_R]: (s, ox, oy) => {
    vGrad(s, ox, oy, 60, 44, "#f4f6f8", "#d8dade");
    s.rect(ox, oy, 60, 3, mix("#f4f6f8", "#fff", 0.10));
    vGrad(s, ox, oy + 44, 60, 16, "#c3c8cd", "#aab0b6");
    s.rect(ox, oy + 44, 60, 2, "#aab0b6");
    s.rect(ox + 58, oy, 2, 60, "#aab0b6");
    // papers
    s.rect(ox + 6, oy + 10, 20, 24, "#f7f8fa");
    s.rect(ox + 6, oy + 10, 20, 3, "#ffffff");
    s.rect(ox + 10, oy + 18, 12, 1, "#9aa0a8");
    s.rect(ox + 10, oy + 22, 10, 1, "#9aa0a8");
    // mug
    s.rect(ox + 36, oy + 14, 12, 12, "#3a6f57");
    s.rect(ox + 36, oy + 14, 12, 2, mix("#3a6f57", "#fff", 0.10));
    s.rect(ox + 48, oy + 18, 4, 6, "#3a6f57");
  },
};

function buildTileset(set: Record<number, TileDrawer>): Sheet {
  const cols = 8;
  const rows = 4;
  const s = new Sheet(cols * T, rows * T);
  for (let id = 0; id < 32; id++) {
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
}

function mix(hex1: string, hex2: string, t: number): string {
  const r = Math.round(parseInt(hex1.slice(1, 3), 16) + (parseInt(hex2.slice(1, 3), 16) - parseInt(hex1.slice(1, 3), 16)) * t);
  const g = Math.round(parseInt(hex1.slice(3, 5), 16) + (parseInt(hex2.slice(3, 5), 16) - parseInt(hex1.slice(3, 5), 16)) * t);
  const b = Math.round(parseInt(hex1.slice(5, 7), 16) + (parseInt(hex2.slice(5, 7), 16) - parseInt(hex1.slice(5, 7), 16)) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const CHAR_PALETTES: CharPalette[] = [
  { skin: "#f2c39b", hair: "#2b1d0e", shirt: "#e05d5d", shirtShade: "#b84444", pants: "#2f3e5c" },
  { skin: "#d9a066", hair: "#5a3825", shirt: "#4f9dde", shirtShade: "#3a7cb5", pants: "#454545" },
  { skin: "#a06a42", hair: "#15100a", shirt: "#53b86b", shirtShade: "#3d9152", pants: "#5c4a2f" },
  { skin: "#ffdbac", hair: "#c9a227", shirt: "#c9852c", shirtShade: "#a06a1f", pants: "#3a5a40" },
  { skin: "#f2c39b", hair: "#9e2b2b", shirt: "#5b7d9e", shirtShade: "#46627d", pants: "#3e4a5c" },
  { skin: "#8d5524", hair: "#2b1d0e", shirt: "#36b5b0", shirtShade: "#28908c", pants: "#2f3e5c" },
  { skin: "#d9a066", hair: "#e8e8e8", shirt: "#d65db1", shirtShade: "#ab4489", pants: "#454545" },
  { skin: "#ffdbac", hair: "#3f7d4e", shirt: "#7d8597", shirtShade: "#616877", pants: "#23283a" },
];

const BOSS_PALETTE: CharPalette = {
  skin: "#f2c39b",
  hair: "#2b1d0e",
  shirt: "#2e3547",
  shirtShade: "#23283a",
  pants: "#1b1f2e",
  tie: "#9e2b2b",
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
  const bob = pose % 2 === 1 ? 2 : 0;

  const skinLi = mix(pal.skin, "#ffffff", 0.22);
  const skinDk = mix(pal.skin, "#000000", 0.12);
  const hairLi = mix(pal.hair, "#ffffff", 0.20);
  const hairDk = mix(pal.hair, "#000000", 0.18);
  const shirtLi = mix(pal.shirt, "#ffffff", 0.15);
  const pantsLi = mix(pal.pants, "#ffffff", 0.08);

  const p = (x: number, y: number, w: number, h: number, c: string) =>
    s.rect(ox + x, oy + y + bob, w, h, c);
  const px = (x: number, y: number, c: string) => s.set(ox + x, oy + y + bob, c);

  // ===== CUTE CHIBI (64x96) =====
  // Head: y 2-36 (36px tall), x 14-50 (36px wide) — huge, round
  // Torso: y 38-60 (22px), x 20-42
  // Legs: y 62-76 (14px), stubby
  // Shoes: y 78-88 (10px), rounded

  if (d === "down") {
    // ---- HEAD: big round dome ----
    // Hair top — rounded
    p(24, 2, 16, 2, pal.hair);
    p(20, 4, 24, 2, pal.hair);
    p(18, 6, 28, 2, pal.hair);
    p(16, 8, 32, 4, pal.hair);
    // Hair sides
    p(16, 12, 4, 10, pal.hair);
    p(44, 12, 4, 10, pal.hair);
    // Face area
    p(20, 12, 24, 20, pal.skin);
    p(20, 32, 24, 4, pal.skin);
    // Hair bangs — soft fringe
    p(20, 12, 24, 4, pal.hair);
    p(20, 16, 4, 2, pal.hair);
    p(40, 16, 4, 2, pal.hair);
    p(28, 16, 2, 2, pal.hair);
    p(34, 16, 2, 2, pal.hair);
    // Soft outline (only key edges)
    p(22, 0, 20, 2, OUTLINE);
    p(18, 2, 4, 2, OUTLINE);
    p(42, 2, 4, 2, OUTLINE);
    p(14, 6, 2, 6, OUTLINE);
    p(48, 6, 2, 6, OUTLINE);
    p(16, 12, 2, 10, OUTLINE);
    p(46, 12, 2, 10, OUTLINE);
    p(18, 22, 2, 4, OUTLINE);
    p(44, 22, 2, 4, OUTLINE);
    p(20, 26, 2, 6, OUTLINE);
    p(42, 26, 2, 6, OUTLINE);
    p(22, 32, 20, 2, OUTLINE);
    p(20, 34, 2, 2, OUTLINE);
    p(42, 34, 2, 2, OUTLINE);
    // Hair shine
    p(22, 6, 10, 2, hairLi);
    p(18, 8, 2, 4, hairLi);
    p(44, 12, 2, 8, hairDk);
    // Face soft shading
    p(20, 18, 2, 14, skinLi);
    p(42, 18, 2, 14, skinDk);
    // Eyes — big cute 6x4 ovals with shine
    p(24, 20, 6, 4, "#2a2040");
    p(34, 20, 6, 4, "#2a2040");
    // Eye shine (white sparkle)
    px(26, 20, "#ffffff");
    px(36, 20, "#ffffff");
    px(28, 22, mix("#ffffff", "#aaccff", 0.3));
    px(38, 22, mix("#ffffff", "#aaccff", 0.3));
    // Mouth — tiny cute smile
    p(30, 28, 4, 2, skinDk);
    px(28, 28, skinDk);
    px(34, 28, skinDk);
    // Cheek blush
    p(22, 26, 4, 2, mix(pal.skin, "#ff88aa", 0.25));
    p(40, 26, 4, 2, mix(pal.skin, "#ff88aa", 0.25));

    // ---- NECK (tiny) ----
    p(28, 36, 8, 2, skinDk);

    // ---- TORSO (small, rounded) ----
    p(20, 38, 24, 20, pal.shirt);
    p(22, 38, 20, 2, shirtLi);
    p(20, 38, 2, 20, shirtLi);
    p(42, 38, 2, 20, pal.shirtShade);
    p(20, 54, 24, 4, pal.shirtShade);
    // Soft outline
    p(18, 38, 2, 20, OUTLINE);
    p(44, 38, 2, 20, OUTLINE);
    p(20, 58, 24, 2, OUTLINE);
    p(20, 38, 2, 2, OUTLINE);
    p(42, 38, 2, 2, OUTLINE);
    if (pal.tie) {
      p(30, 40, 4, 8, pal.tie);
      p(28, 46, 8, 2, pal.tie);
      p(30, 48, 4, 2, pal.tie);
    }

    // ---- ARMS (stubby) ----
    p(16, 40, 4, 12, pal.shirt);
    p(44, 40, 4, 12, pal.shirt);
    p(16, 40, 2, 12, shirtLi);
    p(46, 40, 2, 12, pal.shirtShade);
    p(14, 40, 2, 12, OUTLINE);
    p(48, 40, 2, 12, OUTLINE);
    // Hands
    p(16, 52, 4, 4, pal.skin);
    p(44, 52, 4, 4, pal.skin);
    p(16, 52, 2, 2, skinLi);

    // ---- LEGS & SHOES (stubby) ----
    if (pose === 1 || pose === 3) {
      const leftUp = pose === 1;
      const lx = leftUp ? 22 : 34;
      const sx = leftUp ? 34 : 22;
      // lifted leg (shorter)
      p(lx, 62, 8, 10, pal.pants);
      p(lx, 72, 10, 6, SHOE);
      p(lx, 72, 10, 2, mix(SHOE, "#fff", 0.10));
      p(lx - 2, 62, 2, 10, OUTLINE);
      p(lx, 62, 2, 10, pantsLi);
      // planted leg
      p(sx, 62, 8, 14, pal.pants);
      p(sx, 76, 10, 6, SHOE);
      p(sx, 76, 10, 2, mix(SHOE, "#fff", 0.10));
      p(sx - 2, 62, 2, 14, OUTLINE);
      p(sx, 62, 2, 14, pantsLi);
    } else {
      p(22, 62, 8, 14, pal.pants);
      p(34, 62, 8, 14, pal.pants);
      p(22, 76, 10, 6, SHOE);
      p(32, 76, 10, 6, SHOE);
      p(20, 62, 2, 14, OUTLINE);
      p(30, 62, 2, 14, OUTLINE);
      p(42, 62, 2, 14, OUTLINE);
      p(22, 62, 2, 14, pantsLi);
      p(34, 62, 2, 14, pantsLi);
      p(22, 76, 10, 2, mix(SHOE, "#fff", 0.10));
      p(32, 76, 10, 2, mix(SHOE, "#fff", 0.10));
    }

  } else if (d === "up") {
    // ---- HEAD: all hair (back of head) ----
    p(24, 2, 16, 2, pal.hair);
    p(20, 4, 24, 2, pal.hair);
    p(18, 6, 28, 2, pal.hair);
    p(16, 8, 32, 24, pal.hair);
    p(20, 32, 24, 4, pal.hair);
    // Soft outline
    p(22, 0, 20, 2, OUTLINE);
    p(18, 2, 4, 2, OUTLINE);
    p(42, 2, 4, 2, OUTLINE);
    p(14, 6, 2, 6, OUTLINE);
    p(48, 6, 2, 6, OUTLINE);
    p(16, 12, 2, 20, OUTLINE);
    p(46, 12, 2, 20, OUTLINE);
    p(18, 32, 2, 4, OUTLINE);
    p(44, 32, 2, 4, OUTLINE);
    p(22, 34, 20, 2, OUTLINE);
    p(20, 36, 2, 2, OUTLINE);
    p(42, 36, 2, 2, OUTLINE);
    // Hair shine
    p(22, 6, 12, 2, hairLi);
    p(18, 8, 2, 12, hairLi);
    p(44, 8, 2, 24, hairDk);
    p(20, 30, 24, 2, hairDk);

    // ---- NECK ----
    p(28, 36, 8, 2, skinDk);

    // ---- TORSO (back) ----
    p(20, 38, 24, 20, pal.shirt);
    p(22, 38, 20, 2, shirtLi);
    p(20, 38, 2, 20, shirtLi);
    p(42, 38, 2, 20, pal.shirtShade);
    p(20, 54, 24, 4, pal.shirtShade);
    p(18, 38, 2, 20, OUTLINE);
    p(44, 38, 2, 20, OUTLINE);
    p(20, 58, 24, 2, OUTLINE);

    // ---- ARMS ----
    p(16, 40, 4, 12, pal.shirt);
    p(44, 40, 4, 12, pal.shirt);
    p(16, 40, 2, 12, shirtLi);
    p(46, 40, 2, 12, pal.shirtShade);
    p(14, 40, 2, 12, OUTLINE);
    p(48, 40, 2, 12, OUTLINE);
    p(16, 52, 4, 4, pal.skin);
    p(44, 52, 4, 4, pal.skin);

    // ---- LEGS & SHOES ----
    if (pose === 1 || pose === 3) {
      const leftUp = pose === 1;
      const lx = leftUp ? 22 : 34;
      const sx = leftUp ? 34 : 22;
      p(lx, 62, 8, 10, pal.pants);
      p(lx, 72, 10, 6, SHOE);
      p(lx, 72, 10, 2, mix(SHOE, "#fff", 0.10));
      p(lx - 2, 62, 2, 10, OUTLINE);
      p(lx, 62, 2, 10, pantsLi);
      p(sx, 62, 8, 14, pal.pants);
      p(sx, 76, 10, 6, SHOE);
      p(sx, 76, 10, 2, mix(SHOE, "#fff", 0.10));
      p(sx - 2, 62, 2, 14, OUTLINE);
      p(sx, 62, 2, 14, pantsLi);
    } else {
      p(22, 62, 8, 14, pal.pants);
      p(34, 62, 8, 14, pal.pants);
      p(22, 76, 10, 6, SHOE);
      p(32, 76, 10, 6, SHOE);
      p(20, 62, 2, 14, OUTLINE);
      p(30, 62, 2, 14, OUTLINE);
      p(42, 62, 2, 14, OUTLINE);
      p(22, 62, 2, 14, pantsLi);
      p(34, 62, 2, 14, pantsLi);
      p(22, 76, 10, 2, mix(SHOE, "#fff", 0.10));
      p(32, 76, 10, 2, mix(SHOE, "#fff", 0.10));
    }

  } else {
    // ---- RIGHT PROFILE ----
    // Hair dome
    p(24, 2, 16, 2, pal.hair);
    p(20, 4, 24, 2, pal.hair);
    p(18, 6, 28, 2, pal.hair);
    p(16, 8, 32, 6, pal.hair);
    // Back of head hair
    p(16, 14, 8, 18, pal.hair);
    // Face
    p(24, 14, 24, 18, pal.skin);
    p(24, 32, 20, 4, pal.skin);
    // Soft outline
    p(22, 0, 20, 2, OUTLINE);
    p(18, 2, 4, 2, OUTLINE);
    p(42, 2, 4, 2, OUTLINE);
    p(14, 6, 2, 6, OUTLINE);
    p(48, 6, 2, 6, OUTLINE);
    p(16, 12, 2, 20, OUTLINE);
    p(46, 12, 2, 12, OUTLINE);
    p(42, 24, 2, 4, OUTLINE);
    p(24, 32, 20, 2, OUTLINE);
    p(22, 34, 2, 2, OUTLINE);
    p(42, 34, 2, 2, OUTLINE);
    // Hair shine
    p(22, 6, 10, 2, hairLi);
    p(18, 8, 2, 6, hairLi);
    p(44, 8, 2, 12, hairDk);
    // Face shading
    p(24, 16, 2, 16, skinLi);
    p(42, 16, 2, 16, skinDk);
    // Eye — big cute 6x4
    p(34, 20, 6, 4, "#2a2040");
    px(36, 20, "#ffffff");
    px(38, 22, mix("#ffffff", "#aaccff", 0.3));
    // Nose
    p(46, 24, 2, 2, skinDk);
    // Mouth — tiny smile
    p(38, 28, 4, 2, skinDk);
    px(36, 28, skinDk);
    // Cheek blush
    p(30, 26, 4, 2, mix(pal.skin, "#ff88aa", 0.25));

    // ---- NECK ----
    p(28, 36, 8, 2, skinDk);

    // ---- TORSO (profile) ----
    p(22, 38, 20, 20, pal.shirt);
    p(22, 38, 20, 2, shirtLi);
    p(22, 38, 2, 20, shirtLi);
    p(40, 38, 2, 20, pal.shirtShade);
    p(22, 54, 20, 4, pal.shirtShade);
    p(20, 38, 2, 20, OUTLINE);
    p(42, 38, 2, 20, OUTLINE);
    p(22, 58, 20, 2, OUTLINE);

    // ---- ARM (one visible, stubby) ----
    p(36, 40, 6, 12, pal.shirt);
    p(36, 40, 2, 12, shirtLi);
    p(42, 40, 2, 12, OUTLINE);
    p(36, 52, 6, 4, pal.skin);
    p(36, 52, 2, 2, skinLi);

    // ---- LEGS (profile) ----
    if (pose === 1 || pose === 3) {
      const leftUp = pose === 1;
      const frontX = leftUp ? 28 : 22;
      const backX = leftUp ? 22 : 28;
      p(frontX, 62, 8, 10, pal.pants);
      p(frontX, 72, 10, 6, SHOE);
      p(frontX, 72, 10, 2, mix(SHOE, "#fff", 0.10));
      p(frontX - 2, 62, 2, 10, OUTLINE);
      p(frontX, 62, 2, 10, pantsLi);
      p(backX, 62, 8, 14, pal.pants);
      p(backX, 76, 10, 6, SHOE);
      p(backX, 76, 10, 2, mix(SHOE, "#fff", 0.10));
      p(backX - 2, 62, 2, 14, OUTLINE);
      p(backX, 62, 2, 14, pantsLi);
    } else {
      p(22, 62, 8, 14, pal.pants);
      p(30, 62, 8, 14, pal.pants);
      p(22, 76, 10, 6, SHOE);
      p(30, 76, 10, 6, SHOE);
      p(20, 62, 2, 14, OUTLINE);
      p(38, 62, 2, 14, OUTLINE);
      p(22, 62, 2, 14, pantsLi);
      p(22, 76, 10, 2, mix(SHOE, "#fff", 0.10));
      p(30, 76, 10, 2, mix(SHOE, "#fff", 0.10));
    }
  }

  if (mirror) s.flipH(ox, oy, CW, CH);
}

function buildCharSheet(pal: CharPalette): Sheet {
  const s = new Sheet(CW * 4, CH * 4);
  DIRS.forEach((dir, row) => {
    for (let pose = 0; pose < 4; pose++) {
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
  /** Floors, walls and decor — desks, chairs and points are common. */
  paint(G: Plot, W: Plot, F: Plot): void;
}

const CLASSIC: MapTheme = {
  tileset: "office",
  desks: [
    [3, 4], [8, 4], [13, 4], [18, 4],
    [3, 10], [8, 10], [13, 10], [18, 10],
  ],
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
    // Break room divider wall (partial — leaves an opening)
    for (let y = 2; y <= 3; y++) W(21, y, TILE.WALL_TOP);
    W(21, 4, TILE.WALL_FACE);
    W(21, 5, TILE.WALL_FACE);
    // Meeting corner partial wall
    W(21, 14, TILE.WALL_TOP);
    W(21, 15, TILE.WALL_FACE);

    // --- furniture ---
    // Bookshelves along the west wall
    F(1, 3, TILE.SHELF_T);
    F(1, 4, TILE.SHELF_B);
    F(1, 12, TILE.SHELF_T);
    F(1, 13, TILE.SHELF_B);
    // Filing cabinets
    F(1, 6, TILE.FILING);
    F(1, 7, TILE.FILING);
    F(20, 3, TILE.FILING);
    F(20, 4, TILE.FILING);
    // Plants scattered organically
    F(1, 17, TILE.PLANT);
    F(20, 2, TILE.PLANT);
    F(28, 7, TILE.PLANT);
    F(27, 13, TILE.PLANT);
    F(11, 8, TILE.PLANT);
    F(22, 12, TILE.PLANT);
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
    F(2, 15, TILE.PAPERS);
    F(19, 17, TILE.TRASH);
    F(5, 17, TILE.PLANT);
  },
};

// The severed floor: a sea of green carpet, white walls, and every desk pushed
// together into one block in the middle of the room.
const LUMON: MapTheme = {
  tileset: "lumon",
  desks: [
    [11, 7], [13, 7], [15, 7], [17, 7],
    [11, 11], [13, 11], [15, 11], [17, 11],
  ],
  paint(G, W, F) {
    // --- distinct floor zones ---
    // Work area: green carpet
    for (let y = 1; y <= 13; y++) {
      for (let x = 1; x <= 20; x++) {
        G(x, y, (x + y) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
      }
    }
    // Lobby / entrance: tile
    for (let y = 14; y <= 18; y++) {
      for (let x = 1; x <= 20; x++) {
        G(x, y, (x + y) % 2 === 0 ? TILE.TILE_A : TILE.TILE_B);
      }
    }
    // Break room (top right): tile
    for (let y = 1; y <= 6; y++) {
      for (let x = 22; x <= 28; x++) G(x, y, (x + y) % 2 === 0 ? TILE.TILE_A : TILE.TILE_B);
    }
    // Meeting corner (bottom right): carpet
    for (let y = 14; y <= 18; y++) {
      for (let x = 22; x <= 28; x++) G(x, y, (x + y) % 2 === 0 ? TILE.CARPET_A : TILE.CARPET_B);
    }
    // Central pathway between desk rows (darker carpet)
    for (let y = 9; y <= 10; y++) {
      for (let x = 1; x <= 20; x++) G(x, y, TILE.CARPET_B);
    }
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
    // Bare white north wall — clock + founder portraits
    for (let x = 1; x < MAP_W - 1; x++) W(x, 1, TILE.WALL_FACE);
    W(14, 1, TILE.CLOCK);
    W(6, 1, TILE.POSTER);
    W(19, 1, TILE.POSTER);
    // Door in the south wall
    W(14, MAP_H - 1, TILE.DOOR);
    W(15, MAP_H - 1, TILE.DOOR);
    // Break room divider (partial)
    for (let y = 2; y <= 3; y++) W(21, y, TILE.WALL_TOP);
    W(21, 4, TILE.WALL_FACE);
    W(21, 5, TILE.WALL_FACE);
    // Meeting corner partial wall
    W(21, 15, TILE.WALL_TOP);
    W(21, 16, TILE.WALL_FACE);

    // --- break room gear ---
    F(22, 2, TILE.COUNTER);
    F(23, 2, TILE.COFFEE);
    F(24, 2, TILE.COUNTER);
    F(26, 2, TILE.FRIDGE);
    F(27, 2, TILE.VENDING);
    F(28, 4, TILE.COOLER);
    F(27, 6, TILE.TRASH);

    // --- filing cabinets along walls ---
    F(1, 3, TILE.FILING);
    F(1, 4, TILE.FILING);
    F(1, 12, TILE.FILING);
    F(1, 13, TILE.FILING);
    F(20, 3, TILE.FILING);
    F(20, 12, TILE.FILING);

    // --- sparse decor ---
    F(1, 17, TILE.TRASH);
    F(20, 17, TILE.PLANT);
    F(5, 17, TILE.PLANT);
    F(22, 12, TILE.PLANT);
    F(11, 9, TILE.PLANT);
    F(26, 16, TILE.PLANT);
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
        imageheight: 256,
        tilewidth: T,
        tileheight: T,
        tilecount: 32,
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

// -------------------------------------------------------------------- main

const PREVIEWS = join(ROOT, "scripts", "previews");

const tileset = buildTileset(drawers);
tileset.save(join(ASSETS, "tilesets", "office.png"));
tileset.preview(join(PREVIEWS, "tileset.png"), 2);

const lumonTileset = buildTileset(lumonDrawers);
lumonTileset.save(join(ASSETS, "tilesets", "lumon.png"));
lumonTileset.preview(join(PREVIEWS, "tileset-lumon.png"), 2);

CHAR_PALETTES.forEach((pal, i) => {
  const sheet = buildCharSheet(pal);
  sheet.save(join(ASSETS, "characters", `char-${i}.png`));
  if (i === 0) sheet.preview(join(PREVIEWS, "char-0.png"), 6);
});
buildCharSheet(BOSS_PALETTE).save(join(ASSETS, "characters", "boss.png"));

buildMonitor().save(join(ASSETS, "sprites", "monitor.png"));
buildBubble().save(join(ASSETS, "sprites", "bubble.png"));

mkdirSync(join(ASSETS, "maps"), { recursive: true });
writeFileSync(join(ASSETS, "maps", "office.json"), JSON.stringify(buildMap(CLASSIC)));
writeFileSync(join(ASSETS, "maps", "lumon.json"), JSON.stringify(buildMap(LUMON)));

console.log("assets written to", ASSETS);
