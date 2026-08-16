/**
 * Pre-configured OAuth settings for known MCP servers.
 * This avoids hitting their registration endpoint on every attempt,
 * which can cause 429 rate limiting.
 *
 * To add a new server, find its OAuth metadata endpoints and add an entry here.
 * You can discover these by running:
 *   curl https://<server>/.well-known/oauth-protected-resource<path>
 *   curl https://<auth-server>/.well-known/oauth-authorization-server<path>
 *   curl -X POST https://<registration-endpoint> -H 'Content-Type: application/json' \
 *     -d '{"client_name":"Claude Code","redirect_uris":["http://localhost:1/callback"],"grant_types":["authorization_code","refresh_token"],"token_endpoint_auth_method":"none"}'
 */

export interface KnownOAuthConfig {
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  authorizationEndpoint: string;
  scopes: string[];
  /** Token endpoint auth method: "client_secret_basic" (default) or "none" (PKCE-only). */
  tokenEndpointAuthMethod?: "client_secret_basic" | "none";
  /** When true, always use http://localhost:1/callback as redirect URI (manual paste-back mode).
   *  Use for providers that reject production redirect URIs in DCR. */
  forceLocalRedirect?: boolean;
}

export const KNOWN_OAUTH_CONFIGS: Record<string, KnownOAuthConfig> = {
  // Strava MCP — DCR endpoint is broken (returns 400 "invalid_client_metadata" for all requests).
  // Register an app at https://www.strava.com/settings/api
  // Set callback domain to your app domain, then fill in clientId and clientSecret below.
  "https://mcp.strava.com/mcp": {
    clientId: "",
    clientSecret: "",
    authorizationEndpoint: "https://www.strava.com/oauth/mcp/authorize",
    tokenEndpoint: "https://www.strava.com/oauth/mcp/token",
    scopes: ["read", "activity:read", "profile:read_all"],
  },

  // Booking.com MCP — CloudFront WAF blocks all server-side requests (403).
  // Register at https://developers.booking.com
  // Set callback URL to https://your-app-domain/oauth/callback, then fill in clientId below.
  "https://demandapi-mcp.booking.com/v1/mcp/8132308": {
    clientId: "",
    authorizationEndpoint: "https://demandapi-mcp.booking.com/oauth/authorize",
    tokenEndpoint: "https://demandapi-mcp.booking.com/oauth/token",
    scopes: [],
  },

  // Expedia MCP — Akamai WAF blocks all server-side requests (403).
  // Register at https://developers.expedia.com
  // Set callback URL to https://your-app-domain/oauth/callback, then fill in clientId below.
  "https://www.expedia.com/mcp": {
    clientId: "",
    authorizationEndpoint: "https://www.expedia.com/oauth/authorize",
    tokenEndpoint: "https://www.expedia.com/oauth/token",
    scopes: [],
  },

  // Zoom MCP — requires manual client registration (no DCR support).
  // Register a General app at https://marketplace.zoom.us/ → Develop → Build App
  // Set OAuth redirect URL to https://your-app-domain/oauth/callback
  // Add scopes per https://developers.zoom.us/docs/mcp/zoom/
  // Then fill in clientId and clientSecret below.
  "https://mcp.zoom.us/mcp/zoom/streamable": {
    clientId: "",
    clientSecret: "",
    authorizationEndpoint: "https://zoom.us/oauth/authorize",
    tokenEndpoint: "https://zoom.us/oauth/token",
    scopes: [],
    tokenEndpointAuthMethod: "client_secret_basic",
  },

  // Hostinger MCP — DCR rejects production redirect URIs (invalid_redirect_uri).
  // Pre-registered with http://localhost:1/callback — uses manual paste-back mode.
  // Auth server: https://auth.hostinger.com (discovered via /.well-known/oauth-protected-resource)
  "https://mcp.hostinger.com": {
    clientId: "01a00ba7-daa8-7276-a5c4-09a4089db03c",
    authorizationEndpoint: "https://auth.hostinger.com/api/external/v1/oauth-server/authorize",
    tokenEndpoint: "https://auth.hostinger.com/api/external/v1/oauth-server/token",
    scopes: [],
    tokenEndpointAuthMethod: "none",
    forceLocalRedirect: true,
  },
};
