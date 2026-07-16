# Running the Swarms Marketplace + Agent Heights Locally

This guide covers how to run both apps simultaneously, sharing the same local Supabase database.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Local Supabase                     │
│                  (Docker, :54321)                     │
│                                                      │
│  ┌─────────────────┐    ┌────────────────────────┐  │
│  │  Marketplace     │    │  Agent Heights              │  │
│  │  Tables          │    │  Tables                │  │
│  │  - swarms_cloud_ │    │  - sprite_heights_saves      │  │
│  │    agents        │    │                        │  │
│  │  - swarms_cloud_ │    │                        │  │
│  │    prompts       │    │                        │  │
│  │  - swarms_cloud_ │    │                        │  │
│  │    tools         │    │                        │  │
│  └─────────────────┘    └────────────────────────┘  │
│           │                        │                 │
│           │           auth.users   │                 │
│           │           (shared)     │                 │
└───────────┼────────────────────────┼─────────────────┘
            │                        │
     ┌──────┴──────┐          ┌──────┴──────┐
     │ Marketplace │          │  Agent Heights   │
     │  Next.js    │          │  Node + WS  │
     │  :3000      │          │  :3001      │
     │             │          │  Vite :5173 │
     └─────────────┘          └─────────────┘
```

- **Marketplace** (Next.js, port 3000): Browse/hire agents, chat with Yuki, publish agents
- **Agent Heights** (Node WS server port 3001 + Vite client port 5173/5174): Pixel-art office for managing AI agents
- **Supabase** (Docker, port 54321): Shared database — marketplace tables + sprite_heights_saves + auth.users
- Both apps read/write the same Supabase instance. Auth tokens are interchangeable.

## Prerequisites

1. **Docker** installed and running
2. **Node.js 22+** and **pnpm** installed
3. Both repos cloned:
   - Marketplace: `/home/remsee/swrmsmarkeplaceplaholder`
   - Agent Heights: `/home/remsee/AgentHeights-main`

## Step 1: Start Local Supabase

The marketplace project manages the Supabase Docker stack. Start it from the marketplace directory:

```bash
cd /home/remsee/swrmsmarkeplaceplaholder
supabase start
```

If `supabase` CLI is not installed, the Docker containers may already be running. Check with:

```bash
docker ps | grep supabase
```

You should see containers like `supabase_kong_swarms-marketplace`, `supabase_db_swarms-marketplace`, etc.

**Key endpoints once running:**
- API gateway: `http://127.0.0.1:54321`
- Studio dashboard: `http://localhost:54323`
- Mail inbox (for magic links): `http://localhost:54324`

## Step 2: Apply Agent Heights Migration

The marketplace tables already exist via Supabase migrations. Agent Heights needs one additional table:

```bash
docker exec supabase_db_swarms-marketplace psql -U postgres -d postgres -c "$(cat /home/remsee/AgentHeights-main/supabase/migrations/sprite_heights.sql)"
```

This creates the `sprite_heights_saves` table with RLS policies. You only need to do this once.

## Step 3: Configure Environment Variables

### Agent Heights — `/home/remsee/AgentHeights-main/.env`

```env
# Supabase (shared with marketplace)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Vite client needs these prefixed
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Marketplace URL for Yuki proxy
MARKETPLACE_URL=http://localhost:3000

# WebSocket host for Vite dev client
VITE_WS_HOST=localhost:3001
```

> **Note:** The `NEXT_PUBLIC_SUPABASE_*` vars are there because the server falls back to them. The `VITE_*` vars are required for the Vite client. Both use the same values.

### Marketplace — `/home/remsee/swrmsmarkeplaceplaholder/.env.local`

```env
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

> The demo anon and service role keys are hardcoded in local Supabase and safe for development.

## Step 4: Start the Marketplace

```bash
cd /home/remsee/swrmsmarkeplaceplaholder
pnpm dev
```

- Runs on **http://localhost:3000**
- Provides the Yuki API at `/api/yuki`
- Provides the marketplace UI for browsing/publishing agents

## Step 5: Start Agent Heights

### Option A: Dev mode (hot reload for both server + client)

```bash
cd /home/remsee/AgentHeights-main
pnpm dev
```

This runs both the server (`tsx watch`) and client (`vite`) concurrently.
- Server: **http://localhost:3001**
- Client: **http://localhost:5173** (or 5174 if 5173 is taken)

### Option B: Separate terminals

Terminal 1 — server:
```bash
cd /home/remsee/AgentHeights-main
pnpm start
```

Terminal 2 — client:
```bash
cd /home/remsee/AgentHeights-main
pnpm client
```

## Step 6: Open Agent Heights

Visit **http://localhost:5173** (or 5174).

In dev mode without authentication, the server falls back to a dev session. You'll see:
- Yuki sitting at her desk in the office
- The 🛒 MARKET button in the topbar to browse marketplace agents
- The red emergency stop button on the wall in Yuki's office

## Features That Work When Both Are Running

### Browse Marketplace Agents from HQ
Click **🛒 MARKET** in the Agent Heights topbar. This queries Supabase directly via the HQ server's `/api/marketplace` endpoint.

### Helicopter Delivery
1. Open the MARKET panel
2. Browse agents and click **Hire into HQ**
3. A helicopter descends from the sky, lands on the roof helipad
4. The agent walks out, takes an elevator down into the office
5. The agent is hired via WebSocket and becomes a real NPC in the office

### Chat with Yuki (Marketplace-Aware)
Walk up to Yuki in the office, click her, and type in the chat box. Messages are proxied to the marketplace's `/api/yuki` endpoint with HQ context (office roster, task board, boss name). Yuki has full marketplace knowledge plus awareness of your HQ state.

### Publish HQ Agents to Marketplace
Select an agent in HQ, click **📤 PUBLISH**, fill in the form. The agent is inserted into the `swarms_cloud_agents` table in Supabase and becomes visible in the marketplace.

### Emergency Stop
Press E near the red button in Yuki's office. All agents stop working and line up in an organized formation by the entrance.

## Troubleshooting

### "Failed to load" in the MARKET panel
The Vite dev server needs to proxy `/api/*` to the HQ server. Check `vite.config.ts` has the proxy config:
```ts
server: {
  proxy: {
    "/api": "http://localhost:3001",
  },
},
```

### WebSocket won't connect
The client needs `VITE_WS_HOST` in `.env` pointing to the HQ server port. Without it, the client tries to connect WS to the Vite port which doesn't forward WS.

### "Supabase not configured" in HQ server logs
The server isn't loading `.env`. Make sure `--env-file=.env` is in the start script (it is by default now). Verify with:
```bash
pnpm start
# Should say: "[agent-heights] Supabase auth enabled"
```

### Port conflicts
- 3000: Marketplace (Next.js)
- 3001: Agent Heights server (Node WS)
- 5173/5174: Agent Heights client (Vite)
- 54321: Supabase API gateway
- 54323: Supabase Studio dashboard
- 54324: Inbucket mail inbox

Kill a stuck process with:
```bash
fuser -k <PORT>/tcp
```

### Magic links not arriving
In local dev, magic links are captured by Inbucket. Check **http://localhost:54324** for the email inbox.

### Marketplace agents not appearing in HQ
Verify Supabase has data:
```bash
curl -s "http://127.0.0.1:54321/rest/v1/swarms_cloud_agents?select=id,name&limit=3" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

### sprite_heights_saves table missing
Re-run the migration:
```bash
docker exec supabase_db_swarms-marketplace psql -U postgres -d postgres -c "$(cat /home/remsee/AgentHeights-main/supabase/migrations/sprite_heights.sql)"
```
