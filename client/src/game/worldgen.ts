import { CHUNK_SIZE, TILE } from "../../../shared/types";

/**
 * Seeded PRNG (mulberry32) — deterministic per (seed, chunkX, chunkY).
 * The same chunk always produces the same terrain.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash chunk coords into a per-chunk seed. */
function chunkSeed(worldSeed: number, cx: number, cy: number): number {
  let h = worldSeed >>> 0;
  h = Math.imul(h ^ (cx + 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (cy + 0x9e3779b9), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash a world-tile coordinate into a pseudo-random float [0,1). */
function hashTile(worldSeed: number, wx: number, wy: number): number {
  let h = worldSeed >>> 0;
  h = Math.imul(h ^ (wx + 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (wy + 0x9e3779b9), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise at integer lattice points — bilinear interpolation.
 *  Produces coherent density fields across chunk boundaries for natural clustering. */
function valueNoise(worldSeed: number, wx: number, wy: number, scale: number): number {
  const sx = wx / scale;
  const sy = wy / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  // Smoothstep for softer transitions
  const sxw = fx * fx * (3 - 2 * fx);
  const syw = fy * fy * (3 - 2 * fy);
  const v00 = hashTile(worldSeed, x0, y0);
  const v10 = hashTile(worldSeed, x0 + 1, y0);
  const v01 = hashTile(worldSeed, x0, y0 + 1);
  const v11 = hashTile(worldSeed, x0 + 1, y0 + 1);
  const top = v00 * (1 - sxw) + v10 * sxw;
  const bot = v01 * (1 - sxw) + v11 * sxw;
  return top * (1 - syw) + bot * syw;
}

/**
 * Biome types — determined by distance from the office (origin).
 * The farther out you go, the more hostile the environment.
 *
 *   meadow  →  forest  →  ruins  →  wasteland  →  void  →  infernal
 *   peaceful ............................................ hostile
 */
export type Biome = "meadow" | "forest" | "ruins" | "wasteland" | "void" | "infernal";

/** Hostility level 0–5+, scales with distance from origin. Never hits a wall — always playable.
 *  Returns fractional values near biome boundaries to enable smooth transitions. */
export function hostilityAt(cx: number, cy: number): number {
  const dist = Math.hypot(cx, cy);
  // Each biome spans a range; transition zone is the outer 20% of each range
  // where hostility smoothly interpolates to the next level.
  const thresholds = [2, 4, 7, 11, 18];
  const transitionWidth = 0.8; // chunk distance for smooth blend
  for (let i = 0; i < thresholds.length; i++) {
    if (dist < thresholds[i]) {
      const boundary = thresholds[i] - transitionWidth;
      if (dist < boundary) return i;
      // Smooth interpolation in the transition zone
      const t = (dist - boundary) / transitionWidth;
      return i + t * t * (3 - 2 * t); // smoothstep
    }
  }
  return thresholds.length;
}

export function biomeAt(_worldSeed: number, cx: number, cy: number): Biome {
  const h = hostilityAt(cx, cy);
  return (["meadow", "forest", "ruins", "wasteland", "void", "infernal"] as Biome[])[Math.round(h)];
}

export interface Chunk {
  cx: number;
  cy: number;
  biome: Biome;
  tiles: number[];
}

const idx = (x: number, y: number) => y * CHUNK_SIZE + x;

/** Tiles that should not be overwritten by other feature placement. */
const PROTECTED_TILES = new Set<number>([
  TILE.GOLF_CLUB, TILE.GOLF_BALL, TILE.GOLF_FLAG, TILE.TEE_BOX,
  TILE.AXE, TILE.LEPRECHAUN, TILE.BIG_TREE, TILE.BIG_ROCK, TILE.FOUNTAIN,
  TILE.TENNIS_COURT, TILE.TENNIS_WALL, TILE.TENNIS_RACKET, TILE.TENNIS_BALL, TILE.TENNIS_NET,
]);

/** Check if a tile can be safely overwritten by a feature. */
function canOverwrite(tiles: number[], i: number): boolean {
  return !PROTECTED_TILES.has(tiles[i]);
}

/**
 * Generate a chunk deterministically.
 *
 * Open terrain — mostly walkable ground with scattered features.
 * The farther from origin, the more obstacles and hostile tiles appear.
 */
export function generateChunk(worldSeed: number, cx: number, cy: number): Chunk {
  const biome = biomeAt(worldSeed, cx, cy);
  const rng = mulberry32(chunkSeed(worldSeed, cx, cy));
  const hostility = hostilityAt(cx, cy);
  const hostilityFloor = Math.floor(hostility);
  const hostilityFrac = hostility - hostilityFloor;

  // Determine adjacent biome for transition blending
  const biomeList: Biome[] = ["meadow", "forest", "ruins", "wasteland", "void", "infernal"];
  const nextBiome = biomeList[Math.min(hostilityFloor + 1, biomeList.length - 1)];

  // base ground tile for this biome
  const baseTile = baseGround(biome);
  const tiles = new Array<number>(CHUNK_SIZE * CHUNK_SIZE).fill(baseTile);

  // Ground variation — patches of secondary ground tile for visual texture
  const variationTile = groundVariation(biome);
  if (variationTile !== baseTile) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i = idx(x, y);
        const wx = cx * CHUNK_SIZE + x;
        const wy = cy * CHUNK_SIZE + y;
        const varNoise = valueNoise(worldSeed ^ 0xABCD, wx, wy, 5);
        if (varNoise < 0.22) {
          tiles[i] = variationTile;
        }
      }
    }
  }

  // scatter features using value noise density fields for natural clustering
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const i = idx(x, y);
      if (!canOverwrite(tiles, i)) continue;

      // World tile coordinates for noise sampling (coherent across chunk boundaries)
      const wx = cx * CHUNK_SIZE + x;
      const wy = cy * CHUNK_SIZE + y;

      // Obstacle density — noise at scale 8 creates groves and clearings
      const obstacleNoise = valueNoise(worldSeed, wx, wy, 8);
      const obstacleChance = Math.min(0.65, 0.12 + hostility * 0.10);
      // Blend obstacle probability between current and next biome in transition zones
      const obstacleChanceNext = Math.min(0.65, 0.12 + (hostilityFloor + 1) * 0.10);
      const obstacleThreshold = obstacleChance * (1 - hostilityFrac) + obstacleChanceNext * hostilityFrac;

      // Hostile tile density — separate noise fields for lava and void so they
      // form interspersed scattered patches instead of clumping together.
      // Scale 4 creates small maze-like pockets rather than massive pools.
      const lavaNoise = valueNoise(worldSeed ^ 0x12345, wx, wy, 4);
      const voidNoise = valueNoise(worldSeed ^ 0x67890, wx, wy, 4);
      const hostileChance = hostilityFloor >= 2 ? Math.min(0.30, (hostilityFloor - 1) * 0.08) : 0;
      const hostileChanceNext = (hostilityFloor + 1) >= 2 ? Math.min(0.30, hostilityFloor * 0.08) : 0;
      const hostileThreshold = hostileChance * (1 - hostilityFrac) + hostileChanceNext * hostilityFrac;

      // Decoration density — noise at scale 6 for smaller flower/bush patches
      const decorNoise = valueNoise(worldSeed ^ 0xDEADBEEF, wx, wy, 6);
      const decorChance = decorationChance(biome);
      const decorChanceNext = decorationChance(nextBiome);
      const decorThreshold = decorChance * (1 - hostilityFrac) + decorChanceNext * hostilityFrac;

      // Use noise value as probability threshold — higher noise = more likely feature
      if (obstacleNoise < obstacleThreshold) {
        tiles[i] = hostilityFrac > 0.5 && rng() < hostilityFrac
          ? pickObstacle(nextBiome, rng, Math.floor(hostility) + 1)
          : pickObstacle(biome, rng, hostilityFloor);
      } else if (lavaNoise < hostileThreshold) {
        tiles[i] = pickHostile(biome, rng, "lava");
      } else if (voidNoise < hostileThreshold) {
        tiles[i] = pickHostile(biome, rng, "void");
      } else if (decorNoise < decorThreshold) {
        tiles[i] = pickDecoration(biome, rng);
      }
    }
  }

  // golf course in meadow chunks near the office — reduced from 85% to avoid flattening
  const nearOffice = (cx >= -1 && cx <= 1 && cy >= 0 && cy <= 1);
  if (biome === "meadow" && nearOffice && rng() < 0.40) {
    placeGolfCourseNearOffice(tiles, rng, cx, cy);
  } else if (biome === "meadow" && rng() < 0.35) {
    placeGolfCourse(tiles, rng);
  }

  // rock formations — walls and ridges that block paths in wasteland/desert
  if (biome === "wasteland" && rng() < 0.70) {
    placeRockFormation(tiles, rng);
  }
  if (biome === "wasteland" && rng() < 0.40) {
    placeRockFormation(tiles, rng);
  }

  // obstacle clusters — groves of trees, rock piles, ruin fragments in all biomes
  if (rng() < 0.65) {
    placeObstacleCluster(tiles, biome, rng);
  }
  if (rng() < 0.45) {
    placeObstacleCluster(tiles, biome, rng);
  }
  if (rng() < 0.25) {
    placeObstacleCluster(tiles, biome, rng);
  }

  // big rocks — multi-tile boulders in outer biomes
  if (hostility >= 1 && rng() < 0.35) {
    placeBigRock(tiles, rng);
  }
  if (hostility >= 2 && rng() < 0.25) {
    placeBigRock(tiles, rng);
  }

  // leprechaun agent — small chance to spawn near a big tree in forest/ruins
  if ((biome === "forest" || biome === "ruins") && hostility >= 2 && rng() < 0.15) {
    placeLeprechaun(tiles, rng);
  }

  // brick fortresses — enterable structures far from the office (~150+ tiles)
  const chunkDist = Math.hypot(cx, cy);
  if (chunkDist >= 5 && rng() < 0.15) {
    placeBrickTower(tiles, biome, rng);
  }

  // park features in meadow — benches, hedges, ponds (more frequent near office)
  if (biome === "meadow" && rng() < (nearOffice ? 0.50 : 0.25)) {
    placeParkFeature(tiles, rng);
  }

  // fountains in meadow — decorative water feature right outside the office
  if (biome === "meadow" && rng() < (nearOffice ? 0.50 : 0.25)) {
    placeFountain(tiles, rng);
  }

  // tree clusters near office for a lively feel
  if (biome === "meadow" && nearOffice && rng() < 0.45) {
    placeTreeCluster(tiles, rng);
  }

  // tennis courts — placed 50-75 tiles from the office (chunk dist ~1.5-2.5)
  const tennisDist = Math.hypot(cx, cy);
  if ((biome === "meadow" || biome === "forest") && tennisDist >= 1.5 && tennisDist <= 2.5 && rng() < 0.15) {
    placeTennisCourt(tiles, rng);
  }

  // water features — grouped clusters of 6+ tiles, more common near office
  const hRounded = Math.round(hostility);
  if ((biome === "meadow" || biome === "forest" || biome === "ruins") && rng() < (hRounded === 0 ? 0.35 : hRounded === 1 ? 0.25 : 0.15)) {
    placeWaterCluster(tiles, rng);
  }

  // acid vat clusters — rare, only in ruins/wasteland
  if ((biome === "ruins" || biome === "wasteland") && rng() < 0.08) {
    placeAcidCluster(tiles, rng);
  }

  // scattered hostile tiles — interspersed single lava/void tiles for maze-like terrain
  if (hostility >= 2 && rng() < 0.35) {
    placeScatteredHostile(tiles, rng, TILE.LAVA, 3 + Math.floor(rng() * 5));
  }
  if (hostility >= 3 && rng() < 0.35) {
    placeScatteredHostile(tiles, rng, TILE.VOID, 3 + Math.floor(rng() * 5));
  }

  // occasional large structures in mid-to-far biomes
  if (hostility >= 2 && rng() < 0.15) {
    placeStructure(tiles, biome, rng);
  }

  // paths radiate outward from origin in near biomes
  if (hostility <= 1 && rng() < 0.3) {
    const len = 8 + Math.floor(rng() * 16);
    const dir = Math.floor(rng() * 4);
    carvePath(tiles, CHUNK_SIZE / 2, CHUNK_SIZE / 2, dir, len);
  }

  // Thinning pass — break up clumps of stone tiles (ROCK, RUIN, CRYSTAL)
  // into winding maze-like lines. Any stone tile with 3+ cardinal stone
  // neighbors is converted back to base ground so no tile touches more
  // than 2 stone neighbors in orthogonal directions.
  thinStoneTiles(tiles, biome);

  return { cx, cy, biome, tiles };
}

function baseGround(biome: Biome): number {
  switch (biome) {
    case "meadow": return TILE.GRASS;
    case "forest": return TILE.GRASS;
    case "ruins": return TILE.PATH;
    case "wasteland": return TILE.SAND;
    case "void": return TILE.GRASS; // walkable ground, void tiles are scattered hazards
    case "infernal": return TILE.SAND; // walkable ground, lava is scattered
  }
}

const STONE_TILES = new Set<number>([TILE.ROCK, TILE.RUIN, TILE.CRYSTAL, TILE.BIG_ROCK]);

/** Thinning pass — convert any stone tile with 3+ cardinal stone neighbors back
 *  to base ground. This breaks clumps into winding 1-2 tile wide lines so no
 *  stone tile touches more than 2 stone neighbors orthogonally. */
function thinStoneTiles(tiles: number[], biome: Biome): void {
  const ground = baseGround(biome);
  const toRemove: number[] = [];
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const i = idx(x, y);
      if (!STONE_TILES.has(tiles[i])) continue;
      let count = 0;
      if (y > 0 && STONE_TILES.has(tiles[i - CHUNK_SIZE])) count++;
      if (y < CHUNK_SIZE - 1 && STONE_TILES.has(tiles[i + CHUNK_SIZE])) count++;
      if (x > 0 && STONE_TILES.has(tiles[i - 1])) count++;
      if (x < CHUNK_SIZE - 1 && STONE_TILES.has(tiles[i + 1])) count++;
      if (count >= 3) toRemove.push(i);
    }
  }
  for (const i of toRemove) tiles[i] = ground;
}

/** Secondary ground tile for visual texture patches within a biome. */
function groundVariation(biome: Biome): number {
  switch (biome) {
    case "meadow": return TILE.PATH;     // dirt patches in the grass
    case "forest": return TILE.SAND;      // sandy forest clearings
    case "ruins": return TILE.SAND;       // sandy rubble over old paths
    case "wasteland": return TILE.PATH;   // cracked earth patches in sand
    case "void": return TILE.SAND;        // pale sand patches
    case "infernal": return TILE.PATH;    // scorched earth patches
  }
}

function pickObstacle(biome: Biome, rng: () => number, hostility: number): number {
  // Big trees and big rocks become more common farther from the office
  const bigTreeChance = Math.max(0, (hostility - 1) * 0.15);
  const bigRockChance = Math.max(0, (hostility - 1) * 0.12);
  switch (biome) {
    case "meadow":
      return rng() < 0.5 ? TILE.TREE : TILE.HEDGE;
    case "forest":
      if (rng() < bigTreeChance) return TILE.BIG_TREE;
      if (rng() < bigRockChance * 0.5) return TILE.BIG_ROCK;
      return rng() < 0.7 ? TILE.TREE : TILE.ROCK;
    case "ruins":
      if (rng() < bigTreeChance * 0.5) return TILE.BIG_TREE;
      if (rng() < bigRockChance) return TILE.BIG_ROCK;
      return rng() < 0.4 ? TILE.RUIN : TILE.ROCK;
    case "wasteland":
      if (rng() < bigRockChance) return TILE.BIG_ROCK;
      return rng() < 0.5 ? TILE.ROCK : TILE.RUIN;
    case "void":
      if (rng() < bigRockChance * 0.5) return TILE.BIG_ROCK;
      return rng() < 0.5 ? TILE.CRYSTAL : TILE.ROCK;
    case "infernal":
      if (rng() < bigRockChance * 0.5) return TILE.BIG_ROCK;
      return rng() < 0.5 ? TILE.CRYSTAL : TILE.RUIN;
  }
}

function pickHostile(biome: Biome, rng: () => number, type: "lava" | "void"): number {
  switch (biome) {
    case "void":
      return type === "void" ? TILE.VOID : TILE.LAVA;
    case "infernal":
      return type === "lava" ? TILE.LAVA : TILE.VOID;
    case "wasteland":
      return type === "void" ? TILE.VOID : TILE.LAVA;
    case "ruins":
      return type === "lava" ? TILE.LAVA : TILE.RUIN;
    default:
      return TILE.ROCK;
  }
}

function pickDecoration(biome: Biome, rng: () => number): number {
  switch (biome) {
    case "meadow":
      return rng() < 0.4 ? TILE.FLOWER : TILE.BUSH;
    case "forest":
      return rng() < 0.4 ? TILE.FLOWER : TILE.BUSH;
    case "ruins":
      return rng() < 0.5 ? TILE.RUIN : TILE.BUSH;
    case "wasteland":
      return rng() < 0.6 ? TILE.ROCK : TILE.RUIN;
    case "void":
      return rng() < 0.5 ? TILE.CRYSTAL : TILE.ROCK;
    case "infernal":
      return rng() < 0.5 ? TILE.CRYSTAL : TILE.RUIN;
  }
}

function decorationChance(biome: Biome): number {
  switch (biome) {
    case "meadow": return 0.20;
    case "forest": return 0.15;
    case "ruins": return 0.12;
    case "wasteland": return 0.10;
    case "void": return 0.06;
    case "infernal": return 0.06;
  }
}

/** Place a rock formation — walls and ridges of ROCK tiles that block paths in the wasteland.
 *  Forms either a linear ridge, an L-shaped wall, or a scattered boulder field. */
function placeRockFormation(tiles: number[], rng: () => number): void {
  const formType = Math.floor(rng() * 3);
  const cx = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  const cy = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));

  if (formType === 0) {
    // Linear ridge — 8-16 tiles long, 1-2 tiles thick
    const len = 8 + Math.floor(rng() * 9);
    const thick = 1 + Math.floor(rng() * 2);
    const horizontal = rng() < 0.5;
    for (let d = 0; d < len; d++) {
      for (let t = 0; t < thick; t++) {
        const px = horizontal ? cx + d : cx + t;
        const py = horizontal ? cy + t : cy + d;
        if (px >= 0 && px < CHUNK_SIZE && py >= 0 && py < CHUNK_SIZE) {
          if (canOverwrite(tiles, idx(px, py))) tiles[idx(px, py)] = TILE.ROCK;
        }
      }
      // occasional gap so the ridge is passable
      if (d > 2 && rng() < 0.15) d++;
    }
  } else if (formType === 1) {
    // L-shaped wall — two segments meeting at a corner
    const len1 = 5 + Math.floor(rng() * 6);
    const len2 = 5 + Math.floor(rng() * 6);
    for (let d = 0; d < len1; d++) {
      const px = cx + d;
      if (px < CHUNK_SIZE && canOverwrite(tiles, idx(px, cy))) tiles[idx(px, cy)] = TILE.ROCK;
    }
    for (let d = 0; d < len2; d++) {
      const py = cy + d;
      if (py < CHUNK_SIZE && canOverwrite(tiles, idx(cx, py))) tiles[idx(cx, py)] = TILE.ROCK;
    }
  } else {
    // Boulder field — cluster of 8-16 rocks in a rough circle
    const count = 8 + Math.floor(rng() * 9);
    const r = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * r;
      const px = Math.round(cx + Math.cos(angle) * dist);
      const py = Math.round(cy + Math.sin(angle) * dist);
      if (px >= 0 && px < CHUNK_SIZE && py >= 0 && py < CHUNK_SIZE) {
        if (canOverwrite(tiles, idx(px, py))) tiles[idx(px, py)] = TILE.ROCK;
      }
    }
  }
}

/** Place a big rock — 2x2 cluster of ROCK with a BIG_ROCK tile on top. */
function placeBigRock(tiles: number[], rng: () => number): void {
  const cx = 2 + Math.floor(rng() * (CHUNK_SIZE - 4));
  const cy = 2 + Math.floor(rng() * (CHUNK_SIZE - 4));
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < CHUNK_SIZE && py < CHUNK_SIZE && canOverwrite(tiles, idx(px, py))) {
        tiles[idx(px, py)] = TILE.ROCK;
      }
    }
  }
  if (cx < CHUNK_SIZE && cy < CHUNK_SIZE) tiles[idx(cx, cy)] = TILE.BIG_ROCK;
}

/** Place an obstacle cluster — a dense grove/pile of biome-appropriate obstacles. */
function placeObstacleCluster(tiles: number[], biome: Biome, rng: () => number): void {
  const cx = 3 + Math.floor(rng() * (CHUNK_SIZE - 6));
  const cy = 3 + Math.floor(rng() * (CHUNK_SIZE - 6));
  const r = 2 + Math.floor(rng() * 3); // radius 2-4
  const density = 0.55 + rng() * 0.25; // 55-80% fill

  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && rng() < density && canOverwrite(tiles, idx(x, y))) {
        tiles[idx(x, y)] = pickObstacle(biome, rng, 0);
      }
    }
  }
}

/** Place a tree cluster — dense grove of trees for a lively feel near the office. */
function placeTreeCluster(tiles: number[], rng: () => number): void {
  const cx = 3 + Math.floor(rng() * (CHUNK_SIZE - 6));
  const cy = 3 + Math.floor(rng() * (CHUNK_SIZE - 6));
  const r = 3 + Math.floor(rng() * 3); // radius 3-5
  const density = 0.50 + rng() * 0.20;

  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && rng() < density && canOverwrite(tiles, idx(x, y))) {
        tiles[idx(x, y)] = rng() < 0.3 ? TILE.BIG_TREE : TILE.TREE;
      }
    }
  }
}

/** Place a water cluster — large organic body, 20-100 tiles. */
function placeWaterCluster(tiles: number[], rng: () => number): void {
  const cx = 6 + Math.floor(rng() * (CHUNK_SIZE - 12));
  const cy = 6 + Math.floor(rng() * (CHUNK_SIZE - 12));
  const r = 3 + Math.floor(rng() * 4); // radius 3-6
  for (let y = cy - r - 1; y <= cy + r + 1; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE) continue;
      const d = Math.hypot(x - cx, y - cy);
      // organic irregular edge — noise-based threshold
      const edgeNoise = (Math.sin(x * 2.3) + Math.cos(y * 1.7) + rng() * 1.5) * 0.8;
      if (d <= r + edgeNoise && canOverwrite(tiles, idx(x, y))) {
        tiles[idx(x, y)] = TILE.WATER;
      }
    }
  }
}

/** Place an acid vat cluster — small group of acid tiles. */
function placeAcidCluster(tiles: number[], rng: () => number): void {
  const cx = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  const cy = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  const count = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const ax = cx + Math.floor((rng() - 0.5) * 4);
    const ay = cy + Math.floor((rng() - 0.5) * 4);
    if (ax >= 0 && ax < CHUNK_SIZE && ay >= 0 && ay < CHUNK_SIZE) {
      const ai = idx(ax, ay);
      if (canOverwrite(tiles, ai)) tiles[ai] = TILE.ACID;
    }
  }
}

/** Place scattered hostile tiles — single-tile placements spread across the chunk
 *  for an interspersed, maze-like pattern instead of clumped pools. */
function placeScatteredHostile(tiles: number[], rng: () => number, tileType: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const lx = Math.floor(rng() * CHUNK_SIZE);
    const ly = Math.floor(rng() * CHUNK_SIZE);
    if (canOverwrite(tiles, idx(lx, ly))) tiles[idx(lx, ly)] = tileType;
  }
}

/** Place a leprechaun agent near a big tree, with an axe to trade. */
function placeLeprechaun(tiles: number[], rng: () => number): void {
  // Find a big tree in the chunk
  const bigTrees: { x: number; y: number }[] = [];
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      if (tiles[idx(x, y)] === TILE.BIG_TREE) bigTrees.push({ x, y });
    }
  }
  if (bigTrees.length === 0) return;

  const tree = bigTrees[Math.floor(rng() * bigTrees.length)];

  // Find a walkable tile adjacent to the big tree
  const offsets = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [dx, dy] of offsets) {
    const lx = tree.x + dx;
    const ly = tree.y + dy;
    if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
      const t = tiles[idx(lx, ly)];
      if (t === TILE.GRASS || t === TILE.PATH || t === TILE.SAND || t === TILE.FLOWER) {
        tiles[idx(lx, ly)] = TILE.LEPRECHAUN;
        // Place an axe tile next to the leprechaun (the axe they offer)
        const ax = lx + (dx === 0 ? 1 : 0);
        const ay = ly + (dy === 0 ? 1 : 0);
        if (ax >= 0 && ax < CHUNK_SIZE && ay >= 0 && ay < CHUNK_SIZE) {
          const at = tiles[idx(ax, ay)];
          if (at === TILE.GRASS || at === TILE.PATH || at === TILE.SAND || at === TILE.FLOWER) {
            tiles[idx(ax, ay)] = TILE.AXE;
          }
        }
        return;
      }
    }
  }
}

/**
 * Place a golf course near the office with varied tee box position.
 * The tee box is placed 10-20 tiles from the office door in a random
 * direction (down, down-left, down-right, left, or right).
 * The course is placed within the given chunk, positioned so the tee
 * box lands at the varied offset.
 */
function placeGolfCourseNearOffice(tiles: number[], rng: () => number, cx: number, cy: number): void {
  const fw = 14 + Math.floor(rng() * 6); // 14-19 wide
  const fh = 12 + Math.floor(rng() * 6); // 12-17 tall

  // The office door is at world tile (~14, 0) — top of chunk (0,0).
  // Pick a target tee position 10-20 tiles from the door in a varied direction.
  // Direction options: straight down, down-left, down-right, left, right
  const doorX = 14;
  const doorY = 0;
  const dist = 10 + Math.floor(rng() * 11); // 10-20 tiles
  const angle = rng();
  let teeWorldX: number, teeWorldY: number;
  if (angle < 0.35) {
    // straight down
    teeWorldX = doorX + Math.floor((rng() - 0.5) * 6);
    teeWorldY = doorY + dist;
  } else if (angle < 0.55) {
    // down-left
    teeWorldX = doorX - dist;
    teeWorldY = doorY + Math.floor(dist * 0.6);
  } else if (angle < 0.75) {
    // down-right
    teeWorldX = doorX + dist;
    teeWorldY = doorY + Math.floor(dist * 0.6);
  } else if (angle < 0.88) {
    // left
    teeWorldX = doorX - dist;
    teeWorldY = doorY + 2 + Math.floor(rng() * 4);
  } else {
    // right
    teeWorldX = doorX + dist;
    teeWorldY = doorY + 2 + Math.floor(rng() * 4);
  }

  // Convert world tile to chunk-local coordinates
  const localTeeX = teeWorldX - cx * CHUNK_SIZE;
  const localTeeY = teeWorldY - cy * CHUNK_SIZE;

  // Place the fairway centered on the tee, with tee at the near end (toward the door)
  // The fairway extends away from the door from the tee box.
  // Direction from door to tee = the "forward" direction of the course
  const dirDx = teeWorldX - doorX;
  const dirDy = teeWorldY - doorY;
  const dirLen = Math.hypot(dirDx, dirDy) || 1;
  const fwdX = dirDx / dirLen;
  const fwdY = dirDy / dirLen;

  // Fairway origin: tee is near the start, course extends forward
  // Place tee at ~1/4 into the fairway along the forward direction
  const teeOffsetAlong = Math.floor(fh * 0.25);
  const fairwayCenterX = localTeeX + Math.round(fwdX * (fh * 0.5 - teeOffsetAlong));
  const fairwayCenterY = localTeeY + Math.round(fwdY * (fh * 0.5 - teeOffsetAlong));

  // For simplicity, use axis-aligned fairway (snap to dominant direction)
  const horizontal = Math.abs(fwdX) > Math.abs(fwdY);
  let ox: number, oy: number;
  if (horizontal) {
    // course is laid out horizontally
    ox = fairwayCenterX - Math.floor(fh / 2); // use fh as length along x
    oy = fairwayCenterY - Math.floor(fw / 2); // use fw as width along y
  } else {
    // course is laid out vertically (standard)
    ox = fairwayCenterX - Math.floor(fw / 2);
    oy = fairwayCenterY - Math.floor(fh / 2);
  }

  // Clamp to chunk bounds
  ox = Math.max(1, Math.min(CHUNK_SIZE - (horizontal ? fh : fw) - 1, ox));
  oy = Math.max(1, Math.min(CHUNK_SIZE - (horizontal ? fw : fh) - 1, oy));

  const courseW = horizontal ? fh : fw;
  const courseH = horizontal ? fw : fh;

  // fairway
  for (let y = oy; y < oy + courseH; y++) {
    for (let x = ox; x < ox + courseW; x++) {
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        tiles[idx(x, y)] = TILE.FAIRWAY;
      }
    }
  }

  // tee box — 3x3 at the near end (toward the door)
  const teeLocalX = Math.max(ox + 1, Math.min(ox + courseW - 2, localTeeX));
  const teeLocalY = Math.max(oy + 1, Math.min(oy + courseH - 2, localTeeY));
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = teeLocalX + dx;
      const ty = teeLocalY + dy;
      if (tx >= ox && tx < ox + courseW && ty >= oy && ty < oy + courseH) {
        tiles[idx(tx, ty)] = TILE.TEE_BOX;
      }
    }
  }

  // sand trap 1 — mid-course
  const st1x = ox + Math.floor(courseW * 0.35);
  const st1y = oy + Math.floor(courseH * 0.5);
  const st1R = 2 + Math.floor(rng() * 2);
  for (let y = st1y - st1R; y <= st1y + st1R; y++) {
    for (let x = st1x - st1R; x <= st1x + st1R; x++) {
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        if (Math.hypot(x - st1x, y - st1y) <= st1R && canOverwrite(tiles, idx(x, y))) {
          tiles[idx(x, y)] = TILE.SAND_TRAP;
        }
      }
    }
  }

  // sand trap 2 — near the flag
  const st2x = ox + Math.floor(courseW * 0.65);
  const st2y = oy + courseH - 4;
  const st2R = 2 + Math.floor(rng() * 2);
  for (let y = st2y - st2R; y <= st2y + st2R; y++) {
    for (let x = st2x - st2R; x <= st2x + st2R; x++) {
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        if (Math.hypot(x - st2x, y - st2y) <= st2R && canOverwrite(tiles, idx(x, y))) {
          tiles[idx(x, y)] = TILE.SAND_TRAP;
        }
      }
    }
  }

  // water hazard — small pond on one side
  if (rng() < 0.5) {
    const px = ox + Math.floor(courseW * 0.7);
    const py = oy + Math.floor(courseH * 0.5);
    const pR = 2 + Math.floor(rng() * 2);
    for (let y = py - pR; y <= py + pR; y++) {
      for (let x = px - pR; x <= px + pR; x++) {
        if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
          if (Math.hypot(x - px, y - py) <= pR && canOverwrite(tiles, idx(x, y))) {
            tiles[idx(x, y)] = TILE.POND;
          }
        }
      }
    }
  }

  // flag at the far end (opposite from the tee / door)
  const flagX = ox + Math.floor(courseW / 2);
  const flagY = oy + courseH - 2;
  tiles[idx(flagX, flagY)] = TILE.GOLF_FLAG;

  // golf ball at the tee
  tiles[idx(teeLocalX, teeLocalY)] = TILE.GOLF_BALL;

  // golf club next to the ball
  const clubOffset = rng() < 0.5 ? -1 : 1;
  const clubX = Math.max(ox, Math.min(ox + courseW - 1, teeLocalX + clubOffset));
  tiles[idx(clubX, teeLocalY)] = TILE.GOLF_CLUB;
}

/** Place an expanded golf course — wider fairway, tee area with club & ball, sand traps, water hazard, and flag. */
function placeGolfCourse(tiles: number[], rng: () => number): void {
  const fw = 10 + Math.floor(rng() * 8); // 10-17 wide
  const fh = 10 + Math.floor(rng() * 8); // 10-17 tall
  const ox = 2 + Math.floor(rng() * (CHUNK_SIZE - fw - 4));
  const oy = 2 + Math.floor(rng() * (CHUNK_SIZE - fh - 4));
  for (let y = oy; y < oy + fh; y++) {
    for (let x = ox; x < ox + fw; x++) {
      tiles[idx(x, y)] = TILE.FAIRWAY;
    }
  }

  // tee box — 3x3 distinct raised area at the near end (top)
  const teeX = ox + Math.floor(fw / 2);
  const teeY = oy + 2;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = teeX + dx;
      const ty = teeY + dy;
      if (tx >= ox && tx < ox + fw && ty >= oy && ty < oy + fh) {
        tiles[idx(tx, ty)] = TILE.TEE_BOX;
      }
    }
  }

  // sand trap 1 — mid-left
  const st1x = ox + Math.floor(fw * 0.25);
  const st1y = oy + Math.floor(fh * 0.4);
  const st1R = 2 + Math.floor(rng() * 2);
  for (let y = st1y - st1R; y <= st1y + st1R; y++) {
    for (let x = st1x - st1R; x <= st1x + st1R; x++) {
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        if (Math.hypot(x - st1x, y - st1y) <= st1R) {
          tiles[idx(x, y)] = TILE.SAND_TRAP;
        }
      }
    }
  }

  // sand trap 2 — near the flag for challenge
  const st2x = ox + Math.floor(fw * 0.6);
  const st2y = oy + fh - 4;
  const st2R = 2 + Math.floor(rng() * 2);
  for (let y = st2y - st2R; y <= st2y + st2R; y++) {
    for (let x = st2x - st2R; x <= st2x + st2R; x++) {
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        if (Math.hypot(x - st2x, y - st2y) <= st2R) {
          tiles[idx(x, y)] = TILE.SAND_TRAP;
        }
      }
    }
  }

  // water hazard — small pond on one side
  if (rng() < 0.5) {
    const px = ox + Math.floor(fw * 0.7);
    const py = oy + Math.floor(fh * 0.5);
    const pR = 2 + Math.floor(rng() * 2);
    for (let y = py - pR; y <= py + pR; y++) {
      for (let x = px - pR; x <= px + pR; x++) {
        if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
          if (Math.hypot(x - px, y - py) <= pR) {
            tiles[idx(x, y)] = TILE.POND;
          }
        }
      }
    }
  }

  // flag at the far end
  const flagX = ox + Math.floor(fw / 2);
  const flagY = oy + fh - 2;
  tiles[idx(flagX, flagY)] = TILE.GOLF_FLAG;

  // golf ball at the tee
  tiles[idx(teeX, teeY)] = TILE.GOLF_BALL;

  // golf club next to the ball
  const clubOffset = rng() < 0.5 ? -1 : 1;
  const clubX = Math.max(ox, Math.min(ox + fw - 1, teeX + clubOffset));
  tiles[idx(clubX, teeY)] = TILE.GOLF_CLUB;
}

/** Place a park feature — pond, bench, or hedge garden. */
function placeParkFeature(tiles: number[], rng: () => number): void {
  const type = Math.floor(rng() * 3);
  const cx = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  const cy = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));

  if (type === 0) {
    // pond
    const r = 3 + Math.floor(rng() * 3);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
          if (Math.hypot(x - cx, y - cy) <= r && canOverwrite(tiles, idx(x, y))) {
            tiles[idx(x, y)] = TILE.POND;
          }
        }
      }
    }
  } else if (type === 1) {
    // bench surrounded by flowers
    if (canOverwrite(tiles, idx(cx, cy))) tiles[idx(cx, cy)] = TILE.BENCH;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE) {
          if (tiles[idx(nx, ny)] === TILE.GRASS) {
            tiles[idx(nx, ny)] = TILE.FLOWER;
          }
        }
      }
    }
  } else {
    // hedge garden — small maze of hedges
    for (let y = cy; y < cy + 5 && y < CHUNK_SIZE; y++) {
      for (let x = cx; x < cx + 5 && x < CHUNK_SIZE; x++) {
        if ((x + y) % 2 === 0 && canOverwrite(tiles, idx(x, y))) {
          tiles[idx(x, y)] = TILE.HEDGE;
        }
      }
    }
  }
}

/** Place a fountain — stone basin with surrounding flowers. */
function placeFountain(tiles: number[], rng: () => number): void {
  const cx = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  const cy = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  // place fountain center
  if (canOverwrite(tiles, idx(cx, cy))) {
    tiles[idx(cx, cy)] = TILE.FOUNTAIN;
  }
  // surround with flowers for a garden feel
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE) {
        if (tiles[idx(nx, ny)] === TILE.GRASS && rng() < 0.6) {
          tiles[idx(nx, ny)] = TILE.FLOWER;
        }
      }
    }
  }
}

/** Place a brick fortress — large enterable structure with CASTLE walls, corner towers, and a door. */
function placeBrickTower(tiles: number[], biome: Biome, rng: () => number): void {
  const size = 8 + Math.floor(rng() * 5); // 8-12 tiles square — fortress-scale
  const ox = 2 + Math.floor(rng() * (CHUNK_SIZE - size - 4));
  const oy = 2 + Math.floor(rng() * (CHUNK_SIZE - size - 4));
  const floor = baseGround(biome);

  // clear interior to floor
  for (let y = oy; y < oy + size; y++) {
    for (let x = ox; x < ox + size; x++) {
      if (canOverwrite(tiles, idx(x, y))) tiles[idx(x, y)] = floor;
    }
  }

  // perimeter walls
  for (let x = ox; x < ox + size; x++) {
    if (canOverwrite(tiles, idx(x, oy))) tiles[idx(x, oy)] = TILE.CASTLE;
    if (canOverwrite(tiles, idx(x, oy + size - 1))) tiles[idx(x, oy + size - 1)] = TILE.CASTLE;
  }
  for (let y = oy; y < oy + size; y++) {
    if (canOverwrite(tiles, idx(ox, y))) tiles[idx(ox, y)] = TILE.CASTLE;
    if (canOverwrite(tiles, idx(ox + size - 1, y))) tiles[idx(ox + size - 1, y)] = TILE.CASTLE;
  }

  // reinforce corners with 2x2 tower blocks
  for (const [cx, cy] of [[ox, oy], [ox + size - 2, oy], [ox, oy + size - 2], [ox + size - 2, oy + size - 2]]) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        tiles[idx(cx + dx, cy + dy)] = TILE.CASTLE;
      }
    }
  }

  // door gap on the bottom wall (facing the player approaching from the office)
  const doorX = ox + Math.floor(size / 2);
  tiles[idx(doorX, oy + size - 1)] = floor;
  // widen to a 2-tile gate
  if (doorX + 1 < ox + size - 1) tiles[idx(doorX + 1, oy + size - 1)] = floor;

  // 40% chance of a second gate on the top wall for through-passage
  if (rng() < 0.4) {
    tiles[idx(doorX, oy)] = floor;
    if (doorX + 1 < ox + size - 1) tiles[idx(doorX + 1, oy)] = floor;
  }

  // interior pillar — gives the fortress a ruined/structural feel
  if (size >= 10) {
    const px = ox + Math.floor(size / 2);
    const py = oy + Math.floor(size / 2);
    tiles[idx(px, py)] = TILE.CASTLE;
  }
}

/** Place a small structure: a castle, ruin cluster, or crystal formation. */
function placeStructure(tiles: number[], biome: Biome, rng: () => number): void {
  const w = 4 + Math.floor(rng() * 8);
  const h = 4 + Math.floor(rng() * 8);
  const ox = 2 + Math.floor(rng() * (CHUNK_SIZE - w - 4));
  const oy = 2 + Math.floor(rng() * (CHUNK_SIZE - h - 4));

  const wallTile = biome === "infernal" || biome === "void" ? TILE.CRYSTAL : TILE.CASTLE;

  // perimeter walls
  for (let x = ox; x < ox + w; x++) {
    if (canOverwrite(tiles, idx(x, oy))) tiles[idx(x, oy)] = wallTile;
    if (canOverwrite(tiles, idx(x, oy + h - 1))) tiles[idx(x, oy + h - 1)] = wallTile;
  }
  for (let y = oy; y < oy + h; y++) {
    if (canOverwrite(tiles, idx(ox, y))) tiles[idx(ox, y)] = wallTile;
    if (canOverwrite(tiles, idx(ox + w - 1, y))) tiles[idx(ox + w - 1, y)] = wallTile;
  }
  // door gap
  const doorX = ox + Math.floor(w / 2);
  tiles[idx(doorX, oy + h - 1)] = baseGround(biome);
  tiles[idx(doorX, oy)] = baseGround(biome);
}

/** Place a tennis court — rectangular hard court with walls, net, racket, and ball. */
function placeTennisCourt(tiles: number[], rng: () => number): void {
  const cw = 10 + Math.floor(rng() * 4); // 10-13 wide
  const ch = 14 + Math.floor(rng() * 4); // 14-17 tall
  const ox = 2 + Math.floor(rng() * (CHUNK_SIZE - cw - 4));
  const oy = 2 + Math.floor(rng() * (CHUNK_SIZE - ch - 4));

  // court surface
  for (let y = oy; y < oy + ch; y++) {
    for (let x = ox; x < ox + cw; x++) {
      tiles[idx(x, y)] = TILE.TENNIS_COURT;
    }
  }

  // back wall at the far end (top) — the ball bounces off this
  for (let x = ox; x < ox + cw; x++) {
    tiles[idx(x, oy)] = TILE.TENNIS_WALL;
  }
  // side walls — partial, just corners for visual framing
  for (let y = oy; y < oy + 3; y++) {
    tiles[idx(ox, y)] = TILE.TENNIS_WALL;
    tiles[idx(ox + cw - 1, y)] = TILE.TENNIS_WALL;
  }

  // net across the middle — decorative, slows the ball
  const netY = oy + Math.floor(ch / 2);
  for (let x = ox + 1; x < ox + cw - 1; x++) {
    tiles[idx(x, netY)] = TILE.TENNIS_NET;
  }

  // tennis racket placed near the bottom (player side)
  const racketX = ox + Math.floor(cw / 2) + (rng() < 0.5 ? -2 : 2);
  const racketY = oy + ch - 3;
  tiles[idx(Math.max(ox + 1, Math.min(ox + cw - 2, racketX)), racketY)] = TILE.TENNIS_RACKET;

  // tennis ball placed on the court, between the net and the wall
  const ballX = ox + Math.floor(cw / 2);
  const ballY = oy + Math.floor(ch * 0.3);
  tiles[idx(ballX, ballY)] = TILE.TENNIS_BALL;
}

function carvePath(tiles: number[], startX: number, startY: number, dir: number, len: number): void {
  let x = Math.floor(startX);
  let y = Math.floor(startY);
  for (let i = 0; i < len; i++) {
    if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
      if (tiles[idx(x, y)] === TILE.GRASS || tiles[idx(x, y)] === TILE.SAND) {
        tiles[idx(x, y)] = TILE.PATH;
      }
    }
    if (dir === 0) y--;
    else if (dir === 1) x++;
    else if (dir === 2) y++;
    else x--;
  }
}

/** Check if a world tile is walkable. */
export function isWalkable(tile: number): boolean {
  switch (tile) {
    case TILE.GRASS:
    case TILE.PATH:
    case TILE.FLOWER:
    case TILE.SAND:
    case TILE.SNOW:
    case TILE.LAVA:
    case TILE.VOID:
    case TILE.FAIRWAY:
    case TILE.SAND_TRAP:
    case TILE.POND:
    case TILE.BUSH:
    case TILE.GOLF_CLUB:
    case TILE.GOLF_BALL:
    case TILE.GOLF_FLAG:
    case TILE.AXE:
    case TILE.LEPRECHAUN:
    case TILE.TEE_BOX:
    case TILE.TENNIS_COURT:
    case TILE.TENNIS_RACKET:
    case TILE.TENNIS_BALL:
    case TILE.TENNIS_NET:
      return true;
    default:
      return false;
  }
}

/** Speed multiplier for a tile (1 = normal, <1 = slow). */
export function tileSpeed(tile: number): number {
  switch (tile) {
    case TILE.BUSH:
      return 0.4;
    case TILE.SAND_TRAP:
      return 0.5;
    case TILE.POND:
      return 0.6;
    case TILE.TENNIS_NET:
      return 0.3;
    default:
      return 1;
  }
}

/** Damage per second from standing on a tile (0 = safe, Infinity = instant death). */
export function tileDamage(tile: number): number {
  switch (tile) {
    case TILE.VOID:
      return Infinity; // instant death — the void consumes you
    case TILE.LAVA:
      return 40;
    default:
      return 0;
  }
}

/** Get the tile at absolute world coordinates from a chunk's tile array. */
export function tileAt(chunk: Chunk, worldTileX: number, worldTileY: number): number {
  const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk.tiles[localY * CHUNK_SIZE + localX];
}
