import type { Hex, Vec2 } from "./types";

export const HEX_SIZE = 32;

const SQRT3 = Math.sqrt(3);

export const HEX_NEIGHBORS: readonly Hex[] = [
  { q: +1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: +1 },
  { q: 0, r: -1 },
  { q: +1, r: -1 },
  { q: -1, r: +1 },
];

export function hexToPixel(q: number, r: number, size: number = HEX_SIZE): Vec2 {
  return {
    x: size * (1.5 * q),
    y: size * (SQRT3 * (r + q / 2)),
  };
}

export function pixelToHex(x: number, y: number, size: number = HEX_SIZE): Hex {
  const q = (2 / 3 * x) / size;
  const r = (-1 / 3 * x + SQRT3 / 3 * y) / size;
  return hexRound(q, r);
}

export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
  else if (rDiff > sDiff) rr = -rq - rs;
  return { q: rq, r: rr };
}

export function hexDistance(a: Hex, b: Hex): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((-a.q - a.r) - (-b.q - b.r))) / 2;
}

export function hexNeighbors(q: number, r: number): Hex[] {
  return HEX_NEIGHBORS.map(({ q: dq, r: dr }) => ({ q: q + dq, r: r + dr }));
}

export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  const results: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const q = a.q + (b.q - a.q) * t;
    const r = a.r + (b.r - a.r) * t;
    results.push(hexRound(q, r));
  }
  return results;
}

export function hexRing(center: Hex, radius: number): Hex[] {
  if (radius === 0) return [center];
  const results: Hex[] = [];
  let hex = {
    q: center.q + HEX_NEIGHBORS[4].q * radius,
    r: center.r + HEX_NEIGHBORS[4].r * radius,
  };
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push({ ...hex });
      hex = { q: hex.q + HEX_NEIGHBORS[i].q, r: hex.r + HEX_NEIGHBORS[i].r };
    }
  }
  return results;
}

export function hexSpiral(center: Hex, maxRadius: number): Hex[] {
  const results: Hex[] = [center];
  for (let radius = 1; radius <= maxRadius; radius++) {
    results.push(...hexRing(center, radius));
  }
  return results;
}

export function hexArea(radius: number): number {
  return 1 + 3 * radius * (radius + 1);
}

export function hexInRange(center: Hex, range: number): Hex[] {
  const results: Hex[] = [];
  for (let dq = -range; dq <= range; dq++) {
    const r1 = Math.max(-range, -dq - range);
    const r2 = Math.min(range, -dq + range);
    for (let dr = r1; dr <= r2; dr++) {
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexFromKey(key: string): Hex {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

export function hexLerp(a: Hex, b: Hex, t: number): Hex {
  const q = a.q + (b.q - a.q) * t;
  const r = a.r + (b.r - a.r) * t;
  return hexRound(q, r);
}

export const HEX_VERTICES: readonly Vec2[] = (() => {
  const verts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    verts.push({
      x: HEX_SIZE * Math.cos(angle),
      y: HEX_SIZE * Math.sin(angle),
    });
  }
  return verts;
})();

export function hexCorners(q: number, r: number, size: number = HEX_SIZE): Vec2[] {
  const center = hexToPixel(q, r, size);
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i;
    return {
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    };
  });
}

export function hexContainsPoint(q: number, r: number, px: number, py: number, size: number = HEX_SIZE): boolean {
  const center = hexToPixel(q, r, size);
  const dx = Math.abs(px - center.x) / size;
  const dy = Math.abs(py - center.y) / size;
  return dx < 1 && dy < SQRT3 / 2 && dx * 2 + dy / (SQRT3 / 2) < SQRT3;
}
