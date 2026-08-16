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

  // Google Workspace MCP servers — all 8 use the same OAuth client (single
  // Google Cloud project). Create a Web application OAuth client with redirect
  // URI https://agentheights.com/oauth/callback, then set env vars:
  //   GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET
  // Docs: https://developers.google.com/workspace/guides/configure-mcp-servers

  "https://gmailmcp.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
  },
  "https://drivemcp.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  },
  "https://docsmcp.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/documents",
    ],
  },
  "https://sheetsmcp.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  },
  "https://slidesmcp.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/presentations.readonly",
      "https://www.googleapis.com/auth/presentations",
    ],
  },
  "https://calendarmcp.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events.freebusy",
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ],
  },
  "https://chatmcp.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/chat.spaces.readonly",
      "https://www.googleapis.com/auth/chat.memberships.readonly",
      "https://www.googleapis.com/auth/chat.messages.readonly",
      "https://www.googleapis.com/auth/chat.messages.create",
      "https://www.googleapis.com/auth/chat.users.readstate.readonly",
    ],
  },
  "https://people.googleapis.com/mcp/v1": {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/directory.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/contacts.readonly",
    ],
  },
};
