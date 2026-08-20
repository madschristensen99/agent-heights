import { isSupabaseConfigured, supabaseAdmin } from "./supabase.js";
import type { FriendEntry, PendingFriendRequest } from "../shared/types.js";

export interface FriendResult {
  ok: boolean;
  message: string;
}

// Cache display names for 5 minutes to avoid repeated DB/GoTrue queries during 30s polling
const displayNameCache = new Map<string, { name: string; expiresAt: number }>();
const DISPLAY_NAME_TTL_MS = 5 * 60 * 1000;

async function getUserDisplayName(userId: string): Promise<string> {
  const cached = displayNameCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  let name = "Unknown";
  if (isSupabaseConfigured) {
    try {
      const { data } = await supabaseAdmin
        .from("heights_cloud_user_profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.display_name) name = data.display_name;
    } catch { /* fall through */ }
    if (name === "Unknown") {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = data?.user?.email;
        if (email) name = email.split("@")[0];
      } catch { /* fall through */ }
    }
  }

  displayNameCache.set(userId, { name, expiresAt: Date.now() + DISPLAY_NAME_TTL_MS });
  return name;
}

async function getUserIdByEmail(email: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("auth.users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

export async function sendFriendRequest(
  userId: string,
  targetEmail: string,
): Promise<FriendResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Database not configured." };
  if (userId === "dev") return { ok: false, message: "Sign in to add friends." };

  const targetId = await getUserIdByEmail(targetEmail);
  if (!targetId) return { ok: false, message: `No user found with email ${targetEmail}.` };
  if (targetId === userId) return { ok: false, message: "You can't friend yourself." };

  const { error } = await supabaseAdmin
    .from("heights_cloud_friends")
    .upsert({
      user_id: userId,
      friend_id: targetId,
      status: "pending",
      requested_at: new Date().toISOString(),
    }, { onConflict: "user_id,friend_id" });

  if (error) return { ok: false, message: `Failed to send request: ${error.message}` };
  return { ok: true, message: `Friend request sent to ${targetEmail}.` };
}

export async function acceptFriendRequest(
  userId: string,
  friendId: string,
): Promise<FriendResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Database not configured." };

  const now = new Date().toISOString();

  const { error: e1 } = await supabaseAdmin
    .from("heights_cloud_friends")
    .update({ status: "accepted", accepted_at: now })
    .eq("user_id", userId, )
    .eq("friend_id", friendId)
    .eq("status", "pending");

  if (e1) return { ok: false, message: `Failed to accept: ${e1.message}` };

  const { error: e2 } = await supabaseAdmin
    .from("heights_cloud_friends")
    .upsert({
      user_id: friendId,
      friend_id: userId,
      status: "accepted",
      accepted_at: now,
    }, { onConflict: "user_id,friend_id" });

  if (e2) return { ok: false, message: `Failed to mirror: ${e2.message}` };
  return { ok: true, message: "Friend request accepted." };
}

export async function declineFriendRequest(
  userId: string,
  friendId: string,
): Promise<FriendResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Database not configured." };

  const { error } = await supabaseAdmin
    .from("heights_cloud_friends")
    .delete()
    .eq("user_id", friendId)
    .eq("friend_id", userId)
    .eq("status", "pending");

  if (error) return { ok: false, message: `Failed to decline: ${error.message}` };
  return { ok: true, message: "Friend request declined." };
}

export async function removeFriend(
  userId: string,
  friendId: string,
): Promise<FriendResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Database not configured." };

  await supabaseAdmin
    .from("heights_cloud_friends")
    .delete()
    .eq("user_id", userId)
    .eq("friend_id", friendId);

  await supabaseAdmin
    .from("heights_cloud_friends")
    .delete()
    .eq("user_id", friendId)
    .eq("friend_id", userId);

  return { ok: true, message: "Friend removed." };
}

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_friends")
      .select("friend_id")
      .eq("user_id", userId)
      .eq("status", "accepted");
    if (error || !data) return [];
    return data.map((r: any) => r.friend_id as string);
  } catch {
    return [];
  }
}

export async function getFriendsList(
  userId: string,
  onlineUserIds: Set<string>,
  roomInfo: Map<string, { roomId: string | null; name: string; roomName: string; roomType: string; orgId?: string }>,
): Promise<{ friends: FriendEntry[]; pending: PendingFriendRequest[] }> {
  if (!isSupabaseConfigured) return { friends: [], pending: [] };

  const [accepted, pendingIncoming, pendingOutgoing] = await Promise.all([
    supabaseAdmin
      .from("heights_cloud_friends")
      .select("friend_id")
      .eq("user_id", userId)
      .eq("status", "accepted"),
    supabaseAdmin
      .from("heights_cloud_friends")
      .select("user_id")
      .eq("friend_id", userId)
      .eq("status", "pending"),
    supabaseAdmin
      .from("heights_cloud_friends")
      .select("friend_id")
      .eq("user_id", userId)
      .eq("status", "pending"),
  ]);

  const friendIds: string[] = (accepted.data ?? []).map((r: any) => r.friend_id);
  const incomingIds: string[] = (pendingIncoming.data ?? []).map((r: any) => r.user_id);
  const outgoingIds: string[] = (pendingOutgoing.data ?? []).map((r: any) => r.friend_id);

  // Resolve all display names in parallel (cache hits return instantly)
  const allIds = [...friendIds, ...incomingIds, ...outgoingIds];
  const names = await Promise.all(allIds.map((id) => getUserDisplayName(id)));
  const nameMap = new Map<string, string>();
  allIds.forEach((id, i) => nameMap.set(id, names[i]));

  const friends: FriendEntry[] = friendIds.map((fid) => {
    const online = onlineUserIds.has(fid);
    const room = roomInfo.get(fid);
    return {
      userId: fid,
      name: nameMap.get(fid) ?? "Unknown",
      online,
      roomId: online ? (room?.roomId ?? null) : null,
      roomName: room?.roomName ?? "",
    };
  });

  const pending: PendingFriendRequest[] = [
    ...incomingIds.map((uid) => ({ userId: uid, name: nameMap.get(uid) ?? "Unknown", direction: "incoming" as const })),
    ...outgoingIds.map((uid) => ({ userId: uid, name: nameMap.get(uid) ?? "Unknown", direction: "outgoing" as const })),
  ];

  return { friends, pending };
}
