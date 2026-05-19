-- Unshafted: free-tier keepalive heartbeat
-- Run against Supabase SQL editor after 002_profile_drive_backup_preference.sql
-- Date: 2026-05-19
--
-- Why this exists: Supabase free-tier projects pause after ~7 days with no
-- activity. A GitHub Actions cron pings this RPC every 12h to register API
-- activity. The function is intentionally a read-only no-op — no table
-- writes, no bloat. Callable by the anon role so the workflow can invoke it
-- with the project's publishable/anon key (no user session).

CREATE OR REPLACE FUNCTION public.heartbeat()
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.now();
$$;

REVOKE ALL ON FUNCTION public.heartbeat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat() TO anon, authenticated;

COMMENT ON FUNCTION public.heartbeat() IS
  'Free-tier keepalive ping invoked by GitHub Actions every 12h. Returns server time. No side effects.';
