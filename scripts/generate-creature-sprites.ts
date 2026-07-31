/**
 * Creature Sprite Sheet Generator
 *
 * Generates 4-frame animation sprite sheets (2×2 grid) for all creatures,
 * beasts, and friendly creatures using Nano Banana 2 Edit (image-to-image).
 *
 * Pipeline per creature:
 *   1. Load existing creature image from client/public/assets/ai/furniture/
 *   2. Upload to fal.ai storage
 *   3. Call nano-banana-2/edit with the creature as reference + grid prompt
 *   4. Remove background via Bria RMBG
 *   5. Slice 2×2 grid into 4 individual frame PNGs (content-aware)
 *   6. Save as <creature_key>_0.png, _1.png, _2.png, _3.png
 *
 * Frame layout (2×2 grid, row-major):
 *   Frame 0 (top-left):     idle — resting/breathing pose
 *   Frame 1 (top-right):    walk1 — mid-stride
 *   Frame 2 (bottom-left):  walk2 — opposite stride
 *   Frame 3 (bottom-right): attack — aggressive pose
 *
 * Usage:
 *   pnpm tsx scripts/generate-creature-sprites.ts                    # generate all
 *   pnpm tsx scripts/generate-creature-sprites.ts --filter slime       # filter by name
 *   pnpm tsx scripts/generate-creature-sprites.ts --dry-run           # list without generating
 *
 * Requires FAL_KEY environment variable.
 * Output: client/public/assets/ai/furniture/ (per-frame PNGs)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  nanoBanana2Edit,
  removeBackground,
  downloadUrl,
} from "./lib/fal-client.js";

import {
  sliceGrid,
  saveBuffer,
  uploadToFal,
} from "./lib/post-process.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AI_DIR = join(ROOT, "client", "public", "assets", "ai", "furniture");
const FRAME_SIZE = 128;

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
  /** Base key (matches existing furniture/ PNG name, without _0/_1 suffix) */
  key: string;
  /** Short description for the prompt */
  desc: string;
  /** Seed for generation consistency */
  seed: number;
}

const CREATURES: CreatureDef[] = [
  // Hostile creatures
  { key: "creature_slime", desc: "a green gelatinous slime blob monster with translucent body, visible internal nucleus, red eyes", seed: 5001 },
  { key: "creature_wolf", desc: "a grey dire wolf monster with glowing red eyes, snarling fangs, bristled fur", seed: 5002 },
  { key: "creature_skeleton", desc: "an undead skeleton warrior with bone body, holding a rusted sword, glowing eye sockets", seed: 5003 },
  { key: "creature_imp", desc: "a small red imp demon with horns, leathery wings, mischievous grin, glowing yellow eyes", seed: 5004 },
  { key: "creature_wraith", desc: "a dark shadowy wraith ghost with tattered hooded cloak, glowing purple eyes, ethereal misty body", seed: 5005 },
  { key: "creature_fire_elemental", desc: "a fire elemental made of living flame, glowing orange-red body with ember particles, fiery aura", seed: 5006 },
  // Beasts (bosses)
  { key: "beast_groveheart", desc: "an ancient treant boss with gnarled bark body, living leaf canopy, root-like claw arms, glowing green eyes, massive", seed: 5007 },
  { key: "beast_stone_colossus", desc: "a massive stone colossus boss with rocky body, crystalline veins, glowing blue eyes, ancient runes", seed: 5008 },
  { key: "beast_ash_wyrm", desc: "a fiery ash wyrm dragon boss with charcoal scales, glowing magma cracks, ember wings", seed: 5009 },
  { key: "beast_void_leviathan", desc: "a void leviathan boss with dark purple body, tentacles, glowing void eyes, cosmic energy", seed: 5010 },
  { key: "beast_infernal_sovereign", desc: "an infernal sovereign boss with flaming crown, dark armor, lava cracks, demonic horns", seed: 5011 },
  // Friendly creatures
  { key: "friendly_unicorn", desc: "a white unicorn with golden horn, pastel rainbow mane and tail, gentle eyes", seed: 5012 },
  { key: "friendly_fairy_bunny", desc: "a cute fairy bunny with translucent wings, soft pink fur, glowing sparkles", seed: 5013 },
  { key: "friendly_baby_dragon", desc: "a baby dragon with small wings, teal scales, big eyes, friendly expression", seed: 5014 },
  { key: "friendly_crystal_fox", desc: "a crystal fox with translucent crystalline body, blue-white crystal fur, glowing eyes", seed: 5015 },
];

// =============================================================== prompt builder

function buildSpriteSheetPrompt(desc: string): string {
  return `Create a 4-frame sprite sheet animation of ${desc}. Arrange the 4 frames in a 2x2 grid on a plain white background. Each frame shows the creature at a different phase of movement:

Frame 1 (top-left): Idle resting pose — the creature standing still, relaxed, subtle breathing.
Frame 2 (top-right): Mid-walk stride — the creature in motion, limbs mid-stride, body slightly leaning forward.
Frame 3 (bottom-left): Opposite walk stride — the creature in the opposite stride position, limbs reversed.
Frame 4 (bottom-right): Attack pose — the creature lunging or striking aggressively, fangs/claws extended, dynamic action pose.

CRITICAL: Keep the exact same creature design, colors, proportions, and art style in ALL 4 frames. The creature must be centered within each grid cell. Use a clean game sprite art style with proper shading and highlights. No text, no labels. The background must be solid flat white with no gradients or shadows.`;
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

async function processCreature(creature: CreatureDef, dryRun: boolean): Promise<void> {
  const sourcePath = join(AI_DIR, `${creature.key}.png`);
  const framePaths = [0, 1, 2, 3].map((i) => join(AI_DIR, `${creature.key}_${i}.png`));

  // Skip if all 4 frames already exist
  if (framePaths.every((p) => existsSync(p))) {
    console.log(`  [SKIP] ${creature.key} — all 4 frames already exist`);
    return;
  }

  if (!existsSync(sourcePath)) {
    console.error(`  [ERROR] ${creature.key} — source image not found: ${sourcePath}`);
    return;
  }

  if (dryRun) {
    console.log(`  [DRY] ${creature.key} — would generate 4 frames from ${sourcePath}`);
    return;
  }

  console.log(`  [GEN]  ${creature.key} — generating sprite sheet...`);

  // 1. Load and upload source image
  const sourceBuf = readFileSync(sourcePath);
  const refUrl = await uploadToFal(sourceBuf, `${creature.key}.png`);
  console.log(`         uploaded reference: ${refUrl}`);

  // 2. Generate 2×2 grid sprite sheet via Nano Banana 2 Edit
  const prompt = buildSpriteSheetPrompt(creature.desc);
  const result = await nanoBanana2Edit(prompt, [refUrl], {
    seed: creature.seed,
    aspectRatio: "1:1",
    resolution: "1K",
  });
  console.log(`         generated grid: ${result.url} (${result.width}×${result.height})`);

  // 3. Download grid image
  const gridBuf = await downloadUrl(result.url);

  // 4. Remove background via Bria
  const rmbgUrl = await removeBackground(result.url);
  const transparentBuf = await downloadUrl(rmbgUrl);
  console.log(`         background removed`);

  // 5. Slice 2×2 grid into 4 frames
  const frames = await sliceGrid(transparentBuf, 2, 2, FRAME_SIZE);
  console.log(`         sliced into ${frames.length} frames`);

  // 6. Save individual frames
  for (let i = 0; i < frames.length; i++) {
    saveBuffer(framePaths[i], frames[i]);
    console.log(`         saved: ${creature.key}_${i}.png`);
  }
}

async function main() {
  const { filter, dryRun } = parseArgs();

  let creatures = CREATURES;
  if (filter) {
    creatures = creatures.filter((c) => c.key.includes(filter));
  }

  console.log(`\nCreature Sprite Sheet Generator`);
  console.log(`  ${creatures.length} creature(s) to process${filter ? ` (filter: "${filter}")` : ""}${dryRun ? " [DRY RUN]" : ""}\n`);

  for (const creature of creatures) {
    try {
      await processCreature(creature, dryRun);
    } catch (err) {
      console.error(`  [FAIL] ${creature.key}: ${err}`);
    }
  }

  console.log(`\nDone! ${creatures.length} creature(s) processed.`);
  console.log(`Next: run "pnpm pack-atlas" to rebuild the sprite atlas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
