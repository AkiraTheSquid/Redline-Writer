# Supabase — the hosted backend

The desktop build does not use any of this. It talks to a local Postgres in
Docker through the FastAPI backend. Supabase is only the store for the Vercel
deployment at https://redline-writer.vercel.app, and the two never sync.

## How the pieces connect

- `frontend/src/lib/supabase.js` builds a client **only** when both
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present. On the desktop
  build they are absent, the client is `null`, and `App.jsx` turns auth off.
  Do not add a `frontend/.env` with these keys — it would switch the desktop
  app into hosted mode.
- `api/*.js` (Vercel serverless) reads `SUPABASE_URL` and
  `SUPABASE_SERVICE_KEY`. The service key bypasses RLS; all row filtering by
  user happens in the API, which resolves the caller from the JWT in
  `api/_auth.js` before touching the table.
- So four production env vars must all point at the same project:
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. The two `VITE_*` ones are compiled into the
  frontend bundle at build time — changing them without a rebuild does
  nothing.

## Files here

- `migrations/` — the historical migration sequence.
- `bootstrap.sql` — those migrations squashed into one idempotent script,
  plus row-level security. Use this on a **new** project; use `migrations/`
  only if you are tracking history.
- `config.toml` — the auth settings the app expects. It is a record, not
  something applied automatically: on a project created through the dashboard
  you set Site URL, redirect URLs, and "confirm email = off" by hand.

## Moving to a different Supabase project

`scripts/redline_supabase_cutover.sh <project-ref>` does the mechanical part:
it refuses to run against a dead or unmigrated project, swaps the four
production env vars, rebuilds, and then verifies the new ref actually reached
the browser bundle and that the API can reach Supabase.

The half-applied case is the one it works hardest to avoid — two variables on
the new project and two on the old is a live site with broken auth. It
snapshots the current values before touching anything, writes with `--force`
so a failed write leaves the old value standing instead of deleting it, and
rolls every changed variable back if any step fails. Vercel marks production
variables sensitive, so the snapshot sometimes cannot be read back; in that
case the script says so and asks before continuing.

Full sequence:

1. Create the project. Note the ref, the anon key, and the service_role key
   (Project Settings > API).
2. Paste `bootstrap.sql` into the SQL Editor and run it. The trailing SELECT
   should report 14 columns, `rls_enabled = true`, 4 policies.
3. Authentication > URL Configuration: Site URL
   `https://redline-writer.vercel.app`, Redirect URLs
   `https://redline-writer.vercel.app/**`.
4. Authentication > Sign In / Providers > Email: turn **Confirm email off**,
   matching `enable_confirmations = false` in `config.toml`. Leaving it on
   means every new signup silently waits on an email that is never sent.
5. Run the cutover script.
6. Sign up on the live site and take one session end to end.

## The trap that caused the last outage

A free Supabase account allows **two active projects, and the limit is per
account, not per organisation** — a second empty org buys you nothing. When a
project is paused its DNS record disappears, so `fetch` inside `_auth.js` and
`_db.js` throws before it can produce a status code and every authenticated
route returns `500 FUNCTION_INVOCATION_FAILED`.

Worth knowing while debugging that state: an unauthenticated request to
`/sessions` still returns a clean **401**, because `getUser` bails on a missing
`Authorization` header before making any network call. That 401 is not
evidence the backend is healthy. Send a junk bearer token instead — a 401 then
means Supabase was genuinely reached and rejected the token, and a 500 means
it was not.

## Recent Changes

- **2026-08-19** — Added `bootstrap.sql` (squashed schema + RLS) and
  `scripts/redline_supabase_cutover.sh` after the production project
  `hagumnebmfymjmjnsnqn` (`redline-writer-v2`) was paused by the free-tier
  two-project cap and could not be restored. RLS is new: it was never enabled
  on the old project, where the shipped anon key could read the whole
  `sessions` table over PostgREST.
