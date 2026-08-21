import { isSupabaseConfigured, supabaseAdmin } from "./supabase.js";
import { getUserPaymentStatus } from "./stripe.js";
import { sendOfficeInviteEmail } from "./email.js";

export interface OfficeInvite {
  id: string;
  inviterId: string;
  inviteeEmail: string;
  roomId: string;
  status: "pending" | "claimed" | "expired";
  createdAt: string;
  claimedAt: string | null;
  claimedBy: string | null;
}

export interface InviteResult {
  ok: boolean;
  message: string;
}

const MAX_PENDING_INVITES = 10;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Generate a short token from a UUID (first 8 chars, no dashes). */
function generateToken(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 12).toUpperCase();
}

/** Create an office invite and send the email. */
export async function createInvite(
  inviterId: string,
  inviterEmail: string,
  inviteeEmail: string,
  roomId: string,
): Promise<InviteResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Database not configured." };
  if (inviterId === "dev") return { ok: false, message: "Sign in to send invites." };

  const email = inviteeEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, message: "Enter a valid email." };
  if (email === inviterEmail.toLowerCase()) return { ok: false, message: "You can't invite yourself." };

  // Check that the inviter has paid (entrance fee or subscription)
  const payStatus = await getUserPaymentStatus(inviterId, inviterEmail);
  if (!payStatus.entrancePaid && !payStatus.subscriptionActive) {
    return { ok: false, message: "Pay the entry fee first to invite friends." };
  }

  // Count pending invites
  const { count } = await supabaseAdmin
    .from("heights_cloud_office_invites")
    .select("id", { count: "exact", head: true })
    .eq("inviter_id", inviterId)
    .eq("status", "pending");

  if ((count ?? 0) >= MAX_PENDING_INVITES) {
    return { ok: false, message: `Max ${MAX_PENDING_INVITES} pending invites. Revoke some first.` };
  }

  // Check for existing pending invite to this email
  const { data: existing } = await supabaseAdmin
    .from("heights_cloud_office_invites")
    .select("id, status")
    .eq("inviter_id", inviterId)
    .eq("invitee_email", email)
    .maybeSingle();

  if (existing?.status === "pending") {
    return { ok: false, message: `Already invited ${email}.` };
  }

  // Insert the invite
  const { data, error } = await supabaseAdmin
    .from("heights_cloud_office_invites")
    .upsert({
      inviter_id: inviterId,
      invitee_email: email,
      room_id: roomId,
      status: "pending",
      created_at: new Date().toISOString(),
    }, { onConflict: "inviter_id,invitee_email" })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: `Failed to create invite: ${error?.message ?? "unknown"}` };
  }

  // Send the email (fire-and-forget)
  const token = generateToken(data.id);
  void sendOfficeInviteEmail(email, inviterEmail, token).catch((err: unknown) =>
    console.error("[office-invites] email failed:", err),
  );

  return { ok: true, message: `Invite sent to ${email}!` };
}

/** Claim an invite by token. Called after the invitee signs up. */
export async function claimInvite(
  inviteeUserId: string,
  inviteeEmail: string,
  token: string,
): Promise<{ ok: boolean; message: string; inviterId?: string; roomId?: string }> {
  if (!isSupabaseConfigured) return { ok: false, message: "Database not configured." };

  const email = inviteeEmail.trim().toLowerCase();

  // Find pending invites for this email
  const { data: invites, error } = await supabaseAdmin
    .from("heights_cloud_office_invites")
    .select("id, inviter_id, invitee_email, room_id, status, created_at")
    .eq("invitee_email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !invites || invites.length === 0) {
    return { ok: false, message: "No pending invite found." };
  }

  // Match by token (first 12 chars of UUID without dashes)
  const invite = invites.find((inv) => generateToken(inv.id) === token.toUpperCase());
  if (!invite) {
    return { ok: false, message: "Invalid invite token." };
  }

  // Check expiry
  const age = Date.now() - new Date(invite.created_at).getTime();
  if (age > INVITE_TTL_MS) {
    await supabaseAdmin
      .from("heights_cloud_office_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return { ok: false, message: "This invite has expired." };
  }

  // Mark as claimed
  const { error: updateErr } = await supabaseAdmin
    .from("heights_cloud_office_invites")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
      claimed_by: inviteeUserId,
    })
    .eq("id", invite.id)
    .eq("status", "pending");

  if (updateErr) {
    return { ok: false, message: `Failed to claim invite: ${updateErr.message}` };
  }

  return {
    ok: true,
    message: "Invite claimed!",
    inviterId: invite.inviter_id,
    roomId: invite.room_id,
  };
}

/** Get all pending invites for a user (as inviter). */
export async function getPendingInvites(inviterId: string): Promise<OfficeInvite[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_office_invites")
      .select("id, inviter_id, invitee_email, room_id, status, created_at, claimed_at, claimed_by")
      .eq("inviter_id", inviterId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    // Expire old pending invites
    const now = Date.now();
    return data
      .filter((r) => {
        if (r.status !== "pending") return true;
        const age = now - new Date(r.created_at).getTime();
        return age <= INVITE_TTL_MS;
      })
      .map((r) => ({
        id: r.id,
        inviterId: r.inviter_id,
        inviteeEmail: r.invitee_email,
        roomId: r.room_id,
        status: r.status,
        createdAt: r.created_at,
        claimedAt: r.claimed_at,
        claimedBy: r.claimed_by,
      }));
  } catch {
    return [];
  }
}

/** Revoke a pending invite. */
export async function revokeInvite(inviterId: string, inviteId: string): Promise<InviteResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "Database not configured." };
  const { error } = await supabaseAdmin
    .from("heights_cloud_office_invites")
    .delete()
    .eq("id", inviteId)
    .eq("inviter_id", inviterId)
    .eq("status", "pending");

  if (error) return { ok: false, message: `Failed to revoke: ${error.message}` };
  return { ok: true, message: "Invite revoked." };
}
