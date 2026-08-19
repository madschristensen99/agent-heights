import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

// Read env vars from runtime injection (window.__ENV__) with fallback to build-time (import.meta.env)
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

function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const decoded = JSON.parse(atob(payload));
    if (typeof decoded.exp !== "number") return true;
    return Date.now() / 1000 > decoded.exp - 10;
  } catch {
    return true;
  }
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
    let session = result.data.session;
    if (session?.access_token && isTokenExpired(session.access_token)) {
      console.log("[auth] cached session token expired — attempting refresh");
      const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        console.log("[auth] refresh failed — clearing stale session");
        await client.auth.signOut();
        session = null;
      } else {
        session = refreshData.session;
      }
    }
    currentState = { session, loading: false };
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

export function getUserId(): string | null {
  return currentState.session?.user?.id ?? null;
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
    options: { emailRedirectTo: `${window.location.origin}/app` },
  });
  return { error: error?.message ?? null };
}

export async function signInWithGitHub(): Promise<{ error: string | null }> {
  if (!client) return { error: "Auth not configured" };
  const { error } = await client.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${window.location.origin}/app` },
  });
  return { error: error?.message ?? null };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!client) return { error: "Auth not configured" };
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/app` },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  if (!client) return;
  await client.auth.signOut();
}

export async function resetPasswordForEmail(email: string): Promise<{ error: string | null }> {
  if (!client) return { error: "Auth not configured" };
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/app`,
  });
  return { error: error?.message ?? null };
}

// ── login overlay UI ──────────────────────────────────────────────────────

export function createAuthOverlay(): { show: () => void; hide: () => void } {
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background-image: linear-gradient(180deg, rgba(18,20,32,0.90) 0%, rgba(26,30,50,0.92) 100%), url(/assets/gameplay.png);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    color: #e0e0e0;
    font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
    overflow-y: auto; padding: 2rem 1rem;
  `;

  if (!isAuthEnabled) {
    overlay.innerHTML = `<p style="color:#666;position:relative;z-index:1;">Auth not configured — connecting in dev mode…</p>`;
    document.body.appendChild(overlay);
    return {
      show: () => { overlay.style.display = "flex"; },
      hide: () => { overlay.style.display = "none"; },
    };
  }

  // Character sprites row (matches OG image: char-0 through char-3)
  const charRow = document.createElement("div");
  charRow.style.cssText = `
    display: flex; gap: 12px; justify-content: center; margin-bottom: 1.2rem;
    position: relative; z-index: 1;
  `;
  const spriteVersion = Date.now();
  for (let i = 0; i < 4; i++) {
    const sprite = document.createElement("div");
    sprite.style.cssText = `
      width: 64px; height: 96px;
      background-image: url(/assets/characters/char-${i}.png?v=${spriteVersion});
      background-size: 512px 384px;
      background-position: 0 0;
      background-repeat: no-repeat;
      image-rendering: pixelated;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));
    `;
    charRow.appendChild(sprite);
  }

  overlay.innerHTML = `
    <div style="position:relative;z-index:1;text-align:center;max-width:400px;width:90vw;">
      <h1 style="font-size:2.6rem;font-weight:800;margin:0 0 0.3rem;letter-spacing:0.08em;color:#58c866;text-shadow:3px 3px 0 #080a10;">AGENT HEIGHTS</h1>
      <p style="color:#a0a5b4;font-size:0.7rem;font-weight:500;margin:0 0 0.5rem;letter-spacing:0.15em;text-transform:uppercase;">Manage AI Agents in a Virtual Office</p>
      <div id="auth-sprites"></div>
      <p id="auth-welcome" style="color:#7a8090;font-size:0.9rem;margin:0 0 1.5rem;">Welcome! Sign in to enter your office.</p>
      <div id="auth-form" style="display:flex;flex-direction:column;gap:0.7rem;background:rgba(18,22,36,0.7);border:1px solid #2a2e42;border-radius:12px;padding:1.5rem;">
        <input id="auth-email" type="email" placeholder="you@example.com"
          style="padding:0.75rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#121420;color:#e0e0e0;font-size:0.95rem;outline:none;transition:border-color 0.15s;" />
        <input id="auth-password" type="password" placeholder="Password"
          style="padding:0.75rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#121420;color:#e0e0e0;font-size:0.95rem;outline:none;transition:border-color 0.15s;" />
        <button id="auth-submit"
          style="padding:0.8rem 1rem;border-radius:8px;border:none;background:linear-gradient(180deg,#58c866,#3da64a);color:#0d0d0d;font-size:0.95rem;font-weight:700;cursor:pointer;letter-spacing:0.03em;transition:filter 0.15s,transform 0.1s;">
          Sign in
        </button>
        <div style="display:flex;align-items:center;gap:0.5rem;margin:0.25rem 0;">
          <div style="flex:1;height:1px;background:#2a2e42;"></div>
          <span style="color:#555;font-size:0.75rem;">or</span>
          <div style="flex:1;height:1px;background:#2a2e42;"></div>
        </div>
        <button id="auth-google"
          style="padding:0.75rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#1a1e2e;color:#e0e0e0;font-size:0.9rem;cursor:pointer;transition:border-color 0.15s;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <button id="auth-github"
          style="padding:0.75rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#1a1e2e;color:#e0e0e0;font-size:0.9rem;cursor:pointer;transition:border-color 0.15s;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#e0e0e0"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
          Continue with GitHub
        </button>
      </div>
      <p id="auth-toggle" style="margin-top:1rem;font-size:0.85rem;color:#7a8090;cursor:pointer;">
        Don't have an account? <span style="color:#58c866;">Sign up</span>
      </p>
      <p id="auth-forgot" style="margin-top:0.3rem;font-size:0.8rem;color:#555;cursor:pointer;">
        <span style="color:#7a8090;">Forgot password?</span>
      </p>
      <p style="margin-top:0.8rem;font-size:0.72rem;color:#555;line-height:1.4;">
        👁 By continuing, you acknowledge our <a href="/privacy" target="_blank" style="color:#7a8090;text-decoration:underline;">Privacy Policy</a> and <a href="/terms" target="_blank" style="color:#7a8090;text-decoration:underline;">Terms of Service</a>.
      </p>
      <div id="auth-status" style="margin-top:0.5rem;font-size:0.85rem;min-height:1.2em;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Insert character sprites into the placeholder
  const spritesContainer = overlay.querySelector("#auth-sprites") as HTMLDivElement;
  if (spritesContainer) {
    spritesContainer.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:0.8rem;margin-bottom:1.2rem;`;
    spritesContainer.appendChild(charRow);
  }

  const status = overlay.querySelector("#auth-status") as HTMLDivElement;
  const emailInput = overlay.querySelector("#auth-email") as HTMLInputElement;
  const passwordInput = overlay.querySelector("#auth-password") as HTMLInputElement;
  const submitBtn = overlay.querySelector("#auth-submit") as HTMLButtonElement;
  const toggleEl = overlay.querySelector("#auth-toggle") as HTMLParagraphElement;
  const githubBtn = overlay.querySelector("#auth-github") as HTMLButtonElement;
  const googleBtn = overlay.querySelector("#auth-google") as HTMLButtonElement;
  const forgotEl = overlay.querySelector("#auth-forgot") as HTMLParagraphElement;

  let isSignUp = false;
  const welcomeText = overlay.querySelector("#auth-welcome") as HTMLParagraphElement;

  function updateMode(): void {
    if (isSignUp) {
      submitBtn.textContent = "Sign up";
      toggleEl.innerHTML = `Already have an account? <span style="color:#58c866;">Sign in</span>`;
      if (welcomeText) welcomeText.textContent = "New here? Create an account to get started.";
    } else {
      submitBtn.textContent = "Sign in";
      toggleEl.innerHTML = `Don't have an account? <span style="color:#58c866;">Sign up</span>`;
      if (welcomeText) welcomeText.textContent = "Welcome! Sign in to enter your office.";
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
    status.style.color = "#7a8090";
    const { error } = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithPassword(email, password);
    if (error) {
      status.textContent = error;
      status.style.color = "#e05d5d";
    } else if (isSignUp) {
      status.textContent = "Check your email to confirm your account.";
      status.style.color = "#58c866";
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

  forgotEl.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      status.textContent = "Enter your email above first.";
      status.style.color = "#e05d5d";
      return;
    }
    status.textContent = "Sending reset link…";
    status.style.color = "#7a8090";
    const { error } = await resetPasswordForEmail(email);
    if (error) {
      status.textContent = error;
      status.style.color = "#e05d5d";
    } else {
      status.textContent = "Check your email for a password reset link.";
      status.style.color = "#58c866";
    }
  });

  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") passwordInput.focus();
  });
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitBtn.click();
  });

  // Hover/focus effects for dark theme
  for (const input of [emailInput, passwordInput]) {
    input.addEventListener("focus", () => { input.style.borderColor = "#58c866"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#2a2e42"; });
  }
  submitBtn.addEventListener("mouseenter", () => { submitBtn.style.filter = "brightness(1.1)"; });
  submitBtn.addEventListener("mouseleave", () => { submitBtn.style.filter = "none"; });
  submitBtn.addEventListener("mousedown", () => { submitBtn.style.transform = "scale(0.97)"; });
  submitBtn.addEventListener("mouseup", () => { submitBtn.style.transform = "scale(1)"; });
  for (const btn of [githubBtn, googleBtn]) {
    btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#58c866"; });
    btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#2a2e42"; });
  }

  return {
    show: () => { overlay.style.display = "flex"; },
    hide: () => { overlay.style.display = "none"; },
  };
}
