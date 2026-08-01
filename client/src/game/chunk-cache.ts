/**
 * Persistent chunk canvas texture cache using IndexedDB.
 *
 * After a chunk is painted to a Phaser CanvasTexture, we serialize it to a
 * WebP blob and store it in IndexedDB.  On subsequent page loads, we check
 * IndexedDB before painting — if the blob exists, we load it as an image
 * and register it as a Phaser texture, skipping all canvas painting.
 *
 * Cache key: `${texKey}|ss${SS_FACTOR}` — includes supersample factor so
 * mobile (SS=1) and desktop (SS=2) caches don't collide.
 */

const DB_NAME = "agent-heights-chunks";
const STORE_NAME = "chunk-textures";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Build the full cache key including supersample factor. */
export function chunkCacheKey(texKey: string, ssFactor: number): string {
  return `${texKey}|ss${ssFactor}`;
}

/** Store a canvas texture as a PNG blob in IndexedDB. Fire-and-forget. */
export async function saveChunkCanvas(
  texKey: string,
  ssFactor: number,
  canvas: HTMLCanvasElement,
): Promise<void> {
  try {
    const key = chunkCacheKey(texKey, ssFactor);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.85),
    );
    if (!blob) return;
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // IndexedDB may be unavailable (private mode, quota) — silently skip
    console.warn("[chunk-cache] save failed:", e);
  }
}

/** Load a cached chunk canvas as an ImageBitmap (or HTMLImageElement fallback).
 *  Returns null if not found or on error. */
export async function loadChunkCanvas(
  texKey: string,
  ssFactor: number,
): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    const key = chunkCacheKey(texKey, ssFactor);
    const db = await getDB();
    const blob = await new Promise<Blob | undefined>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => resolve(undefined);
    });
    if (!blob) return null;

    // Prefer createImageBitmap (faster, no DOM reflow)
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(blob);
    }
    // Fallback: load via HTMLImageElement
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
    // Don't revoke immediately — Phaser needs the image source
    // It will be revoked when the texture is removed
    return img;
  } catch (e) {
    console.warn("[chunk-cache] load failed:", e);
    return null;
  }
}

/** Check if a cached chunk canvas exists in IndexedDB (without loading it). */
export async function hasChunkCanvas(
  texKey: string,
  ssFactor: number,
): Promise<boolean> {
  try {
    const key = chunkCacheKey(texKey, ssFactor);
    const db = await getDB();
    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).count(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    return count > 0;
  } catch {
    return false;
  }
}

/** Preload multiple chunk canvases from IndexedDB in parallel.
 *  Returns a map of texKey -> ImageBitmap/HTMLImageElement for hits. */
export async function preloadChunkCanvases(
  entries: { texKey: string; ssFactor: number }[],
): Promise<Map<string, ImageBitmap | HTMLImageElement>> {
  const results = new Map<string, ImageBitmap | HTMLImageElement>();
  const promises = entries.map(async ({ texKey, ssFactor }) => {
    const img = await loadChunkCanvas(texKey, ssFactor);
    if (img) results.set(texKey, img);
  });
  await Promise.all(promises);
  return results;
}

/** Remove a cached chunk canvas (used when tile overrides invalidate a chunk). */
export async function removeChunkCanvas(
  texKey: string,
  ssFactor: number,
): Promise<void> {
  try {
    const key = chunkCacheKey(texKey, ssFactor);
    const db = await getDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
