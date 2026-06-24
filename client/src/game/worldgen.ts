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

/** Biome types — determined by distance from origin + noise. */
export type Biome = "office" | "ruins" | "overgrown" | "void";

export function biomeAt(worldSeed: number, cx: number, cy: number): Biome {
  const dist = Math.hypot(cx, cy);
  const rng = mulberry32(chunkSeed(worldSeed, cx, cy));
  const noise = rng();

  if (dist < 2) return "office";
  if (dist < 6) return noise < 0.6 ? "office" : "ruins";

  // far out — mix of ruins, overgrown, and void
  if (noise < 0.4) return "ruins";
  if (noise < 0.75) return "overgrown";
  return "void";
}

/**
 * A generated chunk: flat array of tile type integers, CHUNK_SIZE * CHUNK_SIZE.
 *
 * Layout strategy (hybrid labyrinth):
 * - Each chunk has 0–2 "rooms" (open rectangular areas)
 * - Corridors are carved connecting room centers to chunk edges
 *   (so adjacent chunks connect through their shared borders)
 * - The origin chunk (0,0) is always open (the door landing)
 */
export interface Chunk {
  cx: number;
  cy: number;
  biome: Biome;
  tiles: number[]; // length CHUNK_SIZE * CHUNK_SIZE
}

const idx = (x: number, y: number) => y * CHUNK_SIZE + x;

/**
 * Generate a chunk deterministically from the world seed + chunk coords.
 * Pure function — no side effects, no Phaser dependency.
 */
export function generateChunk(worldSeed: number, cx: number, cy: number): Chunk {
  const biome = biomeAt(worldSeed, cx, cy);
  const rng = mulberry32(chunkSeed(worldSeed, cx, cy));

  // start all walls
  const tiles = new Array<number>(CHUNK_SIZE * CHUNK_SIZE).fill(TILE.WALL);

  const isOrigin = cx === 0 && cy === 0;

  if (isOrigin) {
    // open landing area near the office door
    fillRect(tiles, 4, 4, CHUNK_SIZE - 4, CHUNK_SIZE - 4, TILE.FLOOR);
    // door at top-center
    tiles[idx(Math.floor(CHUNK_SIZE / 2), 0)] = TILE.FLOOR;
    return { cx, cy, biome, tiles };
  }

  // --- rooms ---
  const numRooms = rng() < 0.3 ? 0 : rng() < 0.6 ? 1 : 2;
  const rooms: Array<{ x: number; y: number; w: number; h: number }> = [];

  for (let i = 0; i < numRooms; i++) {
    const w = 5 + Math.floor(rng() * 10);
    const h = 5 + Math.floor(rng() * 10);
    const rx = 2 + Math.floor(rng() * (CHUNK_SIZE - w - 4));
    const ry = 2 + Math.floor(rng() * (CHUNK_SIZE - h - 4));
    rooms.push({ x: rx, y: ry, w, h });
    fillRect(tiles, rx, ry, rx + w, ry + h, TILE.FLOOR);
  }

  // --- corridors connecting to chunk edges ---
  // carve horizontal passage through the middle row
  if (rng() < 0.7) {
    const midY = Math.floor(CHUNK_SIZE / 2);
    carveH(tiles, 0, CHUNK_SIZE - 1, midY, 2 + Math.floor(rng() * 3));
  }
  // carve vertical passage through the middle col
  if (rng() < 0.7) {
    const midX = Math.floor(CHUNK_SIZE / 2);
    carveV(tiles, midX, 0, CHUNK_SIZE - 1, 2 + Math.floor(rng() * 3));
  }

  // connect room centers to the nearest corridor
  for (const room of rooms) {
    const ccx = room.x + Math.floor(room.w / 2);
    const ccy = room.y + Math.floor(room.h / 2);
    // connect to horizontal corridor
    carveH(tiles, ccx, Math.floor(CHUNK_SIZE / 2), ccy, 2);
    // connect to vertical corridor
    carveV(tiles, Math.floor(CHUNK_SIZE / 2), ccy, ccx, 2);
  }

  // --- biome-specific decorations ---
  decorate(tiles, biome, rng);

  return { cx, cy, biome, tiles };
}

function fillRect(tiles: number[], x0: number, y0: number, x1: number, y1: number, val: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      tiles[idx(x, y)] = val;
    }
  }
}

function carveH(tiles: number[], x0: number, x1: number, y: number, width: number): void {
  const half = Math.floor(width / 2);
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let dy = -half; dy <= half; dy++) {
      const yy = y + dy;
      if (yy >= 0 && yy < CHUNK_SIZE && x >= 0 && x < CHUNK_SIZE) {
        if (tiles[idx(x, yy)] === TILE.WALL) tiles[idx(x, yy)] = TILE.FLOOR;
      }
    }
  }
}

function carveV(tiles: number[], x: number, y0: number, y1: number, width: number): void {
  const half = Math.floor(width / 2);
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let dx = -half; dx <= half; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE) {
        if (tiles[idx(xx, y)] === TILE.WALL) tiles[idx(xx, y)] = TILE.FLOOR;
      }
    }
  }
}

function decorate(tiles: number[], biome: Biome, rng: () => number): void {
  if (biome === "ruins") {
    // scatter rubble and pillars on floor tiles
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILE.FLOOR && rng() < 0.04) {
        tiles[i] = rng() < 0.5 ? TILE.RUBBLE : TILE.PILLAR;
      }
    }
  } else if (biome === "overgrown") {
    // vines creeping across floors
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILE.FLOOR && rng() < 0.08) {
        tiles[i] = TILE.VINES;
      }
    }
  } else if (biome === "void") {
    // dark void patches — replace some floor with void
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILE.FLOOR && rng() < 0.15) {
        tiles[i] = TILE.VOID;
      }
    }
  } else if (biome === "office") {
    // occasional pillars in office hallways
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILE.FLOOR && rng() < 0.02) {
        tiles[i] = TILE.PILLAR;
      }
    }
  }
}

/** Check if a world tile is walkable (not wall/pillar/rubble/void). */
export function isWalkable(tile: number): boolean {
  return tile === TILE.FLOOR || tile === TILE.VINES;
}

/** Get the tile at absolute world coordinates from a chunk's tile array. */
export function tileAt(chunk: Chunk, worldTileX: number, worldTileY: number): number {
  const localX = ((worldTileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localY = ((worldTileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk.tiles[localY * CHUNK_SIZE + localX];
}
