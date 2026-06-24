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

/**
 * Biome types — determined by distance from the office (origin).
 * The farther out you go, the more hostile the environment.
 *
 *   meadow  →  forest  →  ruins  →  wasteland  →  void  →  infernal
 *   peaceful ............................................ hostile
 */
export type Biome = "meadow" | "forest" | "ruins" | "wasteland" | "void" | "infernal";

/** Hostility level 0–5, scales with distance from origin. */
export function hostilityAt(cx: number, cy: number): number {
  const dist = Math.hypot(cx, cy);
  if (dist < 2) return 0; // meadow — safe zone near office
  if (dist < 4) return 1; // forest
  if (dist < 7) return 2; // ruins
  if (dist < 11) return 3; // wasteland
  if (dist < 16) return 4; // void
  return 5; // infernal
}

export function biomeAt(_worldSeed: number, cx: number, cy: number): Biome {
  const h = hostilityAt(cx, cy);
  return (["meadow", "forest", "ruins", "wasteland", "void", "infernal"] as Biome[])[h];
}

export interface Chunk {
  cx: number;
  cy: number;
  biome: Biome;
  tiles: number[];
}

const idx = (x: number, y: number) => y * CHUNK_SIZE + x;

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

  // base ground tile for this biome
  const baseTile = baseGround(biome);
  const tiles = new Array<number>(CHUNK_SIZE * CHUNK_SIZE).fill(baseTile);

  // scatter features based on biome + hostility
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const i = idx(x, y);
      const r = rng();

      // obstacle density increases with hostility
      const obstacleChance = 0.02 + hostility * 0.05;
      const hostileChance = hostility >= 2 ? (hostility - 1) * 0.05 : 0;

      if (r < obstacleChance) {
        tiles[i] = pickObstacle(biome, rng);
      } else if (r < obstacleChance + hostileChance) {
        tiles[i] = pickHostile(biome, rng);
      } else if (r < obstacleChance + hostileChance + decorationChance(biome)) {
        tiles[i] = pickDecoration(biome, rng);
      }
    }
  }

  // golf course in meadow chunks near the office
  if (biome === "meadow" && rng() < 0.4) {
    placeGolfCourse(tiles, rng);
  }

  // park features in meadow — benches, hedges, ponds
  if (biome === "meadow" && rng() < 0.25) {
    placeParkFeature(tiles, rng);
  }

  // water features — grouped clusters of 6+ tiles, more common near office
  if ((biome === "meadow" || biome === "forest" || biome === "ruins") && rng() < (hostility === 0 ? 0.35 : hostility === 1 ? 0.25 : 0.15)) {
    placeWaterCluster(tiles, rng);
  }

  // acid vat clusters — rare, only in ruins/wasteland
  if ((biome === "ruins" || biome === "wasteland") && rng() < 0.08) {
    placeAcidCluster(tiles, rng);
  }

  // lava patches — random in infernal/wasteland/ruins
  if (hostility >= 2 && rng() < 0.12) {
    placeLavaPatch(tiles, rng);
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

  return { cx, cy, biome, tiles };
}

function baseGround(biome: Biome): number {
  switch (biome) {
    case "meadow": return TILE.GRASS;
    case "forest": return TILE.GRASS;
    case "ruins": return TILE.PATH;
    case "wasteland": return TILE.SAND;
    case "void": return TILE.VOID;
    case "infernal": return TILE.LAVA;
  }
}

function pickObstacle(biome: Biome, rng: () => number): number {
  switch (biome) {
    case "meadow":
      return rng() < 0.5 ? TILE.TREE : TILE.HEDGE;
    case "forest":
      return rng() < 0.8 ? TILE.TREE : TILE.ROCK;
    case "ruins":
      return rng() < 0.5 ? TILE.RUIN : TILE.ROCK;
    case "wasteland":
      return rng() < 0.6 ? TILE.ROCK : TILE.RUIN;
    case "void":
      return rng() < 0.5 ? TILE.CRYSTAL : TILE.ROCK;
    case "infernal":
      return rng() < 0.5 ? TILE.CRYSTAL : TILE.RUIN;
  }
}

function pickHostile(biome: Biome, rng: () => number): number {
  switch (biome) {
    case "void":
      return TILE.VOID;
    case "infernal":
      return TILE.LAVA;
    case "wasteland":
      return rng() < 0.4 ? TILE.VOID : TILE.LAVA;
    case "ruins":
      return rng() < 0.5 ? TILE.LAVA : TILE.RUIN;
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
      return TILE.PATH;
    case "wasteland":
      return TILE.SAND;
    default:
      return baseGround(biome);
  }
}

function decorationChance(biome: Biome): number {
  switch (biome) {
    case "meadow": return 0.12;
    case "forest": return 0.05;
    case "ruins": return 0.02;
    default: return 0;
  }
}

/** Place a water cluster — minimum 6 tiles grouped together. */
function placeWaterCluster(tiles: number[], rng: () => number): void {
  const cx = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  const cy = 4 + Math.floor(rng() * (CHUNK_SIZE - 8));
  const r = 2 + Math.floor(rng() * 2); // radius 2-3 → 12-28 tiles
  let count = 0;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r + rng() * 0.5) {
          tiles[idx(x, y)] = TILE.WATER;
          count++;
        }
      }
    }
  }
  // ensure minimum 6 tiles
  if (count < 6) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
          tiles[idx(x, y)] = TILE.WATER;
        }
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
      tiles[idx(ax, ay)] = TILE.ACID;
    }
  }
}

/** Place a random lava patch. */
function placeLavaPatch(tiles: number[], rng: () => number): void {
  const cx = 2 + Math.floor(rng() * (CHUNK_SIZE - 4));
  const cy = 2 + Math.floor(rng() * (CHUNK_SIZE - 4));
  const count = 1 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const lx = cx + Math.floor((rng() - 0.5) * 6);
    const ly = cy + Math.floor((rng() - 0.5) * 6);
    if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
      tiles[idx(lx, ly)] = TILE.LAVA;
    }
  }
}

/** Place a golf course hole — fairway, sand trap, and flag. */
function placeGolfCourse(tiles: number[], rng: () => number): void {
  const fw = 6 + Math.floor(rng() * 6);
  const fh = 6 + Math.floor(rng() * 6);
  const ox = 2 + Math.floor(rng() * (CHUNK_SIZE - fw - 4));
  const oy = 2 + Math.floor(rng() * (CHUNK_SIZE - fh - 4));

  // fairway — lighter green
  for (let y = oy; y < oy + fh; y++) {
    for (let x = ox; x < ox + fw; x++) {
      tiles[idx(x, y)] = TILE.FAIRWAY;
    }
  }
  // sand trap
  const stx = ox + Math.floor(fw * 0.3);
  const sty = oy + Math.floor(fh * 0.3);
  const stR = 2 + Math.floor(rng() * 2);
  for (let y = sty - stR; y <= sty + stR; y++) {
    for (let x = stx - stR; x <= stx + stR; x++) {
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        if (Math.hypot(x - stx, y - sty) <= stR) {
          tiles[idx(x, y)] = TILE.SAND_TRAP;
        }
      }
    }
  }
  // flag at the far end
  const flagX = ox + Math.floor(fw / 2);
  const flagY = oy + fh - 2;
  tiles[idx(flagX, flagY)] = TILE.GOLF_FLAG;
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
          if (Math.hypot(x - cx, y - cy) <= r) {
            tiles[idx(x, y)] = TILE.POND;
          }
        }
      }
    }
  } else if (type === 1) {
    // bench surrounded by flowers
    tiles[idx(cx, cy)] = TILE.BENCH;
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
        if ((x + y) % 2 === 0) {
          tiles[idx(x, y)] = TILE.HEDGE;
        }
      }
    }
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
    tiles[idx(x, oy)] = wallTile;
    tiles[idx(x, oy + h - 1)] = wallTile;
  }
  for (let y = oy; y < oy + h; y++) {
    tiles[idx(ox, y)] = wallTile;
    tiles[idx(ox + w - 1, y)] = wallTile;
  }
  // door gap
  const doorX = ox + Math.floor(w / 2);
  tiles[idx(doorX, oy + h - 1)] = baseGround(biome);
  tiles[idx(doorX, oy)] = baseGround(biome);
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
    case TILE.FAIRWAY:
    case TILE.SAND_TRAP:
    case TILE.POND:
    case TILE.BUSH:
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
    default:
      return 1;
  }
}

/** Damage per second from standing on a tile (0 = safe, Infinity = instant death). */
export function tileDamage(tile: number): number {
  switch (tile) {
    case TILE.VOID:
      return Infinity;
    case TILE.LAVA:
      return 20;
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
