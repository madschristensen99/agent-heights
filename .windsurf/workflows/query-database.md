---
description: Query the production Supabase database
---

## How to query the production database

The project is pre-linked to a cloud Supabase instance. Use the Supabase CLI with `--linked`:

```bash
npx supabase db query "SELECT * FROM public.api_usage_records LIMIT 10" --linked
```

### Rules
- Always use `--linked` flag (without it, targets a local instance that isn't running)
- Use `npx supabase db query` (NOT `db execute` — that's not a valid subcommand)
- If you get `Connection terminated due to connection timeout`, wait 30-60s and retry (small connection pool)
- Don't use `curl` to the PostgREST API — the anon key is not a JWT and will fail
- Don't use `--db-url` with the service role key as a password — it's not the Postgres password

### Table reference
See `docs/DATABASE.md` for the full table list and common queries.

### Key tables
- `api_usage_records` — token usage and costs per LLM call
- `sprite_heights_agents` — agent roster
- `sprite_heights_player_info` — user profiles
- `swarms_cloud_agents` — marketplace agent listings
