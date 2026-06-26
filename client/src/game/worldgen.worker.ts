import { generateChunk, type Chunk } from "./worldgen";

export interface ChunkRequest {
  worldSeed: number;
  cx: number;
  cy: number;
}

export interface ChunkResult {
  cx: number;
  cy: number;
  biome: Chunk["biome"];
  tiles: number[];
}

self.onmessage = (e: MessageEvent<ChunkRequest>) => {
  const { worldSeed, cx, cy } = e.data;
  const chunk = generateChunk(worldSeed, cx, cy);
  const result: ChunkResult = {
    cx: chunk.cx,
    cy: chunk.cy,
    biome: chunk.biome,
    tiles: chunk.tiles,
  };
  (self as unknown as Worker).postMessage(result);
};
