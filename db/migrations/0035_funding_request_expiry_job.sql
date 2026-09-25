BEGIN;

INSERT INTO scheduled_jobs(job_key, job_type, interval_seconds, max_attempts, safe_config)
VALUES ('funding-request-expiry', 'funding_request_expiry', 30, 8, '{}'::jsonb)
ON CONFLICT (job_key) DO UPDATE
SET job_type = EXCLUDED.job_type,
    interval_seconds = EXCLUDED.interval_seconds,
    max_attempts = EXCLUDED.max_attempts,
    safe_config = EXCLUDED.safe_config,
    updated_at = now();

COMMIT;
