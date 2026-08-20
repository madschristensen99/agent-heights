# Database Guide

The production database is a cloud Supabase (Postgres) instance. This guide covers how to query it, the table layout, and common pitfalls.

## Querying the Database

### Prerequisites

The project must be linked to the Supabase project:

```bash
npx supabase link --project-ref elwyzhhrrqcmymssnblq
```

This is already done — the link is stored in `supabase/.temp/linked-project.json`.

### Method 1: Supabase CLI (recommended)

```bash
# Simple query
npx supabase db query "SELECT COUNT(*) FROM public.api_usage_records" --linked

# Aggregate query
npx supabase db query "SELECT model, COUNT(*), ROUND(SUM(total_cost)::numeric, 2) FROM public.api_usage_records GROUP BY model ORDER BY 2 DESC" --linked

# Update / backfill
npx supabase db query "UPDATE public.api_usage_records SET model = 'deepseek-v4-flash' WHERE model = 'claude-sonnet-4-20250514'" --linked
```

**Important:** Always use `--linked`. Without it, the CLI targets a local Supabase instance (which may not be running).

**Connection pool limits:** The Supabase free tier has a small connection pool. If you get `Connection terminated due to connection timeout`, wait 30–60 seconds and retry. Avoid running many queries in rapid succession.

### Method 2: Supabase Dashboard

Browse to the SQL Editor at:
```
https://supabase.com/dashboard/project/elwyzhhrrqcmymssnblq/sql/new
```

This is better for long-running queries or exploratory analysis.

### Method 3: From server code

Server-side code uses the `supabaseAdmin` client (service role key, bypasses RLS):

```typescript
import { supabaseAdmin } from "./supabase.js";

const { data, error } = await supabaseAdmin
  .from("api_usage_records")
  .select("model, total_cost, input_tokens, output_tokens")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });
```

### What NOT to do

- **Don't use `curl` to the PostgREST API** — the anon key is not a JWT and will fail with "Expected 3 parts in JWT". The service role key works but is awkward for ad-hoc queries.
- **Don't use `npx supabase db execute`** — it's not a valid subcommand. Use `db query`.
- **Don't use `--db-url` with the service role key as a password** — the service role key is not the Postgres password. Use `--linked` instead.

## Table Reference

All tables are in the `public` schema. Tables prefixed with `sprite_heights_` are from the original schema; newer tables use `heights_cloud_` or plain names.

### Core game state

| Table | Purpose |
| --- | --- |
| `sprite_heights_rooms` | Offices/rooms (each user gets one Private HQ) |
| `sprite_heights_room_players` | Room membership (for multiplayer) |
| `sprite_heights_agents` | One row per agent (id, name, model, status, system_prompt) |
| `sprite_heights_agent_logs` | Append-only agent log entries |
| `sprite_heights_task_cards` | Kanban task cards assigned to agents |
| `sprite_heights_world_state` | Per-room world state (seed, theme, fired agents JSONB) |
| `sprite_heights_player_info` | Per-user profile (name, workspace, appearance) |
| `sprite_heights_game_settings` | Per-user settings (max iterations, auto-approve, etc.) |
| `sprite_heights_schedules` | Recurring cron-like agent schedules |
| `sprite_heights_saved_outfits` | Saved character appearance presets |

### Usage & billing

| Table | Purpose |
| --- | --- |
| `api_usage_records` | Token usage per LLM call (model, tokens, cost, agent, task) |
| `user_api_keys` | Per-user encrypted API keys |
| `user_mcp_keys` | Per-user MCP server credentials |

### Marketplace

| Table | Purpose |
| --- | --- |
| `swarms_cloud_agents` | Marketplace agent listings |
| `swarms_cloud_prompts` | Marketplace prompt templates |
| `swarms_cloud_tools` | Marketplace tool definitions |
| `heights_cloud_premium_services` | Premium Circle x402 service configs |

### Social & orgs

| Table | Purpose |
| --- | --- |
| `heights_cloud_friends` | Friend relationships (pending/accepted/blocked) |
| `agent_heights_organizations` | Organizations |
| `agent_heights_org_members` | Organization membership |
| `agent_heights_mail_events` | Inbound/outbound platform messages |

### Other

| Table | Purpose |
| --- | --- |
| `heights_cloud_achievements` | Per-user achievement unlocks + stats |
| `heights_cloud_aspiration_profiles` | Per-user aspiration tracking (6 tracks) |
| `heights_cloud_asset_upgrades` | $19.99 AI asset upgrade purchases |
| `heights_cloud_experiment_logs` | A/B experiment logs |
| `heights_cloud_office_decorations` | Office decoration items |
| `heights_cloud_office_social` | Office likes, visits, sticky notes |
| `heights_cloud_office_progression` | Office level/XP |
| `heights_cloud_agent_growth` | Agent performance trends |
| `heights_cloud_user_profiles` | User profile extensions (onboarding text, etc.) |
| `heights_cloud_user_activity` | User activity tracking |
| `heights_cloud_leaderboards` | Leaderboard entries |
| `heights_cloud_schedule_chains` | Schedule dependency chains |
| `heights_cloud_mcp_servers` | Self-built MCP servers (office forge) |
| `heights_cloud_user_deletion_requests` | Pending account deletion requests |

## Common Queries

```sql
-- Total spend by model
SELECT model, COUNT(*) as calls, ROUND(SUM(total_cost)::numeric, 2) as cost
FROM public.api_usage_records
GROUP BY model ORDER BY cost DESC;

-- Daily spend
SELECT created_at::date as day, COUNT(*) as calls, ROUND(SUM(total_cost)::numeric, 2) as cost
FROM public.api_usage_records
GROUP BY day ORDER BY day DESC LIMIT 30;

-- Monthly spend for a user
SELECT ROUND(SUM(total_cost)::numeric, 2) as monthly_spend
FROM public.api_usage_records
WHERE user_id = '<uuid>'
  AND created_at >= date_trunc('month', NOW());

-- Agent count per user
SELECT owner_id, COUNT(*) as agent_count
FROM public.sprite_heights_agents
GROUP BY owner_id ORDER BY agent_count DESC;
```
