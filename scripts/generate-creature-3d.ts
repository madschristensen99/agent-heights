/**
 * Creature 3D Model Generator
 *
 * Generates 3D GLB models for all creatures, beasts, and friendly creatures
 * using Hunyuan 3D Rapid (image-to-3D) via fal.ai.
 *
 * Pipeline per creature:
 *   1. Load existing creature base image from client/public/assets/ai/furniture/
 *      (falls back to _0.png frame if base doesn't exist)
 *   2. If image has transparent background, composite onto white (Hunyuan expects simple bg)
 *   3. Upload to fal.ai storage
 *   4. Call hunyuan-3d/v3.1/rapid/image-to-3d with enable_pbr=true
 *   5. Download GLB file
 *   6. Save to client/public/assets/ai/models/<creature_key>.glb
 *
 * Usage:
 *   pnpm tsx scripts/generate-creature-3d.ts                    # generate all
 *   pnpm tsx scripts/generate-creature-3d.ts --filter slime      # filter by name
 *   pnpm tsx scripts/generate-creature-3d.ts --dry-run           # list without generating
 *
 * Requires FAL_KEY environment variable.
 * Output: client/public/assets/ai/models/ (GLB files)
 */
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";

import { hunyuan3dRapid, downloadUrl } from "./lib/fal-client.js";
import { saveBuffer, uploadToFal } from "./lib/post-process.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AI_DIR = join(ROOT, "client", "public", "assets", "ai", "furniture");
const MODELS_DIR = join(ROOT, "client", "public", "assets", "ai", "models");

// Load .env manually (avoid dotenv dependency)
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

// =============================================================== creature defs

interface CreatureDef {
  key: string;
  desc: string;
  seed: number;
}

const CREATURES: CreatureDef[] = [
  { key: "creature_slime", desc: "a green gelatinous slime blob monster with translucent body, visible internal nucleus, red eyes", seed: 5001 },
  { key: "creature_wolf", desc: "a grey dire wolf monster with glowing red eyes, snarling fangs, bristled fur", seed: 5002 },
  { key: "creature_skeleton", desc: "an undead skeleton warrior with bone body, holding a rusted sword, glowing eye sockets", seed: 5003 },
  { key: "creature_imp", desc: "a small red imp demon with horns, leathery wings, mischievous grin, glowing yellow eyes", seed: 5004 },
  { key: "creature_wraith", desc: "a dark shadowy wraith ghost with tattered hooded cloak, glowing purple eyes, ethereal misty body", seed: 5005 },
  { key: "creature_fire_elemental", desc: "a fire elemental made of living flame, glowing orange-red body with ember particles, fiery aura", seed: 5006 },
  { key: "beast_groveheart", desc: "an ancient treant boss with gnarled bark body, living leaf canopy, root-like claw arms, glowing green eyes, massive", seed: 5007 },
  { key: "beast_stone_colossus", desc: "a massive stone colossus boss with rocky body, crystalline veins, glowing blue eyes, ancient runes", seed: 5008 },
  { key: "beast_ash_wyrm", desc: "a fiery ash wyrm dragon boss with charcoal scales, glowing magma cracks, ember wings", seed: 5009 },
  { key: "beast_void_leviathan", desc: "a void leviathan boss with dark purple body, tentacles, glowing void eyes, cosmic energy", seed: 5010 },
  { key: "beast_infernal_sovereign", desc: "an infernal sovereign boss with flaming crown, dark armor, lava cracks, demonic horns", seed: 5011 },
  { key: "friendly_unicorn", desc: "a white unicorn with golden horn, pastel rainbow mane and tail, gentle eyes", seed: 5012 },
  { key: "friendly_fairy_bunny", desc: "a cute fairy bunny with translucent wings, soft pink fur, glowing sparkles", seed: 5013 },
  { key: "friendly_baby_dragon", desc: "a baby dragon with small wings, teal scales, big eyes, friendly expression", seed: 5014 },
  { key: "friendly_crystal_fox", desc: "a crystal fox with translucent crystalline body, blue-white crystal fur, glowing eyes", seed: 5015 },
];

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

/**
 * Ensure the source image has a white background (Hunyuan 3D expects simple bg).
 * If the image already has a white background, pass it through.
 * If it has transparency, composite onto white.
 */
async function ensureWhiteBackground(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (meta.hasAlpha) {
    return sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
  }
  return buffer;
}

async function processCreature(creature: CreatureDef, dryRun: boolean): Promise<void> {
  const objPath = join(MODELS_DIR, `${creature.key}.obj`);

  if (existsSync(objPath)) {
    console.log(`  [SKIP] ${creature.key} — OBJ already exists`);
    return;
  }

  // Find source image — prefer base PNG, fall back to frame 0
  const basePath = join(AI_DIR, `${creature.key}.png`);
  const frame0Path = join(AI_DIR, `${creature.key}_0.png`);
  const sourcePath = existsSync(basePath) ? basePath : existsSync(frame0Path) ? frame0Path : null;

  if (!sourcePath) {
    console.error(`  [ERROR] ${creature.key} — no source image found in ${AI_DIR}`);
    return;
  }

  if (dryRun) {
    console.log(`  [DRY]  ${creature.key} — would generate GLB from ${sourcePath}`);
    return;
  }

  console.log(`  [GEN]  ${creature.key} — generating 3D model...`);

  // 1. Load source image and ensure white background
  const sourceBuf = readFileSync(sourcePath);
  const whiteBgBuf = await ensureWhiteBackground(sourceBuf);
  console.log(`         source: ${sourcePath}`);

  // 2. Upload to fal.ai storage
  const imageUrl = await uploadToFal(whiteBgBuf, `${creature.key}.png`);
  console.log(`         uploaded: ${imageUrl}`);

  // 3. Generate 3D model via Hunyuan 3D Rapid
  const result = await hunyuan3dRapid(imageUrl);
  console.log(`         OBJ: ${result.objUrl}`);
  if (result.mtlUrl) console.log(`         MTL: ${result.mtlUrl}`);
  if (result.textureUrl) console.log(`         TEX: ${result.textureUrl}`);

  // 4. Download OBJ, MTL, and texture files
  const objBuf = await downloadUrl(result.objUrl);
  saveBuffer(objPath, objBuf);
  console.log(`         saved: ${objPath} (${(objBuf.length / 1024 / 1024).toFixed(1)} MB)`);

  if (result.mtlUrl) {
    const mtlBuf = await downloadUrl(result.mtlUrl);
    saveBuffer(join(MODELS_DIR, `${creature.key}.mtl`), mtlBuf);
  }
  if (result.textureUrl) {
    const texBuf = await downloadUrl(result.textureUrl);
    saveBuffer(join(MODELS_DIR, `${creature.key}_texture.png`), texBuf);
  }
}

async function main() {
  const { filter, dryRun } = parseArgs();

  let creatures = CREATURES;
  if (filter) {
    creatures = creatures.filter((c) => c.key.includes(filter));
  }

  console.log(`\nCreature 3D Model Generator (Hunyuan 3D Rapid)`);
  console.log(`  ${creatures.length} creature(s) to process${filter ? ` (filter: "${filter}")` : ""}${dryRun ? " [DRY RUN]" : ""}\n`);

  for (const creature of creatures) {
    try {
      await processCreature(creature, dryRun);
    } catch (err) {
      console.error(`  [FAIL] ${creature.key}: ${err}`);
    }
  }

  console.log(`\nDone! ${creatures.length} creature(s) processed.`);
  console.log(`Next: run "pnpm tsx scripts/render-creature-sprites.ts" to render sprite sheets from GLB files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
