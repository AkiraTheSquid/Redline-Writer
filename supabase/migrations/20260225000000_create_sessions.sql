CREATE TABLE IF NOT EXISTS sessions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_min    INTEGER       NOT NULL,
  min_wpm         INTEGER       NOT NULL,
  reminder_interval_min INTEGER NOT NULL DEFAULT 0,
  organizer_text  TEXT          NOT NULL DEFAULT '',
  content         TEXT          NOT NULL DEFAULT '',
  word_count      INTEGER       NOT NULL DEFAULT 0,
  wpm_at_end      FLOAT         NOT NULL DEFAULT 0.0,
  elapsed_sec     INTEGER       NOT NULL DEFAULT 0,
  outcome         VARCHAR(32)   NOT NULL DEFAULT 'active'
);
