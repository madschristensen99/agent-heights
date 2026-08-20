import { randomUUID } from "node:crypto";
import type { OfficeSocialState, StickyNote, OfficeLike, VisitorEntry } from "../shared/types";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

interface SocialStore {
  likes: OfficeLike[];
  stickyNotes: StickyNote[];
  visitors: VisitorEntry[];
}

const socialStores = new Map<string, SocialStore>();

function getStore(officeOwnerId: string): SocialStore {
  let store = socialStores.get(officeOwnerId);
  if (!store) {
    store = { likes: [], stickyNotes: [], visitors: [] };
    socialStores.set(officeOwnerId, store);
    // Load from DB
    if (isSupabaseConfigured) {
      void supabaseAdmin
        .from("heights_cloud_office_social")
        .select("likes, sticky_notes, visitors")
        .eq("office_owner_id", officeOwnerId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            store!.likes = data.likes ?? [];
            store!.stickyNotes = data.sticky_notes ?? [];
            store!.visitors = data.visitors ?? [];
          }
        })
        .catch((err: unknown) => console.warn(`[office-social] failed to load for ${officeOwnerId}:`, err));
    }
  }
  return store;
}

function persistSocial(officeOwnerId: string): void {
  if (!isSupabaseConfigured) return;
  const store = socialStores.get(officeOwnerId);
  if (!store) return;
  void supabaseAdmin
    .from("heights_cloud_office_social")
    .upsert({
      office_owner_id: officeOwnerId,
      likes: JSON.stringify(store.likes),
      sticky_notes: JSON.stringify(store.stickyNotes),
      visitors: JSON.stringify(store.visitors),
      updated_at: new Date().toISOString(),
    }, { onConflict: "office_owner_id" })
    .then(() => {})
    .catch((err: unknown) => console.warn(`[office-social] failed to persist for ${officeOwnerId}:`, err));
}

export function getSocialState(officeOwnerId: string): OfficeSocialState {
  const store = getStore(officeOwnerId);
  return {
    likes: store.likes,
    stickyNotes: store.stickyNotes,
    recentVisitors: store.visitors.slice(-20),
    likeCount: store.likes.length,
  };
}

export function leaveStickyNote(
  officeOwnerId: string,
  authorId: string,
  authorName: string,
  text: string,
  color: string,
): StickyNote | null {
  if (!text.trim() || text.length > 500) return null;
  const store = getStore(officeOwnerId);
  if (store.stickyNotes.length >= 50) return null;
  const note: StickyNote = {
    id: randomUUID(),
    officeOwnerId,
    authorId,
    authorName,
    text: text.trim().slice(0, 500),
    color: color || "#ffeb3b",
    createdAt: Date.now(),
  };
  store.stickyNotes.push(note);
  persistSocial(officeOwnerId);
  return note;
}

export function likeOffice(officeOwnerId: string, likerId: string, likerName: string): OfficeLike | null {
  const store = getStore(officeOwnerId);
  if (store.likes.some((l) => l.likerId === likerId)) return null;
  const like: OfficeLike = {
    officeOwnerId,
    likerId,
    likerName,
    createdAt: Date.now(),
  };
  store.likes.push(like);
  persistSocial(officeOwnerId);
  return like;
}

export function unlikeOffice(officeOwnerId: string, likerId: string): boolean {
  const store = getStore(officeOwnerId);
  const idx = store.likes.findIndex((l) => l.likerId === likerId);
  if (idx === -1) return false;
  store.likes.splice(idx, 1);
  persistSocial(officeOwnerId);
  return true;
}

export function recordVisit(officeOwnerId: string, visitorId: string, visitorName: string): void {
  if (visitorId === officeOwnerId) return;
  const store = getStore(officeOwnerId);
  const now = Date.now();
  const recent = store.visitors.find((v) => v.visitorId === visitorId && now - v.visitedAt < 3600_000);
  if (recent) {
    recent.visitedAt = now;
    persistSocial(officeOwnerId);
    return;
  }
  store.visitors.push({
    id: randomUUID(),
    officeOwnerId,
    visitorId,
    visitorName,
    visitedAt: now,
  });
  if (store.visitors.length > 100) store.visitors = store.visitors.slice(-100);
  persistSocial(officeOwnerId);
}
