import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

const runtimeEnv = (typeof window !== "undefined" && (window as any).__ENV__) || {};
const url = runtimeEnv.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isAuthEnabled = Boolean(url && anonKey);

let client: SupabaseClient | null = null;
if (isAuthEnabled) {
  client = createClient(url!, anonKey!, { auth: { persistSession: true } });
}

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

type AuthListener = (state: AuthState) => void;

const listeners = new Set<AuthListener>();
let currentState: AuthState = { session: null, loading: isAuthEnabled };

function notify() {
  for (const fn of listeners) {
    try { fn(currentState); } catch (err) { console.error("[auth] listener error:", err); }
  }
}

export function onAuthChange(fn: AuthListener): () => void {
  listeners.add(fn);
  fn(currentState);
  return () => listeners.delete(fn);
}

export async function initAuth(): Promise<void> {
  if (!client) {
    currentState = { session: null, loading: false };
    notify();
    return;
  }
  try {
    const result = await Promise.race([
      client.auth.getSession(),
      new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 3000),
      ),
    ]);
    currentState = { session: result.data.session, loading: false };
  } catch {
    currentState = { session: null, loading: false };
  }
  notify();
  client.auth.onAuthStateChange((_event, session) => {
    currentState = { session, loading: false };
    notify();
  });
}

export function getToken(): string | null {
  return currentState.session?.access_token ?? null;
}

export function getUserEmail(): string | null {
  return currentState.session?.user?.email ?? null;
}

export async function refreshSession(): Promise<string | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.auth.refreshSession();
    if (error || !data.session) return null;
    currentState = { session: data.session, loading: false };
    notify();
    return data.session.access_token;
  } catch {
    return null;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  if (!client) return { error: "Auth not configured" };
  const { error } = await client.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signUpWithEmail(email: string, password: string): Promise<{ error: string | null }> {
  if (!client) return { error: "Auth not configured" };
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signInWithGitHub(): Promise<{ error: string | null }> {
  if (!client) return { error: "Auth not configured" };
  const { error } = await client.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!client) return { error: "Auth not configured" };
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  if (!client) return;
  await client.auth.signOut();
}
