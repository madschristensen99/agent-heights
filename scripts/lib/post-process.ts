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
    .webp({ quality: 90 })
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

// --------------------------------------------------------------- upload helper

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
