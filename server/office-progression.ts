import type { OfficeLevelInfo } from "../shared/types";
import { getOfficeLevelForXp } from "../shared/types";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

interface ProgressStore {
  xp: number;
  prestigeCount: number;
  loaded: boolean;
}

const progressStores = new Map<string, ProgressStore>();

function getStore(userId: string): ProgressStore {
  let store = progressStores.get(userId);
  if (!store) {
    store = { xp: 0, prestigeCount: 0, loaded: false };
    progressStores.set(userId, store);
    // Load from DB asynchronously
    if (isSupabaseConfigured) {
      void supabaseAdmin
        .from("heights_cloud_office_progress")
        .select("xp, prestige_count")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            store!.xp = data.xp ?? 0;
            store!.prestigeCount = data.prestige_count ?? 0;
          }
          store!.loaded = true;
        })
        .catch((err: unknown) => console.warn(`[office-progression] failed to load for ${userId}:`, err));
    } else {
      store.loaded = true;
    }
  }
  return store;
}

function persistProgress(userId: string): void {
  if (!isSupabaseConfigured) return;
  const store = progressStores.get(userId);
  if (!store) return;
  void supabaseAdmin
    .from("heights_cloud_office_progress")
    .upsert({
      user_id: userId,
      xp: store.xp,
      prestige_count: store.prestigeCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .then(() => {})
    .catch((err: unknown) => console.warn(`[office-progression] failed to persist for ${userId}:`, err));
}

export function getXp(userId: string): number {
  return getStore(userId).xp;
}

export function getProgress(userId: string): OfficeLevelInfo {
  const store = getStore(userId);
  const info = getOfficeLevelForXp(store.xp);
  return {
    level: info.level,
    xp: store.xp,
    xpForCurrentLevel: info.xpIntoLevel,
    xpForNextLevel: info.xpForNextLevel,
    prestigeCount: store.prestigeCount,
    maxAgents: info.maxAgents,
    features: info.features,
  };
}

export function addXp(userId: string, amount: number): { leveledUp: boolean; newLevel: number } {
  const store = getStore(userId);
  const oldLevel = getOfficeLevelForXp(store.xp).level;
  store.xp += amount;
  const newLevel = getOfficeLevelForXp(store.xp).level;
  persistProgress(userId);
  return { leveledUp: newLevel > oldLevel, newLevel };
}

export function prestige(userId: string): boolean {
  const store = getStore(userId);
  const info = getOfficeLevelForXp(store.xp);
  if (info.level < 10) return false;
  store.prestigeCount += 1;
  store.xp = 0;
  persistProgress(userId);
  return true;
}

export function getMaxAgents(userId: string): number {
  const store = getStore(userId);
  const info = getOfficeLevelForXp(store.xp);
  return info.maxAgents + store.prestigeCount;
}

export function hasFeature(userId: string, feature: string): boolean {
  const store = getStore(userId);
  const info = getOfficeLevelForXp(store.xp);
  return info.features.includes(feature);
}
