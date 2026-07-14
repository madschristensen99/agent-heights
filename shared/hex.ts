/**
 * Flat-top hexagon grid math — odd-q offset coordinates.
 *
 * Flat-top hexagons have flat edges on top and bottom, pointy left and right.
 * Neighbors: N, S, NE, NW, SE, SW (no pure E or W).
 *
 * In odd-q offset: odd columns are shifted DOWN by half a row spacing.
 *
 * WASD mapping:
 *   W → N, S → S (direct neighbors)
 *   W+D → NE, W+A → NW
 *   S+D → SE, S+A → SW
 *   A/D alone → resolved by last vertical direction or default to NW/NE
 *
 * Pixel layout (circumradius = HEX_SIZE):
 *   Column spacing (horizontal) = size * 1.5
 *   Row spacing (vertical)      = size * sqrt(3)
 *   Odd column vertical offset  = size * sqrt(3) / 2
 */

export const SQRT3 = Math.sqrt(3);

/** Distance from hex center to any vertex (circumradius). */
export const HEX_SIZE = 64;

/** Horizontal spacing between hex columns = size * 1.5. */
export const HEX_COL_SPACING = HEX_SIZE * 1.5;

/** Vertical spacing between hexes in a column = size * sqrt(3). */
export const HEX_ROW_SPACING = HEX_SIZE * SQRT3;

/** Vertical offset for odd columns (shifted down by half row spacing). */
export const HEX_COL_OFFSET = HEX_ROW_SPACING / 2;

/** Hex width (left point to right point) = 2 * size. */
export const HEX_WIDTH = HEX_SIZE * 2;

/** Hex height (top flat edge to bottom flat edge) = size * sqrt(3). */
export const HEX_HEIGHT = HEX_ROW_SPACING;

/** Hex coordinate in offset (col, row) system. */
export interface HexCoord {
  col: number;
  row: number;
}

/** 6 hex directions for flat-top odd-q offset. */
export type HexDir = "n" | "s" | "nw" | "ne" | "sw" | "se";

export const HEX_DIRS: HexDir[] = ["n", "s", "nw", "ne", "sw", "se"];

/**
 * Convert hex offset coordinates (col, row) to pixel coordinates (x, y).
 * Returns the CENTER of the hex.
 */
export function hexToPixel(col: number, row: number): { x: number; y: number } {
  const x = col * HEX_COL_SPACING + HEX_SIZE;
  const y = row * HEX_ROW_SPACING + HEX_COL_OFFSET * (col & 1) + HEX_SIZE;
  return { x, y };
}

/**
 * Convert pixel coordinates to hex offset coordinates (col, row).
 * Finds the nearest hex center by testing the closest column and its neighbors.
 */
export function pixelToHex(px: number, py: number): { col: number; row: number } {
  const col = Math.round((px - HEX_SIZE) / HEX_COL_SPACING);
  const yOffset = (col & 1) * HEX_COL_OFFSET;
  const row = Math.round((py - HEX_SIZE - yOffset) / HEX_ROW_SPACING);

  // Verify with nearest hex test (handle edge cases)
  // Check the 3 nearest hexes and pick the closest
  const candidates = [
    { col, row },
    { col: col - 1, row: col & 1 ? row : row - 1 },
    { col: col + 1, row: col & 1 ? row : row - 1 },
  ];

  let best = { col, row };
  let bestDist = Infinity;
  for (const c of candidates) {
    const center = hexToPixel(c.col, c.row);
    const d = (center.x - px) ** 2 + (center.y - py) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  return best;
}

/**
 * Get the 6 neighbors of a hex in flat-top odd-q offset coordinates.
 *
 * For even columns:
 *   N:  (col,     row - 1)
 *   S:  (col,     row + 1)
 *   NE: (col + 1, row - 1)
 *   NW: (col - 1, row - 1)
 *   SE: (col + 1, row)
 *   SW: (col - 1, row)
 *
 * For odd columns:
 *   N:  (col,     row - 1)
 *   S:  (col,     row + 1)
 *   NE: (col + 1, row)
 *   NW: (col - 1, row)
 *   SE: (col + 1, row + 1)
 *   SW: (col - 1, row + 1)
 */
export function hexNeighbors(col: number, row: number): Array<{ col: number; row: number; dir: HexDir }> {
  if (col & 1) {
    return [
      { col,         row: row - 1, dir: "n"  },
      { col,         row: row + 1, dir: "s"  },
      { col: col + 1, row,         dir: "ne" },
      { col: col - 1, row,         dir: "nw" },
      { col: col + 1, row: row + 1, dir: "se" },
      { col: col - 1, row: row + 1, dir: "sw" },
    ];
  } else {
    return [
      { col,         row: row - 1, dir: "n"  },
      { col,         row: row + 1, dir: "s"  },
      { col: col + 1, row: row - 1, dir: "ne" },
      { col: col - 1, row: row - 1, dir: "nw" },
      { col: col + 1, row,         dir: "se" },
      { col: col - 1, row,         dir: "sw" },
    ];
  }
}

/**
 * Hex distance between two hex coordinates (number of steps).
 * Converts to cube coordinates for distance calculation.
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const ac = offsetToCube(a.col, a.row);
  const bc = offsetToCube(b.col, b.row);
  return (Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y) + Math.abs(ac.z - bc.z)) / 2;
}

/**
 * Convert odd-q offset to cube coordinates.
 * Cube coords: x + y + z = 0
 *   x = col - (row - (col & 1)) / 2
 *   z = row
 *   y = -x - z
 */
export function offsetToCube(col: number, row: number): { x: number; y: number; z: number } {
  const x = col - (row - (col & 1)) / 2;
  const z = row;
  const y = -x - z;
  return { x, y, z };
}

/**
 * Convert cube coordinates to odd-q offset.
 */
export function cubeToOffset(x: number, y: number, z: number): HexCoord {
  const col = x + (z - (z & 1)) / 2;
  const row = z;
  return { col, row };
}

/**
 * Hex line drawing — returns all hexes on the line from a to b (inclusive).
 * Uses cube coordinate linear interpolation.
 */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const ac = offsetToCube(a.col, a.row);
  const bc = offsetToCube(b.col, b.row);
  const n = hexDistance(a, b);
  if (n === 0) return [a];

  const results: HexCoord[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ac.x + (bc.x - ac.x) * t;
    const y = ac.y + (bc.y - ac.y) * t;
    const z = ac.z + (bc.z - ac.z) * t;
    results.push(cubeToOffset(Math.round(x), Math.round(y), Math.round(z)));
  }
  return results;
}

/**
 * Check if a point (px, py) is inside a hex centered at (cx, cy).
 * Uses a simple bounding-box + distance check.
 */
export function pointInHex(px: number, py: number, cx: number, cy: number): boolean {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  // Bounding box check
  if (dx > HEX_SIZE) return false;
  if (dy > HEX_ROW_SPACING / 2) return false;
  // Sloped edge check (the two diagonal edges)
  return dx * SQRT3 / 2 + dy <= HEX_SIZE * SQRT3 / 2;
}

/**
 * Get the hex key string for use in Maps.
 */
export function hexKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Get all hexes within `radius` steps of the given center.
 */
export function hexRange(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = [];
  const cc = offsetToCube(center.col, center.row);
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = Math.max(-radius, -dx - radius); dy <= Math.min(radius, -dx + radius); dy++) {
      const dz = -dx - dy;
      results.push(cubeToOffset(cc.x + dx, cc.y + dy, cc.z + dz));
    }
  }
  return results;
}

/**
 * Draw a flat-top hexagon path on a canvas context.
 * Useful for rendering hex tiles, grid lines, etc.
 */
export function hexPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number = HEX_SIZE,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
