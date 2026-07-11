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
  "https://agent.robinhood.com/mcp/trading": {
    clientId: "LtLiNmbs9owbYfWgBlC68Z2V-claude",
    tokenEndpoint: "https://api.robinhood.com/oauth2/token/",
    authorizationEndpoint: "https://robinhood.com/oauth",
    scopes: ["internal"],
  },
};
