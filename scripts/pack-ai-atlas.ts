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
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const AI_DIR = join(ROOT, "client", "public", "assets", "ai");
const OUT_DIR = join(ROOT, "client", "public", "assets", "atlases");

// ── Asset key lists (must match ai-tiles.ts) ──────────────────────────────

const TILE_KEYS = [
  "grass_0", "grass_1", "grass_2", "grass_3",
  "wall_0", "wall_1", "wall_2", "wall_3", "wall_4",
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
  "office_wall_0", "office_wall_1", "office_wall_2", "office_wall_3",
  "office_helipad",
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
  "helicopter_top",
];

const ITEM_KEYS = [
  "golf_club", "golf_ball", "axe", "tee_box", "leprechaun",
  "tennis_court", "tennis_wall", "tennis_racket",
  "tennis_ball", "tennis_net",
];

const CREATURE_BASE_KEYS = [
  "creature_slime", "creature_wolf", "creature_skeleton",
  "creature_imp", "creature_wraith", "creature_fire_elemental",
  "beast_groveheart", "beast_stone_colossus", "beast_ash_wyrm",
  "beast_void_leviathan", "beast_infernal_sovereign",
  "friendly_unicorn", "friendly_fairy_bunny",
  "friendly_baby_dragon", "friendly_crystal_fox",
];

// Per-frame creature keys (4 frames each: _0 idle, _1 walk1, _2 walk2, _3 attack)
const CREATURE_KEYS: string[] = CREATURE_BASE_KEYS.flatMap((key) =>
  [0, 1, 2, 3].map((i) => `${key}_${i}`),
);

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

  // Filter out items whose source files don't exist yet
  const missing = items.filter((i) => !existsSync(i.file));
  if (missing.length > 0) {
    console.warn(`  Skipping ${missing.length} missing files (e.g. ${missing[0].key})`);
  }
  items = items.filter((i) => existsSync(i.file));

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
    .webp({ lossless: true })
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

  // Hair atlas: 15 styles × 24 frames (8 poses × 3 dirs) = 360 PNGs
  const HAIR_STYLES = [
    "short", "spiky", "long", "ponytail",
    "buzz", "swept", "curly", "bun",
    "balding", "mohawk", "afro", "braids",
    "pigtails", "bob", "dreadlocks",
  ];
  const HAIR_DIRS = ["down", "right", "up"];
  const HAIR_POSES = 8;
  const hairItems: PackItem[] = [];
  for (const style of HAIR_STYLES) {
    for (const dir of HAIR_DIRS) {
      for (let pose = 0; pose < HAIR_POSES; pose++) {
        const fileKey = `${style}_${dir}_${pose}`;
        hairItems.push(
          makeItem(
            `ai-hair-${fileKey}`,
            join(AI_DIR, "char", "hair", style, `${fileKey}.png`),
          ),
        );
      }
    }
  }
  await buildAtlas("ai-hair-atlas", hairItems, 2048, 2048);

  // Beard atlas: 4 styles × 24 frames = 96 PNGs
  const BEARD_STYLES = ["stubble", "mustache", "goatee", "full_beard"];
  const beardItems: PackItem[] = [];
  for (const style of BEARD_STYLES) {
    for (const dir of HAIR_DIRS) {
      for (let pose = 0; pose < HAIR_POSES; pose++) {
        const fileKey = `${style}_${dir}_${pose}`;
        beardItems.push(
          makeItem(
            `ai-beard-${fileKey}`,
            join(AI_DIR, "char", "beard", style, `${fileKey}.png`),
          ),
        );
      }
    }
  }
  await buildAtlas("ai-beard-atlas", beardItems, 1024, 1024);

  // Shirt atlas: 1 style × 24 frames = 24 PNGs
  const SHIRT_STYLES = ["default"];
  const shirtItems: PackItem[] = [];
  for (const style of SHIRT_STYLES) {
    for (const dir of HAIR_DIRS) {
      for (let pose = 0; pose < HAIR_POSES; pose++) {
        const fileKey = `${style}_${dir}_${pose}`;
        shirtItems.push(
          makeItem(
            `ai-shirt-${fileKey}`,
            join(AI_DIR, "char", "shirt", style, `${fileKey}.png`),
          ),
        );
      }
    }
  }
  await buildAtlas("ai-shirt-atlas", shirtItems, 1024, 1024);

  // Pants atlas: 1 style × 24 frames = 24 PNGs
  const PANTS_STYLES = ["default"];
  const pantsItems: PackItem[] = [];
  for (const style of PANTS_STYLES) {
    for (const dir of HAIR_DIRS) {
      for (let pose = 0; pose < HAIR_POSES; pose++) {
        const fileKey = `${style}_${dir}_${pose}`;
        pantsItems.push(
          makeItem(
            `ai-pants-${fileKey}`,
            join(AI_DIR, "char", "pants", style, `${fileKey}.png`),
          ),
        );
      }
    }
  }
  await buildAtlas("ai-pants-atlas", pantsItems, 1024, 1024);

  // Accessory atlas: 6 styles × 24 frames = 144 PNGs
  const ACCESSORY_STYLES = ["glasses", "headband", "earrings", "cap", "beanie", "headphones"];
  const accessoryItems: PackItem[] = [];
  for (const style of ACCESSORY_STYLES) {
    for (const dir of HAIR_DIRS) {
      for (let pose = 0; pose < HAIR_POSES; pose++) {
        const fileKey = `${style}_${dir}_${pose}`;
        accessoryItems.push(
          makeItem(
            `ai-accessory-${fileKey}`,
            join(AI_DIR, "char", "accessory", style, `${fileKey}.png`),
          ),
        );
      }
    }
  }
  await buildAtlas("ai-accessory-atlas", accessoryItems, 1024, 1024);

  // Head feature atlas: 4 styles × 24 frames = 96 PNGs
  const HEAD_FEATURE_STYLES = ["cat ears", "horns", "antennae", "elf ears"];
  const headFeatureItems: PackItem[] = [];
  for (const style of HEAD_FEATURE_STYLES) {
    const safeStyle = style.replace(/ /g, "_");
    for (const dir of HAIR_DIRS) {
      for (let pose = 0; pose < HAIR_POSES; pose++) {
        const fileKey = `${safeStyle}_${dir}_${pose}`;
        headFeatureItems.push(
          makeItem(
            `ai-headFeature-${fileKey}`,
            join(AI_DIR, "char", "headFeature", safeStyle, `${fileKey}.png`),
          ),
        );
      }
    }
  }
  await buildAtlas("ai-headFeature-atlas", headFeatureItems, 1024, 1024);

  console.log("\nDone! Atlases written to client/public/assets/atlases/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
