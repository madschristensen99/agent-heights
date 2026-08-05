/**
 * Character Component 3D Model Generator
 *
 * Generates 3D OBJ models for individual character components (hair styles,
 * beards, shirts, pants, accessories, head features) using Hunyuan 3D Rapid
 * (image-to-3D) via fal.ai.
 *
 * Pipeline per component:
 *   1. Generate a clean front-view source image via Nano Banana 2 (text-to-image)
 *      — or use an existing 2D component frame if available
 *   2. Composite onto white background (Hunyuan expects simple bg)
 *   3. Upload to fal.ai storage
 *   4. Call hunyuan-3d/v3.1/rapid/image-to-3d with enable_pbr=true
 *   5. Download OBJ + MTL + texture files
 *   6. Save to scripts/assets/component-models/{type}_{style}/
 *
 * Usage:
 *   pnpm tsx scripts/generate-component-3d.ts                         # all components
 *   pnpm tsx scripts/generate-component-3d.ts --component hair         # hair only
 *   pnpm tsx scripts/generate-component-3d.ts --component hair --filter spiky
 *   pnpm tsx scripts/generate-component-3d.ts --dry-run               # list without generating
 *
 * Requires FAL_KEY environment variable.
 * Output: scripts/assets/component-models/ (OBJ + MTL + texture PNG)
 */
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";

import { nanoBanana2, hunyuan3dRapid, downloadUrl } from "./lib/fal-client.js";
import { saveBuffer, uploadToFal } from "./lib/post-process.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AI_CHAR_DIR = join(ROOT, "client", "public", "assets", "ai", "char");
const MODELS_DIR = join(ROOT, "scripts", "assets", "component-models");

// Load .env manually
try {
  const envPath = resolve(ROOT, ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env not found — rely on existing env vars
}

// =============================================================== component defs

type ComponentType = "hair" | "beard" | "shirt" | "pants" | "accessory" | "headFeature";

interface ComponentDef {
  type: ComponentType;
  key: string;
  desc: string;
  seed: number;
}

const HAIR_DESCRIPTIONS: Record<string, string> = {
  short: "short neat hair with subtle waves and a side part",
  spiky: "spiky punk hair with sharp pointed strands sticking up",
  long: "long flowing hair past the shoulders, smooth and straight",
  ponytail: "hair tied in a ponytail with a distinct tail hanging down",
  buzz: "buzz cut, very short cropped hair close to the scalp",
  swept: "swept side hair with a dramatic side part and fringe",
  curly: "voluminous curly hair with rounded bouncy curls",
  bun: "hair tied in a neat top bun knot on the crown of the head",
  balding: "thinning balding hair with side remnants and receding hairline",
  mohawk: "tall mohawk stripe of hair down the center of the head",
  afro: "round fluffy afro, full and rounded all around the head",
  braids: "hair styled in long braids with visible plait details",
  pigtails: "hair in twin pigtails, one on each side of the head",
  bob: "bob cut hair framing the face, ending at the jawline",
  dreadlocks: "hair in long dreadlock strands hanging down",
};

const BEARD_DESCRIPTIONS: Record<string, string> = {
  stubble: "light stubble beard — short facial hair shadow across the jaw and chin",
  mustache: "a neat mustache across the upper lip",
  goatee: "a goatee beard on the chin, small and pointed",
  full_beard: "a full beard covering the jaw, chin, and cheeks with thick facial hair",
};

const ACCESSORY_DESCRIPTIONS: Record<string, string> = {
  glasses: "stylish thick-rimmed glasses with reflective lenses and visible frame detail",
  headband: "a prominent headband with texture and a small decorative knot",
  earrings: "large noticeable hoop earrings with metallic shine and detail",
  cap: "a detailed baseball cap with a curved brim, stitching, and a logo patch",
  beanie: "a cozy knit beanie with visible ribbed texture and a folded cuff",
  headphones: "large over-ear headphones with padded ear cups, a thick headband, and metallic details",
};

const HEAD_FEATURE_DESCRIPTIONS: Record<string, string> = {
  "cat ears": "large pointed cat ears with inner fur detail and shading",
  horns: "sharp pointed tapered horns growing from the top of the head, conical shape widening at the base, with horizontal ridge rings and dark shading",
  antennae: "thin insect antennae with glowing bulbous tips",
  "elf ears": "large pointed elf ears extending outward with inner detail",
};

const HAIR_DEFS: ComponentDef[] = [
  "short", "spiky", "long", "ponytail", "buzz", "swept", "curly", "bun",
  "balding", "mohawk", "afro", "braids", "pigtails", "bob", "dreadlocks",
].filter((s) => s !== "bald").map((style, i) => ({
  type: "hair" as const,
  key: style,
  desc: HAIR_DESCRIPTIONS[style] ?? style,
  seed: 6000 + i,
}));

const BEARD_DEFS: ComponentDef[] = ["stubble", "mustache", "goatee", "full_beard"].map((style, i) => ({
  type: "beard" as const,
  key: style,
  desc: BEARD_DESCRIPTIONS[style] ?? style,
  seed: 7000 + i,
}));

const SHIRT_DEFS: ComponentDef[] = [
  { type: "shirt", key: "default", desc: "a simple collared shirt with buttons, folds, and fabric texture", seed: 8000 },
];

const PANTS_DEFS: ComponentDef[] = [
  { type: "pants", key: "default", desc: "simple trousers with visible folds, creases, and fabric texture", seed: 9000 },
];

const ACCESSORY_DEFS: ComponentDef[] = ["glasses", "headband", "earrings", "cap", "beanie", "headphones"].map((style, i) => ({
  type: "accessory" as const,
  key: style,
  desc: ACCESSORY_DESCRIPTIONS[style] ?? style,
  seed: 10000 + i,
}));

const HEAD_FEATURE_DEFS: ComponentDef[] = ["cat ears", "horns", "antennae", "elf ears"].map((style, i) => ({
  type: "headFeature" as const,
  key: style,
  desc: HEAD_FEATURE_DESCRIPTIONS[style] ?? style,
  seed: 11000 + i,
}));

const ALL_DEFS: ComponentDef[] = [...HAIR_DEFS, ...BEARD_DEFS, ...SHIRT_DEFS, ...PANTS_DEFS, ...ACCESSORY_DEFS, ...HEAD_FEATURE_DEFS];

// =============================================================== pipeline

function parseArgs(): { component?: ComponentType; filter?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let component: ComponentType | undefined;
  let filter: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--component" && args[i + 1]) component = args[i + 1] as ComponentType;
    if (args[i] === "--filter" && args[i + 1]) filter = args[i + 1];
    if (args[i] === "--dry-run") dryRun = true;
  }
  return { component, filter, dryRun };
}

function modelDir(def: ComponentDef): string {
  const safeKey = def.key.replace(/ /g, "_");
  return join(MODELS_DIR, `${def.type}_${safeKey}`);
}

function objPath(def: ComponentDef): string {
  return join(modelDir(def), "model.obj");
}

/**
 * Try to find an existing 2D component frame to use as source image.
 * Checks client/public/assets/ai/char/{type}/{style}/{style}_down_0.png
 */
function existingSourceImage(def: ComponentDef): string | null {
  const safeKey = def.key.replace(/ /g, "_");
  const path = join(AI_CHAR_DIR, def.type, safeKey, `${safeKey}_down_0.png`);
  return existsSync(path) ? path : null;
}

/**
 * Build a text-to-image prompt for generating a clean source image of a component.
 */
function buildSourcePrompt(def: ComponentDef): string {
  const componentName =
    def.type === "hair" ? "hairstyle" :
    def.type === "beard" ? "facial hair / beard" :
    def.type === "shirt" ? "shirt / clothing on the torso" :
    def.type === "pants" ? "pants / trousers on the legs" :
    def.type === "accessory" ? "accessory (glasses, headband, cap, etc.)" :
    "head feature (ears, horns, antennae, etc.)";

  return `A single ${def.desc} (${componentName}), isolated on a plain white background, front view, centered, game asset style with clean shading and highlights, no character body, no face, just the ${componentName} itself. High quality 3D-rendered look with proper lighting.`;
}

/**
 * Ensure the source image has a white background and is large enough for
 * Hunyuan 3D. If the image has transparency, composite onto white.
 * If the image is smaller than 512px on either side, upscale to 512×512.
 */
async function ensureWhiteBackground(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  let img = sharp(buffer);

  // Composite onto white if transparent
  if (meta.hasAlpha) {
    img = img.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  // Upscale if too small (Hunyuan 3D rejects tiny inputs)
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 512 || h < 512) {
    const targetW = Math.max(512, w * 8);
    const targetH = Math.max(512, h * 8);
    img = img.resize(targetW, targetH, { fit: "contain", background: { r: 255, g: 255, b: 255 } });
  }

  return img.png().toBuffer();
}

async function processComponent(def: ComponentDef, dryRun: boolean): Promise<void> {
  const dir = modelDir(def);
  const obj = objPath(def);

  if (existsSync(obj)) {
    console.log(`  [SKIP] ${def.type}/${def.key} — OBJ already exists`);
    return;
  }

  if (dryRun) {
    console.log(`  [DRY]  ${def.type}/${def.key} — would generate 3D model (seed ${def.seed})`);
    return;
  }

  console.log(`  [GEN]  ${def.type}/${def.key} — generating 3D model...`);

  // 1. Generate a clean source image via Nano Banana 2
  //    (existing 2D component frames are grayscale on transparent — they become
  //    invisible when composited onto white, so we can't use them as 3D input)
  console.log(`         generating source image via Nano Banana 2...`);
  const prompt = buildSourcePrompt(def);
  const imgResult = await nanoBanana2(prompt, { seed: def.seed, imageSize: "1024x1024" });
  const sourceBuf = await downloadUrl(imgResult.url);
  console.log(`         generated: ${imgResult.url} (${imgResult.width}×${imgResult.height})`);

  // 2. Ensure white background
  const whiteBgBuf = await ensureWhiteBackground(sourceBuf);

  // 3. Upload to fal.ai storage
  const imageUrl = await uploadToFal(whiteBgBuf, `component_${def.type}_${def.key}.png`);
  console.log(`         uploaded: ${imageUrl}`);

  // 4. Generate 3D model via Hunyuan 3D Rapid
  const model3d = await hunyuan3dRapid(imageUrl, { enablePbr: false });
  console.log(`         OBJ: ${model3d.objUrl}`);
  if (model3d.mtlUrl) console.log(`         MTL: ${model3d.mtlUrl}`);
  if (model3d.textureUrl) console.log(`         TEX: ${model3d.textureUrl}`);

  // 5. Download OBJ, MTL, and texture files
  const objBuf = await downloadUrl(model3d.objUrl);
  saveBuffer(obj, objBuf);
  console.log(`         saved OBJ: ${obj} (${(objBuf.length / 1024 / 1024).toFixed(1)} MB)`);

  if (model3d.mtlUrl) {
    const mtlBuf = await downloadUrl(model3d.mtlUrl);
    saveBuffer(join(dir, "model.mtl"), mtlBuf);
  }
  if (model3d.textureUrl) {
    const texBuf = await downloadUrl(model3d.textureUrl);
    saveBuffer(join(dir, "texture.png"), texBuf);
  }
}

async function main() {
  const { component, filter, dryRun } = parseArgs();

  let defs = ALL_DEFS;
  if (component) {
    defs = defs.filter((d) => d.type === component);
  }
  if (filter) {
    defs = defs.filter((d) => d.key.includes(filter));
  }

  const label = component ? `${component}` : "all components";
  console.log(`\nCharacter Component 3D Model Generator (Hunyuan 3D Rapid)`);
  console.log(`  ${defs.length} component(s) to process${filter ? ` (filter: "${filter}")` : ""}${dryRun ? " [DRY RUN]" : ""}\n`);

  for (const def of defs) {
    try {
      await processComponent(def, dryRun);
    } catch (err) {
      console.error(`  [FAIL] ${def.type}/${def.key}: ${err}`);
    }
  }

  console.log(`\nDone! ${defs.length} component(s) processed.`);
  console.log(`Next: run "pnpm tsx scripts/render-component-sprites.ts" to render sprite frames from 3D models.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
