# capitol-api (self-hosted)

Self-hosted instance of [capitol-api](https://github.com/crnicholson/capitol-api) — a free, open-source API for US House congressional stock trade data.

## What it does

- Fetches Periodic Transaction Reports (PTRs) from `disclosures-clerk.house.gov`
- Parses PDF filings to extract trade data (ticker, politician, amount, dates)
- Enriches with legislator metadata from `congress-legislators` GitHub
- Serves a REST API at `/api/trades`

## Deploy to Railway

```bash
# From this directory
railway up
```

Or via Railway dashboard: create new service → Dockerfile → point to `capitol-api/Dockerfile`.

## Environment variables

| Var | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `YEARS_START` | `2025` | First year to fetch |
| `YEARS_END` | `2026` | Last year to fetch |
| `CACHE_REFRESH_HOURS` | `6` | Hours between auto-refresh (0 = never) |
| `FETCH_DELAY_MS` | `500` | Delay between PDF downloads |

## API endpoints

- `GET /api/status` — cache state and fetch progress
- `POST /api/refresh` — incremental fetch of new filings
- `GET /api/trades?ticker=AAPL&party=Democrat&person=Pelosi&recent=25` — query trades

## Used by

`server/providers/congress-trades-mcp.ts` — MCP server that proxies tool calls to this API.
The `CAPITOL_API_URL` env var in the agent's MCP config points to this service's Railway URL.
