/**
 * Packs individual AI asset files into texture atlases to reduce HTTP requests.
 *
 * Before: 74 tile webps + 8 object PNGs + 42 furniture/item/creature PNGs = 124 requests
 * After:  2 atlas webps + 2 JSON files = 4 requests
 *
 * Usage: pnpm pack-atlas
 */
import sharp from "sharp";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const AI_DIR = join(ROOT, "client", "public", "assets", "ai");
const OUT_DIR = join(ROOT, "client", "public", "assets", "atlases");

// ── Asset key lists (must match ai-tiles.ts) ──────────────────────────────

const TILE_KEYS = [
  "grass_0", "grass_1", "grass_2", "grass_3",
  "wall_0", "wall_1", "wall_2", "wall_3",
  "rock_0", "rock_1", "rock_2", "rock_3",
  "acid_0", "acid_1", "acid_2", "acid_3",
  "path_0", "path_1", "path_2", "path_3",
  "sand_0", "sand_1", "sand_2", "sand_3",
  "snow_0", "snow_1", "snow_2", "snow_3",
  "lava_0", "lava_1", "lava_2", "lava_3",
  "void_0", "void_1", "void_2", "void_3",
  "ruin_0", "ruin_1", "ruin_2", "ruin_3",
  "castle_0", "castle_1", "castle_2", "castle_3",
  "fairway_0", "fairway_1", "fairway_2", "fairway_3",
  "sand_trap_0", "sand_trap_1", "sand_trap_2", "sand_trap_3",
  "pond_0", "pond_1", "pond_2", "pond_3",
  "hedge_0", "hedge_1", "hedge_2", "hedge_3",
  "water_0", "water_1", "water_2",
  "office_floor_0", "office_floor_1",
  "office_wall_0", "office_wall_1",
  "kitchen_counter",
  "char_skin", "char_shirt_fabric", "char_pants_fabric",
  "char_hair_straight", "char_hair_curly", "char_leather",
];

const OBJECT_KEYS = [
  "big_tree", "palm_tree", "mystic_tree", "big_rock",
  "crystal", "tree", "flower", "bush",
];

const FURNITURE_KEYS = [
  "filing_cabinet", "wall_picture", "window", "small_plant",
  "coffee_machine_top", "coffee_machine_bottom", "water_cooler",
  "kitchen_counter_furniture", "kitchen_sink", "microwave",
  "sofa_left", "sofa_right", "large_plant", "toaster",
  "server_rack", "server_screen", "chimney",
];

const ITEM_KEYS = [
  "golf_club", "golf_ball", "axe", "tee_box", "leprechaun",
  "tennis_court", "tennis_wall", "tennis_racket",
  "tennis_ball", "tennis_net",
];

const CREATURE_KEYS = [
  "creature_slime", "creature_wolf", "creature_skeleton",
  "creature_imp", "creature_wraith", "creature_fire_elemental",
  "beast_groveheart", "beast_stone_colossus", "beast_ash_wyrm",
  "beast_void_leviathan", "beast_infernal_sovereign",
  "friendly_unicorn", "friendly_fairy_bunny",
  "friendly_baby_dragon", "friendly_crystal_fox",
];

// ── Shelf packer ──────────────────────────────────────────────────────────

interface PackItem {
  key: string;
  file: string;
  w: number;
  h: number;
}

function makeItem(key: string, file: string): PackItem {
  return { key, file, w: 0, h: 0 };
}

interface PackedFrame {
  key: string;
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function packShelf(items: PackItem[], atlasW: number, atlasH: number): PackedFrame[] | null {
  const sorted = [...items].sort((a, b) => b.h - a.h);
  let curX = 0, curY = 0, shelfH = 0;
  const result: PackedFrame[] = [];

  for (const item of sorted) {
    if (item.w > atlasW || item.h > atlasH) {
      console.error(`  Item too large for atlas: ${item.key} (${item.w}x${item.h})`);
      return null;
    }
    if (curX + item.w > atlasW) {
      curY += shelfH;
      curX = 0;
      shelfH = 0;
    }
    if (curY + item.h > atlasH) {
      console.error(`  Atlas overflow at item: ${item.key}`);
      return null;
    }
    result.push({ ...item, x: curX, y: curY });
    curX += item.w;
    shelfH = Math.max(shelfH, item.h);
  }
  return result;
}

// ── Atlas builder ──────────────────────────────────────────────────────────

async function buildAtlas(
  name: string,
  items: PackItem[],
  atlasW: number,
  atlasH: number,
): Promise<void> {
  console.log(`\n Packing ${name} (${items.length} images)...`);

  // Read dimensions
  for (const item of items) {
    const meta = await sharp(item.file).metadata();
    item.w = meta.width!;
    item.h = meta.height!;
  }

  const packed = packShelf(items, atlasW, atlasH);
  if (!packed) {
    console.error(`  Failed to pack ${name}`);
    process.exit(1);
  }

  const usedArea = packed.reduce((sum, f) => sum + f.w * f.h, 0);
  const totalArea = atlasW * atlasH;
  console.log(`  Packed ${packed.length} frames, ${(usedArea / totalArea * 100).toFixed(1)}% utilization`);

  // Composite
  const composites = packed.map((f) => ({
    input: f.file,
    left: f.x,
    top: f.y,
  }));

  const webpPath = join(OUT_DIR, `${name}.webp`);
  const jsonPath = join(OUT_DIR, `${name}.json`);

  await sharp({
    create: {
      width: atlasW,
      height: atlasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 90 })
    .toFile(webpPath);

  const json = {
    frames: Object.fromEntries(
      packed.map((f) => [f.key, { x: f.x, y: f.y, w: f.w, h: f.h }]),
    ),
  };
  await writeFile(jsonPath, JSON.stringify(json));

  console.log(`  Written: ${webpPath}`);
  console.log(`  Written: ${jsonPath}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Tile atlas: all basecolor webps from tiles/ directory
  const tileItems: PackItem[] = TILE_KEYS.map((key) =>
    makeItem(`ai-${key}`, join(AI_DIR, "tiles", `${key}_basecolor.webp`)),
  );

  await buildAtlas("ai-tiles-atlas", tileItems, 4096, 4096);

  // Sprite atlas: objects + furniture + items + creatures
  const spriteItems: PackItem[] = [
    ...OBJECT_KEYS.map((key) =>
      makeItem(`ai-obj-${key}`, join(AI_DIR, "objects", `${key}.png`)),
    ),
    ...FURNITURE_KEYS.map((key) =>
      makeItem(`ai-fur-${key}`, join(AI_DIR, "furniture", `${key}.png`)),
    ),
    ...ITEM_KEYS.map((key) =>
      makeItem(`ai-fur-${key}`, join(AI_DIR, "furniture", `${key}.png`)),
    ),
    ...CREATURE_KEYS.map((key) =>
      makeItem(`ai-fur-${key}`, join(AI_DIR, "furniture", `${key}.png`)),
    ),
  ];

  await buildAtlas("ai-sprites-atlas", spriteItems, 4096, 4096);

  console.log("\nDone! Atlases written to client/public/assets/atlases/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
