/** Hex-grid A* over a boolean walkability grid.
 *  Tile {x, y} maps to hex offset {col, row}. */

import { hexNeighbors, hexDistance, type HexCoord } from "../../../shared/hex";

export interface Tile {
  x: number;
  y: number;
}

export class Grid {
  constructor(
    public width: number,
    public height: number,
    /** walkable[row][col] — indexed [y][x] */
    public walkable: boolean[][],
  ) {}

  ok(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.walkable[y][x];
  }
}

export function findPath(grid: Grid, start: Tile, goal: Tile): Tile[] {
  if (!grid.ok(goal.x, goal.y) || (start.x === goal.x && start.y === goal.y)) return [];

  const key = (x: number, y: number) => y * grid.width + x;
  const open: Tile[] = [start];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[key(start.x, start.y), 0]]);
  const startH = hexDistance(
    { col: start.x, row: start.y },
    { col: goal.x, row: goal.y },
  );
  const fScore = new Map<number, number>([[key(start.x, start.y), startH]]);
  const inOpen = new Set<number>([key(start.x, start.y)]);

  while (open.length > 0) {
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      const fa = fScore.get(key(open[i].x, open[i].y)) ?? Infinity;
      const fb = fScore.get(key(open[bestI].x, open[bestI].y)) ?? Infinity;
      if (fa < fb) bestI = i;
    }
    const current = open.splice(bestI, 1)[0];
    const ck = key(current.x, current.y);
    inOpen.delete(ck);

    if (current.x === goal.x && current.y === goal.y) {
      const path: Tile[] = [current];
      let k = ck;
      while (cameFrom.has(k)) {
        k = cameFrom.get(k)!;
        path.unshift({ x: k % grid.width, y: Math.floor(k / grid.width) });
      }
      path.shift();
      return path;
    }

    for (const n of hexNeighbors(current.x, current.y)) {
      const nx = n.col;
      const ny = n.row;
      if (!grid.ok(nx, ny)) continue;
      const nk = key(nx, ny);
      const tentative = (gScore.get(ck) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentative);
        const h = hexDistance(
          { col: nx, row: ny } as HexCoord,
          { col: goal.x, row: goal.y } as HexCoord,
        );
        fScore.set(nk, tentative + h);
        if (!inOpen.has(nk)) {
          open.push({ x: nx, y: ny });
          inOpen.add(nk);
        }
      }
    }
  }
  return [];
}
