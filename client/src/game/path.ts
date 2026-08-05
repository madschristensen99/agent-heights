/** Minimal 4-directional A* over a boolean walkability grid. */

export interface Tile {
  x: number;
  y: number;
}

export class Grid {
  constructor(
    public width: number,
    public height: number,
    /** walkable[y][x] */
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
  const fScore = new Map<number, number>([
    [key(start.x, start.y), Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y)],
  ]);
  const inOpen = new Set<number>([key(start.x, start.y)]);

  while (open.length > 0) {
    // lowest fScore in open (linear scan; maps are tiny)
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
      path.shift(); // drop the start tile
      return smoothPath(path, grid);
    }

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!grid.ok(nx, ny)) continue;
      const nk = key(nx, ny);
      const tentative = (gScore.get(ck) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentative);
        fScore.set(nk, tentative + Math.abs(goal.x - nx) + Math.abs(goal.y - ny));
        if (!inOpen.has(nk)) {
          open.push({ x: nx, y: ny });
          inOpen.add(nk);
        }
      }
    }
  }
  return [];
}

/** Post-process A* path: collapse staircase L-patterns into diagonal steps. */
function smoothPath(path: Tile[], grid: Grid): Tile[] {
  if (path.length < 3) return path;
  const result: Tile[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    if (i + 2 < path.length) {
      const a = path[i];
      const c = path[i + 2];
      // If a and c are diagonal neighbours, skip the intermediate L-step
      if (Math.abs(c.x - a.x) === 1 && Math.abs(c.y - a.y) === 1) {
        // Ensure both orthogonal corners are walkable (no cutting through walls)
        if (grid.ok(a.x, c.y) && grid.ok(c.x, a.y)) {
          result.push(c);
          i += 2;
          continue;
        }
      }
    }
    result.push(path[i + 1]);
    i++;
  }
  return result;
}
