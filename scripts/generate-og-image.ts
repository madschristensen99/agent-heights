/**
 * Generates an Open Graph preview image (1200×630) for social media link previews.
 * Composites the office tileset as a background with character sprites on top.
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

// Create canvas
const img = new PNG.PNG({ width: W, height: H });

// Dark gradient background
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = Math.round(20 + t * 10);
  const g = Math.round(22 + t * 12);
  const b = Math.round(35 + t * 20);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  }
}

// Tile the office floor across the bottom 40% as a subtle background
const tileset = loadPNG(join(assetsDir, "tilesets", "office.png"));
const TILE = 64;
const SCALE = 2;
const floorY = Math.floor(H * 0.6);
for (let y = floorY; y < H; y += TILE * SCALE) {
  for (let x = 0; x < W; x += TILE * SCALE) {
    // Use tile index 1 (floor tile) from the tileset — top-left is index 0
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
    blend(img, tile, x, y, SCALE);
  }
}

// Place 4 character sprites across the image
const charFiles = ["char-0.png", "char-1.png", "char-2.png", "char-3.png"];
const charScale = 3;
const charSpacing = 260;
const charStartX = 80;
const charY = 180;
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
  blend(img, frame, charStartX + i * charSpacing, charY, charScale);
}

// Dark overlay strip for text area
fillRect(img, 0, 0, W, 160, 15, 17, 28);

// Write "AGENT HQ" as pixel blocks (simple bitmap text)
// We'll draw a simple styled bar instead since we don't have a font renderer
const accentR = 88, accentG = 200, accentB = 102;
fillRect(img, 60, 50, 8, 80, accentR, accentG, accentB); // left accent bar

// Output
const outPath = join(root, "client", "public", "og-image.png");
const buf = PNG.PNG.sync.write(img);
writeFileSync(outPath, buf);
console.log(`[og-image] wrote ${outPath} (${W}×${H})`);
