import { randomUUID } from "node:crypto";
import type { OfficeDecoration, DecorationPlacement } from "../shared/types";
import { DECORATION_CATALOG } from "../shared/types";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

const decorationStores = new Map<string, OfficeDecoration[]>();

function getStore(userId: string): OfficeDecoration[] {
  let store = decorationStores.get(userId);
  if (!store) {
    store = [];
    decorationStores.set(userId, store);
    // Load from DB
    if (isSupabaseConfigured) {
      void supabaseAdmin
        .from("heights_cloud_office_decorations")
        .select("decorations")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.decorations) {
            const decos = typeof data.decorations === "string" ? JSON.parse(data.decorations) : data.decorations;
            store!.push(...(decos as OfficeDecoration[]));
          }
        })
        .catch((err: unknown) => console.warn(`[office-deco] failed to load for ${userId}:`, err));
    }
  }
  return store;
}

function persistDecorations(userId: string): void {
  if (!isSupabaseConfigured) return;
  const store = decorationStores.get(userId);
  if (!store) return;
  void supabaseAdmin
    .from("heights_cloud_office_decorations")
    .upsert({
      user_id: userId,
      decorations: JSON.stringify(store),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .then(() => {})
    .catch((err: unknown) => console.warn(`[office-deco] failed to persist for ${userId}:`, err));
}

export function getDecorations(userId: string): OfficeDecoration[] {
  return getStore(userId);
}

export function placeDecoration(userId: string, placement: DecorationPlacement): OfficeDecoration | null {
  const catalogItem = DECORATION_CATALOG.find((c) => c.type === placement.type);
  if (!catalogItem) return null;

  const store = getStore(userId);

  // Check collision with existing decorations
  for (const existing of store) {
    const existingItem = DECORATION_CATALOG.find((c) => c.type === existing.type);
    if (!existingItem) continue;
    if (tilesOverlap(
      placement.tileX, placement.tileY, catalogItem.width, catalogItem.height,
      existing.tileX, existing.tileY, existingItem.width, existingItem.height,
    )) {
      return null;
    }
  }

  const decoration: OfficeDecoration = {
    id: randomUUID(),
    type: placement.type,
    tileX: placement.tileX,
    tileY: placement.tileY,
    variant: placement.variant,
    placedAt: Date.now(),
  };

  store.push(decoration);
  persistDecorations(userId);
  return decoration;
}

export function removeDecoration(userId: string, decorationId: string): boolean {
  const store = getStore(userId);
  const idx = store.findIndex((d) => d.id === decorationId);
  if (idx < 0) return false;
  store.splice(idx, 1);
  persistDecorations(userId);
  return true;
}

export function moveDecoration(userId: string, decorationId: string, tileX: number, tileY: number): OfficeDecoration | null {
  const store = getStore(userId);
  const deco = store.find((d) => d.id === decorationId);
  if (!deco) return null;

  const catalogItem = DECORATION_CATALOG.find((c) => c.type === deco.type);
  if (!catalogItem) return null;

  // Check collision with other decorations (excluding self)
  for (const existing of store) {
    if (existing.id === decorationId) continue;
    const existingItem = DECORATION_CATALOG.find((c) => c.type === existing.type);
    if (!existingItem) continue;
    if (tilesOverlap(
      tileX, tileY, catalogItem.width, catalogItem.height,
      existing.tileX, existing.tileY, existingItem.width, existingItem.height,
    )) {
      return null;
    }
  }

  deco.tileX = tileX;
  deco.tileY = tileY;
  persistDecorations(userId);
  return deco;
}

function tilesOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number,
): boolean {
  return !(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1);
}

export function checkDecorationUnlocked(
  type: string,
  stats: { tasksDone: number; agentsHired: number; dayStreak: number; achievementsUnlocked: number },
): boolean {
  const item = DECORATION_CATALOG.find((c) => c.type === type);
  if (!item) return false;

  switch (item.unlockRequirement) {
    case "10 tasks": return stats.tasksDone >= 10;
    case "50 tasks": return stats.tasksDone >= 50;
    case "100 tasks": return stats.tasksDone >= 100;
    case "5 agents hired": return stats.agentsHired >= 5;
    case "7-day streak": return stats.dayStreak >= 7;
    default: return true;
  }
}
