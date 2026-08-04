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
  nanoBanana2,
  removeBackground,
  downloadUrl,
} from "./lib/fal-client.js";

import {
  resizeToWebP,
  resizeToPNG,
  resizeSquarePNG,
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

type Model = "patina-material" | "nano-banana-2" | "nano-banana-2-no-rmbg";

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
  /** Tier number for filtering (1-6). */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
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
  tier: 1 | 2 | 6 = 1,
  size = 256,
): AssetDef {
  return { key, category: "tiles", model: "patina-material", prompt, size, pbr: true, seed, tier };
}

// Helper to create world object sprite assets (Nano Banana 2 + Bria RMBG)
function object(
  key: string,
  prompt: string,
  seed: number,
  size = 128,
): AssetDef {
  return { key, category: "objects", model: "nano-banana-2", prompt, size, pbr: false, seed, tier: 1 };
}

// Helper to create furniture sprite assets (Nano Banana 2 + Bria RMBG, tier 3)
function furniture(
  key: string,
  prompt: string,
  seed: number,
  size = 128,
): AssetDef {
  return { key, category: "furniture", model: "nano-banana-2", prompt, size, pbr: false, seed, tier: 3 };
}

// Helper to create item/prop sprite assets (Nano Banana 2 + Bria RMBG, tier 4)
function item(
  key: string,
  prompt: string,
  seed: number,
  size = 128,
): AssetDef {
  return { key, category: "furniture", model: "nano-banana-2", prompt, size, pbr: false, seed, tier: 4 };
}

// Helper to create creature sprite assets (Nano Banana 2 + Bria RMBG, tier 5)
function creature(
  key: string,
  prompt: string,
  seed: number,
  size = 128,
): AssetDef {
  return { key, category: "furniture", model: "nano-banana-2", prompt, size, pbr: false, seed, tier: 5 };
}

// Helper to create furniture sprite assets WITHOUT background removal (for desk halves that tile together)
function furnitureNoRmbg(
  key: string,
  prompt: string,
  seed: number,
  size = 128,
): AssetDef {
  return { key, category: "furniture", model: "nano-banana-2-no-rmbg", prompt, size, pbr: false, seed, tier: 3 };
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
  tile("wall_4", "mesoamerican stone wall, carved volcanic basalt blocks with stepped fret geometric patterns, greca de escalones, warm earthy brown and terracotta tones, subtle glyph carvings, top-down, tileable", 1021),
  tile("water_0", "clear blue water, gentle ripples, top-down", 1022),
  tile("water_1", "blue water, moderate waves, top-down", 1023),
  tile("water_2", "blue water, choppier waves, top-down", 1024),
  tile("lava_0", "glowing orange molten lava, cracked crust, top-down", 1025),
  tile("lava_1", "molten lava, dark crust with bright veins, top-down", 1026),
  tile("lava_2", "cooling lava, dark with red glow, top-down", 1027),
  tile("lava_3", "bubbling lava, bright orange, top-down", 1028),
  tile("acid_0", "toxic green acid pool, bubbling, top-down", 1029),
  tile("acid_1", "acidic green liquid, corrosive, top-down", 1030),
  tile("acid_2", "thick green acid, viscous, top-down", 1031),
  tile("acid_3", "acid with yellow crust, top-down", 1032),
  tile("void_0", "dark void tear, purple-black energy, top-down", 1033),
  tile("void_1", "void rift, dark purple swirl, top-down", 1034),
  tile("void_2", "void crack, black with purple edges, top-down", 1035),
  tile("void_3", "void portal, deep purple, top-down", 1036),
  tile("ruin_0", "crumbling gray stone, ancient ruin, top-down", 1037),
  tile("ruin_1", "mossy ruined stone, cracked, top-down", 1038),
  tile("ruin_2", "broken stone tiles, ancient, top-down", 1039),
  tile("ruin_3", "weathered stone blocks, fallen, top-down", 1040),
  tile("castle_0", "cut gray stone block, castle wall, top-down", 1041),
  tile("castle_1", "polished stone block, fortress, top-down", 1042),
  tile("castle_2", "stone block with mortar, castle, top-down", 1043),
  tile("castle_3", "weathered stone block, ancient fortress, top-down", 1044),
  tile("fairway_0", "smooth manicured grass, golf fairway, top-down", 1045),
  tile("fairway_1", "golf fairway grass, short and even, top-down", 1046),
  tile("fairway_2", "fairway grass with slight grain, top-down", 1047),
  tile("fairway_3", "fairway grass, dewy, top-down", 1048),
  tile("sand_trap_0", "loose white sand, golf bunker, top-down", 1049),
  tile("sand_trap_1", "soft sand, golf sand trap, top-down", 1050),
  tile("sand_trap_2", "raked sand, bunker, top-down", 1051),
  tile("sand_trap_3", "compact sand, sand trap, top-down", 1052),
  tile("pond_0", "still dark water, pond surface, top-down", 1053),
  tile("pond_1", "pond water with lily pads, top-down", 1054),
  tile("pond_2", "murky pond water, top-down", 1055),
  tile("pond_3", "clear pond water, shallow, top-down", 1055),
  tile("hedge_0", "trimmed green hedge, top-down", 1056),
  tile("hedge_1", "manicured hedge, dense leaves, top-down", 1057),
  tile("hedge_2", "hedge with small flowers, top-down", 1058),
  tile("hedge_3", "overgrown hedge, top-down", 1059),
  tile("rock_0", "gray granite boulder surface, rough, top-down", 1060),
  tile("rock_1", "weathered stone surface, top-down", 1061),
  tile("rock_2", "mossy rock surface, top-down", 1062),
  tile("rock_3", "cracked stone surface, top-down", 1063),

  // ------------------------------------------------------- Tier 1: World objects (Nano Banana 2)
  object("big_tree", "top-down view of a large oak tree, full lush canopy seen from above, individual leaves visible with depth and shading, thick brown bark trunk visible at center, realistic texture, game sprite, isolated on white background", 2001, 128),
  object("palm_tree", "top-down view of a palm tree, green fronds radiating from center, textured brown trunk with ring segments, coconuts visible, realistic tropical texture, game sprite, isolated on white background", 2002, 128),
  object("mystic_tree", "top-down view of a dark gnarled mystical tree, twisted black branches, dark purple-black canopy with glowing orange eyes embedded in trunk, eerie fantasy game sprite, isolated on white background", 2003, 128),
  object("big_rock", "top-down view of a large granite boulder, gray stone with mineral grain texture, moss patches, cracks and fissures, realistic rock texture, game sprite, isolated on white background", 2004, 128),
  object("crystal", "top-down view of a large glowing blue crystal formation, faceted gemstone with light refraction, crystalline shards radiating outward, magical glow, fantasy game sprite, isolated on white background", 2005, 128),
  object("tree", "top-down view of a small oak tree, round green canopy seen from above, visible leaf clusters with depth shading, thin brown trunk at center, realistic texture, game sprite, isolated on white background", 2006, 128),
  object("flower", "top-down view of a cluster of wildflowers, mixed colors red yellow and white, green leaves around base, realistic texture, game sprite, isolated on white background", 2007, 128),
  object("bush", "top-down view of a dense green bush, rounded shrub with visible individual leaves, slight variation in green tones, realistic texture, game sprite, isolated on white background", 2008, 128),


  // ------------------------------------------------------- Tier 2: Office tiles

  // Tileable office surfaces (PATINA Material)
  tile("office_floor_0", "gray office carpet, commercial, top-down", 1101, 2),
  tile("office_floor_1", "dark blue office carpet, top-down", 1102, 2),
  tile("office_floor_2", "light oak wood planks, office floor, laminated, top-down", 1103, 2),
  tile("office_floor_3", "polished concrete floor, office, top-down", 1104, 2),
  tile("office_wall_0", "white painted drywall wall texture with subtle brush strokes, light reflections, faint plaster grain, top-down, tileable", 1105, 2),
  tile("office_wall_1", "light gray painted concrete wall with hairline cracks, subtle stains, industrial office, top-down, tileable", 1106, 2),
  tile("office_wall_2", "beige painted wall with subtle texture, faint wainscoting lines, office interior, top-down, tileable", 1107, 2),
  tile("office_wall_3", "single large glass window pane filling entire frame, blue tinted glass, subtle reflection, metal frame around edges only, top-down view, tileable, seamless", 1108, 2),
  tile("kitchen_counter", "granite countertop, black speckled, top-down", 1109, 2),
  tile("office_helipad", "single helicopter landing pad viewed from directly above, one large white H marker centered in frame, one white circle ring around the H, dark weathered asphalt background, no repeating patterns, no tiling, fills entire frame", 1110, 2),

  // ------------------------------------------------------- Tier 3: Office furniture (Nano Banana 2 + Bria RMBG)

  furniture("desk_left", "top-down view of the left half of a modern office desk, white laminate surface with cable hole, sleek metal legs visible at corner, realistic office furniture texture, game sprite, isolated on white background", 3001),
  furniture("desk_right", "top-down view of the right half of a modern office desk, white laminate surface with monitor stand base, sleek metal legs visible at corner, realistic office furniture texture, game sprite, isolated on white background", 3002),
  furniture("desk_side_top", "top-down view of a side desk surface on the left with a front panel on the right, white laminate desk surface with a cable hole, light gray front panel, realistic office furniture, game sprite, isolated on white background", 3003),
  furniture("desk_side_bottom", "top-down view of a side desk bottom half with papers and a coffee mug on the surface, white laminate desk with light gray front panel and metal legs, realistic office furniture, game sprite, isolated on white background", 3004),
  furniture("desk_side_top_mirror", "top-down view of a side desk with front panel on the left and desk surface on the right, white laminate desk surface with cable hole, light gray front panel, realistic office furniture, game sprite, isolated on white background", 3005),
  furniture("desk_side_bottom_mirror", "top-down view of a mirrored side desk bottom half with papers and a coffee mug, white laminate desk with light gray front panel and metal legs, realistic office furniture, game sprite, isolated on white background", 3006),
  furniture("office_chair_down", "top-down view of a modern black mesh office chair facing forward, 5-star wheel base visible, ergonomic backrest with lumbar support, realistic office furniture, game sprite, isolated on white background", 3007),
  furniture("office_chair_up", "top-down view of a modern black mesh office chair from behind, 5-star wheel base visible, back of ergonomic backrest, realistic office furniture, game sprite, isolated on white background", 3008),
  furniture("office_chair_left", "side view of a modern black mesh office chair facing left, 5-star wheel base, ergonomic backrest and armrest, realistic office furniture, game sprite, isolated on white background", 3009),
  furniture("office_chair_right", "side view of a modern black mesh office chair facing right, 5-star wheel base, ergonomic backrest and armrest, realistic office furniture, game sprite, isolated on white background", 3010),
  furniture("filing_cabinet", "top-down view of a grey metal filing cabinet with two drawers, drawer handles and label slots, realistic office furniture, game sprite, isolated on white background", 3011),
  furniture("server_rack", "top-down view of a tall dark metal server rack cabinet with LED indicators, vent grilles, cable management at bottom, blinking activity lights, realistic data center equipment, game sprite, isolated on white background", 3012),
  furniture("server_screen", "top-down view of a dark server monitoring display cabinet with terminal log lines, bar graphs, status LEDs, realistic data center equipment, game sprite, isolated on white background", 3013),
  furniture("coffee_machine_top", "top-down view of the top half of a modern espresso coffee machine, metallic body with display screen, button row with LED indicators, spout area, realistic kitchen appliance, game sprite, isolated on white background", 3014),
  furniture("coffee_machine_bottom", "top-down view of the bottom half of a coffee machine with drip tray, white coffee cup with steam, realistic kitchen appliance, game sprite, isolated on white background", 3015),
  furniture("water_cooler", "top-down view of a water cooler with translucent blue water jug on top, white cooler body with red and blue taps, cup dispenser, realistic office appliance, game sprite, isolated on white background", 3016),
  furniture("microwave", "top-down view of a white microwave oven with door window showing interior glow, digital display showing time, control buttons, realistic kitchen appliance, game sprite, isolated on white background", 3017),
  furniture("toaster", "top-down view of a chrome toaster with two toast slots, control dial, lever, crumb tray, realistic kitchen appliance, game sprite, isolated on white background", 3018),
  furniture("small_plant", "top-down view of a small potted office plant in a ceramic pot with green leaves, realistic office decoration, game sprite, isolated on white background", 3019),
  furniture("large_plant", "top-down view of a large potted dracaena plant in a terra cotta pot with tall green leaves, realistic office decoration, game sprite, isolated on white background", 3020),
  furniture("sofa_left", "top-down view of the left half of a blue fabric office sofa with seat cushion, backrest, left armrest, realistic office furniture, game sprite, isolated on white background", 3021),
  furniture("sofa_right", "top-down view of the right half of a blue fabric office sofa with seat cushion, backrest, right armrest, realistic office furniture, game sprite, isolated on white background", 3022),
  furniture("wall_picture", "top-down view of a framed picture on a wall, dark wood frame with abstract landscape painting, glass reflection, realistic office decoration, game sprite, isolated on white background", 3023),
  furniture("window", "top-down view of an office window with cross frame mullions, sky gradient glass with distant skyline silhouette, windowsill, realistic office architecture, game sprite, isolated on white background", 3024),
  furniture("kitchen_counter_furniture", "top-down view of a kitchen counter with granite countertop, cabinet doors with handles, realistic office kitchen furniture, game sprite, isolated on white background", 3025),
  furniture("kitchen_sink", "top-down view of a kitchen sink with stainless steel basin, faucet, granite countertop, realistic office kitchen, game sprite, isolated on white background", 3026),
  furniture("chimney", "top-down view of an industrial brick chimney with tapered stack, brick texture with mortar lines, dark opening at top, realistic industrial structure, game sprite, isolated on white background", 3027),
  furniture("desk_monitor_off", "top-down view of a modern slim-bezel computer monitor seen from front, dark screen showing code editor with colored text lines, stand base and neck, power LED, realistic office equipment, game sprite, isolated on white background", 3028),
  furniture("desk_monitor_lit", "top-down view of a modern slim-bezel computer monitor seen from front, glowing blue screen, stand base and neck, power LED, realistic office equipment, game sprite, isolated on white background", 3029),
  furniture("desk_monitor_black", "top-down view of a modern slim-bezel computer monitor seen from front, completely black powered-off screen, stand base and neck, realistic office equipment, game sprite, isolated on white background", 3030),
  furniture("desk_monitor_side_off", "side view of a thin computer monitor profile, dark screen edge, stand base and neck, power LED, realistic office equipment, game sprite, isolated on white background", 3031),
  furniture("desk_monitor_side_lit", "side view of a thin computer monitor profile with glowing blue screen edge, stand base and neck, power LED, realistic office equipment, game sprite, isolated on white background", 3032),
  furniture("helicopter_top", "3/4 aerial perspective view of a green and yellow helicopter, seen from above and slightly to the side, full helicopter visible including complete tail boom and tail rotor, landing skids visible, spinning rotor blades blurred as a disc, cockpit windshield, tail boom extending to the right with tail fin and tail rotor fully shown, helicopter small and centered with generous empty space around all edges, realistic aircraft, game sprite, isolated on white background", 3033, 1024),

  // ------------------------------------------------------- Tier 4: World items & props (Nano Banana 2 + Bria RMBG)

  item("golf_club", "a golf club lying diagonally, steel shaft with dark rubber grip, iron club head, realistic sports equipment, game sprite, isolated on white background", 4001),
  item("golf_ball", "a white golf ball with dimples, realistic sports equipment, game sprite, isolated on white background", 4002),
  item("axe", "a wood axe lying diagonally, wooden handle with steel blade head, realistic tool, game sprite, isolated on white background", 4003),
  item("tee_box", "a golf tee box marker, small wooden frame with colored tee markers, realistic golf course equipment, game sprite, isolated on white background", 4004),
  item("leprechaun", "a small leprechaun character with green hat and coat, red beard, holding a shillelagh, fantasy game character, game sprite, isolated on white background", 4005),
  item("tennis_court", "top-down view of a tennis court surface with white line markings, green hard court, realistic sports facility, game sprite, isolated on white background", 4006),
  item("tennis_wall", "a tennis practice wall with brick texture and white top cap, realistic sports facility, game sprite, isolated on white background", 4007),
  item("tennis_racket", "a tennis racket lying diagonally, red frame with white strings, dark grip handle, realistic sports equipment, game sprite, isolated on white background", 4008),
  item("tennis_ball", "a yellow tennis ball with white seam curve, realistic sports equipment, game sprite, isolated on white background", 4009),
  item("tennis_net", "a tennis net with white mesh netting between two metal posts with white caps, realistic sports equipment, game sprite, isolated on white background", 4010),

  // ------------------------------------------------------- Tier 5: Creatures, Beasts & Friendly (Nano Banana 2 + Bria RMBG)

  creature("creature_slime", "a green gelatinous slime blob monster with translucent body, visible internal nucleus, red eyes, fantasy game creature, game sprite, isolated on white background", 5001),
  creature("creature_wolf", "a grey dire wolf monster with glowing red eyes, snarling fangs, bristled fur, fantasy game creature, game sprite, isolated on white background", 5002),
  creature("creature_skeleton", "an undead skeleton warrior with bone body, holding a rusted sword, glowing eye sockets, fantasy game creature, game sprite, isolated on white background", 5003),
  creature("creature_imp", "a small red imp demon with horns, leathery wings, mischievous grin, glowing yellow eyes, fantasy game creature, game sprite, isolated on white background", 5004),
  creature("creature_wraith", "a dark shadowy wraith ghost with tattered hooded cloak, glowing purple eyes, ethereal misty body, fantasy game creature, game sprite, isolated on white background", 5005),
  creature("creature_fire_elemental", "a fire elemental made of living flame, glowing orange-red body with ember particles, fiery aura, fantasy game creature, game sprite, isolated on white background", 5006),
  creature("beast_groveheart", "an ancient treant boss with gnarled bark body, living leaf canopy, root-like claw arms, glowing green eyes, massive fantasy boss creature, game sprite, isolated on white background", 5007),
  creature("beast_stone_colossus", "a massive stone colossus boss with rocky body, crystalline veins, glowing blue eyes, ancient runes, fantasy boss creature, game sprite, isolated on white background", 5008),
  creature("beast_ash_wyrm", "a fiery ash wyrm dragon boss with charcoal scales, glowing magma cracks, ember wings, fantasy boss creature, game sprite, isolated on white background", 5009),
  creature("beast_void_leviathan", "a void leviathan boss with dark purple body, tentacles, glowing void eyes, cosmic energy, fantasy boss creature, game sprite, isolated on white background", 5010),
  creature("beast_infernal_sovereign", "an infernal sovereign boss with flaming crown, dark armor, lava cracks, demonic horns, fantasy boss creature, game sprite, isolated on white background", 5011),
  creature("friendly_unicorn", "a white unicorn with golden horn, pastel rainbow mane and tail, gentle eyes, fantasy creature, game sprite, isolated on white background", 5012),
  creature("friendly_fairy_bunny", "a cute fairy bunny with translucent wings, soft pink fur, glowing sparkles, fantasy creature, game sprite, isolated on white background", 5013),
  creature("friendly_baby_dragon", "a baby dragon with small wings, teal scales, big eyes, friendly expression, fantasy creature, game sprite, isolated on white background", 5014),
  creature("friendly_crystal_fox", "a crystal fox with translucent crystalline body, blue-white crystal fur, glowing eyes, fantasy creature, game sprite, isolated on white background", 5015),

  // ------------------------------------------------------- Tier 6: Character texture patches (PATINA Material — tileable, small)

  tile("char_skin", "smooth human skin texture, subtle pores, warm tone, top-down, tileable", 6001, 6, 32),
  tile("char_shirt_fabric", "cotton dress shirt fabric weave, subtle thread pattern, top-down, tileable", 6002, 6, 32),
  tile("char_pants_fabric", "denim pants fabric texture, diagonal twill weave, top-down, tileable", 6003, 6, 32),
  tile("char_hair_straight", "straight hair strands texture, fine lines, top-down, tileable", 6004, 6, 32),
  tile("char_hair_curly", "curly hair texture, coiled strands, top-down, tileable", 6005, 6, 32),
  tile("char_leather", "smooth leather texture, subtle grain, top-down, tileable", 6006, 6, 32),

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

// --------------------------------------------------- per-model generation

async function generateNanoBananaNoRmbg(
  asset: AssetDef,
  outDir: string,
): Promise<ManifestEntry> {
  console.log(`  [Nano Banana 2 (no RMBG)] ${asset.key}: "${asset.prompt}"`);

  const imgResult = await nanoBanana2(asset.prompt, { seed: asset.seed });

  const buf = await downloadUrl(imgResult.url);
  const resized = await resizeSquarePNG(buf, asset.size);
  const filePath = join(outDir, `${asset.key}.png`);
  saveBuffer(filePath, resized);

  const files: { [name: string]: string } = {
    sprite: `${asset.category}/${asset.key}.png`,
  };

  return {
    key: asset.key,
    category: asset.category,
    model: asset.model,
    files,
    size: asset.size,
    hasPBR: false,
    hasSvg: false,
  };
}

async function generateNanoBananaObject(
  asset: AssetDef,
  outDir: string,
): Promise<ManifestEntry> {
  console.log(`  [Nano Banana 2] ${asset.key}: "${asset.prompt}"`);

  // 1. Generate raster image
  const imgResult = await nanoBanana2(asset.prompt, { seed: asset.seed });

  // 2. Remove background (Bria RMBG)
  console.log(`  [Bria RMBG] Removing background for ${asset.key}…`);
  const transparentUrl = await removeBackground(imgResult.url);

  // 3. Download transparent image and resize to target size as PNG
  const buf = await downloadUrl(transparentUrl);
  const resized = await resizeSquarePNG(buf, asset.size);
  const filePath = join(outDir, `${asset.key}.png`);
  saveBuffer(filePath, resized);

  const files: { [name: string]: string } = {
    sprite: `${asset.category}/${asset.key}.png`,
  };

  return {
    key: asset.key,
    category: asset.category,
    model: asset.model,
    files,
    size: asset.size,
    hasPBR: false,
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

      let entry: ManifestEntry;
      if (asset.model === "nano-banana-2") {
        entry = await generateNanoBananaObject(asset, outDir);
      } else if (asset.model === "nano-banana-2-no-rmbg") {
        entry = await generateNanoBananaNoRmbg(asset, outDir);
      } else {
        entry = await generatePatinaMaterial(asset, outDir);
      }

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
