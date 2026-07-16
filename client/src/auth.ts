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
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: linear-gradient(180deg, #121420 0%, #1a1e32 100%);
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
  for (let i = 0; i < 4; i++) {
    const sprite = document.createElement("div");
    sprite.style.cssText = `
      width: 56px; height: 84px;
      background-image: url(/assets/characters/char-${i}.png);
      background-size: 448px 336px;
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
      <p style="color:#a0a5b4;font-size:0.7rem;font-weight:500;margin:0 0 0.5rem;letter-spacing:0.15em;text-transform:uppercase;">Manage AI Agents in a Pixel-Art Office</p>
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
        <button id="auth-github"
          style="padding:0.75rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#1a1e2e;color:#e0e0e0;font-size:0.9rem;cursor:pointer;transition:border-color 0.15s;">
          Continue with GitHub
        </button>
        <button id="auth-google"
          style="padding:0.75rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#1a1e2e;color:#e0e0e0;font-size:0.9rem;cursor:pointer;transition:border-color 0.15s;">
          Continue with Google
        </button>
      </div>
      <p id="auth-toggle" style="margin-top:1rem;font-size:0.85rem;color:#7a8090;cursor:pointer;">
        Don't have an account? <span style="color:#58c866;">Sign up</span>
      </p>
      <div id="auth-status" style="margin-top:0.5rem;font-size:0.85rem;min-height:1.2em;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Office preview — a mini isometric-style preview of the Agent Heights office
  const officePreview = document.createElement("div");
  officePreview.style.cssText = `
    position: relative; z-index: 1; margin: 0 auto 1.2rem; width: 280px; height: 140px;
    border-radius: 10px; overflow: hidden; border: 2px solid #2a2e42;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    background: linear-gradient(180deg, #2a3a52 0%, #3a5a7a 100%);
  `;
  // Floor tiles
  const previewFloor = document.createElement("div");
  previewFloor.style.cssText = `
    position: absolute; bottom: 0; left: 0; right: 0; height: 65%;
    background-image: url(/assets/tilesets/agentHeights.png);
    background-size: 128px 128px;
    background-repeat: repeat;
    opacity: 0.7;
  `;
  officePreview.appendChild(previewFloor);
  // Desks row
  const previewDesks = document.createElement("div");
  previewDesks.style.cssText = `
    position: absolute; bottom: 20%; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px;
  `;
  for (let i = 0; i < 4; i++) {
    const desk = document.createElement("div");
    desk.style.cssText = `
      width: 28px; height: 18px; border-radius: 3px;
      background: #6b5d4f; border: 1px solid #4a3f35;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    const monitor = document.createElement("div");
    monitor.style.cssText = `
      position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
      width: 14px; height: 10px; background: #1a1a2e; border: 1px solid #333; border-radius: 2px;
    `;
    desk.appendChild(monitor);
    previewDesks.appendChild(desk);
  }
  officePreview.appendChild(previewDesks);
  // Mini character sprites sitting at desks
  const previewChars = document.createElement("div");
  previewChars.style.cssText = `
    position: absolute; bottom: 22%; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px;
  `;
  for (let i = 0; i < 4; i++) {
    const ch = document.createElement("div");
    ch.style.cssText = `
      width: 14px; height: 21px;
      background-image: url(/assets/characters/char-${i}.png);
      background-size: 112px 84px;
      background-position: 0 0;
      background-repeat: no-repeat;
      image-rendering: pixelated;
    `;
    previewChars.appendChild(ch);
  }
  officePreview.appendChild(previewChars);
  // Label
  const previewLabel = document.createElement("div");
  previewLabel.style.cssText = `
    position: absolute; top: 6px; left: 50%; transform: translateX(-50%);
    font-size: 0.6rem; color: #a0b0c0; letter-spacing: 0.1em; text-transform: uppercase;
    text-shadow: 0 1px 3px rgba(0,0,0,0.6);
  `;
  previewLabel.textContent = "Your Office";
  officePreview.appendChild(previewLabel);

  // Insert office preview and character sprites into the placeholder
  const spritesContainer = overlay.querySelector("#auth-sprites") as HTMLDivElement;
  if (spritesContainer) {
    spritesContainer.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:0.8rem;margin-bottom:1.2rem;`;
    spritesContainer.appendChild(officePreview);
    spritesContainer.appendChild(charRow);
  }

  const status = overlay.querySelector("#auth-status") as HTMLDivElement;
  const emailInput = overlay.querySelector("#auth-email") as HTMLInputElement;
  const passwordInput = overlay.querySelector("#auth-password") as HTMLInputElement;
  const submitBtn = overlay.querySelector("#auth-submit") as HTMLButtonElement;
  const toggleEl = overlay.querySelector("#auth-toggle") as HTMLParagraphElement;
  const githubBtn = overlay.querySelector("#auth-github") as HTMLButtonElement;
  const googleBtn = overlay.querySelector("#auth-google") as HTMLButtonElement;

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
