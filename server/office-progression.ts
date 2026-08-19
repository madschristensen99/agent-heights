import type { OfficeLevelInfo } from "../shared/types";
import { getOfficeLevelForXp } from "../shared/types";

interface ProgressStore {
  xp: number;
  prestigeCount: number;
}

const progressStores = new Map<string, ProgressStore>();

function getStore(userId: string): ProgressStore {
  let store = progressStores.get(userId);
  if (!store) {
    store = { xp: 0, prestigeCount: 0 };
    progressStores.set(userId, store);
  }
  return store;
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
  return { leveledUp: newLevel > oldLevel, newLevel };
}

export function prestige(userId: string): boolean {
  const store = getStore(userId);
  const info = getOfficeLevelForXp(store.xp);
  if (info.level < 10) return false;
  store.prestigeCount += 1;
  store.xp = 0;
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
