/**
 * AI Character Component Generator — Phase 1: Hair
 *
 * Renders procedural spritesheets with GREEN body + WHITE hair,
 * sends to Nano Banana 2 Edit for enhancement, extracts hair as
 * grayscale transparent PNGs for runtime color tinting.
 *
 * Usage:
 *   pnpm tsx scripts/generate-char-components.ts                # all hair
 *   pnpm tsx scripts/generate-char-components.ts --filter spiky  # one style
 *   pnpm tsx scripts/generate-char-components.ts --dry-run       # list only
 *
 * Requires FAL_KEY. Output: client/public/assets/ai/char/hair/
 */
import { PNG } from "pngjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

import {
  drawChar,
  type CharPalette,
  type DrawSurface,
  type Dir,
  CW,
  CH,
} from "../shared/char-draw";
import { HAIR_STYLES } from "../shared/types";
import { nanoBanana2Edit, removeBackground, downloadUrl } from "./lib/fal-client.js";
import { saveBuffer, uploadToFal } from "./lib/post-process.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "client", "public", "assets", "ai", "char", "hair");
const SHEET_COLS = 8;
const SHEET_DIRS: Dir[] = ["down", "right", "up"];

// Load .env
try {
  const envContent = readFileSync(resolve(ROOT, ".env"), "utf-8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

// =============================================================== DrawSurface (Node)

class Sheet implements DrawSurface {
  png: PNG;
  clip: { x: number; y: number; w: number; h: number } | null = null;
  texProvider: undefined;

  constructor(public w: number, public h: number) {
    this.png = new PNG({ width: w, height: h });
  }

  get width() { return this.w; }
  get height() { return this.h; }

  private inClip(x: number, y: number) {
    if (!this.clip) return true;
    return x >= this.clip.x && x < this.clip.x + this.clip.w && y >= this.clip.y && y < this.clip.y + this.clip.h;
  }

  set(x: number, y: number, hex: string) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (!this.inClip(x, y)) return;
    const i = (y * this.w + x) * 4;
    const d = this.png.data;
    d[i] = parseInt(hex.slice(1, 3), 16);
    d[i + 1] = parseInt(hex.slice(3, 5), 16);
    d[i + 2] = parseInt(hex.slice(5, 7), 16);
    d[i + 3] = 255;
  }

  setAlpha(x: number, y: number, hex: string, a: number) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (!this.inClip(x, y)) return;
    const i = (y * this.w + x) * 4;
    const d = this.png.data;
    d[i] = Math.round(d[i] * (1 - a) + parseInt(hex.slice(1, 3), 16) * a);
    d[i + 1] = Math.round(d[i + 1] * (1 - a) + parseInt(hex.slice(3, 5), 16) * a);
    d[i + 2] = Math.round(d[i + 2] * (1 - a) + parseInt(hex.slice(5, 7), 16) * a);
  }

  rect(x: number, y: number, w: number, h: number, hex: string) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex);
  }

  fillCircle(cx: number, cy: number, r: number, hex: string) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    if (r <= 0) { this.set(cx, cy, hex); return; }
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      this.rect(cx - w, cy + y, w * 2 + 1, 1, hex);
    }
  }

  fillCircleAlpha(cx: number, cy: number, r: number, hex: string, a: number) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    if (r <= 0) { this.setAlpha(cx, cy, hex, a); return; }
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -w; x <= w; x++) this.setAlpha(cx + x, cy + y, hex, a);
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, hex: string) {
    cx = Math.round(cx); cy = Math.round(cy); rx = Math.round(rx); ry = Math.round(ry);
    if (rx <= 0 || ry <= 0) { this.set(cx, cy, hex); return; }
    for (let y = -ry; y <= ry; y++) {
      const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      this.rect(cx - w, cy + y, w * 2 + 1, 1, hex);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, hex: string) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
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

  lineThick(x0: number, y0: number, x1: number, y1: number, hex: string, thick: number) {
    const half = Math.floor(thick / 2);
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
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

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, hex: string) {
    const pts = [[x0, y0], [x1, y1], [x2, y2]].sort((a, b) => a[1] - b[1]);
    const [ax, ay] = pts[0], [bx, by] = pts[1], [cx, cy] = pts[2];
    const totalH = cy - ay;
    if (totalH === 0) { this.set(ax, ay, hex); return; }
    for (let y = ay; y <= cy; y++) {
      const t1 = (y - ay) / totalH;
      const t2 = y < by ? (y - ay) / (by - ay || 1) : (y - by) / (cy - by || 1);
      const lx = Math.round(ax + (cx - ax) * t1);
      const rx2 = y < by ? Math.round(ax + (bx - ax) * t2) : Math.round(bx + (cx - bx) * t2);
      this.rect(Math.min(lx, rx2), y, Math.abs(rx2 - lx) + 1, 1, hex);
    }
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, r: number, hex: string) {
    r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
    this.rect(x + r, y, w - 2 * r, h, hex);
    this.rect(x, y + r, w, h - 2 * r, hex);
    this.fillCircle(x + r, y + r, r, hex);
    this.fillCircle(x + w - r - 1, y + r, r, hex);
    this.fillCircle(x + r, y + h - r - 1, r, hex);
    this.fillCircle(x + w - r - 1, y + h - r - 1, r, hex);
  }

  flipH(x: number, y: number, w: number, h: number) {
    const d = this.png.data;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = 0; xx < Math.floor(w / 2); xx++) {
        const a = (yy * this.w + x + xx) * 4;
        const b = (yy * this.w + x + w - 1 - xx) * 4;
        for (let c = 0; c < 4; c++) { const t = d[a + c]; d[a + c] = d[b + c]; d[b + c] = t; }
      }
    }
  }

  toBuffer(): Buffer { return PNG.sync.write(this.png); }
}

// =============================================================== hair definitions

interface HairDef {
  key: string;
  desc: string;
  seed: number;
}

const HAIR_DESCRIPTIONS: Record<string, string> = {
  short: "short neat hair with subtle waves and a side part",
  spiky: "spiky punk hair with sharp pointed strands sticking up",
  long: "long flowing hair past the shoulders, smooth and straight",
  ponytail: "hair tied in a ponytail. When viewed from the front (down), the tail hangs on the RIGHT side of the head. When viewed from the side (right), the tail hangs BEHIND the head on the LEFT side of the frame. When viewed from behind (up), the tail hangs on the RIGHT side. The tail is a distinct strand hanging down from the top of the head",
  buzz: "buzz cut, very short cropped hair close to the scalp",
  swept: "swept side hair with a dramatic side part and fringe",
  curly: "voluminous curly hair with rounded bouncy curls",
  bun: "hair tied in a neat top bun knot on the crown",
  balding: "thinning balding hair with side remnants and receding hairline",
  mohawk: "tall mohawk stripe of hair down the center of the head. When viewed from the front (down), the mohawk is a vertical stripe going straight up from the top of the head. When viewed from the side (right), the mohawk is a horizontal ridge along the top of the head going from front to back. When viewed from behind (up), the mohawk is a vertical stripe in the center",
  afro: "round fluffy afro, full and rounded all around the head",
  braids: "hair styled in long braids with visible plait details",
  pigtails: "hair in twin pigtails, one on each side of the head",
  bob: "bob cut hair framing the face, ending at the jawline",
  dreadlocks: "hair in long dreadlock strands hanging down",
};

const HAIR_DEFS: HairDef[] = HAIR_STYLES
  .filter((s) => s !== "bald")
  .map((style, i) => ({
    key: style,
    desc: HAIR_DESCRIPTIONS[style] ?? style,
    seed: 6000 + i,
  }));

// =============================================================== green palette

function greenPalette(hairStyle: string): CharPalette {
  return {
    skin: "#00ff00",
    hair: "#ffffff",
    shirt: "#00ff00",
    shirtShade: "#00cc00",
    pants: "#00ff00",
    eyeColor: "#00ff00",
    hairStyle,
    accessory: "none",
    headFeature: "none",
    beard: "none",
  };
}

// =============================================================== sheet builder

function buildComponentSheet(pal: CharPalette): Sheet {
  const s = new Sheet(CW * SHEET_COLS, CH * SHEET_DIRS.length);
  SHEET_DIRS.forEach((dir, row) => {
    for (let pose = 0; pose < SHEET_COLS; pose++) {
      drawChar(s, pose * CW, row * CH, pal, dir, pose);
    }
  });
  return s;
}

// =============================================================== extraction

/**
 * Remove green-dominant pixels (body) and convert remaining pixels
 * (hair) to grayscale for runtime color tinting. Single pass.
 */
async function extractHairComponent(input: Buffer): Promise<Buffer> {
  const image = sharp(input);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Skip already-transparent pixels
    if (a === 0) continue;

    // If green is dominant by 30+ points → body → transparent
    if (g > r + 30 && g > b + 30) {
      data[i + 3] = 0;
      continue;
    }

    // Convert to grayscale (luminance formula)
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    // Remove dark noise artifacts — hair is white/light gray, not black
    // Anything darker than 100 is AI background noise, not hair
    if (gray < 100) {
      data[i + 3] = 0;
      continue;
    }

    // Remove semi-transparent noise at edges (alpha < 128 is likely artifact)
    if (a < 128) {
      data[i + 3] = 0;
      continue;
    }

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  }).png().toBuffer();
}

/**
 * Slice a grid image into individual frames, resizing each to CW×CH.
 * Uses uniform slicing (the AI grid layout is regular).
 */
async function sliceCharGrid(input: Buffer, cols: number, rows: number): Promise<Buffer[]> {
  const meta = await sharp(input).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const cellW = Math.floor(w / cols);
  const cellH = Math.floor(h / rows);

  const frames: Buffer[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const frame = await sharp(input)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .resize(CW, CH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      frames.push(frame);
    }
  }
  return frames;
}

// =============================================================== prompt builder

function buildHairPrompt(desc: string): string {
  return `Enhance this pixel art character sprite sheet. The sheet has 8 columns (animation poses, left to right) and 3 rows (top=facing forward/down, middle=facing right, bottom=facing away/up). Each grid cell is one character frame.

CRITICAL INSTRUCTIONS:
- Keep the EXACT same grid layout, frame positions, and character proportions
- The character's body, skin, face, and clothes are colored bright GREEN (#00ff00) — you MUST keep them green, do not change the body color at all
- Only enhance the WHITE hair: add detailed strands, shading, highlights, texture, and depth to the hair
- The hair style is: ${desc}
- Keep the hair in the EXACT same position and shape as the reference — the white hair pixels in the reference show where hair should be, do not move or mirror the hair to a different position
- Do not add any new elements, accessories, or change the hair style
- Do not add dark outlines around the hair edges — use smooth shading only
- Use a clean pixel art style with proper shading
- The background must be solid flat white`;
}

// =============================================================== pipeline

function parseArgs(): { filter?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let filter: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--filter" && args[i + 1]) filter = args[i + 1];
    if (args[i] === "--dry-run") dryRun = true;
  }
  return { filter, dryRun };
}

async function processHair(def: HairDef, dryRun: boolean): Promise<void> {
  const frameDir = join(OUT_DIR, def.key);
  const allExist = SHEET_DIRS.every((dir) =>
    Array.from({ length: SHEET_COLS }, (_, p) =>
      existsSync(join(frameDir, `${def.key}_${dir}_${p}.png`))
    ).every(Boolean)
  );

  if (allExist) {
    console.log(`  [SKIP] ${def.key} — all 24 frames already exist`);
    return;
  }

  if (dryRun) {
    console.log(`  [DRY]  ${def.key} — would generate 24 frames (seed ${def.seed})`);
    return;
  }

  console.log(`  [GEN]  ${def.key} — rendering reference sheet...`);

  // 1. Render procedural sheet with green body + white hair
  const pal = greenPalette(def.key);
  const sheet = buildComponentSheet(pal);
  const sheetBuf = sheet.toBuffer();

  // 2. Upscale to 1024×576 (nearest-neighbor for pixel art)
  const upscaled = await sharp(sheetBuf)
    .resize(1024, 576, { fit: "fill", kernel: "nearest" })
    .png()
    .toBuffer();

  // 3. Upload to fal.ai
  const refUrl = await uploadToFal(upscaled, `hair_${def.key}.png`);
  console.log(`         uploaded reference: ${refUrl}`);

  // 4. Generate enhanced version via Nano Banana 2 Edit
  const prompt = buildHairPrompt(def.desc);
  const result = await nanoBanana2Edit(prompt, [refUrl], {
    seed: def.seed,
    aspectRatio: "16:9",
    resolution: "1K",
  });
  console.log(`         generated: ${result.url} (${result.width}×${result.height})`);

  // 5. Remove background via Bria RMBG
  const rmbgUrl = await removeBackground(result.url);
  const transparentBuf = await downloadUrl(rmbgUrl);
  console.log(`         background removed`);

  // 6. Slice 8×3 grid into 24 frames
  const frames = await sliceCharGrid(transparentBuf, SHEET_COLS, SHEET_DIRS.length);
  console.log(`         sliced into ${frames.length} frames`);

  // 7. Extract hair (remove green body) + convert to grayscale
  for (let i = 0; i < frames.length; i++) {
    const dir = SHEET_DIRS[Math.floor(i / SHEET_COLS)];
    const pose = i % SHEET_COLS;
    const hairFrame = await extractHairComponent(frames[i]);
    const outPath = join(frameDir, `${def.key}_${dir}_${pose}.png`);
    saveBuffer(outPath, hairFrame);
  }
  console.log(`         saved 24 frames to ${frameDir}`);
}

// =============================================================== main

async function main() {
  const { filter, dryRun } = parseArgs();

  let defs = HAIR_DEFS;
  if (filter) {
    defs = defs.filter((d) => d.key.includes(filter));
  }

  console.log(`\nAI Character Component Generator — Hair`);
  console.log(`  ${defs.length} hair style(s) to process${filter ? ` (filter: "${filter}")` : ""}${dryRun ? " [DRY RUN]" : ""}\n`);

  for (const def of defs) {
    try {
      await processHair(def, dryRun);
    } catch (err) {
      console.error(`  [FAIL] ${def.key}: ${err}`);
    }
  }

  console.log(`\nDone! ${defs.length} hair style(s) processed.`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
