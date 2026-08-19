-- ============================================================
-- Redline Writer — full schema bootstrap (idempotent)
--
-- Run this ONCE against a brand-new Supabase project, in the
-- SQL Editor, to bring it to the same shape the app expects.
-- It is the squashed equivalent of everything in
-- supabase/migrations/, plus row-level security.
--
-- Safe to re-run against a project this script itself created. It is NOT a
-- repair tool: CREATE TABLE IF NOT EXISTS will leave an existing, differently
-- shaped `sessions` table alone rather than correcting it, so on anything but
-- a fresh project, check the verification query at the bottom.
--
-- Every reference is schema-qualified. Supabase ships its own auth.sessions,
-- and an unexpected search_path would otherwise send these statements at the
-- wrong relation.
-- ============================================================

-- --- Table -------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  duration_min          INTEGER NOT NULL,
  min_wpm               INTEGER NOT NULL,
  reminder_interval_min INTEGER NOT NULL DEFAULT 0,
  organizer_text        TEXT NOT NULL DEFAULT '',
  content               TEXT NOT NULL DEFAULT '',
  word_count            INTEGER NOT NULL DEFAULT 0,
  wpm_at_end            FLOAT NOT NULL DEFAULT 0.0,
  elapsed_sec           INTEGER NOT NULL DEFAULT 0,
  outcome               VARCHAR(32) NOT NULL DEFAULT 'active'
);

-- Later migrations, folded in.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id UUID
  REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);

-- --- Row-level security ------------------------------------
--
-- The serverless API in api/ talks to PostgREST with the
-- SERVICE ROLE key, which bypasses RLS entirely, so these
-- policies do not change how the app behaves.
--
-- What they DO change: without RLS, Supabase's default grants
-- let anyone holding the (publicly shipped) anon key read the
-- whole sessions table over /rest/v1/sessions. The frontend
-- only ever uses that key for auth, never for data, so locking
-- the table down costs nothing and closes that hole.

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own" ON public.sessions;
CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "sessions_insert_own" ON public.sessions;
CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "sessions_update_own" ON public.sessions;
CREATE POLICY "sessions_update_own" ON public.sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "sessions_delete_own" ON public.sessions;
CREATE POLICY "sessions_delete_own" ON public.sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- anon gets no policy at all -> no rows, no writes.

-- --- Verify ------------------------------------------------

-- The schema filters matter here for the same reason: an unqualified
-- table_name = 'sessions' would count auth.sessions too.

SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sessions')  AS column_count,
  (SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.sessions'::regclass)                    AS rls_enabled,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'sessions')     AS policy_count;

-- Expected: 14 | t | 4
