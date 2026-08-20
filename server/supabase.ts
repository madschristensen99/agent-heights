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

const tokenCache = new Map<string, { user: AuthUser; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 60_000;

export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!isSupabaseConfigured) return null;

  // Check cache — avoids repeated GoTrue calls for reconnects/page refreshes
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  try {
    const result = await Promise.race([
      supabaseAdmin.auth.getUser(token),
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error("auth timeout") }), 5_000),
      ),
    ]);
    if (result.error || !result.data?.user) return null;
    const user = { id: result.data.user.id, email: result.data.user.email ?? null };
    tokenCache.set(token, { user, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    // Prune expired entries periodically
    if (tokenCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of tokenCache) {
        if (v.expiresAt <= now) tokenCache.delete(k);
      }
    }
    return user;
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
