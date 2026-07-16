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
  tokenEndpoint: string;
  authorizationEndpoint: string;
  scopes: string[];
}

export const KNOWN_OAUTH_CONFIGS: Record<string, KnownOAuthConfig> = {
  // Robinhood was previously hardcoded here with a pre-registered clientId
  // that used localhost:1/callback as the redirect URI. Now that we use
  // dynamic redirect URIs (baseUrl/oauth/callback), all servers use DCR.
  // Robinhood supports Dynamic Client Registration so this works automatically.
};
