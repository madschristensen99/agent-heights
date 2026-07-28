/**
 * Generates an Open Graph preview image (1200×630) for social media link previews.
 * Composites the office tileset as a background with character sprites and
 * a pixel-font "AGENT HEIGHTS" title.
 *
 * Run: pnpm exec tsx scripts/generate-og-image.ts
 */
import PNG from "pngjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const assetsDir = join(root, "client", "public", "assets");

const W = 1200;
const H = 630;

function loadPNG(path: string): PNG.PNG {
  const buf = readFileSync(path);
  return PNG.PNG.sync.read(buf);
}

function blend(dst: PNG.PNG, src: PNG.PNG, dx: number, dy: number, scale: number): void {
  for (let y = 0; y < src.height * scale; y++) {
    for (let x = 0; x < src.width * scale; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (ty * W + tx) * 4;
      const alpha = src.data[si + 3] / 255;
      if (alpha < 0.01) continue;
      dst.data[di] = Math.round(src.data[si] * alpha + dst.data[di] * (1 - alpha));
      dst.data[di + 1] = Math.round(src.data[si + 1] * alpha + dst.data[di + 1] * (1 - alpha));
      dst.data[di + 2] = Math.round(src.data[si + 2] * alpha + dst.data[di + 2] * (1 - alpha));
      dst.data[di + 3] = 255;
    }
  }
}

function fillRect(img: PNG.PNG, x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
  for (let yy = y; yy < y + h && yy < H; yy++) {
    for (let xx = x; xx < x + w && xx < W; xx++) {
      const i = (yy * W + xx) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
}

// ── 5×7 pixel bitmap font ─────────────────────────────────────────────────
// Each letter is 5 wide, 7 tall. 1 = filled, 0 = empty.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "10001", "01010", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function drawText(img: PNG.PNG, text: string, startX: number, startY: number, scale: number, r: number, g: number, b: number): number {
  const CHAR_W = 5;
  const CHAR_H = 7;
  const GAP = 1; // 1 empty column between letters
  let x = startX;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let gy = 0; gy < CHAR_H; gy++) {
      for (let gx = 0; gx < CHAR_W; gx++) {
        if (glyph[gy][gx] === "1") {
          fillRect(img, x + gx * scale, startY + gy * scale, scale, scale, r, g, b);
        }
      }
    }
    x += (CHAR_W + GAP) * scale;
  }
  return x;
}

function textWidth(text: string, scale: number): number {
  const CHAR_W = 5;
  const GAP = 1;
  return text.length * (CHAR_W + GAP) * scale - GAP * scale;
}

// ── Create canvas ─────────────────────────────────────────────────────────
const img = new PNG.PNG({ width: W, height: H });

// Dark gradient background — deep blue-purple
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = Math.round(18 + t * 8);
  const g = Math.round(20 + t * 10);
  const b = Math.round(32 + t * 18);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  }
}

// Tile the office floor across the bottom third as a subtle background
const tileset = loadPNG(join(assetsDir, "tilesets", "office.png"));
const TILE = 64;
const FLOOR_SCALE = 2;
const floorY = Math.floor(H * 0.72);
for (let y = floorY; y < H; y += TILE * FLOOR_SCALE) {
  for (let x = 0; x < W; x += TILE * FLOOR_SCALE) {
    const tileX = (1 % (tileset.width / TILE)) * TILE;
    const tileY = Math.floor(1 / (tileset.width / TILE)) * TILE;
    const tile = new PNG.PNG({ width: TILE, height: TILE });
    for (let yy = 0; yy < TILE; yy++) {
      for (let xx = 0; xx < TILE; xx++) {
        const si = ((tileY + yy) * tileset.width + (tileX + xx)) * 4;
        const di = (yy * TILE + xx) * 4;
        tile.data[di] = tileset.data[si];
        tile.data[di + 1] = tileset.data[si + 1];
        tile.data[di + 2] = tileset.data[si + 2];
        tile.data[di + 3] = tileset.data[si + 3];
      }
    }
    blend(img, tile, x, y, FLOOR_SCALE);
  }
}

// ── "AGENT HEIGHTS" title in pixel font ────────────────────────────────────
const title = "AGENT HEIGHTS";
const titleScale = 12;
const titleW = textWidth(title, titleScale);
const titleX = Math.floor((W - titleW) / 2);
const titleY = 60;

// Shadow (offset by a few px, darker)
drawText(img, title, titleX + 4, titleY + 4, titleScale, 8, 10, 16);
// Main text — bright green to match the game's accent color
drawText(img, title, titleX, titleY, titleScale, 88, 200, 102);

// ── Subtitle ──────────────────────────────────────────────────────────────
const subtitle = "MANAGE AI AGENTS IN A VIRTUAL OFFICE";
const subScale = 4;
const subW = textWidth(subtitle, subScale);
const subX = Math.floor((W - subW) / 2);
drawText(img, subtitle, subX + 2, titleY + 7 * titleScale + 30 + 2, subScale, 60, 60, 70);
drawText(img, subtitle, subX, titleY + 7 * titleScale + 30, subScale, 160, 165, 180);

// ── Character sprites along the bottom ────────────────────────────────────
const charFiles = ["char-0.png", "char-1.png", "char-2.png", "char-3.png", "char-4.png"];
const charScale = 4;
const charSpacing = 200;
const charTotalW = charFiles.length * charSpacing - (charSpacing - 64 * charScale);
const charStartX = Math.floor((W - (charFiles.length * 64 * charScale + (charFiles.length - 1) * 40)) / 2);
const charY = 340;
for (let i = 0; i < charFiles.length; i++) {
  const char = loadPNG(join(assetsDir, "characters", charFiles[i]));
  // Extract the first frame (top-left 64×64 region of the spritesheet)
  const frame = new PNG.PNG({ width: 64, height: 64 });
  for (let yy = 0; yy < 64; yy++) {
    for (let xx = 0; xx < 64; xx++) {
      const si = (yy * char.width + xx) * 4;
      const di = (yy * 64 + xx) * 4;
      frame.data[di] = char.data[si];
      frame.data[di + 1] = char.data[si + 1];
      frame.data[di + 2] = char.data[si + 2];
      frame.data[di + 3] = char.data[si + 3];
    }
  }
  const px = charStartX + i * (64 * charScale + 40);
  // Shadow under each character
  fillRect(img, px + 8, charY + 64 * charScale - 8, 64 * charScale - 16, 12, 0, 0, 0);
  blend(img, frame, px, charY, charScale);
}

// ── Output ────────────────────────────────────────────────────────────────
const outPath = join(root, "client", "public", "og-image.png");
const buf = PNG.PNG.sync.write(img);
writeFileSync(outPath, buf);
console.log(`[og-image] wrote ${outPath} (${W}×${H})`);
