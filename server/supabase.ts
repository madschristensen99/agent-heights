import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const isSupabaseConfigured = Boolean(url && serviceKey);

export const supabaseAdmin: SupabaseClient = isSupabaseConfigured
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : (null as unknown as SupabaseClient);

export interface AuthUser {
  id: string;
  email: string | null;
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

export function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}
