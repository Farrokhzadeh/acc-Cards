BEGIN;

CREATE TABLE scheduled_jobs (
  job_key text PRIMARY KEY,
  job_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  interval_seconds integer NOT NULL CHECK (interval_seconds >= 5),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 25),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error_redacted text,
  safe_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scheduled_jobs_due_idx
  ON scheduled_jobs(next_run_at, job_key)
  WHERE enabled = true;
CREATE INDEX scheduled_jobs_lease_idx
  ON scheduled_jobs(lease_until)
  WHERE lease_until IS NOT NULL;

INSERT INTO scheduled_jobs(job_key, job_type, interval_seconds, max_attempts, safe_config) VALUES
  ('kripicard-card-sync', 'kripicard_card_sync', 300, 5, '{"batchSize":25}'::jsonb),
  ('kripicard-transaction-sync', 'kripicard_transaction_sync', 120, 5, '{}'::jsonb),
  ('outlook-sync', 'outlook_sync', 120, 5, '{}'::jsonb),
  ('gmail-sync', 'gmail_sync', 120, 5, '{}'::jsonb),
  ('email-classify', 'email_classify', 30, 5, '{"limit":500,"expireLimit":1000}'::jsonb),
  ('telegram-outbox', 'telegram_outbox', 10, 8, '{"limit":200}'::jsonb),
  ('maintenance-expiry', 'maintenance_expiry', 300, 5, '{}'::jsonb)
ON CONFLICT (job_key) DO NOTHING;

ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS scheduled_job_key text REFERENCES scheduled_jobs(job_key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS job_runs_scheduled_job_started_idx
  ON job_runs(scheduled_job_key, started_at DESC)
  WHERE scheduled_job_key IS NOT NULL;

COMMIT;
