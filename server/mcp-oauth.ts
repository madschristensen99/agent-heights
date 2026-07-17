import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setUserMcpKey } from "./apikeys.js";
import { KNOWN_OAUTH_CONFIGS } from "./oauth-config.js";

/** Shape of the token blob stored in user_mcp_keys. */
export interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  client_id?: string;
  client_secret?: string;
  token_endpoint?: string;
}

/** Parse a stored MCP key — might be a plain token (old format) or JSON blob (new format). */
export function parseStoredToken(raw: string): StoredToken {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.access_token) return parsed as StoredToken;
  } catch { /* not JSON — old format, plain access token */ }
  return { access_token: raw };
}

/**
 * Refresh an expired OAuth token using the stored refresh token.
 * Returns the new access token, or null if refresh failed.
 */
export async function refreshMcpToken(
  userId: string,
  serverUrl: string,
  stored: StoredToken,
): Promise<string | null> {
  if (!stored.refresh_token || !stored.token_endpoint || !stored.client_id) {
    return null;
  }

  console.log(`[mcp-oauth] Refreshing token for ${serverUrl}`);
  try {
    const refreshParams: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: stored.refresh_token,
      client_id: stored.client_id,
    };
    if (stored.client_secret) {
      refreshParams.client_secret = stored.client_secret;
    }

    const res = await fetch(stored.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(refreshParams),
    });

    if (!res.ok) {
      console.error(`[mcp-oauth] Token refresh failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    const newBlob = JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? stored.refresh_token,
      expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      client_id: stored.client_id,
      client_secret: stored.client_secret,
      token_endpoint: stored.token_endpoint,
    });
    await setUserMcpKey(userId, serverUrl, newBlob);
    console.log(`[mcp-oauth] Token refreshed for ${serverUrl}`);
    return data.access_token;
  } catch (err) {
    console.error(`[mcp-oauth] Token refresh error:`, err);
    return null;
  }
}

/**
 * MCP OAuth 2.0 flow with PKCE (S256).
 *
 * Flow:
 * 1. Client gets 401 from MCP server with WWW-Authenticate: Bearer resource_metadata="..."
 * 2. Fetch protected resource metadata → get authorization_servers
 * 3. Fetch authorization server metadata → get authorization_endpoint, token_endpoint, registration_endpoint
 * 4. Dynamic client registration → get client_id
 * 5. Generate PKCE code_verifier + code_challenge
 * 6. Build authorization URL with redirect_uri pointing to our /oauth/callback
 * 7. User authenticates in browser → provider redirects to /oauth/callback?code=...&state=...
 * 8. Exchange code + code_verifier for access_token at token_endpoint
 * 9. Store token encrypted in user_mcp_keys table
 */

interface PendingOAuth {
  userId: string;
  serverUrl: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier: string;
  tokenEndpoint: string;
  redirectUri: string;
  createdAt: number;
}

/** In-memory store of pending OAuth flows, keyed by state. */
const pendingFlows = new Map<string, PendingOAuth>();

/** Max age for pending flows (10 minutes). */
const MAX_AGE_MS = 10 * 60 * 1000;

/** Cleanup expired flows. */
function cleanupExpired(): void {
  const now = Date.now();
  for (const [state, flow] of pendingFlows) {
    if (now - flow.createdAt > MAX_AGE_MS) {
      pendingFlows.delete(state);
    }
  }
}

/** Generate PKCE code_verifier and code_challenge (S256). */
function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

interface AuthServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

interface ProtectedResourceMetadata {
  authorization_servers: string[];
  resource: string;
  scopes_supported?: string[];
}

/** Extract resource_metadata URL from WWW-Authenticate header. */
export function parseResourceMetadataUrl(wwwAuth: string): string | null {
  // Format: Bearer resource_metadata="https://..."
  const match = wwwAuth.match(/resource_metadata="([^"]+)"/);
  return match ? match[1] : null;
}

/** Fetch and parse JSON from a URL. */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Derive the authorization server metadata URL from the MCP server URL. */
function deriveAuthServerMetadataUrl(mcpServerUrl: string): string {
  // Per MCP spec: /.well-known/oauth-authorization-server relative to the server URL
  const url = new URL(mcpServerUrl);
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.origin}/.well-known/oauth-authorization-server${path}`;
}

/** Cached OAuth metadata + client registration per server URL (avoids 429s). */
interface CachedRegistration {
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  authorizationEndpoint: string;
  scopes: string[];
  cachedAt: number;
}
const registrationCache = new Map<string, CachedRegistration>();
const REGISTRATION_CACHE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Start an OAuth flow for an MCP server.
 * Returns the authorization URL the user should open in their browser.
 */
export async function startOAuthFlow(
  serverUrl: string,
  userId: string,
  baseUrl: string,
): Promise<{ authUrl: string; redirectMode: "auto" | "manual" }> {
  cleanupExpired();

  // 1. Check known configs first (no network calls needed)
  const known = KNOWN_OAUTH_CONFIGS[serverUrl];
  const cached = registrationCache.get(serverUrl);
  let clientId: string;
  let clientSecret: string | undefined;
  let tokenEndpoint: string;
  let authorizationEndpoint: string;
  let scopes: string[];

  if (known) {
    clientId = known.clientId;
    tokenEndpoint = known.tokenEndpoint;
    authorizationEndpoint = known.authorizationEndpoint;
    scopes = known.scopes;
    console.log(`[mcp-oauth] Using known OAuth config for ${serverUrl}`);
  } else if (cached && Date.now() - cached.cachedAt < REGISTRATION_CACHE_MS) {
    clientId = cached.clientId;
    clientSecret = cached.clientSecret;
    tokenEndpoint = cached.tokenEndpoint;
    authorizationEndpoint = cached.authorizationEndpoint;
    scopes = cached.scopes;
    console.log(`[mcp-oauth] Using cached registration for ${serverUrl}`);
  } else {
    // Unknown server — fetch metadata + register dynamically
    const origin = new URL(serverUrl).origin;
    const path = new URL(serverUrl).pathname === '/' ? '' : new URL(serverUrl).pathname;
    let authServerUrl: string;

    try {
      // Try with path suffix first (per RFC 9728), then without as fallback
      let protectedMetadata: ProtectedResourceMetadata;
      try {
        protectedMetadata = await fetchJson<ProtectedResourceMetadata>(`${origin}/.well-known/oauth-protected-resource${path}`);
      } catch {
        protectedMetadata = await fetchJson<ProtectedResourceMetadata>(`${origin}/.well-known/oauth-protected-resource`);
      }
      if (!protectedMetadata.authorization_servers || protectedMetadata.authorization_servers.length === 0) {
        throw new Error("No authorization_servers in protected resource metadata");
      }
      authServerUrl = protectedMetadata.authorization_servers[0];
    } catch {
      authServerUrl = serverUrl;
    }

    let metadata: AuthServerMetadata;
    try {
      // Try with path suffix first, then without (some servers don't include the path)
      const metadataUrlWith = deriveAuthServerMetadataUrl(authServerUrl);
      try {
        metadata = await fetchJson<AuthServerMetadata>(metadataUrlWith);
      } catch {
        const metadataUrlWithout = `${new URL(authServerUrl).origin}/.well-known/oauth-authorization-server`;
        metadata = await fetchJson<AuthServerMetadata>(metadataUrlWithout);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
        throw new Error(`Could not reach the MCP server at ${serverUrl} — it may be offline or not yet available.`);
      }
      throw new Error(`Failed to fetch OAuth metadata: ${msg}`);
    }

    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      throw new Error("Missing authorization_endpoint or token_endpoint in metadata");
    }

    const redirectUri = baseUrl ? `${baseUrl}/oauth/callback` : `http://localhost:1/callback`;
    console.log(`[mcp-oauth] redirectUri=${redirectUri}, serverUrl=${serverUrl}`);

    if (!metadata.registration_endpoint) {
      throw new Error("This MCP server does not support automatic OAuth registration. It may require a pre-registered API key or a specific OAuth app — try using the API Key option instead.");
    }

    // Determine the best auth method supported by the server
    const supportedMethods = metadata.token_endpoint_auth_methods_supported || ["none"];
    const authMethod = supportedMethods.includes("none") ? "none" : supportedMethods[0] || "none";

    const registration = await fetch(`${metadata.registration_endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Agent Heights",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: authMethod,
      }),
    });
    if (!registration.ok) {
      const errText = await registration.text().catch(() => "");
      throw new Error(`Dynamic client registration failed: ${registration.status} ${errText}`);
    }
    const regData = await registration.json() as { client_id: string; client_secret?: string };
    clientId = regData.client_id;
    clientSecret = regData.client_secret;
    tokenEndpoint = metadata.token_endpoint;
    authorizationEndpoint = metadata.authorization_endpoint;
    scopes = metadata.scopes_supported || [];

    registrationCache.set(serverUrl, {
      clientId,
      clientSecret,
      tokenEndpoint,
      authorizationEndpoint,
      scopes,
      cachedAt: Date.now(),
    });
  }

  // 4. Generate PKCE
  const { verifier, challenge } = generatePkce();

  // 5. Build authorization URL
  const state = randomUUID();
  const redirectUri = baseUrl ? `${baseUrl}/oauth/callback` : `http://localhost:1/callback`;

  const authUrl = new URL(authorizationEndpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (scopes.length > 0) {
    authUrl.searchParams.set("scope", scopes.join(" "));
  }

  // 6. Store pending flow
  pendingFlows.set(state, {
    userId,
    serverUrl,
    clientId,
    clientSecret,
    codeVerifier: verifier,
    tokenEndpoint,
    redirectUri,
    createdAt: Date.now(),
  });

  return { authUrl: authUrl.toString(), redirectMode: baseUrl ? "auto" : "manual" };
}

/**
 * Exchange an OAuth code from a pasted callback URL.
 * The user authenticates on the provider's site, gets redirected to localhost (which fails),
 * then copies the URL and pastes it back to us. This is only used when no public URL is available.
 */
export async function exchangeOAuthCode(
  callbackUrl: string,
): Promise<{ success: boolean; error?: string; serverUrl?: string; userId?: string }> {
  cleanupExpired();

  // Parse the callback URL to extract code and state
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(callbackUrl.trim());
  } catch {
    return { success: false, error: "Invalid URL format. Paste the full URL from your browser's address bar." };
  }

  const code = parsedUrl.searchParams.get("code");
  const state = parsedUrl.searchParams.get("state");
  const errorParam = parsedUrl.searchParams.get("error");

  if (errorParam) {
    return { success: false, error: `OAuth error: ${errorParam}` };
  }
  if (!code || !state) {
    return { success: false, error: "No code or state found in URL. Make sure you copied the full URL." };
  }

  // Reuse the existing handleOAuthCallback logic
  return handleOAuthCallback(code, state);
}

/**
 * Handle the OAuth callback.
 * Exchanges the authorization code for an access token and stores it.
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
): Promise<{ success: boolean; error?: string; serverUrl?: string; userId?: string }> {
  cleanupExpired();

  const flow = pendingFlows.get(state);
  if (!flow) {
    console.error("[mcp-oauth] No pending flow for state:", state, "(may have expired or server restarted)");
    return { success: false, error: "Invalid or expired OAuth state. Please try again." };
  }

  pendingFlows.delete(state);
  console.log(`[mcp-oauth] Handling callback for ${flow.serverUrl}, state=${state}`);

  try {
    // Exchange code for token
    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: flow.redirectUri,
      client_id: flow.clientId,
      code_verifier: flow.codeVerifier,
    };
    if (flow.clientSecret) {
      tokenParams.client_secret = flow.clientSecret;
    }

    const tokenRes = await fetch(flow.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("[mcp-oauth] Token exchange failed:", tokenRes.status, errorText);
      return { success: false, error: `Token exchange failed: ${tokenRes.status}`, serverUrl: flow.serverUrl, userId: flow.userId };
    }

    const tokenData = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };

    // Store access token + refresh token + expiry as JSON blob
    const tokenBlob = JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      client_id: flow.clientId,
      client_secret: flow.clientSecret,
      token_endpoint: flow.tokenEndpoint,
    });
    const { error } = await setUserMcpKey(flow.userId, flow.serverUrl, tokenBlob);
    if (error) {
      return { success: false, error: `Failed to store token: ${error}`, serverUrl: flow.serverUrl, userId: flow.userId };
    }

    console.log(`[mcp-oauth] Token exchange success for ${flow.serverUrl}, expires_in=${tokenData.expires_in ?? "unknown"}s`);
  return { success: true, serverUrl: flow.serverUrl, userId: flow.userId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly = msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")
      ? `Could not reach the MCP server — it may be offline or not yet available. (${msg})`
      : msg;
    return { success: false, error: friendly, serverUrl: flow.serverUrl, userId: flow.userId };
  }
}
