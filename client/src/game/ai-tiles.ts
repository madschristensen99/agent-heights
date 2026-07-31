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
};

/** Flat list of all AI asset keys (without the "ai-" prefix) for loading. */
export const AI_ASSET_KEYS: string[] = [
  ...Object.values(AI_TILE_TEXTURES).flat().map((k) => k.replace(/^ai-/, "")),
  ...Object.values(AI_OFFICE_TEXTURES).map((k) => k.replace(/^ai-/, "")),
  ...Object.values(AI_OBJECT_TEXTURES).map((k) => k.replace(/^ai-obj-/, "")),
];
