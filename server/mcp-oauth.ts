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

/**
 * Start an OAuth flow for an MCP server.
 * Returns the authorization URL the user should open in their browser.
 */
export async function startOAuthFlow(
  serverUrl: string,
  userId: string,
  baseUrl: string,
): Promise<{ authUrl: string }> {
  cleanupExpired();

  // 1. Fetch protected resource metadata (from WWW-Authenticate or derive it)
  const protectedMetadataUrl = `${new URL(serverUrl).origin}/.well-known/oauth-protected-resource${new URL(serverUrl).pathname}`;
  let authServerUrl: string;

  try {
    const protectedMetadata = await fetchJson<ProtectedResourceMetadata>(protectedMetadataUrl);
    if (!protectedMetadata.authorization_servers || protectedMetadata.authorization_servers.length === 0) {
      throw new Error("No authorization_servers in protected resource metadata");
    }
    authServerUrl = protectedMetadata.authorization_servers[0];
  } catch {
    // Fallback: derive from MCP server URL
    authServerUrl = serverUrl;
  }

  // 2. Fetch authorization server metadata
  const metadataUrl = deriveAuthServerMetadataUrl(authServerUrl);
  const metadata = await fetchJson<AuthServerMetadata>(metadataUrl);

  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error("Missing authorization_endpoint or token_endpoint in metadata");
  }

  // 3. Dynamic client registration
  const redirectUri = `${baseUrl}/oauth/callback`;
  console.log(`[mcp-oauth] redirectUri=${redirectUri}, serverUrl=${serverUrl}`);
  let clientId: string;

  if (metadata.registration_endpoint) {
    const registration = await fetch(`${metadata.registration_endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "AgentHQ",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      }),
    });
    if (!registration.ok) {
      throw new Error(`Dynamic client registration failed: ${registration.status}`);
    }
    const regData = await registration.json() as { client_id: string };
    clientId = regData.client_id;
  } else {
    throw new Error("No registration_endpoint available — cannot register OAuth client");
  }

  // 4. Generate PKCE
  const { verifier, challenge } = generatePkce();

  // 5. Build authorization URL
  const state = randomUUID();
  const scopes = metadata.scopes_supported || [];

  const authUrl = new URL(metadata.authorization_endpoint);
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
    tokenEndpoint: metadata.token_endpoint,
    redirectUri,
    createdAt: Date.now(),
  });

  return { authUrl: authUrl.toString() };
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
