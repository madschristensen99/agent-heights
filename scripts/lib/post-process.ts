/**
 * Post-processing utilities for the AI asset pipeline.
 *
 * - Rasterize SVG → PNG (for PBR extraction)
 * - Resize images to target dimensions (64×64, 128×128, etc.)
 * - Chroma key background removal (for sprites on solid-color backgrounds)
 * - Save images as WebP (PBR maps, rasterized sprites) or SVG (vector source)
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ----------------------------------------------------------------- SVG → PNG

/**
 * Rasterize an SVG buffer to a PNG buffer at the given size.
 * Used to convert Recraft V4.1 SVG output to raster for PATINA Image-to-Map.
 */
export async function rasterizeSvg(
  svgBuffer: Buffer,
  size: number = 1024,
): Promise<Buffer> {
  return sharp(svgBuffer, { density: 300 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 255, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
}

// ------------------------------------------------------------------- resize

/**
 * Resize an image buffer to target dimensions and encode as WebP.
 */
export async function resizeToWebP(
  input: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(input)
    .resize(width, height, { fit: "fill" })
    .webp({ lossless: true })
    .toBuffer();
}

/**
 * Resize an image buffer to target dimensions and encode as PNG.
 */
export async function resizeToPNG(
  input: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(input)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

/**
 * Center-crop an image to square, then resize to target size as PNG.
 * Better for game sprites where source aspect ratio may not be square.
 */
export async function resizeSquarePNG(
  input: Buffer,
  size: number,
): Promise<Buffer> {
  const image = sharp(input);
  const meta = await image.metadata();
  const w = meta.width ?? size;
  const h = meta.height ?? size;
  const minDim = Math.min(w, h);
  const left = Math.floor((w - minDim) / 2);
  const top = Math.floor((h - minDim) / 2);
  return sharp(input)
    .extract({ left, top, width: minDim, height: minDim })
    .resize(size, size, { fit: "fill" })
    .png()
    .toBuffer();
}

// ------------------------------------------------------- chroma key bg remove

/**
 * Remove a solid-color background from an image using chroma keying.
 * Replaces pixels close to the target color with transparency.
 *
 * @param input   Image buffer (PNG or WebP)
 * @param targetR  Target red channel (0-255)
 * @param targetG  Target green channel (0-255)
 * @param targetB  Target blue channel (0-255)
 * @param threshold  Color distance threshold (0-255, higher = more aggressive)
 */
export async function chromaKey(
  input: Buffer,
  targetR: number,
  targetG: number,
  targetB: number,
  threshold: number = 30,
): Promise<Buffer> {
  const image = sharp(input);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt(
      (r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2,
    );
    if (dist < threshold) {
      data[i + 3] = 0; // Set alpha to 0 (transparent)
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

/**
 * Remove green screen background (common for AI-generated sprites).
 * Green = (0, 255, 0).
 */
export function removeGreenScreen(input: Buffer, threshold = 30): Promise<Buffer> {
  return chromaKey(input, 0, 255, 0, threshold);
}

// ------------------------------------------------------------- save utilities

/**
 * Save a buffer to a file, creating parent directories as needed.
 */
export function saveBuffer(filePath: string, buffer: Buffer): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}

/**
 * Save an SVG string to a file, creating parent directories as needed.
 */
export function saveSvg(filePath: string, svgContent: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, svgContent, "utf-8");
}

// ------------------------------------------------------------- upload helper

/**
 * Slice a grid sprite sheet into individual frame buffers.
 * Uses content-aware detection: scans for transparent column/row gaps
 * to find frame boundaries. Falls back to uniform slicing if detection fails.
 *
 * @param input     Grid image buffer (PNG, already background-removed)
 * @param cols      Number of columns in the grid
 * @param rows      Number of rows in the grid
 * @param frameSize Target frame size (each frame is resized to frameSize × frameSize)
 * @returns Array of frame buffers in row-major order (left-to-right, top-to-bottom)
 */
export async function sliceGrid(
  input: Buffer,
  cols: number,
  rows: number,
  frameSize: number,
): Promise<Buffer[]> {
  const image = sharp(input);
  const meta = await image.metadata();
  const w = meta.width!;
  const h = meta.height!;
  const hasAlpha = meta.channels === 4;

  // Try content-aware slicing: find transparent column/row boundaries
  let frameBounds: { x: number; y: number; w: number; h: number }[] | null = null;

  if (hasAlpha) {
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

    // Find column boundaries: a column is "empty" if all its pixels are transparent
    const colEmpty = new Array(w).fill(true);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const idx = (y * w + x) * info.channels;
        if (data[idx + 3] > 16) { colEmpty[x] = false; break; }
      }
    }

    // Find row boundaries similarly
    const rowEmpty = new Array(h).fill(true);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * info.channels;
        if (data[idx + 3] > 16) { rowEmpty[y] = false; break; }
      }
    }

    // Find content column ranges (non-empty runs)
    const colRanges: { start: number; end: number }[] = [];
    let inRange = false;
    let rangeStart = 0;
    for (let x = 0; x <= w; x++) {
      const empty = x < w ? colEmpty[x] : true;
      if (!empty && !inRange) { inRange = true; rangeStart = x; }
      else if (empty && inRange) { inRange = false; colRanges.push({ start: rangeStart, end: x }); }
    }

    // Find content row ranges
    const rowRanges: { start: number; end: number }[] = [];
    inRange = false;
    rangeStart = 0;
    for (let y = 0; y <= h; y++) {
      const empty = y < h ? rowEmpty[y] : true;
      if (!empty && !inRange) { inRange = true; rangeStart = y; }
      else if (empty && inRange) { inRange = false; rowRanges.push({ start: rangeStart, end: y }); }
    }

    // If we found the right number of ranges, use content-aware bounds
    if (colRanges.length === cols && rowRanges.length === rows) {
      frameBounds = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          frameBounds.push({
            x: colRanges[c].start,
            y: rowRanges[r].start,
            w: colRanges[c].end - colRanges[c].start,
            h: rowRanges[r].end - rowRanges[r].start,
          });
        }
      }
    }
  }

  // Fallback: uniform slicing
  if (!frameBounds) {
    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);
    frameBounds = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        frameBounds.push({ x: c * cellW, y: r * cellH, w: cellW, h: cellH });
      }
    }
  }

  // Extract and resize each frame
  const frames: Buffer[] = [];
  for (const fb of frameBounds) {
    const frame = await sharp(input)
      .extract({ left: fb.x, top: fb.y, width: fb.w, height: fb.h })
      .resize(frameSize, frameSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    frames.push(frame);
  }

  return frames;
}

/**
 * Upload a buffer to fal.ai storage and return the URL.
 * Used when we need to pass a local image to PATINA Image-to-Map.
 *
 * Uses fal.storage.upload via the SDK.
 */
export async function uploadToFal(buffer: Buffer, _fileName: string): Promise<string> {
  const { fal } = await import("@fal-ai/client");
  const blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
  const url = await fal.storage.upload(blob);
  return url;
}
