import { TILE } from "../../../shared/types";

/**
 * Maps world TILE types to AI-generated basecolor texture keys.
 * Each entry is an array of variant keys (cycled per-tile for variety).
 * Tiles not listed here use the procedural spritesheet.
 */
export const AI_TILE_TEXTURES: Record<number, string[]> = {
  [TILE.GRASS]: ["ai-grass_0", "ai-grass_1", "ai-grass_2", "ai-grass_3"],
  [TILE.WALL]: ["ai-wall_0", "ai-wall_1", "ai-wall_2", "ai-wall_3"],
  [TILE.ROCK]: ["ai-rock_0", "ai-rock_1", "ai-rock_2", "ai-rock_3"],
  [TILE.ACID]: ["ai-acid_0", "ai-acid_1", "ai-acid_2", "ai-acid_3"],
  [TILE.PATH]: ["ai-path_0", "ai-path_1", "ai-path_2", "ai-path_3"],
  [TILE.SAND]: ["ai-sand_0", "ai-sand_1", "ai-sand_2", "ai-sand_3"],
  [TILE.SNOW]: ["ai-snow_0", "ai-snow_1", "ai-snow_2", "ai-snow_3"],
  [TILE.LAVA]: ["ai-lava_0", "ai-lava_1", "ai-lava_2", "ai-lava_3"],
  [TILE.VOID]: ["ai-void_0", "ai-void_1", "ai-void_2", "ai-void_3"],
  [TILE.RUIN]: ["ai-ruin_0", "ai-ruin_1", "ai-ruin_2", "ai-ruin_3"],
  [TILE.CASTLE]: ["ai-castle_0", "ai-castle_1", "ai-castle_2", "ai-castle_3"],
  [TILE.FAIRWAY]: ["ai-fairway_0", "ai-fairway_1", "ai-fairway_2", "ai-fairway_3"],
  [TILE.SAND_TRAP]: ["ai-sand_trap_0", "ai-sand_trap_1", "ai-sand_trap_2", "ai-sand_trap_3"],
  [TILE.POND]: ["ai-pond_0", "ai-pond_1", "ai-pond_2", "ai-pond_3"],
  [TILE.HEDGE]: ["ai-hedge_0", "ai-hedge_1", "ai-hedge_2", "ai-hedge_3"],
  [TILE.WATER]: ["ai-water_0", "ai-water_1", "ai-water_2"],
};

/** Office interior AI textures (loaded separately from world tiles). */
export const AI_OFFICE_TEXTURES = {
  floorClassic: "ai-office_floor_0",
  floorAgentHeights: "ai-office_floor_1",
  wallClassic: "ai-office_wall_0",
  wallAgentHeights: "ai-office_wall_1",
  wallBeige: "ai-office_wall_2",
  wallBlue: "ai-office_wall_3",
  helipad: "ai-office_helipad",
  kitchenCounter: "ai-kitchen_counter",
} as const;

/**
 * Maps world TILE types to AI-generated object sprite texture keys.
 * Objects use Nano Banana 2 + Bria RMBG (transparent PNG).
 * Tiles not listed here use the procedural canvas textures.
 */
export const AI_OBJECT_TEXTURES: Record<number, string> = {
  [TILE.BIG_TREE]: "ai-obj-big_tree",
  [TILE.PALM_TREE]: "ai-obj-palm_tree",
  [TILE.MYSTIC_TREE]: "ai-obj-mystic_tree",
  [TILE.BIG_ROCK]: "ai-obj-big_rock",
  [TILE.CRYSTAL]: "ai-obj-crystal",
  [TILE.TREE]: "ai-obj-tree",
  [TILE.FLOWER]: "ai-obj-flower",
  [TILE.BUSH]: "ai-obj-bush",
};

/** Object asset keys (without prefix) for loading from objects/ directory. */
export const AI_OBJECT_KEYS: string[] = Object.values(AI_OBJECT_TEXTURES).map((k) => k.replace(/^ai-obj-/, ""));

/**
 * Maps furniture tile IDs to AI-generated furniture sprite texture keys.
 * Furniture uses Nano Banana 2 + Bria RMBG (transparent PNG).
 * When a tile ID is listed here, the AI texture is used instead of procedural canvas.
 */
export const AI_FURNITURE_TEXTURES: Record<number, string> = {
  20: "ai-fur-filing_cabinet",
  21: "ai-fur-wall_picture",
  10: "ai-fur-window",
  22: "ai-fur-small_plant",
  23: "ai-fur-coffee_machine_top",
  24: "ai-fur-coffee_machine_bottom",
  25: "ai-fur-water_cooler",
  26: "ai-fur-kitchen_counter_furniture",
  27: "ai-fur-kitchen_sink",
  28: "ai-fur-microwave",
  29: "ai-fur-sofa_left",
  30: "ai-fur-sofa_right",
  31: "ai-fur-large_plant",
  32: "ai-fur-toaster",
  35: "ai-fur-server_rack",
  36: "ai-fur-server_screen",
  37: "ai-fur-chimney",
};

/** AI furniture chair textures (4 directions). Reverted to procedural — AI chairs looked worse. */
export const AI_FURNITURE_CHAIRS: Record<string, string> = {};

/** AI furniture monitor textures (3 frames: off / lit / black). Reverted to procedural. */
export const AI_FURNITURE_MONITORS: Record<string, string> = {};

/** AI furniture side monitor textures (2 frames: off / lit). Reverted to procedural. */
export const AI_FURNITURE_MONITORS_SIDE: Record<string, string> = {};

/** Furniture asset keys (without prefix) for loading from furniture/ directory. */
export const AI_FURNITURE_KEYS: string[] = [
  ...Object.values(AI_FURNITURE_TEXTURES),
  ...Object.values(AI_FURNITURE_CHAIRS),
  ...Object.values(AI_FURNITURE_MONITORS),
  ...Object.values(AI_FURNITURE_MONITORS_SIDE),
  "helicopter_top",
].map((k) => k.replace(/^ai-fur-/, ""));

/**
 * Maps procedural item texture keys to AI-generated item sprite texture keys.
 * Items use Nano Banana 2 + Bria RMBG (transparent PNG).
 * When a key is listed here, the AI texture is used instead of procedural canvas.
 */
export const AI_ITEM_TEXTURES: Record<string, string> = {
  "golf-club": "ai-fur-golf_club",
  "golf-ball": "ai-fur-golf_ball",
  "axe": "ai-fur-axe",
  "tee-box": "ai-fur-tee_box",
  "leprechaun": "ai-fur-leprechaun",
  "tennis-court": "ai-fur-tennis_court",
  "tennis-wall": "ai-fur-tennis_wall",
  "tennis-racket": "ai-fur-tennis_racket",
  "tennis-ball": "ai-fur-tennis_ball",
  "tennis-net": "ai-fur-tennis_net",
};

/** Item asset keys (without prefix) for loading from furniture/ directory. */
export const AI_ITEM_KEYS: string[] = Object.values(AI_ITEM_TEXTURES).map((k) => k.replace(/^ai-fur-/, ""));

/**
 * Resolve a procedural item texture key to its AI-generated equivalent if loaded.
 * Use this when creating sprites/images that reference item textures by key.
 */
export function resolveItemTex(scene: Phaser.Scene, procKey: string): string {
  const aiKey = AI_ITEM_TEXTURES[procKey];
  if (aiKey && scene.textures.exists(aiKey)) return aiKey;
  return procKey;
}

/**
 * Maps creature/beast/friendly spritesheet keys to AI-generated sprite texture keys.
 * Creatures use Nano Banana 2 + Bria RMBG (transparent PNG).
 * Each entry maps to 4 per-frame textures: [idle, walk1, walk2, attack].
 */
export const AI_CREATURE_TEXTURES: Record<string, string[]> = {
  "creature-slime": ["ai-fur-creature_slime_0", "ai-fur-creature_slime_1", "ai-fur-creature_slime_2", "ai-fur-creature_slime_3"],
  "creature-wolf": ["ai-fur-creature_wolf_0", "ai-fur-creature_wolf_1", "ai-fur-creature_wolf_2", "ai-fur-creature_wolf_3"],
  "creature-skeleton": ["ai-fur-creature_skeleton_0", "ai-fur-creature_skeleton_1", "ai-fur-creature_skeleton_2", "ai-fur-creature_skeleton_3"],
  "creature-imp": ["ai-fur-creature_imp_0", "ai-fur-creature_imp_1", "ai-fur-creature_imp_2", "ai-fur-creature_imp_3"],
  "creature-wraith": ["ai-fur-creature_wraith_0", "ai-fur-creature_wraith_1", "ai-fur-creature_wraith_2", "ai-fur-creature_wraith_3"],
  "creature-fire-elemental": ["ai-fur-creature_fire_elemental_0", "ai-fur-creature_fire_elemental_1", "ai-fur-creature_fire_elemental_2", "ai-fur-creature_fire_elemental_3"],
  "beast-groveheart": ["ai-fur-beast_groveheart_0", "ai-fur-beast_groveheart_1", "ai-fur-beast_groveheart_2", "ai-fur-beast_groveheart_3"],
  "beast-stone-colossus": ["ai-fur-beast_stone_colossus_0", "ai-fur-beast_stone_colossus_1", "ai-fur-beast_stone_colossus_2", "ai-fur-beast_stone_colossus_3"],
  "beast-ash-wyrm": ["ai-fur-beast_ash_wyrm_0", "ai-fur-beast_ash_wyrm_1", "ai-fur-beast_ash_wyrm_2", "ai-fur-beast_ash_wyrm_3"],
  "beast-void-leviathan": ["ai-fur-beast_void_leviathan_0", "ai-fur-beast_void_leviathan_1", "ai-fur-beast_void_leviathan_2", "ai-fur-beast_void_leviathan_3"],
  "beast-infernal-sovereign": ["ai-fur-beast_infernal_sovereign_0", "ai-fur-beast_infernal_sovereign_1", "ai-fur-beast_infernal_sovereign_2", "ai-fur-beast_infernal_sovereign_3"],
  "friendly-unicorn": ["ai-fur-friendly_unicorn_0", "ai-fur-friendly_unicorn_1", "ai-fur-friendly_unicorn_2", "ai-fur-friendly_unicorn_3"],
  "friendly-fairy-bunny": ["ai-fur-friendly_fairy_bunny_0", "ai-fur-friendly_fairy_bunny_1", "ai-fur-friendly_fairy_bunny_2", "ai-fur-friendly_fairy_bunny_3"],
  "friendly-baby-dragon": ["ai-fur-friendly_baby_dragon_0", "ai-fur-friendly_baby_dragon_1", "ai-fur-friendly_baby_dragon_2", "ai-fur-friendly_baby_dragon_3"],
  "friendly-crystal-fox": ["ai-fur-friendly_crystal_fox_0", "ai-fur-friendly_crystal_fox_1", "ai-fur-friendly_crystal_fox_2", "ai-fur-friendly_crystal_fox_3"],
};

/** Creature asset keys (without prefix) for loading from furniture/ directory. */
export const AI_CREATURE_KEYS: string[] = Object.values(AI_CREATURE_TEXTURES).flat().map((k) => k.replace(/^ai-fur-/, ""));

/**
 * Character texture patch keys for AI-generated tileable textures.
 * These are small (32×32) PATINA Material basecolor textures used to
 * add surface detail to character sprites (fabric weave, skin pores, etc.).
 */
export const AI_CHAR_TEXTURES = {
  skin: "ai-char_skin",
  shirtFabric: "ai-char_shirt_fabric",
  pantsFabric: "ai-char_pants_fabric",
  hairStraight: "ai-char_hair_straight",
  hairCurly: "ai-char_hair_curly",
  leather: "ai-char_leather",
} as const;

/** Char texture asset keys (without prefix) for loading from tiles/ directory. */
export const AI_CHAR_KEYS: string[] = Object.values(AI_CHAR_TEXTURES).map((k) => k.replace(/^ai-/, ""));

/** Tile + office + char texture asset keys (without prefix) for loading from tiles/ directory. */
export const AI_TILE_KEYS: string[] = [
  ...Object.values(AI_TILE_TEXTURES).flat().map((k) => k.replace(/^ai-/, "")),
  ...Object.values(AI_OFFICE_TEXTURES).map((k) => k.replace(/^ai-/, "")),
  ...AI_CHAR_KEYS,
];

/** Flat list of all AI asset keys (kept for backwards compatibility). */
export const AI_ASSET_KEYS: string[] = [...AI_TILE_KEYS, ...AI_OBJECT_KEYS];

// =============================================================== AI hair components

/**
 * AI-generated hair component sprites.
 * Each hair style has 24 frames: 8 poses × 3 directions (down, right, up).
 * Frames are grayscale PNGs for runtime color tinting.
 * Left direction = mirror of right (handled at runtime).
 */
export const AI_HAIR_DIRS = ["down", "right", "up"] as const;
export const AI_HAIR_POSES = 8;

/** Hair styles that have AI-generated sprites (excludes "bald"). */
export const AI_HAIR_STYLES = [
  "short", "spiky", "long", "ponytail",
  "buzz", "swept", "curly", "bun",
  "balding", "mohawk", "afro", "braids",
  "pigtails", "bob", "dreadlocks",
];

/**
 * Build the Phaser texture key for a specific hair frame.
 * e.g. ("spiky", "down", 3) → "ai-hair-spiky_down_3"
 */
export function hairFrameKey(style: string, dir: string, pose: number): string {
  return `ai-hair-${style}_${dir}_${pose}`;
}

/**
 * Build the asset URL for a specific hair frame.
 * e.g. ("spiky", "down", 3) → "ai/char/hair/spiky/spiky_down_3.png"
 */
export function hairFrameUrl(style: string, dir: string, pose: number): string {
  return `assets/ai/char/hair/${style}/${style}_${dir}_${pose}.png?v=7`;
}

/**
 * Get all hair frame texture keys for a given style (24 keys).
 */
export function hairStyleKeys(style: string): string[] {
  const keys: string[] = [];
  for (const dir of AI_HAIR_DIRS) {
    for (let pose = 0; pose < AI_HAIR_POSES; pose++) {
      keys.push(hairFrameKey(style, dir, pose));
    }
  }
  return keys;
}

/**
 * Get all hair frame texture keys for all styles.
 */
export function allHairKeys(): string[] {
  return AI_HAIR_STYLES.flatMap(hairStyleKeys);
}
