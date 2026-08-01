/**
 * fal.ai API client for the AI asset pipeline.
 *
 * Wraps four models:
 *   1. PATINA Material  (fal-ai/patina/material)   — text → tileable PBR set
 *   2. PATINA Image-to-Map (fal-ai/patina)          — image → PBR maps
 *   3. Recraft V4.1     (fal-ai/recraft/v4.1/text-to-vector) — text → SVG
 *   4. Nano Banana 2    (fal-ai/nano-banana-2)      — text → raster image
 *
 * All calls go through the @fal-ai/client SDK. Set FAL_KEY env var.
 */
import { fal } from "@fal-ai/client";

// --------------------------------------------------------------------- types

export type PBRMapType = "basecolor" | "normal" | "roughness" | "metalness" | "height";

export interface PBRResult {
  /** Base texture image URL (the generated texture, not a specific map). */
  base: string;
  /** Map of PBR map type → image URL. */
  maps: Partial<Record<PBRMapType, string>>;
  /** Seed used for generation. */
  seed: number;
}

export interface SvgResult {
  /** SVG file URL. */
  url: string;
  /** SVG file name (e.g. "image.svg"). */
  fileName: string;
}

export interface ImageResult {
  /** Image URL. */
  url: string;
  /** Image width. */
  width: number;
  /** Image height. */
  height: number;
}

// ----------------------------------------------------------------- PATINA M.

/**
 * Generate a complete tileable PBR material set from a text prompt.
 * Returns basecolor + normal + roughness + metalness + height maps.
 *
 * Cost: ~$0.08 per 1024×1024 call with all 5 maps.
 */
export async function patinaMaterial(
  prompt: string,
  opts: {
    seed?: number;
    imageSize?: string;
    tilingMode?: "both" | "horizontal" | "vertical";
    maps?: PBRMapType[];
  } = {},
): Promise<PBRResult> {
  const result = await fal.subscribe("fal-ai/patina/material", {
    input: {
      prompt,
      image_size: opts.imageSize ?? "square_hd",
      tiling_mode: opts.tilingMode ?? "both",
      maps: opts.maps ?? ["basecolor", "normal", "roughness", "metalness", "height"],
      output_format: "png",
      seed: opts.seed,
      num_images: 1,
      enable_safety_checker: false,
    },
  });

  const images = (result.data as { images: Array<{ url: string; map_type?: PBRMapType }> }).images;
  const maps: Partial<Record<PBRMapType, string>> = {};
  let base = "";

  for (const img of images) {
    if (img.map_type) {
      maps[img.map_type] = img.url;
    } else {
      base = img.url;
    }
  }

  return { base, maps, seed: (result.data as { seed: number }).seed };
}

// ----------------------------------------------------------------- PATINA i2m

/**
 * Extract PBR maps from an existing image (e.g. a rasterized SVG sprite
 * or a Nano Banana 2 generated image).
 *
 * Cost: ~$0.06 per 1024×1024 call with all 5 maps.
 */
export async function patinaImageToMap(
  imageUrl: string,
  opts: {
    maps?: PBRMapType[];
  } = {},
): Promise<PBRResult> {
  const result = await fal.subscribe("fal-ai/patina", {
    input: {
      image_url: imageUrl,
      maps: opts.maps ?? ["basecolor", "normal", "roughness", "metalness", "height"],
      output_format: "png",
    },
  });

  const images = (result.data as { images: Array<{ url: string; map_type?: PBRMapType }> }).images;
  const maps: Partial<Record<PBRMapType, string>> = {};
  let base = "";

  for (const img of images) {
    if (img.map_type) {
      maps[img.map_type] = img.url;
    } else {
      base = img.url;
    }
  }

  return { base, maps, seed: 0 };
}

// ----------------------------------------------------------- Recraft V4.1 SVG

/**
 * Generate a true SVG vector file from a text prompt.
 * Used for furniture sprites, props, trees, and UI icons.
 *
 * Cost: $0.08 per SVG (standard tier).
 */
export async function recraftTextToVector(
  prompt: string,
  opts: {
    seed?: number;
  } = {},
): Promise<SvgResult> {
  const result = await fal.subscribe("fal-ai/recraft/v4.1/text-to-vector", {
    input: {
      prompt,
    },
  });

  const images = (result.data as { images: Array<{ url: string; file_name: string }> }).images;
  const img = images[0];
  if (!img) throw new Error("Recraft V4.1 returned no images");

  return { url: img.url, fileName: img.file_name };
}

// --------------------------------------------------------- Nano Banana 2 raster

/**
 * Generate a raster image from a text prompt.
 * Used for complex sprites (crystals, mystic trees) and backgrounds
 * where vector art can't capture the needed detail.
 *
 * Cost: ~$0.05 per image.
 */
export async function nanoBanana2(
  prompt: string,
  opts: {
    seed?: number;
    imageSize?: string;
  } = {},
): Promise<ImageResult> {
  const result = await fal.subscribe("fal-ai/nano-banana-2", {
    input: {
      prompt,
      image_size: opts.imageSize ?? "1024x1024",
      seed: opts.seed,
      num_images: 1,
      enable_safety_checker: false,
    },
  });

  const images = (result.data as { images: Array<{ url: string; width: number; height: number }> }).images;
  const img = images[0];
  if (!img) throw new Error("Nano Banana 2 returned no images");

  return { url: img.url, width: img.width, height: img.height };
}

// ----------------------------------------------------- Nano Banana 2 Edit (i2i)

/**
 * Edit/generate an image from a reference image using Nano Banana 2 Edit.
 * Pass up to 14 reference image URLs + a text prompt describing the edit.
 * The model maintains character/subject consistency across generations.
 *
 * Cost: ~$0.08 per image (same as text-to-image).
 */
export async function nanoBanana2Edit(
  prompt: string,
  imageUrls: string[],
  opts: {
    seed?: number;
    aspectRatio?: string;
    resolution?: string;
    numImages?: number;
  } = {},
): Promise<ImageResult> {
  const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt,
      image_urls: imageUrls,
      seed: opts.seed,
      num_images: opts.numImages ?? 1,
      aspect_ratio: (opts.aspectRatio ?? "1:1") as any,
      resolution: (opts.resolution ?? "1K") as any,
      output_format: "png",
      enable_safety_checker: false,
    } as any,
  });

  const images = (result.data as { images: Array<{ url: string; width: number; height: number }> }).images;
  const img = images[0];
  if (!img) throw new Error("Nano Banana 2 Edit returned no images");

  return { url: img.url, width: img.width, height: img.height };
}

// ----------------------------------------------------- Hunyuan 3D Rapid (i23d)

export interface Model3DResult {
  /** URL of the generated GLB file. */
  glbUrl: string;
}

/**
 * Generate a 3D model (GLB) from a single front-view image using Hunyuan 3D Rapid.
 * The input image should have a simple background with the object occupying >50% of frame.
 *
 * Set enablePbr=true to get metallic, roughness, and normal textures baked into the GLB.
 *
 * Cost: ~$0.225/generation + $0.15 for PBR = ~$0.375 per creature with PBR.
 */
export async function hunyuan3dRapid(
  imageUrl: string,
  opts: {
    enablePbr?: boolean;
  } = {},
): Promise<Model3DResult> {
  const result = await fal.subscribe("fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d", {
    input: {
      input_image_url: imageUrl,
      enable_pbr: opts.enablePbr ?? true,
      enable_geometry: false,
    },
  });

  const data = result.data as { model_glb?: { url: string }; glb?: { url: string } };
  const glbUrl = data.model_glb?.url ?? data.glb?.url;
  if (!glbUrl) throw new Error(`Hunyuan 3D Rapid returned no GLB: ${JSON.stringify(data).slice(0, 300)}`);

  return { glbUrl };
}

// ------------------------------------------------------------- Bria bg remove

/**
 * Remove background from an image using Bria's background removal model.
 * Returns the URL of the processed image with transparent background.
 *
 * Cost: ~$0.02 per image.
 */
export async function removeBackground(imageUrl: string): Promise<string> {
  const result = await fal.subscribe("fal-ai/bria/background/remove", {
    input: {
      image_url: imageUrl,
    },
  });

  const data = result.data as Record<string, unknown>;
  // Bria may return { images: [{ url }] } or { image: { url } } or { result_url }
  if (Array.isArray(data.images) && data.images[0]) {
    return (data.images[0] as { url: string }).url;
  }
  if (data.image && typeof data.image === "object" && "url" in data.image) {
    return (data.image as { url: string }).url;
  }
  if (typeof data.result_url === "string") {
    return data.result_url;
  }
  throw new Error(`Unexpected Bria RMBG response: ${JSON.stringify(data).slice(0, 300)}`);
}

// --------------------------------------------------------------- URL → buffer

/**
 * Download a URL and return a Buffer.
 */
export async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}
