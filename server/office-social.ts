import { randomUUID } from "node:crypto";
import type { OfficeSocialState, StickyNote, OfficeLike, VisitorEntry } from "../shared/types";

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
  }
  return store;
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
  return like;
}

export function unlikeOffice(officeOwnerId: string, likerId: string): boolean {
  const store = getStore(officeOwnerId);
  const idx = store.likes.findIndex((l) => l.likerId === likerId);
  if (idx === -1) return false;
  store.likes.splice(idx, 1);
  return true;
}

export function recordVisit(officeOwnerId: string, visitorId: string, visitorName: string): void {
  if (visitorId === officeOwnerId) return;
  const store = getStore(officeOwnerId);
  const now = Date.now();
  const recent = store.visitors.find((v) => v.visitorId === visitorId && now - v.visitedAt < 3600_000);
  if (recent) {
    recent.visitedAt = now;
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
}
