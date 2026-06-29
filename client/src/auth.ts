import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
  for (const fn of listeners) fn(currentState);
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

// ── login overlay UI ──────────────────────────────────────────────────────

export function createAuthOverlay(): { show: () => void; hide: () => void } {
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    background: #0d0d0d; color: #e0e0e0;
    font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
  `;

  if (!isAuthEnabled) {
    overlay.innerHTML = `<p style="color:#666">Auth not configured — connecting in dev mode…</p>`;
    document.body.appendChild(overlay);
    return {
      show: () => { overlay.style.display = "flex"; },
      hide: () => { overlay.style.display = "none"; },
    };
  }

  overlay.innerHTML = `
    <div style="text-align:center; max-width: 380px; width: 90vw; padding: 2rem 1.5rem; box-sizing: border-box;">
      <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 0.25rem; letter-spacing: 0.05em;">AGENT HQ</h1>
      <p style="color: #888; font-size: 0.85rem; margin-bottom: 1.5rem;">Sign in to manage your AI agent office</p>
      <div id="auth-form" style="display:flex; flex-direction:column; gap:0.75rem;">
        <input id="auth-email" type="email" placeholder="you@example.com"
          style="padding:0.75rem 1rem; border-radius:0.5rem; border:1px solid #333; background:#1a1a1a; color:#e0e0e0; font-size:0.95rem; outline:none;" />
        <input id="auth-password" type="password" placeholder="Password"
          style="padding:0.75rem 1rem; border-radius:0.5rem; border:1px solid #333; background:#1a1a1a; color:#e0e0e0; font-size:0.95rem; outline:none;" />
        <button id="auth-submit"
          style="padding:0.75rem 1rem; border-radius:0.5rem; border:none; background:#e0e0e0; color:#0d0d0d; font-size:0.95rem; font-weight:600; cursor:pointer;">
          Sign in
        </button>
        <div style="height:1px; background:#222; margin:0.5rem 0;"></div>
        <button id="auth-github"
          style="padding:0.75rem 1rem; border-radius:0.5rem; border:1px solid #333; background:#1a1a1a; color:#e0e0e0; font-size:0.95rem; cursor:pointer;">
          Continue with GitHub
        </button>
        <button id="auth-google"
          style="padding:0.75rem 1rem; border-radius:0.5rem; border:1px solid #333; background:#1a1a1a; color:#e0e0e0; font-size:0.95rem; cursor:pointer;">
          Continue with Google
        </button>
      </div>
      <p id="auth-toggle" style="margin-top:1rem; font-size:0.85rem; color:#888; cursor:pointer;">
        Don't have an account? <span style="color:#4f9dde;">Sign up</span>
      </p>
      <div id="auth-status" style="margin-top:0.5rem; font-size:0.85rem; min-height:1.2em;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const status = overlay.querySelector("#auth-status") as HTMLDivElement;
  const emailInput = overlay.querySelector("#auth-email") as HTMLInputElement;
  const passwordInput = overlay.querySelector("#auth-password") as HTMLInputElement;
  const submitBtn = overlay.querySelector("#auth-submit") as HTMLButtonElement;
  const toggleEl = overlay.querySelector("#auth-toggle") as HTMLParagraphElement;
  const githubBtn = overlay.querySelector("#auth-github") as HTMLButtonElement;
  const googleBtn = overlay.querySelector("#auth-google") as HTMLButtonElement;

  let isSignUp = false;

  function updateMode(): void {
    if (isSignUp) {
      submitBtn.textContent = "Sign up";
      toggleEl.innerHTML = `Already have an account? <span style="color:#4f9dde;">Sign in</span>`;
    } else {
      submitBtn.textContent = "Sign in";
      toggleEl.innerHTML = `Don't have an account? <span style="color:#4f9dde;">Sign up</span>`;
    }
    status.textContent = "";
  }

  toggleEl.addEventListener("click", () => {
    isSignUp = !isSignUp;
    updateMode();
  });

  submitBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      status.textContent = "Please enter your email and password.";
      status.style.color = "#e05d5d";
      return;
    }
    status.textContent = isSignUp ? "Creating account…" : "Signing in…";
    status.style.color = "#888";
    const { error } = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithPassword(email, password);
    if (error) {
      status.textContent = error;
      status.style.color = "#e05d5d";
    } else if (isSignUp) {
      status.textContent = "Check your email to confirm your account.";
      status.style.color = "#53b86b";
    }
  });

  githubBtn.addEventListener("click", async () => {
    const { error } = await signInWithGitHub();
    if (error) { status.textContent = error; status.style.color = "#e05d5d"; }
  });

  googleBtn.addEventListener("click", async () => {
    const { error } = await signInWithGoogle();
    if (error) { status.textContent = error; status.style.color = "#e05d5d"; }
  });

  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") passwordInput.focus();
  });
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitBtn.click();
  });

  return {
    show: () => { overlay.style.display = "flex"; },
    hide: () => { overlay.style.display = "none"; },
  };
}
