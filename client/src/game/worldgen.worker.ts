import { generateChunk, type Chunk } from "./worldgen";
import type { WorldTheme } from "../../../shared/types";

export interface ChunkRequest {
  worldSeed: number;
  cx: number;
  cy: number;
  theme?: WorldTheme | null;
}

export interface ChunkResult {
  cx: number;
  cy: number;
  biome: Chunk["biome"];
  tiles: number[];
}

self.onmessage = (e: MessageEvent<ChunkRequest>) => {
  const { worldSeed, cx, cy, theme } = e.data;
  const chunk = generateChunk(worldSeed, cx, cy, theme);
  const result: ChunkResult = {
    cx: chunk.cx,
    cy: chunk.cy,
    biome: chunk.biome,
    tiles: chunk.tiles,
  };
  (self as unknown as Worker).postMessage(result);
};
