import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setUserMcpKey } from "./apikeys.js";

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
 * 7. User authenticates in browser → Robinhood redirects to /oauth/callback?code=...&state=...
 * 8. Exchange code + code_verifier for access_token at token_endpoint
 * 9. Store token encrypted in user_mcp_keys table
 */

interface PendingOAuth {
  userId: string;
  serverUrl: string;
  clientId: string;
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
  const path = url.pathname;
  return `${url.origin}/.well-known/oauth-authorization-server${path}`;
}

/** Cached OAuth metadata + client registration per server URL (avoids 429s). */
interface CachedRegistration {
  clientId: string;
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
  _baseUrl: string,
): Promise<{ authUrl: string }> {
  cleanupExpired();

  // Check cache first to avoid rate limiting (429)
  const cached = registrationCache.get(serverUrl);
  let clientId: string;
  let tokenEndpoint: string;
  let authorizationEndpoint: string;
  let scopes: string[];

  if (cached && Date.now() - cached.cachedAt < REGISTRATION_CACHE_MS) {
    clientId = cached.clientId;
    tokenEndpoint = cached.tokenEndpoint;
    authorizationEndpoint = cached.authorizationEndpoint;
    scopes = cached.scopes;
    console.log(`[mcp-oauth] Using cached registration for ${serverUrl}`);
  } else {
    // 1. Fetch protected resource metadata
    const protectedMetadataUrl = `${new URL(serverUrl).origin}/.well-known/oauth-protected-resource${new URL(serverUrl).pathname}`;
    let authServerUrl: string;

    try {
      const protectedMetadata = await fetchJson<ProtectedResourceMetadata>(protectedMetadataUrl);
      if (!protectedMetadata.authorization_servers || protectedMetadata.authorization_servers.length === 0) {
        throw new Error("No authorization_servers in protected resource metadata");
      }
      authServerUrl = protectedMetadata.authorization_servers[0];
    } catch {
      authServerUrl = serverUrl;
    }

    // 2. Fetch authorization server metadata
    const metadataUrl = deriveAuthServerMetadataUrl(authServerUrl);
    const metadata = await fetchJson<AuthServerMetadata>(metadataUrl);

    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      throw new Error("Missing authorization_endpoint or token_endpoint in metadata");
    }

    // 3. Dynamic client registration (localhost redirect — Robinhood requires it)
    const redirectUri = `http://localhost:1/callback`;
    console.log(`[mcp-oauth] redirectUri=${redirectUri}, serverUrl=${serverUrl}`);

    if (!metadata.registration_endpoint) {
      throw new Error("No registration_endpoint available — cannot register OAuth client");
    }

    const registration = await fetch(`${metadata.registration_endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude Code",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      }),
    });
    if (!registration.ok) {
      const errText = await registration.text().catch(() => "");
      throw new Error(`Dynamic client registration failed: ${registration.status} ${errText}`);
    }
    const regData = await registration.json() as { client_id: string };
    clientId = regData.client_id;
    tokenEndpoint = metadata.token_endpoint;
    authorizationEndpoint = metadata.authorization_endpoint;
    scopes = metadata.scopes_supported || [];

    // Cache it
    registrationCache.set(serverUrl, {
      clientId,
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
  const redirectUri = `http://localhost:1/callback`;

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
    codeVerifier: verifier,
    tokenEndpoint,
    redirectUri,
    createdAt: Date.now(),
  });

  return { authUrl: authUrl.toString() };
}

/**
 * Exchange an OAuth code from a pasted callback URL.
 * The user authenticates on Robinhood, gets redirected to localhost (which fails),
 * then copies the URL and pastes it back to us.
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
    return { success: false, error: `Robinhood error: ${errorParam}` };
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
    return { success: false, error: "Invalid or expired OAuth state. Please try again." };
  }

  pendingFlows.delete(state);

  try {
    // Exchange code for token
    const tokenRes = await fetch(flow.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: flow.redirectUri,
        client_id: flow.clientId,
        code_verifier: flow.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("[mcp-oauth] Token exchange failed:", tokenRes.status, errorText);
      return { success: false, error: `Token exchange failed: ${tokenRes.status}`, serverUrl: flow.serverUrl, userId: flow.userId };
    }

    const tokenData = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };

    // Store the access token encrypted in user_mcp_keys
    const { error } = await setUserMcpKey(flow.userId, flow.serverUrl, tokenData.access_token);
    if (error) {
      return { success: false, error: `Failed to store token: ${error}`, serverUrl: flow.serverUrl, userId: flow.userId };
    }

    return { success: true, serverUrl: flow.serverUrl, userId: flow.userId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg, serverUrl: flow.serverUrl, userId: flow.userId };
  }
}
