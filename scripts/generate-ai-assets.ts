/**
 * AI Asset Pipeline for Agent Heights.
 *
 * Generates tileable PBR surface textures using fal.ai PATINA Material.
 * Sprites, furniture, trees, and UI remain procedurally generated.
 *
 * Usage:
 *   pnpm tsx scripts/generate-ai-assets.ts                    # generate all
 *   pnpm tsx scripts/generate-ai-assets.ts --filter grass     # filter by name
 *   pnpm tsx scripts/generate-ai-assets.ts --tier 1           # only tier 1
 *   pnpm tsx scripts/generate-ai-assets.ts --dry-run          # list assets without generating
 *
 * Requires FAL_KEY environment variable.
 * Output: client/public/assets/ai/ + manifest.json
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { readFileSync as readEnv } from "node:fs";
import { resolve } from "node:path";

import {
  patinaMaterial,
  downloadUrl,
} from "./lib/fal-client.js";

import {
  resizeToWebP,
  saveBuffer,
} from "./lib/post-process.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "client", "public", "assets", "ai");

// Load .env manually (avoid dotenv dependency)
try {
  const envPath = resolve(ROOT, ".env");
  const envContent = readEnv(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env not found — rely on existing env vars
}

// =================================================================== types

type Model = "patina-material";

interface AssetDef {
  /** Unique key, e.g. "grass_0", "desk_left", "health_icon". */
  key: string;
  /** Category folder: tiles, office, furniture, ui, backgrounds. */
  category: string;
  /** Which generation model to use. */
  model: Model;
  /** Text prompt for the model. */
  prompt: string;
  /** Output size in pixels (for rasterized sprites/tiles). */
  size: number;
  /** Whether to extract PBR maps (normal, roughness, metalness). */
  pbr: boolean;
  /** Seed for reproducible generation. */
  seed?: number;
  /** Tier number for filtering (1-5). */
  tier: 1 | 2 | 3 | 4 | 5;
}

interface ManifestEntry {
  key: string;
  category: string;
  model: string;
  files: { [name: string]: string };
  size: number;
  hasPBR: boolean;
  hasSvg: boolean;
}

// ============================================================ asset catalog

// Helper to create tileable surface assets (PATINA Material)
function tile(
  key: string,
  prompt: string,
  seed: number,
  tier: 1 | 2 = 1,
  size = 64,
): AssetDef {
  return { key, category: "tiles", model: "patina-material", prompt, size, pbr: true, seed, tier };
}

// ----------------------------------------------------------- Tier 1: World tiles

const ASSETS: AssetDef[] = [
  // --- Tileable surfaces (PATINA Material) ---
  tile("grass_0", "lush green grass, lawn, slight height variation, natural, top-down", 1001),
  tile("grass_1", "lush green grass, lawn with small clover patches, natural, top-down", 1002),
  tile("grass_2", "green grass, slightly dry patches, natural meadow, top-down", 1003),
  tile("grass_3", "thick green grass, manicured lawn, top-down", 1004),
  tile("path_0", "cracked earth path, dry dirt, scattered pebbles, top-down", 1005),
  tile("path_1", "dirt path with small stones, worn, top-down", 1006),
  tile("path_2", "gravel path, mixed gray pebbles, top-down", 1007),
  tile("path_3", "muddy dirt path, wet earth, top-down", 1008),
  tile("sand_0", "fine golden sand, desert dune surface, top-down", 1009),
  tile("sand_1", "coarse sand with small shells, beach, top-down", 1010),
  tile("sand_2", "wind-rippled sand, desert, top-down", 1011),
  tile("sand_3", "wet packed sand, shoreline, top-down", 1012),
  tile("snow_0", "fresh white snow, smooth surface, sparkle detail, top-down", 1013),
  tile("snow_1", "packed snow with footprints, top-down", 1014),
  tile("snow_2", "icy snow crust, blue-white, top-down", 1015),
  tile("snow_3", "snow with small rocks poking through, top-down", 1016),
  tile("wall_0", "dark red brick wall, mortared, weathered, top-down", 1017),
  tile("wall_1", "gray concrete wall, smooth, top-down", 1018),
  tile("wall_2", "stone wall, cobblestone, top-down", 1019),
  tile("wall_3", "white plaster wall, cracked, top-down", 1020),
  tile("water_0", "clear blue water, gentle ripples, top-down", 1021),
  tile("water_1", "blue water, moderate waves, top-down", 1022),
  tile("water_2", "blue water, choppier waves, top-down", 1023),
  tile("lava_0", "glowing orange molten lava, cracked crust, top-down", 1024),
  tile("lava_1", "molten lava, dark crust with bright veins, top-down", 1025),
  tile("lava_2", "cooling lava, dark with red glow, top-down", 1026),
  tile("lava_3", "bubbling lava, bright orange, top-down", 1027),
  tile("acid_0", "toxic green acid pool, bubbling, top-down", 1028),
  tile("acid_1", "acidic green liquid, corrosive, top-down", 1029),
  tile("acid_2", "thick green acid, viscous, top-down", 1030),
  tile("acid_3", "acid with yellow crust, top-down", 1031),
  tile("void_0", "dark void tear, purple-black energy, top-down", 1032),
  tile("void_1", "void rift, dark purple swirl, top-down", 1033),
  tile("void_2", "void crack, black with purple edges, top-down", 1034),
  tile("void_3", "void portal, deep purple, top-down", 1035),
  tile("ruin_0", "crumbling gray stone, ancient ruin, top-down", 1036),
  tile("ruin_1", "mossy ruined stone, cracked, top-down", 1037),
  tile("ruin_2", "broken stone tiles, ancient, top-down", 1038),
  tile("ruin_3", "weathered stone blocks, fallen, top-down", 1039),
  tile("castle_0", "cut gray stone block, castle wall, top-down", 1040),
  tile("castle_1", "polished stone block, fortress, top-down", 1041),
  tile("castle_2", "stone block with mortar, castle, top-down", 1042),
  tile("castle_3", "weathered stone block, ancient fortress, top-down", 1043),
  tile("fairway_0", "smooth manicured grass, golf fairway, top-down", 1044),
  tile("fairway_1", "golf fairway grass, short and even, top-down", 1045),
  tile("fairway_2", "fairway grass with slight grain, top-down", 1046),
  tile("fairway_3", "fairway grass, dewy, top-down", 1047),
  tile("sand_trap_0", "loose white sand, golf bunker, top-down", 1048),
  tile("sand_trap_1", "soft sand, golf sand trap, top-down", 1049),
  tile("sand_trap_2", "raked sand, bunker, top-down", 1050),
  tile("sand_trap_3", "compact sand, sand trap, top-down", 1051),
  tile("pond_0", "still dark water, pond surface, top-down", 1052),
  tile("pond_1", "pond water with lily pads, top-down", 1053),
  tile("pond_2", "murky pond water, top-down", 1054),
  tile("pond_3", "clear pond water, shallow, top-down", 1055),
  tile("hedge_0", "trimmed green hedge, top-down", 1056),
  tile("hedge_1", "manicured hedge, dense leaves, top-down", 1057),
  tile("hedge_2", "hedge with small flowers, top-down", 1058),
  tile("hedge_3", "overgrown hedge, top-down", 1059),
  tile("rock_0", "gray granite boulder surface, rough, top-down", 1060),
  tile("rock_1", "weathered stone surface, top-down", 1061),
  tile("rock_2", "mossy rock surface, top-down", 1062),
  tile("rock_3", "cracked stone surface, top-down", 1063),


  // ------------------------------------------------------- Tier 2: Office tiles

  // Tileable office surfaces (PATINA Material)
  tile("office_floor_0", "gray office carpet, commercial, top-down", 1101, 2),
  tile("office_floor_1", "dark blue office carpet, top-down", 1102, 2),
  tile("office_floor_2", "light oak wood planks, office floor, laminated, top-down", 1103, 2),
  tile("office_floor_3", "polished concrete floor, office, top-down", 1104, 2),
  tile("office_wall_0", "white office wall, smooth painted drywall, top-down", 1105, 2),
  tile("office_wall_1", "light gray office wall, painted, top-down", 1106, 2),
  tile("office_wall_2", "beige office wall, painted, top-down", 1107, 2),
  tile("office_wall_3", "blue accent wall, office, top-down", 1108, 2),
  tile("kitchen_counter", "granite countertop, black speckled, top-down", 1109, 2),

];

// =============================================================== pipeline

function parseArgs(): { filter?: string; tier?: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let filter: string | undefined;
  let tier: number | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--filter" && args[i + 1]) filter = args[i + 1];
    if (args[i] === "--tier" && args[i + 1]) tier = parseInt(args[i + 1]);
    if (args[i] === "--dry-run") dryRun = true;
  }

  return { filter, tier, dryRun };
}

function getFilteredAssets(args: { filter?: string; tier?: number }): AssetDef[] {
  let assets = ASSETS;
  if (args.filter) {
    assets = assets.filter((a) => a.key.includes(args.filter!));
  }
  if (args.tier) {
    assets = assets.filter((a) => a.tier === args.tier);
  }
  return assets;
}

async function loadManifest(): Promise<ManifestEntry[]> {
  const manifestPath = join(OUT_DIR, "manifest.json");
  if (existsSync(manifestPath)) {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  }
  return [];
}

function saveManifest(entries: ManifestEntry[]): void {
  const manifestPath = join(OUT_DIR, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`\nManifest saved: ${manifestPath} (${entries.length} entries)`);
}

// --------------------------------------------------- per-model generation

async function generatePatinaMaterial(
  asset: AssetDef,
  outDir: string,
): Promise<ManifestEntry> {
  console.log(`  [PATINA Material] ${asset.key}: "${asset.prompt}"`);
  const result = await patinaMaterial(asset.prompt, { seed: asset.seed });
  const files: { [name: string]: string } = {};

  // Download and save each map
  for (const [mapType, url] of Object.entries(result.maps)) {
    const buf = await downloadUrl(url);
    const resized = await resizeToWebP(buf, asset.size, asset.size);
    const filePath = join(outDir, `${asset.key}_${mapType}.webp`);
    saveBuffer(filePath, resized);
    files[mapType] = `${asset.category}/${asset.key}_${mapType}.webp`;
  }

  // Also save the base texture
  if (result.base) {
    const buf = await downloadUrl(result.base);
    const resized = await resizeToWebP(buf, asset.size, asset.size);
    const filePath = join(outDir, `${asset.key}_basecolor.webp`);
    saveBuffer(filePath, resized);
    files["basecolor"] = `${asset.category}/${asset.key}_basecolor.webp`;
  }

  return {
    key: asset.key,
    category: asset.category,
    model: asset.model,
    files,
    size: asset.size,
    hasPBR: true,
    hasSvg: false,
  };
}

// ================================================================ main

async function main() {
  const args = parseArgs();
  const assets = getFilteredAssets(args);

  console.log(`\nAI Asset Pipeline`);
  console.log(`================`);
  console.log(`Assets to process: ${assets.length}`);

  if (args.dryRun) {
    console.log(`\nDry run — listing assets:\n`);
    for (const a of assets) {
      const pbrTag = a.pbr ? " [+PBR]" : "";
      console.log(`  [T${a.tier}] ${a.model.padEnd(16)} ${a.key.padEnd(24)}${pbrTag}`);
    }
    console.log(`\nTotal: ${assets.length} assets`);
    return;
  }

  if (!process.env.FAL_KEY) {
    console.error("ERROR: FAL_KEY environment variable is required.");
    console.error("Get one at https://fal.ai/dashboard/keys and set it in .env");
    process.exit(1);
  }

  // Load existing manifest (skip already-generated assets)
  const existingManifest = await loadManifest();
  const existingKeys = new Set(existingManifest.map((e) => e.key));
  const toGenerate = assets.filter((a) => !existingKeys.has(a.key));
  const skipped = assets.length - toGenerate.length;

  if (skipped > 0) {
    console.log(`Already generated: ${skipped} (skipping)`);
  }
  console.log(`To generate: ${toGenerate.length}\n`);

  const manifest = [...existingManifest];
  let succeeded = 0;
  let failed = 0;

  for (const asset of toGenerate) {
    const outDir = join(OUT_DIR, asset.category);
    const label = `[${succeeded + failed + 1}/${toGenerate.length}]`;

    try {
      console.log(`\n${label} ${asset.key}`);

      const entry = await generatePatinaMaterial(asset, outDir);

      manifest.push(entry);
      succeeded++;
      console.log(`  ✓ Done (${Object.keys(entry.files).length} files)`);
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
    }

    // Save manifest periodically (every 5 assets)
    if ((succeeded + failed) % 5 === 0) {
      saveManifest(manifest);
    }
  }

  // Final manifest save
  saveManifest(manifest);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Complete: ${succeeded} succeeded, ${failed} failed`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Manifest: ${join(OUT_DIR, "manifest.json")}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
