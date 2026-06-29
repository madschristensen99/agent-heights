import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/**
 * Encrypted per-user API key storage.
 * Keys are encrypted with AES-256-GCM using a server-side master key.
 * The master key should be set via ENCRYPTION_KEY env var (32 hex bytes).
 * Falls back to a derived key from SUPABASE_SERVICE_ROLE_KEY if not set.
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? deriveKey();
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(): string {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-dev-key-not-secure";
  // Create a 32-byte key from the service role key
  let hex = "";
  for (let i = 0; i < serviceKey.length; i++) {
    hex += serviceKey.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex.slice(0, 64).padEnd(64, "0");
}

function encrypt(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted payload");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

/**
 * Get a user's decrypted Swarms API key from Supabase.
 * Returns null if the user has no key stored.
 */
export async function getUserApiKey(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("user_api_keys")
      .select("encrypted_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;
    return decrypt(data.encrypted_key as string);
  } catch {
    return null;
  }
}

/**
 * Store (or update) a user's Swarms API key, encrypted at rest.
 */
export async function setUserApiKey(userId: string, apiKey: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: "Database not configured" };
  try {
    const encrypted = encrypt(apiKey.trim());
    const { error } = await supabaseAdmin
      .from("user_api_keys")
      .upsert({
        user_id: userId,
        encrypted_key: encrypted,
        updated_at: new Date().toISOString(),
      });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Delete a user's stored API key.
 */
export async function deleteUserApiKey(userId: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: "Database not configured" };
  try {
    const { error } = await supabaseAdmin
      .from("user_api_keys")
      .delete()
      .eq("user_id", userId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Check if a user has an API key stored (without decrypting it).
 */
export async function hasUserApiKey(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from("user_api_keys")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    return !error && !!data;
  } catch {
    return false;
  }
}
