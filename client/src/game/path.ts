/** 8-directional A* over a boolean walkability grid. */

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
    [key(start.x, start.y), octile(goal.x - start.x, goal.y - start.y)],
  ]);

  const SQRT2 = Math.SQRT2;
  // 8 neighbours: 4 cardinal + 4 diagonal
  const neighbours: Array<[number, number, number]> = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
  ];
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
      return path;
    }

    for (const [dx, dy, cost] of neighbours) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!grid.ok(nx, ny)) continue;
      // Prevent corner-cutting: don't allow diagonal move if both
      // orthogonal neighbours are blocked (would squeeze through a wall corner)
      if (dx !== 0 && dy !== 0) {
        if (!grid.ok(current.x + dx, current.y) && !grid.ok(current.x, current.y + dy)) continue;
      }
      const nk = key(nx, ny);
      const tentative = (gScore.get(ck) ?? Infinity) + cost;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentative);
        fScore.set(nk, tentative + octile(goal.x - nx, goal.y - ny));
        if (!inOpen.has(nk)) {
          open.push({ x: nx, y: ny });
          inOpen.add(nk);
        }
      }
    }
  }
  return [];
}

/** Octile distance heuristic for 8-directional movement. */
function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return Math.max(ax, ay) + (Math.SQRT2 - 1) * Math.min(ax, ay);
}
