# Marketplace Integration

Complete documentation of how Agent HQ integrates with the Swarms Marketplace (`swarms.world`), hosted on Vercel.

---

## Architecture Overview

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│        Agent HQ (Railway)     │         │   Swarms Marketplace (Vercel) │
│                                │         │                                │
│  ┌──────────┐  ┌───────────┐  │         │  ┌──────────┐  ┌───────────┐  │
│  │  Client   │  │  Server   │  │         │  │ Next.js   │  │  API      │  │
│  │  (Vite)   │──│  (Node)   │  │         │  │ App       │  │  Routes   │  │
│  └──────────┘  └─────┬─────┘  │         │  └──────────┘  └─────┬─────┘  │
│                       │        │         │                      │        │
└───────────────────────┼────────┘         └──────────────────────┼────────┘
                        │                                           │
                        │     ┌─────────────────────────┐          │
                        ├────▶│    Supabase (Shared)     │◀─────────┤
                        │     │  swarms_cloud_agents     │          │
                        │     │  swarms_cloud_prompts    │          │
                        │     │  swarms_cloud_tools      │          │
                        │     │  swarms_cloud_api_keys   │          │
                        │     │  agent_hq_saves          │          │
                        │     └─────────────────────────┘          │
                        │                                           │
                        │  Yuki chat proxy (HTTP)                   │
                        └──────────────────────────────────────────▶│
                                                                    │
                                          ┌─────────────┐           │
                                          │ Anthropic   │◀──────────┤
                                          │ (Claude)    │           │
                                          └─────────────┘           │
```

### Key Insight

Agent HQ and the Swarms Marketplace share a **single Supabase project**. Most marketplace data operations go directly to Supabase, bypassing swarms.world entirely. Only the Yuki chat proxy hits the Vercel deployment.

---

## Integration Points

### 1. Marketplace Browsing (Supabase Direct)

**Agent HQ server** queries Supabase directly — does NOT call swarms.world.

- **Client**: `client/src/ui/marketplace.ts` — fetches `/api/marketplace?type=agent|prompt|tool`
- **Server**: `server/marketplace.ts` — queries Supabase tables using the service role key
- **Tables**: `swarms_cloud_agents`, `swarms_cloud_prompts`, `swarms_cloud_tools`

```
Client (browser)
  → GET /api/marketplace?type=agent&search=foo
    → server/marketplace.ts
      → supabaseAdmin.from("swarms_cloud_agents").select("*").eq("status", "approved")
        → Supabase (direct)
```

**Not affected by swarms.world DDoS.** If browsing fails on Railway, check:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars are set
- Supabase project allows connections from Railway's egress IPs
- The `/api/marketplace` endpoint returns 503 if Supabase is not configured

### 2. Agent Publishing (Supabase Direct)

**Agent HQ server** writes to Supabase directly — does NOT call swarms.world.

- **Server**: `server/publish.ts` — inserts into `swarms_cloud_agents` with `status: "pending"`
- **Auth**: Supabase JWT Bearer token (verified via `verifyToken()`)
- **Flow**: User creates an agent in HQ → publishes → row inserted as `pending` → marketplace admin approves → appears in browsing

```
Client (browser)
  → POST /api/publish-agent (with Bearer JWT)
    → server/publish.ts
      → verifyToken(token) via Supabase auth
      → supabaseAdmin.from("swarms_cloud_agents").insert({...status: "pending"})
        → Supabase (direct)
```

**Not affected by swarms.world DDoS.**

### 3. Hiring Marketplace Agents

When a user clicks "Hire into HQ" on a marketplace agent, the agent's config (model, systemPrompt, provider) is already included in the Supabase query result (the `agent` column). Agent HQ uses this to instantiate the agent via the Cline SDK.

- **Free agents**: `agent` config JSON is always returned by Supabase query
- **Paid agents**: The marketplace's public API (`/api/get-agents/[id]`) gates the `agent` field behind purchase verification. However, Agent HQ uses the Supabase **service role key**, which bypasses RLS and returns all columns including `agent`

```
Client: user clicks "Hire into HQ"
  → onHireAgent(agent) callback
    → manager.hire(agent.name, agent.provider, agent.model, agent.systemPrompt, ...)
      → Cline SDK spawns agent with config from marketplace
```

### 4. Yuki Chat Proxy (Calls swarms.world)

**This is the only path that hits the Vercel deployment.**

- **Agent HQ server**: `server/yuki.ts` — proxies POST to `${MARKETPLACE_URL}/api/yuki`
- **Marketplace server**: `app/api/yuki/route.ts` — calls Anthropic Claude Haiku directly
- **No auth** on the Yuki endpoint
- **Rate limited**: 300 requests / 60 seconds per IP (via Upstash + Vercel KV middleware)

```
Client (browser)
  → POST /api/yuki { message, history, conversationId }
    → server/yuki.ts
      → fetch(`${MARKETPLACE_URL}/api/yuki`, { ...entityContext })
        → swarms.world (Vercel)
          → app/api/yuki/route.ts
            → Anthropic Claude Haiku (streaming SSE)
              ← SSE stream piped back through
```

**Affected by swarms.world DDoS / rate limiting.**

### 5. Swarms LLM API (Agent LLM Calls)

All agent LLM calls go through the Swarms API at `api.swarms.world/v1`.

- **Server**: `server/providers/cline.ts` — Cline SDK with `baseUrl: SWARMS_BASE_URL`
- **Auth**: `x-api-key` header with `SWARMS_API_KEY`
- **Note**: `api.swarms.world` is a separate subdomain. The Next.js config rewrites `api.swarms.world` requests to `/api/guard/api`, but the LLM API may be served differently. This path appears to work even during DDoS.

---

## Environment Variables

### Agent HQ (Railway)

| Variable | Required | Description |
|---|---|---|
| `SWARMS_API_KEY` | Yes | Powers all agent LLM calls via Cline SDK |
| `SUPABASE_URL` | Yes* | Supabase project URL (shared with marketplace) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes* | Supabase service role key (bypasses RLS) |
| `VITE_SUPABASE_URL` | Yes* | Same Supabase URL, exposed to client |
| `VITE_SUPABASE_ANON_KEY` | Yes* | Supabase anon key for client-side auth |
| `MARKETPLACE_URL` | No | URL of swarms.world (for Yuki proxy). Defaults to `http://localhost:3000` |

*Required for marketplace browsing, publishing, and user auth. Without these, the server runs in dev mode with no marketplace.

### Swarms Marketplace (Vercel)

| Variable | Used By | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yuki route | Powers Yuki chat (Claude Haiku) |
| `MASTER_SWARMS_API_KEY` | Various | Server-side Swarms API key |
| `KV_REST_API_URL` | Rate limiter | Vercel KV for Upstash rate limiting |
| `KV_REST_API_TOKEN` | Rate limiter | Vercel KV token |
| `NEXT_PUBLIC_SWARMS_API_BASE_URL` | Agent completions | Base URL for Swarms API (defaults to `https://api.swarms.world`) |

---

## Supabase Schema (Shared)

Both Agent HQ and the Swarms Marketplace read/write to the same Supabase project.

### Marketplace Tables

| Table | Description |
|---|---|
| `swarms_cloud_agents` | Marketplace agents (name, description, agent config JSON, price, status) |
| `swarms_cloud_prompts` | Marketplace prompts |
| `swarms_cloud_tools` | Marketplace tools |
| `swarms_cloud_api_keys` | API keys for programmatic access (validated by `HybridAuthGuard`) |
| `marketplace_transactions` | Purchase records (used for paid agent access control) |

### Agent HQ Tables

| Table | Description |
|---|---|
| `agent_hq_saves` | Per-user game state (JSONB blob). RLS enabled — users can only read/write their own save |

### Agent Config JSON

The `agent` column in `swarms_cloud_agents` stores a JSON string with the agent's configuration:

```json
{
  "model": "claude-sonnet-4-20250514",
  "systemPrompt": "You are a helpful coding agent...",
  "provider": "cline",
  "source": "agent-hq",
  "agentId": "abc-123"
}
```

When a user hires a marketplace agent, Agent HQ parses this JSON to configure the Cline SDK instance.

---

## Marketplace Auth (HybridAuthGuard)

The Swarms Marketplace supports two authentication methods for its API routes:

### API Key Auth
- Header: `Authorization: Bearer <key>`
- Validated against `swarms_cloud_api_keys` table in Supabase
- Returns associated `user_id`

### Supabase Session Auth
- Browser cookie-based
- Uses `@supabase/ssr` server client
- Returns authenticated user

### Optional vs Required
- `optionalAuthenticate()` — works without auth, but may restrict access to paid content
- `authenticate()` — requires valid auth, returns 401 if missing

Most public endpoints (get-agents, get-prompts, get-tools) use optional auth. Agent HQ does not use these endpoints — it queries Supabase directly with the service role key.

---

## Rate Limiting (Marketplace Middleware)

The marketplace middleware (`shared/utils/stack-middlewares/middlewares.ts`) applies:

- **300 requests per 60 seconds per IP** (Upstash sliding window)
- IP extracted from `x-forwarded-for` header
- **Fails open** — if Upstash KV is unreachable, requests are allowed
- **Exempted paths**: webhooks, Solana RPC, explorer data, server actions

Only affects requests to swarms.world's Vercel deployment (primarily the Yuki proxy).

---

## Known Issues & Mitigations

### DDoS on swarms.world

When swarms.world is under DDoS attack, Vercel may block or challenge traffic at the infrastructure level. This affects:

| Path | Affected? | Reason |
|---|---|---|
| Marketplace browsing | No | Queries Supabase directly |
| Agent publishing | No | Writes to Supabase directly |
| Hiring marketplace agents | No | Agent config from Supabase directly |
| Yuki chat | **Yes** | Proxies to swarms.world Vercel deployment |
| Agent LLM calls | Possibly | Goes to `api.swarms.world` (may be on same Vercel) |

### Railway Egress IP

Railway does **not** provide static egress IPs. The outbound IP can change on redeploy or restart. This means:
- IP-based allowlisting on Vercel is fragile
- A secret header bypass in middleware is more reliable than IP allowlisting

### Recommended Mitigations

1. **For Yuki chat**: Move Yuki into Agent HQ directly (use Anthropic API key in Agent HQ, eliminate the proxy to swarms.world). The marketplace's Yuki route is a thin wrapper around the Anthropic API — the system prompt and HQ context injection already live in Agent HQ's `server/yuki.ts`.

2. **For programmatic marketplace API access**: If Agent HQ needs to call swarms.world API routes in the future, add a secret header bypass in the marketplace's `withRateLimit` middleware:
   ```ts
   if (request.headers.get('x-hq-secret') === process.env.HQ_PROXY_SECRET) {
     return next(request, event);
   }
   ```
   Then Agent HQ sends `x-hq-secret` on outbound requests. This bypasses rate limiting but not Vercel's infrastructure-level DDoS protection.

3. **For Vercel DDoS protection bypass**: Vercel does not offer IP allowlisting at the infrastructure level. Options:
   - Vercel Firewall custom rules (Pro/Enterprise) — can skip challenges for requests with specific headers
   - Egress proxy with static IP (VPS running Nginx) — route swarms.world traffic through it, allowlist that IP in Vercel Firewall
   - Tailscale exit node — route through a fixed-IP VPS

---

## Next Steps

### Step 1: Fix marketplace browsing on Railway (Immediate)

Marketplace queries go to Supabase directly — they should work regardless of swarms.world's status.

1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Railway env vars
2. Check the error returned by `/api/marketplace?type=agent` on the Railway deployment:
   - **503** = Supabase env vars missing → set them
   - **500** = Supabase connection error → check if Supabase project has network restrictions
   - **200 with empty results** = tables exist but no approved agents (data issue, not infra)
3. If Supabase has IP restrictions, add Railway's egress IPs or disable restrictions (Supabase Free tier doesn't have IP restrictions by default)

### Step 2: Make the Yuki proxy reliable (Short-term)

Yuki stays on the marketplace — one Yuki, unified across platforms. Agent HQ already injects HQ context (office roster, task board, boss name) via the `entityContext` field in the proxy request, so the marketplace Yuki already knows about the user's HQ state. The problem is just that the proxy breaks when swarms.world is under DDoS.

**Approach: Secret header bypass on the marketplace + Vercel Firewall rule**

1. **On the marketplace** (`shared/utils/stack-middlewares/middlewares.ts`):
   - Add `HQ_PROXY_SECRET` env var to Vercel
   - In `withRateLimit`, skip rate limiting when `x-hq-secret` header matches:
     ```ts
     if (request.headers.get('x-hq-secret') === process.env.HQ_PROXY_SECRET) {
       return next(request, event);
     }
     ```
2. **On the marketplace** (Vercel Firewall / WAF):
   - Create a custom firewall rule that skips DDoS challenge/block for requests to `/api/yuki` with the `x-hq-secret` header
   - This is IP-independent — works regardless of Railway's changing egress IP
   - Requires Vercel Pro or Enterprise plan for custom firewall rules
3. **On Agent HQ** (`server/yuki.ts`):
   - Set `HQ_PROXY_SECRET` env var on Railway (same value as marketplace)
   - Add `x-hq-secret` header to the outbound `fetch()` to `${MARKETPLACE_URL}/api/yuki`
   - Add a retry with backoff in case of transient failures
4. **Fallback**: If Vercel Firewall isn't available (Free plan), use an egress proxy with a static IP (see Step 3) so Railway's requests come from a known, allowlisted IP

**Why not duplicate Yuki into Agent HQ?**
Keeping Yuki on the marketplace ensures she stays unified across platforms. Any changes to her system prompt, personality, or capabilities only need to be made in one place. The HQ context injection already makes her aware of the user's office state, so she can be both a marketplace support agent and an HQ office manager through the same instance.

The same `x-hq-secret` header mechanism also covers any future programmatic API calls from Agent HQ to swarms.world (e.g., paid agent verification, marketplace search with different filters). Just add the header to any outbound `fetch()` to swarms.world.

### Step 3: Vercel DDoS protection bypass (If swarms.world stays under attack)

If swarms.world remains DDoS'd and Agent HQ needs reliable programmatic access:

1. **Option A — Vercel Firewall custom rule** (requires Vercel Pro/Enterprise):
   - Create a WAF rule that skips challenge/block for requests with `x-hq-secret` header
   - IP-independent, works regardless of Railway's changing egress IP

2. **Option B — Egress proxy with static IP**:
   - Spin up a small VPS (e.g., Hetzner $4/mo, DigitalOcean $5/mo)
   - Run Nginx as a reverse proxy: `proxy_pass https://swarms.world`
   - Set `HTTPS_PROXY` env var on Railway pointing to the VPS, or modify `fetch()` calls to route through it
   - Allowlist the VPS IP in Vercel Firewall
   - Downside: adds latency and a dependency

3. **Option C — Tailscale exit node**:
   - Install Tailscale on the Railway container and a fixed-IP VPS
   - Route swarms.world traffic through the Tailscale tunnel to the VPS
   - The VPS's static IP is what Vercel sees
   - Downside: more complex setup, Tailscale daemon in Docker container

### Step 4: Verify paid agent hiring flow (Future)

Currently Agent HQ reads the `agent` config JSON from Supabase using the service role key, which bypasses RLS and returns the config even for paid agents. This works but bypasses the marketplace's purchase verification.

1. Decide whether Agent HQ should respect the paywall (require purchase before hiring paid agents)
2. If yes: call the marketplace API `/api/get-agents/[id]` with an API key (via `HybridAuthGuard` Bearer auth) and check `access_info.has_access` before allowing hire
3. If no: current behavior is fine — service role key reads everything

---

## File Reference

### Agent HQ

| File | Role |
|---|---|
| `server/marketplace.ts` | HTTP handler for `/api/marketplace/*` — queries Supabase directly |
| `server/publish.ts` | HTTP handler for `/api/publish-agent` — writes to Supabase directly |
| `server/yuki.ts` | HTTP handler for `/api/yuki` — proxies to swarms.world |
| `server/supabase.ts` | Supabase client + `verifyToken()` for JWT auth |
| `server/providers/cline.ts` | Cline SDK agent runner — uses `api.swarms.world/v1` for LLM calls |
| `client/src/ui/marketplace.ts` | Marketplace browser UI panel |
| `shared/marketplace.ts` | Shared TypeScript types for marketplace items |

### Swarms Marketplace

| File | Role |
|---|---|
| `app/api/yuki/route.ts` | Yuki chat endpoint — calls Anthropic Claude Haiku |
| `app/api/swarms/agent-completions/route.ts` | Proxies agent completions to `api.swarms.world/v1/agent/completions` |
| `app/api/swarms-chat/route.ts` | Streaming chat with marketplace agents via Swarms API |
| `pages/api/get-agents/index.ts` | List approved agents (paginated, filtered) |
| `pages/api/get-agents/[id].ts` | Get single agent by ID (gates paid content) |
| `pages/api/get-prompts/index.ts` | List approved prompts |
| `pages/api/get-tools/index.ts` | List tools |
| `pages/api/query-agents.ts` | Query agents by ID, username, or slug |
| `shared/utils/api/hybrid-auth-guard.ts` | Dual auth: API key or Supabase session |
| `shared/utils/stack-middlewares/middlewares.ts` | Rate limiting, security checks, session refresh |
| `middleware.ts` | Next.js middleware entry point |
| `next.config.js` | Rewrites `api.swarms.world` host to `/api/guard/api` |
