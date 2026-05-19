# Supabase Free-Tier Heartbeat Setup

**Status:** Code merged · Manual steps pending
**Date:** 2026-05-19
**Project:** `my-chrome-extensions` (ref `ehrbvtwggrpagaaejnux`)

## Why

Supabase free-tier projects auto-pause after ~7 days of no API/DB activity. A
paused project breaks the Unshafted extension's auth + Drive backup flows
until manually resumed. Cheapest fix: a GitHub Actions cron that calls a
no-op RPC on a schedule well inside the pause window.

## What was added

| File | Purpose |
|---|---|
| `supabase/migrations/003_heartbeat_rpc.sql` | Defines `public.heartbeat()` — `SECURITY DEFINER`, `RETURNS timestamptz`, executable by `anon` + `authenticated`. Pure read (`SELECT pg_catalog.now()`). |
| `.github/workflows/supabase-heartbeat.yml` | Cron `0 */12 * * *` + manual `workflow_dispatch`. Picks `sb_publishable_*` or legacy JWT anon key automatically. Fails the run on non-200. |

## Manual steps (you, not Claude)

### 1. Apply the migration in Supabase

- Open Supabase dashboard → project `ehrbvtwggrpagaaejnux` → **SQL Editor**
- Paste the contents of `supabase/migrations/003_heartbeat_rpc.sql`
- Run
- Verify in **Database → Functions** that `public.heartbeat` appears

### 2. Smoke-test the RPC from the CLI

Replace `<KEY>` with your publishable or anon key:

```bash
curl -sS -X POST \
  "https://ehrbvtwggrpagaaejnux.supabase.co/rest/v1/rpc/heartbeat" \
  -H "apikey: <KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: ISO timestamp string, HTTP 200.

### 3. Add GitHub repo secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL` = `https://ehrbvtwggrpagaaejnux.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` *(preferred — new format)*
  - **or** `SUPABASE_ANON_KEY` = `eyJ...` *(legacy JWT — still works)*

### 4. Trigger the workflow once manually

GitHub repo → **Actions → Supabase Heartbeat → Run workflow**. Confirm the
run is green and the log shows `Heartbeat successful` + an HTTP 200.

### 5. Confirm the schedule is live

After ~12h, check the Actions tab for an automatic scheduled run. GitHub
disables scheduled workflows on repos with no activity for 60 days — the
12h cadence on this repo keeps it well clear of that too.

## Status checklist

- [x] Migration file written
- [x] Workflow file written
- [ ] Migration applied in Supabase dashboard
- [ ] cURL smoke test from local machine succeeds
- [ ] GitHub secrets configured
- [ ] Manual `workflow_dispatch` run is green
- [ ] First scheduled run observed

## Notes / decisions

- **Why `public` schema, not `unshafted`?** PostgREST exposes only `public`
  by default. Putting `heartbeat()` in `public` avoids editing the project's
  API exposed-schemas list. The function is trivial enough that schema
  pollution is acceptable.
- **Why `SECURITY DEFINER` with empty `search_path`?** Defensive habit even
  for a no-op: prevents any future search-path-based hijack if the body
  changes. `pg_catalog.now()` is fully qualified.
- **Why read-only, not a write?** Discussed and chosen. A `SELECT now()`
  registers API activity (which is what pauses care about) without growing
  any table.
- **Why 12h cadence?** Reference template default. ~60 runs/month, GitHub
  Actions free tier is 2000 min/mo and each run is <30s — negligible cost.
  Even if 5 consecutive runs miss (GitHub cron is best-effort), the
  remaining cadence still pings within the 7-day pause window.
